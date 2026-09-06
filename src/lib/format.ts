/** The app is Bangladeshi taka only. */
export const CURRENCY_CODE = "BDT";
export const CURRENCY_SYMBOL = "৳";

export type Lang = "en" | "bn";

/*
  Bengali renders its own digits (০১২৩৪৫৬৭৮৯) and its own date names. Passing
  the locale through every formatter means switching language changes the
  numbers on screen too, not just the labels around them.
*/
export function localeFor(lang: Lang) {
  return lang === "bn" ? "bn-BD" : "en-GB";
}

/** Full money string, e.g. "৳1,250.00". Poisha are dropped for whole amounts. */
export function money(value: number, lang: Lang = "en") {
  const whole = Number.isInteger(value);
  return `${CURRENCY_SYMBOL}${value.toLocaleString(localeFor(lang), {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Plain number in the active script, for counts and quantities. */
export function num(value: number, lang: Lang = "en") {
  return value.toLocaleString(localeFor(lang), { maximumFractionDigits: 2 });
}

/** Short money for axis ticks and tight tiles, e.g. "৳12.5k". */
export function moneyCompact(value: number, lang: Lang = "en") {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const k = lang === "bn" ? "হা" : "k";
  const m = lang === "bn" ? "মি" : "m";
  if (abs >= 1_000_000) return `${sign}${CURRENCY_SYMBOL}${trim(abs / 1_000_000, lang)}${m}`;
  if (abs >= 1_000) return `${sign}${CURRENCY_SYMBOL}${trim(abs / 1_000, lang)}${k}`;
  return `${sign}${CURRENCY_SYMBOL}${trim(abs, lang)}`;
}

function trim(n: number, lang: Lang = "en") {
  return n.toLocaleString(localeFor(lang), { maximumFractionDigits: 1 }).replace(/\.0$/, "");
}

export function percent(fraction: number, lang: Lang = "en") {
  return `${(fraction * 100).toLocaleString(localeFor(lang), { maximumFractionDigits: 1 })}%`;
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

export function formatDate(ts: number, lang: Lang = "en") {
  return new Date(ts).toLocaleDateString(localeFor(lang), { month: "short", day: "numeric" });
}

export function formatDateFull(ts: number, lang: Lang = "en") {
  return new Date(ts).toLocaleDateString(localeFor(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(ts: number, lang: Lang = "en") {
  return new Date(ts).toLocaleString(localeFor(lang), {
    day: "numeric",
    month: "short",
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
