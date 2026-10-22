import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  collection,
  getDocsFromServer,
  getFirestore,
  query,
  serverTimestamp,
  writeBatch,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIGqZLYcDg3CR5VamDwBhtOOfl2Y0NYeI",
  authDomain: "timotech-films.firebaseapp.com",
  databaseURL: "https://timotech-films-default-rtdb.firebaseio.com",
  projectId: "timotech-films",
  storageBucket: "timotech-films.firebasestorage.app",
  messagingSenderId: "563809562931",
  appId: "1:563809562931:web:750ff7e819f2d57e9dce46"
};

const app = getApps()[0] || initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const startDateKey = "2025-11-01";
const runButton = document.getElementById("runDryRun");
const downloadButton = document.getElementById("downloadReport");
const applyButton = document.getElementById("applyBackfill");
const applySection = document.getElementById("applySection");
const historyCompleteCheckbox = document.getElementById("confirmHistoryComplete");
const statusElement = document.getElementById("status");
const resultsElement = document.getElementById("results");
let currentUser = null;
let latestReport = null;

onAuthStateChanged(auth, user => {
  currentUser = user;
  runButton.disabled = !user;
  applyButton.disabled = true;
  applySection.hidden = !user;
  statusElement.textContent = user
    ? `Signed in as ${user.email || user.uid}. Dry run only; no writes will be made.`
    : "Sign in to the business app in this browser and open this page again.";
});

runButton.addEventListener("click", async () => {
  if (!currentUser) return;
  runButton.disabled = true;
  downloadButton.disabled = true;
  statusElement.textContent = "Reading inventory, sales, stock additions, and movement history…";
  resultsElement.replaceChildren();

  try {
    latestReport = await createDryRunReport(currentUser.uid);
    renderReport(latestReport);
    downloadButton.disabled = false;
    applyButton.disabled = !latestReport.items.some(isReadyToApply) ||
      !historyCompleteCheckbox.checked;
    statusElement.textContent =
      `Dry run complete. ${latestReport.summary.ready} item(s) are ready; ` +
      `${latestReport.summary.flagged} item(s) need review. No data was changed.`;
  } catch (error) {
    console.error("Stock history dry run failed:", error);
    statusElement.textContent = `Dry run failed: ${error.message}`;
  } finally {
    runButton.disabled = !currentUser;
  }
});

historyCompleteCheckbox.addEventListener("change", () => {
  applyButton.disabled = !currentUser || !latestReport ||
    !historyCompleteCheckbox.checked ||
    !latestReport.items.some(isReadyToApply);
});

applyButton.addEventListener("click", async () => {
  if (!currentUser || !latestReport || !historyCompleteCheckbox.checked) return;
  const reviewedSignature = getReviewSignature(latestReport);
  const readyCount = latestReport.items.filter(isReadyToApply).length;
  if (!readyCount || !window.confirm(
    `Apply the November 1, 2025 stock-history baseline to ${readyCount} ready non-Petrol item(s)? ` +
    "Items with validation issues will be skipped. This does not change sales or stock additions."
  )) return;

  applyButton.disabled = true;
  runButton.disabled = true;
  statusElement.textContent = "Rechecking current server data before applying…";
  try {
    const freshReport = await createDryRunReport(currentUser.uid);
    if (getReviewSignature(freshReport) !== reviewedSignature) {
      throw new Error("Inventory or transaction data changed since the reviewed report. Run the dry run again before applying.");
    }
    const readyItems = freshReport.items.filter(isReadyToApply);
    if (!readyItems.length) {
      throw new Error("No items currently pass the validation checks.");
    }
    for (let offset = 0; offset < readyItems.length; offset += 450) {
      const batch = writeBatch(db);
      readyItems.slice(offset, offset + 450).forEach(item => {
        batch.update(doc(db, "items", item.itemId), {
          stockLedgerBaselineUnits: item.inferredOpeningQuantity,
          stockLedgerUnit: item.stockUnit,
          stockLedgerBaselineAt: localDate(startDateKey).toISOString(),
          stockLedgerStartDate: startDateKey,
          stockLedgerValid: true,
          stockLedgerHistoryMode: "source-events-v1",
          stockLedgerBackfilledAt: serverTimestamp()
        });
      });
      await batch.commit();
    }
    latestReport = freshReport;
    latestReport.mode = "applied historical baseline";
    latestReport.appliedItems = readyItems.map(item => item.itemId);
    renderReport(latestReport);
    statusElement.textContent =
      `Applied historical baselines to ${readyItems.length} item(s). ` +
      `${freshReport.summary.flagged} item(s) were skipped for review.`;
  } catch (error) {
    console.error("Stock history backfill failed:", error);
    statusElement.textContent = `Backfill failed: ${error.message}`;
  } finally {
    runButton.disabled = !currentUser;
    applyButton.disabled = true;
  }
});

downloadButton.addEventListener("click", () => {
  if (!latestReport) return;
  const blob = new Blob([JSON.stringify(latestReport, null, 2)], {
    type: "application/json"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `stock-history-dry-run-${startDateKey}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

async function createDryRunReport(uid) {
  const [itemDocs, saleDocs, additionDocs, movementDocs] = await Promise.all([
    getUserCollection("items", uid),
    getUserCollection("sales", uid),
    getUserCollection("stockAdditions", uid),
    getUserCollection("stockMovements", uid)
  ]);
  const items = itemDocs.map(doc => ({ id: doc.id, ...doc.data() }));
  const sales = saleDocs.map(doc => ({ id: doc.id, ...doc.data() }));
  const additions = additionDocs.map(doc => ({ id: doc.id, ...doc.data() }));
  const movements = movementDocs.map(doc => ({ id: doc.id, ...doc.data() }));
  const reports = items
    .filter(item => !isPetrol(item.name))
    .map(item => assessItem(item, sales, additions, movements));
  const petrolCount = items.filter(item => isPetrol(item.name)).length;
  const eventDates = reports
    .flatMap(item => [item.firstHistoricalEventDate, item.lastHistoricalEventDate])
    .filter(Boolean)
    .sort();

  return {
    generatedAt: new Date().toISOString(),
    startDate: startDateKey,
    mode: "read-only dry run",
    petrolExcluded: petrolCount,
    summary: {
      totalNonPetrol: reports.length,
      ready: reports.filter(isReadyToApply).length,
      flagged: reports.filter(item => !isReadyToApply(item)).length
    },
    historicalActivityRange: {
      firstRecordedEvent: eventDates[0] || null,
      lastRecordedEvent: eventDates[eventDates.length - 1] || null
    },
    caveat: "A successful validation cannot prove completeness of unrecorded historical adjustments.",
    items: reports
  };
}

async function getUserCollection(name, uid) {
  const result = await getDocsFromServer(query(
    collection(db, name),
    where("uid", "==", uid)
  ));
  return result.docs;
}

function assessItem(item, sales, additions, movements) {
  const issues = [];
  const current = getItemStock(item);
  const itemUnit = getItemStockUnit(item);
  const baselineAt = toDate(item.stockLedgerBaselineAt);
  const baselineUnits = Number(item.stockLedgerBaselineUnits);
  const createdAt = toDate(item.createdAt);
  const itemMovements = movements.filter(movement => movement.itemId === item.id);
  const itemSales = sales.filter(sale => sale.itemId === item.id);
  const itemAdditions = additions.filter(addition => addition.itemId === item.id);
  const normalizedItemName = normalizeName(item.name);
  const ambiguousSales = sales.filter(sale =>
    sale.itemId !== item.id && normalizeName(sale.itemName) === normalizedItemName
  );
  const ambiguousAdditions = additions.filter(addition =>
    addition.itemId !== item.id && normalizeName(addition.itemName) === normalizedItemName
  );

  if (current === null) issues.push("Current inventory quantity or unit could not be parsed.");
  if (!String(item.name || "").trim()) issues.push("Item name is missing.");
  if (ambiguousSales.length) {
    issues.push(`${ambiguousSales.length} sale record(s) with the same item name have a different or missing item ID.`);
  }
  if (ambiguousAdditions.length) {
    issues.push(`${ambiguousAdditions.length} stock addition record(s) with the same item name have a different or missing item ID.`);
  }
  if (isCrateItem(item.name) && item.piecesPerCrate !== null &&
      item.piecesPerCrate !== undefined &&
      (!Number.isInteger(Number(item.piecesPerCrate)) ||
       Number(item.piecesPerCrate) <= 0)) {
    issues.push("Pieces per crate is invalid.");
  }
  const events = [];
  for (const sale of itemSales) {
    const event = saleEvent(sale, item);
    if (event.error) issues.push(`Sale ${sale.id}: ${event.error}`);
    else events.push(event);
  }
  for (const addition of itemAdditions) {
    const event = additionEvent(addition, item);
    if (event.error) issues.push(`Stock addition ${addition.id}: ${event.error}`);
    else events.push(event);
  }
  for (const movement of itemMovements) {
    if (movement.type !== "manual-adjustment") continue;
    const occurredAt = toDate(movement.occurredAt);
    const delta = Number(movement.quantityDelta);
    if (!occurredAt || !Number.isFinite(delta) ||
        normalizeUnit(movement.quantityUnit) !== itemUnit ||
        (isCrateItem(item.name) && !Number.isInteger(delta))) {
      issues.push(`Manual adjustment ${movement.id} is missing a valid date, quantity, or unit.`);
      continue;
    }
    events.push({
      id: movement.id,
      date: occurredAt,
      delta,
      source: "manual-adjustment"
    });
  }

  const requestedStart = localDate(startDateKey);
  const relevantEvents = events.filter(event => event.date >= requestedStart);
  const unsupportedEvents = itemMovements.filter(movement => {
    const occurredAt = toDate(movement.occurredAt);
    return occurredAt && occurredAt >= requestedStart &&
      !["sale", "sale-edit", "stock-addition", "manual-adjustment"].includes(movement.type);
  });
  if (unsupportedEvents.length) {
    issues.push(
      `${unsupportedEvents.length} stock movement(s) have unsupported types and cannot be included.`
    );
  }
  const latestDate = new Date();
  if (relevantEvents.some(event => event.date > latestDate)) {
    issues.push("One or more recorded movements are dated in the future.");
  }

  let inferredOpening = null;
  if (current !== null) {
    const netSinceStart = relevantEvents.reduce((total, event) => total + event.delta, 0);
    inferredOpening = current - netSinceStart;
    if (inferredOpening < -0.000001) {
      issues.push(`Reverse calculation implies negative opening stock (${round(inferredOpening)} ${itemUnit}).`);
    }
  }

  const minDailyClosing = findMinimumDailyClosing(inferredOpening, relevantEvents);
  if (minDailyClosing !== null && minDailyClosing < -0.000001) {
    issues.push(`Reconstructed stock falls below zero (${round(minDailyClosing)} ${itemUnit}).`);
  }
  return {
    itemId: item.id,
    itemName: String(item.name || "(unnamed item)"),
    stockUnit: itemUnit || "(no unit)",
    itemCreatedAt: createdAt ? createdAt.toISOString() : null,
    ledgerBaselineAt: baselineAt ? baselineAt.toISOString() : null,
    ledgerBaselineUnits: Number.isFinite(baselineUnits) ? baselineUnits : null,
    currentQuantity: current,
    trackedFrom: startDateKey,
    inferredOpeningQuantity: inferredOpening === null ? null : round(inferredOpening),
    openingBasis: relevantEvents.length
      ? "Reverse-calculated from current quantity and dated movements"
      : "Current quantity used as assumed opening; no dated events",
    firstHistoricalEventDate: relevantEvents.length
      ? formatLocalDate(new Date(Math.min(...relevantEvents.map(event => event.date.getTime()))))
      : null,
    lastHistoricalEventDate: relevantEvents.length
      ? formatLocalDate(new Date(Math.max(...relevantEvents.map(event => event.date.getTime()))))
      : null,
    salesRecords: itemSales.length,
    stockAdditionRecords: itemAdditions.length,
    manualAdjustmentRecords: itemMovements.filter(
      movement => movement.type === "manual-adjustment"
    ).length,
    historicalEventsUsed: relevantEvents.length,
    historicalEventFingerprint: JSON.stringify(relevantEvents
      .map(event => [
        event.date.toISOString(),
        event.id || "",
        round(event.delta),
        event.source || ""
      ])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))),
    minimumDailyClosing: minDailyClosing === null ? null : round(minDailyClosing),
    status: issues.length ? "Review required"
      : relevantEvents.length ? "Ready - reverse-calculated"
        : "Ready - assumed opening",
    issues
  };
}

function saleEvent(sale, item) {
  const date = toDate(sale.createdAt);
  const quantity = Number(sale.quantity);
  if (!date || !Number.isFinite(quantity) || quantity <= 0) {
    return { error: "missing date or invalid quantity" };
  }
  if (isCrateItem(item.name)) {
    const unit = normalizeUnit(sale.quantityUnit);
    const piecesPerCrate = getPiecesPerCrate(item);
    if (unit === "HALF CRATES") {
      return crateSaleDelta(sale, date, quantity * piecesPerCrate / 2);
    }
    if (unit === "CRATES" || unit === "CRATE" || !unit) {
      return crateSaleDelta(sale, date, quantity * piecesPerCrate);
    }
    if (unit === "PIECES" || unit === "PIECE") {
      return crateSaleDelta(sale, date, quantity);
    }
    return { error: `unrecognized crate sale unit "${sale.quantityUnit}"` };
  }
  const saleUnit = normalizeUnit(sale.quantityUnit || itemUnitFromItem(item));
  if (saleUnit !== itemUnitFromItem(item)) {
    return { error: `sale unit "${sale.quantityUnit}" differs from current stock unit` };
  }
  return { id: sale.id, date, delta: -quantity, source: "sale" };
}

function crateSaleDelta(sale, date, units) {
  return Number.isInteger(units)
    ? { id: sale.id, date, delta: -units, source: "sale" }
    : { error: "quantity does not resolve to a whole number of pieces" };
}

function additionEvent(addition, item) {
  const date = toDate(addition.stockDate || addition.createdAt);
  if (!date) return { error: "missing or invalid stock date" };

  if (isCrateItem(item.name)) {
    const piecesAdded = Number(addition.piecesAdded);
    if (addition.piecesAdded !== null && addition.piecesAdded !== undefined &&
        Number.isInteger(piecesAdded) && piecesAdded >= 0) {
      return { id: addition.id, date, delta: piecesAdded, source: "stock-addition" };
    }
    const quantity = Number(addition.quantity);
    const unit = normalizeUnit(addition.quantityUnit);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: "invalid quantity" };
    }
    if (unit === "CRATES") {
      const pieces = quantity * getPiecesPerCrate(item);
      if (!Number.isInteger(pieces)) return { error: "quantity does not resolve to whole pieces" };
      return {
        id: addition.id,
        date,
        delta: pieces,
        source: "stock-addition"
      };
    }
    if (unit === "PIECES") {
      return { id: addition.id, date, delta: quantity, source: "stock-addition" };
    }
    return { error: `unrecognized crate addition unit "${addition.quantityUnit}"` };
  }

  const quantity = Number(addition.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "invalid quantity" };
  const additionUnit = normalizeUnit(addition.quantityUnit);
  if (additionUnit !== itemUnitFromItem(item)) {
    return { error: `addition unit "${addition.quantityUnit}" differs from current stock unit` };
  }
  return { id: addition.id, date, delta: quantity, source: "stock-addition" };
}

function findMinimumDailyClosing(opening, events) {
  if (!Number.isFinite(opening)) return null;
  const byDate = new Map();
  events.forEach(event => {
    const key = formatLocalDate(event.date);
    byDate.set(key, (byDate.get(key) || 0) + event.delta);
  });
  let balance = opening;
  let minimum = opening;
  [...byDate.keys()].sort().forEach(key => {
    balance += byDate.get(key);
    minimum = Math.min(minimum, balance);
  });
  return minimum;
}

function getItemStock(item) {
  const quantity = parseQuantity(item.quantity);
  if (!quantity) return null;
  if (!isCrateItem(item.name)) return quantity.amount;
  if (!Number.isInteger(quantity.amount)) return null;
  const piecesPerCrate = getPiecesPerCrate(item);
  const loosePieces = Number(item.loosePieces ?? 0);
  if (!Number.isInteger(loosePieces) || loosePieces < 0 ||
      loosePieces >= piecesPerCrate) return null;
  return quantity.amount * piecesPerCrate + loosePieces;
}

function getItemStockUnit(item) {
  if (isCrateItem(item.name)) return "PIECES";
  return normalizeUnit(parseQuantity(item.quantity)?.unit || "");
}

function itemUnitFromItem(item) {
  return isCrateItem(item.name)
    ? "PIECES"
    : normalizeUnit(parseQuantity(item.quantity)?.unit || "");
}

function parseQuantity(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? { amount: value, unit: "" } : null;
  }
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([^,]*)$/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? { amount, unit: match[2].trim() } : null;
}

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return localDate(value);
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function localDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function normalizeUnit(unit) {
  return String(unit || "").trim().toUpperCase();
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function isCrateItem(name) {
  return /\bcrates?\b/i.test(name || "");
}

function isPetrol(name) {
  return /\bpetrol\b/i.test(name || "");
}

function getPiecesPerCrate(item) {
  const piecesPerCrate = Number(item.piecesPerCrate);
  return Number.isInteger(piecesPerCrate) && piecesPerCrate > 0
    ? piecesPerCrate
    : 24;
}

function isReadyToApply(item) {
  return item.status.startsWith("Ready -");
}

function getReviewSignature(report) {
  return JSON.stringify(report.items.map(item => [
    item.itemId,
    item.status,
    item.stockUnit,
    item.currentQuantity,
    item.inferredOpeningQuantity,
    item.firstHistoricalEventDate,
    item.lastHistoricalEventDate,
    item.historicalEventsUsed,
    item.historicalEventFingerprint
  ]));
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}

function renderReport(report) {
  const summary = document.createElement("p");
  summary.textContent =
    `${report.summary.ready} item(s) ready to apply; ` +
    `${report.summary.flagged} require review; ${report.petrolExcluded} Petrol item(s) excluded.`;
  resultsElement.append(summary);

  const activityRange = document.createElement("p");
  activityRange.textContent = report.historicalActivityRange.lastRecordedEvent
    ? `Recorded activity spans ${report.historicalActivityRange.firstRecordedEvent} ` +
      `through ${report.historicalActivityRange.lastRecordedEvent}. This does not confirm ` +
      `that entry is complete through today.`
    : "No dated activity was found for the selected period.";
  resultsElement.append(activityRange);

  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";
  const table = document.createElement("table");
  const headers = [
    "Item",
    "Status",
    "Tracked from",
    "First recorded event",
    "Last recorded event",
    "Current quantity",
    "Inferred opening",
    "Opening basis",
    "Events",
    "Issues"
  ];
  const head = table.createTHead().insertRow();
  headers.forEach(label => {
    const cell = document.createElement("th");
    cell.textContent = label;
    head.append(cell);
  });
  const body = table.createTBody();
  report.items.forEach(item => {
    const row = body.insertRow();
    const values = [
      item.itemName,
      item.status,
      item.trackedFrom,
      item.firstHistoricalEventDate || "No recorded events",
      item.lastHistoricalEventDate || "No recorded events",
      displayQuantity(item.currentQuantity, item.stockUnit),
      displayQuantity(item.inferredOpeningQuantity, item.stockUnit),
      item.openingBasis,
      `${item.salesRecords} sales, ${item.stockAdditionRecords} additions, ` +
        `${item.manualAdjustmentRecords} manual adjustments`,
      item.issues.join(" ")
    ];
    values.forEach((value, index) => {
      const cell = row.insertCell();
      cell.textContent = value === null ? "—" : String(value);
      if (index === 1) {
        cell.className = isReadyToApply(item) ? "eligible" : "review";
      }
    });
  });
  wrapper.append(table);
  resultsElement.append(wrapper);

  const caveat = document.createElement("p");
  caveat.textContent = report.caveat;
  resultsElement.append(caveat);
}

function displayQuantity(value, unit) {
  return value === null || value === undefined
    ? "—"
    : `${value} ${unit || ""}`.trim();
}
