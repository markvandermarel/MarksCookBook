import Foundation
import UIKit

struct ImageStorageService {
    let oneDriveService: OneDriveServicing

    func save(_ image: UIImage, type: RecipeImageType) async throws -> StoredImageReference {
        guard let data = image.jpegData(compressionQuality: 0.9) else {
            throw AppError.imageEncodingFailed
        }

        let fileName = "\(type.rawValue)-\(UUID().uuidString).jpg"
        let folder = try FileManager.default.recipeCookbookDirectory(named: "Images")
        let localURL = folder.appendingPathComponent(fileName)
        try data.write(to: localURL, options: [.atomic])

        do {
            let reference = try await oneDriveService.upload(
                data: data,
                fileName: fileName,
                contentType: "image/jpeg"
            )

            return StoredImageReference(
                localFileName: fileName,
                oneDrivePath: reference.path,
                syncStatus: .uploaded,
                uploadWarning: nil
            )
        } catch {
            return StoredImageReference(
                localFileName: fileName,
                oneDrivePath: nil,
                syncStatus: .pendingUpload,
                uploadWarning: AppError.oneDriveUploadFailed.userMessage
            )
        }
    }

    func localImageURL(for fileName: String) -> URL? {
        guard let folder = try? FileManager.default.recipeCookbookDirectory(named: "Images") else {
            return nil
        }
        return folder.appendingPathComponent(fileName)
    }

    func uploadLocalImage(fileName: String) async throws -> OneDriveUploadReference {
        guard let url = localImageURL(for: fileName) else {
            throw AppError.oneDriveUploadFailed
        }

        let data = try Data(contentsOf: url)
        return try await oneDriveService.upload(
            data: data,
            fileName: fileName,
            contentType: "image/jpeg"
        )
    }
}

extension FileManager {
    func recipeCookbookDirectory(named folderName: String) throws -> URL {
        let base = try url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        .appendingPathComponent("RecipeCookbook", isDirectory: true)
        .appendingPathComponent(folderName, isDirectory: true)

        if !fileExists(atPath: base.path) {
            try createDirectory(at: base, withIntermediateDirectories: true)
        }

        return base
    }
}
