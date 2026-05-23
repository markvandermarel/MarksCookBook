import XCTest
@testable import RecipeCookbook

final class URLRecipeExtractionTests: XCTestCase {
    func testExtractsSchemaOrgRecipeJSONLD() throws {
        let html = """
        <html>
          <head>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Recipe",
              "name": "Lemon Pasta",
              "description": "Bright weeknight pasta.",
              "recipeYield": "4 servings",
              "recipeIngredient": [
                "200 g spaghetti",
                "2 tbsp olive oil"
              ],
              "recipeInstructions": [
                {"@type": "HowToStep", "text": "Cook the pasta."},
                {"@type": "HowToStep", "text": "Toss with lemon and oil."}
              ],
              "image": "https://example.com/lemon.jpg"
            }
            </script>
          </head>
          <body></body>
        </html>
        """

        let importer = DefaultURLRecipeImportService()
        let recipe = try importer.importRecipe(fromHTML: html, sourceURL: URL(string: "https://example.com/recipe")!)

        XCTAssertEqual(recipe.title, "Lemon Pasta")
        XCTAssertEqual(recipe.servings ?? 0, 4, accuracy: 0.001)
        XCTAssertEqual(recipe.ingredients.count, 2)
        XCTAssertEqual(recipe.instructionSteps.count, 2)
        XCTAssertEqual(recipe.images.first?.remoteURLString, "https://example.com/lemon.jpg")
    }
}
