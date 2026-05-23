import Combine
import Foundation
import UIKit

@MainActor
final class RecipeDetailViewModel: ObservableObject {
    @Published var instructionDisplayMode: InstructionDisplayMode = .fullText
    @Published var selectedUnitSystem: UnitSystem = .original
    @Published var isShowingCamera = false
    @Published var errorMessage: String?

    private let services: AppServices

    init(services: AppServices) {
        self.services = services
    }

    func ingredientText(for ingredient: Ingredient, recipe: Recipe) -> String {
        services.servingScaler.displayText(
            for: ingredient,
            originalServings: recipe.originalServings,
            targetServings: recipe.currentServings,
            unitSystem: selectedUnitSystem
        )
    }

    func saveDishImage(_ image: UIImage) async -> ParsedRecipeImage? {
        do {
            let stored = try await services.imageStorage.save(image, type: .dish)
            if let warning = stored.uploadWarning {
                errorMessage = warning
            }

            return ParsedRecipeImage(
                type: .dish,
                localFileName: stored.localFileName,
                oneDrivePath: stored.oneDrivePath,
                remoteURLString: nil,
                syncStatus: stored.syncStatus
            )
        } catch let appError as AppError {
            errorMessage = appError.userMessage
            return nil
        } catch {
            errorMessage = AppError.oneDriveUploadFailed.userMessage
            return nil
        }
    }
}
