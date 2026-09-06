import { useEffect, useRef, useState } from "react";

/** Tracks a container's width so the SVG can be laid out in real pixels. */
export function useChartSize<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width;
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/**
 * A "nice" axis: rounded tick step and a ceiling that lands on one.
 * Returns ticks covering [min, max] inclusive.
 */
export function niceScale(min: number, max: number, targetTicks = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    const top = max > 0 ? max : 1;
    return { min: Math.min(0, min), max: top, ticks: [0, top] };
  }
  const lo = Math.min(0, min);
  const raw = (max - lo) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;

  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    // Re-round to kill float drift like 0.30000000000000004.
    ticks.push(Number(v.toPrecision(12)));
  }
  return { min: niceMin, max: niceMax === niceMin ? niceMin + step : niceMax, ticks };
}
