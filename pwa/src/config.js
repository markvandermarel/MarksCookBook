export const appConfig = {
  // The PWA only stores the backend URL here. Never put AI/OCR API keys in frontend files.
  // Local npm start serves this route. For static hosts such as GitHub Pages, deploy
  // api/extract-recipe.js separately and replace this with that HTTPS endpoint URL.
  aiExtractionEndpoint: "/api/extract-recipe"
};
