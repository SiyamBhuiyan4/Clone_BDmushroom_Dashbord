import { useEffect, useState } from "react";
import { Pencil, StickyNote } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Modal, ModalFooter, Textarea } from "./ui";
import { useSettings } from "../lib/settings";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

/** The note every trainee sees under Notes in their portal. */
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
      toast.ok(text.trim() ? "Note saved — trainees see it now." : "Note cleared.");
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
      icon={<StickyNote size={19} />}
      title="Note for trainees"
      subtitle={
        note?.updatedAt
          ? `Every trainee sees this under Notes. Last saved ${fmtSaleTime(note.updatedAt)}.`
          : "Every trainee sees this under Notes in their portal."
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
            {saving ? "Saving…" : "Save note"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
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
