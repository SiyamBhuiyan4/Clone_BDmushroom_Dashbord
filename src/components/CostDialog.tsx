import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookmarkPlus, Check, Coins, Search, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  AmountInput,
  Button,
  Field,
  Input,
  Modal,
  ModalFooter,
  SectionLabel,
  Textarea,
  cx,
} from "./ui";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { CURRENCY_SYMBOL, toLocalInputValue } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

type SavedName = {
  _id: string | null;
  name: string;
  usageCount: number;
  suggestion: boolean;
};

export function CostDialog({
  open,
  onClose,
  cost,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing cost. */
  cost?: Doc<"costs"> | null;
}) {
  const t = useT();
  const toast = useToast();
  const { fmt } = useSettings();
  const savedNames = useAuthedQuery(api.costs.names) ?? [];
  const create = useAuthedMutation(api.costs.create);
  const update = useAuthedMutation(api.costs.update);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState("");
  const [note, setNote] = useState("");
  const [saveName, setSaveName] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (cost) {
      setName(cost.name);
      setAmount(String(cost.amount));
      setSpentAt(toLocalInputValue(cost.spentAt));
      setNote(cost.note ?? "");
      setSaveName(false);
    } else {
      setName("");
      setAmount("");
      setSpentAt(toLocalInputValue(Date.now()));
      setNote("");
      setSaveName(false);
    }
  }, [open, cost]);

  const known = useMemo(() => {
    const key = name.trim().toLowerCase().replace(/\s+/g, " ");
    return savedNames.some((n) => !n.suggestion && n.name.toLowerCase().replace(/\s+/g, " ") === key);
  }, [savedNames, name]);

  const value = Number(amount);
  const amountOk = amount.trim() !== "" && Number.isFinite(value) && value > 0;
  const valid = name.trim() !== "" && amountOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      const when = spentAt ? new Date(spentAt).getTime() : Date.now();
      if (cost) {
        await update({ id: cost._id, name, amount: value, spentAt: when, note, saveName });
        toast.ok(t("costs.updated"));
      } else {
        await create({ name, amount: value, spentAt: when, note, saveName });
        toast.ok(`${name.trim()} — ${fmt(value)}`);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Coins size={19} />}
      title={cost ? t("costs.editTitle") : t("costs.addTitle")}
      subtitle={cost ? t("costs.editSubtitle") : t("costs.addSubtitle")}
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-6 px-6 py-6">
          {/* ------------------------------------------------------- name */}
          <div className="flex flex-col gap-2.5">
            <SectionLabel>{t("costs.whatFor")}</SectionLabel>
            <CostNamePicker
              value={name}
              onChange={setName}
              names={savedNames}
              autoFocus={!cost}
            />

            {/*
              The tick only appears for a name the shop has not kept yet.
              Offering to save something already saved is a decision with no
              outcome, and it is the kind of no-op tick people learn to
              ignore — including on the occasions when it does matter.
            */}
            {name.trim() !== "" && !known && (
              <label className="ac-fade-in flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-page px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={saveName}
                  onChange={(e) => setSaveName(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                    <BookmarkPlus size={15} className="text-accent" aria-hidden />
                    {t("costs.saveName")}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-4.5 text-ink-3">
                    {t("costs.saveNameHint")}
                  </span>
                </span>
              </label>
            )}
            {name.trim() !== "" && known && (
              <p className="ac-fade-in flex items-center gap-1.5 text-[12px] font-semibold text-good-ink">
                <Check size={14} aria-hidden />
                {t("costs.alreadySaved")}
              </p>
            )}
          </div>

          {/* ----------------------------------------------------- amount */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>{t("costs.amount")}</SectionLabel>
              <span className="text-[11.5px] text-ink-3">{t("costs.amountHint")}</span>
            </div>
            <AmountInput
              symbol={CURRENCY_SYMBOL}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          {/* ---------------------------------------------------- details */}
          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <SectionLabel>{t("costs.details")}</SectionLabel>
            <Field label={t("costs.spentOn")}>
              {(id) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={spentAt}
                  onChange={(e) => setSpentAt(e.target.value)}
                />
              )}
            </Field>
            <Field label={t("common.note")}>
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("costs.notePlaceholder")}
                />
              )}
            </Field>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || saving}>
            {saving ? t("common.saving") : cost ? t("common.save") : t("costs.add")}
            {!saving && <ArrowRight size={16} />}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/**
 * A name field that searches what has been saved rather than replacing it.
 *
 * Deliberately not a <Select>: the whole point is that a cost can be anything
 * the first time and one of your own names every time after. Typing filters
 * the saved list; picking fills the field; neither prevents the other.
 */
function CostNamePicker({
  value,
  onChange,
  names,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  names: SavedName[];
  autoFocus?: boolean;
}) {
  const t = useT();
  const { fmtNum } = useSettings();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return names.slice(0, 8);
    // Names starting with what was typed rank above names merely containing
    // it, so "off" offers "Office snacks" before "Van fuel — off-road".
    const prefix: SavedName[] = [];
    const inner: SavedName[] = [];
    for (const n of names) {
      const hay = n.name.toLowerCase();
      if (hay.startsWith(q) || hay.split(/\s+/).some((w) => w.startsWith(q))) prefix.push(n);
      else if (hay.includes(q)) inner.push(n);
    }
    return [...prefix, ...inner].slice(0, 8);
  }, [names, value]);

  useEffect(() => setActive(0), [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(picked: SavedName) {
    onChange(picked.name);
    setOpen(false);
  }

  // An exact match is already in the field; offering it back is noise.
  const visible = matches.filter(
    (m) => m.name.toLowerCase() !== value.trim().toLowerCase() || matches.length > 1,
  );

  return (
    <div ref={boxRef} className="relative">
      <Search
        size={17}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
      <Input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, visible.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && visible[active]) {
            // Enter picks the highlighted name instead of submitting the form
            // behind it — which would otherwise save a half-typed name.
            e.preventDefault();
            choose(visible[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={t("costs.namePlaceholder")}
        className="pl-10.5"
        aria-label={t("costs.whatFor")}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        required
      />

      {open && visible.length > 0 && (
        <ul
          role="listbox"
          className="ac-fade-in absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
        >
          {visible.map((n, i) => (
            <li key={n._id ?? `suggestion:${n.name}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(n)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                  i === active ? "bg-surface-2" : "hover:bg-surface-2",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                  {n.name}
                </span>
                {n.suggestion ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink-3">
                    <Sparkles size={12} aria-hidden />
                    {t("costs.example")}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-ink-3">
                    {fmtNum(n.usageCount)}×
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
