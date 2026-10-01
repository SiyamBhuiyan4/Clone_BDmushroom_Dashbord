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
