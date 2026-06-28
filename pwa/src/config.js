export const appConfig = {
  // The PWA only stores the backend URL here. Never put AI/OCR API keys in frontend files.
  // Local npm start serves this route. For static hosts such as GitHub Pages, deploy
  // api/extract-recipe.js separately and replace this with that HTTPS endpoint URL.
  aiExtractionEndpoint: "https://marks-cook-book.vercel.app/api/extract-recipe",

  firebase: {
    enabled: false,
    sdkVersion: "10.12.5",
    householdId: "your-household-id",
    config: {
      apiKey: "your-firebase-web-api-key",
      authDomain: "your-project.firebaseapp.com",
      projectId: "your-project-id",
      storageBucket: "your-project.appspot.com",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:0000000000000000000000"
    }
  }
};
