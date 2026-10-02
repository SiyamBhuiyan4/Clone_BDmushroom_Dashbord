import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Modal, ModalFooter, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { localeFor, monthKey } from "../lib/format";

/**
 * Jump straight to any month instead of clicking the chevrons N times — the
 * complaint this replaces is paging through a year to reach last January.
 */
export function MonthPickerDialog({
  open,
  onClose,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  /** "YYYY-MM" currently shown. */
  value: string;
  onSelect: (month: string) => void;
}) {
  const t = useT();
  const { lang } = useSettings();
  const [year, setYear] = useState(() => Number(value.split("-")[0]));

  // Re-center on whichever month is open every time the dialog is opened.
  useEffect(() => {
    if (open) setYear(Number(value.split("-")[0]));
  }, [open, value]);

  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Date(2024, i, 1).toLocaleDateString(localeFor(lang), { month: "short" }),
      ),
    [lang],
  );

  const currentKey = monthKey(Date.now());
  const [selYear, selMonth] = value.split("-").map(Number);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("fixedCosts.pickMonth")}
      icon={<CalendarDays size={20} />}
      width="sm:max-w-sm"
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label={t("fixedCosts.prevYear")}
            className="flex size-9 items-center justify-center rounded-xl text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="text-[14px] font-bold tracking-tight text-ink">{year}</p>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            aria-label={t("fixedCosts.nextYear")}
            className="flex size-9 items-center justify-center rounded-xl text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {monthLabels.map((label, i) => {
            const key = `${year}-${String(i + 1).padStart(2, "0")}`;
            const isSelected = year === selYear && i + 1 === selMonth;
            const isCurrent = key === currentKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSelect(key);
                  onClose();
                }}
                className={cx(
                  "flex h-11 items-center justify-center rounded-xl text-[13px] font-semibold transition-all",
                  isSelected ? "text-white shadow-[var(--shadow-sm)]" : "text-ink-2 hover:bg-surface-2",
                  !isSelected && isCurrent && "ring-1 ring-inset ring-accent/50",
                )}
                style={isSelected ? { background: "var(--grad-violet)" } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
