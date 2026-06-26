const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const LOG_PREFIX = "[recipe-extraction-api]";
const MAX_IMAGE_DATA_URL_LENGTH = 9_000_000;

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
            description: "Full original ingredient line as read from the photo."
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
      description: "Clean full recipe text reconstructed from the image, excluding unrelated page labels where possible."
    },
    sourceMetadata: {
      type: "object",
      additionalProperties: false,
      required: ["sourceType", "sourceName", "sourceURL", "notes"],
      properties: {
        sourceType: {
          type: "string",
          enum: ["photo"]
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

const extractionPrompt = `
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
    const imageDataUrl = body.imageDataUrl || body?.image?.dataUrl;
    if (!isAllowedImageDataUrl(imageDataUrl)) {
      throw new PublicError("Send a JPEG, PNG, or WebP image as a base64 data URL.", 400);
    }
    if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
      throw new PublicError("The uploaded photo is too large. Try a closer crop or a smaller image.", 413);
    }

    const mockMode = mockExtractionMode(req);
    if (mockMode.enabled) {
      const recipe = mockExtractedRecipe({ fileName: body.fileName || "", reason: mockMode.reason });
      console.info(LOG_PREFIX, "using mock extraction", {
        reason: mockMode.reason,
        fileName: body.fileName || ""
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
    console.info(LOG_PREFIX, "calling OpenAI responses API", {
      model,
      imageDataUrlLength: imageDataUrl.length
    });
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
            content: [
              { type: "input_text", text: extractionPrompt },
              { type: "input_image", image_url: imageDataUrl }
            ]
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

    const outputText = extractOutputText(payload);
    if (!outputText) throw new PublicError("OpenAI did not return recipe JSON.", 502);

    const recipe = parseRecipeOutput(outputText);
    console.info(LOG_PREFIX, "recipe extraction succeeded", {
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
  if (byteLength > MAX_IMAGE_DATA_URL_LENGTH + 200_000) {
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

function mockExtractedRecipe({ fileName, reason }) {
  const sourceNote = fileName ? `Mocked from ${fileName}.` : "Mocked from the uploaded photo.";
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
      sourceType: "photo",
      sourceName: "Mock photo extraction",
      sourceURL: "",
      notes: `${sourceNote} ${reason} No AI/OCR provider was called.`
    },
    warnings: [
      "Mock extraction was used for local testing.",
      "The uploaded photo was not analyzed. Configure OPENAI_API_KEY on the backend for real extraction."
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
