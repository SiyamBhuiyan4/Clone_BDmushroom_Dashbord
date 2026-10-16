import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
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
  UserRound,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Input, cx } from "../components/ui";
import { errorMessage, useToast } from "../lib/toast";
import { downloadCertificate } from "../lib/pdf";

/*
  The trainee's side of the app, at #/learn. It shares nothing with the
  shop's screens but the look: its own sign-in (the username and password
  the shop hands out), its own session, and only the portal's functions,
  which serve nothing but the trainee's own courses.
*/

const TOKEN_KEY = "ac.traineeSession";

type View = { kind: "home" } | { kind: "course"; id: Id<"courses"> } | { kind: "lesson"; id: Id<"courseLessons"> };

function viewFromHash(): View {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  // learn / c / <id>   or   learn / l / <id>
  if (parts[1] === "c" && parts[2]) return { kind: "course", id: parts[2] as Id<"courses"> };
  if (parts[1] === "l" && parts[2]) return { kind: "lesson", id: parts[2] as Id<"courseLessons"> };
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
  const [saving, setSaving] = useState(false);

  if (course === undefined) {
    return <div className="ac-skeleton h-64 rounded-card border border-line bg-surface" aria-hidden />;
  }
  const done = course.lessons.filter((l) => l.done).length;
  const total = course.lessons.length;
  const complete = total > 0 && done === total;
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
        style={{ background: complete ? "var(--grad-emerald)" : "var(--grad-violet)" }}
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

      <ol className="flex flex-col gap-2">
        {course.lessons.map((l, i) => (
          <li key={l._id}>
            <button
              onClick={() => go(`/l/${l._id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
            >
              {l.done ? (
                <CheckCircle2 size={20} className="shrink-0 text-good" />
              ) : (
                <Circle size={20} className="shrink-0 text-ink-3" />
              )}
              <span className="w-6 shrink-0 text-[12px] font-bold tabular-nums text-ink-3">{i + 1}</span>
              <span className={cx("min-w-0 flex-1 truncate text-[14px] font-semibold", l.done ? "text-ink-2" : "text-ink")}>
                {l.title}
              </span>
              {l.hasVideo && <PlayCircle size={16} className="shrink-0 text-ink-3" aria-label="Has a video" />}
              <ArrowRight size={15} className="shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ol>

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
              {cert
                ? "Approved by BD Mushroom — download it below."
                : complete
                  ? "All lessons done! The office will approve your certificate soon."
                  : "Finish every lesson, then the office approves your certificate."}
            </p>
          </div>
        </div>
        {cert && (
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
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((f) => (
            <a key={f.url!} href={f.url!} target="_blank" rel="noreferrer noopener" className="overflow-hidden rounded-xl border border-line bg-surface">
              <img src={f.url!} alt={f.fileName} className="w-full object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {pdfs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pdfs.map((f) => (
            <li key={f.url!}>
              <a
                href={f.url!}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <FileText size={18} className="shrink-0 text-critical-ink" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{f.fileName}</span>
                <span className="text-[12px] font-semibold text-accent">Open</span>
              </a>
            </li>
          ))}
        </ul>
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
