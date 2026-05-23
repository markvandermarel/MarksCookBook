import Foundation

struct ServingScalerService {
    let fractionFormatter: FractionFormatter
    let unitConversionService: UnitConversionService

    func scaledAmount(_ amount: Double, originalServings: Double, targetServings: Double) -> Double {
        guard originalServings > 0 else { return amount }
        return amount * targetServings / originalServings
    }

    func displayText(
        for ingredient: Ingredient,
        originalServings: Double,
        targetServings: Double,
        unitSystem: UnitSystem
    ) -> String {
        guard let amount = ingredient.amount else {
            return ingredient.originalText
        }

        let scaled = scaledAmount(amount, originalServings: originalServings, targetServings: targetServings)
        let converted: UnitConversionResult

        if let unit = ingredient.unit {
            converted = unitConversionService.convert(amount: scaled, from: unit, to: unitSystem)
        } else {
            converted = UnitConversionResult(amount: scaled, unit: .piece, warning: nil)
        }

        let amountText = fractionFormatter.string(from: converted.amount)
        let unitText = ingredient.unit == nil ? "" : "\(converted.unit.displayName) "
        let warning = converted.warning.map { " \($0)" } ?? ""
        let note = ingredient.preparationNote.map { ", \($0)" } ?? ""

        return "\(amountText) \(unitText)\(ingredient.name)\(note)\(warning)"
            .replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
