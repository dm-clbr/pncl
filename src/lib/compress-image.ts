const MIN_BYTES = 500 * 1024;
const MAX_BYTES = 1024 * 1024;
const MAX_DIMENSION = 2048;
const OUTPUT_TYPE = "image/jpeg";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image file"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Unable to compress image"))),
      OUTPUT_TYPE,
      quality,
    );
  });
}

function scaledDimensions(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const ratio = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

async function renderCompressedBlob(
  image: HTMLImageElement,
  maxDimension: number,
): Promise<Blob> {
  let { width, height } = scaledDimensions(image.naturalWidth, image.naturalHeight, maxDimension);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare image compression");
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let low = 0.45;
    let high = 0.95;
    let bestBlob: Blob | null = null;

    for (let step = 0; step < 10; step += 1) {
      const quality = (low + high) / 2;
      const blob = await canvasToBlob(canvas, quality);

      if (blob.size > MAX_BYTES) {
        high = quality;
        continue;
      }

      bestBlob = blob;
      if (blob.size >= MIN_BYTES) {
        return blob;
      }

      low = quality;
    }

    if (bestBlob) {
      return bestBlob;
    }

    width = Math.max(1, Math.round(width * 0.85));
    height = Math.max(1, Math.round(height * 0.85));
  }

  throw new Error("Unable to compress image below 1 MB");
}

function toOutputFile(file: File, blob: Blob): File {
  const baseName = file.name.replace(/\.[^.]+$/, "") || "incentive";
  return new File([blob], `${baseName}.jpg`, { type: OUTPUT_TYPE, lastModified: Date.now() });
}

export async function compressIncentiveImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }

  if (file.size >= MIN_BYTES && file.size <= MAX_BYTES && file.type === OUTPUT_TYPE) {
    return file;
  }

  if (file.size < MIN_BYTES) {
    return file;
  }

  const image = await loadImage(file);
  const blob = await renderCompressedBlob(image, MAX_DIMENSION);
  return toOutputFile(file, blob);
}

export async function captureVideoPoster(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Unable to read video file"));
    });

    video.currentTime = Math.min(0.25, video.duration || 0.25);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Unable to capture video poster"));
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to capture video poster");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const posterBlob = await canvasToBlob(canvas, 0.9);
    const posterFile = new File([posterBlob], `${file.name.replace(/\.[^.]+$/, "")}-poster.jpg`, {
      type: OUTPUT_TYPE,
      lastModified: Date.now(),
    });

    return compressIncentiveImage(posterFile);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
