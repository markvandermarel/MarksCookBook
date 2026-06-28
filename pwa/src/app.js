import { deleteRecipe, exportDatabase, listRecipes, saveRecipe } from "./db.js?v=20260628-extraction4";
import { extractRecipeFromPhoto, recipeFromExtractedRecipe, recipeToEditableJSON } from "./aiRecipe.js?v=20260628-extraction4";
import { extractRecipeFromHTML, importRecipeFromURL, parseRecipeText } from "./parser.js?v=20260628-extraction4";
import { formatIngredient } from "./units.js?v=20260628-extraction4";

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
  pendingPhotoFile: null,
  pendingPhotoRecipe: null,
  isLoading: true,
  loadError: "",
  photoImportError: "",
  isPhotoBackendBlocked: false,
  isPhotoExtracting: false,
  isImportSaving: false,
  objectURLs: new Set()
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
  photoStatus: document.querySelector("#photoStatus"),
  photoError: document.querySelector("#photoError"),
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
  render();
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
    state.pendingPhotoFile = file;
    state.pendingPhotoRecipe = null;
    clearPhotoError();
    const previewURL = URL.createObjectURL(file);
    state.objectURLs.add(previewURL);
    elements.photoPreview.src = previewURL;
    elements.photoPreview.classList.remove("hidden");
    elements.photoStatus.textContent = "Photo selected. Starting extraction...";
    elements.recipeTextInput.value = "";
    logPhotoImport("photo selected", {
      fileName: file.name || "",
      fileType: file.type || "",
      fileSize: file.size || 0
    });

    try {
      await extractSelectedPhotoRecipe();
      toast("Recipe extracted. Review the JSON, then save.");
    } catch (error) {
      console.error("[Recipe Cookbook photo import] extraction failed", {
        message: error.message || String(error)
      });
      showPhotoError(error.message || "Photo extraction failed.");
    }
  });
}

function openImportDialog(mode) {
  state.importMode = mode;
  state.pendingPhotoRecipe = null;
  elements.addDialog.close();
  elements.importTitle.textContent =
    mode === "photo" ? "Add from Photo" : mode === "url" ? "Add from URL" : "Add from Text";
  elements.photoImportFields.classList.toggle("hidden", mode !== "photo");
  elements.urlImportFields.classList.toggle("hidden", mode !== "url");
  elements.photoPreview.classList.add("hidden");
  elements.photoPreview.removeAttribute("src");
  elements.photoStatus.textContent = "After you choose a photo, the app sends it to the secure extraction backend. The photo is not stored by the PWA.";
  clearPhotoError();
  elements.photoInput.value = "";
  state.pendingPhotoFile = null;
  elements.urlInput.value = "";
  elements.recipeTextInput.value = "";
  state.isPhotoExtracting = false;
  state.isImportSaving = false;
  updateImportButtonState();
  elements.importDialog.showModal();
}

async function parseAndSaveImport() {
  if (state.isPhotoExtracting) {
    toast("Please wait until photo extraction finishes.");
    return;
  }

  let sourceText = elements.recipeTextInput.value.trim();
  const urlText = elements.urlInput.value.trim();
  let recipe;

  try {
    state.isImportSaving = true;
    clearPhotoError();
    updateImportButtonState();

    if (state.importMode === "photo") {
      if (!sourceText && !state.pendingPhotoRecipe && state.pendingPhotoFile) {
        logPhotoImport("save clicked before extracted JSON was available; extracting selected photo now");
        await extractSelectedPhotoRecipe();
        sourceText = elements.recipeTextInput.value.trim();
      }

      recipe = recipeFromPhotoJSON(sourceText, state.pendingPhotoRecipe);
    } else if (state.importMode === "url" && urlText) {
      try {
        recipe = await importRecipeFromURL(urlText);
      } catch (error) {
        if (!sourceText) throw error;
        recipe = sourceText.includes("<") ? extractRecipeFromHTML(sourceText, urlText) : parseRecipeText(sourceText, "url", { sourceURL: urlText });
      }
    } else {
      recipe = sourceText.includes("<") ? extractRecipeFromHTML(sourceText, urlText) : parseRecipeText(sourceText, state.importMode);
    }

    validateImportedRecipe(recipe, state.importMode);

    logPhotoImport("saving imported recipe", {
      mode: state.importMode,
      title: recipe.title,
      ingredientCount: recipe.ingredients.length,
      instructionCount: recipe.instructions.length
    });
    const savedRecipe = await saveRecipe(recipe);
    state.selectedId = savedRecipe.id;
    elements.importDialog.close();
    await reloadRecipes();
    logPhotoImport("recipe saved", { recipeId: savedRecipe.id, title: savedRecipe.title });
    toast("Recipe saved.");
  } catch (error) {
    console.error("[Recipe Cookbook import] save failed", {
      mode: state.importMode,
      message: error.message || String(error)
    });
    const message = error.message || "The recipe could not be imported.";
    if (state.importMode === "photo") showPhotoError(message);
    else toast(message);
  } finally {
    state.isImportSaving = false;
    updateImportButtonState();
  }
}

function validateImportedRecipe(recipe, mode) {
  if (mode === "photo" && recipe.ingredients.length && recipe.instructions.length) return;
  if (mode === "photo") {
    throw new Error("Photo extraction must include both ingredients and instructions. Try a clearer photo or edit the extracted JSON.");
  }

  if (recipe.ingredients.length || recipe.instructions.length) return;

  const guidance =
    mode === "url"
      ? "No ingredients or instructions were found. The site may block imports; paste the page text or HTML into the box."
      : "No ingredients or instructions were found. Check the recipe text and try again.";
  throw new Error(guidance);
}

function recipeFromPhotoJSON(sourceText, pendingRecipe) {
  if (!sourceText && pendingRecipe) return pendingRecipe;
  if (!sourceText) throw new Error("Choose a photo and wait for extraction before saving.");

  try {
    return recipeFromExtractedRecipe(JSON.parse(sourceText), "photo", {
      sourceName: "AI photo extraction"
    });
  } catch {
    throw new Error("The extracted recipe JSON could not be read. Choose the photo again or fix the JSON.");
  }
}

async function extractSelectedPhotoRecipe() {
  if (!state.pendingPhotoFile) {
    throw new Error("Choose a photo before saving.");
  }

  state.isPhotoExtracting = true;
  updateImportButtonState();

  try {
    const recipe = await extractRecipeFromPhoto(state.pendingPhotoFile, (message) => {
      elements.photoStatus.textContent = message;
      logPhotoImport("progress", { message });
    });
    state.pendingPhotoRecipe = recipe;
    elements.recipeTextInput.value = JSON.stringify(recipeToEditableJSON(recipe), null, 2);
    elements.photoStatus.textContent = "Recipe extracted. Review the JSON, then save.";
    logPhotoImport("extracted JSON ready for review", {
      title: recipe.title,
      ingredientCount: recipe.ingredients.length,
      instructionCount: recipe.instructions.length
    });
    return recipe;
  } finally {
    state.isPhotoExtracting = false;
    updateImportButtonState();
  }
}

function updateImportButtonState() {
  const hasEditableText = Boolean(elements.recipeTextInput.value.trim());
  const extractionBlocked = state.importMode === "photo" && state.isPhotoBackendBlocked && !hasEditableText;
  elements.parseRecipeButton.disabled = state.isPhotoExtracting || state.isImportSaving || extractionBlocked;
  const hasPhotoRecipe = Boolean(state.pendingPhotoRecipe || elements.recipeTextInput.value.trim());
  elements.parseRecipeButton.textContent =
    state.isPhotoExtracting
      ? "Extracting..."
      : state.isImportSaving
        ? "Saving..."
        : extractionBlocked
          ? "Backend Setup Needed"
        : state.importMode === "photo" && state.pendingPhotoFile && !hasPhotoRecipe
          ? "Extract Recipe"
          : "Save Recipe";
}

function showPhotoError(message) {
  state.photoImportError = message;
  state.isPhotoBackendBlocked = isBackendSetupError(message);
  elements.photoStatus.textContent = state.isPhotoBackendBlocked
    ? "Photo extraction is waiting for backend setup."
    : "Photo extraction needs attention.";
  elements.photoError.textContent = message;
  elements.photoError.classList.remove("hidden");
  updateImportButtonState();
}

function clearPhotoError() {
  state.photoImportError = "";
  state.isPhotoBackendBlocked = false;
  elements.photoError.textContent = "";
  elements.photoError.classList.add("hidden");
}

function isBackendSetupError(message) {
  return /deployed backend|GitHub Pages|aiExtractionEndpoint|OPENAI_API_KEY|backend URL|local dev server/i.test(message || "");
}

async function reloadRecipes() {
  state.isLoading = true;
  state.loadError = "";
  render();

  try {
    state.recipes = await listRecipes();
    if (!state.selectedId && state.recipes.length) state.selectedId = state.recipes[0].id;
  } catch (error) {
    state.recipes = [];
    state.selectedId = "";
    state.loadError = error.message || "The recipe library could not be loaded.";
    toast(state.loadError);
  } finally {
    state.isLoading = false;
    render();
  }
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
  elements.recipeList.setAttribute("aria-busy", state.isLoading ? "true" : "false");

  if (state.isLoading) {
    elements.recipeList.replaceChildren(createLoadingState());
    return;
  }

  if (state.loadError) {
    elements.recipeList.replaceChildren(
      createStatePanel({
        tone: "error",
        icon: "!",
        title: "Cookbook unavailable",
        message: state.loadError,
        actionLabel: "Try again",
        onAction: reloadRecipes
      })
    );
    return;
  }

  const recipes = filteredRecipes();

  if (!recipes.length) {
    const hasFilters = Boolean(state.search.trim() || state.selectedIngredients.size);
    elements.recipeList.replaceChildren(
      createStatePanel({
        icon: hasFilters ? "0" : "+",
        title: hasFilters ? "No matching recipes" : "Start your cookbook",
        message: hasFilters
          ? "Try a different search or clear the ingredient filters."
          : "Add a recipe from a photo, website, or pasted text.",
        actionLabel: hasFilters ? "Clear filters" : "Add recipe",
        onAction: hasFilters ? clearRecipeFilters : () => elements.addDialog.showModal()
      })
    );
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
        <span>${sourceLabel(recipe.sourceType)}</span>
      </div>
    `;

    button.append(image, content);
    return button;
  });

  elements.recipeList.replaceChildren(...cards);
}

function createLoadingState() {
  const wrapper = document.createElement("div");
  wrapper.className = "skeleton-list";
  wrapper.setAttribute("role", "status");
  wrapper.setAttribute("aria-label", "Loading recipes");

  for (let index = 0; index < 4; index += 1) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `
      <div class="skeleton-thumb"></div>
      <div class="skeleton-copy">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
    wrapper.append(card);
  }

  return wrapper;
}

function createStatePanel({ tone = "", icon = "", title, message, actionLabel = "", onAction = null }) {
  const panel = document.createElement("div");
  panel.className = ["state-panel", tone].filter(Boolean).join(" ");

  if (icon) {
    const iconElement = document.createElement("div");
    iconElement.className = "state-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.textContent = icon;
    panel.append(iconElement);
  }

  const heading = document.createElement("h2");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = message;

  panel.append(heading, copy);

  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = tone === "error" ? "secondary-button" : "primary-button";
    action.textContent = actionLabel;
    action.addEventListener("click", onAction);
    panel.append(action);
  }

  return panel;
}

function clearRecipeFilters() {
  state.search = "";
  state.selectedIngredients.clear();
  elements.searchInput.value = "";
  render();
}

function renderDetail() {
  if (state.isLoading) {
    elements.detailPane.innerHTML = `
      <div class="empty-detail">
        <div class="state-panel compact">
          <div class="state-icon" aria-hidden="true">...</div>
          <h2>Loading your cookbook</h2>
          <p>Getting recipes ready for browsing and cooking.</p>
        </div>
      </div>
    `;
    return;
  }

  if (state.loadError) {
    elements.detailPane.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "empty-detail";
    shell.append(
      createStatePanel({
        tone: "error",
        icon: "!",
        title: "Something needs attention",
        message: state.loadError,
        actionLabel: "Try again",
        onAction: reloadRecipes
      })
    );
    elements.detailPane.append(shell);
    return;
  }

  const recipe = selectedRecipe();
  if (!recipe) {
    elements.detailPane.innerHTML = `
      <div class="empty-detail">
        <img src="./assets/icon.svg" alt="">
        <h2>No recipe selected</h2>
        <p>Add a recipe from a photo, website, or pasted text to start building your private cookbook.</p>
        <button class="primary-button" id="emptyDetailAddButton" type="button">Add recipe</button>
      </div>
    `;
    elements.detailPane.querySelector("#emptyDetailAddButton")?.addEventListener("click", () => elements.addDialog.showModal());
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
          <button id="exportButton" class="secondary-button" type="button">Export JSON</button>
          <button id="deleteButton" class="danger-button" type="button">Delete</button>
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

  elements.detailPane.querySelector("#exportButton").addEventListener("click", exportJSONBackup);
  elements.detailPane.querySelector("#deleteButton").addEventListener("click", async () => {
    if (!confirm(`Delete "${recipe.title}"?`)) return;
    await deleteRecipe(recipe.id);
    state.selectedId = "";
    state.stepIndex = 0;
    elements.detailPane.classList.remove("open");
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
              <figcaption class="hint">${escapeHTML(displayImageType(image.type))}</figcaption>
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
    const ingredientNames = recipe.ingredients.flatMap((ingredient) => [
      ingredient.name.toLowerCase(),
      ingredientFilterName(ingredient).toLowerCase()
    ]);
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
        .map(ingredientFilterName)
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
}

function ingredientFilterName(ingredient) {
  const raw = ingredient.name || ingredient.originalText || "";
  let name = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[,;].*$/g, " ")
    .replace(
      /\b(?:whisked|beaten|roasted|coarsely chopped|finely chopped|roughly chopped|chopped|diced|minced|sliced|grated|peeled|crushed|melted|softened|baked|zested|juiced|cut into\b.*|in wedges\b.*|into wedges\b.*|grob gehackt|fein gehackt|grob gewürfelt|geschnitten|gehobelt|zerstoßen|trocken getupft|fijngehakt|grof gehakt|gesneden|in blokjes|geplet)\b.*$/i,
      " "
    )
    .replace(/\b(?:fresh|extra firm|firm|large|small|medium|ripe|whole|ground|black|white|red|yellow|green)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) name = raw.trim();
  name = singularIngredientName(name);
  return name ? titleCase(name) : "";
}

function singularIngredientName(name) {
  const irregular = {
    eggs: "egg",
    tomatoes: "tomato",
    potatoes: "potato",
    limes: "lime",
    lemons: "lemon",
    leaves: "leaf",
    loaves: "loaf"
  };
  const lower = name.toLowerCase();
  if (irregular[lower]) return irregular[lower];
  if (lower.endsWith("ies") && lower.length > 4) return `${name.slice(0, -3)}y`;
  if (lower.endsWith("es") && lower.length > 4 && !/(ses|ches|shes)$/.test(lower)) return name.slice(0, -2);
  if (lower.endsWith("s") && lower.length > 3 && !/(ss|us)$/.test(lower)) return name.slice(0, -1);
  return name;
}

function titleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function selectedRecipe() {
  return state.recipes.find((recipe) => recipe.id === state.selectedId) || state.recipes[0] || null;
}

function bestImage(recipe) {
  return (
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

  img.src = image.remoteURL || "./assets/icon.svg";
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
  return { website: "Website Image" }[type] || "Recipe Image";
}

function sourceLabel(sourceType) {
  return { url: "Website", photo: "Photo", text: "Text" }[sourceType] || "Recipe";
}

function logPhotoImport(message, details = {}) {
  console.info("[Recipe Cookbook photo import]", message, details);
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
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => registration.update())
      .catch(() => {});
  }
}
