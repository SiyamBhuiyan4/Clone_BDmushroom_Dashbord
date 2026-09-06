/** The app is Bangladeshi taka only. */
export const CURRENCY_CODE = "BDT";
export const CURRENCY_SYMBOL = "৳";

/** Full money string, e.g. "৳1,250.00". Poisha are dropped for whole amounts. */
export function money(value: number) {
  const whole = Number.isInteger(value);
  return `${CURRENCY_SYMBOL}${value.toLocaleString(undefined, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Short money for axis ticks and tight tiles, e.g. "৳12.5k". */
export function moneyCompact(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${CURRENCY_SYMBOL}${trim(abs / 1_000_000)}m`;
  if (abs >= 1_000) return `${sign}${CURRENCY_SYMBOL}${trim(abs / 1_000)}k`;
  return `${sign}${CURRENCY_SYMBOL}${trim(abs)}`;
}

function trim(n: number) {
  return n
    .toLocaleString(undefined, { maximumFractionDigits: 1 })
    .replace(/\.0$/, "");
}

export function percent(fraction: number) {
  return `${(fraction * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

const DAY = 24 * 60 * 60 * 1000;

export function dayKey(ts: number) {
  const d = new Date(ts);
  // Local calendar day, not UTC — buckets have to match the user's clock.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function startOfLocalDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateFull(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return formatDateFull(ts);
}

/** Value for an <input type="datetime-local">, in local time. */
export function toLocalInputValue(ts: number) {
  const d = new Date(ts - d0(ts));
  return d.toISOString().slice(0, 16);
}

function d0(ts: number) {
  return new Date(ts).getTimezoneOffset() * 60_000;
}
