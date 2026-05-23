import Foundation

struct OneDriveUploadReference: Equatable {
    var itemID: String?
    var path: String
    var webURL: String?
}

enum MicrosoftAccountStatus: Equatable {
    case signedOut
    case signedIn(displayName: String)
}

protocol MicrosoftAccountServicing {
    func signIn() async throws -> MicrosoftAccountStatus
    func signOut() async
}

struct MockMicrosoftAccountService: MicrosoftAccountServicing {
    func signIn() async throws -> MicrosoftAccountStatus {
        .signedIn(displayName: "Mock Microsoft Account")
    }

    func signOut() async {}
}

protocol OneDriveServicing {
    func upload(data: Data, fileName: String, contentType: String) async throws -> OneDriveUploadReference
}

struct MockOneDriveService: OneDriveServicing {
    func upload(data: Data, fileName: String, contentType: String) async throws -> OneDriveUploadReference {
        let folder = try FileManager.default.recipeCookbookDirectory(named: "MockOneDrive")
        let destination = folder.appendingPathComponent(fileName)
        try data.write(to: destination, options: [.atomic])

        return OneDriveUploadReference(
            itemID: UUID().uuidString,
            path: "/Apps/RecipeCookbook/\(fileName)",
            webURL: destination.absoluteString
        )
    }
}

struct GraphOneDriveService: OneDriveServicing {
    let accessTokenProvider: () async throws -> String

    func upload(data: Data, fileName: String, contentType: String) async throws -> OneDriveUploadReference {
        let accessToken = try await accessTokenProvider()
        guard !accessToken.isEmpty else {
            throw AppError.graphAuthenticationRequired
        }

        let escapedFileName = fileName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? fileName
        guard let url = URL(string: "https://graph.microsoft.com/v1.0/me/drive/special/approot:/\(escapedFileName):/content") else {
            throw AppError.oneDriveUploadFailed
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = data

        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode)
        else {
            throw AppError.oneDriveUploadFailed
        }

        let json = (try? JSONSerialization.jsonObject(with: responseData)) as? [String: Any]
        return OneDriveUploadReference(
            itemID: json?["id"] as? String,
            path: "/Apps/RecipeCookbook/\(fileName)",
            webURL: json?["webUrl"] as? String
        )
    }
}
