import { Plus, Trash2 } from "lucide-react";
import { Input, SectionLabel } from "./ui";
import { useT } from "../lib/i18n";

/**
 * Numbers beyond the main phone field — a customer or vendor is often
 * reachable on more than one line, and none of them are required.
 */
export function PhoneListField({
  phones,
  onChange,
}: {
  phones: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useT();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>{t("contacts.extraPhones")}</SectionLabel>
        <span className="text-[11.5px] text-ink-3">{t("common.optional")}</span>
      </div>
      {phones.map((phone, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={phone}
            onChange={(e) => {
              const next = [...phones];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder="01812-345678"
            autoComplete="off"
            inputMode="tel"
            aria-label={`${t("contacts.extraPhones")} ${i + 1}`}
          />
          <button
            type="button"
            onClick={() => onChange(phones.filter((_, idx) => idx !== i))}
            aria-label={t("contacts.removePhone")}
            className="shrink-0 rounded-xl border border-line-strong px-3 text-ink-3 transition-colors hover:border-critical/40 hover:text-critical"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...phones, ""])}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-[12.5px] font-semibold text-accent transition-colors hover:brightness-110"
      >
        <Plus size={14} />
        {t("contacts.addPhone")}
      </button>
    </div>
  );
}
