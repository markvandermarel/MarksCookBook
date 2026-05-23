import Foundation

struct ParsedRecipe {
    var title: String
    var description: String
    var ingredients: [ParsedIngredient]
    var instructionSteps: [String]
    var servings: Double?
    var sourceType: SourceType
    var sourceMetadata: SourceMetadataPayload?
    var images: [ParsedRecipeImage]

    static let empty = ParsedRecipe(
        title: "Untitled Recipe",
        description: "",
        ingredients: [],
        instructionSteps: [],
        servings: nil,
        sourceType: .manual,
        sourceMetadata: nil,
        images: []
    )
}

struct ParsedIngredient: Equatable {
    var amount: Double?
    var unit: CookingUnit?
    var name: String
    var preparationNote: String?
    var originalText: String
}

struct SourceMetadataPayload: Equatable {
    var sourceURLString: String?
    var sourceName: String?
    var author: String?
    var originalImageURLString: String?
}

struct ParsedRecipeImage: Equatable {
    var type: RecipeImageType
    var localFileName: String?
    var oneDrivePath: String?
    var remoteURLString: String?
    var syncStatus: SyncStatus
}

struct StoredImageReference: Equatable {
    var localFileName: String
    var oneDrivePath: String?
    var syncStatus: SyncStatus
    var uploadWarning: String?
}
