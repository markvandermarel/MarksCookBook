import Combine
import Foundation
import UIKit

@MainActor
final class AddRecipeViewModel: ObservableObject {
    @Published var urlText = ""
    @Published var isImporting = false
    @Published var errorMessage: String?

    private let services: AppServices

    init(services: AppServices) {
        self.services = services
    }

    func importPhoto(_ image: UIImage) async -> ParsedRecipe? {
        isImporting = true
        errorMessage = nil
        defer { isImporting = false }

        do {
            let storedImage = try await services.imageStorage.save(image, type: .scan)
            let recognizedText = try await services.ocrService.recognizeText(from: image)
            var parsed = services.parser.parse(text: recognizedText, source: .photo, metadata: nil)
            parsed.images.append(
                ParsedRecipeImage(
                    type: .scan,
                    localFileName: storedImage.localFileName,
                    oneDrivePath: storedImage.oneDrivePath,
                    remoteURLString: nil,
                    syncStatus: storedImage.syncStatus
                )
            )

            if let uploadWarning = storedImage.uploadWarning {
                errorMessage = uploadWarning
            }

            return parsed
        } catch let appError as AppError {
            errorMessage = appError.userMessage
            return nil
        } catch {
            errorMessage = AppError.ocrFailed.userMessage
            return nil
        }
    }

    func importURL() async -> ParsedRecipe? {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme?.hasPrefix("http") == true else {
            errorMessage = AppError.invalidURL.userMessage
            return nil
        }

        isImporting = true
        errorMessage = nil
        defer { isImporting = false }

        do {
            return try await services.urlImporter.importRecipe(from: url)
        } catch let appError as AppError {
            errorMessage = appError.userMessage
            return nil
        } catch {
            errorMessage = AppError.urlCouldNotBeParsed.userMessage
            return nil
        }
    }
}
