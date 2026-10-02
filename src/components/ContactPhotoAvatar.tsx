import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { cx } from "./ui";
import { useT } from "../lib/i18n";
import { errorMessage, useToast } from "../lib/toast";
import { useFileDrop } from "../lib/upload";

/**
 * A photo shown where a detail dialog's header icon would otherwise sit —
 * click or drop a file directly on it. The caller owns how the upload is
 * actually done (which entity, which mutations), since that differs between
 * a customer and a vendor; this just owns the widget.
 */
export function ContactPhotoAvatar({
  photoUrl,
  onUpload,
}: {
  photoUrl?: string | null;
  /** Uploads and persists the file. Throwing restores the previous photo. */
  onUpload: (file: File) => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(photoUrl ?? null);
  const [busy, setBusy] = useState(false);

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
        "relative flex size-11 cursor-pointer items-center justify-center",
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
        <img src={preview} alt="" className="size-11 object-cover" />
      ) : (
        <Camera size={19} aria-hidden />
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
          <div className="ac-skeleton size-4 rounded-full" aria-hidden />
        </div>
      )}
    </div>
  );
}
