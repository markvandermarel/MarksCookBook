import Foundation

protocol URLRecipeImporting {
    func importRecipe(from url: URL) async throws -> ParsedRecipe
}

struct DefaultURLRecipeImportService: URLRecipeImporting {
    private let ingredientParser: IngredientLineParser
    private let fallbackParser: RecipeParsing

    init(
        ingredientParser: IngredientLineParser = IngredientLineParser(),
        fallbackParser: RecipeParsing = DeterministicRecipeParsingService()
    ) {
        self.ingredientParser = ingredientParser
        self.fallbackParser = fallbackParser
    }

    func importRecipe(from url: URL) async throws -> ParsedRecipe {
        let (data, response) = try await URLSession.shared.data(from: url)
        let html = String(data: data, encoding: .utf8)
            ?? String(data: data, encoding: .isoLatin1)
            ?? ""

        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode),
              !html.isEmpty
        else {
            throw AppError.urlCouldNotBeParsed
        }

        return try importRecipe(fromHTML: html, sourceURL: url)
    }

    func importRecipe(fromHTML html: String, sourceURL url: URL) throws -> ParsedRecipe {
        if let recipe = parseJSONLD(in: html, sourceURL: url) {
            return recipe
        }

        let metadata = SourceMetadataPayload(
            sourceURLString: url.absoluteString,
            sourceName: url.hostName,
            author: nil,
            originalImageURLString: nil
        )
        let text = html.strippingHTMLTags()
        var fallback = fallbackParser.parse(text: text, source: .url, metadata: metadata)
        if fallback.title == "Untitled Recipe" {
            fallback.title = html.firstCapture(for: #"(?is)<title[^>]*>(.*?)</title>"#)?
                .decodingCommonHTMLEntities()
                .normalizedRecipeLine ?? fallback.title
        }
        return fallback
    }

    private func parseJSONLD(in html: String, sourceURL: URL) -> ParsedRecipe? {
        let pattern = #"(?is)<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(html.startIndex..<html.endIndex, in: html)

        for match in regex.matches(in: html, range: range) {
            guard let scriptRange = Range(match.range(at: 1), in: html) else { continue }
            let jsonText = String(html[scriptRange]).decodingCommonHTMLEntities()
            guard let data = jsonText.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data),
                  let recipeObject = findRecipeObject(in: object)
            else {
                continue
            }

            return recipe(from: recipeObject, sourceURL: sourceURL)
        }

        return nil
    }

    private func recipe(from object: [String: Any], sourceURL: URL) -> ParsedRecipe {
        let title = stringValue(object["name"]) ?? "Untitled Recipe"
        let description = stringValue(object["description"]) ?? ""
        let author = authorName(from: object["author"])
        let imageURL = imageURLString(from: object["image"])
        let servings = servingValue(from: object["recipeYield"])

        let ingredientLines = (object["recipeIngredient"] as? [Any])?.compactMap { stringValue($0) } ?? []
        let ingredients = ingredientLines.map { ingredientParser.parse($0) }
        let steps = instructionSteps(from: object["recipeInstructions"])

        let metadata = SourceMetadataPayload(
            sourceURLString: sourceURL.absoluteString,
            sourceName: sourceURL.hostName,
            author: author,
            originalImageURLString: imageURL
        )

        let websiteImage = imageURL.map {
            ParsedRecipeImage(
                type: .website,
                localFileName: nil,
                oneDrivePath: nil,
                remoteURLString: $0,
                syncStatus: .localOnly
            )
        }

        return ParsedRecipe(
            title: title,
            description: description,
            ingredients: ingredients,
            instructionSteps: steps,
            servings: servings,
            sourceType: .url,
            sourceMetadata: metadata,
            images: websiteImage.map { [$0] } ?? []
        )
    }

    private func findRecipeObject(in object: Any) -> [String: Any]? {
        if let dictionary = object as? [String: Any] {
            if isRecipeType(dictionary["@type"]) {
                return dictionary
            }

            if let graph = dictionary["@graph"] as? [Any] {
                for item in graph {
                    if let found = findRecipeObject(in: item) {
                        return found
                    }
                }
            }

            for value in dictionary.values {
                if let found = findRecipeObject(in: value) {
                    return found
                }
            }
        }

        if let array = object as? [Any] {
            for item in array {
                if let found = findRecipeObject(in: item) {
                    return found
                }
            }
        }

        return nil
    }

    private func isRecipeType(_ value: Any?) -> Bool {
        if let string = value as? String {
            return string.lowercased().contains("recipe")
        }

        if let array = value as? [Any] {
            return array.contains(where: { isRecipeType($0) })
        }

        return false
    }

    private func instructionSteps(from value: Any?) -> [String] {
        if let string = stringValue(value) {
            return InstructionStepSplitter().split(string)
        }

        guard let array = value as? [Any] else { return [] }

        return array.flatMap { item -> [String] in
            if let string = stringValue(item) {
                return [string]
            }

            guard let dictionary = item as? [String: Any] else { return [] }

            if let text = stringValue(dictionary["text"]) {
                return [text]
            }

            if let nested = dictionary["itemListElement"] {
                return instructionSteps(from: nested)
            }

            return []
        }
        .map { $0.normalizedRecipeLine }
        .filter { !$0.isEmpty }
    }

    private func servingValue(from value: Any?) -> Double? {
        if let number = value as? NSNumber {
            return number.doubleValue
        }

        if let string = stringValue(value) {
            return string.firstCapture(for: #"(\d+(?:\.\d+)?)"#).flatMap { Double($0) }
        }

        if let array = value as? [Any] {
            return array.compactMap { servingValue(from: $0) }.first
        }

        return nil
    }

    private func imageURLString(from value: Any?) -> String? {
        if let string = stringValue(value) {
            return string
        }

        if let array = value as? [Any] {
            return array.compactMap { imageURLString(from: $0) }.first
        }

        if let dictionary = value as? [String: Any] {
            return stringValue(dictionary["url"]) ?? stringValue(dictionary["contentUrl"])
        }

        return nil
    }

    private func authorName(from value: Any?) -> String? {
        if let string = stringValue(value) {
            return string
        }

        if let dictionary = value as? [String: Any] {
            return stringValue(dictionary["name"])
        }

        if let array = value as? [Any] {
            return array.compactMap { authorName(from: $0) }.first
        }

        return nil
    }

    private func stringValue(_ value: Any?) -> String? {
        if let string = value as? String {
            let trimmed = string.decodingCommonHTMLEntities().normalizedRecipeLine
            return trimmed.isEmpty ? nil : trimmed
        }

        if let number = value as? NSNumber {
            return number.stringValue
        }

        return nil
    }
}

private extension URL {
    var hostName: String? {
        URLComponents(url: self, resolvingAgainstBaseURL: false)?.host
    }
}
