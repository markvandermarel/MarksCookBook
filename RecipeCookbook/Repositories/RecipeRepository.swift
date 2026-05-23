import Foundation
import SwiftData

@MainActor
protocol RecipeRepository {
    @discardableResult
    func createRecipe(from parsedRecipe: ParsedRecipe) throws -> Recipe
    func delete(_ recipe: Recipe) throws
    func save() throws
}

@MainActor
struct SwiftDataRecipeRepository: RecipeRepository {
    let context: ModelContext

    @discardableResult
    func createRecipe(from parsedRecipe: ParsedRecipe) throws -> Recipe {
        let recipe = Recipe(
            title: parsedRecipe.title,
            recipeDescription: parsedRecipe.description,
            originalServings: parsedRecipe.servings ?? 4,
            sourceType: parsedRecipe.sourceType
        )

        recipe.ingredients = parsedRecipe.ingredients.enumerated().map { index, parsed in
            let ingredient = Ingredient(
                order: index,
                amount: parsed.amount,
                unit: parsed.unit,
                name: parsed.name,
                preparationNote: parsed.preparationNote,
                originalText: parsed.originalText
            )
            ingredient.recipe = recipe
            return ingredient
        }

        recipe.instructionSteps = parsedRecipe.instructionSteps.enumerated().map { index, text in
            let step = InstructionStep(order: index, text: text)
            step.recipe = recipe
            return step
        }

        recipe.images = parsedRecipe.images.map { parsed in
            let image = RecipeImage(
                type: parsed.type,
                localFileName: parsed.localFileName,
                oneDrivePath: parsed.oneDrivePath,
                remoteURLString: parsed.remoteURLString,
                syncStatus: parsed.syncStatus
            )
            image.recipe = recipe
            return image
        }

        if let metadata = parsedRecipe.sourceMetadata {
            let sourceMetadata = SourceMetadata(
                sourceURLString: metadata.sourceURLString,
                sourceName: metadata.sourceName,
                author: metadata.author,
                originalImageURLString: metadata.originalImageURLString
            )
            sourceMetadata.recipe = recipe
            recipe.sourceMetadata = sourceMetadata
        }

        context.insert(recipe)
        try context.save()
        return recipe
    }

    func delete(_ recipe: Recipe) throws {
        context.delete(recipe)
        try context.save()
    }

    func save() throws {
        try context.save()
    }
}
