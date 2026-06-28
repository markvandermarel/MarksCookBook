import { appConfig } from "./config.js?v=20260628-urlai1";
import { parseIngredientLine } from "./parser.js?v=20260628-urlai1";
import { parseUnit } from "./units.js?v=20260628-urlai1";

const PHOTO_MAX_DIMENSION = 1800;
const PHOTO_JPEG_QUALITY = 0.82;
const PHOTO_IMPORT_LOG_PREFIX = "[Recipe Cookbook photo import]";
const URL_IMPORT_LOG_PREFIX = "[Recipe Cookbook URL import]";

export async function extractRecipeFromPhoto(file, onProgress = () => {}) {
  const endpoint = String(appConfig.aiExtractionEndpoint || "").trim();
  logPhotoImport("extractRecipeFromPhoto called", {
    endpointConfigured: Boolean(endpoint),
    fileName: file?.name || "",
    fileType: file?.type || "",
    fileSize: file?.size || 0
  });

  if (!endpoint) {
    logPhotoImport("blocked before API call", { reason: "missing aiExtractionEndpoint" });
    throw new Error("Photo extraction endpoint is missing. Add a backend endpoint URL in pwa/src/config.js; keep AI API keys on the backend only.");
  }

  const configurationError = endpointConfigurationError(endpoint);
  if (configurationError) {
    logPhotoImport("blocked before API call", { reason: "endpoint configuration", endpoint: safeEndpointLabel(endpoint) });
    throw new Error(configurationError);
  }

  onProgress("Preparing photo for secure extraction...");
  const imageDataUrl = await imageFileToJpegDataURL(file);
  logPhotoImport("photo prepared for upload", {
    jpegDataUrlLength: imageDataUrl.length,
    maxDimension: PHOTO_MAX_DIMENSION
  });

  onProgress("Sending photo to the extraction backend...");
  logPhotoImport("sending extraction request", { endpoint: safeEndpointLabel(endpoint) });
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl,
        fileName: file.name || "recipe-photo.jpg",
        mimeType: "image/jpeg"
      })
    });
  } catch (error) {
    console.error(PHOTO_IMPORT_LOG_PREFIX, "extraction request failed before response", {
      endpoint: safeEndpointLabel(endpoint),
      message: error.message || String(error)
    });
    throw new Error(
      `Could not reach the photo extraction backend at ${safeEndpointLabel(endpoint)}. Start the local dev server or check the deployed endpoint URL.`
    );
  }

  logPhotoImport("extraction response received", {
    endpoint: safeEndpointLabel(endpoint),
    ok: response.ok,
    status: response.status
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(PHOTO_IMPORT_LOG_PREFIX, "extraction service returned an error", {
      status: response.status,
      message: payload.error || "Photo recipe extraction failed."
    });
    throw new Error(payload.error || backendFailureMessage(response.status, endpoint));
  }

  if (!payload.recipe) {
    console.error(PHOTO_IMPORT_LOG_PREFIX, "extraction service response did not include recipe JSON");
    throw new Error("The extraction service did not return recipe JSON.");
  }

  const isMock = payload.mock || payload.provider?.mode === "mock";
  onProgress(isMock ? "Mock recipe extracted. Review the JSON before saving." : "Recipe extracted. Review the JSON, then save.");
  logPhotoImport("recipe extracted", {
    provider: payload.provider || null,
    title: payload.recipe.title || "",
    ingredientCount: Array.isArray(payload.recipe.ingredients) ? payload.recipe.ingredients.length : 0,
    instructionCount: Array.isArray(payload.recipe.instructions) ? payload.recipe.instructions.length : 0
  });
  return recipeFromExtractedRecipe(payload.recipe, "photo", {
    sourceName: isMock ? "Mock photo extraction" : "AI photo extraction",
    fullText: payload.recipe.fullText || "",
    language: payload.recipe.language || "unknown",
    confidence: Number(payload.recipe.confidence) || 0,
    warnings: Array.isArray(payload.recipe.warnings) ? payload.recipe.warnings : []
  });
}

export async function extractRecipeFromURL(urlText, pageText = "", onProgress = () => {}) {
  const endpoint = String(appConfig.aiExtractionEndpoint || "").trim();
  const sourceURL = normalizeRecipeURL(urlText);
  logURLImport("extractRecipeFromURL called", {
    endpointConfigured: Boolean(endpoint),
    sourceURL,
    hasPastedPageText: Boolean(String(pageText || "").trim())
  });

  if (!endpoint) {
    logURLImport("blocked before API call", { reason: "missing aiExtractionEndpoint" });
    throw new Error("URL extraction endpoint is missing. Add a backend endpoint URL in pwa/src/config.js; keep AI API keys on the backend only.");
  }

  const configurationError = endpointConfigurationError(endpoint, "URL extraction");
  if (configurationError) {
    logURLImport("blocked before API call", { reason: "endpoint configuration", endpoint: safeEndpointLabel(endpoint) });
    throw new Error(configurationError);
  }

  onProgress("Sending recipe URL to the extraction backend...");
  logURLImport("sending extraction request", { endpoint: safeEndpointLabel(endpoint), sourceURL });
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType: "url",
        url: sourceURL,
        pageText: String(pageText || "").trim()
      })
    });
  } catch (error) {
    console.error(URL_IMPORT_LOG_PREFIX, "extraction request failed before response", {
      endpoint: safeEndpointLabel(endpoint),
      message: error.message || String(error)
    });
    throw new Error(
      `Could not reach the recipe extraction backend at ${safeEndpointLabel(endpoint)}. Start the local dev server or check the deployed endpoint URL.`
    );
  }

  logURLImport("extraction response received", {
    endpoint: safeEndpointLabel(endpoint),
    ok: response.ok,
    status: response.status
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(URL_IMPORT_LOG_PREFIX, "extraction service returned an error", {
      status: response.status,
      message: payload.error || "URL recipe extraction failed."
    });
    throw new Error(payload.error || backendFailureMessage(response.status, endpoint, "Recipe extraction"));
  }

  if (!payload.recipe) {
    console.error(URL_IMPORT_LOG_PREFIX, "extraction service response did not include recipe JSON");
    throw new Error("The extraction service did not return recipe JSON.");
  }

  const isMock = payload.mock || payload.provider?.mode === "mock";
  onProgress(isMock ? "Mock URL recipe extracted." : "Recipe extracted from URL.");
  logURLImport("recipe extracted", {
    provider: payload.provider || null,
    title: payload.recipe.title || "",
    ingredientCount: Array.isArray(payload.recipe.ingredients) ? payload.recipe.ingredients.length : 0,
    instructionCount: Array.isArray(payload.recipe.instructions) ? payload.recipe.instructions.length : 0
  });

  return recipeFromExtractedRecipe(payload.recipe, "url", {
    sourceName: isMock ? "Mock URL extraction" : "AI URL extraction",
    sourceURL,
    fullText: payload.recipe.fullText || "",
    language: payload.recipe.language || "unknown",
    confidence: Number(payload.recipe.confidence) || 0,
    warnings: Array.isArray(payload.recipe.warnings) ? payload.recipe.warnings : []
  });
}

export function recipeFromExtractedRecipe(extracted, sourceType = "photo", metadata = {}) {
  const defaultSourceName = sourceType === "url" ? "AI URL extraction" : "AI photo extraction";
  const sourceMetadata = {
    sourceURL: extracted?.sourceMetadata?.sourceURL || metadata.sourceURL || "",
    sourceName: extracted?.sourceMetadata?.sourceName || metadata.sourceName || defaultSourceName,
    author: "",
    originalImageURL: "",
    language: extracted?.language || metadata.language || "unknown",
    confidence: Number(extracted?.confidence ?? metadata.confidence ?? 0) || 0,
    warnings: Array.isArray(extracted?.warnings) ? extracted.warnings : metadata.warnings || [],
    fullText: extracted?.fullText || metadata.fullText || "",
    notes: extracted?.sourceMetadata?.notes || ""
  };
  const originalServings = Number(extracted?.servings) > 0 ? Number(extracted.servings) : 4;
  const ingredients = Array.isArray(extracted?.ingredients) ? extracted.ingredients : [];
  const instructions = Array.isArray(extracted?.instructions) ? extracted.instructions : [];

  return {
    id: crypto.randomUUID(),
    title: normalizeText(extracted?.title) || "Untitled Recipe",
    description: normalizeText(extracted?.description),
    originalServings,
    currentServings: originalServings,
    sourceType,
    ingredients: ingredients.map((ingredient, index) => normalizeExtractedIngredient(ingredient, index)),
    instructions: instructions
      .map((step, index) => ({
        id: crypto.randomUUID(),
        order: Number.isInteger(step?.order) ? step.order : index,
        text: normalizeText(typeof step === "string" ? step : step?.text)
      }))
      .filter((step) => step.text)
      .sort((left, right) => left.order - right.order)
      .map((step, index) => ({ ...step, order: index })),
    images: [],
    sourceMetadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function recipeToEditableJSON(recipe) {
  const sourceType = recipe.sourceType || recipe.sourceMetadata?.sourceType || "photo";
  const defaultSourceName = sourceType === "url" ? "AI URL extraction" : "AI photo extraction";
  return {
    title: recipe.title,
    description: recipe.description,
    servings: recipe.originalServings,
    language: recipe.sourceMetadata?.language || "unknown",
    ingredients: recipe.ingredients.map((ingredient) => ({
      amount: Number.isFinite(ingredient.amount) ? ingredient.amount : null,
      unit: ingredient.unit || null,
      name: ingredient.name || "",
      preparationNote: ingredient.preparationNote || "",
      originalText: ingredient.originalText || ""
    })),
    instructions: recipe.instructions.map((step, index) => ({
      order: index,
      text: step.text
    })),
    fullText: recipe.sourceMetadata?.fullText || "",
    sourceMetadata: {
      sourceType,
      sourceName: recipe.sourceMetadata?.sourceName || defaultSourceName,
      sourceURL: recipe.sourceMetadata?.sourceURL || "",
      notes: recipe.sourceMetadata?.notes || ""
    },
    warnings: recipe.sourceMetadata?.warnings || [],
    confidence: recipe.sourceMetadata?.confidence || 0
  };
}

function normalizeExtractedIngredient(ingredient, index) {
  const originalText = normalizeText(
    ingredient?.originalText ||
      [ingredient?.amount, ingredient?.unit, ingredient?.name, ingredient?.preparationNote].filter((value) => value !== null && value !== undefined && value !== "").join(" ")
  );
  const parsed = parseIngredientLine(originalText);
  const hasAmount = ingredient?.amount !== null && ingredient?.amount !== undefined && ingredient?.amount !== "";
  const amount = hasAmount && Number.isFinite(Number(ingredient.amount)) ? Number(ingredient.amount) : parsed.amount;
  const unit = parseUnit(ingredient?.unit || "") || parsed.unit;
  const name = normalizeText(ingredient?.name) || parsed.name || originalText;
  const preparationNote = normalizeText(ingredient?.preparationNote) || parsed.preparationNote || "";

  return {
    id: crypto.randomUUID(),
    order: index,
    amount,
    unit,
    name,
    preparationNote,
    originalText
  };
}

async function imageFileToJpegDataURL(file) {
  if (typeof document === "undefined" || !document.createElement) {
    throw new Error("Photo extraction must run in a browser.");
  }

  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The selected photo could not be prepared.");
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected photo could not be read."));
    };
    image.src = url;
  });
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function logPhotoImport(message, details = {}) {
  console.info(PHOTO_IMPORT_LOG_PREFIX, message, details);
}

function logURLImport(message, details = {}) {
  console.info(URL_IMPORT_LOG_PREFIX, message, details);
}

function normalizeRecipeURL(urlText) {
  try {
    const url = new URL(String(urlText || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported recipe URL.");
    return url.href;
  } catch {
    throw new Error("Enter a valid recipe URL that starts with http or https.");
  }
}

function safeEndpointLabel(endpoint) {
  try {
    const url = new URL(endpoint, typeof window === "undefined" ? "http://localhost" : window.location.href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "configured endpoint";
  }
}

function backendFailureMessage(status, endpoint, sourceLabel = "Photo extraction") {
  const label = safeEndpointLabel(endpoint);
  if (status === 404) {
    return `${sourceLabel} backend was not found at ${label}. If the PWA is on a static host, deploy the backend separately and update pwa/src/config.js.`;
  }
  if (status === 503) {
    return `${sourceLabel} backend is unavailable. Check that the backend is running and its AI provider environment variables are configured.`;
  }
  return `${sourceLabel} backend returned HTTP ${status}. Check the backend logs for details.`;
}

function endpointConfigurationError(endpoint, sourceLabel = "Photo extraction") {
  if (typeof window === "undefined" || !window.location) return "";

  if (window.location.protocol === "file:") {
    return `Open Cookbook through the local dev server before using ${sourceLabel.toLowerCase()}: run npm start, then go to http://localhost:8080.`;
  }

  let endpointURL;
  try {
    endpointURL = new URL(endpoint, window.location.href);
  } catch {
    return "";
  }

  const pageHost = window.location.hostname.toLowerCase();
  const endpointHost = endpointURL.hostname.toLowerCase();
  if (isGitHubPagesHost(pageHost) && isGitHubPagesHost(endpointHost)) {
    return `${sourceLabel} needs a deployed backend. GitHub Pages only hosts static files, so ${safeEndpointLabel(endpoint)} cannot run api/extract-recipe.js or use OPENAI_API_KEY. Deploy the backend to a Node/serverless host, then set aiExtractionEndpoint in pwa/src/config.js to that HTTPS URL.`;
  }

  return "";
}

function isGitHubPagesHost(hostname) {
  return hostname === "github.io" || hostname.endsWith(".github.io");
}
