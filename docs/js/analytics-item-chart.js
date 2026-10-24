import { getPiecesPerCrate, isCrateItem, parseNumericValue } from "./quantity.js";

function formatAmount(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function saleDate(sale) {
  const value = sale.createdAt;
  const parsed = value && typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isHalfCrateSale(sale, unit) {
  return sale.crateSize === "half" || unit.startsWith("half crate");
}

function getCrateSalePieces(sale, item, unit, quantity) {
  const piecesPerCrate = Number(sale.piecesPerCrate) ||
    getPiecesPerCrate(item);
  if (unit.startsWith("piece")) return quantity;
  return quantity * (isHalfCrateSale(sale, unit) ? piecesPerCrate / 2 : piecesPerCrate);
}

function getCrateSaleDescription(totals) {
  const parts = [];
  if (totals.crates) parts.push(`${formatAmount(totals.crates)} full ${totals.crates === 1 ? "crate" : "crates"}`);
  if (totals.halfCrates) parts.push(`${formatAmount(totals.halfCrates)} half ${totals.halfCrates === 1 ? "crate" : "crates"}`);
  if (totals.loosePieces) {
    parts.push(`${formatAmount(totals.loosePieces)} ${totals.loosePieces === 1 ? "piece" : "pieces"}`);
  }
  return parts.join(", ") || "No units sold";
}

function aggregateCrateSales(sales, itemsById, start, end) {
  const totals = new Map();
  sales.forEach(sale => {
    const item = itemsById.get(sale.itemId) || { name: sale.itemName || "Item" };
    if (!isCrateItem(item.name)) return;
    const occurredAt = saleDate(sale);
    if (!occurredAt || occurredAt < start || occurredAt >= end) return;
    const quantity = parseNumericValue(sale.quantity);
    if (quantity === null || quantity <= 0) return;

    const unit = String(sale.quantityUnit || "CRATES").trim().toLowerCase();
    const existing = totals.get(sale.itemId || item.name) || {
      name: item.name,
      pieces: 0,
      crates: 0,
      halfCrates: 0,
      loosePieces: 0
    };
    existing.pieces += getCrateSalePieces(sale, item, unit, quantity);
    if (unit.startsWith("piece")) {
      existing.loosePieces += quantity;
    } else if (isHalfCrateSale(sale, unit)) {
      existing.halfCrates += quantity;
    } else {
      existing.crates += quantity;
    }
    totals.set(sale.itemId || item.name, existing);
  });
  return [...totals.values()]
    .map(item => ({
      name: item.name,
      amount: item.pieces,
      unit: "pcs equivalent",
      detail: getCrateSaleDescription(item)
    }))
    .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));
}

function aggregateOtherSales(sales, itemsById, start, end) {
  const totals = new Map();
  sales.forEach(sale => {
    const item = itemsById.get(sale.itemId) || { name: sale.itemName || "Item" };
    if (isCrateItem(item.name)) return;
    const occurredAt = saleDate(sale);
    if (!occurredAt || occurredAt < start || occurredAt >= end) return;
    const quantity = parseNumericValue(sale.quantity);
    if (quantity === null || quantity <= 0) return;

    const unit = String(sale.quantityUnit || "").trim().toUpperCase() || "units";
    const key = `${sale.itemId || item.name}|${unit}`;
    const existing = totals.get(key) || { name: item.name, amount: 0, unit, detail: "" };
    existing.amount += quantity;
    totals.set(key, existing);
  });
  return [...totals.values()]
    .map(item => ({ ...item, detail: "Quantity sold in the recorded unit" }))
    .reduce((groups, item) => {
      const group = groups.get(item.unit) || [];
      group.push(item);
      groups.set(item.unit, group);
      return groups;
    }, new Map());
}

export function getAnalyticsItemSalesRanking({
  sales,
  items,
  isCrateGroup,
  start,
  endExclusive
}) {
  const itemsById = new Map(items.map(item => [item.id, item]));
  const startTime = start.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endExclusive.getTime()) ||
      start >= endExclusive) return [];

  if (isCrateGroup) {
    const itemsInGroup = aggregateCrateSales(sales, itemsById, start, endExclusive);
    return itemsInGroup.length
      ? [{
        unit: "piece equivalents",
        items: itemsInGroup.sort((left, right) =>
          right.amount - left.amount || left.name.localeCompare(right.name))
      }]
      : [];
  }

  return [...aggregateOtherSales(sales, itemsById, start, endExclusive).entries()]
    .map(([unit, unitItems]) => ({
      unit,
      items: unitItems.sort((left, right) =>
        right.amount - left.amount || left.name.localeCompare(right.name))
    }))
    .sort((left, right) => left.unit.localeCompare(right.unit));
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function splitLabel(label, maxLength = 28) {
  const words = label.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach(word => {
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function renderUnitGraph(container, { unit, items }, graphIndex) {
  const chartItems = items.slice(0, 12);
  const labelWidth = 260;
  const plotWidth = 650;
  const valueWidth = 120;
  const top = 32;
  const rowHeight = 48;
  const axisHeight = 42;
  const width = labelWidth + plotWidth + valueWidth;
  const plotBottom = top + chartItems.length * rowHeight;
  const height = plotBottom + axisHeight + 8;
  const maxValue = Math.max(...chartItems.map(item => item.amount), 1);
  const scaleMagnitude = 10 ** Math.floor(Math.log10(maxValue));
  const scaleRatio = maxValue / scaleMagnitude;
  const scaleStep = scaleRatio <= 1 ? 1 : scaleRatio <= 2 ? 2 : scaleRatio <= 5 ? 5 : 10;
  const roundedMax = scaleStep * scaleMagnitude *
    Math.ceil(maxValue / (scaleStep * scaleMagnitude));
  const svg = createSvgElement("svg", {
    class: "analytics-sales-graph",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-labelledby": `sales-graph-title-${graphIndex} sales-graph-desc-${graphIndex}`
  });
  const title = createSvgElement("title", { id: `sales-graph-title-${graphIndex}` });
  title.textContent = `Item sales by ${unit}`;
  const description = createSvgElement("desc", { id: `sales-graph-desc-${graphIndex}` });
  description.textContent = `Horizontal bar graph ranking items by quantity sold in ${unit}.`;
  svg.append(title, description);

  for (let tick = 0; tick <= 5; tick += 1) {
    const x = labelWidth + plotWidth * tick / 5;
    const line = createSvgElement("line", {
      x1: x,
      y1: top - 8,
      x2: x,
      y2: plotBottom,
      class: "analytics-graph-gridline"
    });
    const tickLabel = createSvgElement("text", {
      x,
      y: plotBottom + 18,
      "text-anchor": "middle",
      class: "analytics-graph-tick"
    });
    tickLabel.textContent = formatAmount(roundedMax * tick / 5);
    svg.append(line, tickLabel);
  }

  chartItems.forEach((item, index) => {
    const rowY = top + index * rowHeight;
    const label = createSvgElement("text", {
      x: labelWidth - 14,
      y: rowY + 5,
      "text-anchor": "end",
      class: "analytics-graph-item-label"
    });
    const fullLabel = createSvgElement("title");
    fullLabel.textContent = item.name;
    label.append(fullLabel);
    splitLabel(item.name).forEach((line, lineIndex) => {
      const labelLine = createSvgElement("tspan", {
        x: labelWidth - 14,
        dy: lineIndex === 0 ? 0 : 14
      });
      labelLine.textContent = line;
      label.append(labelLine);
    });
    svg.append(label);

    const bar = createSvgElement("rect", {
      x: labelWidth,
      y: rowY - 10,
      width: Math.max(1, plotWidth * item.amount / roundedMax),
      height: 22,
      rx: 4,
      class: index === 0 ? "analytics-graph-bar analytics-graph-bar-top" : "analytics-graph-bar"
    });
    const tooltip = createSvgElement("title");
    tooltip.textContent = `${item.name}: ${formatAmount(item.amount)} ${unit}${item.detail ? ` (${item.detail})` : ""}`;
    bar.append(tooltip);
    svg.append(bar);

    const value = createSvgElement("text", {
      x: labelWidth + plotWidth + 10,
      y: rowY + 5,
      class: "analytics-graph-value"
    });
    value.textContent = formatAmount(item.amount);
    svg.append(value);
  });

  const axisLabel = createSvgElement("text", {
    x: labelWidth + plotWidth / 2,
    y: height - 10,
    "text-anchor": "middle",
    class: "analytics-graph-axis-label"
  });
  axisLabel.textContent = `UNITS SOLD (${unit.toUpperCase()})`;
  svg.append(axisLabel);

  const section = document.createElement("section");
  section.className = "analytics-graph-unit-section";
  const heading = document.createElement("h2");
  heading.textContent = `Sales by ${unit}`;
  const detail = document.createElement("p");
  detail.className = "analytics-graph-unit-hint";
  detail.textContent = items.length > chartItems.length
    ? `Showing top ${chartItems.length} of ${items.length} items.`
    : `Showing ${items.length} ${items.length === 1 ? "item" : "items"}, ranked highest to lowest.`;
  section.append(heading, detail, svg);

  if (unit === "piece equivalents") {
    const breakdown = document.createElement("div");
    breakdown.className = "analytics-graph-breakdown";
    const breakdownHeading = document.createElement("h3");
    breakdownHeading.textContent = "Crate and piece quantities sold";
    const list = document.createElement("ul");
    chartItems.forEach(item => {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = item.name;
      const quantities = document.createElement("strong");
      quantities.textContent = item.detail;
      row.append(name, quantities);
      list.append(row);
    });
    breakdown.append(breakdownHeading, list);
    section.append(breakdown);
  }

  container.append(section);
}

export function renderAnalyticsItemSalesGraphs(container, rankings) {
  container.replaceChildren();
  if (!rankings.length) {
    const message = document.createElement("p");
    message.className = "analytics-graphs-empty";
    message.textContent = "No item sales were recorded in this date range.";
    container.append(message);
    return;
  }
  rankings.forEach((ranking, index) => renderUnitGraph(container, ranking, index));
}
