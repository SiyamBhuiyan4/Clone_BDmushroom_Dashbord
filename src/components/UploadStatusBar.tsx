import { CloudUpload, CheckCircle2, AlertCircle, Sparkles, X } from "lucide-react";
import { formatFileSize, setUploadStatus, useUploadProgress } from "../lib/upload";
import { cx } from "./ui";

export function UploadStatusBar() {
  const status = useUploadProgress();
  if (!status) return null;

  const isCompressing = status.stage === "compressing";
  const isUploading = status.stage === "uploading";
  const isDone = status.stage === "done";
  const isError = status.stage === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "ac-pop-in fixed z-60 transition-all",
        // Desktop: bottom right. Mobile: centered at bottom
        "bottom-5 right-5 w-84 max-w-[calc(100vw-2.5rem)]",
        "rounded-2xl border border-line-strong bg-surface p-4 shadow-[var(--shadow-pop)] backdrop-blur-xl",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cx(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            isCompressing && "bg-amber-500/15 text-amber-500",
            isUploading && "bg-accent-soft text-accent",
            isDone && "bg-good-soft text-good",
            isError && "bg-critical-soft text-critical",
          )}
        >
          {isCompressing && <Sparkles size={18} className="animate-pulse" />}
          {isUploading && <CloudUpload size={18} className="animate-bounce" />}
          {isDone && <CheckCircle2 size={18} />}
          {isError && <AlertCircle size={18} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-bold text-ink">
              {isCompressing && "Compressing photo..."}
              {isUploading && "Uploading to cloud..."}
              {isDone && "Upload complete!"}
              {isError && "Upload failed"}
            </p>
            <span className="text-[11.5px] font-semibold tabular-nums text-ink-3">
              {status.progress}%
            </span>
          </div>

          <p className="truncate text-[11.5px] text-ink-3 mt-0.5">
            {status.fileName}
          </p>

          {status.compressedSize ? (
            <p className="text-[11px] font-medium text-accent mt-0.5">
              {formatFileSize(status.fileSize)} → {formatFileSize(status.compressedSize)} (
              {Math.max(0, Math.round((1 - status.compressedSize / status.fileSize) * 100))}% smaller)
            </p>
          ) : isCompressing ? (
            <p className="text-[11px] text-amber-500 mt-0.5">
              Optimizing {formatFileSize(status.fileSize)} to under 200 KB...
            </p>
          ) : null}

          {isError && status.error && (
            <p className="text-[11px] text-critical mt-0.5">{status.error}</p>
          )}

          {/* Progress Bar */}
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className={cx(
                "h-full rounded-full transition-all duration-200 ease-out",
                isDone ? "bg-good" : isError ? "bg-critical" : "bg-accent",
              )}
              style={{ width: `${Math.max(5, status.progress)}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => setUploadStatus(null)}
          aria-label="Dismiss upload status"
          className="text-ink-3 hover:text-ink -mr-1 -mt-1 p-1 rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
