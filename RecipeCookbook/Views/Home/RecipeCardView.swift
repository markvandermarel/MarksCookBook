import SwiftUI

struct RecipeCardView: View {
    let recipe: Recipe
    let imageStorage: ImageStorageService

    private var image: RecipeImage? {
        recipe.sortedImages.first { $0.type == .dish }
            ?? recipe.sortedImages.first { $0.type == .website }
            ?? recipe.sortedImages.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AsyncRecipeImageView(recipeImage: image, imageStorage: imageStorage)
                .frame(height: 150)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            Text(recipe.title)
                .font(.headline)
                .lineLimit(2)

            Text("\(recipe.sortedIngredients.count) ingredients")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(10)
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
