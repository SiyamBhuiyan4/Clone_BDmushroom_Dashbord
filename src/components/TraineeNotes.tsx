import { useEffect, useRef, useState } from "react";
import { Pencil, Radio, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button, Modal, ModalFooter, Textarea, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

/** Note text with its links made clickable. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Speech bubble matching the requested UI design:
 * Rounded box with dark crisp border, subtle shadow, and a speech-bubble tail
 * pointing down-left.
 */
function SpeechBubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("relative rounded-[22px] border-2 border-ink/80 dark:border-ink/60 bg-surface p-5 shadow-[var(--shadow-pop)]", className)}>
      {children}
      {/* Speech bubble tail pointing down-left */}
      <div className="absolute -bottom-[13px] left-6 h-[14px] w-[18px] pointer-events-none select-none" aria-hidden>
        <svg viewBox="0 0 18 14" className="h-full w-full overflow-visible">
          {/* Surface fill */}
          <polygon points="0,0 18,0 4,14" className="fill-surface" />
          {/* Border strokes */}
          <path
            d="M0,0 L4,14 L18,0"
            className="stroke-ink/80 dark:stroke-ink/60 fill-none stroke-[2]"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Overwrite top border seam */}
          <line x1="0.5" y1="0" x2="17.5" y2="0" className="stroke-surface stroke-[3]" />
        </svg>
      </div>
    </div>
  );
}

/** The broadcast note every trainee sees under Notes in their portal. */
export function GeneralNoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { fmtSaleTime } = useSettings();
  const note = useAuthedQuery(api.trainees.generalNote);
  const save = useAuthedMutation(api.trainees.setGeneralNote);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const loadedOnceRef = useRef(false);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    if (!open) {
      loadedOnceRef.current = false;
      isDirtyRef.current = false;
      setText("");
      return;
    }
    // Fill once per opening, not on every refresh of the saved note, and never wipe user input.
    if (!loadedOnceRef.current && note !== undefined) {
      if (!isDirtyRef.current) {
        setText(note?.text ?? "");
      }
      loadedOnceRef.current = true;
    }
  }, [open, note]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({ text });
      toast.ok(text.trim() ? "Broadcast saved — all trainees will see it now." : "Broadcast note cleared.");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      guardChanges
      open={open}
      onClose={onClose}
      icon={<Radio size={19} className="text-accent" />}
      title="Broadcast to all trainees"
      subtitle={
        note?.updatedAt
          ? `Every trainee sees this in their portal under Note. Last saved ${fmtSaleTime(note.updatedAt)}.`
          : "Every trainee sees this in their portal under Note."
      }
    >
      <form onSubmit={submit}>
        <div className="px-6 py-6">
          <Textarea
            rows={9}
            value={text}
            onChange={(e) => {
              isDirtyRef.current = true;
              setText(e.target.value);
            }}
            placeholder={"Next class: Saturday 10am, Savar office.\nQuestions? WhatsApp 01710-000000."}
            autoFocus
          />
          <p className="mt-2 text-[12px] text-ink-3">Line breaks are kept, and links become clickable. Leave it empty to remove it.</p>
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save broadcast"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/**
 * Slide-in drawer for managing a private note for a specific trainee.
 * Slides in from the right smoothly and renders the note in a speech bubble.
 */
export function AdminTraineeNoteDrawer({
  open,
  onClose,
  trainee,
}: {
  open: boolean;
  onClose: () => void;
  trainee: (Doc<"trainees"> & { photoUrl?: string | null }) | null;
}) {
  const toast = useToast();
  const save = useAuthedMutation(api.trainees.setAdminNote);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && trainee) {
      setMounted(true);
      setText(trainee.note ?? "");
      setEditing(!trainee.note);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), 520);
    return () => window.clearTimeout(timer);
  }, [open, trainee?._id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !trainee) return null;

  async function handleSave() {
    if (!trainee) return;
    setSaving(true);
    try {
      await save({ id: trainee._id, text });
      toast.ok(text.trim() ? "Note saved." : "Note cleared.");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!trainee) return;
    setSaving(true);
    try {
      await save({ id: trainee._id, text: "" });
      setText("");
      toast.ok("Note cleared.");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center sm:justify-end p-4 sm:p-8 sm:pr-14 overflow-hidden" onClick={onClose}>
      <div
        className={cx(
          "absolute inset-0 bg-scrim/30 backdrop-blur-[2px] transition-opacity duration-300",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-label={`Note for ${trainee.name}`}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          "relative z-10 w-full max-w-sm sm:max-w-md mt-16 sm:mt-24",
          "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          shown ? "translate-x-0 opacity-100 scale-100" : "translate-x-8 opacity-0 scale-95",
        )}
      >
        <SpeechBubble className="w-full">
          {editing ? (
            <div className="flex flex-col">
              <Textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write note..."
                autoFocus
                className="border-none bg-transparent p-0 text-[15px] leading-7 text-ink placeholder:text-ink-3 focus:ring-0 focus:outline-none resize-none"
              />
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-line/40 pt-2.5">
                {trainee.note && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setText(trainee.note ?? "");
                      setEditing(false);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : text ? (
            <div className="flex flex-col">
              <p className="min-h-[2.5rem] whitespace-pre-wrap text-[15px] leading-7 text-ink">
                <Linkified text={text} />
              </p>
              <div className="mt-4 flex items-center justify-end gap-4 border-t border-line/40 pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-critical transition-colors"
                >
                  <Trash2 size={13} /> Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <p className="text-[13.5px] text-ink-3">No note written for this trainee.</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setEditing(true)}
                className="mt-3"
              >
                <Pencil size={13} /> Write note
              </Button>
            </div>
          )}
        </SpeechBubble>
      </div>
    </div>
  );
}



