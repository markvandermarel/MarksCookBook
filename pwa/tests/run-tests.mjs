import assert from "node:assert/strict";
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

const ocrParsed = parseRecipeText(`
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
assert.equal(ocrParsed.title, "Blueberry Muffins");
assert.equal(ocrParsed.originalServings, 6);
assert.equal(ocrParsed.ingredients.length, 3);
assert.equal(ocrParsed.ingredients[0].amount, 0.5);
assert.equal(ocrParsed.instructions.length, 3);

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

console.log("PWA parser/unit tests passed.");
