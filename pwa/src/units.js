export const unitSystems = ["original", "us", "british", "metric"];

const aliases = new Map([
  ["cup", "cup"], ["cups", "cup"], ["c", "cup"],
  ["teaspoon", "teaspoon"], ["teaspoons", "teaspoon"], ["tsp", "teaspoon"],
  ["tablespoon", "tablespoon"], ["tablespoons", "tablespoon"], ["tbsp", "tablespoon"], ["tbs", "tablespoon"],
  ["fluid ounce", "fluidOunce"], ["fluid ounces", "fluidOunce"], ["fl oz", "fluidOunce"], ["floz", "fluidOunce"],
  ["ounce", "ounce"], ["ounces", "ounce"], ["oz", "ounce"],
  ["pound", "pound"], ["pounds", "pound"], ["lb", "pound"], ["lbs", "pound"],
  ["gram", "gram"], ["grams", "gram"], ["g", "gram"],
  ["kilogram", "kilogram"], ["kilograms", "kilogram"], ["kg", "kilogram"],
  ["milliliter", "milliliter"], ["milliliters", "milliliter"], ["millilitre", "milliliter"], ["millilitres", "milliliter"], ["ml", "milliliter"],
  ["liter", "liter"], ["liters", "liter"], ["litre", "liter"], ["litres", "liter"], ["l", "liter"],
  ["celsius", "celsius"], ["fahrenheit", "fahrenheit"], ["f", "fahrenheit"],
  ["piece", "piece"], ["pieces", "piece"], ["pc", "piece"], ["pcs", "piece"]
]);

const unitLabels = {
  cup: "cup",
  teaspoon: "tsp",
  tablespoon: "tbsp",
  fluidOunce: "fl oz",
  ounce: "oz",
  pound: "lb",
  gram: "g",
  kilogram: "kg",
  milliliter: "ml",
  liter: "l",
  celsius: "C",
  fahrenheit: "F",
  piece: "piece"
};

const dimensions = {
  cup: "volume",
  teaspoon: "volume",
  tablespoon: "volume",
  fluidOunce: "volume",
  milliliter: "volume",
  liter: "volume",
  ounce: "mass",
  pound: "mass",
  gram: "mass",
  kilogram: "mass",
  celsius: "temperature",
  fahrenheit: "temperature",
  piece: "count"
};

export function parseUnit(token) {
  return aliases.get(String(token).toLowerCase().replace(/[.:,;()[\]]/g, "").trim()) || null;
}

export function unitLabel(unit) {
  return unitLabels[unit] || unit || "";
}

export function scaleAmount(amount, originalServings, targetServings) {
  if (!Number.isFinite(amount) || !Number.isFinite(originalServings) || originalServings <= 0) return amount;
  return (amount * targetServings) / originalServings;
}

export function convertAmount(amount, sourceUnit, targetSystem) {
  if (!sourceUnit || targetSystem === "original") {
    return { amount, unit: sourceUnit, warning: "" };
  }

  const targetUnit = preferredUnit(sourceUnit, targetSystem);
  if (targetUnit === sourceUnit) return { amount, unit: sourceUnit, warning: "" };
  if (dimensions[targetUnit] !== dimensions[sourceUnit]) {
    return { amount, unit: sourceUnit, warning: "Density-specific conversion unavailable." };
  }

  switch (dimensions[sourceUnit]) {
    case "mass": {
      const grams = amount * gramsPerUnit(sourceUnit);
      return { amount: grams / gramsPerUnit(targetUnit), unit: targetUnit, warning: "" };
    }
    case "volume": {
      const milliliters = amount * millilitersPerUnit(sourceUnit, "us");
      return {
        amount: milliliters / millilitersPerUnit(targetUnit, targetSystem),
        unit: targetUnit,
        warning: sourceUnit === "cup" && targetSystem !== "us" ? "Cup conversion is approximate." : ""
      };
    }
    case "temperature":
      return { amount: convertTemperature(amount, sourceUnit, targetUnit), unit: targetUnit, warning: "" };
    default:
      return { amount, unit: sourceUnit, warning: "" };
  }
}

export function formatIngredient(ingredient, recipe, unitSystem) {
  if (!Number.isFinite(ingredient.amount)) return ingredient.originalText;

  const scaled = scaleAmount(ingredient.amount, recipe.originalServings, recipe.currentServings);
  const converted = convertAmount(scaled, ingredient.unit, unitSystem);
  const amount = formatFraction(converted.amount);
  const unit = converted.unit && converted.unit !== "piece" ? `${unitLabel(converted.unit)} ` : "";
  const note = ingredient.preparationNote ? `, ${ingredient.preparationNote}` : "";
  const warning = converted.warning ? ` (${converted.warning})` : "";
  return `${amount} ${unit}${ingredient.name}${note}${warning}`.replace(/\s+/g, " ").trim();
}

export function formatFraction(value, maxDenominator = 16) {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const fractional = absolute - whole;

  if (fractional < 0.0001) return `${sign}${whole}`;

  let best = { numerator: 1, denominator: 1, error: Number.MAX_VALUE };
  for (let denominator = 2; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.round(fractional * denominator);
    const error = Math.abs(fractional - numerator / denominator);
    if (error < best.error) best = { numerator, denominator, error };
  }

  if (best.numerator === best.denominator) return `${sign}${whole + 1}`;

  const divisor = gcd(best.numerator, best.denominator);
  const numerator = best.numerator / divisor;
  const denominator = best.denominator / divisor;
  return whole === 0 ? `${sign}${numerator}/${denominator}` : `${sign}${whole} ${numerator}/${denominator}`;
}

function preferredUnit(unit, system) {
  const dimension = dimensions[unit];
  if (system === "metric") {
    if (dimension === "mass") return unit === "pound" || unit === "kilogram" ? "kilogram" : "gram";
    if (dimension === "volume") return unit === "liter" ? "liter" : "milliliter";
    if (dimension === "temperature") return "celsius";
  }

  if (system === "us" || system === "british") {
    if (dimension === "mass") return unit === "kilogram" || unit === "pound" ? "pound" : "ounce";
    if (dimension === "volume") return unit === "liter" || unit === "milliliter" ? "cup" : unit;
    if (dimension === "temperature") return "fahrenheit";
  }

  return unit;
}

function gramsPerUnit(unit) {
  return {
    gram: 1,
    kilogram: 1000,
    ounce: 28.349523125,
    pound: 453.59237
  }[unit] || 1;
}

function millilitersPerUnit(unit, system) {
  return {
    milliliter: 1,
    liter: 1000,
    teaspoon: system === "british" ? 5.91939 : 4.92892159375,
    tablespoon: system === "british" ? 17.7582 : 14.78676478125,
    fluidOunce: system === "british" ? 28.4130625 : 29.5735295625,
    cup: system === "british" ? 284.130625 : 236.5882365
  }[unit] || 1;
}

function convertTemperature(amount, sourceUnit, targetUnit) {
  if (sourceUnit === targetUnit) return amount;
  if (sourceUnit === "fahrenheit" && targetUnit === "celsius") return ((amount - 32) * 5) / 9;
  if (sourceUnit === "celsius" && targetUnit === "fahrenheit") return (amount * 9) / 5 + 32;
  return amount;
}

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return Math.max(a, 1);
}
