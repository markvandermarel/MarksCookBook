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
  try {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error("The recipe page could not be loaded.");
    const html = await response.text();
    return extractRecipeFromHTML(html, url.href);
  } catch {
    const readerResponse = await fetch(`https://r.jina.ai/http://${url.href}`, { credentials: "omit" });
    if (!readerResponse.ok) throw new Error("The recipe page could not be loaded.");
    const readableText = await readerResponse.text();
    return extractRecipeFromHTML(readableText, url.href);
  }
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

  const fallbackText = html.includes("<") ? htmlToText(html) : html;
  const fallbackLines = cleanMarkdownRecipeText(fallbackText)
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
  const detectedTitle = detectReaderTitle(fallbackLines) || detectHTMLTitle(html);
  const titleOverride = detectedTitle ? cleanTitle(detectedTitle) : "";
  const cardRecipe = parseRecipeCardText(fallbackText, metadata, titleOverride);

  if (hasRecipeCardSignal(fallbackLines) && cardRecipe.ingredients.length >= 3 && cardRecipe.instructions.length >= 2) {
    return cardRecipe;
  }

  const focusedText = focusRecipeText(fallbackText);
  const fallbackRecipe = parseRecipeText(focusedText, "url", metadata);
  fallbackRecipe.title = cleanTitle(fallbackRecipe.title === "Untitled Recipe" ? detectHTMLTitle(html) || fallbackRecipe.title : fallbackRecipe.title);

  return recipeScore(cardRecipe) >= recipeScore(fallbackRecipe) ? cardRecipe : fallbackRecipe;
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

function parseRecipeCardText(text, metadata, titleOverride = "") {
  const cleaned = cleanMarkdownRecipeText(text);
  const lines = cleaned
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  const cardLines = recipeCardLines(lines);
  const title = cleanTitle(titleOverride || detectReaderTitle(lines) || detectTitle(cardLines));
  const originalServings = detectServings(cardLines) || detectServings(lines) || 4;
  const descriptionLines = [];
  const ingredients = [];
  const instructions = [];
  let sawIngredient = false;
  let sawInstruction = false;

  for (const line of cardLines) {
    if (skipCardLine(line, title)) continue;
    if (stopCardLine(line)) break;
    if (sawInstruction && isPostInstructionNoteLine(line)) break;

    if (!sawIngredient && !sawInstruction && isCardDescriptionLine(line)) {
      descriptionLines.push(line);
      continue;
    }

    if (!sawInstruction && looksLikeIngredient(line)) {
      ingredients.push(line);
      sawIngredient = true;
      continue;
    }

    if (looksLikeInstruction(line)) {
      instructions.push(line);
      sawInstruction = true;
      continue;
    }

    if (sawInstruction && line.length > 50 && /^(serve|mix|cook|bake|heat|add|bring|place|drain|garnish|stir|whisk|pour|toss|cut|soak|prep)\b/i.test(line)) {
      instructions.push(line);
    }
  }

  return {
    id: crypto.randomUUID(),
    title,
    description: descriptionLines.join(" "),
    originalServings,
    currentServings: originalServings,
    sourceType: "url",
    ingredients: ingredients.map((line, index) => ({ id: crypto.randomUUID(), order: index, ...parseIngredientLine(line) })),
    instructions: instructions.map((text, index) => ({ id: crypto.randomUUID(), order: index, text })),
    images: [],
    sourceMetadata: metadata,
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
  return /^(?:\d+[.)]\s+)?(preheat|heat|mix|stir|combine|bake|cook|bring|add|whisk|pour|season|serve|place|drain|garnish|toss|cut|soak|prep|while|next|move|crack)\b/i.test(line);
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
  const candidates = [];
  for (const value of values) {
    collectRecipeObjects(value, candidates);
  }
  return candidates.sort((a, b) => recipeObjectScore(b) - recipeObjectScore(a))[0] || null;
}

function collectRecipeObjects(value, candidates) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRecipeObjects(item, candidates));
    return;
  }

  if (!value || typeof value !== "object") return;
  if (isRecipeType(value["@type"])) candidates.push(value);

  for (const child of Object.values(value)) {
    collectRecipeObjects(child, candidates);
  }
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

function recipeCardLines(lines) {
  const recipeIndex = findLastIndex(lines, (line) => /^#{0,3}\s*Recipe$/i.test(line));
  const ingredientsIndex = findLastIndex(lines, (line) => /^#{0,4}\s*Ingredients:?$/i.test(line));
  const start = recipeIndex >= 0 ? recipeIndex + 1 : ingredientsIndex >= 0 ? Math.max(0, ingredientsIndex - 8) : 0;
  const endCandidates = [
    findIndexAfter(lines, start, (line) => /^(#{1,4}\s*)?(Nutrition|Filed Under|Comments|More Recipes|More Main Dishes|Footer)\b/i.test(line)),
    findIndexAfter(lines, start, (line) => /^Tried this recipe\?/i.test(line))
  ].filter((index) => index >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : lines.length;
  return lines.slice(start, end);
}

function focusRecipeText(text) {
  const cleaned = cleanMarkdownRecipeText(text);
  const lines = cleaned
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
  return recipeCardLines(lines).join("\n") || cleaned;
}

function cleanMarkdownRecipeText(text) {
  return cleanText(text)
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, " $1 ")
    .replace(/^[ \t]*[*-][ \t]+/gm, "")
    .replace(/\u25a2/g, " ")
    .replace(/\u00bd/g, "1/2")
    .replace(/\u2153/g, "1/3")
    .replace(/\u2154/g, "2/3")
    .replace(/\u00bc/g, "1/4")
    .replace(/\u00be/g, "3/4")
    .replace(/\u215b/g, "1/8")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\*\*/g, "")
    .replace(/\s+\*\*/g, " ")
    .replace(/[ \t]{2,}/g, " ");
}

function detectReaderTitle(lines) {
  const titleLine = lines.find((line) => /^Title:\s+/i.test(line));
  return titleLine ? titleLine.replace(/^Title:\s+/i, "") : "";
}

function cleanTitle(title) {
  return normalizeLine(title)
    .replace(/^Title:\s+/i, "")
    .replace(/\s+-\s+.*$/i, "")
    .replace(/\s+\|\s+.*$/i, "")
    .replace(/\s+Recipe$/i, "")
    .trim() || "Untitled Recipe";
}

function recipeScore(recipe) {
  return recipe.ingredients.length * 3 + recipe.instructions.length * 4 + (recipe.title && recipe.title !== "Untitled Recipe" ? 4 : 0);
}

function recipeObjectScore(object) {
  const typeValue = Array.isArray(object["@type"]) ? object["@type"].join(" ") : String(object["@type"] || "");
  return (
    (/\bRecipe\b/i.test(typeValue) ? 20 : 0) +
    (object.recipeIngredient ? 30 : 0) +
    (object.recipeInstructions ? 30 : 0) +
    (object.name ? 5 : 0)
  );
}

function hasRecipeCardSignal(lines) {
  return lines.some((line) => /^#{0,4}\s*Recipe$/i.test(line)) || lines.some((line) => /^#{0,4}\s*Ingredients:?$/i.test(line));
}

function isCardDescriptionLine(line) {
  return (
    line.length > 35 &&
    !/^((Prep|Cook|Total) Time|Course|Cuisine|Servings|Calories|Author|Equipment|Recipe Video|Print Recipe|Pin Recipe)/i.test(line) &&
    !looksLikeIngredient(line) &&
    !looksLikeInstruction(line)
  );
}

function skipCardLine(line, title) {
  return (
    line.toLowerCase() === title.toLowerCase() ||
    /^#{1,4}\s*/.test(line) ||
    /^(Please click|Print Recipe|Pin Recipe|Save Saved|Prep Time|Cook Time|Total Time|Course|Cuisine|Servings:?(?:\s|$)|Calories|Author|Equipment|Recipe Video|Recipe Rating|Want to Save)/i.test(line) ||
    /^\d+(\.\d+)?\s+from\s+\d+\s+votes/i.test(line)
  );
}

function stopCardLine(line) {
  return /^(Notes|Nutrition|Calories:|Carbohydrates:|Tried this recipe\?|Filed Under|Comments|More Main Dishes|Footer)\b/i.test(line);
}

function isPostInstructionNoteLine(line) {
  return /^(Our favorite|The second choice|Homemade\b|Notes:?|Substitutions:?|Tips:?|Storage:?|Nutrition)\b/i.test(line);
}

function findLastIndex(values, predicate) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index], index)) return index;
  }
  return -1;
}

function findIndexAfter(values, start, predicate) {
  for (let index = start; index < values.length; index += 1) {
    if (predicate(values[index], index)) return index;
  }
  return -1;
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
