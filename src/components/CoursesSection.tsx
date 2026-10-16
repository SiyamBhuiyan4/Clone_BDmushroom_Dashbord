import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button, Card, EmptyState, Field, Input, Modal, ModalFooter, Textarea } from "./ui";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { parseDateInput } from "../lib/dateRange";
import { plural } from "../lib/format";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { uploadFile } from "../lib/upload";

/**
 * The courses the shop teaches: each a list of lessons (text, a YouTube
 * video, images and PDFs), assigned to trainees from their profile.
 */
export function CoursesSection({ addOpen, onAddClose }: { addOpen: boolean; onAddClose: () => void }) {
  const courses = useAuthedQuery(api.courses.list);
  const [openId, setOpenId] = useState<Id<"courses"> | null>(null);

  return (
    <>
      {courses === undefined ? (
        <div className="ac-skeleton h-60 rounded-card border border-line bg-surface" aria-hidden />
      ) : courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={24} />}
            title="No courses yet"
            body="Make a course, add its lessons, then assign it to trainees from their profile."
          />
        </Card>
      ) : (
        <div className="ac-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <button
              key={c._id}
              onClick={() => setOpenId(c._id)}
              className="group flex flex-col rounded-card border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]"
            >
              <span
                className="flex size-10 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-hero)]"
                style={{ background: "var(--grad-violet)" }}
              >
                <BookOpen size={18} />
              </span>
              <p className="mt-3 text-[16px] font-bold text-ink group-hover:text-accent">{c.name}</p>
              {c.description && <p className="mt-1 line-clamp-2 text-[13px] text-ink-3">{c.description}</p>}
              <div className="mt-auto flex items-center gap-4 pt-4 text-[12.5px] text-ink-3">
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen size={13} /> {plural(c.lessonCount, "lesson")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} /> {plural(c.traineeCount, "trainee")}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <CourseFormDialog
        open={addOpen}
        onClose={onAddClose}
        onCreated={(id) => setOpenId(id)}
      />
      <CourseEditor courseId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function CourseFormDialog({
  open,
  onClose,
  course,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  course?: Doc<"courses"> | null;
  onCreated?: (id: Id<"courses">) => void;
}) {
  const toast = useToast();
  const create = useAuthedMutation(api.courses.create);
  const update = useAuthedMutation(api.courses.update);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(course?.name ?? "");
    setDescription(course?.description ?? "");
  }, [open, course]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (course) {
        await update({ id: course._id, name, description });
        onClose();
      } else {
        const id = await create({ name, description });
        onClose();
        onCreated?.(id);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      guardChanges
      open={open}
      onClose={onClose}
      icon={<BookOpen size={19} />}
      title={course ? "Edit course" : "New course"}
      subtitle={course ? undefined : "Next you'll add its lessons."}
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 px-6 py-6">
          <Field label="Course name">
            {(id) => (
              <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Oyster mushroom — basic" required />
            )}
          </Field>
          <Field label="Description" hint="Optional — shown to the trainee.">
            {(id) => (
              <Textarea id={id} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            )}
          </Field>
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || saving}>
            {saving ? "Saving…" : course ? "Save" : "Create course"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** One course: its details and its lessons, in order. */
function CourseEditor({ courseId, onClose }: { courseId: Id<"courses"> | null; onClose: () => void }) {
  const toast = useToast();
  const data = useAuthedQuery(api.courses.detail, courseId ? { id: courseId } : "skip");
  const moveLesson = useAuthedMutation(api.courses.moveLesson);
  const removeLesson = useAuthedMutation(api.courses.removeLesson);
  const removeCourse = useAuthedMutation(api.courses.remove);

  const [editingCourse, setEditingCourse] = useState(false);
  const [lessonOpen, setLessonOpen] = useState<"new" | Id<"courseLessons"> | null>(null);
  const [deletingLesson, setDeletingLesson] = useState<Doc<"courseLessons"> | null>(null);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState<"new" | Doc<"assignments"> | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<Doc<"assignments"> | null>(null);
  const removeAssignment = useAuthedMutation(api.courses.removeAssignment);

  const lessons = data?.lessons ?? [];
  const assignments = data?.assignments ?? [];
  const editingLesson = lessonOpen && lessonOpen !== "new" ? (lessons.find((l) => l._id === lessonOpen) ?? null) : null;

  return (
    <Modal
      open={courseId !== null}
      onClose={onClose}
      icon={<BookOpen size={19} />}
      title={data?.course.name ?? "Course"}
      subtitle={data?.course.description}
      width="sm:max-w-2xl"
    >
      {!data ? (
        <div className="ac-skeleton h-64 bg-surface" aria-hidden />
      ) : (
        <div className="flex flex-col gap-5 px-6 py-6">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditingCourse(true)}>
              <Pencil size={14} /> Edit details
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeletingCourse(true)} className="text-critical-ink">
              <Trash2 size={14} /> Delete course
            </Button>
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
                Lessons · {lessons.length}
              </p>
              <Button size="sm" variant="primary" onClick={() => setLessonOpen("new")}>
                <Plus size={15} /> Add lesson
              </Button>
            </div>
            {lessons.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
                No lessons yet — add the first one.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {lessons.map((l, i) => (
                  <li key={l._id} className="flex items-center gap-2 rounded-xl border border-line bg-page px-3 py-2.5">
                    <span className="w-6 shrink-0 text-center text-[12px] font-bold tabular-nums text-ink-3">{i + 1}</span>
                    <button onClick={() => setLessonOpen(l._id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[13.5px] font-semibold text-ink hover:text-accent">{l.title}</p>
                      <p className="mt-0.5 flex items-center gap-2.5 text-[11.5px] text-ink-3">
                        {l.videoUrl && (
                          <span className="inline-flex items-center gap-1">
                            <PlayCircle size={12} /> Video
                          </span>
                        )}
                        {l.body && (
                          <span className="inline-flex items-center gap-1">
                            <FileText size={12} /> Text
                          </span>
                        )}
                        {l.files.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon size={12} /> {plural(l.files.length, "file")}
                          </span>
                        )}
                      </p>
                    </button>
                    <button
                      onClick={() => void moveLesson({ id: l._id, direction: "up" })}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => void moveLesson({ id: l._id, direction: "down" })}
                      disabled={i === lessons.length - 1}
                      aria-label="Move down"
                      className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      onClick={() => setDeletingLesson(l)}
                      aria-label={`Delete ${l.title}`}
                      className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
                Assignments · {assignments.length}
              </p>
              <Button size="sm" variant="secondary" onClick={() => setAssignmentOpen("new")}>
                <Plus size={15} /> Add assignment
              </Button>
            </div>
            {assignments.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">
                No assignments. Add one to grade this course — trainees hand in a YouTube link, a note, photos or PDFs.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {assignments.map((a) => (
                  <li key={a._id} className="flex items-center gap-2 rounded-xl border border-line bg-page px-3 py-2.5">
                    <ClipboardList size={16} className="shrink-0 text-accent" />
                    <button onClick={() => setAssignmentOpen(a)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[13.5px] font-semibold text-ink hover:text-accent">{a.title}</p>
                      <p className="text-[11.5px] text-ink-3">
                        Out of {a.maxMarks}
                        {a.dueAt ? ` · due ${new Date(a.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                      </p>
                    </button>
                    <button
                      onClick={() => setDeletingAssignment(a)}
                      aria-label={`Delete ${a.title}`}
                      className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {courseId && (
        <AssignmentDialog
          open={assignmentOpen !== null}
          onClose={() => setAssignmentOpen(null)}
          courseId={courseId}
          assignment={assignmentOpen && assignmentOpen !== "new" ? assignmentOpen : null}
        />
      )}
      <PasscodeConfirmDialog
        open={deletingAssignment !== null}
        onClose={() => setDeletingAssignment(null)}
        title="Delete assignment"
        body={deletingAssignment ? `${deletingAssignment.title}\nEveryone's hand-ins and marks for it go too.` : ""}
        onConfirm={async (passcode) => {
          if (!deletingAssignment) return;
          await removeAssignment({ id: deletingAssignment._id, passcode });
          toast.ok("Assignment deleted.");
        }}
      />

      <CourseFormDialog open={editingCourse} onClose={() => setEditingCourse(false)} course={data?.course} />
      {courseId && (
        <LessonDialog
          open={lessonOpen !== null}
          onClose={() => setLessonOpen(null)}
          courseId={courseId}
          lesson={editingLesson}
          onCreated={(id) => setLessonOpen(id)}
        />
      )}
      <PasscodeConfirmDialog
        open={deletingLesson !== null}
        onClose={() => setDeletingLesson(null)}
        title="Delete lesson"
        body={deletingLesson ? `${deletingLesson.title}\nIts files and every trainee's progress on it go too.` : ""}
        onConfirm={async (passcode) => {
          if (!deletingLesson) return;
          await removeLesson({ id: deletingLesson._id, passcode });
          toast.ok("Lesson deleted.");
        }}
      />
      <PasscodeConfirmDialog
        open={deletingCourse}
        onClose={() => setDeletingCourse(false)}
        title="Delete course"
        body={
          data
            ? `${data.course.name}\nIts lessons, files, and every trainee's progress and certificate in it are deleted.`
            : ""
        }
        onConfirm={async (passcode) => {
          if (!courseId) return;
          await removeCourse({ id: courseId, passcode });
          toast.ok("Course deleted.");
          onClose();
        }}
      />
    </Modal>
  );
}

type LessonWithUrls = Omit<Doc<"courseLessons">, "files"> & {
  files: { storageId: Id<"_storage">; fileName: string; kind: "image" | "pdf"; url: string | null }[];
};

/** Adds or edits one lesson. Files attach once it exists, so a new one saves first. */
function LessonDialog({
  open,
  onClose,
  courseId,
  lesson,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  courseId: Id<"courses">;
  lesson: LessonWithUrls | null;
  onCreated: (id: Id<"courseLessons">) => void;
}) {
  const toast = useToast();
  const add = useAuthedMutation(api.courses.addLesson);
  const update = useAuthedMutation(api.courses.updateLesson);
  const generateUploadUrl = useAuthedMutation(api.courses.generateUploadUrl);
  const attachFile = useAuthedMutation(api.courses.attachFile);
  const removeFile = useAuthedMutation(api.courses.removeFile);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(lesson?.title ?? "");
    setBody(lesson?.body ?? "");
    setVideoUrl(lesson?.videoUrl ?? "");
    // Only when the dialog opens or switches lesson — attaching a file
    // refreshes `lesson`, and that must not wipe what is being typed.
  }, [open, lesson?._id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      if (lesson) {
        await update({ id: lesson._id, title, body, videoUrl });
        toast.ok("Lesson saved.");
        onClose();
      } else {
        const id = await add({ courseId, title, body, videoUrl });
        toast.ok("Lesson added — attach images or PDFs below if it needs any.");
        onCreated(id);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    if (!lesson) return;
    const kind = file.type === "application/pdf" ? "pdf" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) {
      toast.error("Only images and PDFs can be attached.");
      return;
    }
    setUploading(true);
    try {
      const url = await generateUploadUrl({});
      const storageId = await uploadFile(url, file);
      await attachFile({ lessonId: lesson._id, storageId, fileName: file.name, kind });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal
      guardChanges
      open={open}
      onClose={onClose}
      icon={<FileText size={19} />}
      title={lesson ? "Edit lesson" : "New lesson"}
      width="sm:max-w-2xl"
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 px-6 py-6">
          <Field label="Title">
            {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Preparing the substrate" required />}
          </Field>
          <Field label="YouTube video" hint="Optional — paste the link; it plays inside the lesson.">
            {(id) => (
              <Input id={id} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" />
            )}
          </Field>
          <Field label="Text" hint="Optional — what the trainee reads. Line breaks are kept.">
            {(id) => <Textarea id={id} rows={8} value={body} onChange={(e) => setBody(e.target.value)} />}
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-ink-2">Images & PDFs</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!lesson || uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} /> {uploading ? "Uploading…" : "Attach file"}
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
            {!lesson ? (
              <p className="text-[12px] text-ink-3">Save the lesson first, then attach files to it.</p>
            ) : lesson.files.length === 0 ? (
              <p className="text-[12px] text-ink-3">No files attached.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lesson.files.map((f) => (
                  <li key={f.storageId} className="flex items-center gap-3 rounded-xl border border-line bg-page px-3 py-2">
                    {f.kind === "image" && f.url ? (
                      <img src={f.url} alt="" className="size-9 rounded-lg object-cover" />
                    ) : (
                      <FileText size={18} className="text-critical-ink" />
                    )}
                    <a href={f.url ?? undefined} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink hover:text-accent">
                      {f.fileName}
                    </a>
                    <button
                      type="button"
                      onClick={() => void removeFile({ lessonId: lesson._id, storageId: f.storageId })}
                      aria-label={`Remove ${f.fileName}`}
                      className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {lesson ? "Close" : "Cancel"}
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim() || saving}>
            {saving ? "Saving…" : lesson ? "Save lesson" : "Add lesson"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Adds or edits one assignment: what to do, what it's out of, and when it's due. */
function AssignmentDialog({
  open,
  onClose,
  courseId,
  assignment,
}: {
  open: boolean;
  onClose: () => void;
  courseId: Id<"courses">;
  assignment: Doc<"assignments"> | null;
}) {
  const toast = useToast();
  const add = useAuthedMutation(api.courses.addAssignment);
  const update = useAuthedMutation(api.courses.updateAssignment);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [maxMarks, setMaxMarks] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(assignment?.title ?? "");
    setInstructions(assignment?.instructions ?? "");
    setMaxMarks(assignment ? String(assignment.maxMarks) : "10");
    setDue(assignment?.dueAt ? new Date(assignment.dueAt).toISOString().slice(0, 10) : "");
  }, [open, assignment]);

  const max = Number(maxMarks);
  const valid = title.trim() !== "" && Number.isFinite(max) && max > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      // The end of the chosen day, so "due the 20th" still takes work on the 20th.
      const start = due ? parseDateInput(due) : null;
      const dueAt = start !== null ? start + 24 * 60 * 60 * 1000 - 1 : undefined;
      const payload = { title, instructions, maxMarks: max, dueAt };
      if (assignment) await update({ id: assignment._id, ...payload });
      else await add({ courseId, ...payload });
      toast.ok(assignment ? "Assignment saved." : "Assignment added.");
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
      open={open}
      onClose={onClose}
      icon={<ClipboardList size={19} />}
      title={assignment ? "Edit assignment" : "New assignment"}
      subtitle="Trainees see only their grade — the marks stay with you."
    >
      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 px-6 py-6">
          <Field label="Title">
            {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grow your first bag" required />}
          </Field>
          <Field label="What to do" hint="Optional — instructions the trainee reads.">
            {(id) => (
              <Textarea
                id={id}
                rows={5}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Film your bag from inoculation to first harvest, upload to YouTube and send the link."
              />
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Out of (marks)">
              {(id) => <Input id={id} type="number" min={1} step="any" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} className="tabular-nums" />}
            </Field>
            <Field label="Due date" hint="Optional.">
              {(id) => <Input id={id} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
            </Field>
          </div>
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || saving}>
            {saving ? "Saving…" : assignment ? "Save" : "Add assignment"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
