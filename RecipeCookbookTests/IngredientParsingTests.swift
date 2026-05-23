import XCTest
@testable import RecipeCookbook

final class IngredientParsingTests: XCTestCase {
    func testParsesMixedFractionCupIngredient() {
        let ingredient = IngredientLineParser().parse("1 1/2 cups all-purpose flour")

        XCTAssertEqual(ingredient.amount ?? 0, 1.5, accuracy: 0.001)
        XCTAssertEqual(ingredient.unit, .cup)
        XCTAssertEqual(ingredient.name, "all-purpose flour")
        XCTAssertEqual(ingredient.originalText, "1 1/2 cups all-purpose flour")
    }

    func testParsesPreparationNote() {
        let ingredient = IngredientLineParser().parse("2 tbsp finely chopped parsley")

        XCTAssertEqual(ingredient.amount ?? 0, 2, accuracy: 0.001)
        XCTAssertEqual(ingredient.unit, .tablespoon)
        XCTAssertEqual(ingredient.name, "parsley")
        XCTAssertEqual(ingredient.preparationNote, "finely chopped")
    }
}
