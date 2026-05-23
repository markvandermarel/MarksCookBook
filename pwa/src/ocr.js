const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

let tesseractPromise;

export async function recognizeRecipeTextFromImage(imageBlob, onProgress = () => {}) {
  const Tesseract = await loadTesseract();
  onProgress("Reading text from the photo...");

  const result = await Tesseract.recognize(imageBlob, "eng", {
    logger(message) {
      if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
        onProgress(`Reading text from the photo: ${Math.round(message.progress * 100)}%`);
      }
    }
  });

  const text = result?.data?.text?.trim() || "";
  if (!text) {
    throw new Error("No recipe text could be read from the photo. Try better lighting or paste text manually.");
  }

  onProgress("Photo text extracted.");
  return text;
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;

  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error("OCR could not be started. Check your internet connection and try again."));
    };
    script.onerror = () => reject(new Error("OCR could not be loaded. Check your internet connection and try again."));
    document.head.append(script);
  });

  return tesseractPromise;
}
