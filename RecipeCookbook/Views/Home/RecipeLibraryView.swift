import SwiftData
import SwiftUI

struct RecipeLibraryView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject private var services: AppServices
    @Query(sort: \Recipe.updatedAt, order: .reverse) private var recipes: [Recipe]

    @StateObject private var viewModel = RecipeLibraryViewModel()
    @State private var selectedRecipeID: UUID?
    @State private var isShowingAddSheet = false
    @State private var isSyncingPendingUploads = false

    private var filteredRecipes: [Recipe] {
        viewModel.filteredRecipes(from: recipes)
    }

    private var allIngredientNames: [String] {
        viewModel.allIngredientNames(from: recipes)
    }

    private var selectedRecipe: Recipe? {
        filteredRecipes.first { $0.id == selectedRecipeID } ?? filteredRecipes.first
    }

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                iPadLayout
            } else {
                iPhoneLayout
            }
        }
        .sheet(isPresented: $isShowingAddSheet) {
            AddRecipeSheet(services: services)
        }
        .task {
            await syncPendingUploads()
        }
        .onChange(of: services.accountStatus) { _, _ in
            Task { await syncPendingUploads() }
        }
        .alert("OneDrive", isPresented: serviceMessageBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(services.lastServiceMessage ?? "")
        }
    }

    private var iPhoneLayout: some View {
        NavigationStack {
            recipeList
                .navigationTitle("Recipes")
                .searchable(text: $viewModel.searchText, prompt: "Search recipes or ingredients")
                .toolbar { libraryToolbar }
                .safeAreaInset(edge: .bottom) {
                    addRecipeButton
                        .padding()
                        .background(.bar)
                }
        }
    }

    private var iPadLayout: some View {
        NavigationSplitView {
            recipeSidebar
                .navigationTitle("Recipes")
                .searchable(text: $viewModel.searchText, prompt: "Search recipes or ingredients")
                .toolbar { libraryToolbar }
        } detail: {
            if let selectedRecipe {
                RecipeDetailView(recipe: selectedRecipe, services: services)
            } else {
                ContentUnavailableView(
                    "No Recipe Selected",
                    systemImage: "book.closed",
                    description: Text("Choose a recipe or add a new one.")
                )
            }
        }
    }

    private var recipeSidebar: some View {
        VStack(spacing: 0) {
            IngredientFilterBar(
                allIngredients: allIngredientNames,
                selectedIngredients: $viewModel.selectedIngredients,
                matchMode: $viewModel.ingredientMatchMode
            )
            .padding([.horizontal, .top])

            List(selection: $selectedRecipeID) {
                ForEach(filteredRecipes) { recipe in
                    RecipeListRowView(recipe: recipe, imageStorage: services.imageStorage)
                        .tag(recipe.id)
                        .contextMenu {
                            Button(role: .destructive) {
                                Task { await delete(recipe) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
                .onDelete { offsets in
                    Task { await delete(offsets) }
                }
            }
            .overlay {
                if filteredRecipes.isEmpty {
                    emptyState
                }
            }
        }
    }

    private var recipeList: some View {
        List {
            IngredientFilterBar(
                allIngredients: allIngredientNames,
                selectedIngredients: $viewModel.selectedIngredients,
                matchMode: $viewModel.ingredientMatchMode
            )
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .padding(.vertical, 8)

            ForEach(filteredRecipes) { recipe in
                NavigationLink {
                    RecipeDetailView(recipe: recipe, services: services)
                } label: {
                    RecipeListRowView(recipe: recipe, imageStorage: services.imageStorage)
                }
            }
            .onDelete { offsets in
                Task { await delete(offsets) }
            }
        }
        .listStyle(.plain)
        .overlay {
            if filteredRecipes.isEmpty {
                emptyState
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Recipes", systemImage: "book.closed")
        } description: {
            Text("Add a recipe from a photo or website.")
        } actions: {
            Button {
                isShowingAddSheet = true
            } label: {
                Label("Add Recipe", systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
    }

    private var addRecipeButton: some View {
        Button {
            isShowingAddSheet = true
        } label: {
            Label("Add Recipe", systemImage: "plus.circle.fill")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    }

    @ToolbarContentBuilder
    private var libraryToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                switch services.accountStatus {
                case .signedOut:
                    Button {
                        Task { await services.signInToMicrosoft() }
                    } label: {
                        Label("Sign in to OneDrive", systemImage: "person.crop.circle.badge.plus")
                    }
                case .signedIn(let displayName):
                    Button(displayName) {}
                        .disabled(true)
                    Button(role: .destructive) {
                        Task { await services.signOut() }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            } label: {
                Image(systemName: "cloud")
            }
            .accessibilityLabel("OneDrive Account")
        }

        ToolbarItem(placement: .primaryAction) {
            Button {
                isShowingAddSheet = true
            } label: {
                Image(systemName: "plus.circle.fill")
            }
            .accessibilityLabel("Add Recipe")
        }
    }

    private var serviceMessageBinding: Binding<Bool> {
        Binding(
            get: { services.lastServiceMessage != nil },
            set: { isPresented in
                if !isPresented {
                    services.lastServiceMessage = nil
                }
            }
        )
    }

    @MainActor
    private func delete(_ offsets: IndexSet) {
        for index in offsets {
            delete(filteredRecipes[index])
        }
    }

    @MainActor
    private func delete(_ recipe: Recipe) {
        do {
            try SwiftDataRecipeRepository(context: modelContext).delete(recipe)
        } catch {
            viewModel.errorMessage = "The recipe could not be deleted."
        }
    }

    @MainActor
    private func syncPendingUploads() async {
        guard !isSyncingPendingUploads else { return }
        isSyncingPendingUploads = true
        defer { isSyncingPendingUploads = false }

        var didSync = false

        for recipe in recipes {
            for image in recipe.images where image.syncStatus == .pendingUpload {
                guard let fileName = image.localFileName else { continue }

                do {
                    let reference = try await services.imageStorage.uploadLocalImage(fileName: fileName)
                    image.oneDrivePath = reference.path
                    image.syncStatus = .uploaded
                    recipe.updatedAt = Date()
                    didSync = true
                } catch {
                    continue
                }
            }
        }

        if didSync {
            try? modelContext.save()
            services.lastServiceMessage = "Pending OneDrive uploads finished."
        }
    }
}

private struct IngredientFilterBar: View {
    let allIngredients: [String]
    @Binding var selectedIngredients: Set<String>
    @Binding var matchMode: IngredientMatchMode

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Menu {
                    ForEach(allIngredients, id: \.self) { ingredient in
                        Button {
                            toggle(ingredient)
                        } label: {
                            Label(
                                ingredient,
                                systemImage: selectedIngredients.contains(ingredient) ? "checkmark.circle.fill" : "circle"
                            )
                        }
                    }

                    if !selectedIngredients.isEmpty {
                        Divider()
                        Button("Clear Ingredient Filters") {
                            selectedIngredients.removeAll()
                        }
                    }
                } label: {
                    Label("Ingredients", systemImage: "line.3.horizontal.decrease.circle")
                }
                .buttonStyle(.bordered)

                Picker("Ingredient Match", selection: $matchMode) {
                    ForEach(IngredientMatchMode.allCases) { mode in
                        Text(mode.displayName).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            }

            if !selectedIngredients.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(Array(selectedIngredients).sorted(), id: \.self) { ingredient in
                            Button {
                                toggle(ingredient)
                            } label: {
                                Label(ingredient, systemImage: "xmark.circle.fill")
                                    .labelStyle(.titleAndIcon)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                }
            }
        }
    }

    private func toggle(_ ingredient: String) {
        if selectedIngredients.contains(ingredient) {
            selectedIngredients.remove(ingredient)
        } else {
            selectedIngredients.insert(ingredient)
        }
    }
}
