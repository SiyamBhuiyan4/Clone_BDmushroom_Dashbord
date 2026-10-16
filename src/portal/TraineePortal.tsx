import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FileText,
  GraduationCap,
  KeyRound,
  Loader2,
  LogOut,
  PlayCircle,
  Radio,
  MessageSquare,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Input, Textarea, cx } from "../components/ui";
import { uploadFile } from "../lib/upload";
import { errorMessage, useToast } from "../lib/toast";
import { downloadCertificate } from "../lib/pdf";

/*
  The trainee's side of the app, at #/learn. It shares nothing with the
  shop's screens but the look: its own sign-in (the username and password
  the shop hands out), its own session, and only the portal's functions,
  which serve nothing but the trainee's own courses.
*/

const TOKEN_KEY = "ac.traineeSession";

type View =
  | { kind: "home" }
  | { kind: "course"; id: Id<"courses"> }
  | { kind: "lesson"; id: Id<"courseLessons"> }
  | { kind: "assignment"; id: Id<"assignments"> };

function viewFromHash(): View {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  // learn / c / <id>   or   learn / l / <id>
  if (parts[1] === "c" && parts[2]) return { kind: "course", id: parts[2] as Id<"courses"> };
  if (parts[1] === "l" && parts[2]) return { kind: "lesson", id: parts[2] as Id<"courseLessons"> };
  if (parts[1] === "a" && parts[2]) return { kind: "assignment", id: parts[2] as Id<"assignments"> };
  return { kind: "home" };
}

function go(path: string) {
  window.location.hash = `#/learn${path}`;
}

export function TraineePortal() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const me = useQuery(api.traineeAuth.me, token ? { token } : "skip");
  const logout = useMutation(api.traineeAuth.logout);
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    const sync = () => {
      setView(viewFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // A token the server no longer accepts is dropped, so the login shows.
  useEffect(() => {
    if (token && me && !me.valid) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    }
  }, [token, me]);

  const signOut = useCallback(() => {
    if (token) void logout({ token });
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    go("");
  }, [token, logout]);

  if (!token) {
    return (
      <TraineeLogin
        onSignedIn={(t) => {
          localStorage.setItem(TOKEN_KEY, t);
          setToken(t);
        }}
      />
    );
  }
  if (!me || !me.valid) {
    return (
      <div className="flex min-h-full items-center justify-center bg-page">
        <Loader2 size={22} className="animate-spin text-ink-3" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-page">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button onClick={() => go("")} className="flex items-center gap-2.5" aria-label="My courses">
            <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-[var(--shadow-sm)]">
              <img src="/brand/bdmushroom-seal.png" alt="" className="size-full object-contain" />
            </span>
            <span className="text-left">
              <span className="block text-[14px] leading-5 font-bold text-ink">BD Mushroom</span>
              <span className="block text-[11.5px] text-ink-3">Training</span>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2.5">
            <NotesButton token={token} />
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-ink-3">
              {me.photoUrl ? <img src={me.photoUrl} alt="" className="size-full object-cover" /> : <UserRound size={16} />}
            </span>
            <span className="hidden max-w-40 truncate text-[13px] font-semibold text-ink sm:block">{me.name}</span>
            <button
              onClick={signOut}
              className="rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <main key={JSON.stringify(view)} className="ac-rise mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {view.kind === "home" && <MyCourses token={token} name={me.name} />}
        {view.kind === "course" && <CourseView token={token} courseId={view.id} />}
        {view.kind === "lesson" && <LessonView token={token} lessonId={view.id} />}
        {view.kind === "assignment" && <AssignmentView token={token} assignmentId={view.id} />}
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------- login */

function TraineeLogin({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const login = useMutation(api.traineeAuth.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const result = await login({ username, password });
      if (!result.ok) {
        setError(result.error);
        setPassword("");
        return;
      }
      onSignedIn(result.token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-page p-4">
      <div className="ac-pop-in w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-[var(--shadow-hero)]">
            <img src="/brand/bdmushroom-seal.png" alt="" className="size-full object-contain" />
          </span>
          <h1 className="text-[22px] leading-7 font-bold tracking-tight text-ink">BD Mushroom Training</h1>
          <p className="mt-1.5 max-w-xs text-[13.5px] leading-6 text-ink-3">
            Sign in with the username and password you got from the office.
          </p>
        </div>
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-2">Username</span>
            <div className="relative">
              <UserRound size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                className="pl-10"
              />
            </div>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-2">Password</span>
            <div className="relative">
              <KeyRound size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                autoComplete="current-password"
                className="pl-10"
              />
            </div>
          </label>
          {error && <p className="text-[12.5px] font-semibold text-critical-ink">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy || !username.trim() || !password} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-[12px] text-ink-3">
          Forgot your password? Ask the office for a new one.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ my courses */

function ProgressBar({ done, total, light }: { done: number; total: number; light?: boolean }) {
  return (
    <div className={cx("h-2 overflow-hidden rounded-full", light ? "bg-white/25" : "bg-surface-3")}>
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", light ? "bg-white" : "")}
        style={{
          width: `${total > 0 ? (done / total) * 100 : 0}%`,
          background: light ? undefined : "var(--grad-emerald)",
        }}
      />
    </div>
  );
}

function MyCourses({ token, name }: { token: string; name: string }) {
  const courses = useQuery(api.portal.myCourses, { token });
  const firstName = name.split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[24px] leading-8 font-bold tracking-tight text-ink">Hi {firstName} 👋</h1>
        <p className="mt-1 text-[14px] text-ink-3">Your courses at BD Mushroom.</p>
      </div>
      {courses === undefined ? (
        <div className="ac-skeleton h-40 rounded-card border border-line bg-surface" aria-hidden />
      ) : courses.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-6 py-12 text-center">
          <GraduationCap size={28} className="mx-auto text-ink-3" />
          <p className="mt-3 text-[14px] font-semibold text-ink">No courses yet</p>
          <p className="mt-1 text-[13px] text-ink-3">Once the office assigns you a course, it shows up here.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {courses.map((c) => {
            const complete = c.lessonCount > 0 && c.doneCount === c.lessonCount;
            return (
              <li key={c.courseId}>
                <button
                  onClick={() => go(`/c/${c.courseId}`)}
                  className="group flex h-full w-full flex-col rounded-card border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-hero)]"
                      style={{ background: "var(--grad-violet)" }}
                    >
                      <BookOpen size={18} />
                    </span>
                    {c.certificateApproved ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-good-soft px-2 py-1 text-[11px] font-bold text-good-ink">
                        <Award size={12} /> Certificate ready
                      </span>
                    ) : complete ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-warning-soft px-2 py-1 text-[11px] font-bold text-warning-ink">
                        <Clock size={12} /> Awaiting approval
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-[16px] leading-snug font-bold text-ink group-hover:text-accent">{c.name}</p>
                  {c.description && <p className="mt-1 line-clamp-2 text-[13px] text-ink-3">{c.description}</p>}
                  <div className="mt-auto pt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold">
                      <span className="text-ink-3">
                        {c.doneCount} / {c.lessonCount} lessons
                      </span>
                      <span className="tabular-nums text-ink-2">
                        {c.lessonCount > 0 ? Math.round((c.doneCount / c.lessonCount) * 100) : 0}%
                      </span>
                    </div>
                    <ProgressBar done={c.doneCount} total={c.lessonCount} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- course */

function CourseView({ token, courseId }: { token: string; courseId: Id<"courses"> }) {
  const toast = useToast();
  const course = useQuery(api.portal.course, { token, courseId });
  const cert = useQuery(api.portal.certificate, { token, courseId });
  const setDone = useMutation(api.portal.setDone);
  const [saving, setSaving] = useState(false);

  if (course === undefined) {
    return <div className="ac-skeleton h-64 rounded-card border border-line bg-surface" aria-hidden />;
  }
  const done = course.lessons.filter((l) => l.done).length;
  const total = course.lessons.length;
  const isFailed = course.graded && course.grade === "F";
  const complete = total > 0 && done === total && !isFailed;
  const next = course.lessons.find((l) => !l.done);

  return (
    <div className="flex flex-col gap-5">
      <button
        onClick={() => go("")}
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={15} /> My courses
      </button>

      <div
        className="relative overflow-hidden rounded-card p-6 text-white shadow-[var(--shadow-hero)]"
        style={{
          background: isFailed
            ? "linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)"
            : complete
            ? "var(--grad-emerald)"
            : "var(--grad-violet)",
        }}
      >
        <div
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full opacity-25 blur-2xl"
          style={{ background: "rgba(255,255,255,0.9)" }}
          aria-hidden
        />
        <h1 className="relative text-[22px] leading-7 font-bold tracking-tight">{course.name}</h1>
        {course.description && <p className="relative mt-1.5 text-[13.5px] text-white/80">{course.description}</p>}
        <p className="relative mt-4 text-[28px] leading-9 font-bold tabular-nums">
          {done} / {total}
          <span className="ml-2 text-[14px] font-semibold text-white/75">lessons done</span>
        </p>
        <div className="relative mt-3">
          <ProgressBar done={done} total={total} light />
        </div>
        {course.graded && (course.grade || course.gradeSoFar) && (
          <p className="relative mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-1.5 text-[13px] font-semibold">
            <Award size={15} />
            {course.grade ? `Course grade: ${course.grade}` : `Grade so far: ${course.gradeSoFar}`}
          </p>
        )}
        {next && (
          <Button
            variant="secondary"
            className="relative mt-5 border-white/30 bg-white/15 text-white hover:bg-white/25"
            onClick={() => go(`/l/${next._id}`)}
          >
            {done === 0 ? "Start" : "Continue"}: {next.title}
            <ArrowRight size={15} />
          </Button>
        )}
      </div>

      {course.lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-ink-3">
          No lessons added to this course yet.
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {course.lessons.map((l, i) => (
            <li key={l._id}>
              <div
                onClick={() => go(`/l/${l._id}`)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:bg-surface-2 cursor-pointer"
              >
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await setDone({ token, lessonId: l._id, done: !l.done });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                  aria-label={l.done ? "Mark as not done" : "Mark as done"}
                  title={l.done ? "Click to mark as not done" : "Click to mark as done"}
                  className="p-1 -m-1 rounded-full hover:bg-surface-3 transition-colors cursor-pointer"
                >
                  {l.done ? (
                    <CheckCircle2 size={20} className="shrink-0 text-good" />
                  ) : (
                    <Circle size={20} className="shrink-0 text-ink-3 hover:text-accent" />
                  )}
                </button>
                <span className="w-6 shrink-0 text-[12px] font-bold tabular-nums text-ink-3">{i + 1}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[14px] font-semibold", l.done ? "text-ink-2 line-through" : "text-ink")}>
                  {l.title}
                </span>
                {l.hasVideo && <PlayCircle size={16} className="shrink-0 text-ink-3" aria-label="Has a video" />}
                <ArrowRight size={15} className="shrink-0 text-ink-3" />
              </div>
            </li>
          ))}
        </ol>
      )}

      {course.assignments.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="mt-1 text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase">Assignments</p>
          {course.assignments.map((a) => (
            <button
              key={a._id}
              onClick={() => go(`/a/${a._id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
            >
              <ClipboardList size={19} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">{a.title}</span>
                {a.dueAt && (
                  <span className="block text-[12px] text-ink-3">Due {new Date(a.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                )}
              </span>
              {a.status === "graded" ? (
                <span className="rounded-lg bg-good-soft px-2.5 py-1 text-[13px] font-bold text-good-ink">{a.grade}</span>
              ) : a.status === "submitted" ? (
                <span className="rounded-lg bg-warning-soft px-2 py-1 text-[11px] font-bold text-warning-ink">Submitted</span>
              ) : (
                <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-bold text-ink-3">To do</span>
              )}
              <ArrowRight size={15} className="shrink-0 text-ink-3" />
            </button>
          ))}
        </div>
      )}

      {/* The certificate: earned by finishing, given by the office. */}
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-start gap-3">
          <span
            className={cx(
              "flex size-10 shrink-0 items-center justify-center rounded-2xl",
              cert ? "text-white" : "bg-surface-2 text-ink-3",
            )}
            style={cert ? { background: "var(--grad-emerald)" } : undefined}
          >
            <Award size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold text-ink">Certificate</p>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {isFailed ? (
                <span className="text-critical font-semibold">Course status: Failed (Grade F) — certificate is not available.</span>
              ) : cert ? (
                "Approved by BD Mushroom — download it below."
              ) : total === 0 ? (
                "No lessons have been added to this course yet."
              ) : complete ? (
                "All lessons done! The office will approve your certificate soon."
              ) : (
                "Finish every lesson, then the office approves your certificate."
              )}
            </p>
          </div>
        </div>
        {cert && !isFailed && (
          <Button
            variant="primary"
            className="mt-4 w-full"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await downloadCertificate(cert);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setSaving(false);
              }
            }}
          >
            <Download size={16} />
            {saving ? "Preparing…" : "Download certificate"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- lesson */

/** The video id from any of the usual YouTube link shapes. */
function youtubeId(url: string) {
  const m =
    url.match(/youtu\.be\/([\w-]{6,})/) ??
    url.match(/[?&]v=([\w-]{6,})/) ??
    url.match(/youtube\.com\/(?:shorts|embed|live)\/([\w-]{6,})/);
  return m?.[1] ?? null;
}

function LessonView({ token, lessonId }: { token: string; lessonId: Id<"courseLessons"> }) {
  const toast = useToast();
  const lesson = useQuery(api.portal.lesson, { token, lessonId });
  const setDone = useMutation(api.portal.setDone);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  if (lesson === undefined) {
    return <div className="ac-skeleton h-80 rounded-card border border-line bg-surface" aria-hidden />;
  }
  const video = lesson.videoUrl ? youtubeId(lesson.videoUrl) : null;
  const images = lesson.files.filter((f) => f.kind === "image" && f.url);
  const pdfs = lesson.files.filter((f) => f.kind === "pdf" && f.url);

  async function toggle() {
    if (!lesson) return;
    setBusy(true);
    try {
      await setDone({ token, lessonId, done: !lesson.done });
      // Finishing one moves straight on to the next, the common case.
      if (!lesson.done && lesson.nextId) go(`/l/${lesson.nextId}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        onClick={() => go(`/c/${lesson.courseId}`)}
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to course
      </button>

      <div>
        <p className="text-[12px] font-bold tracking-[0.08em] text-accent uppercase">
          Lesson {lesson.position} of {lesson.total}
        </p>
        <h1 className="mt-1 text-[24px] leading-8 font-bold tracking-tight text-ink">{lesson.title}</h1>
      </div>

      {video ? (
        <div className="overflow-hidden rounded-card border border-line bg-black shadow-[var(--shadow-card)]">
          <iframe
            className="aspect-video w-full"
            src={`https://www.youtube-nocookie.com/embed/${video}?rel=0`}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : lesson.videoUrl ? (
        <a href={lesson.videoUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 text-[14px] font-semibold text-accent hover:underline">
          <PlayCircle size={18} /> Watch the video
        </a>
      ) : null}

      {lesson.body && (
        <div className="rounded-card border border-line bg-surface p-5">
          <p className="text-[15px] leading-7 whitespace-pre-wrap text-ink-2">{lesson.body}</p>
        </div>
      )}

      {images.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase">Photos · {images.length}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {images.map((f, i) => (
              <button
                key={f.url!}
                onClick={() => setViewing(i)}
                className="group overflow-hidden rounded-xl border border-line bg-surface"
              >
                <img
                  src={f.url!}
                  alt={f.fileName}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {pdfs.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase">Documents · {pdfs.length}</p>
          <ul className="flex flex-col gap-2.5">
            {pdfs.map((f) => (
              <PdfCard key={f.url!} name={f.fileName} url={f.url!} />
            ))}
          </ul>
        </section>
      )}

      {viewing !== null && images[viewing] && (
        <Lightbox
          images={images.map((f) => ({ url: f.url!, name: f.fileName }))}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}

      <Button
        variant={lesson.done ? "secondary" : "primary"}
        className="h-12 w-full text-[15px]"
        disabled={busy}
        onClick={() => void toggle()}
      >
        {lesson.done ? (
          <>
            <CheckCircle2 size={18} className="text-good" /> Done — tap to undo
          </>
        ) : (
          <>
            <CheckCircle2 size={18} /> Mark as done
          </>
        )}
      </Button>

      <div className="flex items-center justify-between gap-3">
        {lesson.prevId ? (
          <Button variant="ghost" onClick={() => go(`/l/${lesson.prevId}`)}>
            <ArrowLeft size={15} /> Previous
          </Button>
        ) : (
          <span />
        )}
        {lesson.nextId ? (
          <Button variant="ghost" onClick={() => go(`/l/${lesson.nextId}`)}>
            Next <ArrowRight size={15} />
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => go(`/c/${lesson.courseId}`)}>
            Finish <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- files, viewers */

/** A PDF as a card: open it right here in the page, or download it. */
function PdfCard({ name, url }: { name: string; url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-critical-soft text-critical-ink">
          <FileText size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink">{name}</span>
          <span className="block text-[12px] text-ink-3">PDF document</span>
        </span>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "View"}
        </Button>
        <a
          href={url}
          download={name}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Download ${name}`}
          className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <Download size={16} />
        </a>
      </div>
      {open && <iframe src={url} title={name} className="h-[70vh] w-full border-t border-line bg-white" />}
    </li>
  );
}

/** Photos full screen, one at a time — arrows, swipe, or the keyboard to move. */
function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: { url: string; name: string }[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const startX = useRef<number | null>(null);
  const go = useCallback(
    (step: number) => onIndex((index + step + images.length) % images.length),
    [index, images.length, onIndex],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  return (
    <div
      className="ac-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (startX.current === null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        startX.current = null;
      }}
    >
      <img
        src={images[index].url}
        alt={images[index].name}
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <X size={20} />
      </button>
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Previous photo"
            className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Next photo"
            className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronRight size={22} />
          </button>
          <p className="absolute bottom-4 text-[13px] text-white/70">
            {index + 1} / {images.length}
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ assignment */

type PendingFile = { storageId: Id<"_storage">; fileName: string; kind: "image" | "pdf"; url?: string | null };

function AssignmentView({ token, assignmentId }: { token: string; assignmentId: Id<"assignments"> }) {
  const toast = useToast();
  const a = useQuery(api.portal.assignment, { token, assignmentId });
  const submit = useMutation(api.portal.submit);
  const generateUploadUrl = useMutation(api.portal.generateUploadUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fill the form from what was handed in, whenever a different one loads.
  useEffect(() => {
    if (!a) return;
    setVideoUrl(a.submission?.videoUrl ?? "");
    setNote(a.submission?.note ?? "");
    setFiles(a.submission?.files ?? []);
    setEditing(!a.submission);
  }, [a?._id, a?.submission?.submittedAt]);

  if (a === undefined) return <div className="ac-skeleton h-72 rounded-card border border-line bg-surface" aria-hidden />;

  const sub = a.submission;
  const locked = Boolean(sub?.graded);

  async function upload(file: File) {
    const kind = file.type === "application/pdf" ? "pdf" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) {
      toast.error("Only photos and PDFs can be attached.");
      return;
    }
    setUploading(true);
    try {
      const url = await generateUploadUrl({ token });
      const storageId = await uploadFile(url, file);
      setFiles((prev) => [...prev, { storageId, fileName: file.name, kind, url: URL.createObjectURL(file) }]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handIn(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await submit({
        token,
        assignmentId,
        videoUrl,
        note,
        files: files.map(({ storageId, fileName, kind }) => ({ storageId, fileName, kind })),
      });
      toast.ok("Handed in! The office will mark it.");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const video = sub?.videoUrl ? youtubeId(sub.videoUrl) : null;

  return (
    <div className="flex flex-col gap-5">
      <button
        onClick={() => go(`/c/${a.courseId}`)}
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to course
      </button>

      <div>
        <p className="text-[12px] font-bold tracking-[0.08em] text-accent uppercase">Assignment</p>
        <h1 className="mt-1 text-[24px] leading-8 font-bold tracking-tight text-ink">{a.title}</h1>
        {a.dueAt && (
          <p className="mt-1 text-[13px] text-ink-3">
            Due {new Date(a.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        )}
      </div>

      {a.instructions && (
        <div className="rounded-card border border-line bg-surface p-5">
          <p className="text-[15px] leading-7 whitespace-pre-wrap text-ink-2">{a.instructions}</p>
        </div>
      )}

      {/* The result, once marked: the grade and what the office said. */}
      {sub?.graded && (
        <div
          className="relative overflow-hidden rounded-card p-5 text-white shadow-[var(--shadow-hero)]"
          style={{ background: "var(--grad-emerald)" }}
        >
          <p className="text-[12.5px] font-semibold text-white/80">Your grade</p>
          <p className="mt-1 text-[40px] leading-[48px] font-bold">{sub.grade}</p>
          {sub.feedback && <p className="mt-2 text-[14px] leading-6 whitespace-pre-wrap text-white/90">{sub.feedback}</p>}
        </div>
      )}

      {sub && !editing ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-bold text-ink">What you handed in</p>
            {!locked && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Change
              </Button>
            )}
          </div>
          <p className="text-[12px] text-ink-3">
            {locked ? "Marked — this can't be changed now." : "Waiting for the office to mark it. You can still change it."}
          </p>
          {video && (
            <iframe
              className="aspect-video w-full rounded-xl"
              src={`https://www.youtube-nocookie.com/embed/${video}?rel=0`}
              title="Your video"
              allowFullScreen
            />
          )}
          {sub.note && <p className="text-[14px] leading-6 whitespace-pre-wrap text-ink-2">{sub.note}</p>}
          <FileChips files={sub.files} />
        </div>
      ) : (
        <form onSubmit={handIn} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
          <p className="text-[14px] font-bold text-ink">Hand in your work</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-2">YouTube link to your video</span>
            <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" />
            <span className="text-[12px] text-ink-3">Upload your video to YouTube (Unlisted is fine), then paste its link here.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-2">Note</span>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything you want to tell the office." />
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-ink-2">Photos & PDFs</span>
              <Button type="button" size="sm" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> {uploading ? "Uploading…" : "Add file"}
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
            <FileChips files={files} onRemove={(id) => setFiles((prev) => prev.filter((f) => f.storageId !== id))} />
          </div>
          <div className="flex gap-2">
            {sub && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            <Button type="submit" variant="primary" className="flex-1" disabled={saving || uploading}>
              {saving ? "Handing in…" : sub ? "Hand in again" : "Hand in"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function FileChips({ files, onRemove }: { files: PendingFile[]; onRemove?: (id: Id<"_storage">) => void }) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.storageId} className="flex items-center gap-2 rounded-xl border border-line bg-page py-1.5 pr-1.5 pl-2">
          {f.kind === "image" && f.url ? (
            <img src={f.url} alt="" className="size-8 rounded-md object-cover" />
          ) : (
            <FileText size={16} className="text-critical-ink" />
          )}
          <a href={f.url ?? undefined} target="_blank" rel="noreferrer noopener" className="max-w-40 truncate text-[12.5px] font-medium text-ink hover:text-accent">
            {f.fileName}
          </a>
          {onRemove && (
            <button type="button" onClick={() => onRemove(f.storageId)} aria-label={`Remove ${f.fileName}`} className="rounded-md p-1 text-ink-3 hover:text-critical">
              <X size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- notes */

/**
 * The office's broadcast note and/or personal note for this trainee,
 * displayed in sleek speech bubbles.
 */
function NotesButton({ token }: { token: string }) {
  const notes = useQuery(api.portal.notes, { token });
  const [open, setOpen] = useState(false);
  const hasNote = Boolean(notes?.general || notes?.personal);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-page px-3 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <MessageSquare size={15} className="text-accent" />
        Note
        {hasNote && (
          <span
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent"
            aria-hidden
          />
        )}
      </button>
      <NotePanel open={open} onClose={() => setOpen(false)} notes={notes} />
    </>
  );
}

type Notes = {
  general: { text: string; updatedAt: number } | null;
  personal: { text: string; updatedAt: number } | null;
};

/**
 * Slides in from the right, the same way the customer profile's dashboard
 * does: it stays mounted for the slide out, and closes on ✕, Esc or a click
 * outside it.
 */
function NotePanel({ open, onClose, notes }: { open: boolean; onClose: () => void; notes: Notes | undefined }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), 800);
    return () => window.clearTimeout(timer);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const hasPersonal = Boolean(notes?.personal?.text?.trim());
  const hasGeneral = Boolean(notes?.general?.text?.trim());

  const personalDate =
    notes?.personal?.updatedAt && notes.personal.updatedAt > 0
      ? new Date(notes.personal.updatedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";

  const generalDate =
    notes?.general?.updatedAt && notes.general.updatedAt > 0
      ? new Date(notes.general.updatedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className={cx("absolute inset-0 bg-scrim transition-opacity duration-700", shown ? "opacity-100" : "opacity-0")} />
      <aside
        role="dialog"
        aria-label="Note"
        onClick={(e) => e.stopPropagation()}
        className={cx(
          "absolute top-0 right-0 flex h-[100dvh] w-full max-w-md flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]",
          "transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]",
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <MessageSquare size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">Note</p>
            <p className="text-[12px] text-ink-3">From BD Mushroom</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {!notes ? (
            <div className="ac-skeleton h-24 rounded-2xl bg-surface-2" aria-hidden />
          ) : hasPersonal || hasGeneral ? (
            <div className="flex flex-col gap-6">
              {hasPersonal && (
                <div className="ac-pop-in relative rounded-2xl border border-accent/40 bg-accent-soft/50 px-5 py-4 shadow-[var(--shadow-card)]">
                  <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-accent/20 pb-2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-wider text-accent uppercase">
                      <UserRound size={13} />
                      For you
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink">
                    <Linkified text={notes.personal!.text} />
                  </p>
                  {personalDate && (
                    <p className="mt-3 text-right text-[11.5px] text-ink-3">{personalDate}</p>
                  )}
                  {/* The bubble's tail, pointing back at the header button. */}
                  <span
                    className="absolute -top-2 right-6 size-4 rotate-45 border-t border-l border-accent/40 bg-accent-soft/50"
                    aria-hidden
                  />
                </div>
              )}

              {hasGeneral && (
                <div className="ac-pop-in relative rounded-2xl border border-line-strong bg-page px-5 py-4 shadow-[var(--shadow-card)]">
                  <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-line pb-2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-wider text-ink uppercase">
                      <Radio size={13} className="text-accent" />
                      Notice for everyone
                    </span>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-3 uppercase">
                      Broadcast
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink-2">
                    <Linkified text={notes.general!.text} />
                  </p>
                  {generalDate && (
                    <p className="mt-3 text-right text-[11.5px] text-ink-3">{generalDate}</p>
                  )}
                  {/* The bubble's tail, pointing back at the header button. */}
                  <span
                    className="absolute -top-2 right-6 size-4 rotate-45 border-t border-l border-line-strong bg-page"
                    aria-hidden
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="py-12 text-center text-[13.5px] text-ink-3">No note right now.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Note text with its links made clickable. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="break-all font-semibold text-accent hover:underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
