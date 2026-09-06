import { useId, useMemo, useState } from "react";
import { useChartSize, niceScale } from "./useChartSize";
import { useSettings } from "../../lib/settings";
import { formatDate, formatDateFull } from "../../lib/format";
import { cx } from "../ui";

export type TrendPoint = { ts: number; revenue: number; profit: number };

const PAD = { top: 20, right: 74, bottom: 30, left: 56 };
const PLOT_HEIGHT = 232;

/**
 * Revenue and profit on one shared money axis. Two series, so a legend is
 * always shown and both are direct-labeled at their right-hand endpoint —
 * identity never rests on color alone.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const { fmt, fmtCompact } = useSettings();
  const { ref, width } = useChartSize<HTMLDivElement>();
  const gradientId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const height = PLOT_HEIGHT + PAD.top + PAD.bottom;
  const innerWidth = Math.max(width - PAD.left - PAD.right, 10);

  const scale = useMemo(() => {
    const values = points.flatMap((p) => [p.revenue, p.profit]);
    return niceScale(Math.min(0, ...values), Math.max(0, ...values));
  }, [points]);

  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? innerWidth / 2 : (i / (points.length - 1)) * innerWidth);
  const y = (value: number) =>
    PAD.top + PLOT_HEIGHT - ((value - scale.min) / (scale.max - scale.min)) * PLOT_HEIGHT;

  const linePath = (key: "revenue" | "profit") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p[key])}`).join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath("revenue")} L${x(points.length - 1)},${y(scale.min)} L${x(0)},${y(scale.min)} Z`
      : "";

  const last = points.at(-1);
  const active = hover != null ? points[hover] : null;
  const zeroY = scale.min < 0 ? y(0) : null;

  // Tick every Nth day, so labels never collide on a narrow card.
  const tickEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerWidth / 74))));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-2">
        <Legend />
        <button
          onClick={() => setShowTable((v) => !v)}
          className="rounded-lg px-2 py-1 text-[12.5px] font-semibold text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          aria-pressed={showTable}
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <TrendTable points={points} />
      ) : (
        <div ref={ref} className="relative px-3 pb-2">
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${Math.max(width, 10)} ${height}`}
            role="img"
            aria-label="Revenue and profit per day"
            tabIndex={0}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = e.clientX - rect.left;
              const ratio = (px - PAD.left) / innerWidth;
              const i = Math.round(ratio * (points.length - 1));
              setHover(Math.min(points.length - 1, Math.max(0, i)));
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const step = e.key === "ArrowRight" ? 1 : -1;
              setHover((h) => {
                const base = h ?? points.length - 1;
                return Math.min(points.length - 1, Math.max(0, base + step));
              });
            }}
            className="overflow-visible"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Hairline grid, solid — never dashed. */}
            {scale.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + innerWidth}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--grid)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 10}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-ink-3 text-[11.5px] font-medium tabular-nums"
                >
                  {fmtCompact(t)}
                </text>
              </g>
            ))}

            {zeroY != null && (
              <line
                x1={PAD.left}
                x2={PAD.left + innerWidth}
                y1={zeroY}
                y2={zeroY}
                stroke="var(--axis)"
                strokeWidth={1}
              />
            )}

            {points.map((p, i) =>
              // The last day always gets a label; a regular tick is dropped
              // when it would land too close to it and collide.
              i === points.length - 1 ||
              (i % tickEvery === 0 && points.length - 1 - i >= tickEvery) ? (
                <text
                  key={p.ts}
                  x={x(i)}
                  y={PAD.top + PLOT_HEIGHT + 17}
                  textAnchor={i === points.length - 1 ? "end" : "middle"}
                  className="fill-ink-3 text-[11.5px] font-medium tabular-nums"
                >
                  {formatDate(p.ts)}
                </text>
              ) : null,
            )}

            {points.length > 0 && (
              <>
                <path
                  key={`area-${points.length}`}
                  d={areaPath}
                  fill={`url(#${gradientId})`}
                  className="ac-fade-in"
                  style={{ animationDuration: "700ms", animationDelay: "250ms" }}
                />
                {/*
                  `key` on the range length so the lines redraw when the range
                  changes, but not on every hover re-render. pathLength={1}
                  normalises the dash maths regardless of the real path length.
                */}
                <path
                  key={`revenue-${points.length}`}
                  d={linePath("revenue")}
                  pathLength={1}
                  fill="none"
                  stroke="var(--series-1)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ac-draw"
                />
                <path
                  key={`profit-${points.length}`}
                  d={linePath("profit")}
                  pathLength={1}
                  fill="none"
                  stroke="var(--series-2)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ac-draw"
                  style={{ animationDelay: "120ms" }}
                />
              </>
            )}

            {/* Crosshair + markers, each with a 2px surface ring. */}
            {active && hover != null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + PLOT_HEIGHT}
                  stroke="var(--axis)"
                  strokeWidth={1}
                />
                <circle
                  cx={x(hover)}
                  cy={y(active.revenue)}
                  r={5}
                  fill="var(--series-1)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                <circle
                  cx={x(hover)}
                  cy={y(active.profit)}
                  r={5}
                  fill="var(--series-2)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              </g>
            )}

            {/* Direct labels on the endpoints — two series, so both get one. */}
            {last && points.length > 1 && (
              <g className="tabular-nums">
                <text
                  x={x(points.length - 1) + 9}
                  y={y(last.revenue)}
                  dominantBaseline="middle"
                  className="fill-ink-2 text-[11.5px] font-bold"
                >
                  {fmtCompact(last.revenue)}
                </text>
                <text
                  x={x(points.length - 1) + 9}
                  y={y(last.profit)}
                  dominantBaseline="middle"
                  className="fill-ink-2 text-[11.5px] font-bold"
                >
                  {fmtCompact(last.profit)}
                </text>
              </g>
            )}
          </svg>

          {active && hover != null && (
            <div
              className="pointer-events-none absolute z-10 w-max min-w-44 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)]"
              style={{
                left: Math.min(Math.max(x(hover) - 76, 4), Math.max(width - 172, 4)),
                top: PAD.top - 6,
              }}
            >
              <p className="mb-2 text-[12px] font-semibold text-ink-3">
                {formatDateFull(active.ts)}
              </p>
              <TooltipRow color="var(--series-1)" label="Revenue" value={fmt(active.revenue)} />
              <TooltipRow color="var(--series-2)" label="Profit" value={fmt(active.profit)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3.5">
      <LegendItem color="var(--series-1)" label="Revenue" />
      <LegendItem color="var(--series-2)" label="Profit" />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink-2">
      <span className="h-1 w-4 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-0.5">
      <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
        <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </span>
      <span className="text-[12.5px] font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** The WCAG-clean twin of the chart — every plotted value, readable as text. */
function TrendTable({ points }: { points: TrendPoint[] }) {
  const { fmt } = useSettings();
  const rows = [...points].reverse();
  return (
    <div className="max-h-72 overflow-y-auto px-6 pb-5">
      <table className="w-full text-[13.5px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-[12px] font-semibold text-ink-3">
            <th className="py-2.5 font-semibold">Day</th>
            <th className="py-2.5 text-right font-semibold">Revenue</th>
            <th className="py-2.5 text-right font-semibold">Profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.ts} className={cx("border-b border-line last:border-0")}>
              <td className="py-2 text-ink-2">{formatDateFull(p.ts)}</td>
              <td className="py-2 text-right font-semibold tabular-nums text-ink">
                {fmt(p.revenue)}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums text-ink">
                {fmt(p.profit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
