import { useEffect, useState } from "react";
import { useSettings } from "../../lib/settings";
import { plural } from "../../lib/format";
import { cx } from "../ui";

export type TopProduct = {
  productId: string;
  name: string;
  revenue: number;
  profit: number;
  units: number;
};

/**
 * One series, so every bar wears the same hue — bar length already encodes
 * magnitude and a value-ramp would burn the color channel saying it twice.
 * A negative bar is a genuine status (a loss) and gets the status color plus
 * a written label, never color alone.
 */
export function TopProductsChart({ items }: { items: TopProduct[] }) {
  const { fmt } = useSettings();
  const [hover, setHover] = useState<string | null>(null);
  const widest = Math.max(...items.map((i) => Math.abs(i.profit)), 1);

  // Bars grow from zero on the frame after mount, so the width transition has
  // something to animate from.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <ol className="flex flex-col gap-3.5 px-6 pb-6">
      {items.map((item, index) => {
        const loss = item.profit < 0;
        const pct = Math.max((Math.abs(item.profit) / widest) * 100, 2);
        return (
          <li
            key={item.productId}
            className="relative"
            onMouseEnter={() => setHover(item.productId)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-center justify-between gap-3 pb-1.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[10.5px] font-bold text-ink-3 tabular-nums"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="truncate text-[13.5px] font-medium text-ink" title={item.name}>
                  {item.name}
                </span>
              </span>
              <span
                className={cx(
                  "shrink-0 text-[13.5px] font-bold tabular-nums",
                  loss ? "text-critical-ink" : "text-ink",
                )}
              >
                {loss ? `−${fmt(Math.abs(item.profit))}` : fmt(item.profit)}
              </span>
            </div>
            {/* Track keeps the row height stable; the bar is the only mark. */}
            <div className="ml-7.5 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-700 ease-[var(--ease-out)]"
                style={{
                  width: grown ? `${pct}%` : "0%",
                  transitionDelay: `${index * 55}ms`,
                  background: loss ? "var(--critical)" : "var(--series-1)",
                }}
              />
            </div>

            {hover === item.productId && (
              <div className="pointer-events-none absolute right-0 -top-2 z-10 w-max rounded-xl border border-line bg-surface px-3 py-2 shadow-[var(--shadow-pop)]">
                <p className="text-[12px] font-bold text-ink">{item.name}</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-ink-3">
                  {fmt(item.revenue)} revenue · {plural(item.units, "unit")}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
