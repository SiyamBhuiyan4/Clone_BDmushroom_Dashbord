import { useEffect, useRef, useState } from "react";

const DURATION = 620;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Decelerating ease, matching --ease-out closely enough for a counter. */
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * Counts from the previously shown value to the new one on a rAF loop.
 *
 * It animates the *number*, not a layout property, so nothing reflows — and
 * it holds the final value in a ref so a data change animates from where the
 * display actually was rather than restarting at zero.
 */
export function useAnimatedNumber(target: number) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      const value = from + (target - from) * easeOut(t);
      setDisplay(value);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return display;
}

/** Renders a number that animates to its new value, formatted however you like. */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const display = useAnimatedNumber(value);
  // The animated frames are rounded so the text does not jitter between
  // fractional values on the way up.
  return <>{format(Math.round(display))}</>;
}
