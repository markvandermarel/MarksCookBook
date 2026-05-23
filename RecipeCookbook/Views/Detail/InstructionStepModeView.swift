import SwiftUI

struct InstructionStepModeView: View {
    let steps: [InstructionStep]

    @State private var currentIndex = 0
    @State private var showsListMode = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Toggle("List Mode", isOn: $showsListMode)
                .toggleStyle(.switch)

            if showsListMode {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(steps) { step in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Step \(step.order + 1)")
                                .font(.headline)
                                .foregroundStyle(.secondary)
                            Text(step.text)
                                .font(.title3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            } else if !steps.isEmpty {
                VStack(spacing: 14) {
                    TabView(selection: $currentIndex) {
                        ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                            VStack(alignment: .leading, spacing: 18) {
                                Text("Step \(index + 1) of \(steps.count)")
                                    .font(.headline)
                                    .foregroundStyle(.secondary)

                                Text(step.text)
                                    .font(.system(size: 28, weight: .semibold, design: .default))
                                    .lineSpacing(6)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(24)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                            .background(.thinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .tag(index)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .automatic))
                    .frame(minHeight: 330)

                    HStack {
                        Button {
                            currentIndex = max(currentIndex - 1, 0)
                        } label: {
                            Label("Previous", systemImage: "chevron.left")
                        }
                        .disabled(currentIndex == 0)

                        Spacer()

                        Button {
                            currentIndex = min(currentIndex + 1, steps.count - 1)
                        } label: {
                            Label("Next", systemImage: "chevron.right")
                        }
                        .disabled(currentIndex == steps.count - 1)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
            } else {
                ContentUnavailableView(
                    "No Instructions",
                    systemImage: "list.number",
                    description: Text("No instruction steps were found for this recipe.")
                )
            }
        }
    }
}
