import { roundMedicineQuantity } from "./healthcare-quantity.js";

const QUANTITY_EPSILON = 1e-9;

export function allocateMedicineBatches(batches, requestedBaseQuantity, asOfDate = new Date()) {
  const requested = roundMedicineQuantity(Number(requestedBaseQuantity));
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error("The medicine stock quantity to dispense is invalid.");
  }
  const asOf = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  if (!Number.isFinite(asOf.getTime())) throw new Error("The stock date is invalid.");
  const asOfKey = dateKey(asOf);
  for (const batch of batches) {
    if (!batch.id || typeof batch.lotNumber !== "string" || !batch.lotNumber.trim()) {
      throw new Error("A medicine batch is missing its traceable lot number.");
    }
    if (!isDateKey(batch.expiryDate)) {
      throw new Error(`Medicine batch ${batch.lotNumber} has a missing or invalid expiry date.`);
    }
    const remainingQuantity = Number(batch.remainingQuantity);
    const unitCost = Number(batch.unitCost);
    if (!Number.isFinite(remainingQuantity) || remainingQuantity < 0 ||
        !Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error(`Medicine batch ${batch.lotNumber} has an invalid stock balance or cost.`);
    }
  }
  const eligible = batches
    .map(batch => ({
      ...batch,
      remainingQuantity: Number(batch.remainingQuantity),
      unitCost: Number(batch.unitCost)
    }))
    .filter(batch => {
      if (batch.remainingQuantity <= 0) return false;
      return batch.expiryDate >= asOfKey;
    })
    .sort((left, right) => {
      const leftExpiry = left.expiryDate || "9999-12-31";
      const rightExpiry = right.expiryDate || "9999-12-31";
      return leftExpiry.localeCompare(rightExpiry) ||
        String(left.receivedDate || "").localeCompare(String(right.receivedDate || "")) ||
        String(left.id).localeCompare(String(right.id));
    });

  let remaining = requested;
  const allocations = [];
  for (const batch of eligible) {
    if (remaining <= QUANTITY_EPSILON) break;
    const quantity = roundMedicineQuantity(Math.min(batch.remainingQuantity, remaining));
    allocations.push({
      batchId: batch.id,
      quantity,
      unitCost: batch.unitCost,
      cost: quantity * batch.unitCost
    });
    remaining = roundMedicineQuantity(remaining - quantity);
  }
  if (remaining > QUANTITY_EPSILON) {
    throw new Error(`Insufficient unexpired batch stock. Short by ${remaining}.`);
  }
  return allocations;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) && dateKey(parsed) === value;
}
