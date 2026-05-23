import SwiftUI

struct IngredientsView: View {
    let recipe: Recipe
    @ObservedObject var viewModel: RecipeDetailViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ingredients")
                .font(.title2.bold())

            VStack(alignment: .leading, spacing: 10) {
                ForEach(recipe.sortedIngredients) { ingredient in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "circle.fill")
                            .font(.system(size: 7))
                            .foregroundStyle(.secondary)
                            .padding(.top, 8)

                        VStack(alignment: .leading, spacing: 3) {
                            Text(viewModel.ingredientText(for: ingredient, recipe: recipe))
                                .font(.body)
                                .fixedSize(horizontal: false, vertical: true)

                            if ingredient.amount == nil {
                                Text("Quantity kept as written")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
    }
}
