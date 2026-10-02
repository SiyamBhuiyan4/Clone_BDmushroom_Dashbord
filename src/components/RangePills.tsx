import { CalendarRange } from "lucide-react";
import { cx } from "./ui";
import { RangeCalendarDialog } from "./RangeCalendarDialog";
import { useSettings } from "../lib/settings";
import { CUSTOM, MAX_CUSTOM_DAYS, type RangeFilter } from "../lib/dateRange";

/** The 7D/30D/90D/12M/Custom row, wired to a `useRangeFilter` instance. */
export function RangePills({ range }: { range: RangeFilter }) {
  const { fmtDate } = useSettings();

  return (
    <>
      <div
        className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-sm)]"
        role="group"
        aria-label="Date range"
      >
        {range.ranges.map((r) => {
          const active = !range.isCustom && range.rangeDays === r.days;
          return (
            <button
              key={r.days}
              onClick={() => range.setRangeDays(r.days)}
              aria-pressed={active}
              style={active ? { background: "var(--grad-violet)" } : undefined}
              className={cx(
                "h-8 rounded-lg px-3.5 text-[12.5px] font-bold tracking-wide transition-all",
                active ? "text-white" : "text-ink-3 hover:text-ink",
              )}
            >
              {r.label}
            </button>
          );
        })}
        <button
          onClick={() => range.setCalendarOpen(true)}
          aria-pressed={range.isCustom}
          style={range.isCustom ? { background: "var(--grad-violet)" } : undefined}
          className={cx(
            "flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-bold tracking-wide transition-all",
            range.isCustom ? "text-white" : "text-ink-3 hover:text-ink",
          )}
        >
          <CalendarRange size={14} />
          {range.isCustom ? `${fmtDate(range.since)} – ${fmtDate(range.until)}` : "Custom"}
        </button>
      </div>

      <RangeCalendarDialog
        open={range.calendarOpen}
        onClose={() => range.setCalendarOpen(false)}
        from={range.customFrom}
        to={range.customTo}
        maxDays={MAX_CUSTOM_DAYS}
        maxDate={range.todayStart}
        onApply={(nextFrom, nextTo) => {
          range.setCustomFrom(nextFrom);
          range.setCustomTo(nextTo);
          range.setRangeDays(CUSTOM);
        }}
      />
    </>
  );
}
