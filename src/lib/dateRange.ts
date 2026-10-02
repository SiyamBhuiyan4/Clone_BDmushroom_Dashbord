import { useMemo, useState } from "react";
import { usePersistedState } from "./persist";
import { useSettings } from "./settings";
import { startOfLocalDay } from "./format";

export const DAY = 24 * 60 * 60 * 1000;
export const CUSTOM = "custom" as const;
/** Every window this app's backend sends the client tops out at a year. */
export const MAX_CUSTOM_DAYS = 365;

export type RangePreset = { days: number; label: string; full: string; prev: string };

export const DEFAULT_RANGES: RangePreset[] = [
  { days: 7, label: "7D", full: "last 7 days", prev: "previous 7 days" },
  { days: 30, label: "30D", full: "last 30 days", prev: "previous 30 days" },
  { days: 90, label: "90D", full: "last 90 days", prev: "previous 90 days" },
  { days: 365, label: "12M", full: "last 12 months", prev: "previous 12 months" },
];

export function parseDateInput(value: string): number | null {
  if (!value) return null;
  const ts = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ts) ? null : startOfLocalDay(ts);
}

/**
 * The preset-or-custom date range behind every page that has a 7D/30D/90D/12M
 * filter. One hook so the Dashboard and the Products page can never compute
 * "since" and "until" two slightly different ways.
 */
export function useRangeFilter(storageKey: string, ranges: RangePreset[] = DEFAULT_RANGES, defaultDays = 30) {
  const { fmtDateFull } = useSettings();
  const [rangeDays, setRangeDays] = usePersistedState<number | typeof CUSTOM>(storageKey, defaultDays);
  const [customFrom, setCustomFrom] = usePersistedState(`${storageKey}.from`, "");
  const [customTo, setCustomTo] = usePersistedState(`${storageKey}.to`, "");
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isCustom = rangeDays === CUSTOM;
  const preset = isCustom ? undefined : ranges.find((r) => r.days === rangeDays);
  const todayStart = startOfLocalDay(Date.now());

  const bounds = useMemo(() => {
    let since: number;
    let until: number;
    if (isCustom) {
      const from = parseDateInput(customFrom);
      const to = parseDateInput(customTo);
      until = Math.min(to ?? todayStart, todayStart);
      since = from ?? until;
      if (since > until) since = until;
      // Hard cap at a year, no matter what the inputs allowed.
      const minSince = until - (MAX_CUSTOM_DAYS - 1) * DAY;
      if (since < minSince) since = minSince;
    } else {
      const days = preset?.days ?? defaultDays;
      until = todayStart;
      since = todayStart - (days - 1) * DAY;
    }
    const spanDays = Math.round((until - since) / DAY) + 1;
    return { since, until, untilExclusive: until + DAY, spanDays, prevSince: since - spanDays * DAY };
  }, [isCustom, customFrom, customTo, todayStart, preset, defaultDays]);

  const activeLabel = preset
    ? { full: preset.full, prev: preset.prev }
    : {
        full: `${fmtDateFull(bounds.since)} – ${fmtDateFull(bounds.until)}`,
        prev: "the previous period",
      };

  return {
    ranges,
    rangeDays,
    setRangeDays,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    calendarOpen,
    setCalendarOpen,
    isCustom,
    preset,
    todayStart,
    activeLabel,
    ...bounds,
  };
}

export type RangeFilter = ReturnType<typeof useRangeFilter>;
