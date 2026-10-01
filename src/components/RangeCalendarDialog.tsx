import { useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Modal, ModalFooter, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { dayKey, localeFor, plural, startOfLocalDay } from "../lib/format";

const DAY = 24 * 60 * 60 * 1000;

function parseKey(key: string): number | null {
  if (!key) return null;
  const ts = new Date(`${key}T00:00:00`).getTime();
  return Number.isNaN(ts) ? null : startOfLocalDay(ts);
}

/** Calendar weeks for one month, Sunday first. Days outside the month are null. */
function monthMatrix(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d).getTime());
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * The dashboard's custom range, picked visually: click a start day, then an
 * end day, with the span between previewed as you hover. A pair of date
 * inputs can set the same two numbers, but nobody *sees* a 90-day stretch in
 * a text box — a calendar is what makes the size of the range legible before
 * you commit to it.
 */
export function RangeCalendarDialog({
  open,
  onClose,
  from,
  to,
  onApply,
  maxDays,
  maxDate,
}: {
  open: boolean;
  onClose: () => void;
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  /** Longest span selectable, inclusive. */
  maxDays: number;
  /** Start-of-day timestamp. No day after this can be picked. */
  maxDate: number;
}) {
  const t = useT();
  const { lang, fmtNum, fmtDateFull } = useSettings();
  const [draftFrom, setDraftFrom] = useState<number | null>(null);
  const [draftTo, setDraftTo] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState(() => new Date(maxDate));

  useEffect(() => {
    if (!open) return;
    // Seed from whatever was already applied, or the last 7 days the first time.
    const seedFrom = parseKey(from) ?? maxDate - 6 * DAY;
    const seedTo = parseKey(to) ?? maxDate;
    setDraftFrom(seedFrom);
    setDraftTo(seedTo);
    setHover(null);
    setCursor(new Date(seedTo));
  }, [open, from, to, maxDate]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const weeks = useMemo(() => monthMatrix(year, month), [year, month]);
  const monthLabel = cursor.toLocaleDateString(localeFor(lang), {
    month: "long",
    year: "numeric",
  });
  const weekdayLabels = useMemo(() => {
    // A week starting on the Sunday of any date works — only the weekday name is used.
    const ref = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ref);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString(localeFor(lang), { weekday: "short" });
    });
  }, [lang]);

  const atMaxMonth = year === new Date(maxDate).getFullYear() && month === new Date(maxDate).getMonth();

  const previewEnd = draftTo ?? hover;
  const rangeStart = draftFrom !== null && previewEnd !== null ? Math.min(draftFrom, previewEnd) : null;
  const rangeEnd = draftFrom !== null && previewEnd !== null ? Math.max(draftFrom, previewEnd) : null;

  const handlePick = (ts: number) => {
    if (draftFrom === null || draftTo !== null) {
      setDraftFrom(ts);
      setDraftTo(null);
      return;
    }
    let start = Math.min(draftFrom, ts);
    let end = Math.max(draftFrom, ts);
    if (Math.round((end - start) / DAY) + 1 > maxDays) {
      if (ts > draftFrom) end = start + (maxDays - 1) * DAY;
      else start = end - (maxDays - 1) * DAY;
    }
    setDraftFrom(start);
    setDraftTo(end);
  };

  const spanDays =
    draftFrom !== null && draftTo !== null ? Math.round((draftTo - draftFrom) / DAY) + 1 : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("sales.custom")}
      subtitle={`${t("sales.from")} / ${t("sales.to")} — ${plural(maxDays, "day")} ${t("dash.atMost")}`}
      icon={<CalendarRange size={20} />}
      width="sm:max-w-sm"
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Previous month"
            className="flex size-9 items-center justify-center rounded-xl text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="text-[14px] font-bold tracking-tight text-ink">{monthLabel}</p>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            disabled={atMaxMonth}
            aria-label="Next month"
            className="flex size-9 items-center justify-center rounded-xl text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div>
          <div className="grid grid-cols-7">
            {weekdayLabels.map((w, i) => (
              <div
                key={i}
                className="flex h-8 items-center justify-center text-[11px] font-bold tracking-wide text-ink-3"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-0.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((ts, di) => {
                  if (ts === null) return <div key={di} className="size-9" />;

                  const disabled = ts > maxDate;
                  const isStart = rangeStart !== null && ts === rangeStart;
                  const isEnd = rangeEnd !== null && ts === rangeEnd;
                  const inRange = rangeStart !== null && rangeEnd !== null && ts > rangeStart && ts < rangeEnd;
                  const isToday = ts === startOfLocalDay(Date.now());
                  const isEndpoint = isStart || isEnd;
                  const isSingleDay = isStart && isEnd;

                  return (
                    <div
                      key={di}
                      className={cx(
                        "relative flex h-9 items-center justify-center",
                        inRange && "bg-accent-soft",
                        isStart && !isSingleDay && "rounded-l-full bg-accent-soft",
                        isEnd && !isSingleDay && "rounded-r-full bg-accent-soft",
                      )}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => handlePick(ts)}
                        onMouseEnter={() => setHover(ts)}
                        className={cx(
                          "flex size-9 items-center justify-center rounded-full text-[13px] font-semibold transition-all",
                          disabled && "pointer-events-none text-ink-3/30",
                          !disabled && !isEndpoint && "text-ink-2 hover:bg-surface-2",
                          isEndpoint && "text-white shadow-[var(--shadow-sm)]",
                          !disabled && isToday && !isEndpoint && "ring-1 ring-inset ring-accent/50",
                        )}
                        style={isEndpoint ? { background: "var(--grad-violet)" } : undefined}
                      >
                        {fmtNum(new Date(ts).getDate())}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-page px-3.5 py-3 text-center">
          {draftFrom !== null && draftTo !== null ? (
            <p className="text-[13px] font-semibold text-ink">
              {fmtDateFull(draftFrom)} – {fmtDateFull(draftTo)}
              <span className="ml-1.5 font-normal text-ink-3">· {plural(spanDays!, "day")}</span>
            </p>
          ) : (
            <p className="text-[13px] text-ink-3">{t("dash.pickEndDate")}</p>
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={draftFrom === null || draftTo === null}
          onClick={() => {
            if (draftFrom === null || draftTo === null) return;
            onApply(dayKey(draftFrom), dayKey(draftTo));
            onClose();
          }}
        >
          {t("common.apply")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
