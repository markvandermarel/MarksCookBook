import Foundation

protocol RecipeParsing {
    func parse(text: String, source: SourceType, metadata: SourceMetadataPayload?) -> ParsedRecipe
}

// TODO: Add an LLM/API-backed parser here by conforming to RecipeParsing and swapping it in AppServices.
struct DeterministicRecipeParsingService: RecipeParsing {
    private let ingredientParser: IngredientLineParser
    private let stepSplitter: InstructionStepSplitter

    init(
        ingredientParser: IngredientLineParser = IngredientLineParser(),
        stepSplitter: InstructionStepSplitter = InstructionStepSplitter()
    ) {
        self.ingredientParser = ingredientParser
        self.stepSplitter = stepSplitter
    }

    func parse(text: String, source: SourceType, metadata: SourceMetadataPayload? = nil) -> ParsedRecipe {
        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.normalizedRecipeLine }
            .filter { !$0.isEmpty }

        guard !lines.isEmpty else {
            return ParsedRecipe.empty
        }

        let title = detectTitle(in: lines)
        let servings = detectServings(in: lines)
        let sections = splitSections(lines: lines)
        let description = sections.descriptionLines
            .filter { $0.caseInsensitiveCompare(title) != .orderedSame }
            .joined(separator: " ")

        let ingredients = sections.ingredientLines
            .enumerated()
            .map { _, line in ingredientParser.parse(line) }
            .filter { !$0.name.isEmpty || !$0.originalText.isEmpty }

        let instructionText = sections.instructionLines.joined(separator: "\n")
        let steps = stepSplitter.split(instructionText)

        return ParsedRecipe(
            title: title,
            description: description,
            ingredients: ingredients,
            instructionSteps: steps,
            servings: servings,
            sourceType: source,
            sourceMetadata: metadata,
            images: []
        )
    }

    private func detectTitle(in lines: [String]) -> String {
        let headings = Set(["ingredients", "ingredient", "instructions", "directions", "method", "preparation"])

        return lines.first { line in
            let key = line.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ":"))
            return !headings.contains(key) && !line.lowercased().hasPrefix("serves ")
        } ?? "Untitled Recipe"
    }

    private func detectServings(in lines: [String]) -> Double? {
        let text = lines.joined(separator: " ")
        let patterns = [
            #"(?i)\bserves\s*:?\s*(\d+(?:\.\d+)?)"#,
            #"(?i)\byields?\s*:?\s*(\d+(?:\.\d+)?)"#,
            #"(?i)\bmakes\s*:?\s*(\d+(?:\.\d+)?)"#,
            #"(?i)\bportions?\s*:?\s*(\d+(?:\.\d+)?)"#
        ]

        for pattern in patterns {
            if let value = text.firstCapture(for: pattern).flatMap({ Double($0) }) {
                return value
            }
        }

        return nil
    }

    private func splitSections(lines: [String]) -> RecipeSections {
        enum Section {
            case description
            case ingredients
            case instructions
        }

        var currentSection = Section.description
        var description: [String] = []
        var ingredients: [String] = []
        var instructions: [String] = []
        var sawExplicitIngredientHeading = false
        var sawExplicitInstructionHeading = false

        for line in lines {
            let normalized = line.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ":"))

            if ["ingredients", "ingredient", "you need"].contains(normalized) {
                currentSection = .ingredients
                sawExplicitIngredientHeading = true
                continue
            }

            if ["instructions", "directions", "method", "preparation", "steps"].contains(normalized) {
                currentSection = .instructions
                sawExplicitInstructionHeading = true
                continue
            }

            if !sawExplicitIngredientHeading && ingredientParser.looksLikeIngredient(line) {
                currentSection = .ingredients
            }

            if !sawExplicitInstructionHeading && currentSection == .ingredients && looksLikeInstructionStart(line) {
                currentSection = .instructions
            }

            switch currentSection {
            case .description:
                description.append(line)
            case .ingredients:
                if ingredientParser.looksLikeIngredient(line) || sawExplicitIngredientHeading {
                    ingredients.append(line)
                } else if sawExplicitIngredientHeading {
                    ingredients.append(line)
                } else {
                    instructions.append(line)
                    currentSection = .instructions
                }
            case .instructions:
                instructions.append(line)
            }
        }

        if instructions.isEmpty, !ingredients.isEmpty {
            let splitIndex = ingredients.firstIndex { looksLikeInstructionStart($0) }
            if let splitIndex {
                instructions = Array(ingredients[splitIndex...])
                ingredients = Array(ingredients[..<splitIndex])
            }
        }

        return RecipeSections(
            descriptionLines: description,
            ingredientLines: ingredients,
            instructionLines: instructions
        )
    }

    private func looksLikeInstructionStart(_ line: String) -> Bool {
        let lower = line.lowercased()
        let verbs = ["preheat", "heat", "mix", "stir", "combine", "bake", "cook", "bring", "add", "whisk", "pour", "season"]
        return line.range(of: #"^\d+[\.)]\s+"#, options: .regularExpression) != nil
            || verbs.contains(where: { lower.hasPrefix($0 + " ") })
    }
}

private struct RecipeSections {
    var descriptionLines: [String]
    var ingredientLines: [String]
    var instructionLines: [String]
}

struct IngredientLineParser {
    private let knownPreparationWords = [
        "chopped", "finely chopped", "diced", "finely diced", "minced", "sliced",
        "grated", "melted", "softened", "room temperature", "peeled", "crushed"
    ]

    func parse(_ line: String) -> ParsedIngredient {
        let original = line.normalizedRecipeLine
        let tokens = original.split(separator: " ").map(String.init)
        let quantity = parseLeadingQuantity(tokens)
        var consumed = quantity.consumedTokenCount
        var unit: CookingUnit?

        if consumed < tokens.count {
            let oneToken = tokens[consumed]
            let twoToken = consumed + 1 < tokens.count ? "\(tokens[consumed]) \(tokens[consumed + 1])" : nil

            if let twoToken, let parsedUnit = CookingUnit.from(token: twoToken) {
                unit = parsedUnit
                consumed += 2
            } else if let parsedUnit = CookingUnit.from(token: oneToken) {
                unit = parsedUnit
                consumed += 1
            }
        }

        let remaining = tokens.dropFirst(consumed).joined(separator: " ")
        let note = preparationNote(in: remaining)
        let name = cleanIngredientName(remaining, note: note)

        return ParsedIngredient(
            amount: quantity.value,
            unit: unit,
            name: name.isEmpty ? original : name,
            preparationNote: note,
            originalText: original
        )
    }

    func looksLikeIngredient(_ line: String) -> Bool {
        let tokens = line.normalizedRecipeLine.split(separator: " ").map(String.init)
        guard !tokens.isEmpty else { return false }

        if parseLeadingQuantity(tokens).value != nil {
            return true
        }

        let lower = line.lowercased()
        return CookingUnit.allCases.contains(where: { lower.hasPrefix($0.displayName + " ") })
    }

    private func parseLeadingQuantity(_ tokens: [String]) -> (value: Double?, consumedTokenCount: Int) {
        guard let first = tokens.first else {
            return (nil, 0)
        }

        if let value = parseQuantityToken(first) {
            if tokens.count > 1, let fraction = parseFraction(tokens[1]), !first.contains("/") {
                return (value + fraction, 2)
            }
            return (value, 1)
        }

        return (nil, 0)
    }

    private func parseQuantityToken(_ token: String) -> Double? {
        let cleaned = token
            .lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: "~+"))
            .replacingOccurrences(of: ",", with: ".")

        if let mapped = unicodeFraction(cleaned) {
            return mapped
        }

        if cleaned.contains("-") {
            return cleaned.split(separator: "-").first.flatMap { parseQuantityToken(String($0)) }
        }

        if let fraction = parseFraction(cleaned) {
            return fraction
        }

        return Double(cleaned)
    }

    private func parseFraction(_ token: String) -> Double? {
        let pieces = token.split(separator: "/")
        guard pieces.count == 2,
              let numerator = Double(pieces[0]),
              let denominator = Double(pieces[1]),
              denominator != 0
        else {
            return nil
        }
        return numerator / denominator
    }

    private func unicodeFraction(_ token: String) -> Double? {
        let map: [String: Double] = [
            "1/2": 0.5, "½": 0.5,
            "1/3": 1.0 / 3.0, "⅓": 1.0 / 3.0,
            "2/3": 2.0 / 3.0, "⅔": 2.0 / 3.0,
            "1/4": 0.25, "¼": 0.25,
            "3/4": 0.75, "¾": 0.75,
            "1/8": 0.125, "⅛": 0.125
        ]
        return map[token]
    }

    private func preparationNote(in text: String) -> String? {
        let lower = text.lowercased()
        return knownPreparationWords.first { lower.contains($0) }
    }

    private func cleanIngredientName(_ text: String, note: String?) -> String {
        var cleaned = text
        if let note {
            cleaned = cleaned.replacingOccurrences(of: note, with: "", options: .caseInsensitive)
        }
        cleaned = cleaned.replacingOccurrences(of: #"\([^)]*\)"#, with: "", options: .regularExpression)
        cleaned = cleaned.trimmingCharacters(in: CharacterSet(charactersIn: " ,.-"))
        return cleaned
    }
}

struct InstructionStepSplitter {
    func split(_ text: String) -> [String] {
        let normalized = text
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalized.isEmpty else { return [] }

        let numbered = numberedSteps(from: normalized)
        if numbered.count > 1 {
            return numbered
        }

        let lineSteps = normalized
            .components(separatedBy: .newlines)
            .map { $0.removingLeadingStepMarker.normalizedRecipeLine }
            .filter { !$0.isEmpty }

        if lineSteps.count > 1 {
            return lineSteps
        }

        return splitSentences(normalized)
    }

    private func numberedSteps(from text: String) -> [String] {
        let pattern = #"(?is)(?:^|\s)(?:step\s*)?\d+[\.)]\s+(.*?)(?=(?:\s+(?:step\s*)?\d+[\.)]\s+)|$)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)

        return regex.matches(in: text, range: range).compactMap { match in
            guard let stepRange = Range(match.range(at: 1), in: text) else { return nil }
            let value = String(text[stepRange]).normalizedRecipeLine
            return value.isEmpty ? nil : value
        }
    }

    private func splitSentences(_ text: String) -> [String] {
        let protected = text.replacingOccurrences(of: "\n", with: " ")
        let pieces = protected.components(separatedBy: ". ")

        guard pieces.count > 1 else {
            return [text.removingLeadingStepMarker.normalizedRecipeLine]
        }

        return pieces.map { piece in
            let trimmed = piece.normalizedRecipeLine
            return trimmed.hasSuffix(".") ? trimmed : trimmed + "."
        }
    }
}

private extension String {
    var removingLeadingStepMarker: String {
        replacingOccurrences(
            of: #"^(?:step\s*)?\d+[\.)]\s*"#,
            with: "",
            options: [.regularExpression, .caseInsensitive]
        )
    }
}
