import SwiftData
import SwiftUI
import UIKit

struct RecipeDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @StateObject private var viewModel: RecipeDetailViewModel

    let recipe: Recipe
    let services: AppServices

    init(recipe: Recipe, services: AppServices) {
        self.recipe = recipe
        self.services = services
        _viewModel = StateObject(wrappedValue: RecipeDetailViewModel(services: services))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                if !recipe.sortedImages.isEmpty {
                    imageStrip
                }

                IngredientsView(recipe: recipe, viewModel: viewModel)

                instructions
            }
            .padding()
            .frame(maxWidth: 920, alignment: .leading)
        }
        .navigationTitle(recipe.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCamera()
                } label: {
                    Image(systemName: "camera.fill")
                }
                .accessibilityLabel(recipe.sortedImages.contains(where: { $0.type == .dish }) ? "Replace Dish Photo" : "Add Dish Photo")
            }
        }
        .fullScreenCover(isPresented: $viewModel.isShowingCamera) {
            CameraCaptureView { image in
                Task {
                    await addDishPhoto(image)
                }
            }
            .ignoresSafeArea()
        }
        .alert("Recipe Problem", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(recipe.title)
                .font(.largeTitle.bold())
                .fixedSize(horizontal: false, vertical: true)

            if !recipe.recipeDescription.isEmpty {
                Text(recipe.recipeDescription)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 12) {
                Stepper(value: servingsBinding, in: 1...40, step: 1) {
                    Text("Serves \(Int(recipe.currentServings))")
                        .font(.headline)
                }

                Picker("Units", selection: $viewModel.selectedUnitSystem) {
                    ForEach(UnitSystem.allCases) { system in
                        Text(system.displayName).tag(system)
                    }
                }
                .pickerStyle(.segmented)

                if let sourceURL = recipe.sourceMetadata?.sourceURL {
                    Link(destination: sourceURL) {
                        Label("Open Source", systemImage: "safari")
                    }
                    .font(.subheadline)
                }
            }
            .padding()
            .background(.thinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private var imageStrip: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Images")
                .font(.title2.bold())

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(recipe.sortedImages) { image in
                        VStack(alignment: .leading, spacing: 6) {
                            AsyncRecipeImageView(recipeImage: image, imageStorage: services.imageStorage)
                                .frame(width: 240, height: 170)
                                .clipShape(RoundedRectangle(cornerRadius: 8))

                            Text(image.type.displayName)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var instructions: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Instructions")
                    .font(.title2.bold())

                Spacer()

                Picker("Instruction View", selection: $viewModel.instructionDisplayMode) {
                    ForEach(InstructionDisplayMode.allCases) { mode in
                        Text(mode.displayName).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 320)
            }

            if viewModel.instructionDisplayMode == .fullText {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(recipe.sortedSteps) { step in
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(step.order + 1)")
                                .font(.headline.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 30, alignment: .trailing)

                            Text(step.text)
                                .font(.body)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            } else {
                InstructionStepModeView(steps: recipe.sortedSteps)
            }
        }
    }

    private var servingsBinding: Binding<Double> {
        Binding(
            get: { recipe.currentServings },
            set: { newValue in
                recipe.currentServings = newValue
                recipe.updatedAt = Date()
                try? modelContext.save()
            }
        )
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

        viewModel.isShowingCamera = true
    }

    @MainActor
    private func addDishPhoto(_ image: UIImage) async {
        guard let parsedImage = await viewModel.saveDishImage(image) else { return }

        let recipeImage = RecipeImage(
            type: parsedImage.type,
            localFileName: parsedImage.localFileName,
            oneDrivePath: parsedImage.oneDrivePath,
            remoteURLString: parsedImage.remoteURLString,
            syncStatus: parsedImage.syncStatus
        )
        let existingDishImages = recipe.images.filter { $0.type == .dish }
        for existingImage in existingDishImages {
            modelContext.delete(existingImage)
        }
        recipe.images.removeAll { $0.type == .dish }
        recipeImage.recipe = recipe
        recipe.images.append(recipeImage)
        recipe.updatedAt = Date()
        try? modelContext.save()
    }
}
