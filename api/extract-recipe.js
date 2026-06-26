const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new PublicError("OPENAI_API_KEY is not configured on the extraction backend.", 500);

    const body = await readJSONBody(req);
    const imageDataUrl = body.imageDataUrl || body?.image?.dataUrl;
    if (!isAllowedImageDataUrl(imageDataUrl)) {
      throw new PublicError("Send a JPEG, PNG, or WebP image as a base64 data URL.", 400);
    }

    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
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
    if (!response.ok) {
      const message = payload?.error?.message || "OpenAI recipe extraction failed.";
      throw new PublicError(message, response.status);
    }

    const outputText = extractOutputText(payload);
    if (!outputText) throw new PublicError("OpenAI did not return recipe JSON.", 502);

    const recipe = JSON.parse(outputText);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ recipe, usage: payload.usage || null }));
  } catch (error) {
    const status = error instanceof PublicError ? error.status : 500;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Recipe extraction failed." }));
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
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8") || "{}");
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text || "{}");
}

function isAllowedImageDataUrl(value) {
  return typeof value === "string" && /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
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

class PublicError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
