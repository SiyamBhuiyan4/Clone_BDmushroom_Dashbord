import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useAuthedQuery } from "./session";
import { useSettings } from "./settings";

/**
 * The shop's vendor categories and sub-categories.
 */
export function useVendorCategories() {
  const { lang } = useSettings();
  const allCategories = useAuthedQuery(api.vendorCategories.list) ?? [];

  const categories = useMemo(
    () => allCategories.filter((c) => !c.parentId),
    [allCategories],
  );

  const subcategoriesOf = (parentId: string | Id<"vendorCategories"> | undefined) => {
    if (!parentId) return [];
    return allCategories.filter((c) => c.parentId === parentId);
  };

  const label = (c: Doc<"vendorCategories">) => (lang === "bn" && c.nameBn ? c.nameBn : c.name);

  const categoryOf = (vendor: Pick<Doc<"vendors">, "categoryId" | "category">) =>
    categories.find((c) => (vendor.categoryId ? c._id === vendor.categoryId : c.key === vendor.category)) ??
    null;

  const subCategoryOf = (vendor: { subCategoryId?: Id<"vendorCategories"> | string }) => {
    if (!vendor.subCategoryId) return null;
    return allCategories.find((c) => c._id === vendor.subCategoryId) ?? null;
  };

  return {
    categories,
    allCategories,
    subcategoriesOf,
    label,
    categoryOf,
    subCategoryOf,
  };
}
