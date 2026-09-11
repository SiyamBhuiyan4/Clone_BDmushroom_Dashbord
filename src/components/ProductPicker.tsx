import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Doc } from "../../convex/_generated/dataModel";
import { Input, cx } from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";

/*
  Prefix search over the product list.

  The catalogue is small enough to live in memory, so a Trie buys nothing a
  prepared lowercase index does not: the whole list is scanned once per
  keystroke over a few hundred entries, which is far below a frame. The spec
  allows a Trie but asks only for speed.

  Prefix matches rank above interior matches, so typing "fog" offers
  "Fogger 4 nozzle" before "Auto Fogger".
*/
export function ProductPicker({
  products,
  onPick,
  autoFocus,
}: {
  products: Doc<"products">[];
  onPick: (product: Doc<"products">) => void;
  autoFocus?: boolean;
}) {
  const { fmt, fmtNum } = useSettings();
  const t = useT();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () => products.map((p) => ({ p, hay: `${p.name} ${p.category ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase() })),
    [products],
  );

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return index.slice(0, 8).map((e) => e.p);
    const prefix: Doc<"products">[] = [];
    const inner: Doc<"products">[] = [];
    for (const { p, hay } of index) {
      const at = hay.indexOf(q);
      if (at === 0 || hay.split(/\s+/).some((w) => w.startsWith(q))) prefix.push(p);
      else if (at > 0) inner.push(p);
      if (prefix.length >= 8) break;
    }
    return [...prefix, ...inner].slice(0, 8);
  }, [term, index]);

  useEffect(() => setActive(0), [term]);

  // Close when focus or a click leaves the picker entirely.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(p: Doc<"products">) {
    onPick(p);
    setTerm("");
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
        value={term}
        autoFocus={autoFocus}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={t("orders.searchProduct")}
        className="pl-10.5"
        aria-label={t("orders.searchProduct")}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />

      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="ac-fade-in absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
        >
          {matches.map((p, i) => {
            const out = p.quantity <= 0;
            return (
              <li key={p._id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    i === active ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white"
                    style={{ background: gradientFor(p.name) }}
                    aria-hidden
                  >
                    {initialOf(p.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {p.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {p.sellPrice !== undefined ? fmt(p.sellPrice) : fmt(p.costPrice)}
                      {p.category ? ` · ${p.category}` : ""}
                    </span>
                  </span>
                  {/* Stock is shown at the moment of choosing, which is when
                      it actually matters. */}
                  <span
                    className={cx(
                      "shrink-0 text-[11.5px] font-bold tabular-nums",
                      out ? "text-critical-ink" : "text-ink-3",
                    )}
                  >
                    {fmtNum(p.quantity)} {p.unit ?? ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
