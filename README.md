# Recipe Cookbook PWA

Recipe Cookbook is a private, installable web app for iPhone, iPad, desktop, and other modern browsers. It stores structured recipe data locally with IndexedDB, works offline after recipes are saved, and uses an optional AI extraction backend for cookbook photos.

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
  - URL
  - pasted text or HTML
- OpenAI vision extraction for photo imports with strict JSON output.
- Deterministic parsing for URL and pasted-text imports.
- schema.org Recipe JSON-LD extraction where a site allows browser access.
- Ingredient scaling when serving size changes.
- US, British/imperial, and metric unit conversion.
- Full instruction view and step-by-step cooking mode.
- JSON backup export.
- Offline app shell through a service worker.

## Photo Extraction Setup

Photo imports use a small backend endpoint so your OpenAI API key is never exposed in the browser. The selected photo is compressed in the browser, sent to the backend for extraction, and then discarded. The PWA saves only the structured recipe JSON.

The backend template is:

```text
api/extract-recipe.js
```

Deploy that endpoint to a serverless host such as Vercel, Netlify Functions, Cloudflare Workers, or Azure Functions. The included file is shaped for a Vercel-style Node function.

Set these environment variables on the backend:

```text
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
ALLOWED_ORIGIN=https://your-github-user.github.io
```

`ALLOWED_ORIGIN` is optional for local experiments, but recommended once deployed.

Then put the deployed endpoint URL in:

```text
pwa/src/config.js
```

```javascript
export const appConfig = {
  aiExtractionEndpoint: "https://your-project.vercel.app/api/extract-recipe"
}
```

For GitHub Pages, the PWA and backend are separate deployments:

```text
GitHub Pages: static PWA files in /pwa
Vercel or similar: /api/extract-recipe.js
```

Photo extraction supports English, German, and Dutch recipe pages. The model returns:

- recipe title
- description
- serving size
- structured ingredients
- step-by-step instructions
- reconstructed full text
- language, warnings, and confidence metadata

## URL Import Limitation

Browser security rules prevent many sites from being fetched directly because of CORS. The importer first tries the original page and structured schema.org Recipe JSON-LD, then falls back to a reader-text fetch for blocked pages. If both paths fail, paste the page text or HTML into the import dialog.

## Tests

Run:

```bash
npm test
```

Tests cover ingredient parsing, instruction splitting, serving scaling, unit conversion, recipe text parsing, schema.org HTML extraction, and reader-style recipe-card extraction.

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
