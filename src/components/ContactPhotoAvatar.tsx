import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { cx } from "./ui";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useFileDrop, useUploadProgress } from "../lib/upload";
import { initialOf } from "../lib/avatar";

/**
 * A photo shown where a detail dialog's header icon would otherwise sit —
 * click or drop a file directly on it. If there is no photo, it displays
 * the entity's first letter by default with a subtle camera overlay on hover.
 */
export function ContactPhotoAvatar({
  name,
  photoUrl,
  onUpload,
}: {
  name?: string;
  photoUrl?: string | null;
  /** Uploads and persists the file. Throwing restores the previous photo. */
  onUpload: (file: File) => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(photoUrl ?? null);
  const [busy, setBusy] = useState(false);
  const uploadStatus = useUploadProgress();

  useEffect(() => {
    setPreview(photoUrl ?? null);
  }, [photoUrl]);

  async function pick(file: File) {
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      await onUpload(file);
      toast.ok(t("contacts.photoUpdated"));
    } catch (err) {
      toast.error(errorMessage(err));
      setPreview(photoUrl ?? null);
    } finally {
      setBusy(false);
    }
  }

  const { dragOver, dropProps } = useFileDrop((file) => void pick(file));

  return (
    <div
      {...dropProps}
      role="button"
      tabIndex={0}
      aria-label={photoUrl ? t("contacts.changePhoto") : t("contacts.uploadPhoto")}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      className={cx(
        "group/avatar relative flex size-11 aspect-square cursor-pointer items-center justify-center rounded-full overflow-hidden select-none",
        dragOver && "ring-2 ring-white/70",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
      {preview ? (
        <img src={preview} alt="" className="size-full object-cover rounded-full" />
      ) : name ? (
        <span className="text-[17px] font-bold text-white leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
          {initialOf(name)}
        </span>
      ) : (
        <Camera size={19} aria-hidden />
      )}

      {/* Hover camera badge hint */}
      {!busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity rounded-full text-white">
          <Camera size={16} />
        </div>
      )}

      {busy && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/70 rounded-full text-white text-[10px] font-bold">
          {uploadStatus ? `${uploadStatus.progress}%` : <div className="ac-skeleton size-4 rounded-full" aria-hidden />}
        </div>
      )}
    </div>
  );
}
