import type { AgentBusinessCardPhoto } from "@/lib/agent-business-card-pdf";
import { getProfilePhotoUrl } from "@/lib/portal-profile";

export const BUSINESS_CARD_PHOTO_INPUT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const BUSINESS_CARD_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const BUSINESS_CARD_PHOTO_WIDTH = 400;
export const BUSINESS_CARD_PHOTO_HEIGHT = 500;

interface AgentBusinessCardPhotoLoaderInput {
  userId: string;
  profilePhotoPath: string | null | undefined;
  profileUpdatedAt?: string | null;
}

interface AgentBusinessCardPhotoLoaderDependencies {
  fetchPhoto?: typeof fetch;
  getPhotoUrl?: typeof getProfilePhotoUrl;
  convertPhoto?: typeof convertProfilePhotoBlobToPng;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to prepare the profile photo."));
    }, "image/png");
  });
}

function loadImageBlob(blob: Blob): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.addEventListener("load", () => {
      resolve({ image, objectUrl });
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to decode the profile photo."));
    });
    image.src = objectUrl;
  });
}

export function isOwnProfilePhotoPath(
  userId: string | null | undefined,
  profilePhotoPath: string | null | undefined,
): boolean {
  const normalizedUserId = userId?.trim() ?? "";
  const normalizedPath = profilePhotoPath?.trim() ?? "";
  if (!normalizedUserId || !normalizedPath.startsWith(`${normalizedUserId}/`)) return false;

  const fileName = normalizedPath.slice(normalizedUserId.length + 1);
  return /^avatar\.(?:jpe?g|png|webp)$/i.test(fileName);
}

export async function convertProfilePhotoBlobToPng(blob: Blob): Promise<AgentBusinessCardPhoto> {
  const { image, objectUrl } = await loadImageBlob(blob);
  try {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("The profile photo has invalid dimensions.");
    }

    const targetAspect = BUSINESS_CARD_PHOTO_WIDTH / BUSINESS_CARD_PHOTO_HEIGHT;
    const sourceAspect = sourceWidth / sourceHeight;
    let sourceX = 0;
    let sourceY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (sourceAspect > targetAspect) {
      cropWidth = sourceHeight * targetAspect;
      sourceX = (sourceWidth - cropWidth) / 2;
    } else if (sourceAspect < targetAspect) {
      cropHeight = sourceWidth / targetAspect;
      sourceY = (sourceHeight - cropHeight) / 2;
    }

    const canvas = document.createElement("canvas");
    canvas.width = BUSINESS_CARD_PHOTO_WIDTH;
    canvas.height = BUSINESS_CARD_PHOTO_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare the profile photo.");

    context.fillStyle = "#151517";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const pngBlob = await canvasToPngBlob(canvas);
    return { pngBytes: new Uint8Array(await pngBlob.arrayBuffer()) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadOwnProfilePhotoForBusinessCard(
  input: AgentBusinessCardPhotoLoaderInput,
  dependencies: AgentBusinessCardPhotoLoaderDependencies = {},
): Promise<AgentBusinessCardPhoto | null> {
  if (!isOwnProfilePhotoPath(input.userId, input.profilePhotoPath)) return null;

  try {
    const getPhotoUrl = dependencies.getPhotoUrl ?? getProfilePhotoUrl;
    const photoUrl = getPhotoUrl(input.profilePhotoPath, input.profileUpdatedAt);
    if (!photoUrl) return null;

    const fetchPhoto = dependencies.fetchPhoto ?? fetch;
    const response = await fetchPhoto(photoUrl, { cache: "no-store" });
    if (!response.ok) return null;

    const blob = await response.blob();
    if (!(BUSINESS_CARD_PHOTO_INPUT_TYPES as readonly string[]).includes(blob.type)) return null;
    if (blob.size === 0 || blob.size > BUSINESS_CARD_PHOTO_MAX_BYTES) return null;

    const convertPhoto = dependencies.convertPhoto ?? convertProfilePhotoBlobToPng;
    return await convertPhoto(blob);
  } catch {
    return null;
  }
}
