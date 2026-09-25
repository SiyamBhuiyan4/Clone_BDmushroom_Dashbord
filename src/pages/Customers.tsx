import { useMemo, useState } from "react";
import { Pencil, Phone, Plus, Search, Trash2, UserRound, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Card, EmptyState, Input } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { CustomerDialog, type EditableCustomer } from "../components/CustomerDialog";
import { CustomerDetailDialog } from "../components/CustomerDetailDialog";
import { PasscodeConfirmDialog } from "../components/PasscodeConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor, initialOf } from "../lib/avatar";
import { normalisePhone } from "../../convex/shared";
import { useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

export function CustomersPage() {
  const { fmtNum, fmtDateFull } = useSettings();
  const t = useT();
  const toast = useToast();
  const customers = useAuthedQuery(api.customers.list);
  const removeCustomer = useAuthedMutation(api.customers.remove);

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EditableCustomer | null>(null);
  const [deleting, setDeleting] = useState<{ id: Id<"customers">; name: string } | null>(null);
  const [viewing, setViewing] = useState<Id<"customers"> | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers ?? [];
    // Searching by number has to survive how the number was written, so the
    // digits are compared the same way the address book matches them.
    const digits = normalisePhone(term);
    return (customers ?? []).filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.address ?? "").toLowerCase().includes(term) ||
        (digits.length > 2 && normalisePhone(c.phone).includes(digits)),
    );
  }, [customers, search]);

  const pager = usePagination(rows, search, 25);
  const withOrders = rows.filter((c) => c.orderCount > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {t("customers.title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3 sm:text-[14px]">{t("customers.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} className="w-full sm:w-auto">
          <Plus size={17} />
          {t("customers.add")}
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
            placeholder={t("customers.searchPlaceholder")}
            className="pl-10.5"
            aria-label={t("common.search")}
          />
        </div>
        {rows.length > 0 && (
          <p className="text-[13px] text-ink-3">
            {fmtNum(rows.length)} · {fmtNum(withOrders)} {t("customers.haveOrdered")}
          </p>
        )}
      </div>

      <Card>
        {customers === undefined ? (
          <div className="ac-skeleton h-72 rounded-card bg-surface" aria-hidden />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users size={24} />}
            title={search ? t("customers.noMatches") : t("customers.none")}
            body={search ? t("customers.noMatchesBody") : t("customers.noneBody")}
            action={
              !search ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <Plus size={17} />
                  {t("customers.add")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {pager.pageRows.map((c) => (
                <li key={c._id} className="flex items-start gap-3 px-4 py-4 sm:px-5">
                  {/*
                    The row opens the customer rather than a separate "view"
                    icon: seeing what someone has bought is the reason to be
                    on this page, so it should be the easiest thing to hit.
                  */}
                  <button
                    type="button"
                    onClick={() => setViewing(c._id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    aria-label={`${t("customers.theirSales")} — ${c.name}`}
                  >
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-[14px] font-bold text-white"
                    style={{ background: gradientFor(c.name) }}
                    aria-hidden
                  >
                    {initialOf(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-ink">{c.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} aria-hidden />
                          {c.phone}
                        </span>
                      )}
                      {c.address && <span className="truncate">{c.address}</span>}
                      {!c.phone && !c.address && <span>{t("orders.noDetails")}</span>}
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-3">
                      {c.orderCount > 0
                        ? `${fmtNum(c.orderCount)} ${t("customers.orders")}${
                            c.lastOrderedAt ? ` · ${t("customers.last")} ${fmtDateFull(c.lastOrderedAt)}` : ""
                          }`
                        : t("customers.noOrdersYet")}
                    </p>
                  </div>
                  </button>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      onClick={() => setEditing(c)}
                      aria-label={`${t("common.edit")} ${c.name}`}
                      className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeleting({ id: c._id, name: c.name })}
                      aria-label={`${t("common.delete")} ${c.name}`}
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
              itemLabel="customers"
            />
          </>
        )}
      </Card>

      {/* A saved customer is a shortcut, not a record of what they bought —
          the sales themselves keep their own copy of the name and address. */}
      <p className="flex items-center gap-2 px-1 text-[12.5px] text-ink-3">
        <UserRound size={14} aria-hidden />
        {t("customers.footnote")}
      </p>

      <CustomerDetailDialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        customerId={viewing}
      />
      <CustomerDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <CustomerDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        customer={editing}
      />
      <PasscodeConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("orders.dropCustomerTitle")}
        confirmLabel={t("orders.dropCustomer")}
        body={deleting ? t("orders.dropCustomerBody") : ""}
        onConfirm={async (passcode) => {
          if (!deleting) return;
          await removeCustomer({ id: deleting.id, passcode });
          toast.ok(t("orders.customerDropped"));
        }}
      />
    </div>
  );
}
