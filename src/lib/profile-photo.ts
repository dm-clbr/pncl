import type { Area } from "react-easy-crop";

export const PROFILE_PHOTO_TARGET_BYTES = 300 * 1024;
export const PROFILE_PHOTO_OUTPUT_SIZE = 512;
export const PROFILE_PHOTO_MIME_TYPE = "image/jpeg";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Unable to load image.")));
    image.src = src;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to compress image."));
      },
      PROFILE_PHOTO_MIME_TYPE,
      quality,
    );
  });
}

async function compressCanvasToTarget(
  sourceCanvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<Blob> {
  let workingCanvas = sourceCanvas;

  for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
    let low = 0.35;
    let high = 0.92;
    let best: Blob | null = null;

    for (let qualityAttempt = 0; qualityAttempt < 8; qualityAttempt += 1) {
      const quality = (low + high) / 2;
      const blob = await canvasToJpegBlob(workingCanvas, quality);

      if (blob.size <= maxBytes) {
        best = blob;
        low = quality;
      } else {
        high = quality;
      }
    }

    if (best) return best;

    const nextSize = Math.round(workingCanvas.width * 0.75);
    if (nextSize < 160) break;

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = nextSize;
    scaledCanvas.height = nextSize;
    const context = scaledCanvas.getContext("2d");
    if (!context) break;

    context.drawImage(workingCanvas, 0, 0, nextSize, nextSize);
    workingCanvas = scaledCanvas;
  }

  throw new Error("Unable to compress photo below 300 KB.");
}

export async function getCroppedProfilePhotoBlob(
  imageSrc: string,
  croppedAreaPixels: Area,
  outputSize = PROFILE_PHOTO_OUTPUT_SIZE,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to process image.");
  }

  context.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return compressCanvasToTarget(canvas, PROFILE_PHOTO_TARGET_BYTES);
}

export function profilePhotoBlobToFile(blob: Blob): File {
  return new File([blob], "profile-photo.jpg", { type: PROFILE_PHOTO_MIME_TYPE });
}
