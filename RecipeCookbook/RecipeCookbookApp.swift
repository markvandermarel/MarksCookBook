import SwiftData
import SwiftUI

@main
struct RecipeCookbookApp: App {
    private let modelContainer: ModelContainer
    @StateObject private var services = AppServices.makeDefault()

    init() {
        let schema = Schema([
            Recipe.self,
            Ingredient.self,
            InstructionStep.self,
            RecipeImage.self,
            SourceMetadata.self
        ])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)

        do {
            modelContainer = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Unable to create SwiftData container: \(error.localizedDescription)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RecipeLibraryView()
                .environmentObject(services)
        }
        .modelContainer(modelContainer)
    }
}
