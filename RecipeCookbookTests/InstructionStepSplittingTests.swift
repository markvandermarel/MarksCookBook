import XCTest
@testable import RecipeCookbook

final class InstructionStepSplittingTests: XCTestCase {
    func testSplitsNumberedInlineInstructions() {
        let steps = InstructionStepSplitter().split("1. Heat the oven. 2. Mix the batter. 3. Bake until golden.")

        XCTAssertEqual(steps, ["Heat the oven.", "Mix the batter.", "Bake until golden."])
    }

    func testSplitsMultilineInstructions() {
        let steps = InstructionStepSplitter().split("""
        Preheat the oven.
        Stir the sauce.
        Serve warm.
        """)

        XCTAssertEqual(steps.count, 3)
        XCTAssertEqual(steps.last, "Serve warm.")
    }
}
