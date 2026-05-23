import Combine
import Foundation

final class AppServices: ObservableObject {
    let parser: RecipeParsing
    let ocrService: OCRRecognizing
    let urlImporter: URLRecipeImporting
    let imageStorage: ImageStorageService
    let unitConversion: UnitConversionService
    let servingScaler: ServingScalerService
    let accountService: MicrosoftAccountServicing

    @Published private(set) var accountStatus: MicrosoftAccountStatus = .signedOut
    @Published var lastServiceMessage: String?

    init(
        parser: RecipeParsing,
        ocrService: OCRRecognizing,
        urlImporter: URLRecipeImporting,
        imageStorage: ImageStorageService,
        unitConversion: UnitConversionService,
        servingScaler: ServingScalerService,
        accountService: MicrosoftAccountServicing
    ) {
        self.parser = parser
        self.ocrService = ocrService
        self.urlImporter = urlImporter
        self.imageStorage = imageStorage
        self.unitConversion = unitConversion
        self.servingScaler = servingScaler
        self.accountService = accountService
    }

    static func makeDefault() -> AppServices {
        let ingredientParser = IngredientLineParser()
        let parser = DeterministicRecipeParsingService(ingredientParser: ingredientParser)
        let oneDrive = MockOneDriveService()
        let imageStorage = ImageStorageService(oneDriveService: oneDrive)
        let unitConversion = UnitConversionService()

        return AppServices(
            parser: parser,
            ocrService: VisionOCRService(),
            urlImporter: DefaultURLRecipeImportService(
                ingredientParser: ingredientParser,
                fallbackParser: parser
            ),
            imageStorage: imageStorage,
            unitConversion: unitConversion,
            servingScaler: ServingScalerService(
                fractionFormatter: FractionFormatter(),
                unitConversionService: unitConversion
            ),
            accountService: MockMicrosoftAccountService()
        )
    }

    @MainActor
    func signInToMicrosoft() async {
        do {
            accountStatus = try await accountService.signIn()
            lastServiceMessage = "Signed in to OneDrive."
        } catch {
            accountStatus = .signedOut
            lastServiceMessage = AppError.microsoftSignInFailed.userMessage
        }
    }

    @MainActor
    func signOut() async {
        await accountService.signOut()
        accountStatus = .signedOut
        lastServiceMessage = "Signed out."
    }
}
