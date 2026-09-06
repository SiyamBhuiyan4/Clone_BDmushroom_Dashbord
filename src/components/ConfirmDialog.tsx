import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Modal, ModalFooter } from "./ui";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  body: string;
  confirmLabel?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={<AlertTriangle size={19} />}
      // A destructive dialog wears the destructive colour, not the brand one.
      gradient="linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)"
      width="sm:max-w-md"
    >
      <div className="px-6 py-6">
        <p className="text-[14px] leading-6.5 text-ink-2">{body}</p>
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
