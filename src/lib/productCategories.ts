import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useAuthedQuery } from "./session";
import { useSettings } from "./settings";

/**
 * The shop's product categories and sub-categories.
 */
export function useProductCategories() {
  const { lang } = useSettings();
  const allCategories: Doc<"productCategories">[] = (useAuthedQuery(api.productCategories.list) as Doc<"productCategories">[] | undefined) ?? [];

  const categories = useMemo(
    () => allCategories.filter((c) => !c.parentId),
    [allCategories],
  );

  const subcategoriesOf = (parentId: string | Id<"productCategories"> | undefined) => {
    if (!parentId) return [];
    return allCategories.filter((c) => c.parentId === parentId);
  };

  const label = (c: Doc<"productCategories">) => (lang === "bn" && c.nameBn ? c.nameBn : c.name);

  const categoryOf = (product: { categoryId?: Id<"productCategories"> | string; category?: string }) => {
    if (product.categoryId) {
      return categories.find((c) => c._id === product.categoryId) ?? null;
    }
    if (product.category) {
      return categories.find((c) => c.name.toLowerCase() === product.category?.toLowerCase() || c.key === product.category) ?? null;
    }
    return null;
  };

  const subCategoryOf = (product: { subCategoryId?: Id<"productCategories"> | string; subCategory?: string }) => {
    if (product.subCategoryId) {
      return allCategories.find((c) => c._id === product.subCategoryId) ?? null;
    }
    if (product.subCategory) {
      return allCategories.find((c) => c.name.toLowerCase() === product.subCategory?.toLowerCase()) ?? null;
    }
    return null;
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
