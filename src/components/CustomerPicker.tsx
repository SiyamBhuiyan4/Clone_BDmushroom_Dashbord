import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { Input, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";

export type SavedCustomer = {
  _id: string;
  name: string;
  phone?: string;
  address?: string;
  orderCount: number;
};

/**
 * The customer name field, with the address book behind it.
 *
 * Deliberately the name input itself rather than a separate "choose a
 * customer" control: most orders are for someone new, and a picker that has
 * to be dismissed before a new name can be typed punishes the common case to
 * serve the rarer one. Typing filters what has been saved; picking fills the
 * phone and address in; neither gets in the other's way.
 *
 * Matching runs over name and phone together, because a shop taking an order
 * over the phone has the number on screen and the name in its head, in
 * whichever order the conversation produced them.
 */
export function CustomerPicker({
  value,
  onChange,
  onPick,
  customers,
}: {
  value: string;
  onChange: (next: string) => void;
  onPick: (customer: SavedCustomer) => void;
  customers: SavedCustomer[];
}) {
  const t = useT();
  const { fmtNum } = useSettings();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    const digits = q.replace(/\D/g, "");
    const prefix: SavedCustomer[] = [];
    const inner: SavedCustomer[] = [];
    for (const c of customers) {
      const name = c.name.toLowerCase();
      const phone = (c.phone ?? "").replace(/\D/g, "");
      if (name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))) prefix.push(c);
      else if (digits && phone.includes(digits)) prefix.push(c);
      else if (name.includes(q)) inner.push(c);
    }
    return [...prefix, ...inner].slice(0, 8);
  }, [customers, value]);

  useEffect(() => setActive(0), [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(c: SavedCustomer) {
    onPick(c);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <Search
        size={17}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && matches[active]) {
            // Enter picks the highlighted customer rather than submitting the
            // order behind it, which would place one with no products on it.
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={t("orders.customerPlaceholder")}
        className="pl-10.5"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        required
      />

      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="ac-fade-in absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
        >
          {matches.map((c, i) => (
            <li key={c._id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                  i === active ? "bg-surface-2" : "hover:bg-surface-2",
                )}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white"
                  style={{ background: gradientFor(c.name) }}
                  aria-hidden
                >
                  {initialOf(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {c.name}
                  </span>
                  {/* Phone and address are the point of picking — shown at the
                      moment of choosing, not after. */}
                  <span className="block truncate text-[11.5px] text-ink-3">
                    {[c.phone, c.address].filter(Boolean).join(" · ") || t("orders.noDetails")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-bold tabular-nums text-ink-3">
                  <UserRound size={12} aria-hidden />
                  {fmtNum(c.orderCount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
