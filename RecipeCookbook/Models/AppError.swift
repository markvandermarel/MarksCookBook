import Foundation

enum AppError: LocalizedError, Equatable {
    case ocrFailed
    case urlCouldNotBeParsed
    case oneDriveUploadFailed
    case offline
    case microsoftSignInFailed
    case ingredientQuantityCouldNotBeInterpreted
    case unitConversionNotPossible
    case cameraUnavailable
    case invalidURL
    case imageEncodingFailed
    case graphAuthenticationRequired

    var errorDescription: String? {
        userMessage
    }

    var userMessage: String {
        switch self {
        case .ocrFailed:
            "Text could not be read from this image. Try taking the photo again with better lighting."
        case .urlCouldNotBeParsed:
            "This page could not be parsed as a recipe. You can still add it manually later."
        case .oneDriveUploadFailed:
            "The image was saved locally, but the OneDrive upload failed. It will be ready to sync again later."
        case .offline:
            "You appear to be offline. The recipe was saved locally and can sync when the connection returns."
        case .microsoftSignInFailed:
            "Microsoft sign-in failed. Check your account setup and try again."
        case .ingredientQuantityCouldNotBeInterpreted:
            "One or more ingredient quantities could not be interpreted and were kept as written."
        case .unitConversionNotPossible:
            "This unit conversion is not possible without more information."
        case .cameraUnavailable:
            "The camera is not available on this device."
        case .invalidURL:
            "Enter a valid website URL."
        case .imageEncodingFailed:
            "The photo could not be saved. Try again with a different image."
        case .graphAuthenticationRequired:
            "OneDrive needs a signed-in Microsoft account before uploading."
        }
    }
}
