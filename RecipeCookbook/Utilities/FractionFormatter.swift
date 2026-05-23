import Foundation

struct FractionFormatter {
    func string(from value: Double, maxDenominator: Int = 16) -> String {
        guard value.isFinite else { return "" }

        let sign = value < 0 ? "-" : ""
        let absolute = abs(value)
        let whole = Int(absolute.rounded(.down))
        let fractional = absolute - Double(whole)

        if fractional < 0.0001 {
            return "\(sign)\(whole)"
        }

        var bestNumerator = 1
        var bestDenominator = 1
        var smallestError = Double.greatestFiniteMagnitude

        for denominator in 2...maxDenominator {
            let numerator = Int((fractional * Double(denominator)).rounded())
            let error = abs(fractional - Double(numerator) / Double(denominator))

            if error < smallestError {
                smallestError = error
                bestNumerator = numerator
                bestDenominator = denominator
            }
        }

        if bestNumerator == bestDenominator {
            return "\(sign)\(whole + 1)"
        }

        let gcd = greatestCommonDivisor(bestNumerator, bestDenominator)
        bestNumerator /= gcd
        bestDenominator /= gcd

        if whole == 0 {
            return "\(sign)\(bestNumerator)/\(bestDenominator)"
        }

        return "\(sign)\(whole) \(bestNumerator)/\(bestDenominator)"
    }

    private func greatestCommonDivisor(_ lhs: Int, _ rhs: Int) -> Int {
        var a = abs(lhs)
        var b = abs(rhs)

        while b != 0 {
            let remainder = a % b
            a = b
            b = remainder
        }

        return max(a, 1)
    }
}
