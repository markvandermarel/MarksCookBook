export const appConfig = {
  // The PWA only stores the backend URL here. Never put AI/OCR API keys in frontend files.
  // Local npm start serves this route. For static hosts such as GitHub Pages, deploy
  // api/extract-recipe.js separately and replace this with that HTTPS endpoint URL.
  aiExtractionEndpoint: "https://marks-cook-book.vercel.app/api/extract-recipe",

  firebase: {
    enabled: true,
    sdkVersion: "10.12.5",
    householdId: "family",
    config: {
      apiKey: "AIzaSyB5GddtPHkoirdcL5OP3nNzJVfc-1-_aTE",
      authDomain: "markscookbook-2824d.firebaseapp.com",
      projectId: "markscookbook-2824d",
      storageBucket: "markscookbook-2824d.firebasestorage.app",
      messagingSenderId: "914425379866",
      appId: "1:914425379866:web:f4c9b60431e81e59efe5a3",
      measurementId: "G-QT1J5N57JJ"
    }
  }
};
