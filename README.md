# Recipe Cookbook PWA

Recipe Cookbook is now a private, installable web app for iPhone, iPad, desktop, and other modern browsers. It stores recipes and images locally with IndexedDB, works offline after installation, and can optionally upload recipe images to OneDrive through Microsoft Graph.

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

## Features

- Recipe library with iPhone and iPad responsive layouts.
- Search by recipe title or ingredient.
- Multi-ingredient filters with **Match All** and **Match Any** modes.
- Add recipes from:
  - photo
  - URL
  - pasted text or HTML
- Local image storage inside IndexedDB.
- Deterministic parsing for title, description, ingredients, instructions, and servings.
- schema.org Recipe JSON-LD extraction where a site allows browser access.
- Ingredient scaling when serving size changes.
- US, British/imperial, and metric unit conversion.
- Full instruction view and step-by-step cooking mode.
- Optional final dish photo.
- JSON backup export.
- Offline app shell through a service worker.

## Browser OCR Limitation

The PWA cannot use Apple Vision OCR because that framework is native-only. The photo flow now loads Tesseract.js in the browser, reads English text from the selected recipe photo, and places the extracted text into the import box for review before saving.

First-time OCR use needs an internet connection so the Tesseract.js library can be loaded from the CDN. If OCR cannot read the photo cleanly, use iPhone Live Text or paste corrected recipe text into the import box.

The parser replacement point is `pwa/src/parser.js`.

## OneDrive Setup

OneDrive is optional. Without configuration, recipes and images remain local.

To enable Microsoft Graph uploads:

1. Create an app registration in Microsoft Entra.
2. Configure it as a Single Page Application.
3. Add the deployed HTTPS URL as a redirect URI, for example:

```text
https://your-user.github.io/recipe-cookbook/index.html
```

4. Add delegated Microsoft Graph permissions:

```text
User.Read
Files.ReadWrite.AppFolder
offline_access
```

5. Put the application client ID in:

```text
pwa/src/config.js
```

```js
export const appConfig = {
  microsoftClientId: "YOUR_CLIENT_ID",
  microsoftTenant: "common",
  graphScopes: ["User.Read", "Files.ReadWrite.AppFolder", "offline_access"]
};
```

Images upload to the Microsoft Graph app folder:

```text
/Apps/RecipeCookbook/
```

If OneDrive is not connected or upload fails, images remain local and are marked as pending sync.

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
    app.js
    config.js
    db.js
    ocr.js
    onedrive.js
    parser.js
    units.js
  tests/
    run-tests.mjs
Archives/
  RecipeCookbook-SwiftUI-iOS.zip
```

## Future Improvements

- Add editable recipe correction screens.
- Add import/export restore flow for JSON backups.
- Add a selectable cloud OCR adapter for difficult cookbook scans.
- Add tags, cuisine, prep time, and cook time filters.
- Add richer OneDrive backup sync for recipe metadata, not only images.
