import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "./ui";

export const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Page numbers with an ellipsis, always showing first, last, current and its
 * neighbours — so the control keeps a stable width however many pages exist.
 */
function pageNumbers(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i);
  const out: (number | "gap")[] = [0];
  const from = Math.max(1, page - 1);
  const to = Math.min(pageCount - 2, page + 1);
  if (from > 1) out.push("gap");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pageCount - 2) out.push("gap");
  out.push(pageCount - 1);
  return out;
}

/**
 * Slices a list into pages.
 *
 * The page index clamps rather than resets, so deleting the last row of page 4
 * lands on page 3 instead of throwing you back to the top. `resetKey` is for
 * things that genuinely change the result set — a search term, a filter —
 * where page 1 is the right place to be.
 */
export function usePagination<T>(rows: T[], resetKey: unknown, initialSize = 25) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialSize);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    setPage(0);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageRows = useMemo(
    () => rows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [rows, safePage, pageSize],
  );

  return {
    pageRows,
    page: safePage,
    pageCount,
    pageSize,
    total: rows.length,
    setPage,
    setPageSize,
  };
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
  itemLabel = "rows",
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  itemLabel?: string;
}) {
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <p className="text-[12.5px] text-ink-3">
          <span className="font-semibold tabular-nums text-ink-2">
            {first}–{last}
          </span>{" "}
          of <span className="font-semibold tabular-nums text-ink-2">{total}</span>
        </p>
        <label className="flex items-center gap-2">
          <span className="sr-only">{itemLabel} per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label={`${itemLabel} per page`}
            className="h-8 cursor-pointer rounded-lg border border-line-strong bg-page pl-2.5 pr-7 text-[12.5px] font-semibold text-ink-2 focus:border-accent focus:outline-none"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </label>
      </div>

      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <PageButton onClick={() => onPage(page - 1)} disabled={page === 0} label="Previous page">
            <ChevronLeft size={15} />
          </PageButton>

          {pageNumbers(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-[12.5px] text-ink-3" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                style={p === page ? { background: "var(--grad-violet)" } : undefined}
                className={cx(
                  "ac-press h-8 min-w-8 rounded-lg px-2 text-[12.5px] font-bold tabular-nums",
                  p === page ? "text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {p + 1}
              </button>
            ),
          )}

          <PageButton
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount - 1}
            label="Next page"
          >
            <ChevronRight size={15} />
          </PageButton>
        </nav>
      )}
    </div>
  );
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="ac-press flex size-8 items-center justify-center rounded-lg border border-line-strong bg-page text-ink-2 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** Compact sort control used above list and table views. */
export function SortSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Sort by</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label="Sort by"
        className="h-11 w-full cursor-pointer rounded-xl border border-line-strong bg-page pl-3.5 pr-9 text-[14px] text-ink transition-colors focus:border-accent focus:outline-none sm:w-52"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
