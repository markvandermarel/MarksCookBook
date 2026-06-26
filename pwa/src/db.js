const DB_NAME = "recipe-cookbook-pwa";
const DB_VERSION = 1;

let dbPromise;

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("recipes")) {
        const store = db.createObjectStore("recipes", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("title", "title");
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function listRecipes() {
  const db = await openDatabase();
  return requestToPromise(db.transaction("recipes", "readonly").objectStore("recipes").getAll())
    .then((recipes) => recipes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
}

export async function getRecipe(id) {
  const db = await openDatabase();
  return requestToPromise(db.transaction("recipes", "readonly").objectStore("recipes").get(id));
}

export async function saveRecipe(recipe) {
  const db = await openDatabase();
  const now = new Date().toISOString();
  const nextRecipe = {
    ...recipe,
    id: recipe.id || crypto.randomUUID(),
    createdAt: recipe.createdAt || now,
    updatedAt: now
  };

  await requestToPromise(db.transaction("recipes", "readwrite").objectStore("recipes").put(nextRecipe));
  return nextRecipe;
}

export async function deleteRecipe(id) {
  const db = await openDatabase();
  const tx = db.transaction("recipes", "readwrite");
  tx.objectStore("recipes").delete(id);

  await transactionComplete(tx);
}

export async function getSetting(key) {
  const db = await openDatabase();
  const value = await requestToPromise(db.transaction("settings", "readonly").objectStore("settings").get(key));
  return value?.value;
}

export async function setSetting(key, value) {
  const db = await openDatabase();
  await requestToPromise(db.transaction("settings", "readwrite").objectStore("settings").put({ key, value }));
}

export async function exportDatabase() {
  const recipes = await listRecipes();
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    recipes
  };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
