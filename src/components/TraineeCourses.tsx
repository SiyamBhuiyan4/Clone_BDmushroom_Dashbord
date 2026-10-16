import { useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileText,
  GraduationCap,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  UserX,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge, Button, Input, Modal, ModalFooter, Select, Textarea, cx } from "./ui";
import { gradeFor } from "../../convex/shared";
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
  const setFinal = useAuthedMutation(api.courses.setFinal);
  const [grading, setGrading] = useState<{ assignment: Doc<"assignments">; submission: Submission } | null>(null);

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
          rows.map(({ enrollment, course, lessons, assignments, score }) => {
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

                {assignments.length > 0 && (
                  <div className="border-t border-line">
                    <p className="px-4 pt-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">Assignments</p>
                    <ul className="flex flex-col divide-y divide-line">
                      {assignments.map((a) => {
                        const sub = a.submission;
                        return (
                          <li key={a._id} className="flex items-center gap-3 px-4 py-2.5">
                            <ClipboardList size={15} className="shrink-0 text-ink-3" />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{a.title}</span>
                            {!sub ? (
                              <span className="text-[11.5px] text-ink-3">Not handed in</span>
                            ) : sub.marks !== undefined ? (
                              <button
                                onClick={() => setGrading({ assignment: a, submission: sub })}
                                className="rounded-lg px-2 py-1 text-[12px] font-bold tabular-nums text-good-ink hover:bg-surface-2"
                              >
                                {sub.marks}/{a.maxMarks} · {gradeFor((sub.marks / a.maxMarks) * 100)}
                              </button>
                            ) : (
                              <Button size="sm" variant="primary" onClick={() => setGrading({ assignment: a, submission: sub })}>
                                Mark
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <FinalExamRow
                  marks={enrollment.finalMarks}
                  max={enrollment.finalMax}
                  onSave={(marks, max) => run(() => setFinal({ id: enrollment._id, marks, max }), "Saved.")}
                />

                {score.graded && (
                  <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-3">
                    <span className="text-[12.5px] text-ink-3">
                      Score{" "}
                      <span className="font-semibold tabular-nums text-ink">
                        {score.earned}/{score.max}
                        {score.percent !== null ? ` (${Math.round(score.percent)}%)` : ""}
                      </span>
                    </span>
                    <span className="text-[13px] font-bold text-ink">
                      {score.grade ? `Grade ${score.grade}` : score.gradeSoFar ? `So far ${score.gradeSoFar}` : "Not marked yet"}
                    </span>
                  </div>
                )}

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
                              courseName: course.name,
                              grade: score.grade ?? undefined,
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
                        {!complete
                          ? "Unlocks once every lesson is done."
                          : score.graded && !score.allMarked
                            ? "Lessons done — mark everything to unlock it."
                            : "All done — approve to let them download it."}
                      </p>
                      <Button
                        size="sm"
                        variant="primary"
                        className="ml-auto"
                        disabled={!complete || (score.graded && !score.allMarked)}
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

      <GradeDialog item={grading} onClose={() => setGrading(null)} />

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

type Submission = Omit<Doc<"submissions">, "files"> & {
  files: { storageId: Id<"_storage">; fileName: string; kind: "image" | "pdf"; url: string | null }[];
};

function youtubeId(url: string) {
  const m =
    url.match(/youtu\.be\/([\w-]{6,})/) ??
    url.match(/[?&]v=([\w-]{6,})/) ??
    url.match(/youtube\.com\/(?:shorts|embed|live)\/([\w-]{6,})/);
  return m?.[1] ?? null;
}

/** A trainee's hand-in, and the marks and feedback for it. */
function GradeDialog({
  item,
  onClose,
}: {
  item: { assignment: Doc<"assignments">; submission: Submission } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const { fmtSaleTime } = useSettings();
  const grade = useAuthedMutation(api.courses.gradeSubmission);
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setMarks(item.submission.marks !== undefined ? String(item.submission.marks) : "");
    setFeedback(item.submission.feedback ?? "");
  }, [item]);

  const max = item?.assignment.maxMarks ?? 0;
  const value = Number(marks);
  const valid = marks.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= max;
  const sub = item?.submission;
  const video = sub?.videoUrl ? youtubeId(sub.videoUrl) : null;

  async function save(clear = false) {
    if (!item) return;
    setSaving(true);
    try {
      await grade({ id: item.submission._id, marks: clear ? undefined : value, feedback });
      toast.ok(clear ? "Marks cleared." : "Marked.");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      guardChanges
      open={item !== null}
      onClose={onClose}
      icon={<ClipboardList size={19} />}
      title={item?.assignment.title ?? "Assignment"}
      subtitle={sub ? `Handed in ${fmtSaleTime(sub.submittedAt)}` : undefined}
      width="sm:max-w-2xl"
    >
      {item && sub && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void save();
          }}
        >
          <div className="flex flex-col gap-4 px-6 py-6">
            {video ? (
              <iframe
                className="aspect-video w-full rounded-xl border border-line"
                src={`https://www.youtube-nocookie.com/embed/${video}?rel=0`}
                title="Trainee's video"
                allowFullScreen
              />
            ) : sub.videoUrl ? (
              <a href={sub.videoUrl} target="_blank" rel="noreferrer noopener" className="text-[13.5px] font-semibold text-accent hover:underline">
                Open their video
              </a>
            ) : null}
            {sub.note && (
              <p className="rounded-xl border border-line bg-page px-4 py-3 text-[13.5px] leading-6 whitespace-pre-wrap text-ink-2">
                {sub.note}
              </p>
            )}
            {sub.files.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {sub.files.map((f) =>
                  f.kind === "image" && f.url ? (
                    <a key={f.storageId} href={f.url} target="_blank" rel="noreferrer noopener" className="overflow-hidden rounded-xl border border-line">
                      <img src={f.url} alt={f.fileName} className="aspect-square w-full object-cover" />
                    </a>
                  ) : (
                    <a
                      key={f.storageId}
                      href={f.url ?? undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-line bg-page p-2 text-center"
                    >
                      <FileText size={20} className="text-critical-ink" />
                      <span className="line-clamp-2 text-[11px] text-ink-2">{f.fileName}</span>
                    </a>
                  ),
                )}
              </div>
            )}

            <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-[10rem_1fr]">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-ink-2">Marks (out of {max})</span>
                <Input
                  type="number"
                  min={0}
                  max={max}
                  step="any"
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  className="tabular-nums"
                  autoFocus
                />
                {valid && <span className="text-[12px] font-semibold text-good-ink">Grade {gradeFor((value / max) * 100)}</span>}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-ink-2">Feedback</span>
                <Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Shown to the trainee with their grade." />
              </label>
            </div>
          </div>
          <ModalFooter>
            {sub.marks !== undefined && (
              <Button type="button" variant="ghost" className="mr-auto" disabled={saving} onClick={() => void save(true)}>
                Clear marks
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!valid || saving}>
              {saving ? "Saving…" : "Save marks"}
            </Button>
          </ModalFooter>
        </form>
      )}
    </Modal>
  );
}

/** The final exam or practical, marked outside the app: marks out of a total. */
function FinalExamRow({
  marks,
  max,
  onSave,
}: {
  marks?: number;
  max?: number;
  onSave: (marks: number | undefined, max: number | undefined) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [m, setM] = useState("");
  const [t, setT] = useState("");
  useEffect(() => {
    setM(marks !== undefined ? String(marks) : "");
    setT(max !== undefined ? String(max) : "");
  }, [marks, max, editing]);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
        <Award size={15} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">Final exam / practical</span>
        {max ? (
          <button onClick={() => setEditing(true)} className="rounded-lg px-2 py-1 text-[12px] font-bold tabular-nums text-ink-2 hover:bg-surface-2">
            {marks !== undefined ? `${marks}/${max} · ${gradeFor((marks / max) * 100)}` : `—/${max}`}
          </button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Plus size={14} /> Add
          </Button>
        )}
      </div>
    );
  }
  const total = t.trim() === "" ? undefined : Number(t);
  const got = m.trim() === "" ? undefined : Number(m);
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave(got, total);
        setEditing(false);
      }}
    >
      <span className="text-[12.5px] font-medium text-ink">Final exam</span>
      <Input type="number" min={0} step="any" value={m} onChange={(e) => setM(e.target.value)} placeholder="marks" className="h-9 w-20 tabular-nums" />
      <span className="text-ink-3">/</span>
      <Input type="number" min={1} step="any" value={t} onChange={(e) => setT(e.target.value)} placeholder="total" className="h-9 w-20 tabular-nums" />
      <Button type="submit" size="sm" variant="primary">
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}
