import {
  addDoc,
  collection,
  onSnapshot,
  doc,
  query,
  where,
  writeBatch,
  limit,
  orderBy,
  startAfter,
  endBefore,
  limitToLast,
  getDocs,
  increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";
import {
  adjustCrateStock,
  adjustQuantity,
  appendQuantityUnit,
  calculatePetrolDip,
  escapeQuantity,
  formatCrateStock,
  formatDisplayQuantity,
  formatNumber,
  formatQuantity,
  getCrateStockPieces,
  getPiecesPerCrate,
  isCrateItem,
  isLiterUnit,
  isPetrolName,
  parseQuantity,
  uppercaseInput
} from "./quantity.js";

// DOM Elements (Sales & Analytics)
const saleForm = document.getElementById("saleForm");
const saleItemSearch = document.getElementById("saleItemSearch");
const saleSearchResults = document.getElementById("saleSearchResults");
const salePriceInput = document.getElementById("salePrice");
const saleQuantityInput = document.getElementById("saleQuantity");
const saleCrateStockStatus = document.getElementById("saleCrateStockStatus");
const saleQuantityUnitField = document.getElementById("saleQuantityUnitField");
const saleQuantityUnit = document.getElementById("saleQuantityUnit");
const saleCrateOption = document.getElementById("saleCrateOption");
const recordSaleBtn = document.getElementById("recordSaleBtn");
const salesTableBody = document.getElementById("salesTable"); // Renamed to avoid conflict with global sales array
const salesDateFilter = document.getElementById("salesDateFilter");
const petrolDipFields = document.getElementById("petrolDipFields");
const petrolOpeningDipInput = document.getElementById("petrolOpeningDip");
const petrolFuelReceivedInput = document.getElementById("petrolFuelReceived");
const petrolPumpSalesInput = document.getElementById("petrolPumpSales");
const petrolTotalAvailableInput = document.getElementById("petrolTotalAvailable");
const petrolExpectedClosingInput = document.getElementById("petrolExpectedClosingDip");
const petrolActualClosingInput = document.getElementById("petrolActualClosingDip");
const petrolVarianceInput = document.getElementById("petrolVariance");
const analyticsItemFilter = document.getElementById("analyticsItemFilter");
const analyticsPeriodFilter = document.getElementById("analyticsPeriodFilter");
const analyticsDateFilter = document.getElementById("analyticsDateFilter");
const analyticsDateLabel = document.getElementById("analyticsDateLabel");
const analyticsSalesTotalEl = document.getElementById("analyticsSalesTotal");
const analyticsGrossProfitTotalEl = document.getElementById("analyticsGrossProfitTotal");
const analyticsNetRevenueTotalEl = document.getElementById("analyticsNetRevenueTotal");
const analyticsExpenseTotalEl = document.getElementById("analyticsExpenseTotal");
const analyticsQuantityTotalEl = document.getElementById("analyticsQuantityTotal");
const analyticsBreakdownTable = document.getElementById("analyticsBreakdownTable");
const analyticsStockAdditionsTable = document.getElementById("analyticsStockAdditionsTable");
const petrolAnalyticsPreview = document.getElementById("petrolAnalyticsPreview");
const petrolAnalyticsTable = document.getElementById("petrolAnalyticsTable");
const exportAnalyticsPdfBtn = document.getElementById("exportAnalyticsPdfBtn");
const overviewPeriodFilter = document.getElementById("overviewPeriodFilter");
const overviewRevenueEl = document.getElementById("overviewRevenue");
const overviewGrossProfitEl = document.getElementById("overviewGrossProfit");
const overviewNetRevenueEl = document.getElementById("overviewNetRevenue");
const overviewExpenseTotalEl = document.getElementById("overviewExpenseTotal");
const overviewQuantityEl = document.getElementById("overviewQuantity");
const overviewLowStockEl = document.getElementById("overviewLowStock");
const overviewRangeLabel = document.getElementById("overviewRangeLabel");
const overviewSalesChart = document.getElementById("overviewSalesChart");
const overviewTopItems = document.getElementById("overviewTopItems");
const overviewPetrolQuantity = document.getElementById("overviewPetrolQuantity");
const overviewPetrolRevenue = document.getElementById("overviewPetrolRevenue");
const overviewPetrolClosingDip = document.getElementById("overviewPetrolClosingDip");
const overviewRecentSales = document.getElementById("overviewRecentSales");
const overviewStockAdditions = document.getElementById("overviewStockAdditions");
const overviewExpenses = document.getElementById("overviewExpenses");
const expenseForm = document.getElementById("expenseForm");
const expenseDateInput = document.getElementById("expenseDate");
const expenseTypeInput = document.getElementById("expenseType");
const expenseDescriptionInput = document.getElementById("expenseDescription");
const expenseVendorInput = document.getElementById("expenseVendor");
const expenseAmountInput = document.getElementById("expenseAmount");
const expenseNotesInput = document.getElementById("expenseNotes");
const saveExpenseBtn = document.getElementById("saveExpenseBtn");
const expenseFormMessage = document.getElementById("expenseFormMessage");
const expensesTable = document.getElementById("expensesTable");

let dbInstance;
let authInstance;
let itemsArray = []; // Reference to the items array from script.js
let salesArray = []; // Local sales array for this module
let salesRef;
let stockAdditionsRef;
let expensesRef;
let itemsRef; // Need itemsRef for batch updates
let ordersCollectionRef; // Reference to the orders collection
let salesSummaryRef = null;
let clientBusinessName; // The business name of the logged-in client
let selectedItemId = null;
let editSaleId = null;
let editingOriginalSale = null;
let salesUnsubscribe = null;
let allSalesForAnalytics = [];
let stockAdditionsForAnalytics = [];
let stockAdditionsError = null;
let expensesForAnalytics = [];
let expensesError = null;
let analyticsUnsubscribe = null;
let stockAdditionsUnsubscribe = null;
let expensesUnsubscribe = null;
let analyticsItemsUnsubscribe = null;
let analyticsItemsById = new Map();
let analyticsAllSalesError = null;
let analyticsItemsError = null;
let analyticsItemSalesUnsubscribe = null;
let analyticsItemSales = null;
let analyticsItemSalesError = null;
let currentAnalyticsRows = [];
let petrolDipInputRevision = 0;
let petrolDipPrefillRequest = 0;

// Pagination State
let lastSalesDoc = null;
let firstSalesDoc = null;
let salesPage = 1;
const salesPageSize = 10;

const salesPrevPageBtn = document.getElementById("salesPrevPageBtn");
const salesNextPageBtn = document.getElementById("salesNextPageBtn");
const salesPageInfo = document.getElementById("salesPageInfo");

/**
 * Initializes the sales module.
 * @param {Firestore} db - The Firestore database instance.
 * @param {Auth} auth - The Firebase Auth instance.
 * @param {Array} items - The current items array from script.js (for search).
 * @param {CollectionReference} itemsCollectionRef - Reference to the 'items' collection (for updates).
 * @param {CollectionReference} ordersRef - Reference to the 'orders' collection (for auto-reorder).
 * @param {string} businessName - The business name of the logged-in client.
 */
export function initSalesModule(db, auth, items, itemsCollectionRef, ordersRef, businessName) {
  dbInstance = db;
  authInstance = auth;
  itemsArray = items;
  itemsRef = itemsCollectionRef;
  salesRef = collection(dbInstance, "sales");
  stockAdditionsRef = collection(dbInstance, "stockAdditions");
  expensesRef = collection(dbInstance, "expenses");
  ordersCollectionRef = ordersRef;
  salesSummaryRef = doc(dbInstance, "salesSummaries", authInstance.currentUser.uid);
  clientBusinessName = businessName;

  // Attach event listener for sale form
  saleForm.addEventListener("submit", handleSaleFormSubmit);

  // Attach search listener
  saleItemSearch.addEventListener("input", handleItemSearch);
  saleQuantityInput.addEventListener("input", () => {
    const selectedItem = itemsArray.find(item => item.id === selectedItemId);
    if (isCrateItem(selectedItem?.name)) {
      appendQuantityUnit(
        saleQuantityInput,
        saleQuantityUnit.value === "crate" ? "CRATES" : "PIECES",
        true
      );
    } else {
      appendQuantityUnit(saleQuantityInput, "L", isPetrolItem(selectedItem));
    }
    uppercaseInput(saleQuantityInput);
    updateCrateSaleStockPreview();
    updatePetrolSalePreview();
  });
  saleQuantityUnit.addEventListener("change", () => {
    syncSaleQuantityUnit(selectedItemId
      ? itemsArray.find(item => item.id === selectedItemId)
      : null);
    updateCrateSaleStockPreview();
    updateSaleUnitPrice();
  });
  [petrolOpeningDipInput, petrolFuelReceivedInput, petrolActualClosingInput].forEach(input => {
    input.addEventListener("input", () => {
      appendQuantityUnit(input, "L", true);
      uppercaseInput(input);
      petrolDipInputRevision++;
      updatePetrolSalePreview();
    });
  });
  exportAnalyticsPdfBtn.addEventListener("click", exportAnalyticsPdf);
  expenseDateInput.value = dateKey(new Date());
  expenseDateInput.max = dateKey(new Date());
  expenseForm.addEventListener("submit", handleExpenseFormSubmit);

  const today = dateKey(new Date());
  salesDateFilter.value = today;
  salesDateFilter.max = today;
  salesDateFilter.addEventListener("change", () => {
    if (!salesDateFilter.value) return;
    firstSalesDoc = null;
    lastSalesDoc = null;
    loadSales(authInstance.currentUser.uid);
    const selectedItem = itemsArray.find(item => item.id === selectedItemId);
    if (!editSaleId && isPetrolItem(selectedItem)) {
      prefillPetrolDipFromPreviousDay(selectedItem, false);
    }
  });
  analyticsDateFilter.value = today;
  analyticsItemFilter.addEventListener("change", handleAnalyticsItemChange);
  analyticsDateFilter.addEventListener("change", updateAnalyticsUI);
  overviewPeriodFilter.addEventListener("change", renderOverview);
  document.querySelectorAll("[data-overview-tab]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelector(`.tab-btn[data-tab="${button.dataset.overviewTab}"]`)?.click();
    });
  });
  analyticsPeriodFilter.addEventListener("change", () => {
    updateAnalyticsDateLabel();
    updateAnalyticsUI();
  });
  updateAnalyticsDateLabel();
  listenToAnalyticsItems(authInstance.currentUser.uid);
  listenToStockAdditions(authInstance.currentUser.uid);
  listenToExpenses(authInstance.currentUser.uid);
  salesPrevPageBtn.addEventListener("click", () => {
    if (authInstance.currentUser) loadSales(authInstance.currentUser.uid, "prev");
  });
  salesNextPageBtn.addEventListener("click", () => {
    if (authInstance.currentUser) loadSales(authInstance.currentUser.uid, "next");
  });

  // Close search results when clicking outside
  document.addEventListener("click", (e) => {
    if (!saleItemSearch.contains(e.target) && !saleSearchResults.contains(e.target)) {
      saleSearchResults.style.display = "none";
    }
  });
}

/**
 * Updates the local items reference.
 * @param {Array} currentItems - The latest items array.
 */
export function updateSaleDropdown(currentItems) {
  itemsArray = currentItems; // Update local reference
  addAnalyticsItemOptions(currentItems);
  renderOverview();
}

function listenToAnalyticsItems(uid) {
  const userItemsQuery = query(itemsRef, where("uid", "==", uid));
  analyticsItemsUnsubscribe = onSnapshot(userItemsQuery, snapshot => {
    const analyticsItems = snapshot.docs.map(itemDoc => ({
      id: itemDoc.id,
      ...itemDoc.data()
    }));
    analyticsItemsById = new Map(analyticsItems.map(item => [item.id, item]));
    analyticsItemsError = null;
    addAnalyticsItemOptions(analyticsItems);
    updateAnalyticsUI();
    renderOverview();
  }, error => {
    console.error("Unable to load analytics item settings:", error);
    analyticsItemsError = "Unable to load item analytics settings. Please try again.";
    updateAnalyticsUI();
    renderOverview();
  });
}

function listenToStockAdditions(uid) {
  const userStockAdditionsQuery = query(stockAdditionsRef, where("uid", "==", uid));
  stockAdditionsUnsubscribe = onSnapshot(userStockAdditionsQuery, snapshot => {
    stockAdditionsForAnalytics = snapshot.docs.map(additionDoc => ({
      id: additionDoc.id,
      ...additionDoc.data()
    }));
    stockAdditionsError = null;
    renderAnalyticsStockAdditions();
    renderOverview();
  }, error => {
    console.error("Unable to load stock addition history:", error);
    stockAdditionsError = "Unable to load stock additions. Please try again.";
    renderAnalyticsStockAdditions();
    renderOverview();
  });
}

function listenToExpenses(uid) {
  if (expensesUnsubscribe) expensesUnsubscribe();
  const userExpensesQuery = query(expensesRef, where("uid", "==", uid));
  expensesUnsubscribe = onSnapshot(userExpensesQuery, snapshot => {
    expensesForAnalytics = snapshot.docs.map(expenseDoc => ({
      id: expenseDoc.id,
      ...expenseDoc.data()
    }));
    expensesError = null;
    renderExpensesTable();
    updateAnalyticsUI();
    renderOverview();
  }, error => {
    console.error("Unable to load expense records:", error);
    expensesError = "Unable to load expense and purchase records. Please try again.";
    renderExpensesTable();
    updateAnalyticsUI();
    renderOverview();
  });
}

async function handleExpenseFormSubmit(event) {
  event.preventDefault();
  const user = authInstance.currentUser;
  const date = expenseDateInput.value;
  const today = dateKey(new Date());
  const amount = Number(expenseAmountInput.value);
  const parsedDate = new Date(`${date}T00:00:00`);
  if (!user) {
    expenseFormMessage.textContent = "You must be signed in to record a cost.";
    return;
  }
  if (!date || !Number.isFinite(parsedDate.getTime()) || date > today) {
    expenseFormMessage.textContent = "Choose today or an earlier date.";
    return;
  }
  if (!expenseDescriptionInput.value.trim()) {
    expenseFormMessage.textContent = "Enter a description for this cost.";
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    expenseFormMessage.textContent = "Enter an amount greater than zero.";
    return;
  }

  saveExpenseBtn.disabled = true;
  saveExpenseBtn.classList.add("loading");
  expenseFormMessage.textContent = "";
  try {
    await addDoc(expensesRef, {
      uid: user.uid,
      date,
      type: expenseTypeInput.value,
      description: expenseDescriptionInput.value.trim(),
      vendor: expenseVendorInput.value.trim(),
      amount,
      notes: expenseNotesInput.value.trim(),
      createdAt: new Date().toISOString()
    });
    expenseForm.reset();
    expenseDateInput.value = today;
    expenseFormMessage.textContent = "Cost recorded.";
  } catch (error) {
    console.error("Unable to record expense or purchase:", error);
    expenseFormMessage.textContent = `Unable to record cost: ${error.message}`;
  } finally {
    saveExpenseBtn.disabled = false;
    saveExpenseBtn.classList.remove("loading");
  }
}

function renderExpensesTable() {
  if (expensesError) {
    expensesTable.innerHTML = `<tr><td colspan="6">${escapeQuantity(expensesError)}</td></tr>`;
    return;
  }
  const sortedExpenses = [...expensesForAnalytics].sort((left, right) =>
    (right.date || dateKey(new Date(right.createdAt)))
      .localeCompare(left.date || dateKey(new Date(left.createdAt))));
  expensesTable.innerHTML = sortedExpenses.length
    ? sortedExpenses.map(expense => {
      const date = expense.date || dateKey(new Date(expense.createdAt));
      return `<tr>
        <td>${escapeQuantity(date)}</td>
        <td>${escapeQuantity(expense.type || "Expense")}</td>
        <td>${escapeQuantity(expense.description || "")}</td>
        <td>${escapeQuantity(expense.vendor || "—")}</td>
        <td>${formatNumber(expense.amount)}</td>
        <td>${escapeQuantity(expense.notes || "—")}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="6" style="text-align:center;">No expenses or purchases recorded.</td></tr>`;
}

function addAnalyticsItemOptions(items) {
  const existingOptions = new Map(
    [...analyticsItemFilter.options].map(option => [option.value, option])
  );

  items
    .filter(item => item.name)
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach(item => {
      let option = existingOptions.get(item.id);
      if (!option) {
        option = document.createElement("option");
        option.value = item.id;
        analyticsItemFilter.appendChild(option);
      }
      option.textContent = item.name;
    });
}

function handleAnalyticsItemChange() {
  if (analyticsItemSalesUnsubscribe) {
    analyticsItemSalesUnsubscribe();
    analyticsItemSalesUnsubscribe = null;
  }
  analyticsItemSalesError = null;

  const itemId = analyticsItemFilter.value;
  if (!itemId) {
    analyticsItemSales = null;
    updateAnalyticsUI();
    return;
  }

  analyticsItemSales = [];
  updateAnalyticsUI();
  const itemSalesQuery = query(
    salesRef,
    where("uid", "==", authInstance.currentUser.uid),
    where("itemId", "==", itemId)
  );

  analyticsItemSalesUnsubscribe = onSnapshot(itemSalesQuery, snapshot => {
    analyticsItemSales = snapshot.docs.map(saleDoc => saleDoc.data());
    analyticsItemSalesError = null;
    updateAnalyticsUI();
  }, error => {
    console.error("Unable to load item sales analytics:", error);
    analyticsItemSalesError = "Unable to load sales for this item. Please try again.";
    updateAnalyticsUI();
  });
}

/**
 * Filters items based on search input and renders results.
 */
function handleItemSearch() {
  const term = saleItemSearch.value.toLowerCase().trim();
  selectedItemId = null;
  setSaleQuantityUnit(null);
  setPetrolDipFieldsVisible(false);

  if (!term) {
    saleSearchResults.style.display = "none";
    return;
  }

  const matches = itemsArray.filter(i =>
    i.name.toLowerCase().includes(term) &&
    (isCrateItem(i.name) ? getCrateStockPieces(i) : (parseQuantity(i.quantity)?.amount ?? 0)) > 0);

  if (matches.length === 0) {
    saleSearchResults.style.display = "none";
    return;
  }

  saleSearchResults.innerHTML = matches.map(item => `
    <div class="search-result-item" onclick="window.selectSaleItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')">
      <strong>${item.name}</strong> <br/>
      <small>${isCrateItem(item.name)
        ? `Price: KES ${formatNumber(item.outgoing)} / crate | KES ${
          item.pieceSellingPrice === null || item.pieceSellingPrice === undefined
            ? "Not set"
            : formatNumber(item.pieceSellingPrice)
        } / piece`
        : `Price: KES ${formatNumber(item.outgoing)}`
      } | Stock: ${escapeQuantity(
        isCrateItem(item.name) ? formatCrateStock(item) : formatDisplayQuantity(item.quantity)
      )}</small>
    </div>
  `).join("");
  saleSearchResults.style.display = "block";
}

/**
 * Selects an item from the search results.
 */
window.selectSaleItem = (id, name) => {
  selectedItemId = id;
  saleItemSearch.value = name;
  saleSearchResults.style.display = "none";
  const selectedItem = itemsArray.find(item => item.id === id);
  setSaleQuantityUnit(selectedItem);
  updateCrateSaleStockPreview();
  setPetrolDipFieldsVisible(isPetrolItem(selectedItem));
  if (isPetrolItem(selectedItem)) {
    prefillPetrolDipFromPreviousDay(selectedItem);
  }

  // Auto-fill price if preferred
  if (selectedItem) salePriceInput.value = selectedItem.outgoing;
  saleQuantityInput.focus();
}

async function prefillPetrolDipFromPreviousDay(item, resetEntries = true) {
  const requestId = ++petrolDipPrefillRequest;
  const inputRevision = petrolDipInputRevision;
  const itemId = item.id;
  const selectedDateKey = salesDateFilter.value;

  petrolOpeningDipInput.value = "";
  if (resetEntries) {
    petrolFuelReceivedInput.value = "0 L";
    petrolActualClosingInput.value = "";
  }
  updatePetrolSalePreview();

  try {
    const previousSalesQuery = query(
      salesRef,
      where("uid", "==", authInstance.currentUser.uid),
      where("itemId", "==", itemId)
    );
    const snapshot = await getDocs(previousSalesQuery);
    if (requestId !== petrolDipPrefillRequest ||
        selectedItemId !== itemId ||
        petrolDipInputRevision !== inputRevision) {
      return;
    }

    const priorDipSales = snapshot.docs
      .map(saleDoc => saleDoc.data())
      .filter(sale => {
        const closingDip = sale.petrolDip?.actualClosingDipLiters;
        if (closingDip === null || closingDip === undefined) return false;
        const saleTimestamp = new Date(sale.createdAt);
        return Number.isFinite(saleTimestamp.getTime()) && dateKey(saleTimestamp) < selectedDateKey;
      })
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    const previousClosingDip = priorDipSales[0]?.petrolDip.actualClosingDipLiters;
    if (previousClosingDip !== null && previousClosingDip !== undefined &&
        Number.isFinite(Number(previousClosingDip))) {
      petrolOpeningDipInput.value = `${previousClosingDip} L`;
    }
    updatePetrolSalePreview();
  } catch (error) {
    console.error("Unable to load previous day's petrol closing dip:", error);
    if (requestId === petrolDipPrefillRequest && selectedItemId === itemId) {
      showToast("Could not load the previous day's closing dip. Enter the opening dip manually.", "error");
    }
  }
}

function isPetrolItem(item) {
  return isPetrolName(item?.name);
}

function setSaleQuantityUnit(item) {
  const crateItem = isCrateItem(item?.name);
  saleQuantityUnitField.hidden = !crateItem;
  saleCrateStockStatus.hidden = !crateItem;
  saleQuantityInput.placeholder = crateItem ? "Enter quantity" : "Qty (e.g. 2 kg, 3 cartons)";
  salePriceInput.placeholder = crateItem ? "Selling price per crate" : "Price Sold";
  saleQuantityUnit.value = "crate";
  const piecesPerCrate = crateItem ? getPiecesPerCrate(item) : 24;
  saleCrateOption.textContent = `Crate (${formatNumber(piecesPerCrate)} pieces)`;
  syncSaleQuantityUnit(item);
  updateCrateSaleStockPreview();
}

function updateCrateSaleStockPreview() {
  const item = itemsArray.find(candidate => candidate.id === selectedItemId);
  if (!isCrateItem(item?.name)) {
    saleCrateStockStatus.hidden = true;
    saleCrateStockStatus.textContent = "";
    return;
  }

  saleCrateStockStatus.hidden = false;
  const piecesPerCrate = getPiecesPerCrate(item);
  let availablePieces = getCrateStockPieces(item);
  if (editSaleId && editingOriginalSale?.itemId === selectedItemId) {
    availablePieces += getCrateSaleStockUnits(editingOriginalSale, item);
  }

  const formatStock = pieces => {
    const crates = Math.floor(pieces / piecesPerCrate);
    const loosePieces = pieces % piecesPerCrate;
    const stock = formatCrateStock({
      quantity: formatQuantity(crates, "CRATES"),
      loosePieces,
      piecesPerCrate
    });
    return `${stock} (${formatNumber(pieces)} ${pieces === 1 ? "PIECE" : "PIECES"})`;
  };

  const lines = [`Available: ${formatStock(availablePieces)}`];
  const saleQuantity = parseQuantity(saleQuantityInput.value);
  if (saleQuantity && Number.isInteger(saleQuantity.amount) && saleQuantity.amount > 0) {
    const piecesToSell = saleQuantity.amount *
      (saleQuantityUnit.value === "crate" ? piecesPerCrate : 1);
    if (piecesToSell <= availablePieces) {
      lines.push(`After sale: ${formatStock(availablePieces - piecesToSell)}`);
    } else {
      lines.push("Not enough stock for this quantity.");
    }
  }
  saleCrateStockStatus.textContent = lines.join(" | ");
}

function syncSaleQuantityUnit(item) {
  const quantity = parseQuantity(saleQuantityInput.value);
  if (!quantity) return;

  if (isCrateItem(item?.name)) {
    if (!quantity.unit || /^(crates?|pieces?)$/i.test(quantity.unit)) {
      const unit = saleQuantityUnit.value === "crate" ? "CRATES" : "PIECES";
      saleQuantityInput.value = formatQuantity(quantity.amount, unit);
    }
    return;
  }

  if (/^(crates?|pieces?)$/i.test(quantity.unit)) {
    saleQuantityInput.value = String(quantity.amount);
  }
  appendQuantityUnit(saleQuantityInput, "L", isPetrolItem(item));
  saleCrateStockStatus.hidden = true;
}

function updateSaleUnitPrice() {
  const item = itemsArray.find(candidate => candidate.id === selectedItemId);
  if (!isCrateItem(item?.name)) return;
  salePriceInput.placeholder = saleQuantityUnit.value === "piece"
    ? "Selling price per piece"
    : "Selling price per crate";
  salePriceInput.value = saleQuantityUnit.value === "piece"
    ? Number(item.pieceSellingPrice) || ""
    : item.outgoing;
}

function getCrateSaleStockUnits(sale, item) {
  const quantity = Number(sale.quantity) || 0;
  const unit = String(sale.quantityUnit || "").toLowerCase();
  return isCrateItem(item?.name)
    ? quantity * (!unit || unit.startsWith("crate")
      ? Number(sale.piecesPerCrate) || getPiecesPerCrate(item)
      : 1)
    : quantity;
}

function getItemStockUnits(item) {
  return isCrateItem(item.name)
    ? getCrateStockPieces(item)
    : parseQuantity(item.quantity)?.amount ?? 0;
}

function getItemStockUpdate(item, unitAdjustment) {
  if (isCrateItem(item.name)) {
    return adjustCrateStock(item, unitAdjustment);
  }
  return { quantity: adjustQuantity(item.quantity, unitAdjustment) };
}

function setPetrolDipFieldsVisible(visible) {
  petrolDipFields.hidden = !visible;
  appendQuantityUnit(saleQuantityInput, "L", visible);
  [petrolOpeningDipInput, petrolFuelReceivedInput, petrolActualClosingInput].forEach(input => {
    input.required = visible;
  });
  if (!visible) {
    petrolOpeningDipInput.value = "";
    petrolFuelReceivedInput.value = "";
    petrolActualClosingInput.value = "";
    updatePetrolSalePreview();
  } else {
    updatePetrolSalePreview();
  }
}

function updatePetrolSalePreview() {
  const saleQuantity = parseQuantity(saleQuantityInput.value);
  const pumpSales = saleQuantity?.amount;
  petrolPumpSalesInput.value = Number.isFinite(pumpSales) ? formatNumber(pumpSales).replace(/,/g, "") : "";

  const openingDip = parseLiterInput(petrolOpeningDipInput);
  const fuelReceived = parseLiterInput(petrolFuelReceivedInput);
  const actualClosingDip = parseLiterInput(petrolActualClosingInput);
  if (openingDip === null || fuelReceived === null ||
      actualClosingDip === null || !Number.isFinite(pumpSales)) {
    petrolTotalAvailableInput.value = "";
    petrolExpectedClosingInput.value = "";
    petrolVarianceInput.value = "";
    return null;
  }

  const dip = calculatePetrolDip(openingDip, fuelReceived, pumpSales, actualClosingDip);
  if (!dip) {
    petrolTotalAvailableInput.value = "";
    petrolExpectedClosingInput.value = "";
    petrolVarianceInput.value = "";
    return null;
  }
  petrolTotalAvailableInput.value = formatNumber(dip.totalAvailableLiters).replace(/,/g, "");
  petrolExpectedClosingInput.value = formatNumber(dip.expectedClosingDipLiters).replace(/,/g, "");
  petrolVarianceInput.value = formatNumber(dip.varianceLiters).replace(/,/g, "");
  return dip;
}

function parseLiterInput(input) {
  const quantity = parseQuantity(input.value);
  if (!quantity || (quantity.unit && !isLiterUnit(quantity.unit))) return null;
  return quantity.amount;
}

function getAnalyticsDateRange(period, selectedDate) {
  if (period === "daily") {
    const start = new Date(`${selectedDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { start, end };
  }

  if (period === "weekly") {
    const start = new Date(`${selectedDate}T00:00:00`);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }

  const [year, month] = selectedDate.split("-").map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1)
  };
}

function renderPetrolAnalytics() {
  const selectedItemId = analyticsItemFilter.value;
  const selectedItem = itemsArray.find(item => item.id === selectedItemId);
  const showPetrol = Boolean(selectedItemId && isPetrolItem(selectedItem));
  petrolAnalyticsPreview.hidden = !showPetrol;
  if (!showPetrol) return;

  if (analyticsItemSalesError) {
    petrolAnalyticsTable.innerHTML = `<tr><td colspan="8">${escapeQuantity(analyticsItemSalesError)}</td></tr>`;
    return;
  }

  const { start, end } = getAnalyticsDateRange(analyticsPeriodFilter.value, analyticsDateFilter.value);
  const salesInPeriod = (analyticsItemSales || [])
    .filter(sale => {
      const saleDate = new Date(sale.createdAt);
      return sale.petrolDip && saleDate >= start && saleDate < end;
    })
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));

  petrolAnalyticsTable.innerHTML = salesInPeriod.length
    ? salesInPeriod.map(sale => {
      const dip = sale.petrolDip;
      return `<tr>
        <td>${escapeQuantity(new Date(sale.createdAt).toLocaleString())}</td>
        <td>${formatNumber(dip.openingDipLiters)}</td>
        <td>${formatNumber(dip.fuelReceivedLiters)}</td>
        <td>${formatNumber(dip.pumpSalesLiters)}</td>
        <td>${formatNumber(dip.totalAvailableLiters)}</td>
        <td>${formatNumber(dip.expectedClosingDipLiters)}</td>
        <td>${formatNumber(dip.actualClosingDipLiters)}</td>
        <td>${formatNumber(dip.varianceLiters)}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="8" style="text-align:center;">No petrol dip records for this period.</td></tr>`;
}

function exportAnalyticsPdf() {
  if (stockAdditionsError || expensesError) {
    alert("Stock additions or expense history could not be loaded, so the report was not exported.");
    return;
  }
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const itemName = analyticsItemFilter.value
    ? analyticsItemFilter.selectedOptions[0]?.textContent || "Selected item"
    : "All items";
  const period = analyticsPeriodFilter.value;
  const selectedDate = analyticsDateFilter.value;
  const rows = currentAnalyticsRows;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const footerY = pageHeight - 8;
  let y = 16;

  const drawSectionTitle = title => {
    if (y + 10 > footerY - 8) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text(title, margin, y);
    y += 6;
  };

  const drawTable = (headers, dataRows, columnWidths) => {
    const rowPadding = 2.5;
    const lineHeight = 4.5;
    const drawHeader = () => {
      let x = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      headers.forEach((header, index) => {
        doc.setFillColor(226, 232, 240);
        doc.setDrawColor(203, 213, 225);
        doc.rect(x, y, columnWidths[index], 8, "FD");
        doc.setTextColor(30, 41, 59);
        doc.text(doc.splitTextToSize(String(header), columnWidths[index] - 4), x + 2, y + 5.2);
        x += columnWidths[index];
      });
      y += 8;
    };

    drawHeader();
    dataRows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) =>
        doc.splitTextToSize(String(cell), columnWidths[index] - 4)
      );
      const lineCount = Math.max(...cellLines.map(lines => lines.length), 1);
      const rowHeight = lineCount * lineHeight + rowPadding * 2;

      if (y + rowHeight > footerY - 4) {
        doc.addPage();
        y = 16;
        drawHeader();
      }

      let x = margin;
      cellLines.forEach((lines, index) => {
        doc.setDrawColor(203, 213, 225);
        const alternateRow = rowIndex % 2 === 1;
        doc.setFillColor(alternateRow ? 248 : 255, alternateRow ? 250 : 255, alternateRow ? 252 : 255);
        doc.rect(x, y, columnWidths[index], rowHeight, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(lines, x + 2, y + rowPadding + 3.2);
        x += columnWidths[index];
      });
      y += rowHeight;
    });

    y += 7;
  };

  const shopName = String(clientBusinessName || "Client Shop").trim();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  const shopNameLines = doc.splitTextToSize(shopName, pageWidth - margin * 2);
  doc.text(shopNameLines, margin, y);
  y += shopNameLines.length * 7.5 + 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text("Sales Analytics", margin, y);
  y += 7;

  const selectedPeriod = period === "daily" ? "Date" : period === "weekly" ? "Week of" : "Month";
  drawSectionTitle("Report filters");
  drawTable(
    ["Report filter", "Selection"],
    [
      ["Item", itemName],
      [selectedPeriod, selectedDate]
    ],
    [40, pageWidth - margin * 2 - 40]
  );

  drawSectionTitle("Summary");
  drawTable(
    ["Metric", "Value"],
    [
      ["Gross sales revenue", `KES ${analyticsSalesTotalEl.textContent}`],
      ["Gross sales profit", `KES ${analyticsGrossProfitTotalEl.textContent}`],
      ["Expenses and purchases", `KES ${analyticsExpenseTotalEl.textContent}`],
      ["Net sales revenue", `KES ${analyticsNetRevenueTotalEl.textContent}`],
      ["Quantity sold", formatNumber(analyticsQuantityTotalEl.textContent)]
    ],
    [pageWidth - margin * 2 - 55, 55]
  );

  drawSectionTitle("Sales breakdown");
  const selectedAnalyticsSales = analyticsItemSales !== null
    ? analyticsItemSales
    : allSalesForAnalytics.filter(isIncludedInAllAnalytics);
  drawTable(
    ["Period", "Gross sales", "Gross profit", "Expenses", "Net revenue", "Quantity sold", "Products and quantities"],
    rows.map(row => {
      const salesByItem = new Map();
      selectedAnalyticsSales.forEach(sale => {
        if (!row.dateKeys.includes(dateKey(new Date(sale.createdAt)))) return;

        const unit = sale.quantityUnit || "";
        const itemKey = `${sale.itemId || sale.itemName}|${unit.toLowerCase()}`;
        const existing = salesByItem.get(itemKey) || {
          name: sale.itemName || "Item",
          quantity: 0,
          unit
        };
        existing.quantity += Number(sale.quantity) || 0;
        salesByItem.set(itemKey, existing);
      });
      const productsAndQuantities = [...salesByItem.values()]
        .map(item => `${item.name}: ${formatDisplayQuantity(formatQuantity(item.quantity, item.unit))}`)
        .join("\n") || "—";
      const rowExpenses = getExpensesForDateKeys(row.dateKeys)
        .reduce((total, expense) => total + (Number(expense.amount) || 0), 0);
      const netRevenue = analyticsItemFilter.value ? null : row.revenue - rowExpenses;

      return [
        row.label,
        formatNumber(row.revenue),
        formatNumber(row.profit),
        `KES ${formatNumber(rowExpenses)}`,
        netRevenue === null ? "—" : formatNumber(netRevenue),
        formatNumber(row.quantity),
        productsAndQuantities
      ];
    }),
    [36, 30, 30, 30, 30, 25, pageWidth - margin * 2 - 181]
  );

  const { start: stockStart, end: stockEnd } = getAnalyticsDateRange(period, selectedDate);
  const selectedItemId = analyticsItemFilter.value;
  const stockAdditionRows = stockAdditionsForAnalytics
    .filter(addition => {
      const additionDate = addition.stockDate || dateKey(new Date(addition.createdAt));
      const date = new Date(`${additionDate}T00:00:00`);
      return date >= stockStart && date < stockEnd &&
        (!selectedItemId || addition.itemId === selectedItemId);
    })
    .sort((left, right) =>
      (left.stockDate || dateKey(new Date(left.createdAt)))
        .localeCompare(right.stockDate || dateKey(new Date(right.createdAt))))
    .map(addition => {
      const additionDate = addition.stockDate || dateKey(new Date(addition.createdAt));
      return [
        additionDate,
        new Date(`${additionDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }),
        addition.itemName || "Item",
        formatStockAdditionQuantity(addition)
      ];
    });
  drawSectionTitle("Stock additions");
  drawTable(
    ["Date", "Day", "Item", "Quantity added"],
    stockAdditionRows.length
      ? stockAdditionRows
      : [["No stock additions for this period", "", "", ""]],
    [30, 35, 75, pageWidth - margin * 2 - 140]
  );

  const expenseRows = getExpensesForDateRange(stockStart, stockEnd)
    .sort((left, right) => expenseDateKey(left).localeCompare(expenseDateKey(right)))
    .map(expense => {
      const expenseDate = expenseDateKey(expense);
      return [
        expenseDate,
        new Date(`${expenseDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }),
        expense.type || "Expense",
        expense.description || "",
        expense.vendor || "—",
        `KES ${formatNumber(expense.amount)}`,
        expense.notes || "—"
      ];
    });
  drawSectionTitle("Expenses and purchases");
  drawTable(
    ["Date", "Day", "Type", "Description", "Paid to / Supplier", "Amount", "Notes"],
    expenseRows.length
      ? expenseRows
      : [["No expenses or purchases for this period", "", "", "", "", "", ""]],
    [25, 29, 23, 49, 43, 28, pageWidth - margin * 2 - 197]
  );

  if (!petrolAnalyticsPreview.hidden) {
    const { start, end } = getAnalyticsDateRange(period, selectedDate);
    const petrolRows = (analyticsItemSales || [])
      .filter(sale => {
        const saleDate = new Date(sale.createdAt);
        return sale.petrolDip && saleDate >= start && saleDate < end;
      })
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
      .map(sale => {
        const dip = sale.petrolDip;
        return [
          new Date(sale.createdAt).toLocaleDateString(),
          `${formatNumber(dip.openingDipLiters)} L`,
          `${formatNumber(dip.fuelReceivedLiters)} L`,
          `${formatNumber(dip.pumpSalesLiters)} L`,
          `${formatNumber(dip.totalAvailableLiters)} L`,
          `${formatNumber(dip.expectedClosingDipLiters)} L`,
          `${formatNumber(dip.actualClosingDipLiters)} L`,
          `${formatNumber(dip.varianceLiters)} L`
        ];
      });

    drawSectionTitle("Petrol dip readings (L)");
    drawTable(
      ["Date", "Opening (L)", "Received (L)", "Pump sales (L)", "Available (L)", "Expected close (L)", "Actual close (L)", "Variance (L)"],
      petrolRows.length ? petrolRows : [["No petrol dip records", "", "", "", "", "", "", ""]],
      [32, 31, 31, 31, 34, 39, 34, 45]
    );
  }

  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("BizPulse Analytics | business.competencehub.co.ke", margin, footerY);
    doc.text(`Page ${page} of ${doc.getNumberOfPages()}`, pageWidth - margin, footerY, { align: "right" });
  }

  const fileShopName = shopName.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "Client_Shop";
  doc.save(`${fileShopName}_Analytics_${selectedDate}.pdf`);
}

/**
 * Loads sales data for the current user.
 * @param {string} uid - The user's UID.
 */
export function loadSales(uid, direction = 'initial') {
  // Start the global analytics listener once
  if (!analyticsUnsubscribe) listenToAnalytics(uid);

  // Cleanup existing listener if it exists to prevent memory leaks
  if (salesUnsubscribe) salesUnsubscribe();

  window.showLoadingIndicator(true); // Show loading indicator
  
  let q;
  const selectedDate = salesDateFilter.value;
  if (!selectedDate) return Promise.resolve();
  const startDate = new Date(`${selectedDate}T00:00:00`);
  const nextDay = new Date(startDate);
  nextDay.setDate(startDate.getDate() + 1);
  const baseQuery = query(
    salesRef,
    where("uid", "==", uid),
    where("createdAt", ">=", startDate.toISOString()),
    where("createdAt", "<", nextDay.toISOString()),
    orderBy("createdAt", "desc")
  );

  if (direction === 'next' && lastSalesDoc) {
    q = query(baseQuery, startAfter(lastSalesDoc), limit(salesPageSize));
  } else if (direction === 'prev' && firstSalesDoc) {
    q = query(baseQuery, endBefore(firstSalesDoc), limitToLast(salesPageSize));
  } else {
    q = query(baseQuery, limit(salesPageSize));
    salesPage = 1;
  }

  // onSnapshot provides real-time updates and handles offline data automatically.
  // Returning a Promise allows the app initialization to wait for the first data emit.
  return new Promise((resolve) => {
    let isFirstLoad = true;
    salesUnsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        firstSalesDoc = snapshot.docs[0];
        lastSalesDoc = snapshot.docs[snapshot.docs.length - 1];
      } else if (direction === "initial") {
        firstSalesDoc = null;
        lastSalesDoc = null;
      }

      salesArray = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (direction === 'next' && !snapshot.empty) salesPage++;
      else if (direction === 'prev' && !snapshot.empty) salesPage--;
      else if (direction === 'initial') salesPage = 1;

      renderSalesTable();
      updateSalesPaginationUI(snapshot.size, snapshot.empty);
      window.showLoadingIndicator(false);
      if (isFirstLoad) { isFirstLoad = false; resolve(); }
    }, (error) => {
      console.error("Sales listener error:", error);
      window.showLoadingIndicator(false);
      if (isFirstLoad) resolve(); // Resolve anyway to not block the app
    });
  });
}

function updateSalesPaginationUI(currentCount, isEmpty = false) {
  if (salesPageInfo) salesPageInfo.textContent = `Page ${salesPage}`;
  if (salesPrevPageBtn) salesPrevPageBtn.disabled = (salesPage === 1);
  if (salesNextPageBtn) salesNextPageBtn.disabled = isEmpty || currentCount < salesPageSize;
}

/**
 * Listens to all sales for real-time global analytics.
 */
function listenToAnalytics(uid) {
  const userSalesQuery = query(salesRef, where("uid", "==", uid));
  analyticsUnsubscribe = onSnapshot(userSalesQuery, snapshot => {
    allSalesForAnalytics = snapshot.docs.map(saleDoc => saleDoc.data());
    analyticsAllSalesError = null;
    updateAnalyticsUI();
    renderOverview();
  }, error => {
    console.error("Analytics listener error:", error);
    analyticsAllSalesError = "Unable to load sales analytics. Please try again.";
    updateAnalyticsUI();
    renderOverview();
  });
}

/**
 * Updates the analytics cards using the full sales dataset.
 */
function updateAnalyticsUI() {
  const period = analyticsPeriodFilter.value;
  const selectedDate = analyticsDateFilter.value;
  if (!selectedDate) return;

  const analyticsError = expensesError || (analyticsItemFilter.value
    ? analyticsItemSalesError
    : analyticsAllSalesError || analyticsItemsError);
  if (analyticsError) {
    analyticsSalesTotalEl.textContent = "—";
    analyticsGrossProfitTotalEl.textContent = "—";
    analyticsNetRevenueTotalEl.textContent = "—";
    analyticsExpenseTotalEl.textContent = "—";
    analyticsQuantityTotalEl.textContent = "—";
    currentAnalyticsRows = [];
    analyticsBreakdownTable.innerHTML = `<tr><td colspan="6">${escapeQuantity(analyticsError)}</td></tr>`;
    renderAnalyticsStockAdditions();
    renderPetrolAnalytics();
    return;
  }

  const dailyTotals = getDailyAnalyticsTotals();
  const rows = period === "daily"
    ? getDailyBreakdown(selectedDate, dailyTotals)
    : period === "weekly"
      ? getWeeklyBreakdown(selectedDate, dailyTotals)
      : getMonthlyBreakdown(selectedDate, dailyTotals);
  const totals = rows.reduce((result, row) => ({
    revenue: result.revenue + row.revenue,
    profit: result.profit + row.profit,
    quantity: result.quantity + row.quantity
  }), { revenue: 0, profit: 0, quantity: 0 });
  const periodExpenses = getExpensesForDateKeys(rows.flatMap(row => row.dateKeys));
  const expenseTotal = periodExpenses.reduce((total, expense) =>
    total + (Number(expense.amount) || 0), 0);
  const hasBusinessWideView = !analyticsItemFilter.value;

  analyticsSalesTotalEl.textContent = formatNumber(totals.revenue);
  analyticsGrossProfitTotalEl.textContent = formatNumber(totals.profit);
  analyticsNetRevenueTotalEl.textContent = hasBusinessWideView
    ? formatNumber(totals.revenue - expenseTotal)
    : "—";
  analyticsExpenseTotalEl.textContent = formatNumber(expenseTotal);
  analyticsQuantityTotalEl.textContent = formatNumber(totals.quantity);
  analyticsBreakdownTable.innerHTML = rows.map(row => `
    <tr>
      <td>${row.label}</td>
      <td>${formatNumber(row.revenue)}</td>
      <td>${formatNumber(row.profit)}</td>
      <td>${formatNumber(getExpensesForDateKeys(row.dateKeys)
        .reduce((total, expense) => total + (Number(expense.amount) || 0), 0))}</td>
      <td>${hasBusinessWideView
        ? formatNumber(row.revenue - getExpensesForDateKeys(row.dateKeys)
          .reduce((total, expense) => total + (Number(expense.amount) || 0), 0))
        : "—"}</td>
      <td>${formatNumber(row.quantity)}</td>
    </tr>
  `).join("");
  currentAnalyticsRows = rows;
  renderAnalyticsStockAdditions();
  renderPetrolAnalytics();

  updateAnalyticsDateLabel();

}

function renderOverview() {
  if (!overviewPeriodFilter) return;

  const days = Number(overviewPeriodFilter.value) || 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(today.getDate() + 1);
  const start = new Date(today);
  start.setDate(today.getDate() - days + 1);
  const periodLabel = `Last ${days} days`;
  overviewRangeLabel.textContent = periodLabel;

  const overviewError = analyticsAllSalesError || analyticsItemsError || expensesError;
  if (overviewError) {
    const errorMessage = escapeQuantity(overviewError);
    overviewRevenueEl.textContent = "—";
    overviewGrossProfitEl.textContent = "—";
    overviewNetRevenueEl.textContent = "—";
    overviewExpenseTotalEl.textContent = "—";
    overviewQuantityEl.textContent = "—";
    overviewSalesChart.innerHTML = `<p class="overview-empty-state">${errorMessage}</p>`;
    overviewTopItems.innerHTML = `<p class="overview-empty-state">${errorMessage}</p>`;
    overviewRecentSales.innerHTML = `<tr><td colspan="4">${errorMessage}</td></tr>`;
    overviewPetrolQuantity.textContent = "—";
    overviewPetrolRevenue.textContent = "—";
    overviewPetrolClosingDip.textContent = "—";
    overviewLowStockEl.textContent = String(countLowStockItems());
    renderOverviewStockAdditions(start, end);
    renderOverviewExpenses(getExpensesForDateRange(start, end));
    return;
  }

  const periodSales = allSalesForAnalytics.filter(sale => {
    const saleDate = new Date(sale.createdAt);
    return Number.isFinite(saleDate.getTime()) && saleDate >= start && saleDate < end;
  });
  const petrolSales = periodSales.filter(sale =>
    isPetrolName(analyticsItemsById.get(sale.itemId)?.name || sale.itemName)
  );
  const includedSales = periodSales.filter(sale =>
    !isPetrolName(analyticsItemsById.get(sale.itemId)?.name || sale.itemName) &&
    isIncludedInAllAnalytics(sale)
  );

  const totals = includedSales.reduce((result, sale) => ({
    revenue: result.revenue + (Number(sale.revenue) || 0),
    profit: result.profit + (Number(sale.profit) || 0)
  }), { revenue: 0, profit: 0 });
  const periodExpenses = getExpensesForDateRange(start, end);
  const expenseTotal = periodExpenses.reduce((total, expense) =>
    total + (Number(expense.amount) || 0), 0);

  overviewRevenueEl.textContent = `KES ${formatNumber(totals.revenue)}`;
  overviewGrossProfitEl.textContent = `KES ${formatNumber(totals.profit)}`;
  overviewNetRevenueEl.textContent = `KES ${formatNumber(totals.revenue - expenseTotal)}`;
  overviewExpenseTotalEl.textContent = `KES ${formatNumber(expenseTotal)}`;
  overviewQuantityEl.textContent = formatOverviewQuantities(includedSales);
  overviewLowStockEl.textContent = String(countLowStockItems());
  renderOverviewSalesChart(start, days, includedSales);
  renderOverviewTopItems(includedSales);
  renderOverviewRecentSales(includedSales);
  renderOverviewStockAdditions(start, end);
  renderOverviewExpenses(periodExpenses);
  renderOverviewPetrol(petrolSales);
}

function countLowStockItems() {
  const inventoryItems = analyticsItemsById.size
    ? [...analyticsItemsById.values()]
    : itemsArray;
  return inventoryItems.filter(item => (
    isCrateItem(item.name)
      ? getCrateStockPieces(item)
      : parseQuantity(item.quantity)?.amount ?? 0
  ) <= 3).length;
}

function formatStockAdditionQuantity(addition) {
  const quantity = Number(addition.quantity) || 0;
  const unit = String(addition.quantityUnit || "").trim().toUpperCase();
  if (unit === "CRATES") {
    const crateLabel = quantity === 1 ? "CRATE" : "CRATES";
    const piecesAdded = Number(addition.piecesAdded) ||
      quantity * (Number(addition.piecesPerCrate) || 0);
    return `${formatNumber(quantity)} ${crateLabel} (${formatNumber(piecesAdded)} PIECES)`;
  }
  return formatDisplayQuantity(formatQuantity(quantity, unit));
}

function expenseDateKey(expense) {
  return expense.date || dateKey(new Date(expense.createdAt));
}

function getExpensesForDateKeys(dateKeys) {
  const dateSet = new Set(dateKeys);
  return expensesForAnalytics.filter(expense => dateSet.has(expenseDateKey(expense)));
}

function getExpensesForDateRange(start, end) {
  return expensesForAnalytics.filter(expense => {
    const date = new Date(`${expenseDateKey(expense)}T00:00:00`);
    return Number.isFinite(date.getTime()) && date >= start && date < end;
  });
}

function renderOverviewExpenses(expenses) {
  if (!overviewExpenses) return;
  if (expensesError) {
    overviewExpenses.innerHTML =
      `<tr><td colspan="4" class="overview-empty-state">${escapeQuantity(expensesError)}</td></tr>`;
    return;
  }
  const recentExpenses = [...expenses]
    .sort((left, right) => expenseDateKey(right).localeCompare(expenseDateKey(left)))
    .slice(0, 5);
  overviewExpenses.innerHTML = recentExpenses.length
    ? recentExpenses.map(expense => `<tr>
        <td>${escapeQuantity(new Date(`${expenseDateKey(expense)}T00:00:00`).toLocaleDateString())}</td>
        <td>${escapeQuantity(expense.type || "Expense")}</td>
        <td>${escapeQuantity(expense.description || "")}</td>
        <td>KES ${formatNumber(expense.amount)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="overview-empty-state">No expenses or purchases in this period.</td></tr>`;
}

function renderAnalyticsStockAdditions() {
  if (!analyticsStockAdditionsTable) return;
  if (stockAdditionsError) {
    analyticsStockAdditionsTable.innerHTML =
      `<tr><td colspan="4">${escapeQuantity(stockAdditionsError)}</td></tr>`;
    return;
  }

  const dateKeys = new Set(currentAnalyticsRows.flatMap(row => row.dateKeys));
  const selectedItemId = analyticsItemFilter.value;
  const additions = stockAdditionsForAnalytics
    .filter(addition => {
      const additionDate = addition.stockDate || dateKey(new Date(addition.createdAt));
      return dateKeys.has(additionDate) &&
        (!selectedItemId || addition.itemId === selectedItemId);
    })
    .sort((left, right) =>
      (right.stockDate || dateKey(new Date(right.createdAt)))
        .localeCompare(left.stockDate || dateKey(new Date(left.createdAt))));

  analyticsStockAdditionsTable.innerHTML = additions.length
    ? additions.map(addition => {
      const date = addition.stockDate || dateKey(new Date(addition.createdAt));
      return `<tr>
        <td>${escapeQuantity(date)}</td>
        <td>${escapeQuantity(new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }))}</td>
        <td>${escapeQuantity(addition.itemName || "Item")}</td>
        <td>${escapeQuantity(formatStockAdditionQuantity(addition))}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="4" style="text-align:center;">No stock additions for this period.</td></tr>`;
}

function renderOverviewStockAdditions(start, end) {
  if (!overviewStockAdditions) return;
  if (stockAdditionsError) {
    overviewStockAdditions.innerHTML =
      `<tr><td colspan="3" class="overview-empty-state">${escapeQuantity(stockAdditionsError)}</td></tr>`;
    return;
  }

  const additions = stockAdditionsForAnalytics
    .filter(addition => {
      const additionDate = addition.stockDate || dateKey(new Date(addition.createdAt));
      const date = new Date(`${additionDate}T00:00:00`);
      return date >= start && date < end;
    })
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 5);
  overviewStockAdditions.innerHTML = additions.length
    ? additions.map(addition => {
      const date = addition.stockDate || dateKey(new Date(addition.createdAt));
      return `<tr>
        <td>${escapeQuantity(new Date(`${date}T00:00:00`).toLocaleDateString())}</td>
        <td>${escapeQuantity(addition.itemName || "Item")}</td>
        <td>${escapeQuantity(formatStockAdditionQuantity(addition))}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="3" class="overview-empty-state">No stock additions in this period.</td></tr>`;
}

function formatOverviewQuantities(sales) {
  const quantitiesByUnit = new Map();
  sales.forEach(sale => {
    const unit = String(sale.quantityUnit || "").trim().toUpperCase();
    quantitiesByUnit.set(unit, (quantitiesByUnit.get(unit) || 0) + (Number(sale.quantity) || 0));
  });
  return quantitiesByUnit.size
    ? [...quantitiesByUnit.entries()]
      .map(([unit, amount]) => `${formatNumber(amount)}${unit ? ` ${unit}` : ""}`)
      .join(" · ")
    : "0";
}

function renderOverviewSalesChart(start, days, sales) {
  const dailyRevenue = new Map();
  sales.forEach(sale => {
    const key = dateKey(new Date(sale.createdAt));
    dailyRevenue.set(key, (dailyRevenue.get(key) || 0) + (Number(sale.revenue) || 0));
  });

  const values = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, value: dailyRevenue.get(dateKey(date)) || 0 };
  });
  const width = 680;
  const height = 220;
  const left = 54;
  const right = 12;
  const top = 18;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxRevenue = Math.max(...values.map(point => point.value), 0);
  const scaleMax = maxRevenue || 1;
  const points = values.map((point, index) => {
    const x = left + (values.length === 1 ? chartWidth / 2 : (index * chartWidth) / (values.length - 1));
    const y = top + chartHeight - (point.value / scaleMax) * chartHeight;
    return { ...point, x, y };
  });
  const polyline = points.map(point => `${point.x},${point.y}`).join(" ");
  const labels = [0, Math.floor((days - 1) / 2), days - 1]
    .filter((index, position, indexes) => indexes.indexOf(index) === position)
    .map(index => {
      const point = points[index];
      return `<text x="${point.x}" y="${height - 10}" text-anchor="middle">${escapeQuantity(
        point.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      )}</text>`;
    }).join("");
  const guides = [0, 0.5, 1].map(ratio => {
    const y = top + chartHeight * ratio;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="overview-chart-guide" />
      <text x="${left - 8}" y="${y + 4}" text-anchor="end">${escapeQuantity(
        formatNumber(scaleMax * (1 - ratio))
      )}</text>`;
  }).join("");

  overviewSalesChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily sales revenue for ${days} days">
      ${guides}
      <polyline points="${polyline}" class="overview-chart-line" />
      ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.5" class="overview-chart-point">
        <title>${escapeQuantity(point.date.toLocaleDateString())}: KES ${escapeQuantity(formatNumber(point.value))}</title>
      </circle>`).join("")}
      ${labels}
    </svg>`;
}

function renderOverviewTopItems(sales) {
  const items = new Map();
  sales.forEach(sale => {
    const key = sale.itemId || sale.itemName || "unknown";
    const item = items.get(key) || {
      name: sale.itemName || "Item",
      revenue: 0,
      quantities: new Map()
    };
    const unit = String(sale.quantityUnit || "").trim().toUpperCase();
    item.revenue += Number(sale.revenue) || 0;
    item.quantities.set(unit, (item.quantities.get(unit) || 0) + (Number(sale.quantity) || 0));
    items.set(key, item);
  });

  const topItems = [...items.values()]
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5);
  if (!topItems.length) {
    overviewTopItems.innerHTML = `<p class="overview-empty-state">No non-petrol sales for this period.</p>`;
    return;
  }
  const maxRevenue = topItems[0].revenue || 1;
  overviewTopItems.innerHTML = topItems.map(item => {
    const quantity = [...item.quantities.entries()]
      .map(([unit, amount]) => `${formatNumber(amount)}${unit ? ` ${unit}` : ""}`)
      .join(" + ");
    const width = Math.max(4, (item.revenue / maxRevenue) * 100);
    return `<div class="overview-top-item">
      <div class="overview-top-item-label">
        <strong>${escapeQuantity(item.name)}</strong>
        <span>${escapeQuantity(quantity)} · KES ${formatNumber(item.revenue)}</span>
      </div>
      <div class="overview-top-item-track" aria-hidden="true"><span style="width: ${width}%"></span></div>
    </div>`;
  }).join("");
}

function renderOverviewRecentSales(sales) {
  const recentSales = [...sales]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 5);
  overviewRecentSales.innerHTML = recentSales.length
    ? recentSales.map(sale => `<tr>
        <td>${escapeQuantity(new Date(sale.createdAt).toLocaleDateString())}</td>
        <td>${escapeQuantity(sale.itemName || "Item")}</td>
        <td>${escapeQuantity(formatDisplayQuantity(formatQuantity(sale.quantity, sale.quantityUnit || "")))}</td>
        <td>${formatNumber(sale.revenue)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="overview-empty-state">No non-petrol sales for this period.</td></tr>`;
}

function renderOverviewPetrol(sales) {
  const quantity = sales.reduce((total, sale) => total + (Number(sale.quantity) || 0), 0);
  const revenue = sales.reduce((total, sale) => total + (Number(sale.revenue) || 0), 0);
  overviewPetrolQuantity.textContent = `${formatNumber(quantity)} L`;
  overviewPetrolRevenue.textContent = `KES ${formatNumber(revenue)}`;

  const latestDip = allSalesForAnalytics
    .filter(sale => sale.petrolDip &&
      isPetrolName(analyticsItemsById.get(sale.itemId)?.name || sale.itemName) &&
      sale.petrolDip.actualClosingDipLiters !== null &&
      sale.petrolDip.actualClosingDipLiters !== undefined &&
      Number.isFinite(Number(sale.petrolDip.actualClosingDipLiters)))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0];
  overviewPetrolClosingDip.textContent = latestDip
    ? `${formatNumber(latestDip.petrolDip.actualClosingDipLiters)} L`
    : "No dip record";
}

function getDailyAnalyticsTotals() {
  const totals = {};
  const sales = analyticsItemSales !== null
    ? analyticsItemSales
    : allSalesForAnalytics.filter(isIncludedInAllAnalytics);

  sales.forEach(sale => {
    const date = dateKey(new Date(sale.createdAt));
    if (!totals[date]) totals[date] = { revenue: 0, profit: 0, quantity: 0 };
    totals[date].revenue += Number(sale.revenue) || 0;
    totals[date].profit += Number(sale.profit) || 0;
    totals[date].quantity += Number(sale.quantity) || 0;
  });
  return totals;
}

function isIncludedInAllAnalytics(sale) {
  const item = analyticsItemsById.get(sale.itemId);
  if (typeof item?.includeInAllAnalytics === "boolean") {
    return item.includeInAllAnalytics;
  }
  return !isPetrolName(item?.name || sale.itemName);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function emptyDailyTotal() {
  return { revenue: 0, profit: 0, quantity: 0 };
}

function getDailyBreakdown(selectedDate, dailyTotals) {
  const total = dailyTotals[selectedDate] || emptyDailyTotal();
  return [{
    label: new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    }),
    dateKeys: [selectedDate],
    ...total
  }];
}

function getWeeklyBreakdown(selectedDate, dailyTotals) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const mondayOffset = (selected.getDay() + 6) % 7;
  const start = new Date(selected);
  start.setDate(selected.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    const total = dailyTotals[key] || emptyDailyTotal();
    return {
      label: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      dateKeys: [key],
      ...total
    };
  });
}

function getMonthlyBreakdown(selectedDate, dailyTotals) {
  const [year, month] = selectedDate.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth);
  const weeks = new Map();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const mondayOffset = (date.getDay() + 6) % 7;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - mondayOffset);
    const key = dateKey(weekStart);
    const total = dailyTotals[dateKey(date)] || emptyDailyTotal();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const labelStart = weekStart < monthStart ? monthStart : weekStart;
    const labelEnd = weekEnd > monthEnd ? monthEnd : weekEnd;
    const week = weeks.get(key) || {
      label: `${labelStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${labelEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      dateKeys: [],
      revenue: 0,
      profit: 0,
      quantity: 0
    };
    week.revenue += total.revenue;
    week.profit += total.profit;
    week.quantity += total.quantity;
    week.dateKeys.push(dateKey(date));
    weeks.set(key, week);
  }

  return [...weeks.values()];
}

function updateAnalyticsDateLabel() {
  const selectedDate = analyticsDateFilter.value;
  const period = analyticsPeriodFilter.value;
  if (period === "monthly") {
    analyticsDateFilter.type = "month";
    if (selectedDate.length === 10) analyticsDateFilter.value = selectedDate.slice(0, 7);
    analyticsDateLabel.textContent = "Month";
  } else {
    analyticsDateFilter.type = "date";
    if (selectedDate.length === 7) analyticsDateFilter.value = `${selectedDate}-01`;
    analyticsDateLabel.textContent = period === "daily" ? "Date" : "Week of";
  }
}

/**
 * Renders only the paginated sales table.
 */
function renderSalesTable() {
  salesTableBody.innerHTML = "";

  // Pagination returns a limited slice of data
  salesArray.forEach(sale => {
    const row = document.createElement("tr");
    row.innerHTML = `
        <td>${new Date(sale.createdAt).toLocaleDateString()}</td>
        <td>${new Date(sale.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}</td>
        <td>${sale.itemName}</td>
        <td>${escapeQuantity(formatDisplayQuantity(formatQuantity(sale.quantity, sale.quantityUnit || "")))}</td>
        <td>${formatNumber(sale.unitPriceSold)}</td>
        <td>${formatNumber(sale.revenue)}</td>
        <td style="color: green; font-weight: bold;">${formatNumber(sale.profit)}</td>
        <td><button onclick="window.editSale('${sale.id}')">Edit</button></td>
      `;
    salesTableBody.appendChild(row);
  });

  if (salesTableBody.innerHTML === "") {
    salesTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: #6b7280; padding: 20px;">
      No sales recorded yet.
    </td></tr>`;
  }
}

/**
 * Handles the submission of the sale form.
 * @param {Event} e - The form submission event.
 */
async function handleSaleFormSubmit(e) {
  window.showLoadingIndicator(true); // Show loading indicator
  e.preventDefault();
  const selectedSaleDate = salesDateFilter.value;
  const selectedSaleDateStart = new Date(`${selectedSaleDate}T00:00:00`);
  if (!selectedSaleDate || !Number.isFinite(selectedSaleDateStart.getTime()) ||
      selectedSaleDate > dateKey(new Date())) {
    alert("Choose today or an earlier date for this sale.");
    window.showLoadingIndicator(false);
    return;
  }
  const unitPriceSold = Number(salePriceInput.value);
  const saleQuantity = parseQuantity(saleQuantityInput.value);
  const item = itemsArray.find(i => i.id === selectedItemId);

  if (!selectedItemId || !item) {
    alert("Please search and select an item from the list.");
    window.showLoadingIndicator(false);
    return;
  }

  if (!saleQuantity || saleQuantity.amount <= 0) {
    alert("Enter a valid quantity greater than zero, such as 2, 2 kg, or 3 cartons.");
    window.showLoadingIndicator(false);
    return;
  }

  const itemQuantity = parseQuantity(item.quantity);
  const itemUnit = itemQuantity?.unit || "";
  const petrolItem = isPetrolItem(item);
  const crateItem = isCrateItem(item.name);
  const saleUnit = crateItem ? saleQuantityUnit.value : "";
  if (crateItem && !Number.isInteger(saleQuantity.amount)) {
    alert("Crates and pieces must be sold as whole numbers.");
    window.showLoadingIndicator(false);
    return;
  }
  if (crateItem && saleQuantity.unit &&
      !new RegExp(`^${saleUnit}s?$`, "i").test(saleQuantity.unit)) {
    alert(`Select ${saleUnit} in the Sell as menu or remove the unit from the quantity.`);
    window.showLoadingIndicator(false);
    return;
  }
  if (crateItem && saleUnit === "piece" &&
      (item.pieceSellingPrice === null || item.pieceSellingPrice === undefined ||
       item.pieceSellingPrice === "" || !Number.isFinite(Number(item.pieceSellingPrice)))) {
    alert("Set this item's selling price per piece in Inventory before selling pieces.");
    window.showLoadingIndicator(false);
    return;
  }
  if (!crateItem && saleQuantity.unit && itemUnit &&
      saleQuantity.unit.toLowerCase() !== itemUnit.toLowerCase() &&
      !(petrolItem && isLiterUnit(saleQuantity.unit) && isLiterUnit(itemUnit))) {
    alert(`Sale unit must match the inventory unit (${itemUnit}).`);
    window.showLoadingIndicator(false);
    return;
  }
  const qtySold = saleQuantity.amount;
  const stockUnitsSold = crateItem
    ? qtySold * (saleUnit === "crate" ? getPiecesPerCrate(item) : 1)
    : qtySold;
  const quantityUnit = crateItem
    ? saleUnit === "crate" ? "CRATES" : "PIECES"
    : petrolItem ? "L" : (itemUnit || saleQuantity.unit);
  let petrolDip = null;
  if (petrolItem) {
    const saleUnit = saleQuantity.unit || itemUnit;
    if (saleUnit && !isLiterUnit(saleUnit)) {
      alert("Petrol quantities must be recorded in liters (L).");
      window.showLoadingIndicator(false);
      return;
    }
    petrolDip = updatePetrolSalePreview();
    if (!petrolDip) {
      alert("Enter valid opening dip, fuel received, and actual closing dip values.");
      window.showLoadingIndicator(false);
      return;
    }
  }

  // Stock check logic adjustment for Edit
  let availableStock = getItemStockUnits(item);
  if (editSaleId) {
    const originalSale = editingOriginalSale || salesArray.find(s => s.id === editSaleId);
    if (originalSale.itemId === selectedItemId) {
      availableStock += getCrateSaleStockUnits(originalSale, item);
    }
  }

  if (stockUnitsSold > availableStock) {
    const availableUnit = petrolItem ? "L" : itemUnit;
    const availableQuantity = crateItem
      ? formatCrateStock({
        quantity: formatQuantity(Math.floor(availableStock / getPiecesPerCrate(item)), "CRATES"),
        loosePieces: availableStock % getPiecesPerCrate(item),
        piecesPerCrate: getPiecesPerCrate(item)
      })
      : formatDisplayQuantity(formatQuantity(availableStock, availableUnit));
    alert(`Insufficient stock! | ${availableQuantity}`);
    window.showLoadingIndicator(false);
    return;
  }

  const revenue = unitPriceSold * qtySold;
  const cost = crateItem
    ? item.incoming * (stockUnitsSold / getPiecesPerCrate(item))
    : item.incoming * qtySold;
  const profit = revenue - cost;
  const saleDateTimestamp = new Date(selectedSaleDateStart);
  const currentTime = new Date();
  saleDateTimestamp.setHours(
    currentTime.getHours(),
    currentTime.getMinutes(),
    currentTime.getSeconds(),
    currentTime.getMilliseconds()
  );

  const isOutOfStock = availableStock - stockUnitsSold === 0;
  const saleData = {
    itemId: selectedItemId,
    itemName: item.name,
    unitPriceSold,
    quantity: qtySold,
    quantityUnit,
    ...(crateItem ? { piecesPerCrate: getPiecesPerCrate(item) } : {}),
    ...(petrolDip ? { petrolDip } : {}),
    revenue,
    profit,
    uid: authInstance.currentUser.uid,
    createdAt: saleDateTimestamp.toISOString()
  };

  recordSaleBtn.disabled = true;
  recordSaleBtn.classList.add("loading");

  try {
    const batch = writeBatch(dbInstance);
    const newSaleRef = doc(salesRef);
    const itemRef = doc(dbInstance, "items", selectedItemId);

    if (editSaleId) {
      const originalSale = editingOriginalSale || salesArray.find(s => s.id === editSaleId);
      const originalItem = itemsArray.find(candidate => candidate.id === originalSale.itemId);
      const originalStockUnits = getCrateSaleStockUnits(
        originalSale,
        originalItem || { name: originalSale.itemName }
      );

      if (originalSale.itemId !== selectedItemId) {
        if (originalItem) {
          batch.update(
            doc(dbInstance, "items", originalSale.itemId),
            getItemStockUpdate(originalItem, originalStockUnits)
          );
        }
        batch.update(itemRef, getItemStockUpdate(item, -stockUnitsSold));
      } else {
        batch.update(itemRef, getItemStockUpdate(item, originalStockUnits - stockUnitsSold));
      }
      
      batch.update(doc(salesRef, editSaleId), saleData);

      const originalDate = dateKey(new Date(originalSale.createdAt));
      const originalMonth = originalDate.slice(0, 7);
      const deltaRevenue = revenue - originalSale.revenue;
      const deltaProfit = profit - originalSale.profit;
      const deltaCount = qtySold - originalSale.quantity;
      const currentMonth = selectedSaleDate.slice(0, 7);
      const summaryUpdate = {
        "lifetime.revenue": increment(deltaRevenue),
        "lifetime.profit": increment(deltaProfit)
      };
      if (originalDate === selectedSaleDate) {
        summaryUpdate[`dailyTotals.${originalDate}.revenue`] = increment(deltaRevenue);
        summaryUpdate[`dailyTotals.${originalDate}.profit`] = increment(deltaProfit);
        summaryUpdate[`dailyTotals.${originalDate}.count`] = increment(deltaCount);
      } else {
        summaryUpdate[`dailyTotals.${originalDate}.revenue`] = increment(-originalSale.revenue);
        summaryUpdate[`dailyTotals.${originalDate}.profit`] = increment(-originalSale.profit);
        summaryUpdate[`dailyTotals.${originalDate}.count`] = increment(-originalSale.quantity);
        summaryUpdate[`dailyTotals.${selectedSaleDate}.revenue`] = increment(revenue);
        summaryUpdate[`dailyTotals.${selectedSaleDate}.profit`] = increment(profit);
        summaryUpdate[`dailyTotals.${selectedSaleDate}.count`] = increment(qtySold);
      }
      if (originalMonth === currentMonth) {
        summaryUpdate[`monthlyTotals.${originalMonth}.revenue`] = increment(deltaRevenue);
        summaryUpdate[`monthlyTotals.${originalMonth}.profit`] = increment(deltaProfit);
      } else {
        summaryUpdate[`monthlyTotals.${originalMonth}.revenue`] = increment(-originalSale.revenue);
        summaryUpdate[`monthlyTotals.${originalMonth}.profit`] = increment(-originalSale.profit);
        summaryUpdate[`monthlyTotals.${currentMonth}.revenue`] = increment(revenue);
        summaryUpdate[`monthlyTotals.${currentMonth}.profit`] = increment(profit);
      }
      
      // Use update for surgical nested increments; set ensures doc existence
      // Correct Pattern: set ensures the doc exists, update ensures dot-notation creates Maps
      batch.set(salesSummaryRef, {}, { merge: true });
      batch.update(salesSummaryRef, summaryUpdate);
    } else {
      batch.set(newSaleRef, saleData);
      batch.update(itemRef, getItemStockUpdate(item, -stockUnitsSold));

      const currentDate = selectedSaleDate;
      const currentMonth = currentDate.slice(0, 7);
      const summaryUpdate = {
        [`dailyTotals.${currentDate}.revenue`]: increment(revenue),
        [`dailyTotals.${currentDate}.profit`]: increment(profit),
        [`dailyTotals.${currentDate}.count`]: increment(qtySold),
        [`monthlyTotals.${currentMonth}.revenue`]: increment(revenue),
        [`monthlyTotals.${currentMonth}.profit`]: increment(profit),
        [`lifetime.revenue`]: increment(revenue),
        [`lifetime.profit`]: increment(profit)
      };

      // Use update for surgical nested increments; set ensures doc existence
      batch.set(salesSummaryRef, {}, { merge: true });
      batch.update(salesSummaryRef, summaryUpdate);
    }

    // Check if item quantity went to 0 after this sale
    if (isOutOfStock) {
      const reorderData = {
        customerName: clientBusinessName, // Use the client's business name
        itemName: item.name,
        quantity: isPetrolItem(item) ? "5 L" : crateItem ? "5 CRATES" : 5,
        notes: "Item quantity reached 0. <br>Quantity to be adjusted.",
        date: new Date().toISOString(),
        uid: authInstance.currentUser.uid,
        createdAt: new Date().toISOString()
      };
      batch.set(doc(ordersCollectionRef), reorderData); // Add to orders collection
    }

    // batch.commit() resolves immediately to the local cache when persistence is enabled.
    await batch.commit(); 

    if (editSaleId) {
      editSaleId = null;
      editingOriginalSale = null;
      if (recordSaleBtn.querySelector(".btn-text")) recordSaleBtn.querySelector(".btn-text").textContent = "Record Sale";
    }

    if (!navigator.onLine) {
      showToast("Sale saved offline. It will sync when you are back online.", "info");
    }

    if (isOutOfStock) {
      showToast(`Stock Alert: ${item.name} is out of stock. An automatic order has been created.`, "info");
    }

    saleForm.reset();
    selectedItemId = null;
    setSaleQuantityUnit(null);
    // Trigger a reload of items and sales in the main script
    window.dispatchEvent(new CustomEvent('saleRecorded', { detail: { uid: authInstance.currentUser.uid } }));
  } catch (err) {
    alert("Error recording sale: " + err.message);
    console.error("Error recording sale:", err);
  } finally {
    recordSaleBtn.disabled = false;
    recordSaleBtn.classList.remove("loading");
    window.showLoadingIndicator(false);
  }
}

/**
 * Populates the sale form with existing data for editing.
 * @param {string} id - The ID of the sale to edit.
 */
window.editSale = (id) => {
  const sale = salesArray.find(s => s.id === id);
  if (!sale) return;

  editSaleId = id;
  editingOriginalSale = sale;
  selectedItemId = sale.itemId;
  
  // Populate form fields
  if (saleItemSearch) saleItemSearch.value = sale.itemName;
  if (salePriceInput) salePriceInput.value = sale.unitPriceSold;
  if (saleQuantityInput) {
    saleQuantityInput.value = formatQuantity(sale.quantity, sale.quantityUnit || "");
  }
  const item = itemsArray.find(candidate => candidate.id === sale.itemId);
  setSaleQuantityUnit(item);
  if (isCrateItem(item?.name)) {
    saleQuantityUnit.value = String(sale.quantityUnit || "").toLowerCase().startsWith("crate")
      ? "crate"
      : "piece";
  }
  syncSaleQuantityUnit(item);
  updateCrateSaleStockPreview();
  setPetrolDipFieldsVisible(isPetrolItem(item));
  if (sale.petrolDip) {
    petrolOpeningDipInput.value = `${sale.petrolDip.openingDipLiters} L`;
    petrolFuelReceivedInput.value = `${sale.petrolDip.fuelReceivedLiters} L`;
    petrolActualClosingInput.value = `${sale.petrolDip.actualClosingDipLiters} L`;
    updatePetrolSalePreview();
  }

  // Update button UI
  const btnText = recordSaleBtn.querySelector(".btn-text");
  if (btnText) btnText.textContent = "Update Sale";

  // Smooth scroll to form
  window.scrollTo({ top: saleForm.offsetTop - 100, behavior: 'smooth' });
};

/**
 * Displays a toast notification.
 * @param {string} message - The message to display.
 * @param {string} type - The type of alert (info, success, error).
 */
function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast alert alert-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, 5000);
}