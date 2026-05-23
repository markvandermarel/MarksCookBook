import SwiftUI

struct RecipeListRowView: View {
    let recipe: Recipe
    let imageStorage: ImageStorageService

    private var thumbnail: RecipeImage? {
        recipe.sortedImages.first { $0.type == .dish }
            ?? recipe.sortedImages.first { $0.type == .website }
            ?? recipe.sortedImages.first
    }

    var body: some View {
        HStack(spacing: 14) {
            AsyncRecipeImageView(recipeImage: thumbnail, imageStorage: imageStorage)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 6) {
                Text(recipe.title)
                    .font(.headline)
                    .lineLimit(2)

                if !recipe.recipeDescription.isEmpty {
                    Text(recipe.recipeDescription)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                HStack(spacing: 10) {
                    Label("\(recipe.sortedIngredients.count)", systemImage: "carrot")
                    Label(recipe.sourceType.displayName, systemImage: recipe.sourceType == .url ? "link" : "camera")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }
}
