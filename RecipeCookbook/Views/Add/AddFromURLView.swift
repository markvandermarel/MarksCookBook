import SwiftUI

struct AddFromURLView: View {
    @ObservedObject var viewModel: AddRecipeViewModel
    let onSave: @MainActor (ParsedRecipe) -> Void

    var body: some View {
        Form {
            Section {
                TextField("Recipe website URL", text: $viewModel.urlText)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .onSubmit(importRecipe)
            }

            Section {
                Button {
                    importRecipe()
                } label: {
                    if viewModel.isImporting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Label("Import Recipe", systemImage: "square.and.arrow.down")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(viewModel.isImporting)
            }
        }
        .navigationTitle("Add from URL")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Import Problem", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
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

    private func importRecipe() {
        Task {
            if let parsedRecipe = await viewModel.importURL() {
                await MainActor.run {
                    onSave(parsedRecipe)
                }
            }
        }
    }
}
