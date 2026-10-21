export function parseQuantity(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? { amount: value, unit: "" } : null;
  }

  if (typeof value !== "string") return null;

  const match = value.trim().match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([^,]*)$/);
  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? { amount, unit: match[2].trim() } : null;
}

export function formatQuantity(amount, unit = "") {
  return unit ? `${amount} ${unit}` : amount;
}

export function isPetrolName(name) {
  return /\bpetrol\b/i.test(name || "");
}

export function isLiterUnit(unit) {
  return ["l", "liter", "liters", "litre", "litres"].includes(String(unit).trim().toLowerCase());
}

export function appendQuantityUnit(input, unit, enabled) {
  if (!enabled || !input.value.trim()) return;

  const rawValue = input.value;
  const numericValue = rawValue.replace(new RegExp(`\\s+${unit}$`, "i"), "");
  if (!/^(?:\d+(?:\.\d*)?|\.\d*)$/.test(numericValue) || !numericValue) return;

  const caret = input.selectionStart ?? numericValue.length;
  input.value = `${numericValue} ${unit}`;
  input.setSelectionRange(Math.min(caret, numericValue.length), Math.min(caret, numericValue.length));
}

export function uppercaseInput(input) {
  const caret = input.selectionStart;
  const uppercaseValue = input.value.toUpperCase();
  if (uppercaseValue === input.value) return;

  input.value = uppercaseValue;
  if (caret !== null) input.setSelectionRange(caret, caret);
}

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  return number.toLocaleString("en-KE", {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

export function formatDisplayQuantity(value) {
  const quantity = parseQuantity(value);
  if (!quantity) return String(value);

  const amount = formatNumber(quantity.amount);
  return quantity.unit ? `${amount} ${quantity.unit}` : amount;
}

export function escapeQuantity(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

export function adjustQuantity(value, adjustment) {
  const quantity = parseQuantity(value);
  if (!quantity) throw new Error("Invalid inventory quantity.");

  return formatQuantity(quantity.amount + adjustment, quantity.unit);
}

export function calculatePetrolDip(openingDip, fuelReceived, pumpSales, actualClosingDip) {
  const values = [openingDip, fuelReceived, pumpSales, actualClosingDip].map(Number);
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;

  const [opening, received, sales, actualClosing] = values;
  const totalAvailable = opening + received;
  const expectedClosing = totalAvailable - sales;

  return {
    openingDipLiters: opening,
    fuelReceivedLiters: received,
    pumpSalesLiters: sales,
    totalAvailableLiters: totalAvailable,
    expectedClosingDipLiters: expectedClosing,
    actualClosingDipLiters: actualClosing,
    varianceLiters: actualClosing - expectedClosing
  };
}
