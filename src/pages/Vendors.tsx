import { useMemo, useState } from "react";
import { MessageCircle, Pencil, Phone, Plus, Search, Trash2, Truck } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, cx } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { VendorDialog } from "../components/VendorDialog";
import { VendorDetailDialog } from "../components/VendorDetailDialog";
import { PasscodeConfirmDialog } from "../components/PasscodeConfirmDialog";
import { useT } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";
import { normalisePhone, whatsappUrl, VENDOR_CATEGORIES, type VendorCategory } from "../../convex/shared";
import { useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

const CATEGORY_KEY: Record<VendorCategory, "vendors.categorySpawn" | "vendors.categoryMaterials" | "vendors.categoryEquipment" | "vendors.categoryPackaging" | "vendors.categoryOther"> = {
  spawn: "vendors.categorySpawn",
  materials: "vendors.categoryMaterials",
  equipment: "vendors.categoryEquipment",
  packaging: "vendors.categoryPackaging",
  other: "vendors.categoryOther",
};

export function VendorsPage() {
  const t = useT();
  const toast = useToast();
  const vendors = useAuthedQuery(api.vendors.list, {});
  const removeVendor = useAuthedMutation(api.vendors.remove);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<VendorCategory | "">("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"vendors"> | null>(null);
  const [deleting, setDeleting] = useState<{ id: Id<"vendors">; name: string } | null>(null);
  const [viewing, setViewing] = useState<Id<"vendors"> | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (vendors ?? []).filter((v) => {
      if (category && v.category !== category) return false;
      if (!term) return true;
      const digits = normalisePhone(term);
      return (
        v.name.toLowerCase().includes(term) ||
        (digits.length > 2 && normalisePhone(v.phone).includes(digits))
      );
    });
  }, [vendors, search, category]);

  const pager = usePagination(rows, `${search}|${category}`, 25);

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

      {/* Category tabs — fixed set, so a row of pills beats a dropdown. */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-sm)]"
        role="group"
        aria-label={t("vendors.category")}
      >
        <button
          onClick={() => setCategory("")}
          aria-pressed={category === ""}
          style={category === "" ? { background: "var(--grad-violet)" } : undefined}
          className={cx(
            "h-8 rounded-lg px-3.5 text-[12.5px] font-bold tracking-wide transition-all",
            category === "" ? "text-white" : "text-ink-3 hover:text-ink",
          )}
        >
          {t("vendors.allCategories")}
        </button>
        {VENDOR_CATEGORIES.map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={active}
              style={active ? { background: "var(--grad-violet)" } : undefined}
              className={cx(
                "h-8 rounded-lg px-3.5 text-[12.5px] font-bold tracking-wide transition-all",
                active ? "text-white" : "text-ink-3 hover:text-ink",
              )}
            >
              {t(CATEGORY_KEY[c])}
            </button>
          );
        })}
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
                <li key={v._id} className="flex items-start gap-3 px-4 py-4 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setViewing(v._id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    aria-label={`${t("vendors.gallery")} — ${v.name}`}
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-[14px] font-bold text-white"
                      style={{ background: gradientFor(v.name) }}
                      aria-hidden
                    >
                      {initialOf(v.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold text-ink">{v.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
                        {v.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone size={12} aria-hidden />
                            {v.phone}
                          </span>
                        )}
                        <Badge tone="accent">{t(CATEGORY_KEY[v.category])}</Badge>
                      </p>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
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
