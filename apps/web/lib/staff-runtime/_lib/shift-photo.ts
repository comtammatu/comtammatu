"use client";

export const MAX_CLIENT_PHOTO_EDGE = 1280;
export const MAX_UPLOAD_SOURCE_BYTES = 15_000_000;
export const MAX_CLOCK_PHOTO_BYTES = 3_500_000;
export const PHOTO_QUALITY = 0.82;
export const UPLOAD_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const UPLOAD_PHOTO_TYPES = new Set(UPLOAD_PHOTO_ACCEPT.split(","));

export function waitForNextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function capturePhotoFromVideo(
  video: HTMLVideoElement,
  fileName = "attendance.webp",
): Promise<File | null> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(
    1,
    MAX_CLIENT_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight),
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", PHOTO_QUALITY);
  });
  return blob ? new File([blob], fileName, { type: "image/webp" }) : null;
}

function loadImageFromObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("photo_decode_failed"));
    image.src = url;
  });
}

export async function normalizePhotoFile(file: File): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(
      1,
      MAX_CLIENT_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight),
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", PHOTO_QUALITY);
    });

    if (!blob) return null;
    return new File([blob], "attendance-upload.webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
