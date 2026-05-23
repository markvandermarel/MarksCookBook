import XCTest
@testable import RecipeCookbook

final class UnitConversionTests: XCTestCase {
    func testConvertsPoundsToGrams() throws {
        let result = try UnitConversionService().convert(amount: 1, from: .pound, to: .gram)

        XCTAssertEqual(result.amount, 453.592, accuracy: 0.01)
        XCTAssertEqual(result.unit, .gram)
    }

    func testConvertsFahrenheitToCelsius() throws {
        let result = try UnitConversionService().convert(amount: 350, from: .fahrenheit, to: .celsius)

        XCTAssertEqual(result.amount, 176.667, accuracy: 0.01)
        XCTAssertEqual(result.unit, .celsius)
    }
}
