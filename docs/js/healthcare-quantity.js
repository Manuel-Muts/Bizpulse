export function isHealthcareMedicine(item) {
  return item?.healthcare?.kind === "medicine";
}

export function validateMedicineConfig(config) {
  const units = [
    ["stock unit", config.stockUnit],
    ["purchase unit", config.purchaseUnit],
    ["dispensing unit", config.dispenseUnit]
  ];
  for (const [label, value] of units) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 32) {
      throw new Error(`Enter a valid medicine ${label}.`);
    }
  }
  for (const [label, value] of [
    ["purchase conversion", config.purchaseToBase],
    ["dispensing conversion", config.dispenseToBase]
  ]) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
      throw new Error(`The medicine ${label} must be greater than zero.`);
    }
  }
  return {
    kind: "medicine",
    stockUnit: config.stockUnit.trim(),
    purchaseUnit: config.purchaseUnit.trim(),
    purchaseToBase: Number(config.purchaseToBase),
    dispenseUnit: config.dispenseUnit.trim(),
    dispenseToBase: Number(config.dispenseToBase)
  };
}

export function toMedicineBaseQuantity(config, quantity, unit = config.purchaseUnit) {
  const amount = Number(quantity);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a medicine quantity greater than zero.");
  }
  if (String(unit).trim().toLowerCase() !== config.purchaseUnit.toLowerCase()) {
    throw new Error(`Medicine stock must be received in ${config.purchaseUnit}.`);
  }
  return roundMedicineQuantity(amount * config.purchaseToBase);
}

export function toMedicineDispenseBaseQuantity(config, quantity, unit = config.dispenseUnit) {
  const amount = Number(quantity);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a dispensing quantity greater than zero.");
  }
  if (String(unit).trim().toLowerCase() !== config.dispenseUnit.toLowerCase()) {
    throw new Error(`This medicine must be dispensed in ${config.dispenseUnit}.`);
  }
  return roundMedicineQuantity(amount * config.dispenseToBase);
}

export function roundMedicineQuantity(value) {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
