import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { useAuthedQuery } from "./session";
import { useSettings } from "./settings";

/**
 * The shop's vendor categories, and a way to name the one a vendor is in.
 * A vendor saved before categories were editable still carries the old
 * fixed key, so that is matched against the starter categories too.
 */
export function useVendorCategories() {
  const { lang } = useSettings();
  const categories = useAuthedQuery(api.vendorCategories.list) ?? [];
  const label = (c: Doc<"vendorCategories">) => (lang === "bn" && c.nameBn ? c.nameBn : c.name);
  const categoryOf = (vendor: Pick<Doc<"vendors">, "categoryId" | "category">) =>
    categories.find((c) => (vendor.categoryId ? c._id === vendor.categoryId : c.key === vendor.category)) ??
    null;
  return { categories, label, categoryOf };
}
