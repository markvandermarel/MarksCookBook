import XCTest
@testable import RecipeCookbook

final class ServingScalerTests: XCTestCase {
    func testScalesAmountByServingRatio() {
        let scaler = ServingScalerService(
            fractionFormatter: FractionFormatter(),
            unitConversionService: UnitConversionService()
        )

        XCTAssertEqual(scaler.scaledAmount(2, originalServings: 4, targetServings: 6), 3, accuracy: 0.001)
    }

    func testDisplaysScaledFraction() {
        let ingredient = Ingredient(
            order: 0,
            amount: 1,
            unit: .cup,
            name: "rice",
            originalText: "1 cup rice"
        )
        let scaler = ServingScalerService(
            fractionFormatter: FractionFormatter(),
            unitConversionService: UnitConversionService()
        )

        let text = scaler.displayText(
            for: ingredient,
            originalServings: 4,
            targetServings: 2,
            unitSystem: .original
        )

        XCTAssertEqual(text, "1/2 cup rice")
    }
}
