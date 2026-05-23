import assert from "node:assert/strict";
import { extractRecipeFromHTML, parseIngredientLine, parseRecipeText, splitInstructions } from "../src/parser.js";
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

console.log("PWA parser/unit tests passed.");
