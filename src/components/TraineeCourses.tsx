import { useEffect, useState } from "react";
import { Award, BookOpen, CheckCircle2, Copy, Download, GraduationCap, KeyRound, Plus, RefreshCw, Trash2, UserX } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge, Button, Input, Select, cx } from "./ui";
import { SidePanelCard } from "./SidePanelCard";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { useSettings } from "../lib/settings";
import { downloadCertificate } from "../lib/pdf";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";

/**
 * A trainee's courses, from the shop's side: assign one, follow their
 * progress (and tick a lesson for them if needed), approve the certificate
 * once everything is done, or take a course back off them.
 */
export function TraineeCoursesPanel({
  traineeId,
  traineeName,
  onClose,
}: {
  traineeId: Id<"trainees">;
  traineeName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { fmtDateFull } = useSettings();
  const rows = useAuthedQuery(api.courses.ofTrainee, { traineeId });
  const courses = useAuthedQuery(api.courses.list) ?? [];
  const assign = useAuthedMutation(api.courses.assign);
  const unassign = useAuthedMutation(api.courses.unassign);
  const setProgress = useAuthedMutation(api.courses.setProgress);
  const setCertificate = useAuthedMutation(api.courses.setCertificate);

  const [picked, setPicked] = useState("");
  const [removing, setRemoving] = useState<{ id: Id<"enrollments">; name: string } | null>(null);
  const assigned = new Set((rows ?? []).map((r) => r.course._id as string));
  const available = courses.filter((c) => !assigned.has(c._id));

  async function run(task: () => Promise<unknown>, ok?: string) {
    try {
      await task();
      if (ok) toast.ok(ok);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <SidePanelCard icon={<GraduationCap size={18} />} title="Courses & Certificate" subtitle={traineeName} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Assign a course. */}
        <div className="flex items-center gap-2">
          <Select value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Course to assign" className="h-10">
            <option value="">{available.length ? "Assign a course…" : courses.length ? "Every course is assigned" : "No courses yet — make one in Courses"}</option>
            {available.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="primary"
            disabled={!picked}
            onClick={() =>
              void run(async () => {
                await assign({ traineeId, courseId: picked as Id<"courses"> });
                setPicked("");
              }, "Course assigned.")
            }
          >
            <Plus size={15} /> Assign
          </Button>
        </div>

        {rows === undefined ? (
          <div className="ac-skeleton h-40 rounded-2xl bg-surface-2" aria-hidden />
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
            No courses assigned yet.
          </p>
        ) : (
          rows.map(({ enrollment, course, lessons }) => {
            const done = lessons.filter((l) => l.completedAt).length;
            const complete = lessons.length > 0 && done === lessons.length;
            const approved = Boolean(enrollment.certificateApprovedAt);
            return (
              <div key={enrollment._id} className="overflow-hidden rounded-2xl border border-line bg-page">
                <div
                  className="relative p-4 text-white"
                  style={{ background: complete ? "var(--grad-emerald)" : "var(--grad-violet)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-2 text-[15px] font-bold">
                      <BookOpen size={16} /> {course.name}
                    </p>
                    <button
                      onClick={() => setRemoving({ id: enrollment._id, name: course.name })}
                      aria-label={`Unassign ${course.name}`}
                      title="Unassign"
                      className="rounded-lg p-1 text-white/70 hover:bg-white/15 hover:text-white"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="mt-2 text-[22px] leading-7 font-bold tabular-nums">
                    {done} / {lessons.length}
                    <span className="ml-2 text-[12.5px] font-semibold text-white/75">lessons done</span>
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-500"
                      style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <ul className="flex flex-col divide-y divide-line">
                  {lessons.map((l) => (
                    <li key={l._id} className="flex items-center gap-3 px-4 py-2.5">
                      <button
                        onClick={() => void run(() => setProgress({ traineeId, lessonId: l._id, done: !l.completedAt }))}
                        aria-pressed={Boolean(l.completedAt)}
                        aria-label={`${l.completedAt ? "Untick" : "Tick"} ${l.title}`}
                        className={cx(
                          "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                          l.completedAt ? "border-good bg-good text-white" : "border-line-strong",
                        )}
                      >
                        {l.completedAt && <CheckCircle2 size={12} />}
                      </button>
                      <span className={cx("min-w-0 flex-1 truncate text-[13px] font-medium", l.completedAt ? "text-ink-3" : "text-ink")}>
                        {l.title}
                      </span>
                      {l.completedAt && <span className="shrink-0 text-[11px] text-ink-3">{fmtDateFull(l.completedAt)}</span>}
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                  {approved ? (
                    <>
                      <Badge tone="good">
                        <Award size={11} /> Approved {fmtDateFull(enrollment.certificateApprovedAt!)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="ml-auto"
                        onClick={() =>
                          void run(() =>
                            downloadCertificate({
                              name: traineeName,
                              lessonNames: lessons.map((l) => l.title),
                              issuedAt: enrollment.certificateApprovedAt!,
                            }),
                          )
                        }
                      >
                        <Download size={14} /> Certificate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void run(() => setCertificate({ id: enrollment._id, approved: false }), "Approval withdrawn.")}
                      >
                        Withdraw
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] text-ink-3">
                        {complete ? "All done — approve to let them download it." : "Unlocks once every lesson is done."}
                      </p>
                      <Button
                        size="sm"
                        variant="primary"
                        className="ml-auto"
                        disabled={!complete}
                        onClick={() =>
                          void run(() => setCertificate({ id: enrollment._id, approved: true }), "Certificate approved.")
                        }
                      >
                        <Award size={14} /> Approve certificate
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <PasscodeConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Unassign course"
        body={removing ? `${removing.name}\nTheir progress and certificate in this course are removed too.` : ""}
        onConfirm={async (passcode) => {
          if (!removing) return;
          await unassign({ id: removing.id, passcode });
          toast.ok("Course unassigned.");
        }}
      />
    </SidePanelCard>
  );
}

/** A random password that reads clearly when said aloud or written down. */
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => chars[b % chars.length]).join("");
}

/** A suggested username from the trainee's name — just a starting point. */
function suggestUsername(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24);
}

/**
 * The trainee's login: the username and password the shop hands them. The
 * password is shown once, right after it is set, to be given to them — it
 * is never stored readable, so a forgotten one is replaced, not looked up.
 */
export function TraineeLoginCard({
  traineeId,
  traineeName,
  username,
}: {
  traineeId: Id<"trainees">;
  traineeName: string;
  username?: string;
}) {
  const toast = useToast();
  const setLogin = useAuthedMutation(api.trainees.setLogin);
  const removeLogin = useAuthedMutation(api.trainees.removeLogin);
  const [editing, setEditing] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSet, setJustSet] = useState<{ username: string; password: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setEditing(false);
    setJustSet(null);
  }, [traineeId]);

  function start() {
    setUser(username ?? suggestUsername(traineeName));
    setPassword(generatePassword());
    setEditing(true);
    setJustSet(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await setLogin({ id: traineeId, username: user, password });
      setJustSet({ username: user.trim().toLowerCase(), password });
      setEditing(false);
      toast.ok("Login saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const portalUrl = `${window.location.origin}/#/learn`;
  const handout = justSet
    ? `BD Mushroom Training\nLogin: ${portalUrl}\nUsername: ${justSet.username}\nPassword: ${justSet.password}`
    : "";

  return (
    <div className="rounded-2xl border border-line bg-page p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <KeyRound size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">Trainee login</p>
          <p className="truncate text-[12px] text-ink-3">
            {username ? (
              <>
                Username <span className="font-semibold text-ink-2">{username}</span>
              </>
            ) : (
              "No login yet — they can't see their courses until they have one."
            )}
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="secondary" onClick={start}>
              {username ? <RefreshCw size={14} /> : <Plus size={14} />}
              {username ? "New password" : "Create login"}
            </Button>
            {username && (
              <button
                onClick={() => setRemoving(true)}
                aria-label="Remove login"
                title="Remove login"
                className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-critical"
              >
                <UserX size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="mt-3 flex flex-col gap-2.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-ink-3">Username</span>
              <Input value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" className="h-10" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-ink-3">Password</span>
              <div className="flex gap-1.5">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 font-mono" />
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  aria-label="Generate another"
                  title="Generate another"
                  className="shrink-0 rounded-lg border border-line-strong px-2.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={saving || !user.trim() || password.length < 6}>
              {saving ? "Saving…" : "Save login"}
            </Button>
          </div>
        </form>
      )}

      {justSet && (
        <div className="mt-3 rounded-xl border border-good/40 bg-good-soft p-3">
          <p className="text-[12px] font-semibold text-good-ink">
            Give them these now — the password won't be shown again.
          </p>
          <pre className="mt-2 text-[12.5px] leading-5 whitespace-pre-wrap text-ink">{handout}</pre>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard?.writeText(handout);
              toast.ok("Copied.");
            }}
          >
            <Copy size={14} /> Copy
          </Button>
        </div>
      )}

      <PasscodeConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title="Remove login"
        body={`${traineeName}\nThey're signed out and can't sign in again until you create a new login. Their courses and progress stay.`}
        onConfirm={async (passcode) => {
          await removeLogin({ id: traineeId, passcode });
          setJustSet(null);
          toast.ok("Login removed.");
        }}
      />
    </div>
  );
}
