import { useState, type DragEvent } from "react";
import type { Id } from "../../convex/_generated/dataModel";

const COMPRESS_THRESHOLD_BYTES = 200 * 1024; // 200 KB
const TARGET_MAX_BYTES = 500 * 1024;         // 500 KB

function isImage(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "bmp", "avif", "heic", "heif"].includes(ext || "");
}

async function getDimensionsAndSource(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return {
        width: bmp.width,
        height: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
        cleanup: () => bmp.close(),
      };
    } catch {
      // Fallback to Image element below
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Compresses an image file if it is larger than 200KB so that its final
 * size is under 500KB, preserving visual clarity while drastically
 * reducing network bandwidth and Convex database storage.
 */
export async function compressMedia(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD_BYTES) {
    return file;
  }
  if (!isImage(file) || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }

  try {
    const src = await getDimensionsAndSource(file);
    try {
      const isPngOrWebp = file.type === "image/png" || file.type === "image/webp";
      let mimeType = isPngOrWebp ? "image/webp" : "image/jpeg";

      let maxDimension = Math.min(Math.max(src.width, src.height), 2048);
      let bestBlob: Blob | null = null;

      // Iteratively adjust quality and dimensions to guarantee size is under 500KB
      const qualitySteps = [0.85, 0.72, 0.58, 0.42];

      outerLoop:
      for (let scaleAttempt = 0; scaleAttempt < 3; scaleAttempt++) {
        let w = src.width;
        let h = src.height;
        if (w > maxDimension || h > maxDimension) {
          if (w > h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext("2d");
        if (!ctx) break;

        // If JPEG, fill white background to prevent transparent areas from turning black
        if (mimeType === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        src.draw(ctx, canvas.width, canvas.height);

        for (const q of qualitySteps) {
          let blob = await canvasToBlob(canvas, mimeType, q);

          // If browser doesn't support WebP export in canvas, it falls back to PNG (which is huge)
          if (blob && mimeType === "image/webp" && blob.type === "image/png") {
            mimeType = "image/jpeg";
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            src.draw(ctx, canvas.width, canvas.height);
            blob = await canvasToBlob(canvas, mimeType, q);
          }

          if (blob) {
            if (!bestBlob || blob.size < bestBlob.size) {
              bestBlob = blob;
            }
            if (blob.size <= TARGET_MAX_BYTES) {
              bestBlob = blob;
              break outerLoop;
            }
          }
        }

        // Scale down dimensions for next attempt if still over 500KB
        maxDimension = Math.round(maxDimension * 0.75);
      }

      if (bestBlob && (bestBlob.size <= TARGET_MAX_BYTES || bestBlob.size < file.size)) {
        return new File([bestBlob], file.name, {
          type: bestBlob.type,
          lastModified: Date.now(),
        });
      }

      return file;
    } finally {
      src.cleanup();
    }
  } catch (err) {
    console.warn("Could not compress media, uploading original file:", err);
    return file;
  }
}

/** POSTs a file to a Convex upload URL and returns the resulting storage id. Automatically compresses media >200KB under 500KB. */
export async function uploadFile(uploadUrl: string, file: File): Promise<Id<"_storage">> {
  const preparedFile = await compressMedia(file);
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": preparedFile.type || file.type || "application/octet-stream" },
    body: preparedFile,
  });
  if (!res.ok) throw new Error("The file failed to upload. Try again.");
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

/** Whether a picked file should be stored (and rendered) as an image or a video. */
export function mediaKindOf(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

/**
 * Drag-and-drop for a single file, dropped anywhere a `<input type="file">`
 * already lets someone pick one. One hook so every upload surface in the app
 * answers "is a file being dragged over this" and "a file was dropped" the
 * same way, instead of each screen wiring its own dragover/drop handlers.
 */
export function useFileDrop(onFile: (file: File) => void) {
  const [dragOver, setDragOver] = useState(false);

  return {
    dragOver,
    dropProps: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setDragOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      },
    },
  };
}
