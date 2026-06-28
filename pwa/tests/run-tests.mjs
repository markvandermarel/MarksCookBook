import assert from "node:assert/strict";
import extractRecipeHandler from "../../api/extract-recipe.js";
import { recipeFromExtractedRecipe } from "../src/aiRecipe.js";
import { extractRecipeFromHTML, importRecipeFromURL, parseIngredientLine, parseRecipeText, splitInstructions } from "../src/parser.js";
import { convertAmount, formatFraction, scaleAmount } from "../src/units.js";

if (!globalThis.crypto?.randomUUID) {
  const { webcrypto, randomUUID } = await import("node:crypto");
  globalThis.crypto = webcrypto;
  globalThis.crypto.randomUUID = randomUUID;
}

const ingredient = parseIngredientLine("1 1/2 cups all-purpose flour");
assert.equal(ingredient.amount, 1.5);
assert.equal(ingredient.unit, "cup");
assert.equal(ingredient.name, "all-purpose flour");

const prepared = parseIngredientLine("2 tbsp finely chopped parsley");
assert.equal(prepared.preparationNote, "finely chopped");
assert.equal(prepared.name, "parsley");

const unicodeIngredient = parseIngredientLine("\u00bd cup sugar");
assert.equal(unicodeIngredient.amount, 0.5);
assert.equal(unicodeIngredient.unit, "cup");

assert.deepEqual(splitInstructions("1. Heat the oven. 2. Mix the batter. 3. Bake until golden."), [
  "Heat the oven.",
  "Mix the batter.",
  "Bake until golden."
]);

const parsed = parseRecipeText(`
Lemon Pasta
Serves 4

Ingredients
200 g spaghetti
2 tbsp olive oil

Instructions
1. Cook the pasta.
2. Toss with lemon.
`);
assert.equal(parsed.title, "Lemon Pasta");
assert.equal(parsed.originalServings, 4);
assert.equal(parsed.ingredients.length, 2);
assert.equal(parsed.instructions.length, 2);

const noisyTextParsed = parseRecipeText(`
Blueberry Muffins
Serves 6
INGREDlENTS
\u2022 \u00bd cup sugar
\u2022 2 cups flour
\u2022 1 tsp baking powder
DIRECTIONS
Step 1 Heat the oven to 180C.
Step 2 Mix the dry ingredients.
Step 3 Bake until golden.
`);
assert.equal(noisyTextParsed.title, "Blueberry Muffins");
assert.equal(noisyTextParsed.originalServings, 6);
assert.equal(noisyTextParsed.ingredients.length, 3);
assert.equal(noisyTextParsed.ingredients[0].amount, 0.5);
assert.equal(noisyTextParsed.instructions.length, 3);

const germanScanParsed = parseRecipeText(`
SÄURE
FÜR 4 PERSONEN
als Hauptgericht
1 kleine rote Zwiebel, in
feine Ringe gehobelt
oder geschnitten (60 g)
1 EL Apfelessig
2 TL Zucker
600 ml Sonnenblumenöl
zum Frittieren
2 Blöcke fester Tofu
(à 280 g), trocken
getupft und in
2 cm große Würfel
geschnitten
2 EL Speisestärke
2 Zwiebeln, grob gewürfelt (300 g)
6 Knoblauchzehen, grob gehackt
60 ml Olivenöl
2 TL Kreuzkümmelsamen, im Mörser grob zerstoßen
2-3 getrocknete schwarze Limetten
(s. S. 18), in der Gewürzmühle zerkleinert
2 EL Tomatenmark
20 g Petersilie, grob gehackt
250 g Babyspinat
Salz und schwarzer Pfeffer
NOORS TOFU MIT SCHWARZER LIMETTE
Getrocknete Limetten verwenden wir schon seit Langem, doch in letzter Zeit deutlich häufiger.
Wir servieren dieses Gericht gern mit gedämpftem Reis oder warmem Fladenbrot.
1. Die Zwiebelringe mit dem Essig, 1 TL Zucker, und 1/8 TL Salz in eine kleine Schüssel geben und gut mischen.
2. Das Sonnenblumenöl in einer mittelgroßen Pfanne mit hohem Rand erhitzen. Die Tofuwürfel in einer Schüssel mit der Speisestärke durchschwenken.
3. Während der Tofu brät, die Sauce zubereiten. Zwiebelwürfel und Knoblauch im Mixer zerkleinern.
4. Zum Servieren das Ganze auf einer Platte anrichten und die marinierten Zwiebeln daraufgeben.
`);
assert.equal(germanScanParsed.title, "NOORS TOFU MIT SCHWARZER LIMETTE");
assert.equal(germanScanParsed.originalServings, 4);
assert.equal(germanScanParsed.ingredients.length, 15);
assert.ok(germanScanParsed.ingredients.some((item) => item.originalText.includes("1 EL Apfelessig")));
assert.ok(germanScanParsed.ingredients.some((item) => item.originalText === "Salz und schwarzer Pfeffer"));
assert.ok(germanScanParsed.description.includes("Getrocknete Limetten"));
assert.equal(germanScanParsed.instructions.length, 4);
assert.ok(germanScanParsed.instructions[0].text.startsWith("Die Zwiebelringe"));

const dutchParsed = parseRecipeText(`
Pompoensoep
Voor 4 personen
Ingrediënten
1 ui, gesneden
2 el olijfolie
500 g pompoen
Bereiding
1. Verwarm de olie in een pan.
2. Voeg de ui en pompoen toe.
3. Kook tot alles zacht is.
`);
assert.equal(dutchParsed.title, "Pompoensoep");
assert.equal(dutchParsed.originalServings, 4);
assert.equal(dutchParsed.ingredients.length, 3);
assert.equal(dutchParsed.ingredients[1].unit, "tablespoon");
assert.equal(dutchParsed.instructions.length, 3);

const englishScanParsed = parseRecipeText(`
SET CHEESECAKE WITH PLUM COMPOTE
SERVES EIGHT
400g cream cheese
200g mascarpone
125g caster sugar
200ml double cream
grated zest of 1 lemon
2 tbsp olive oil
500g plums, stoned and cut into small cubes
The day before serving, place the cream cheese, mascarpone and sugar in the bowl of an electric mixer.
Put the oil and orange rind in a small saucepan and place on a medium heat.
Preheat the oven to 190C.
To make the crumble, place the flour, sugar, butter and salt in a small bowl.
To assemble, spoon the cream mix on to individual plates.
`);
assert.equal(englishScanParsed.title, "SET CHEESECAKE WITH PLUM COMPOTE");
assert.equal(englishScanParsed.originalServings, 8);
assert.equal(englishScanParsed.ingredients.length, 7);
assert.equal(englishScanParsed.instructions.length, 5);
assert.ok(englishScanParsed.instructions[0].text.includes("day before serving"));

const aiExtracted = recipeFromExtractedRecipe({
  title: "TOMATO AND WATERMELON GAZPACHO",
  description: "I first made this during my sun-drenched days in Mallorca.",
  servings: 6,
  language: "en",
  ingredients: [
    { amount: 2, unit: "kg", name: "tomatoes", preparationNote: "blanched and peeled", originalText: "2kg tomatoes, blanched and peeled" },
    { amount: 5, unit: null, name: "garlic cloves", preparationNote: "roughly chopped", originalText: "5 garlic cloves, roughly chopped" },
    { amount: 400, unit: "g", name: "watermelon", preparationNote: "deseeded and chopped", originalText: "400g watermelon, deseeded and chopped" },
    { amount: 2, unit: "tbsp", name: "red wine vinegar", preparationNote: "", originalText: "2 tbsp red wine vinegar" }
  ],
  instructions: [
    { order: 0, text: "Preheat the oven to 200C." },
    { order: 1, text: "Place the bread in a medium bowl along with the oil and vinegar." },
    { order: 2, text: "Place the tomatoes and garlic in a blender and blend until smooth." },
    { order: 3, text: "To serve, pour the soup into individual bowls and top with croutons." }
  ],
  fullText: "TOMATO AND WATERMELON GAZPACHO",
  sourceMetadata: { sourceType: "photo", sourceName: "", sourceURL: "", notes: "" },
  warnings: [],
  confidence: 0.92
});
assert.equal(aiExtracted.title, "TOMATO AND WATERMELON GAZPACHO");
assert.equal(aiExtracted.originalServings, 6);
assert.equal(aiExtracted.ingredients.length, 4);
assert.equal(aiExtracted.ingredients[0].unit, "kilogram");
assert.equal(aiExtracted.instructions.length, 4);
assert.ok(aiExtracted.description.includes("sun-drenched days"));

const aiURLExtracted = recipeFromExtractedRecipe(
  {
    title: "Website Lemon Cake",
    description: "Bright cake from a recipe page.",
    servings: 8,
    language: "en",
    ingredients: [{ amount: 200, unit: "g", name: "flour", preparationNote: "", originalText: "200 g flour" }],
    instructions: [{ order: 0, text: "Bake until golden." }],
    fullText: "Website Lemon Cake",
    sourceMetadata: { sourceType: "url", sourceName: "Example Kitchen", sourceURL: "https://example.com/cake", notes: "" },
    warnings: [],
    confidence: 0.9
  },
  "url"
);
assert.equal(aiURLExtracted.sourceType, "url");
assert.equal(aiURLExtracted.sourceMetadata.sourceURL, "https://example.com/cake");
assert.equal(aiURLExtracted.sourceMetadata.sourceName, "Example Kitchen");

assert.equal(scaleAmount(2, 4, 6), 3);
assert.equal(formatFraction(1.5), "1 1/2");
const poundToMetric = convertAmount(1, "pound", "metric");
assert.equal(poundToMetric.unit, "kilogram");
assert.equal(Math.round(poundToMetric.amount * 1000), 454);

const html = `
<html><head><script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Tomato Soup",
  "description": "Simple soup.",
  "recipeYield": "4 servings",
  "recipeIngredient": ["2 cups tomatoes", "1 tsp salt"],
  "recipeInstructions": [
    {"@type": "HowToStep", "text": "Warm the pot."},
    {"@type": "HowToStep", "text": "Simmer the tomatoes."}
  ],
  "image": "https://example.com/soup.jpg"
}
</script></head><body></body></html>
`;
const extracted = extractRecipeFromHTML(html, "https://example.com/soup");
assert.equal(extracted.title, "Tomato Soup");
assert.equal(extracted.ingredients.length, 2);
assert.equal(extracted.images[0].remoteURL, "https://example.com/soup.jpg");

const readerMarkdown = `
Title: Vegetarian Pad Thai

## Recipe
Please click on the stars in the recipe card below
Fry up this vegetarian pad thai in a wok and dinner is ready in less than half an hour. Add tofu for a hearty vegetarian family dinner.
Prep Time 15 minutes
Cook Time 15 minutes
Total Time 30 minutes
Course: dinner, Lunch
Cuisine: Thai
Servings:
Calories: 589 kcal
*   ▢  14 oz[Extra Firm Tofu baked](https://ministryofcurry.com/how-to-cook-tofu/)
*   ▢  8 oz rice noodles A Taste of Thai linguini rice noodles
*   ▢  5 cups water
*   ▢  3 tablespoons[oil](https://amzn.to/4maZYU7)
*   ▢  1 tablespoon garlic minced
*   ▢  1 bunch scallions
*   ▢  1 small red pepper
*   ▢  1 small yellow pepper
*   ▢  2 eggs whisked
*   ▢  6 oz[Pad Thai Sauce](https://amzn.to/3kYtm11)**
*   ▢  3 cups bean sprouts
*   ▢  ½ cup[peanuts](https://amzn.to/3qab9Pj)roasted and coarsely chopped
*   ▢  ½ cup[cilantro](https://ministryofcurry.com/fresh-cilantro/)finely chopped
*   ▢  ½ lime cut into 4 wedges
*   Bring 5 cups of water to a full boil. Place the rice noodles in a bowl and pour hot water over them. Mix with a fork so the noodles separate and not stick to each other.
*   While the noodles are soaking, prep the vegetables. Cut the white portion of the scallions and chop into thin strips.
*   Heat half of the oil in a large wok over high heat. Add garlic, white scallions, and peppers.
*   Next add the cooked noodles, baked tofu, and the Pad Thai Sauce. Mix well with a pair of tongs.
*   Add bean sprouts. Add half of the chopped green scallions, half of the peanuts, and half of the cilantro.
*   Our favorite Pad Thai sauce is from the Maesri brand. It comes in a 9 oz jar and you can add more to taste.
*   The second choice for store-bought sauce would be Thai Kitchen Pad Thai Sauce.
**Homemade Pad Thai Sauce:**
Mix together the ingredients below in a small saucepan.
*   2 tablespoons soy sauce
`;
const readerExtracted = extractRecipeFromHTML(readerMarkdown, "https://ministryofcurry.com/vegetarian-pad-thai/");
assert.equal(readerExtracted.title, "Vegetarian Pad Thai");
assert.equal(readerExtracted.description, "Fry up this vegetarian pad thai in a wok and dinner is ready in less than half an hour. Add tofu for a hearty vegetarian family dinner.");
assert.equal(readerExtracted.ingredients.length, 14);
assert.equal(readerExtracted.instructions.length, 5);
assert.ok(readerExtracted.ingredients.some((item) => item.originalText === "1/2 cup peanuts roasted and coarsely chopped"));
assert.ok(!readerExtracted.instructions.some((step) => step.text.includes("Our favorite Pad Thai sauce")));

const originalFetch = globalThis.fetch;
const appShell = `<!doctype html><html><head><title>Recipe Cookbook</title></head><body><button id="addRecipeButton">+</button></body></html>`;
const requestedURLs = [];
globalThis.fetch = async (url) => {
  requestedURLs.push(String(url));
  return {
    ok: true,
    status: 200,
    text: async () => (String(url).includes("r.jina.ai") ? readerMarkdown : appShell)
  };
};

try {
  const importedFromFallback = await importRecipeFromURL("https://ministryofcurry.com/vegetarian-pad-thai/");
  assert.equal(importedFromFallback.title, "Vegetarian Pad Thai");
  assert.equal(importedFromFallback.ingredients.length, 14);
  assert.ok(requestedURLs.some((url) => url.includes("r.jina.ai")));
} finally {
  globalThis.fetch = originalFetch;
}

await withTemporaryEnv(
  {
    ALLOWED_ORIGIN: "",
    MOCK_RECIPE_EXTRACTION: "",
    OPENAI_API_KEY: ""
  },
  async () => {
    const response = await callExtractionAPI({
      headers: {
        host: "localhost:8080",
        origin: "http://localhost:8080"
      },
      body: {
        imageDataUrl: "data:image/jpeg;base64,abcd",
        fileName: "local-test.jpg",
        mimeType: "image/jpeg"
      }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.mock, true);
    assert.equal(response.payload.provider.mode, "mock");
    assert.equal(response.payload.recipe.title, "Mock Lemon Pasta");
  }
);

await withTemporaryEnv(
  {
    ALLOWED_ORIGIN: "",
    MOCK_RECIPE_EXTRACTION: "",
    OPENAI_API_KEY: ""
  },
  async () => {
    const response = await callExtractionAPI({
      headers: {
        host: "localhost:8080",
        origin: "http://localhost:8080"
      },
      body: {
        sourceType: "url",
        url: "https://example.com/lemon-pasta"
      }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.mock, true);
    assert.equal(response.payload.provider.mode, "mock");
    assert.equal(response.payload.recipe.sourceMetadata.sourceType, "url");
    assert.equal(response.payload.recipe.sourceMetadata.sourceURL, "https://example.com/lemon-pasta");
  }
);

await withTemporaryEnv(
  {
    ALLOWED_ORIGIN: "",
    MOCK_RECIPE_EXTRACTION: "false",
    OPENAI_API_KEY: ""
  },
  async () => {
    const response = await callExtractionAPI({
      headers: {
        host: "example.com",
        origin: "https://cookbook.example.com"
      },
      body: {
        imageDataUrl: "data:image/jpeg;base64,abcd",
        fileName: "missing-key.jpg",
        mimeType: "image/jpeg"
      }
    });
    assert.equal(response.statusCode, 503);
    assert.match(response.payload.error, /OPENAI_API_KEY/);
  }
);

await withTemporaryEnv(
  {
    ALLOWED_ORIGIN: "",
    MOCK_RECIPE_EXTRACTION: "false",
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "test-model"
  },
  async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      const request = JSON.parse(options.body);
      assert.equal(request.model, "test-model");
      assert.equal(request.input[0].content.length, 1);
      const prompt = request.input[0].content[0].text;
      assert.match(prompt, /Extract exactly one recipe from this recipe web page/);
      assert.match(prompt, /Lots of unrelated blog text/);
      assert.match(prompt, /sourceMetadata\.sourceType: "url"/);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            title: "Backend URL Pasta",
            description: "A recipe found by the backend.",
            servings: 2,
            language: "en",
            ingredients: [{ amount: 100, unit: "g", name: "pasta", preparationNote: "", originalText: "100 g pasta" }],
            instructions: [{ order: 0, text: "Boil the pasta." }],
            fullText: "Backend URL Pasta\n100 g pasta\nBoil the pasta.",
            sourceMetadata: {
              sourceType: "photo",
              sourceName: "Example Recipes",
              sourceURL: "https://wrong.example/recipe",
              notes: ""
            },
            warnings: [],
            confidence: 0.88
          }),
          usage: { input_tokens: 100, output_tokens: 50 }
        })
      };
    };

    try {
      const response = await callExtractionAPI({
        headers: {
          host: "cookbook.example.com",
          origin: "https://cookbook.example.com"
        },
        body: {
          sourceType: "url",
          url: "https://example.com/backend-url-pasta",
          pageText: "<html><body>Lots of unrelated blog text. <h2>Ingredients</h2><p>100 g pasta</p><h2>Instructions</h2><p>Boil the pasta.</p></body></html>"
        }
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.provider.name, "openai");
      assert.equal(response.payload.recipe.title, "Backend URL Pasta");
      assert.equal(response.payload.recipe.sourceMetadata.sourceType, "url");
      assert.equal(response.payload.recipe.sourceMetadata.sourceURL, "https://example.com/backend-url-pasta");
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
);

console.log("PWA parser/unit tests passed.");

async function callExtractionAPI({ method = "POST", headers = {}, body = {} }) {
  const chunks = [];
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk = "") {
      chunks.push(String(chunk));
    }
  };

  await extractRecipeHandler(
    {
      method,
      headers,
      body: JSON.stringify(body)
    },
    response
  );

  const text = chunks.join("");
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    payload: text ? JSON.parse(text) : {}
  };
}

async function withTemporaryEnv(values, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
