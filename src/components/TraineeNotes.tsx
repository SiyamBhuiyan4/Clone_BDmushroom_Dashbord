import { useEffect, useState } from "react";
import { KeyRound, Lock, Pencil, Phone, Radio, StickyNote, Trash2, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button, Modal, ModalFooter, Textarea, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { gradientFor, initialOf } from "../lib/avatar";

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

  useEffect(() => {
    if (open && note) setText(note.text);
    // Fill once per opening, not on every refresh of the saved note.
  }, [open, note === undefined]);

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
            onChange={(e) => setText(e.target.value)}
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
    <div className="fixed inset-0 z-50 overflow-hidden" onClick={onClose}>
      <div
        className={cx(
          "absolute inset-0 bg-scrim transition-opacity duration-500",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-label={`Note for ${trainee.name}`}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          "absolute top-0 right-0 flex h-[100dvh] w-full max-w-md flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]",
          "transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center gap-3.5 border-b border-line px-5 py-4">
          {trainee.photoUrl ? (
            <img src={trainee.photoUrl} alt="" className="size-11 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-[15px] font-bold text-white shadow-[var(--shadow-hero)]"
              style={{ background: gradientFor(trainee.name) }}
              aria-hidden
            >
              {initialOf(trainee.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-bold text-ink">{trainee.name}</h2>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
              <Lock size={12} className="text-accent" />
              <span>Admin Note • Private to office</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {trainee.phone && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-page px-2.5 py-1 text-[12px] font-medium text-ink-2">
                <Phone size={12} className="text-ink-3" />
                {trainee.phone}
              </span>
            )}
            {trainee.username && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-page px-2.5 py-1 text-[12px] font-medium text-ink-2">
                <KeyRound size={12} className="text-accent" />
                {trainee.username}
              </span>
            )}
          </div>

          <div className="pb-8">
            <SpeechBubble className="ac-pop-in">
              {editing ? (
                <div className="flex flex-col gap-3">
                  <Textarea
                    rows={6}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Write a private note about this trainee..."
                    autoFocus
                  />
                  <div className="mt-2 flex items-center justify-between border-t border-line/70 pt-3">
                    <span className="text-[11.5px] text-ink-3">Kept only for admin</span>
                    <div className="flex items-center gap-2">
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
                        {saving ? "Saving…" : "Save note"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : text ? (
                <div className="flex flex-col">
                  <p className="whitespace-pre-wrap text-[14.5px] leading-7 text-ink">
                    <Linkified text={text} />
                  </p>
                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-line/70 pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil size={13} /> Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleClear}
                      className="text-critical hover:bg-critical-soft"
                    >
                      <Trash2 size={13} /> Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-[13.5px] text-ink-3">No note written for this trainee yet.</p>
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

          <div className="rounded-xl border border-line bg-page/70 p-3.5 text-[12px] leading-5 text-ink-3">
            <p className="font-semibold text-ink-2">🔒 Admin Only Note</p>
            <p className="mt-0.5">
              This note is visible only to admins and never shared with the trainee.
              To announce something to all trainees, use the <strong className="text-ink">Broadcast</strong> button.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}


/** A note shown to this one trainee in their portal — not the shop's private note. */
export function PortalNoteCard({ traineeId, note }: { traineeId: Id<"trainees">; note?: string }) {
  const toast = useToast();
  const save = useAuthedMutation(api.trainees.setPortalNote);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setEditing(false), [traineeId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({ id: traineeId, text });
      toast.ok(text.trim() ? "Saved — they'll see it under Notes." : "Note removed.");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-page p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <StickyNote size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">Note for this trainee</p>
          <p className="text-[12px] text-ink-3">Shown only to them, under Notes in their portal.</p>
        </div>
        {!editing && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setText(note ?? "");
              setEditing(true);
            }}
          >
            <Pencil size={14} /> {note ? "Edit" : "Write"}
          </Button>
        )}
      </div>
      {editing ? (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : (
        note && <p className="mt-3 text-[13px] leading-6 whitespace-pre-wrap text-ink-2">{note}</p>
      )}
    </div>
  );
}
