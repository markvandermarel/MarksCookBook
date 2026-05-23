import Foundation

struct RecipeSearchService {
    func filter(
        recipes: [Recipe],
        searchText: String,
        selectedIngredients: Set<String>,
        matchMode: IngredientMatchMode
    ) -> [Recipe] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return recipes.filter { recipe in
            let ingredientNames = Set(recipe.ingredients.map { $0.name.lowercased() })
            let matchesQuery = query.isEmpty
                || recipe.title.lowercased().contains(query)
                || ingredientNames.contains(where: { $0.contains(query) })

            guard matchesQuery else { return false }
            guard !selectedIngredients.isEmpty else { return true }

            let selected = Set(selectedIngredients.map { $0.lowercased() })

            switch matchMode {
            case .all:
                return selected.allSatisfy { selectedName in
                    ingredientNames.contains(where: { $0.contains(selectedName) })
                }
            case .any:
                return selected.contains(where: { selectedName in
                    ingredientNames.contains(where: { $0.contains(selectedName) })
                })
            }
        }
    }
}
