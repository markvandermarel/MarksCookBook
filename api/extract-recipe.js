const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const LOG_PREFIX = "[recipe-extraction-api]";
const MAX_IMAGE_DATA_URL_LENGTH = 9_000_000;
const MAX_REQUEST_BODY_LENGTH = MAX_IMAGE_DATA_URL_LENGTH + 350_000;
const MAX_URL_LENGTH = 2_048;
const MAX_PASTED_SOURCE_LENGTH = 300_000;
const MAX_FETCHED_PAGE_LENGTH = 1_500_000;
const MAX_MODEL_SOURCE_CHARS = 90_000;
const PAGE_FETCH_TIMEOUT_MS = 15_000;

const recipeExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "servings", "language", "ingredients", "instructions", "fullText", "sourceMetadata", "warnings", "confidence"],
  properties: {
    title: {
      type: "string",
      description: "The recipe title only. Ignore small chapter, section, page, cuisine, diet, or book labels."
    },
    description: {
      type: "string",
      description: "Introductory recipe description or serving note, excluding ingredients and cooking steps."
    },
    servings: {
      type: ["number", "null"],
      description: "Number of portions or people served, if visible."
    },
    language: {
      type: "string",
      enum: ["en", "de", "nl", "unknown"]
    },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["amount", "unit", "name", "preparationNote", "originalText"],
        properties: {
          amount: {
            type: ["number", "null"],
            description: "Numeric amount if clear. Use null for 'to taste', pinches, or uncertain values."
          },
          unit: {
            type: ["string", "null"],
            description: "Unit as printed or normalized, such as g, kg, ml, l, tsp, tbsp, cup, oz, lb, EL, TL."
          },
          name: {
            type: "string",
            description: "Ingredient name only, without preparation notes."
          },
          preparationNote: {
            type: "string",
            description: "Preparation note such as chopped, finely diced, geschnitten, grof gehakt, or empty string."
          },
          originalText: {
            type: "string",
            description: "Full original ingredient line as read from the source."
          }
        }
      }
    },
    instructions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "text"],
        properties: {
          order: {
            type: "integer"
          },
          text: {
            type: "string",
            description: "One complete cooking step. Preserve the original recipe language."
          }
        }
      }
    },
    fullText: {
      type: "string",
      description: "Clean full recipe text reconstructed from the source, excluding unrelated page labels where possible."
    },
    sourceMetadata: {
      type: "object",
      additionalProperties: false,
      required: ["sourceType", "sourceName", "sourceURL", "notes"],
      properties: {
        sourceType: {
          type: "string",
          enum: ["photo", "url"]
        },
        sourceName: {
          type: "string"
        },
        sourceURL: {
          type: "string"
        },
        notes: {
          type: "string"
        }
      }
    },
    warnings: {
      type: "array",
      items: {
        type: "string"
      }
    },
    confidence: {
      type: "number",
      description: "Confidence from 0 to 1."
    }
  }
};

const photoExtractionPrompt = `
Extract one cookbook recipe from this photo.

The photo may contain English, German, or Dutch text. Preserve the recipe language in title, description, ingredients, and instructions.

Separate the recipe into:
- title: the actual recipe title. Prefer the largest recipe-specific heading. Ignore small top/bottom page labels, chapter names, category labels, diet labels, page numbers, or book section names.
- description: general introduction or serving note, not instructions and not ingredients.
- servings: number of portions/people if visible.
- ingredients: the measured ingredient list. Recipes have ingredient lines with quantities or clear ingredient names. Keep originalText faithful, but put only the ingredient name in name and preparation details in preparationNote.
- instructions: cooking method steps only. Split numbered or paragraph instructions into individual steps. Do not include description text or ingredient text as steps.
- fullText: reconstructed readable recipe text.

If a field is not visible, use an empty string, empty array, or null. Do not invent missing ingredients or steps.
`;

function urlExtractionPrompt({ sourceURL, sourceName, sourceText }) {
  return `
Extract exactly one recipe from this recipe web page.

The page content may include navigation, advertisements, comments, ratings, related recipes, author biographies, newsletter boxes, SEO text, nutrition tables, and article content. Ignore all of that unless it is part of the actual recipe.

Prefer the main recipe card or schema.org Recipe data when present. If the page contains multiple recipes, extract the primary recipe matching the page title or canonical recipe card. Preserve the recipe language in title, description, ingredients, and instructions.

Separate the recipe into:
- title: the actual recipe title. Do not include site names, category labels, or SEO suffixes.
- description: short recipe introduction or serving note, not ingredients and not method steps.
- servings: number of portions/people if available.
- ingredients: only the measured ingredient list for the main recipe. Keep originalText faithful, put only the ingredient name in name, and put preparation details in preparationNote.
- instructions: cooking method steps only. Split numbered or paragraph instructions into individual steps. Do not include notes, nutrition, equipment, or ingredient text as steps.
- fullText: reconstructed readable recipe text for the main recipe only.
- sourceMetadata.sourceType: "url"
- sourceMetadata.sourceName: "${escapePromptText(sourceName)}"
- sourceMetadata.sourceURL: "${escapePromptText(sourceURL)}"

If a field is missing, use an empty string, empty array, or null. Do not invent missing ingredients or steps.

Recipe page content:
${sourceText}
`;
}

export default async function handler(req, res) {
  setCORS(req, res);
  console.info(LOG_PREFIX, "request received", {
    method: req.method,
    origin: req.headers.origin || "",
    contentLength: req.headers["content-length"] || ""
  });

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Use POST." }));
    return;
  }

  try {
    assertOriginAllowed(req);

    const body = await readJSONBody(req);
    const requestContext = buildRequestContext(body);

    const mockMode = mockExtractionMode(req);
    if (mockMode.enabled) {
      const recipe = mockExtractedRecipe({
        fileName: requestContext.fileName || "",
        reason: mockMode.reason,
        sourceName: requestContext.sourceName || "",
        sourceType: requestContext.sourceType,
        sourceURL: requestContext.sourceURL || ""
      });
      console.info(LOG_PREFIX, "using mock extraction", {
        reason: mockMode.reason,
        sourceType: requestContext.sourceType,
        sourceURL: requestContext.sourceURL || "",
        fileName: requestContext.fileName || ""
      });
      sendJSON(res, 200, {
        recipe,
        mock: true,
        provider: {
          name: "mock",
          mode: "mock",
          reason: mockMode.reason
        }
      });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new PublicError(
        "The extraction backend is running, but OPENAI_API_KEY is not configured. Set it on the backend, or use MOCK_RECIPE_EXTRACTION=true for local mock testing.",
        503
      );
    }

    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const openAIInput = await buildOpenAIInput(requestContext);
    console.info(LOG_PREFIX, "calling OpenAI responses API", {
      model,
      sourceType: requestContext.sourceType,
      sourceURL: requestContext.sourceURL || "",
      ...openAIInput.diagnostics
    });
    const payload = await callOpenAIRecipeExtraction({
      apiKey,
      model,
      content: openAIInput.content
    });

    const outputText = extractOutputText(payload);
    if (!outputText) throw new PublicError("OpenAI did not return recipe JSON.", 502);

    const recipe = normalizeRecipeOutput(parseRecipeOutput(outputText), requestContext);
    console.info(LOG_PREFIX, "recipe extraction succeeded", {
      sourceType: requestContext.sourceType,
      sourceURL: requestContext.sourceURL || "",
      title: recipe.title || "",
      ingredientCount: Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0,
      instructionCount: Array.isArray(recipe.instructions) ? recipe.instructions.length : 0
    });
    sendJSON(res, 200, {
      recipe,
      usage: payload.usage || null,
      provider: {
        name: "openai",
        mode: "live",
        model
      }
    });
  } catch (error) {
    const status = error instanceof PublicError ? error.status : 500;
    console.error(LOG_PREFIX, "request failed", {
      status,
      message: error.message || "Recipe extraction failed."
    });
    sendJSON(res, status, { error: error.message || "Recipe extraction failed." });
  }
}

function setCORS(req, res) {
  const allowed = allowedOrigins();
  const origin = req.headers.origin || "";
  const allowOrigin = !allowed.length || allowed.includes(origin) ? origin || "*" : allowed[0];
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

function assertOriginAllowed(req) {
  const allowed = allowedOrigins();
  if (!allowed.length) return;
  const origin = req.headers.origin || "";
  if (!allowed.includes(origin)) throw new PublicError("This origin is not allowed to use the extraction backend.", 403);
}

function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function buildRequestContext(body) {
  const explicitSourceType = String(body.sourceType || body.type || "").trim().toLowerCase();
  const imageDataUrl = body.imageDataUrl || body?.image?.dataUrl;

  if (explicitSourceType === "url" || (!imageDataUrl && (body.url || body.sourceURL))) {
    return buildURLRequestContext(body);
  }

  if (explicitSourceType && explicitSourceType !== "photo") {
    throw new PublicError("sourceType must be either photo or url.", 400);
  }

  if (!imageDataUrl) {
    throw new PublicError("Send either a recipe photo or a recipe page URL.", 400);
  }

  if (!isAllowedImageDataUrl(imageDataUrl)) {
    throw new PublicError("Send a JPEG, PNG, or WebP image as a base64 data URL.", 400);
  }
  if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new PublicError("The uploaded photo is too large. Try a closer crop or a smaller image.", 413);
  }

  return {
    sourceType: "photo",
    imageDataUrl,
    fileName: String(body.fileName || "")
  };
}

function buildURLRequestContext(body) {
  const rawURL = String(body.url || body.sourceURL || "").trim();
  if (!rawURL) throw new PublicError("Send a recipe page URL.", 400);
  if (rawURL.length > MAX_URL_LENGTH) throw new PublicError("The recipe URL is too long.", 400);

  let sourceURL;
  try {
    sourceURL = new URL(rawURL);
  } catch {
    throw new PublicError("Send a valid recipe page URL.", 400);
  }

  if (!["http:", "https:"].includes(sourceURL.protocol)) {
    throw new PublicError("Recipe URL imports only support http and https pages.", 400);
  }
  if (isBlockedSourceHost(sourceURL.hostname)) {
    throw new PublicError("Recipe URL imports cannot fetch local or private network addresses.", 400);
  }

  const pastedSourceText = String(body.pageText ?? body.html ?? body.text ?? "").trim();
  if (pastedSourceText.length > MAX_PASTED_SOURCE_LENGTH) {
    throw new PublicError("The pasted recipe page text is too large. Paste the recipe card or main recipe section instead.", 413);
  }

  return {
    sourceType: "url",
    sourceURL: sourceURL.href,
    sourceName: sourceNameFromURL(sourceURL),
    pageText: pastedSourceText
  };
}

async function buildOpenAIInput(context) {
  if (context.sourceType === "photo") {
    return {
      content: [
        { type: "input_text", text: photoExtractionPrompt },
        { type: "input_image", image_url: context.imageDataUrl }
      ],
      diagnostics: {
        imageDataUrlLength: context.imageDataUrl.length
      }
    };
  }

  const source = await buildURLSourceText(context);
  return {
    content: [
      {
        type: "input_text",
        text: urlExtractionPrompt({
          sourceURL: context.sourceURL,
          sourceName: context.sourceName,
          sourceText: source.text
        })
      }
    ],
    diagnostics: {
      sourceTextLength: source.text.length,
      sourceTextOrigin: source.origin
    }
  };
}

async function buildURLSourceText(context) {
  if (context.pageText) {
    return {
      origin: "request",
      text: prepareSourceTextForModel(context.pageText)
    };
  }

  const fetched = await fetchRecipePage(context.sourceURL);
  return {
    origin: fetched.origin,
    text: prepareSourceTextForModel(fetched.text)
  };
}

async function fetchRecipePage(sourceURL) {
  const attempts = [
    { origin: "source", url: sourceURL },
    { origin: "reader", url: readerURLFor(sourceURL) }
  ];
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const page = await fetchTextPage(attempt.url);
      if (page.text.trim().length < 80) {
        throw new Error("The page response did not include enough readable text.");
      }
      return {
        ...page,
        origin: attempt.origin
      };
    } catch (error) {
      lastError = error;
      console.warn(LOG_PREFIX, "recipe page fetch attempt failed", {
        origin: attempt.origin,
        message: error.message || String(error)
      });
    }
  }

  throw new PublicError(
    `The recipe page could not be loaded by the extraction backend. Paste the page text or HTML and try again. ${lastError?.message || ""}`.trim(),
    502
  );
}

async function fetchTextPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": "RecipeCookbookBot/1.0 (+https://example.invalid/recipe-cookbook)"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = Number(response.headers?.get?.("content-length") || 0);
    if (contentLength > MAX_FETCHED_PAGE_LENGTH * 4) {
      throw new Error("The recipe page is too large to import directly.");
    }

    const rawText = await response.text();
    return {
      contentType: response.headers?.get?.("content-type") || "",
      finalURL: response.url || url,
      text: rawText.slice(0, MAX_FETCHED_PAGE_LENGTH)
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The recipe page request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAIRecipeExtraction({ apiKey, model, content }) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "recipe_extraction",
          schema: recipeExtractionSchema,
          strict: true
        }
      },
      max_output_tokens: 5000
    })
  });

  const payload = await response.json().catch(() => ({}));
  console.info(LOG_PREFIX, "OpenAI response received", {
    ok: response.ok,
    status: response.status,
    usage: payload.usage || null
  });
  if (!response.ok) {
    const message = payload?.error?.message || "OpenAI recipe extraction failed.";
    throw new PublicError(message, response.status);
  }

  return payload;
}

async function readJSONBody(req) {
  if (Buffer.isBuffer(req.body)) {
    assertBodySize(req.body.length);
    return parseJSONBody(req.body.toString("utf8"));
  }
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    assertBodySize(Buffer.byteLength(req.body));
    return parseJSONBody(req.body);
  }

  const chunks = [];
  let byteLength = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    byteLength += buffer.length;
    assertBodySize(byteLength);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return parseJSONBody(text);
}

function isAllowedImageDataUrl(value) {
  return typeof value === "string" && /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

function parseJSONBody(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new PublicError("The extraction request body must be valid JSON.", 400);
  }
}

function assertBodySize(byteLength) {
  if (byteLength > MAX_REQUEST_BODY_LENGTH) {
    throw new PublicError("The extraction request is too large. Try a closer crop or a smaller image.", 413);
  }
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
      if (typeof content.output_text === "string") return content.output_text;
    }
  }

  return "";
}

function parseRecipeOutput(outputText) {
  try {
    return JSON.parse(outputText);
  } catch {
    throw new PublicError("AI provider returned invalid recipe JSON.", 502);
  }
}

function normalizeRecipeOutput(recipe, context) {
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    throw new PublicError("AI provider returned invalid recipe JSON.", 502);
  }

  const sourceMetadata = recipe.sourceMetadata && typeof recipe.sourceMetadata === "object" ? recipe.sourceMetadata : {};
  recipe.sourceMetadata = {
    sourceType: context.sourceType,
    sourceName:
      normalizeSingleLine(sourceMetadata.sourceName) ||
      context.sourceName ||
      (context.sourceType === "url" ? "AI URL extraction" : "AI photo extraction"),
    sourceURL: context.sourceType === "url" ? context.sourceURL : normalizeSingleLine(sourceMetadata.sourceURL),
    notes: normalizeSingleLine(sourceMetadata.notes)
  };

  if (!Array.isArray(recipe.ingredients)) recipe.ingredients = [];
  if (!Array.isArray(recipe.instructions)) recipe.instructions = [];
  if (!Array.isArray(recipe.warnings)) recipe.warnings = [];
  recipe.confidence = Number.isFinite(Number(recipe.confidence)) ? Number(recipe.confidence) : 0;

  return recipe;
}

function prepareSourceTextForModel(source) {
  const raw = String(source || "");
  const structuredData = extractStructuredDataSnippets(raw);
  const readableText = looksLikeHTML(raw) ? htmlToPromptText(raw) : decodeEntities(raw);
  const combined = [
    structuredData ? `Structured recipe data candidates:\n${structuredData}` : "",
    `Readable page text:\n${readableText}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const cleaned = normalizePromptText(combined);
  if (!cleaned) throw new PublicError("The recipe page did not include readable text.", 400);
  return truncateSourceForModel(cleaned);
}

function extractStructuredDataSnippets(source) {
  const snippets = [...String(source).matchAll(/<script[^>]+type=["'][^"']*ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => normalizePromptText(decodeEntities(match[1])))
    .filter(Boolean);
  const recipeSnippets = snippets.filter((snippet) => /"@type"\s*:\s*"?Recipe|recipeIngredient|recipeInstructions/i.test(snippet));
  return (recipeSnippets.length ? recipeSnippets : snippets.slice(0, 2))
    .slice(0, 4)
    .map((snippet) => snippet.slice(0, 24_000))
    .join("\n\n");
}

function htmlToPromptText(html) {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|div|section|article|tr|td|th|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function truncateSourceForModel(text) {
  if (text.length <= MAX_MODEL_SOURCE_CHARS) return text;

  const windows = [{ start: 0, end: 14_000 }];
  const patterns = [
    /recipeIngredient/gi,
    /recipeInstructions/gi,
    /^#{0,4}\s*recipe\b/gim,
    /^#{0,4}\s*ingredients?\b/gim,
    /^#{0,4}\s*(instructions?|directions?|method|preparation|steps)\b/gim,
    /^#{0,4}\s*(zutaten|zubereitung|anleitung|bereiding|ingredienten|werkwijze|stappen)\b/gim,
    /\bserves?\s+\d+/gi,
    /\bservings?\s*:?\s*\d+/gi
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    let count = 0;
    while ((match = pattern.exec(text)) && count < 8) {
      const start = Math.max(0, match.index - 8_000);
      windows.push({ start, end: Math.min(text.length, match.index + 24_000) });
      count += 1;
    }
  }

  const merged = mergeWindows(windows).sort((left, right) => left.start - right.start);
  const parts = [];
  let used = 0;
  for (const window of merged) {
    if (used >= MAX_MODEL_SOURCE_CHARS) break;
    const separator = parts.length ? "\n\n[...page content omitted...]\n\n" : "";
    const available = MAX_MODEL_SOURCE_CHARS - used - separator.length;
    if (available <= 0) break;
    const snippet = text.slice(window.start, window.end).slice(0, available);
    parts.push(`${separator}${snippet}`);
    used += separator.length + snippet.length;
  }

  return parts.join("").slice(0, MAX_MODEL_SOURCE_CHARS);
}

function mergeWindows(windows) {
  const sorted = windows
    .filter((window) => window.end > window.start)
    .sort((left, right) => left.start - right.start);
  const merged = [];

  for (const window of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && window.start <= previous.end + 1_000) {
      previous.end = Math.max(previous.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }

  return merged;
}

function normalizePromptText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u00a0 ]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function looksLikeHTML(text) {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

function readerURLFor(sourceURL) {
  return `https://r.jina.ai/http://${sourceURL}`;
}

function sourceNameFromURL(url) {
  return url.hostname.replace(/^www\./i, "");
}

function isBlockedSourceHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host === "169.254.169.254" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function normalizeSingleLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapePromptText(value) {
  return normalizeSingleLine(value).replace(/["\\]/g, "\\$&").slice(0, 300);
}

function sendJSON(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function mockExtractionMode(req) {
  const setting = normalizedEnv("MOCK_RECIPE_EXTRACTION");
  if (isTruthySetting(setting)) {
    return { enabled: true, reason: "MOCK_RECIPE_EXTRACTION is enabled." };
  }
  if (isFalsySetting(setting)) {
    return { enabled: false, reason: "" };
  }
  if (!process.env.OPENAI_API_KEY && isLocalRequest(req)) {
    return { enabled: true, reason: "OPENAI_API_KEY is not configured on the local backend." };
  }
  return { enabled: false, reason: "" };
}

function normalizedEnv(name) {
  return String(process.env[name] || "").trim().toLowerCase();
}

function isTruthySetting(value) {
  return ["1", "true", "yes", "on"].includes(value);
}

function isFalsySetting(value) {
  return ["0", "false", "no", "off"].includes(value);
}

function isLocalRequest(req) {
  const host = req.headers.host || "";
  if (isLocalHost(host)) return true;

  const origin = req.headers.origin || "";
  try {
    return isLocalHost(new URL(origin).host);
  } catch {
    return false;
  }
}

function isLocalHost(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

function mockExtractedRecipe({ fileName, reason, sourceName = "", sourceType = "photo", sourceURL = "" }) {
  const isURL = sourceType === "url";
  const sourceNote = isURL
    ? sourceURL
      ? `Mocked from ${sourceURL}.`
      : "Mocked from the recipe URL."
    : fileName
      ? `Mocked from ${fileName}.`
      : "Mocked from the uploaded photo.";
  return {
    title: "Mock Lemon Pasta",
    description: "A local development mock recipe returned by the secure extraction backend.",
    servings: 4,
    language: "en",
    ingredients: [
      {
        amount: 200,
        unit: "g",
        name: "spaghetti",
        preparationNote: "",
        originalText: "200 g spaghetti"
      },
      {
        amount: 2,
        unit: "tbsp",
        name: "olive oil",
        preparationNote: "",
        originalText: "2 tbsp olive oil"
      },
      {
        amount: 1,
        unit: null,
        name: "lemon",
        preparationNote: "zested and juiced",
        originalText: "1 lemon, zested and juiced"
      },
      {
        amount: null,
        unit: null,
        name: "salt and black pepper",
        preparationNote: "to taste",
        originalText: "salt and black pepper, to taste"
      }
    ],
    instructions: [
      {
        order: 0,
        text: "Cook the spaghetti in salted water until al dente."
      },
      {
        order: 1,
        text: "Warm the olive oil with lemon zest, then toss with the pasta."
      },
      {
        order: 2,
        text: "Add lemon juice, season to taste, and serve warm."
      }
    ],
    fullText:
      "Mock Lemon Pasta\nServes 4\n200 g spaghetti\n2 tbsp olive oil\n1 lemon, zested and juiced\nsalt and black pepper, to taste\nCook the spaghetti in salted water until al dente. Toss with lemon oil and season.",
    sourceMetadata: {
      sourceType,
      sourceName: isURL ? sourceName || "Mock URL extraction" : "Mock photo extraction",
      sourceURL: isURL ? sourceURL : "",
      notes: `${sourceNote} ${reason} No AI/OCR provider was called.`
    },
    warnings: [
      "Mock extraction was used for local testing.",
      isURL
        ? "The recipe page was not analyzed. Configure OPENAI_API_KEY on the backend for real URL extraction."
        : "The uploaded photo was not analyzed. Configure OPENAI_API_KEY on the backend for real extraction."
    ],
    confidence: 0
  };
}

class PublicError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
