const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const OCR_LANGUAGES = "eng+deu+nld";

let tesseractPromise;

export async function recognizeRecipeTextFromImage(imageBlob, onProgress = () => {}) {
  const Tesseract = await loadTesseract();
  onProgress("Preparing photo for OCR...");
  const ocrImage = await prepareImageForOCR(imageBlob);
  onProgress("Reading English, German, and Dutch text from the photo...");

  const result = await Tesseract.recognize(ocrImage, OCR_LANGUAGES, {
    preserve_interword_spaces: "1",
    logger(message) {
      if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
        onProgress(`Reading text from the photo: ${Math.round(message.progress * 100)}%`);
      }
    }
  });

  const text = formatRecipeTextFromOCRData(result?.data) || result?.data?.text?.trim() || "";
  if (!text) {
    throw new Error("No recipe text could be read from the photo. Try better lighting or paste text manually.");
  }

  onProgress("Photo text extracted.");
  return text;
}

export function formatRecipeTextFromOCRData(data) {
  const lines = collectOCRLines(data);
  if (lines.length < 4) return "";

  const medianHeight = median(lines.map((line) => line.height).filter((height) => height > 0)) || 12;
  const titleLines = inferTitleLines(lines, medianHeight);
  const title = titleLines.map((line) => line.text).join(" ").trim();
  const titleIds = new Set(titleLines.map((line) => line.id));
  const servingLine = lines.find((line) => isOCRServingLine(line.text));
  const ingredientIds = collectIngredientLineIds(lines, titleIds);
  const contentLines = lines.filter((line) => !titleIds.has(line.id) && !ingredientIds.has(line.id) && !isLayoutNoise(line.text));

  const instructionStart = contentLines.findIndex((line) => isOCRInstructionLine(line.text));
  const descriptionLines = (instructionStart >= 0 ? contentLines.slice(0, instructionStart) : contentLines)
    .filter((line) => isOCRDescriptionLine(line.text))
    .map((line) => line.text);
  const instructionLines = (instructionStart >= 0 ? contentLines.slice(instructionStart) : [])
    .filter((line) => isOCRInstructionLine(line.text) || isLongSentence(line.text))
    .map((line) => line.text);
  const ingredientLines = lines.filter((line) => ingredientIds.has(line.id)).map((line) => line.text);

  if (!title && ingredientLines.length < 2 && instructionLines.length < 2) return "";

  return [
    title ? `Title: ${title}` : "",
    servingLine ? servingLine.text : "",
    descriptionLines.length ? `Description\n${descriptionLines.join("\n")}` : "",
    ingredientLines.length ? `Ingredients\n${ingredientLines.join("\n")}` : "",
    instructionLines.length ? `Instructions\n${instructionLines.join("\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;

  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error("OCR could not be started. Check your internet connection and try again."));
    };
    script.onerror = () => reject(new Error("OCR could not be loaded. Check your internet connection and try again."));
    document.head.append(script);
  });

  return tesseractPromise;
}

function collectOCRLines(data) {
  const sourceLines = Array.isArray(data?.lines) ? data.lines : [];
  const rawLines = sourceLines.length ? sourceLines : collectNestedLines(data ? [data] : []);

  return rawLines
    .map((line, index) => {
      const text = normalizeOCRLine(line.text || "");
      const bbox = line.bbox || line;
      const x0 = Number(bbox.x0 ?? bbox.left ?? 0);
      const y0 = Number(bbox.y0 ?? bbox.top ?? index * 20);
      const x1 = Number(bbox.x1 ?? bbox.right ?? x0 + text.length * 8);
      const y1 = Number(bbox.y1 ?? bbox.bottom ?? y0 + 12);
      return {
        id: index,
        text,
        x0,
        y0,
        x1,
        y1,
        width: Math.max(0, x1 - x0),
        height: Math.max(0, y1 - y0)
      };
    })
    .filter((line) => line.text)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

function collectNestedLines(nodes) {
  const lines = [];
  for (const node of nodes || []) {
    if (Array.isArray(node.lines)) lines.push(...node.lines);
    if (Array.isArray(node.paragraphs)) lines.push(...collectNestedLines(node.paragraphs));
    if (Array.isArray(node.blocks)) lines.push(...collectNestedLines(node.blocks));
  }
  return lines;
}

function inferTitleLines(lines, medianHeight) {
  const candidates = lines
    .filter((line) => isTitleCandidate(line, medianHeight))
    .map((line) => ({ line, score: titleLineScore(line, medianHeight) }))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0]?.line;
  if (!best) return [];

  const group = [best];
  for (const candidate of candidates.map((item) => item.line)) {
    if (candidate.id === best.id) continue;
    const closeVertically = Math.abs(candidate.y0 - best.y0) < medianHeight * 4 || Math.abs(candidate.y1 - best.y1) < medianHeight * 4;
    const aligned = Math.abs(candidate.x0 - best.x0) < medianHeight * 8 || horizontalOverlap(candidate, best) > 0.35;
    if (closeVertically && aligned) group.push(candidate);
  }

  return group.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).slice(0, 3);
}

function isTitleCandidate(line, medianHeight) {
  const text = line.text;
  if (isLayoutNoise(text) || isMeasuredIngredientLine(text) || isOCRInstructionLine(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 10 || text.length > 90) return false;
  return line.height >= medianHeight * 1.18 || uppercaseRatio(text) > 0.55;
}

function titleLineScore(line, medianHeight) {
  const words = line.text.split(/\s+/).filter(Boolean);
  let score = line.height / medianHeight + words.length;
  if (uppercaseRatio(line.text) > 0.55) score += 4;
  if (words.length === 1) score -= 8;
  if (line.text.includes(",")) score -= 3;
  return score;
}

function collectIngredientLineIds(lines, titleIds) {
  const ids = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (titleIds.has(line.id) || isOCRInstructionLine(line.text) || !isMeasuredIngredientLine(line.text)) continue;
    ids.add(line.id);

    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 10); cursor += 1) {
      const next = lines[cursor];
      const sameColumn = Math.abs(next.x0 - line.x0) < Math.max(80, line.width * 0.25);
      if (!sameColumn) continue;
      if (titleIds.has(next.id) || isMeasuredIngredientLine(next.text) || isOCRInstructionLine(next.text) || isLayoutNoise(next.text)) break;
      if (isIngredientContinuation(next.text)) ids.add(next.id);
      else break;
    }
  }
  return ids;
}

function isMeasuredIngredientLine(text) {
  return /^(?:\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+)?|\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛])\s*(?:g|kg|ml|l|cl|el|tl|tbsp|tsp|cup|cups|oz|lb|lbs|liter|litre|gram|grams|teaspoons?|tablespoons?|stuks?|pieces?|eieren?|eggs?)?\b/i.test(text);
}

function isIngredientContinuation(text) {
  return !/[.!?]$/.test(text) && text.length <= 80 && !/^(title|description|ingredients|instructions)\b/i.test(text);
}

function isOCRInstructionLine(text) {
  if (/^(?:\d{1,2}|[ilI])[\).]\s+\S+/.test(text)) return true;
  return /^(?:\d+[.)]\s+)?(?:preheat|heat|mix|stir|combine|bake|cook|bring|add|whisk|pour|season|serve|place|drain|garnish|toss|cut|soak|prep|while|next|move|put|to make|to assemble|the day before|verwarm|voeg|kook|bak|doe|meng|roer|haal|maak|serveer|erhitzen|geben|mischen|braten|kochen|köcheln|hinzufügen|servieren|schneiden|anrichten|während)\b/i.test(text);
}

function isOCRDescriptionLine(text) {
  return text.length > 30 && !isMeasuredIngredientLine(text) && !isOCRInstructionLine(text) && !isLayoutNoise(text);
}

function isLongSentence(text) {
  return text.length > 35;
}

function isOCRServingLine(text) {
  return /^(?:serves?|voor|für|fÃ¼r)\b/i.test(text) || /\b\d+\s*(?:people|persons|servings?|portions?|personen|persoon|porties|portie|portionen)\b/i.test(text);
}

function isLayoutNoise(text) {
  return isOCRServingLine(text) || /^(?:vegan|glutenfrei|chapter|hoofdstuk|zutaten|ingredients|instructions|bereiding|zubereitung)$/i.test(text);
}

function uppercaseRatio(text) {
  const letters = text.replace(/[^A-Za-zÀ-ž]/g, "");
  if (!letters) return 0;
  return letters.replace(/[^A-ZÀ-Þ]/g, "").length / letters.length;
}

function horizontalOverlap(left, right) {
  const overlap = Math.max(0, Math.min(left.x1, right.x1) - Math.max(left.x0, right.x0));
  return overlap / Math.max(1, Math.min(left.width, right.width));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeOCRLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

async function prepareImageForOCR(imageBlob) {
  if (typeof document === "undefined" || !document.createElement) return imageBlob;

  const image = await loadImage(imageBlob);
  const longestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const scale = longestSide < 1800 ? 1800 / longestSide : longestSide > 2600 ? 2600 / longestSide : 1;
  const width = Math.round((image.naturalWidth || image.width) * scale);
  const height = Math.round((image.naturalHeight || image.height) * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return imageBlob;

  context.filter = "grayscale(1) contrast(1.35) brightness(1.05)";
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected image could not be prepared for OCR."));
    };
    image.src = url;
  });
}
