import { parseUnit } from "./units.js";

const ingredientHeadings = new Set(["ingredients", "ingredient", "you need"]);
const instructionHeadings = new Set(["instructions", "directions", "method", "preparation", "steps"]);
const preparationWords = [
  "finely chopped",
  "finely diced",
  "room temperature",
  "chopped",
  "diced",
  "minced",
  "sliced",
  "grated",
  "melted",
  "softened",
  "peeled",
  "crushed"
];

export function parseRecipeText(text, sourceType = "manual", metadata = {}) {
  const lines = cleanText(text)
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  if (!lines.length) return emptyRecipe(sourceType, metadata);

  const sections = splitSections(lines);
  const title = detectTitle(lines);
  const originalServings = detectServings(lines) || 4;
  const description = sections.description
    .filter((line) => line.toLowerCase() !== title.toLowerCase())
    .join(" ");

  return {
    id: crypto.randomUUID(),
    title,
    description,
    originalServings,
    currentServings: originalServings,
    sourceType,
    ingredients: sections.ingredients.map((line, index) => ({ id: crypto.randomUUID(), order: index, ...parseIngredientLine(line) })),
    instructions: splitInstructions(sections.instructions.join("\n")).map((text, index) => ({
      id: crypto.randomUUID(),
      order: index,
      text
    })),
    images: [],
    sourceMetadata: metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function parseIngredientLine(line) {
  const originalText = normalizeLine(line);
  const tokens = originalText.split(" ").filter(Boolean);
  const quantity = parseLeadingQuantity(tokens);
  let consumed = quantity.consumed;
  let unit = null;

  if (consumed < tokens.length) {
    const oneToken = tokens[consumed];
    const twoToken = consumed + 1 < tokens.length ? `${tokens[consumed]} ${tokens[consumed + 1]}` : "";
    const twoUnit = parseUnit(twoToken);
    const oneUnit = parseUnit(oneToken);

    if (twoUnit) {
      unit = twoUnit;
      consumed += 2;
    } else if (oneUnit) {
      unit = oneUnit;
      consumed += 1;
    }
  }

  const remaining = tokens.slice(consumed).join(" ");
  const preparationNote = detectPreparationNote(remaining);
  const name = cleanIngredientName(remaining, preparationNote) || originalText;

  return {
    amount: quantity.value,
    unit,
    name,
    preparationNote,
    originalText
  };
}

export function splitInstructions(text) {
  const normalized = normalizeLine(text.replace(/\r/g, "\n"));
  if (!normalized) return [];

  const numbered = [...normalized.matchAll(/(?:^|\s)(?:step\s*)?\d+[.)]\s+(.*?)(?=(?:\s+(?:step\s*)?\d+[.)]\s+)|$)/gis)]
    .map((match) => normalizeLine(match[1]))
    .filter(Boolean);

  if (numbered.length > 1) return numbered;

  const lineSteps = text
    .split(/\n+/)
    .map((line) => normalizeLine(line.replace(/^(?:step\s*)?\d+[.)]\s*/i, "")))
    .filter(Boolean);

  if (lineSteps.length > 1) return lineSteps;

  const sentenceSteps = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(normalizeLine)
    .filter(Boolean);

  return sentenceSteps.length ? sentenceSteps : [normalized];
}

export async function importRecipeFromURL(urlText) {
  const url = new URL(urlText);
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error("The recipe page could not be loaded.");
  const html = await response.text();
  return extractRecipeFromHTML(html, url.href);
}

export function extractRecipeFromHTML(html, sourceURL = "") {
  const metadata = {
    sourceURL,
    sourceName: safeHost(sourceURL),
    author: "",
    originalImageURL: ""
  };

  const recipeObject = findRecipeObject(readJSONLDScripts(html));
  if (recipeObject) {
    return recipeFromStructuredData(recipeObject, metadata);
  }

  const fallbackText = htmlToText(html);
  const recipe = parseRecipeText(fallbackText, "url", metadata);
  recipe.title = recipe.title === "Untitled Recipe" ? detectHTMLTitle(html) || recipe.title : recipe.title;
  return recipe;
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|div|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}

function recipeFromStructuredData(object, metadata) {
  const title = stringValue(object.name) || "Untitled Recipe";
  const imageURL = imageURLString(object.image);
  const sourceMetadata = {
    ...metadata,
    author: authorName(object.author),
    originalImageURL: imageURL || metadata.originalImageURL
  };
  const originalServings = servingValue(object.recipeYield) || 4;
  const ingredients = arrayValue(object.recipeIngredient)
    .map(stringValue)
    .filter(Boolean)
    .map((line, index) => ({ id: crypto.randomUUID(), order: index, ...parseIngredientLine(line) }));
  const instructions = instructionValues(object.recipeInstructions).map((text, index) => ({
    id: crypto.randomUUID(),
    order: index,
    text
  }));

  return {
    id: crypto.randomUUID(),
    title,
    description: stringValue(object.description) || "",
    originalServings,
    currentServings: originalServings,
    sourceType: "url",
    ingredients,
    instructions,
    images: imageURL
      ? [
          {
            id: crypto.randomUUID(),
            type: "website",
            remoteURL: imageURL,
            blobId: "",
            oneDrivePath: "",
            syncStatus: "localOnly"
          }
        ]
      : [],
    sourceMetadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function splitSections(lines) {
  let section = "description";
  let sawIngredientHeading = false;
  let sawInstructionHeading = false;
  const sections = { description: [], ingredients: [], instructions: [] };

  for (const line of lines) {
    const key = line.toLowerCase().replace(/:$/, "");

    if (ingredientHeadings.has(key)) {
      section = "ingredients";
      sawIngredientHeading = true;
      continue;
    }

    if (instructionHeadings.has(key)) {
      section = "instructions";
      sawInstructionHeading = true;
      continue;
    }

    if (!sawIngredientHeading && looksLikeIngredient(line)) section = "ingredients";
    if (!sawInstructionHeading && section === "ingredients" && looksLikeInstruction(line)) section = "instructions";

    sections[section].push(line);
  }

  if (!sections.instructions.length && sections.ingredients.length) {
    const splitIndex = sections.ingredients.findIndex(looksLikeInstruction);
    if (splitIndex >= 0) {
      sections.instructions = sections.ingredients.slice(splitIndex);
      sections.ingredients = sections.ingredients.slice(0, splitIndex);
    }
  }

  return sections;
}

function detectTitle(lines) {
  return (
    lines.find((line) => {
      const key = line.toLowerCase().replace(/:$/, "");
      return !ingredientHeadings.has(key) && !instructionHeadings.has(key) && !/^serves?\b/i.test(line);
    }) || "Untitled Recipe"
  );
}

function detectServings(lines) {
  const text = lines.join(" ");
  const patterns = [
    /\bserves\s*:?\s*(\d+(?:\.\d+)?)/i,
    /\byields?\s*:?\s*(\d+(?:\.\d+)?)/i,
    /\bmakes\s*:?\s*(\d+(?:\.\d+)?)/i,
    /\bportions?\s*:?\s*(\d+(?:\.\d+)?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

function looksLikeIngredient(line) {
  const tokens = normalizeLine(line).split(" ").filter(Boolean);
  if (!tokens.length) return false;
  if (parseLeadingQuantity(tokens).value !== null) return true;
  return Boolean(parseUnit(tokens[0]));
}

function looksLikeInstruction(line) {
  return /^(?:\d+[.)]\s+)?(preheat|heat|mix|stir|combine|bake|cook|bring|add|whisk|pour|season)\b/i.test(line);
}

function parseLeadingQuantity(tokens) {
  if (!tokens.length) return { value: null, consumed: 0 };
  const first = parseQuantityToken(tokens[0]);
  if (first === null) return { value: null, consumed: 0 };
  const second = tokens.length > 1 ? parseFraction(tokens[1]) : null;
  if (second !== null && !tokens[0].includes("/")) return { value: first + second, consumed: 2 };
  return { value: first, consumed: 1 };
}

function parseQuantityToken(token) {
  const cleaned = String(token).toLowerCase().replace(/[~+]/g, "").replace(",", ".");
  const unicode = unicodeFraction(cleaned);
  if (unicode !== null) return unicode;
  if (cleaned.includes("-")) return parseQuantityToken(cleaned.split("-")[0]);
  const fraction = parseFraction(cleaned);
  if (fraction !== null) return fraction;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseFraction(token) {
  const match = String(token).match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const denominator = Number(match[2]);
  if (!denominator) return null;
  return Number(match[1]) / denominator;
}

function unicodeFraction(token) {
  return (
    {
      "½": 0.5,
      "⅓": 1 / 3,
      "⅔": 2 / 3,
      "¼": 0.25,
      "¾": 0.75,
      "⅛": 0.125
    }[token] ?? null
  );
}

function detectPreparationNote(text) {
  const lower = text.toLowerCase();
  return preparationWords.find((word) => lower.includes(word)) || "";
}

function cleanIngredientName(text, note) {
  let cleaned = text;
  if (note) cleaned = cleaned.replace(new RegExp(escapeRegExp(note), "i"), "");
  return cleaned.replace(/\([^)]*\)/g, "").replace(/^[\s,.-]+|[\s,.-]+$/g, "");
}

function readJSONLDScripts(html) {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decodeEntities(match[1]))
    .map((json) => {
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function findRecipeObject(values) {
  for (const value of values) {
    const found = walkRecipeObject(value);
    if (found) return found;
  }
  return null;
}

function walkRecipeObject(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkRecipeObject(item);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  if (isRecipeType(value["@type"])) return value;

  for (const child of Object.values(value)) {
    const found = walkRecipeObject(child);
    if (found) return found;
  }

  return null;
}

function isRecipeType(value) {
  if (Array.isArray(value)) return value.some(isRecipeType);
  return typeof value === "string" && value.toLowerCase().includes("recipe");
}

function instructionValues(value) {
  if (!value) return [];
  if (typeof value === "string") return splitInstructions(value);
  if (Array.isArray(value)) return value.flatMap(instructionValues).map(normalizeLine).filter(Boolean);
  if (typeof value === "object") {
    if (value.text) return [normalizeLine(String(value.text))];
    if (value.itemListElement) return instructionValues(value.itemListElement);
  }
  return [];
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function stringValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return normalizeLine(decodeEntities(value));
  if (typeof value === "number") return String(value);
  return "";
}

function servingValue(value) {
  const valueText = arrayValue(value).map(stringValue).join(" ");
  const match = valueText.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function imageURLString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(imageURLString).find(Boolean) || "";
  if (typeof value === "object") return stringValue(value.url) || stringValue(value.contentUrl);
  return "";
}

function authorName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(authorName).find(Boolean) || "";
  if (typeof value === "object") return stringValue(value.name);
  return "";
}

function detectHTMLTitle(html) {
  return normalizeLine(decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
}

function cleanText(text) {
  return decodeEntities(String(text)).replace(/\r/g, "\n").replace(/\t/g, " ");
}

function normalizeLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function emptyRecipe(sourceType, metadata) {
  return {
    id: crypto.randomUUID(),
    title: "Untitled Recipe",
    description: "",
    originalServings: 4,
    currentServings: 4,
    sourceType,
    ingredients: [],
    instructions: [],
    images: [],
    sourceMetadata: metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
