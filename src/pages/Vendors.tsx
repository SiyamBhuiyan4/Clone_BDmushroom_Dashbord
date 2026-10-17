import { useMemo, useState } from "react";
import { Layers, MessageCircle, Pencil, Phone, Plus, Search, Settings2, Trash2, Truck } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, cx } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { VendorDialog, type EditableVendor } from "../components/VendorDialog";
import { VendorDetailDialog } from "../components/VendorDetailDialog";
import { PasscodeConfirmDialog } from "../components/PasscodeConfirmDialog";
import { useT } from "../lib/i18n";
import { ContactAvatar } from "../components/ContactAvatar";
import { CategoryBreadcrumb } from "../components/CategoryBreadcrumb";
import { normalisePhone, whatsappUrl } from "../../convex/shared";
import { useVendorCategories } from "../lib/vendorCategories";
import { VendorCategoriesDialog } from "../components/VendorCategoriesDialog";
import { useToast } from "../lib/toast";
import { useSettings } from "../lib/settings";
import { relativeTime } from "../lib/format";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";


export function VendorsPage() {
  const t = useT();
  const toast = useToast();
  const vendors = useAuthedQuery(api.vendors.list, {});
  const { fmt } = useSettings();
  // The start of this calendar month in the browser's own timezone.
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);
  const removeVendor = useAuthedMutation(api.vendors.remove);

  const [search, setSearch] = useState("");
  const { categories, allCategories, label, categoryOf, subCategoryOf, subcategoriesOf } = useVendorCategories();
  /** A category id, "" for all, or "none" for vendors filed under nothing. */
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [managing, setManaging] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EditableVendor | null>(null);
  const [deleting, setDeleting] = useState<{ id: Id<"vendors">; name: string } | null>(null);
  const [viewing, setViewing] = useState<Id<"vendors"> | null>(null);

  const activeCategoryObj = categories.find((c) => c._id === category);
  const availableSubcategories = activeCategoryObj ? subcategoriesOf(activeCategoryObj._id) : [];

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vendors ?? []) {
      const cat = categoryOf(v);
      if (cat) {
        counts.set(cat._id, (counts.get(cat._id) ?? 0) + 1);
      } else {
        counts.set("none", (counts.get("none") ?? 0) + 1);
      }
    }
    return counts;
  }, [vendors, categoryOf]);

  const subCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vendors ?? []) {
      if (v.subCategoryId && (!category || categoryOf(v)?._id === category)) {
        counts.set(v.subCategoryId, (counts.get(v.subCategoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [vendors, category, categoryOf]);


  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (vendors ?? []).filter((v) => {
      if (category === "none") {
        if (categoryOf(v) !== null) return false;
      } else if (category) {
        if (categoryOf(v)?._id !== category) return false;
        if (subCategory && v.subCategoryId !== subCategory) return false;
      }
      if (!term) return true;
      const digits = normalisePhone(term);
      return (
        v.name.toLowerCase().includes(term) ||
        (digits.length > 2 && normalisePhone(v.phone).includes(digits))
      );
    });
    // `categoryOf` reads `categories`, so a change to the list refilters.
  }, [vendors, search, category, subCategory, categories, allCategories]);

  const pager = usePagination(rows, `${search}|${category}|${subCategory}`, 25);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {t("vendors.title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3 sm:text-[14px]">{t("vendors.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} className="w-full sm:w-auto">
          <Plus size={17} />
          {t("vendors.add")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 sm:min-w-60 sm:max-w-md sm:flex-1">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("vendors.searchPlaceholder")}
            className="pl-10.5"
            aria-label={t("common.search")}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 w-full">
          <div
            className="flex-1 min-w-0 overflow-x-auto no-scrollbar rounded-2xl border border-line bg-surface/90 p-1.5 shadow-[var(--shadow-sm)] backdrop-blur-md"
            role="group"
            aria-label={t("vendors.category")}
          >
            <div className="flex items-center gap-1.5 min-w-max">
              <button
                onClick={() => {
                  setCategory("");
                  setSubCategory("");
                }}
                aria-pressed={category === ""}
                style={category === "" ? { background: "var(--grad-violet)" } : undefined}
                className={cx(
                  "h-9 rounded-xl px-3.5 text-[12.5px] font-semibold transition-all select-none flex items-center gap-2 shrink-0",
                  category === ""
                    ? "text-white font-bold shadow-xs"
                    : "text-ink-3 hover:text-ink hover:bg-surface-2/70",
                )}
              >
                <span>{t("vendors.allCategories")}</span>
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-[11px] leading-none tabular-nums",
                    category === "" ? "bg-white/20 text-white font-bold" : "bg-surface-3/70 text-ink-3",
                  )}
                >
                  {vendors?.length ?? 0}
                </span>
              </button>
              {categories.map((c) => {
                const active = category === c._id;
                const count = categoryCounts.get(c._id) ?? 0;
                return (
                  <button
                    key={c._id}
                    onClick={() => {
                      setCategory(c._id);
                      setSubCategory("");
                    }}
                    aria-pressed={active}
                    style={active ? { background: "var(--grad-violet)" } : undefined}
                    className={cx(
                      "h-9 rounded-xl px-3.5 text-[12.5px] font-semibold transition-all select-none flex items-center gap-2 shrink-0",
                      active
                        ? "text-white font-bold shadow-xs"
                        : "text-ink-3 hover:text-ink hover:bg-surface-2/70",
                    )}
                  >
                    <span>{label(c)}</span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-[11px] leading-none tabular-nums",
                        active ? "bg-white/20 text-white font-bold" : "bg-surface-3/70 text-ink-3",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
              {/* Only offered once something is actually uncategorised. */}
              {(vendors ?? []).some((v) => categoryOf(v) === null) && (
                <button
                  onClick={() => {
                    setCategory("none");
                    setSubCategory("");
                  }}
                  aria-pressed={category === "none"}
                  style={category === "none" ? { background: "var(--grad-violet)" } : undefined}
                  className={cx(
                    "h-9 rounded-xl px-3.5 text-[12.5px] font-semibold transition-all select-none flex items-center gap-2 shrink-0",
                    category === "none"
                      ? "text-white font-bold shadow-xs"
                      : "text-ink-3 hover:text-ink hover:bg-surface-2/70",
                  )}
                >
                  <span>{t("vendors.noCategory")}</span>
                  <span
                    className={cx(
                      "rounded-full px-2 py-0.5 text-[11px] leading-none tabular-nums",
                      category === "none" ? "bg-white/20 text-white font-bold" : "bg-surface-3/70 text-ink-3",
                    )}
                  >
                    {categoryCounts.get("none") ?? 0}
                  </span>
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => setManaging(true)}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-line bg-surface/90 px-4 text-[12.5px] font-semibold text-ink-2 shadow-[var(--shadow-sm)] hover:bg-surface-2 hover:text-ink active:scale-95 transition-all"
          >
            <Settings2 size={15} />
            <span>{t("vendors.manageCategories")}</span>
          </button>
        </div>

        {availableSubcategories.length > 0 && (
          <div
            className="flex items-center gap-2 rounded-xl bg-surface-2/40 border border-line/60 px-3.5 py-2 text-xs overflow-x-auto no-scrollbar sm:flex-wrap"
            role="group"
            aria-label={t("vendors.subCategory") || "Subcategory"}
          >
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-accent shrink-0 pr-1">
              <Layers size={13} />
              <span>{activeCategoryObj ? label(activeCategoryObj) : ""}:</span>
            </div>

            <button
              type="button"
              onClick={() => setSubCategory("")}
              aria-pressed={subCategory === ""}
              className={cx(
                "h-7 shrink-0 rounded-lg px-2.5 text-[11.5px] font-semibold transition-all whitespace-nowrap",
                subCategory === ""
                  ? "bg-accent text-white font-bold shadow-xs"
                  : "text-ink-3 hover:text-ink hover:bg-surface-2/80",
              )}
            >
              {t("common.all")}
            </button>

            {availableSubcategories.map((sub) => {
              const active = subCategory === sub._id;
              const subCount = subCategoryCounts.get(sub._id) ?? 0;
              return (
                <button
                  key={sub._id}
                  type="button"
                  onClick={() => setSubCategory(sub._id)}
                  aria-pressed={active}
                  className={cx(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-semibold transition-all whitespace-nowrap",
                    active
                      ? "bg-accent text-white font-bold shadow-xs"
                      : "text-ink-3 hover:text-ink hover:bg-surface-2/80",
                  )}
                >
                  <span>{label(sub)}</span>
                  <span
                    className={cx(
                      "text-[10.5px] tabular-nums",
                      active ? "text-white/80" : "text-ink-3/80",
                    )}
                  >
                    ({subCount})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Card>
        {vendors === undefined ? (
          <div className="ac-skeleton h-72 rounded-card bg-surface" aria-hidden />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Truck size={24} />}
            title={search || category ? t("vendors.noMatches") : t("vendors.none")}
            body={search || category ? t("vendors.noMatchesBody") : t("vendors.noneBody")}
            action={
              !search && !category ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <Plus size={17} />
                  {t("vendors.add")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {pager.pageRows.map((v) => (
                <li
                  key={v._id}
                  className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2/40 sm:px-5"
                >
                  <button
                    type="button"
                    onClick={() => setViewing(v._id)}
                    className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                    aria-label={`${t("vendors.gallery")} — ${v.name}`}
                  >
                    <ContactAvatar
                      name={v.name}
                      photoUrl={v.photoUrl}
                      size="md"
                      shape="circle"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[15px] font-bold tracking-tight text-ink transition-colors group-hover:text-accent">
                          {v.name}
                        </p>
                        {categoryOf(v) && (
                          <CategoryBreadcrumb
                            category={label(categoryOf(v)!)}
                            subCategory={subCategoryOf(v) ? label(subCategoryOf(v)!) : null}
                          />
                        )}
                        {v.due > 0 && (
                          <Badge tone="critical">
                            {t("vendors.youOwe")} {fmt(v.due)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12.5px] text-ink-3">
                        {v.phone && (
                          <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                            <Phone size={12} className="text-ink-3" aria-hidden />
                            {v.phone}
                          </span>
                        )}
                        {v.lastPurchaseAt !== null ? (
                          <span>
                            {t("vendors.lastBought")} {relativeTime(v.lastPurchaseAt)}
                          </span>
                        ) : (
                          <span>{t("vendors.noLotsYet")}</span>
                        )}
                      </p>
                      {/* What this vendor has been to the shop lately, at a glance. */}
                      {v.lastPurchaseAt !== null && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                          <span>
                            {t("vendors.thisMonth")}{" "}
                            <span className="font-semibold tabular-nums text-ink-2">
                              {fmt(
                                v.purchases
                                  .filter((p) => p.at >= monthStart)
                                  .reduce((sum, p) => sum + p.amount, 0),
                              )}
                            </span>
                          </span>
                          <span aria-hidden>·</span>
                          <span>
                            {t("common.total")}:{" "}
                            <span className="font-semibold tabular-nums text-ink-2">
                              {fmt(v.purchases.reduce((sum, p) => sum + p.amount, 0))}
                            </span>
                          </span>
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-90 transition-opacity group-hover:opacity-100">
                    {v.phone && (
                      <a
                        href={`tel:${v.phone}`}
                        aria-label={`${t("orders.phone")} ${v.name}`}
                        title={v.phone}
                        className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent"
                      >
                        <Phone size={15} />
                      </a>
                    )}
                    {whatsappUrl(v.whatsapp ?? v.phone) && (
                      <a
                        href={whatsappUrl(v.whatsapp ?? v.phone)!}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`${t("customers.whatsapp")} ${v.name}`}
                        title={t("customers.whatsapp")}
                        className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-good-ink"
                      >
                        <MessageCircle size={15} />
                      </a>
                    )}
                    <button
                      onClick={() => setEditing(v)}
                      aria-label={`${t("common.edit")} ${v.name}`}
                      className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeleting({ id: v._id, name: v.name })}
                      aria-label={`${t("common.delete")} ${v.name}`}
                      className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-critical"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination
              page={pager.page}
              pageCount={pager.pageCount}
              pageSize={pager.pageSize}
              total={pager.total}
              onPage={pager.setPage}
              onPageSize={pager.setPageSize}
              itemLabel="vendors"
            />
          </>
        )}
      </Card>

      <VendorDetailDialog open={viewing !== null} onClose={() => setViewing(null)} vendorId={viewing} />
      <VendorDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <VendorCategoriesDialog
        open={managing}
        onClose={() => setManaging(false)}
        onDeleted={(id) => {
          if (category === id) setCategory("");
        }}
      />
      <VendorDialog open={editing !== null} onClose={() => setEditing(null)} vendor={editing} />
      <PasscodeConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("vendors.remove")}
        confirmLabel={t("vendors.remove")}
        body={deleting ? t("vendors.removeBody") : ""}
        onConfirm={async (passcode) => {
          if (!deleting) return;
          await removeVendor({ id: deleting.id, passcode });
          toast.ok(t("vendors.removed"));
        }}
      />
    </div>
  );
}
