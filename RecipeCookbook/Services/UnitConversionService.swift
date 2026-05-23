import Foundation

struct UnitConversionResult: Equatable {
    var amount: Double
    var unit: CookingUnit
    var warning: String?
}

struct UnitConversionService {
    func convert(amount: Double, from sourceUnit: CookingUnit, to targetSystem: UnitSystem) -> UnitConversionResult {
        guard targetSystem != .original else {
            return UnitConversionResult(amount: amount, unit: sourceUnit, warning: nil)
        }

        let targetUnit = preferredUnit(for: sourceUnit, in: targetSystem)
        guard targetUnit != sourceUnit else {
            return UnitConversionResult(amount: amount, unit: sourceUnit, warning: nil)
        }

        guard targetUnit.dimension == sourceUnit.dimension else {
            return UnitConversionResult(
                amount: amount,
                unit: sourceUnit,
                warning: "Density-specific conversion unavailable; original unit preserved."
            )
        }

        switch sourceUnit.dimension {
        case .mass:
            let grams = amount * gramsPerUnit(sourceUnit)
            return UnitConversionResult(amount: grams / gramsPerUnit(targetUnit), unit: targetUnit, warning: nil)
        case .volume:
            let milliliters = amount * millilitersPerUnit(sourceUnit, system: .us)
            return UnitConversionResult(
                amount: milliliters / millilitersPerUnit(targetUnit, system: targetSystem),
                unit: targetUnit,
                warning: sourceUnit == .cup && targetSystem != .us ? "Cup conversions are approximate." : nil
            )
        case .temperature:
            return UnitConversionResult(amount: convertTemperature(amount, from: sourceUnit, to: targetUnit), unit: targetUnit, warning: nil)
        case .count:
            return UnitConversionResult(amount: amount, unit: sourceUnit, warning: nil)
        }
    }

    func convert(amount: Double, from sourceUnit: CookingUnit, to targetUnit: CookingUnit) throws -> UnitConversionResult {
        guard sourceUnit.dimension == targetUnit.dimension else {
            throw AppError.unitConversionNotPossible
        }

        switch sourceUnit.dimension {
        case .mass:
            let grams = amount * gramsPerUnit(sourceUnit)
            return UnitConversionResult(amount: grams / gramsPerUnit(targetUnit), unit: targetUnit, warning: nil)
        case .volume:
            let milliliters = amount * millilitersPerUnit(sourceUnit, system: .us)
            return UnitConversionResult(amount: milliliters / millilitersPerUnit(targetUnit, system: .us), unit: targetUnit, warning: nil)
        case .temperature:
            return UnitConversionResult(amount: convertTemperature(amount, from: sourceUnit, to: targetUnit), unit: targetUnit, warning: nil)
        case .count:
            return UnitConversionResult(amount: amount, unit: targetUnit, warning: nil)
        }
    }

    private func preferredUnit(for sourceUnit: CookingUnit, in system: UnitSystem) -> CookingUnit {
        switch system {
        case .original:
            return sourceUnit
        case .metric:
            switch sourceUnit.dimension {
            case .mass:
                return sourceUnit == .pound || sourceUnit == .kilogram ? .kilogram : .gram
            case .volume:
                return sourceUnit == .liter ? .liter : .milliliter
            case .temperature:
                return .celsius
            case .count:
                return sourceUnit
            }
        case .us, .british:
            switch sourceUnit.dimension {
            case .mass:
                return sourceUnit == .kilogram || sourceUnit == .pound ? .pound : .ounce
            case .volume:
                if sourceUnit == .liter || sourceUnit == .milliliter {
                    return .cup
                }
                return sourceUnit
            case .temperature:
                return .fahrenheit
            case .count:
                return sourceUnit
            }
        }
    }

    private func gramsPerUnit(_ unit: CookingUnit) -> Double {
        switch unit {
        case .gram: 1
        case .kilogram: 1_000
        case .ounce: 28.349523125
        case .pound: 453.59237
        default: 1
        }
    }

    private func millilitersPerUnit(_ unit: CookingUnit, system: UnitSystem) -> Double {
        switch unit {
        case .milliliter: 1
        case .liter: 1_000
        case .teaspoon: system == .british ? 5.91939 : 4.92892159375
        case .tablespoon: system == .british ? 17.7582 : 14.78676478125
        case .fluidOunce: system == .british ? 28.4130625 : 29.5735295625
        case .cup: system == .british ? 284.130625 : 236.5882365
        default: 1
        }
    }

    private func convertTemperature(_ amount: Double, from sourceUnit: CookingUnit, to targetUnit: CookingUnit) -> Double {
        guard sourceUnit != targetUnit else { return amount }

        if sourceUnit == .fahrenheit && targetUnit == .celsius {
            return (amount - 32) * 5 / 9
        }

        if sourceUnit == .celsius && targetUnit == .fahrenheit {
            return amount * 9 / 5 + 32
        }

        return amount
    }
}
