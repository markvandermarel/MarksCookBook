import XCTest
@testable import RecipeCookbook

final class RecipeSearchTests: XCTestCase {
    func testFiltersBySearchTextAndAllIngredients() {
        let pasta = Recipe(title: "Tomato Pasta")
        pasta.ingredients = [
            Ingredient(order: 0, amount: 200, unit: .gram, name: "spaghetti", originalText: "200 g spaghetti"),
            Ingredient(order: 1, amount: 2, unit: .cup, name: "tomatoes", originalText: "2 cups tomatoes")
        ]

        let soup = Recipe(title: "Carrot Soup")
        soup.ingredients = [
            Ingredient(order: 0, amount: 4, unit: .piece, name: "carrots", originalText: "4 carrots")
        ]

        let results = RecipeSearchService().filter(
            recipes: [pasta, soup],
            searchText: "pasta",
            selectedIngredients: ["spaghetti", "tomatoes"],
            matchMode: .all
        )

        XCTAssertEqual(results.map(\.title), ["Tomato Pasta"])
    }

    func testFiltersByAnyIngredient() {
        let toast = Recipe(title: "Avocado Toast")
        toast.ingredients = [
            Ingredient(order: 0, amount: 1, unit: .piece, name: "avocado", originalText: "1 avocado")
        ]

        let results = RecipeSearchService().filter(
            recipes: [toast],
            searchText: "",
            selectedIngredients: ["tomato", "avocado"],
            matchMode: .any
        )

        XCTAssertEqual(results.count, 1)
    }
}
