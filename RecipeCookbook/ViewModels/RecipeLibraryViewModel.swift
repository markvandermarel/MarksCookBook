import Combine
import Foundation

@MainActor
final class RecipeLibraryViewModel: ObservableObject {
    @Published var searchText = ""
    @Published var selectedIngredients: Set<String> = []
    @Published var ingredientMatchMode: IngredientMatchMode = .all
    @Published var errorMessage: String?

    private let searchService = RecipeSearchService()

    func filteredRecipes(from recipes: [Recipe]) -> [Recipe] {
        searchService.filter(
            recipes: recipes,
            searchText: searchText,
            selectedIngredients: selectedIngredients,
            matchMode: ingredientMatchMode
        )
    }

    func allIngredientNames(from recipes: [Recipe]) -> [String] {
        let names = recipes
            .flatMap { $0.ingredients }
            .map(\.name)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        return Array(Set(names)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    func toggleIngredient(_ ingredient: String) {
        if selectedIngredients.contains(ingredient) {
            selectedIngredients.remove(ingredient)
        } else {
            selectedIngredients.insert(ingredient)
        }
    }

    func clearFilters() {
        selectedIngredients.removeAll()
        searchText = ""
    }
}
