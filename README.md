# Recipe Cookbook PWA

Recipe Cookbook is a private, installable web app for iPhone, iPad, desktop, and other modern browsers. It stores structured recipe data locally with IndexedDB, works offline after recipes are saved, and uses an optional AI extraction backend for cookbook photos and recipe URLs.

The original SwiftUI/Xcode project is preserved here:

```text
Archives/RecipeCookbook-SwiftUI-iOS.zip
```

## Why PWA

This version avoids the need for Xcode, a Mac, TestFlight, or the Apple Developer Program for personal use. You can host it on any HTTPS static host, open it in Safari on your iPhone, and add it to the Home Screen.

## Run Locally

Install Node.js, then run:

```bash
npm start
```

Open:

```text
http://localhost:8080
```

Do not open `pwa/index.html` directly from the filesystem. Browser security blocks the module imports and the local backend when the app is loaded from `file://`, so buttons may appear unresponsive. Use `npm start` and the `http://localhost:8080` URL instead.

`npm start` serves both the static PWA and the local extraction backend:

```text
http://localhost:8080/api/extract-recipe
```

No AI key is required for a local smoke test. If `OPENAI_API_KEY` is not configured, the local backend returns a clearly marked mock recipe so you can test the photo and URL save flows without sending content to a provider.

For real local extraction, copy the example env file and add your backend-only key:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local`:

```text
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
ALLOWED_ORIGIN=http://localhost:8080,http://127.0.0.1:8080
```

Never put `OPENAI_API_KEY` or any AI/OCR provider secret in `pwa/src/config.js` or any frontend file.

For iPhone installation and offline service-worker support, deploy the `pwa/` folder to an HTTPS host such as GitHub Pages, Cloudflare Pages, Netlify, or your own HTTPS server. Service workers do not reliably install from plain HTTP on an iPhone except for localhost.

## Install on iPhone or iPad

1. Deploy the `pwa/` folder to an HTTPS URL.
2. Open that URL in Safari on the iPhone or iPad.
3. Tap **Share**.
4. Tap **Add to Home Screen**.
5. Launch **Cookbook** from the Home Screen.

After deploying an update, open the HTTPS URL in Safari once before launching from the Home Screen. This lets the service worker refresh its cached app files.

## Features

- Recipe library with iPhone and iPad responsive layouts.
- Search by recipe title or ingredient.
- Multi-ingredient filters with **Match All** and **Match Any** modes.
- Add recipes from:
  - photo through an AI extraction backend
  - URL through the same AI extraction backend
  - pasted text or HTML
- OpenAI extraction for photo and URL imports with strict JSON output.
- Deterministic parsing fallback for pasted text and HTML.
- schema.org Recipe JSON-LD extraction where a site allows browser access.
- Ingredient scaling when serving size changes.
- US, British/imperial, and metric unit conversion.
- Full instruction view and step-by-step cooking mode.
- JSON backup export.
- Offline app shell through a service worker.

## AI Extraction Setup

Photo and URL imports use a small backend endpoint so your AI/OCR provider key is never exposed in the browser. Photos are compressed in the browser before upload. URL imports send the recipe URL, plus any pasted page text if provided, to the backend. The backend returns structured recipe JSON, the app normalizes it, and the recipe is saved only after you choose **Save Recipe**.

Current request flow:

```text
Browser PWA -> POST /api/extract-recipe -> backend reads OPENAI_API_KEY -> AI/OCR provider -> structured recipe JSON -> browser save/review flow
```

The frontend configuration contains only an endpoint URL:

```text
pwa/src/config.js
```

```javascript
export const appConfig = {
  aiExtractionEndpoint: "/api/extract-recipe"
}
```

For local development, that default route is served by `npm start`.

The backend template is:

```text
api/extract-recipe.js
```

Deploy that endpoint to a serverless host such as Vercel, Netlify Functions, Azure Functions, or another Node-compatible API host. The included file is shaped for a Vercel-style Node function.

Set these environment variables on the backend:

```text
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
ALLOWED_ORIGIN=https://your-github-user.github.io
```

`ALLOWED_ORIGIN` is optional for local experiments, but recommended once deployed. Multiple origins can be comma-separated.

If your PWA is deployed separately from the backend, such as GitHub Pages plus Vercel, put the deployed backend URL in:

```text
pwa/src/config.js
```

```javascript
export const appConfig = {
  aiExtractionEndpoint: "https://your-project.vercel.app/api/extract-recipe"
}
```

For same-origin deployments, keep the default `/api/extract-recipe`. For GitHub Pages, the PWA and backend are separate deployments:

```text
GitHub Pages: static PWA files in /pwa
Vercel or similar: /api/extract-recipe.js
```

GitHub Pages cannot run `api/extract-recipe.js` and cannot read `OPENAI_API_KEY`. If `aiExtractionEndpoint` is left as `/api/extract-recipe` on GitHub Pages, photo and URL extraction will not call the AI provider. Deploy the backend to a serverless/Node host first, set `OPENAI_API_KEY` there, then update `pwa/src/config.js` with that backend's HTTPS URL.

### Mock Extraction

The backend supports mock extraction for local testing. When `npm start` is running on localhost and `OPENAI_API_KEY` is missing, `/api/extract-recipe` returns a mock recipe for photo and URL requests with warnings and `provider.mode = "mock"`.

You can also control mock mode explicitly:

```text
MOCK_RECIPE_EXTRACTION=true   # force mock responses
MOCK_RECIPE_EXTRACTION=false  # disable implicit localhost mock mode
```

If a deployed backend is missing `OPENAI_API_KEY`, it returns a helpful error instead of exposing any secret or failing silently.

AI extraction supports English, German, and Dutch recipe sources. The model returns:

- recipe title
- description
- serving size
- structured ingredients
- step-by-step instructions
- reconstructed full text
- language, warnings, and confidence metadata

## URL Import Limitation

URL imports now use the backend instead of browser-side CORS fetches. The backend fetches the recipe page, keeps useful structured/page text for the model, and asks OpenAI to return strict recipe JSON. Some sites may still block server-side fetches; if that happens, paste the recipe card text or HTML into the import dialog and the backend will extract from that pasted content.

## Tests

Run:

```bash
npm test
```

Tests cover ingredient parsing, instruction splitting, serving scaling, unit conversion, recipe text parsing, schema.org HTML extraction, reader-style recipe-card extraction, and photo/URL backend extraction modes.

## File Layout

```text
pwa/
  index.html
  styles.css
  manifest.webmanifest
  service-worker.js
  assets/
  src/
    aiRecipe.js
    app.js
    config.js
    db.js
    parser.js
    units.js
  tests/
    run-tests.mjs
api/
  extract-recipe.js
Archives/
  RecipeCookbook-SwiftUI-iOS.zip
```

## Future Improvements

- Add editable recipe correction screens.
- Add import/export restore flow for JSON backups.
- Add tags, cuisine, prep time, and cook time filters.
- Add authenticated access to the extraction backend for stronger protection.
- Add optional cloud backup for recipe metadata.
