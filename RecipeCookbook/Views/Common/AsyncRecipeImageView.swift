import SwiftUI
import UIKit

struct AsyncRecipeImageView: View {
    let recipeImage: RecipeImage?
    let imageStorage: ImageStorageService

    var body: some View {
        Group {
            if let recipeImage,
               let localFileName = recipeImage.localFileName,
               let url = imageStorage.localImageURL(for: localFileName),
               let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if let recipeImage,
                      let remoteURLString = recipeImage.remoteURLString,
                      let url = URL(string: remoteURLString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        placeholder
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .clipped()
        .accessibilityHidden(recipeImage == nil)
    }

    private var placeholder: some View {
        ZStack {
            Rectangle()
                .fill(.secondary.opacity(0.12))
            Image(systemName: "fork.knife")
                .font(.title2)
                .foregroundStyle(.secondary)
        }
    }
}
