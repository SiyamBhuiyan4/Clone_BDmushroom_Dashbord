import { useState, type DragEvent } from "react";
import type { Id } from "../../convex/_generated/dataModel";

/** POSTs a file to a Convex upload URL and returns the resulting storage id. */
export async function uploadFile(uploadUrl: string, file: File): Promise<Id<"_storage">> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
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
        // Children fire their own dragleave as the pointer crosses into them;
        // only the zone's own boundary should turn the highlight off.
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
