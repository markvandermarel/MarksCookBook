import Foundation
import SwiftData

enum SourceType: String, CaseIterable, Codable, Identifiable {
    case photo
    case url
    case manual

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .photo: "Photo"
        case .url: "Website"
        case .manual: "Manual"
        }
    }
}

enum RecipeImageType: String, CaseIterable, Codable, Identifiable {
    case scan
    case website
    case dish

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .scan: "Original Scan"
        case .website: "Website Image"
        case .dish: "Dish Photo"
        }
    }
}

enum SyncStatus: String, Codable {
    case localOnly
    case pendingUpload
    case uploaded
}

enum IngredientMatchMode: String, CaseIterable, Identifiable {
    case all
    case any

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: "Match All"
        case .any: "Match Any"
        }
    }
}

enum InstructionDisplayMode: String, CaseIterable, Identifiable {
    case fullText
    case stepByStep

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .fullText: "Full Text"
        case .stepByStep: "Step-by-Step"
        }
    }
}

enum UnitSystem: String, CaseIterable, Identifiable {
    case original
    case us
    case british
    case metric

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .original: "Original"
        case .us: "US"
        case .british: "British"
        case .metric: "Metric"
        }
    }
}

enum CookingUnit: String, CaseIterable, Codable, Identifiable {
    case cup
    case teaspoon
    case tablespoon
    case fluidOunce
    case ounce
    case pound
    case gram
    case kilogram
    case milliliter
    case liter
    case celsius
    case fahrenheit
    case piece

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .cup: "cup"
        case .teaspoon: "tsp"
        case .tablespoon: "tbsp"
        case .fluidOunce: "fl oz"
        case .ounce: "oz"
        case .pound: "lb"
        case .gram: "g"
        case .kilogram: "kg"
        case .milliliter: "ml"
        case .liter: "l"
        case .celsius: "C"
        case .fahrenheit: "F"
        case .piece: "piece"
        }
    }

    var dimension: UnitDimension {
        switch self {
        case .cup, .teaspoon, .tablespoon, .fluidOunce, .milliliter, .liter:
            .volume
        case .ounce, .pound, .gram, .kilogram:
            .mass
        case .celsius, .fahrenheit:
            .temperature
        case .piece:
            .count
        }
    }

    static func from(token: String) -> CookingUnit? {
        let normalized = token
            .lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: ".:,;()[]"))

        let aliases: [String: CookingUnit] = [
            "cup": .cup, "cups": .cup, "c": .cup,
            "teaspoon": .teaspoon, "teaspoons": .teaspoon, "tsp": .teaspoon, "tsps": .teaspoon,
            "tablespoon": .tablespoon, "tablespoons": .tablespoon, "tbsp": .tablespoon, "tbsps": .tablespoon, "tbs": .tablespoon,
            "fluid ounce": .fluidOunce, "fluid ounces": .fluidOunce, "fl oz": .fluidOunce, "floz": .fluidOunce,
            "ounce": .ounce, "ounces": .ounce, "oz": .ounce,
            "pound": .pound, "pounds": .pound, "lb": .pound, "lbs": .pound,
            "gram": .gram, "grams": .gram, "g": .gram,
            "kilogram": .kilogram, "kilograms": .kilogram, "kg": .kilogram,
            "milliliter": .milliliter, "milliliters": .milliliter, "millilitre": .milliliter, "millilitres": .milliliter, "ml": .milliliter,
            "liter": .liter, "liters": .liter, "litre": .liter, "litres": .liter, "l": .liter,
            "celsius": .celsius, "deg c": .celsius,
            "f": .fahrenheit, "fahrenheit": .fahrenheit,
            "piece": .piece, "pieces": .piece, "pc": .piece, "pcs": .piece
        ]

        return aliases[normalized]
    }
}

enum UnitDimension: String, Codable {
    case mass
    case volume
    case temperature
    case count
}

@Model
final class Recipe: Identifiable {
    @Attribute(.unique) var id: UUID
    var title: String
    var recipeDescription: String
    var originalServings: Double
    var currentServings: Double
    var sourceTypeRaw: String
    var cuisine: String?
    var tagList: String
    var prepTimeMinutes: Int?
    var cookTimeMinutes: Int?
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Ingredient.recipe)
    var ingredients: [Ingredient] = []

    @Relationship(deleteRule: .cascade, inverse: \InstructionStep.recipe)
    var instructionSteps: [InstructionStep] = []

    @Relationship(deleteRule: .cascade, inverse: \RecipeImage.recipe)
    var images: [RecipeImage] = []

    @Relationship(deleteRule: .cascade, inverse: \SourceMetadata.recipe)
    var sourceMetadata: SourceMetadata?

    init(
        id: UUID = UUID(),
        title: String,
        recipeDescription: String = "",
        originalServings: Double = 4,
        currentServings: Double? = nil,
        sourceType: SourceType = .manual,
        cuisine: String? = nil,
        tags: [String] = [],
        prepTimeMinutes: Int? = nil,
        cookTimeMinutes: Int? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.recipeDescription = recipeDescription
        self.originalServings = max(originalServings, 1)
        self.currentServings = currentServings ?? max(originalServings, 1)
        self.sourceTypeRaw = sourceType.rawValue
        self.cuisine = cuisine
        self.tagList = tags.joined(separator: ",")
        self.prepTimeMinutes = prepTimeMinutes
        self.cookTimeMinutes = cookTimeMinutes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var sourceType: SourceType {
        SourceType(rawValue: sourceTypeRaw) ?? .manual
    }

    var tags: [String] {
        get {
            tagList
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }
        set {
            tagList = newValue.joined(separator: ",")
        }
    }

    var sortedIngredients: [Ingredient] {
        ingredients.sorted { $0.order < $1.order }
    }

    var sortedSteps: [InstructionStep] {
        instructionSteps.sorted { $0.order < $1.order }
    }

    var sortedImages: [RecipeImage] {
        images.sorted { $0.createdAt < $1.createdAt }
    }
}

@Model
final class Ingredient: Identifiable {
    @Attribute(.unique) var id: UUID
    var order: Int
    var amount: Double?
    var unitRaw: String?
    var name: String
    var preparationNote: String?
    var originalText: String
    var recipe: Recipe?

    init(
        id: UUID = UUID(),
        order: Int,
        amount: Double? = nil,
        unit: CookingUnit? = nil,
        name: String,
        preparationNote: String? = nil,
        originalText: String
    ) {
        self.id = id
        self.order = order
        self.amount = amount
        self.unitRaw = unit?.rawValue
        self.name = name
        self.preparationNote = preparationNote
        self.originalText = originalText
    }

    var unit: CookingUnit? {
        get {
            guard let unitRaw else { return nil }
            return CookingUnit(rawValue: unitRaw)
        }
        set {
            unitRaw = newValue?.rawValue
        }
    }
}

@Model
final class InstructionStep: Identifiable {
    @Attribute(.unique) var id: UUID
    var order: Int
    var text: String
    var recipe: Recipe?

    init(id: UUID = UUID(), order: Int, text: String) {
        self.id = id
        self.order = order
        self.text = text
    }
}

@Model
final class RecipeImage: Identifiable {
    @Attribute(.unique) var id: UUID
    var typeRaw: String
    var localFileName: String?
    var oneDrivePath: String?
    var remoteURLString: String?
    var syncStatusRaw: String
    var createdAt: Date
    var recipe: Recipe?

    init(
        id: UUID = UUID(),
        type: RecipeImageType,
        localFileName: String? = nil,
        oneDrivePath: String? = nil,
        remoteURLString: String? = nil,
        syncStatus: SyncStatus = .localOnly,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.typeRaw = type.rawValue
        self.localFileName = localFileName
        self.oneDrivePath = oneDrivePath
        self.remoteURLString = remoteURLString
        self.syncStatusRaw = syncStatus.rawValue
        self.createdAt = createdAt
    }

    var type: RecipeImageType {
        get { RecipeImageType(rawValue: typeRaw) ?? .dish }
        set { typeRaw = newValue.rawValue }
    }

    var syncStatus: SyncStatus {
        get { SyncStatus(rawValue: syncStatusRaw) ?? .localOnly }
        set { syncStatusRaw = newValue.rawValue }
    }
}

@Model
final class SourceMetadata: Identifiable {
    @Attribute(.unique) var id: UUID
    var sourceURLString: String?
    var sourceName: String?
    var author: String?
    var originalImageURLString: String?
    var importedAt: Date
    var recipe: Recipe?

    init(
        id: UUID = UUID(),
        sourceURLString: String? = nil,
        sourceName: String? = nil,
        author: String? = nil,
        originalImageURLString: String? = nil,
        importedAt: Date = Date()
    ) {
        self.id = id
        self.sourceURLString = sourceURLString
        self.sourceName = sourceName
        self.author = author
        self.originalImageURLString = originalImageURLString
        self.importedAt = importedAt
    }

    var sourceURL: URL? {
        guard let sourceURLString else { return nil }
        return URL(string: sourceURLString)
    }
}
