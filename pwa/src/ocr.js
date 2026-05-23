const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const OCR_LANGUAGES = "eng+deu+nld";

let tesseractPromise;

export async function recognizeRecipeTextFromImage(imageBlob, onProgress = () => {}) {
  const Tesseract = await loadTesseract();
  onProgress("Preparing photo for OCR...");
  const ocrImage = await prepareImageForOCR(imageBlob);
  onProgress("Reading English, German, and Dutch text from the photo...");

  const result = await Tesseract.recognize(ocrImage, OCR_LANGUAGES, {
    preserve_interword_spaces: "1",
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

async function prepareImageForOCR(imageBlob) {
  if (typeof document === "undefined" || !document.createElement) return imageBlob;

  const image = await loadImage(imageBlob);
  const longestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const scale = longestSide < 1800 ? 1800 / longestSide : longestSide > 2600 ? 2600 / longestSide : 1;
  const width = Math.round((image.naturalWidth || image.width) * scale);
  const height = Math.round((image.naturalHeight || image.height) * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return imageBlob;

  context.filter = "grayscale(1) contrast(1.35) brightness(1.05)";
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected image could not be prepared for OCR."));
    };
    image.src = url;
  });
}
