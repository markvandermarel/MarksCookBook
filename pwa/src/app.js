import { deleteRecipe, exportDatabase, getImageBlob, listRecipes, saveImageBlob, saveRecipe } from "./db.js";
import { extractRecipeFromHTML, importRecipeFromURL, parseRecipeText } from "./parser.js";
import { recognizeRecipeTextFromImage } from "./ocr.js";
import {
  getAccountStatus,
  handleMicrosoftRedirect,
  signInToOneDrive,
  signOutFromOneDrive,
  uploadBlobToOneDrive
} from "./onedrive.js";
import { formatIngredient } from "./units.js";

const state = {
  recipes: [],
  selectedId: "",
  selectedIngredients: new Set(),
  matchMode: "all",
  search: "",
  unitSystem: "original",
  instructionMode: "full",
  stepIndex: 0,
  importMode: "text",
  selectedPhotoBlob: null,
  objectURLs: new Set(),
  account: { signedIn: false, label: "OneDrive" }
};

const elements = {
  addRecipeButton: document.querySelector("#addRecipeButton"),
  addDialog: document.querySelector("#addDialog"),
  importDialog: document.querySelector("#importDialog"),
  ingredientDialog: document.querySelector("#ingredientDialog"),
  addPhotoOption: document.querySelector("#addPhotoOption"),
  addUrlOption: document.querySelector("#addUrlOption"),
  addManualOption: document.querySelector("#addManualOption"),
  importTitle: document.querySelector("#importTitle"),
  photoImportFields: document.querySelector("#photoImportFields"),
  urlImportFields: document.querySelector("#urlImportFields"),
  photoInput: document.querySelector("#photoInput"),
  photoPreview: document.querySelector("#photoPreview"),
  ocrStatus: document.querySelector("#ocrStatus"),
  urlInput: document.querySelector("#urlInput"),
  recipeTextInput: document.querySelector("#recipeTextInput"),
  parseRecipeButton: document.querySelector("#parseRecipeButton"),
  searchInput: document.querySelector("#searchInput"),
  ingredientMatchSelect: document.querySelector("#ingredientMatchSelect"),
  ingredientFilterButton: document.querySelector("#ingredientFilterButton"),
  selectedIngredientChips: document.querySelector("#selectedIngredientChips"),
  ingredientFilterList: document.querySelector("#ingredientFilterList"),
  clearIngredientsButton: document.querySelector("#clearIngredientsButton"),
  recipeList: document.querySelector("#recipeList"),
  detailPane: document.querySelector("#detailPane"),
  toast: document.querySelector("#toast")
};

init();

async function init() {
  registerServiceWorker();
  bindEvents();

  try {
    if (await handleMicrosoftRedirect()) toast("OneDrive connected.");
  } catch (error) {
    toast(error.message || "Microsoft sign-in failed.");
  }

  state.account = await getAccountStatus();
  await reloadRecipes();
}

function bindEvents() {
  elements.addRecipeButton.addEventListener("click", () => elements.addDialog.showModal());
  elements.addPhotoOption.addEventListener("click", () => openImportDialog("photo"));
  elements.addUrlOption.addEventListener("click", () => openImportDialog("url"));
  elements.addManualOption.addEventListener("click", () => openImportDialog("text"));
  elements.parseRecipeButton.addEventListener("click", parseAndSaveImport);

  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  elements.ingredientMatchSelect.addEventListener("change", (event) => {
    state.matchMode = event.target.value;
    render();
  });

  elements.ingredientFilterButton.addEventListener("click", () => {
    renderIngredientDialog();
    elements.ingredientDialog.showModal();
  });

  elements.clearIngredientsButton.addEventListener("click", () => {
    state.selectedIngredients.clear();
    render();
    renderIngredientDialog();
  });

  elements.photoInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.selectedPhotoBlob = file;
    elements.photoPreview.src = URL.createObjectURL(file);
    elements.photoPreview.classList.remove("hidden");
    elements.ocrStatus.textContent = "Preparing OCR...";

    try {
      const text = await recognizeRecipeTextFromImage(file, (message) => {
        elements.ocrStatus.textContent = message;
      });
      elements.recipeTextInput.value = text;
      toast("Photo text extracted. Review it, then save.");
    } catch (error) {
      elements.ocrStatus.textContent = error.message || "OCR failed. You can paste the recipe text manually.";
      toast(elements.ocrStatus.textContent);
    }
  });
}

function openImportDialog(mode) {
  state.importMode = mode;
  state.selectedPhotoBlob = null;
  elements.addDialog.close();
  elements.importTitle.textContent =
    mode === "photo" ? "Add from Photo" : mode === "url" ? "Add from URL" : "Add from Text";
  elements.photoImportFields.classList.toggle("hidden", mode !== "photo");
  elements.urlImportFields.classList.toggle("hidden", mode !== "url");
  elements.photoPreview.classList.add("hidden");
  elements.photoPreview.removeAttribute("src");
  elements.ocrStatus.textContent = "After you choose a photo, the app will try to read the recipe text automatically.";
  elements.photoInput.value = "";
  elements.urlInput.value = "";
  elements.recipeTextInput.value = "";
  elements.importDialog.showModal();
}

async function parseAndSaveImport() {
  const sourceText = elements.recipeTextInput.value.trim();
  const urlText = elements.urlInput.value.trim();
  let recipe;

  try {
    elements.parseRecipeButton.disabled = true;

    if (state.importMode === "url" && urlText) {
      try {
        recipe = await importRecipeFromURL(urlText);
      } catch (error) {
        if (!sourceText) throw error;
        recipe = sourceText.includes("<") ? extractRecipeFromHTML(sourceText, urlText) : parseRecipeText(sourceText, "url", { sourceURL: urlText });
      }
    } else {
      recipe = sourceText.includes("<") ? extractRecipeFromHTML(sourceText, urlText) : parseRecipeText(sourceText, state.importMode);
    }

    if (state.selectedPhotoBlob) {
      const blobId = await saveImageBlob(state.selectedPhotoBlob, { type: "scan" });
      recipe.images.unshift({
        id: crypto.randomUUID(),
        type: "scan",
        blobId,
        remoteURL: "",
        oneDrivePath: "",
        syncStatus: "pendingUpload"
      });
    }

    const savedRecipe = await saveRecipe(recipe);
    state.selectedId = savedRecipe.id;
    elements.importDialog.close();
    await syncPendingUploads({ silent: true });
    await reloadRecipes();
    toast("Recipe saved.");
  } catch (error) {
    toast(error.message || "The recipe could not be imported.");
  } finally {
    elements.parseRecipeButton.disabled = false;
  }
}

async function reloadRecipes() {
  state.recipes = await listRecipes();
  if (!state.selectedId && state.recipes.length) state.selectedId = state.recipes[0].id;
  render();
}

function render() {
  renderSelectedChips();
  renderRecipeList();
  renderDetail();
}

function renderSelectedChips() {
  elements.selectedIngredientChips.replaceChildren(
    ...[...state.selectedIngredients].sort().map((ingredient) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = ingredient;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "x";
      button.setAttribute("aria-label", `Remove ${ingredient}`);
      button.addEventListener("click", () => {
        state.selectedIngredients.delete(ingredient);
        render();
      });

      chip.append(button);
      return chip;
    })
  );
}

function renderRecipeList() {
  const recipes = filteredRecipes();

  if (!recipes.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.innerHTML = "<h2>No recipes</h2><p>Add a recipe from a photo, website, or pasted text.</p>";
    elements.recipeList.replaceChildren(empty);
    return;
  }

  const cards = recipes.map((recipe) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recipe-card";
    button.setAttribute("aria-current", recipe.id === state.selectedId ? "true" : "false");
    button.addEventListener("click", () => {
      state.selectedId = recipe.id;
      state.stepIndex = 0;
      render();
      elements.detailPane.classList.add("open");
    });

    const image = document.createElement("img");
    image.className = "recipe-thumb";
    image.alt = "";
    setImageSource(image, bestImage(recipe));

    const content = document.createElement("div");
    content.innerHTML = `
      <h3>${escapeHTML(recipe.title)}</h3>
      <p>${escapeHTML(recipe.description || "No description")}</p>
      <div class="meta-row">
        <span>${recipe.ingredients.length} ingredients</span>
        <span>${recipe.sourceType === "url" ? "Website" : recipe.sourceType === "photo" ? "Photo" : "Text"}</span>
      </div>
    `;

    button.append(image, content);
    return button;
  });

  elements.recipeList.replaceChildren(...cards);
}

function renderDetail() {
  const recipe = selectedRecipe();
  if (!recipe) {
    elements.detailPane.innerHTML = `
      <div class="empty-detail">
        <img src="./assets/icon.svg" alt="">
        <h2>No recipe selected</h2>
        <p>Add a recipe from a photo or website to start building your private cookbook.</p>
      </div>
    `;
    return;
  }

  elements.detailPane.innerHTML = `
    <article class="detail-content">
      <button class="secondary-button mobile-back" id="mobileBackButton" type="button">Back</button>
      <section class="detail-hero">
        <div>
          <h2 class="detail-title">${escapeHTML(recipe.title)}</h2>
          ${recipe.description ? `<p class="detail-description">${escapeHTML(recipe.description)}</p>` : ""}
        </div>
        <img class="hero-image" id="heroImage" alt="">
      </section>

      <section class="control-band" aria-label="Recipe controls">
        <div class="control-grid">
          <label>Servings
            <input id="servingsInput" type="number" min="1" max="60" step="1" value="${Number(recipe.currentServings || recipe.originalServings)}">
          </label>
          <label>Units
            <select id="unitSystemSelect">
              ${option("original", "Original", state.unitSystem)}
              ${option("us", "US", state.unitSystem)}
              ${option("british", "British", state.unitSystem)}
              ${option("metric", "Metric", state.unitSystem)}
            </select>
          </label>
          <label>Instructions
            <select id="instructionModeSelect">
              ${option("full", "Full Text", state.instructionMode)}
              ${option("step", "Step-by-Step", state.instructionMode)}
            </select>
          </label>
        </div>
        <div class="detail-actions">
          <button id="dishPhotoButton" class="secondary-button" type="button">${recipe.images.some((image) => image.type === "dish") ? "Replace Dish Photo" : "Add Dish Photo"}</button>
          <button id="oneDriveButton" class="secondary-button" type="button">${state.account.signedIn ? "Disconnect OneDrive" : "Connect OneDrive"}</button>
          <button id="syncButton" class="secondary-button" type="button">Sync Pending</button>
          <button id="exportButton" class="secondary-button" type="button">Export JSON</button>
          <button id="deleteButton" class="danger-button" type="button">Delete</button>
          <input id="dishPhotoInput" class="hidden" type="file" accept="image/*" capture="environment">
        </div>
      </section>

      ${renderImages(recipe)}

      <section class="section-grid">
        <div>
          <h2>Ingredients</h2>
          <div class="ingredient-list">
            ${recipe.ingredients.map((ingredient) => renderIngredient(ingredient, recipe)).join("")}
          </div>
        </div>
        <div>
          <h2>Instructions</h2>
          <div id="instructionContainer">
            ${state.instructionMode === "step" ? renderStepMode(recipe) : renderFullInstructions(recipe)}
          </div>
        </div>
      </section>
    </article>
  `;

  const hero = elements.detailPane.querySelector("#heroImage");
  setImageSource(hero, bestImage(recipe));
  bindDetailEvents(recipe);
  hydrateDetailImages(recipe);
}

function bindDetailEvents(recipe) {
  elements.detailPane.querySelector("#mobileBackButton")?.addEventListener("click", () => {
    elements.detailPane.classList.remove("open");
  });

  elements.detailPane.querySelector("#servingsInput").addEventListener("change", async (event) => {
    recipe.currentServings = Math.max(1, Number(event.target.value) || recipe.originalServings);
    await saveRecipe(recipe);
    await reloadRecipes();
  });

  elements.detailPane.querySelector("#unitSystemSelect").addEventListener("change", (event) => {
    state.unitSystem = event.target.value;
    renderDetail();
  });

  elements.detailPane.querySelector("#instructionModeSelect").addEventListener("change", (event) => {
    state.instructionMode = event.target.value;
    state.stepIndex = 0;
    renderDetail();
  });

  elements.detailPane.querySelector("#dishPhotoButton").addEventListener("click", () => {
    elements.detailPane.querySelector("#dishPhotoInput").click();
  });

  elements.detailPane.querySelector("#dishPhotoInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    recipe.images = recipe.images.filter((image) => image.type !== "dish");
    recipe.images.unshift({
      id: crypto.randomUUID(),
      type: "dish",
      blobId: await saveImageBlob(file, { type: "dish" }),
      remoteURL: "",
      oneDrivePath: "",
      syncStatus: "pendingUpload"
    });
    await saveRecipe(recipe);
    await syncPendingUploads({ silent: true });
    await reloadRecipes();
    toast("Dish photo saved.");
  });

  elements.detailPane.querySelector("#oneDriveButton").addEventListener("click", async () => {
    try {
      if (state.account.signedIn) {
        await signOutFromOneDrive();
        state.account = await getAccountStatus();
        renderDetail();
        toast("OneDrive disconnected.");
      } else {
        await signInToOneDrive();
      }
    } catch (error) {
      toast(error.message || "OneDrive could not be connected.");
    }
  });

  elements.detailPane.querySelector("#syncButton").addEventListener("click", () => syncPendingUploads({ silent: false }));
  elements.detailPane.querySelector("#exportButton").addEventListener("click", exportJSONBackup);
  elements.detailPane.querySelector("#deleteButton").addEventListener("click", async () => {
    if (!confirm(`Delete "${recipe.title}"?`)) return;
    await deleteRecipe(recipe.id);
    state.selectedId = "";
    await reloadRecipes();
    toast("Recipe deleted.");
  });

  elements.detailPane.querySelector("#previousStepButton")?.addEventListener("click", () => {
    state.stepIndex = Math.max(0, state.stepIndex - 1);
    renderDetail();
  });

  elements.detailPane.querySelector("#nextStepButton")?.addEventListener("click", () => {
    state.stepIndex = Math.min(recipe.instructions.length - 1, state.stepIndex + 1);
    renderDetail();
  });
}

function renderIngredient(ingredient, recipe) {
  return `
    <div class="ingredient-item">
      <div>${escapeHTML(formatIngredient(ingredient, recipe, state.unitSystem))}</div>
      ${Number.isFinite(ingredient.amount) ? "" : "<small>Quantity kept as written</small>"}
    </div>
  `;
}

function renderFullInstructions(recipe) {
  if (!recipe.instructions.length) return `<p class="hint">No instruction steps found.</p>`;
  return `
    <div class="instruction-list">
      ${recipe.instructions
        .map(
          (step, index) => `
          <div class="instruction-item">
            <span class="step-number">${index + 1}</span>
            <span>${escapeHTML(step.text)}</span>
          </div>`
        )
        .join("")}
    </div>
  `;
}

function renderStepMode(recipe) {
  if (!recipe.instructions.length) return `<p class="hint">No instruction steps found.</p>`;
  const index = Math.min(state.stepIndex, recipe.instructions.length - 1);
  const step = recipe.instructions[index];
  return `
    <div class="step-mode">
      <div class="meta-row"><span>Step ${index + 1} of ${recipe.instructions.length}</span></div>
      <div class="step-mode-text">${escapeHTML(step.text)}</div>
      <div class="step-nav">
        <button id="previousStepButton" class="secondary-button" type="button" ${index === 0 ? "disabled" : ""}>Previous</button>
        <button id="nextStepButton" class="primary-button" type="button" ${index === recipe.instructions.length - 1 ? "disabled" : ""}>Next</button>
      </div>
    </div>
  `;
}

function renderImages(recipe) {
  if (!recipe.images.length) return "";
  return `
    <section>
      <h2>Images</h2>
      <div class="image-strip">
        ${recipe.images
          .map(
            (image) => `
            <figure class="image-item">
              <img data-image-id="${image.id}" alt="${escapeHTML(image.type)} image">
              <figcaption class="hint">${escapeHTML(displayImageType(image.type))}${image.syncStatus === "pendingUpload" ? " - Pending OneDrive sync" : ""}</figcaption>
            </figure>`
          )
          .join("")}
      </div>
    </section>
  `;
}

async function hydrateDetailImages(recipe) {
  for (const img of elements.detailPane.querySelectorAll("[data-image-id]")) {
    const image = recipe.images.find((candidate) => candidate.id === img.dataset.imageId);
    await setImageSource(img, image);
  }
}

function renderIngredientDialog() {
  const ingredients = allIngredientNames();
  if (!ingredients.length) {
    elements.ingredientFilterList.innerHTML = `<p class="hint">No ingredients saved yet.</p>`;
    return;
  }

  elements.ingredientFilterList.replaceChildren(
    ...ingredients.map((ingredient) => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.selectedIngredients.has(ingredient);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.selectedIngredients.add(ingredient);
        else state.selectedIngredients.delete(ingredient);
        render();
      });
      label.append(checkbox, document.createTextNode(ingredient));
      return label;
    })
  );
}

function filteredRecipes() {
  const query = state.search.trim().toLowerCase();
  return state.recipes.filter((recipe) => {
    const ingredientNames = recipe.ingredients.map((ingredient) => ingredient.name.toLowerCase());
    const matchesQuery =
      !query || recipe.title.toLowerCase().includes(query) || ingredientNames.some((ingredient) => ingredient.includes(query));

    if (!matchesQuery) return false;
    if (!state.selectedIngredients.size) return true;

    const selected = [...state.selectedIngredients].map((ingredient) => ingredient.toLowerCase());
    if (state.matchMode === "all") {
      return selected.every((ingredient) => ingredientNames.some((name) => name.includes(ingredient)));
    }
    return selected.some((ingredient) => ingredientNames.some((name) => name.includes(ingredient)));
  });
}

function allIngredientNames() {
  return [
    ...new Set(
      state.recipes
        .flatMap((recipe) => recipe.ingredients)
        .map((ingredient) => ingredient.name.trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
}

function selectedRecipe() {
  return state.recipes.find((recipe) => recipe.id === state.selectedId) || state.recipes[0] || null;
}

function bestImage(recipe) {
  return (
    recipe.images.find((image) => image.type === "dish") ||
    recipe.images.find((image) => image.type === "website") ||
    recipe.images[0] ||
    null
  );
}

async function setImageSource(img, image) {
  if (!img) return;
  if (!image) {
    img.src = "./assets/icon.svg";
    return;
  }

  if (image.blobId) {
    const blob = await getImageBlob(image.blobId);
    if (blob) {
      const url = URL.createObjectURL(blob);
      state.objectURLs.add(url);
      img.src = url;
      return;
    }
  }

  img.src = image.remoteURL || "./assets/icon.svg";
}

async function syncPendingUploads({ silent } = { silent: false }) {
  if (!state.account.signedIn) {
    if (!silent) toast("Connect OneDrive before syncing.");
    return;
  }

  let synced = 0;
  for (const recipe of state.recipes) {
    let changed = false;
    for (const image of recipe.images) {
      if (image.syncStatus !== "pendingUpload" || !image.blobId) continue;
      const blob = await getImageBlob(image.blobId);
      if (!blob) continue;

      try {
        const fileName = `${image.type}-${image.blobId}.jpg`;
        const reference = await uploadBlobToOneDrive(blob, fileName);
        image.oneDrivePath = reference.oneDrivePath;
        image.remoteURL = reference.webURL || image.remoteURL;
        image.syncStatus = "uploaded";
        changed = true;
        synced += 1;
      } catch {
        image.syncStatus = "pendingUpload";
      }
    }
    if (changed) await saveRecipe(recipe);
  }

  if (synced) {
    await reloadRecipes();
    if (!silent) toast(`Synced ${synced} image${synced === 1 ? "" : "s"} to OneDrive.`);
  } else if (!silent) {
    toast("No pending uploads synced.");
  }
}

async function exportJSONBackup() {
  const backup = await exportDatabase();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `recipe-cookbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function option(value, label, selectedValue) {
  return `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${label}</option>`;
}

function displayImageType(type) {
  return { scan: "Original Scan", website: "Website Image", dish: "Dish Photo" }[type] || "Recipe Image";
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}
