import SwiftData
import SwiftUI
import UIKit

struct AddRecipeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @StateObject private var viewModel: AddRecipeViewModel
    @State private var isShowingCamera = false
    @State private var isShowingURLImport = false

    init(services: AppServices) {
        _viewModel = StateObject(wrappedValue: AddRecipeViewModel(services: services))
    }

    var body: some View {
        NavigationStack {
            List {
                Button {
                    showCamera()
                } label: {
                    Label("Add from Photo", systemImage: "camera.fill")
                }

                Button {
                    isShowingURLImport = true
                } label: {
                    Label("Add from URL", systemImage: "link")
                }
            }
            .navigationTitle("Add Recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .overlay {
                if viewModel.isImporting {
                    ProgressView("Importing Recipe")
                        .padding()
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .navigationDestination(isPresented: $isShowingURLImport) {
                AddFromURLView(viewModel: viewModel) { parsedRecipe in
                    save(parsedRecipe)
                }
            }
            .fullScreenCover(isPresented: $isShowingCamera) {
                CameraCaptureView { image in
                    Task {
                        if let parsedRecipe = await viewModel.importPhoto(image) {
                            await save(parsedRecipe)
                        }
                    }
                }
                .ignoresSafeArea()
            }
            .alert("Import Problem", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { viewModel.errorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    viewModel.errorMessage = nil
                }
            }
        )
    }

    @MainActor
    private func showCamera() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            viewModel.errorMessage = AppError.cameraUnavailable.userMessage
            return
        }

        isShowingCamera = true
    }

    @MainActor
    private func save(_ parsedRecipe: ParsedRecipe) {
        do {
            try SwiftDataRecipeRepository(context: modelContext).createRecipe(from: parsedRecipe)
            dismiss()
        } catch {
            viewModel.errorMessage = "The recipe could not be saved."
        }
    }
}
