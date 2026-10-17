import { Layers, Tag } from "lucide-react";
import { cx } from "./ui";

interface CategoryBreadcrumbProps {
  category?: string | null;
  subCategory?: string | null;
  className?: string;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
}

/**
 * Renders a visually distinct, elegant hierarchy for Category and Subcategory.
 * Solves the ambiguity of crammed "Category › Subcategory" strings by separating
 * them into clearly styled, semantic pill chips with distinct visual hierarchy.
 */
export function CategoryBreadcrumb({
  category,
  subCategory,
  className,
  size = "sm",
  showIcon = true,
}: CategoryBreadcrumbProps) {
  if (!category) return null;

  const sizeClasses = {
    xs: "text-[10px] leading-tight py-0.5 px-1.5 rounded-md gap-1 tracking-normal",
    sm: "text-[11px] leading-tight py-0.5 px-2 rounded-lg gap-1 tracking-normal",
    md: "text-[12px] leading-tight py-1 px-2.5 rounded-lg gap-1.5 tracking-normal",
  }[size];

  const iconSizes = {
    xs: 10,
    sm: 11,
    md: 12,
  }[size];

  return (
    <div
      className={cx("inline-flex flex-wrap items-center gap-1.5", className)}
      role="group"
      aria-label={subCategory ? `Category: ${category}, Subcategory: ${subCategory}` : `Category: ${category}`}
    >
      {/* Primary Category Pill */}
      <span
        title={`Category: ${category}`}
        className={cx(
          "inline-flex shrink-0 items-center font-medium select-none cursor-default transition-all duration-150",
          "bg-surface-2/80 text-ink-2 border border-line-strong/40 shadow-[var(--shadow-2xs)]",
          "hover:bg-surface-2 hover:text-ink hover:border-line-strong/60 hover:shadow-xs",
          sizeClasses,
        )}
      >
        {showIcon && <Layers size={iconSizes} className="text-ink-3 shrink-0" aria-hidden="true" />}
        <span className="sr-only">Category: </span>
        <span className="truncate max-w-[130px] sm:max-w-none">{category}</span>
      </span>

      {/* Subcategory Pill with Nested Hierarchy Indicator */}
      {subCategory && (
        <>
          <span
            className="text-ink-3/70 text-[10px] select-none shrink-0 font-bold leading-none"
            aria-hidden="true"
          >
            ›
          </span>
          <span
            title={`Subcategory: ${subCategory}`}
            className={cx(
              "inline-flex shrink-0 items-center font-semibold select-none cursor-default transition-all duration-150",
              "bg-accent-soft text-accent-strong border border-accent/25 shadow-[var(--shadow-2xs)]",
              "hover:bg-accent-soft-strong hover:border-accent/40 hover:shadow-xs",
              sizeClasses,
            )}
          >
            {showIcon && <Tag size={iconSizes - 1} className="text-accent-strong/70 shrink-0" aria-hidden="true" />}
            <span className="sr-only">Subcategory: </span>
            <span className="truncate max-w-[130px] sm:max-w-none">{subCategory}</span>
          </span>
        </>
      )}
    </div>
  );
}
