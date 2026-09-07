import { useMemo, useState } from "react";
import { Button, Input, Select } from "./ui";
import { usePersistedState } from "../lib/persist";
import { useT } from "../lib/i18n";
import { startOfLocalDay } from "../lib/format";

const DAY = 24 * 60 * 60 * 1000;
export const CUSTOM = -1;

export type DateBounds = { from: number; to: number; custom: boolean };

/**
 * The date range for a page, presets plus a custom from/to.
 *
 * One place decides what "the current range" means, so a list on screen and
 * anything derived from it — totals, a profit split, an erase — can never
 * disagree about which rows are in scope.
 */
export function useDateRange(initialDays = 0, storageKey?: string) {
  // Persisted when a key is given: a range is a preference, not transient UI
  // state, and re-picking it on every visit is friction for nothing.
  const persisted = usePersistedState(storageKey ?? "ac.range.unused", initialDays);
  const local = useState(initialDays);
  const [rangeDays, setRangeDays] = storageKey ? persisted : local;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const bounds = useMemo<DateBounds>(() => {
    if (rangeDays === CUSTOM) {
      return {
        from: from ? new Date(`${from}T00:00:00`).getTime() : 0,
        to: to ? new Date(`${to}T23:59:59.999`).getTime() : Number.MAX_SAFE_INTEGER,
        custom: true,
      };
    }
    if (rangeDays > 0) {
      return {
        from: startOfLocalDay(Date.now() - (rangeDays - 1) * DAY),
        to: Number.MAX_SAFE_INTEGER,
        custom: false,
      };
    }
    return { from: 0, to: Number.MAX_SAFE_INTEGER, custom: false };
  }, [rangeDays, from, to]);

  const inRange = (ts: number) => ts >= bounds.from && ts <= bounds.to;

  const reset = () => {
    setRangeDays(0);
    setFrom("");
    setTo("");
  };

  return { rangeDays, setRangeDays, from, setFrom, to, setTo, bounds, inRange, reset };
}

export type DateRangeState = ReturnType<typeof useDateRange>;

export function DateRangeControls({
  range,
  className,
}: {
  range: DateRangeState;
  className?: string;
}) {
  const t = useT();
  const presets = [
    { days: CUSTOM, label: t("sales.custom") },
    { days: 0, label: t("dash.allTime") },
    { days: 7, label: "7d" },
    { days: 30, label: "30d" },
    { days: 90, label: "90d" },
    { days: 365, label: "12m" },
  ];

  return (
    <>
      <div className={className}>
        <Select
          value={range.rangeDays}
          onChange={(e) => range.setRangeDays(Number(e.target.value))}
          aria-label={t("common.date")}
        >
          {presets.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

      {range.bounds.custom && (
        <div className="ac-fade-in flex w-full flex-wrap items-center gap-3">
          <label className="flex flex-1 items-center gap-2 sm:flex-none">
            <span className="shrink-0 text-[12.5px] font-semibold text-ink-3">
              {t("sales.from")}
            </span>
            <Input
              type="date"
              value={range.from}
              onChange={(e) => range.setFrom(e.target.value)}
              max={range.to || undefined}
              aria-label={t("sales.from")}
              className="sm:w-44"
            />
          </label>
          <label className="flex flex-1 items-center gap-2 sm:flex-none">
            <span className="shrink-0 text-[12.5px] font-semibold text-ink-3">{t("sales.to")}</span>
            <Input
              type="date"
              value={range.to}
              onChange={(e) => range.setTo(e.target.value)}
              min={range.from || undefined}
              aria-label={t("sales.to")}
              className="sm:w-44"
            />
          </label>
          {(range.from || range.to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                range.setFrom("");
                range.setTo("");
              }}
            >
              {t("sales.clearDates")}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

export function rangeLabel(range: DateRangeState, t: ReturnType<typeof useT>) {
  if (range.bounds.custom) return t("sales.custom");
  const map: Record<number, string> = {
    0: t("dash.allTime"),
    7: "7d",
    30: "30d",
    90: "90d",
    365: "12m",
  };
  return map[range.rangeDays] ?? t("dash.allTime");
}
