export function parseQuantity(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? { amount: value, unit: "" } : null;
  }

  if (typeof value !== "string") return null;

  const match = value.trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*(.*?)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  return Number.isFinite(amount) ? { amount, unit: match[2].trim() } : null;
}

export function formatQuantity(amount, unit = "") {
  return unit ? `${amount} ${unit}` : amount;
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
