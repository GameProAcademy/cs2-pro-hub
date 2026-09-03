/**
 * Real avatar handling (the only Storage feature in the product).
 *
 * Constraints enforced client-side *and* by the backend:
 *  - private bucket `avatars`, path convention `{user_id}/avatar.webp`;
 *  - only JPEG / PNG / WebP inputs are accepted;
 *  - the stored file never exceeds 200 KB (bucket-level hard limit too);
 *  - images are resized/compressed before upload.
 *
 * `profiles.avatar_url` stores the STABLE storage path, never an expiring
 * signed URL. Signed URLs are generated on demand for rendering.
 */
import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 200 * 1024;
export const AVATAR_MAX_DIMENSION = 512;
export const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarErrorCode = "AVATAR_TYPE" | "AVATAR_TOO_LARGE" | "AVATAR_FAILED";

/** Stable object path for a user's avatar (one file per account). */
export function avatarPathFor(userId: string) {
  return `${userId}/avatar.webp`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("AVATAR_FAILED"));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/webp", quality));
}

/**
 * Resizes to a square thumbnail and compresses until the result fits the
 * 200 KB budget. Throws `AVATAR_TOO_LARGE` when it cannot.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!AVATAR_ACCEPTED_TYPES.includes(file.type as (typeof AVATAR_ACCEPTED_TYPES)[number])) {
    throw new Error("AVATAR_TYPE");
  }

  const image = await loadImage(file);
  const side = Math.min(AVATAR_MAX_DIMENSION, Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("AVATAR_FAILED");

  // Cover-crop to a square so the rendered circle is never distorted.
  const scale = side / Math.min(image.width, image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (side - drawWidth) / 2, (side - drawHeight) / 2, drawWidth, drawHeight);

  for (const quality of [0.86, 0.72, 0.6, 0.48, 0.36]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new Error("AVATAR_TOO_LARGE");
}

/** Uploads (or replaces) the signed-in user's avatar and records its path. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const blob = await prepareAvatar(file);
  const path = avatarPathFor(userId);

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/webp" });
  if (uploadError) throw new Error("AVATAR_FAILED");

  const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", userId);
  if (error) throw new Error("AVATAR_FAILED");

  return path;
}

/** Removes the avatar file and clears the reference on the profile. */
export async function removeAvatar(userId: string) {
  await supabase.storage.from(AVATAR_BUCKET).remove([avatarPathFor(userId)]);
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
  if (error) throw new Error("AVATAR_FAILED");
}

/**
 * Resolves a stored value into something an `<img>` can render.
 * Absolute URLs are returned as-is; storage paths get a short-lived signed URL.
 */
export async function resolveAvatarUrl(value: string | null | undefined) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(value, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
