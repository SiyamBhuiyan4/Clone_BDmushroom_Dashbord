import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireTrainee } from "./traineeAuth";
import {
  assignmentsOf,
  doneLessonIds,
  lessonsOf,
  scoreOf,
  setLessonDone,
  submissionsIn,
  withFileUrls,
} from "./courses";
import { gradeFor } from "./shared";

/*
  What a signed-in trainee can reach: the courses assigned to them, their
  lessons, their own progress, and a certificate once the shop approves it.
  Every function here starts from the trainee behind the token and checks
  the course is theirs — a trainee asking for someone else's course, or one
  never assigned to them, gets nothing.
*/

async function enrollmentFor(ctx: QueryCtx, traineeId: Id<"trainees">, courseId: Id<"courses">) {
  const rows = await ctx.db
    .query("enrollments")
    .withIndex("by_trainee", (q) => q.eq("traineeId", traineeId))
    .collect();
  const e = rows.find((r) => r.courseId === courseId);
  if (!e) throw new ConvexError("That course isn't assigned to you.");
  return e;
}

async function lessonFor(ctx: QueryCtx, trainee: Doc<"trainees">, lessonId: Id<"courseLessons">) {
  const lesson = await ctx.db.get(lessonId);
  if (!lesson) throw new ConvexError("That lesson no longer exists.");
  await enrollmentFor(ctx, trainee._id, lesson.courseId);
  return lesson;
}

export const myCourses = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_trainee", (q) => q.eq("traineeId", trainee._id))
      .collect();
    const done = await doneLessonIds(ctx, trainee._id);
    const rows = await Promise.all(
      enrollments.map(async (e) => {
        const course = await ctx.db.get(e.courseId);
        if (!course) return null;
        const lessons = await lessonsOf(ctx, e.courseId);
        return {
          courseId: course._id,
          name: course.name,
          description: course.description,
          lessonCount: lessons.length,
          doneCount: lessons.filter((l) => done.has(l._id)).length,
          certificateApproved: Boolean(e.certificateApprovedAt || trainee.certificateIssuedAt),
          assignedAt: e.assignedAt,
        };
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => a.assignedAt - b.assignedAt);
  },
});

export const course = query({
  args: { token: v.string(), courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const e = await enrollmentFor(ctx, trainee._id, args.courseId);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError("That course no longer exists.");
    const done = await doneLessonIds(ctx, trainee._id);
    const lessons = await lessonsOf(ctx, args.courseId);
    const subs = await submissionsIn(ctx, trainee._id, args.courseId);
    const score = await scoreOf(ctx, e);
    return {
      name: course.name,
      description: course.description,
      certificateApproved: Boolean(e.certificateApprovedAt),
      lessons: lessons.map((l) => ({ _id: l._id, title: l.title, done: done.has(l._id), hasVideo: Boolean(l.videoUrl) })),
      // Grades only — the marks behind them stay with the shop.
      assignments: (await assignmentsOf(ctx, args.courseId)).map((a) => {
        const sub = subs.get(a._id);
        return {
          _id: a._id,
          title: a.title,
          dueAt: a.dueAt,
          status: !sub ? ("todo" as const) : sub.marks === undefined ? ("submitted" as const) : ("graded" as const),
          grade: sub?.marks !== undefined ? gradeFor((sub.marks / a.maxMarks) * 100) : null,
        };
      }),
      grade: score.grade,
      gradeSoFar: score.gradeSoFar,
      graded: score.graded,
    };
  },
});

export const lesson = query({
  args: { token: v.string(), lessonId: v.id("courseLessons") },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const lesson = await lessonFor(ctx, trainee, args.lessonId);
    const siblings = await lessonsOf(ctx, lesson.courseId);
    const at = siblings.findIndex((l) => l._id === lesson._id);
    const done = await doneLessonIds(ctx, trainee._id);
    const full = await withFileUrls(ctx, lesson);
    return {
      _id: full._id,
      courseId: full.courseId,
      title: full.title,
      body: full.body,
      videoUrl: full.videoUrl,
      files: full.files.map((f) => ({ fileName: f.fileName, kind: f.kind, url: f.url })),
      done: done.has(lesson._id),
      position: at + 1,
      total: siblings.length,
      prevId: siblings[at - 1]?._id ?? null,
      nextId: siblings[at + 1]?._id ?? null,
    };
  },
});

export const setDone = mutation({
  args: { token: v.string(), lessonId: v.id("courseLessons"), done: v.boolean() },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const lesson = await lessonFor(ctx, trainee, args.lessonId);
    await setLessonDone(ctx, trainee._id, lesson, args.done);
  },
});

/** What the certificate PDF needs — once the shop has approved the trainee's certificate. */
export const certificate = query({
  args: { token: v.string(), courseId: v.optional(v.id("courses")) },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_trainee", (q) => q.eq("traineeId", trainee._id))
      .collect();

    const isApproved = Boolean(
      trainee.certificateIssuedAt || enrollments.some((e) => e.certificateApprovedAt),
    );
    if (!isApproved) return null;

    const done = await doneLessonIds(ctx, trainee._id);
    const completedCourses: { courseName: string; grade?: string; lessonNames: string[] }[] = [];
    let latestApprovedAt = trainee.certificateIssuedAt ?? 0;

    for (const e of enrollments) {
      if (e.certificateApprovedAt && e.certificateApprovedAt > latestApprovedAt) {
        latestApprovedAt = e.certificateApprovedAt;
      }
      const course = await ctx.db.get(e.courseId);
      if (!course) continue;
      const lessons = await lessonsOf(ctx, e.courseId);
      const score = await scoreOf(ctx, e);
      const isFailed = score.graded && score.grade === "F";
      const completedLessons = lessons.filter((l) => done.has(l._id)).map((l) => l.title);
      if (!isFailed && completedLessons.length > 0) {
        completedCourses.push({
          courseName: course.name,
          grade: score.grade ?? undefined,
          lessonNames: completedLessons,
        });
      }
    }

    if (completedCourses.length === 0) return null;

    return {
      name: trainee.name,
      courses: completedCourses,
      courseName: completedCourses.length === 1 ? completedCourses[0].courseName : undefined,
      grade: completedCourses.length === 1 ? completedCourses[0].grade : undefined,
      lessonNames: completedCourses.flatMap((c) => c.lessonNames),
      issuedAt: latestApprovedAt || Date.now(),
    };
  },
});

/* ------------------------------------------------------------ assignments */

async function assignmentFor(ctx: QueryCtx, trainee: Doc<"trainees">, assignmentId: Id<"assignments">) {
  const a = await ctx.db.get(assignmentId);
  if (!a) throw new ConvexError("That assignment no longer exists.");
  await enrollmentFor(ctx, trainee._id, a.courseId);
  return a;
}

export const assignment = query({
  args: { token: v.string(), assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const a = await assignmentFor(ctx, trainee, args.assignmentId);
    const sub = (await submissionsIn(ctx, trainee._id, a.courseId)).get(a._id);
    return {
      _id: a._id,
      courseId: a.courseId,
      title: a.title,
      instructions: a.instructions,
      dueAt: a.dueAt,
      submission: sub
        ? {
            videoUrl: sub.videoUrl,
            note: sub.note,
            submittedAt: sub.submittedAt,
            files: await Promise.all(
              (sub.files ?? []).map(async (f) => ({
                storageId: f.storageId,
                fileName: f.fileName,
                kind: f.kind,
                url: await ctx.storage.getUrl(f.storageId),
              })),
            ),
            graded: sub.marks !== undefined,
            grade: sub.marks !== undefined ? gradeFor((sub.marks / a.maxMarks) * 100) : null,
            feedback: sub.feedback,
          }
        : null,
    };
  },
});

/** For a trainee attaching photos or PDFs to their submission. */
export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireTrainee(ctx, args.token);
    return await ctx.storage.generateUploadUrl();
  },
});

const MAX_FILES = 10;
/** How recently a file must have been uploaded to be attached to a hand-in. */
const FRESH_UPLOAD_MS = 60 * 60 * 1000;

/**
 * Hands in (or re-hands-in) an assignment. Open until it's marked; after
 * that it's locked, so the work that was graded is the work on record.
 */
export const submit = mutation({
  args: {
    token: v.string(),
    assignmentId: v.id("assignments"),
    videoUrl: v.optional(v.string()),
    note: v.optional(v.string()),
    files: v.array(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string(),
        kind: v.union(v.literal("image"), v.literal("pdf")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const a = await assignmentFor(ctx, trainee, args.assignmentId);
    const videoUrl = (args.videoUrl ?? "").trim() || undefined;
    if (videoUrl && !/^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(videoUrl)) {
      throw new ConvexError("The video link has to be a YouTube link.");
    }
    const note = (args.note ?? "").trim() || undefined;
    if (!videoUrl && !note && args.files.length === 0) {
      throw new ConvexError("Add your video link, a note or a file before handing it in.");
    }
    if (args.files.length > MAX_FILES) throw new ConvexError(`At most ${MAX_FILES} files.`);

    const existing = (await submissionsIn(ctx, trainee._id, a.courseId)).get(a._id);
    if (existing?.marks !== undefined) throw new ConvexError("This one is already marked — it can't be changed now.");

    /*
      A file the trainee didn't just upload can't be attached. The ids come
      from the browser, and without this a trainee could name a file that
      belongs to someone else — and, by dropping it on the next hand-in, have
      it deleted.
    */
    const already = new Set((existing?.files ?? []).map((f) => f.storageId as string));
    for (const f of args.files) {
      if (already.has(f.storageId)) continue;
      const meta = await ctx.db.system.get(f.storageId);
      if (!meta || Date.now() - meta._creationTime > FRESH_UPLOAD_MS) {
        throw new ConvexError("One of the files needs uploading again.");
      }
    }

    if (existing) {
      // Files dropped from the new hand-in are deleted, not left orphaned.
      const kept = new Set(args.files.map((f) => f.storageId as string));
      for (const f of existing.files ?? []) {
        if (!kept.has(f.storageId)) {
          try {
            await ctx.storage.delete(f.storageId);
          } catch {
            // Already gone.
          }
        }
      }
      await ctx.db.patch(existing._id, { videoUrl, note, files: args.files, submittedAt: Date.now() });
    } else {
      await ctx.db.insert("submissions", {
        assignmentId: a._id,
        courseId: a.courseId,
        traineeId: trainee._id,
        videoUrl,
        note,
        files: args.files,
        submittedAt: Date.now(),
      });
    }
  },
});

/* ------------------------------------------------------------------ notes */

/** The office's note for everyone, and the one for this trainee, if any. */
export const notes = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const general = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "traineeNote"))
      .unique();
    const generalText = general?.text?.trim() || null;
    const personalRaw = trainee.portalNote ?? trainee.note ?? null;
    const personalText = personalRaw?.trim() || null;
    return {
      general: generalText ? { text: generalText, updatedAt: general!.updatedAt } : null,
      personal: personalText
        ? { text: personalText, updatedAt: trainee.portalNoteUpdatedAt ?? trainee.createdAt ?? 0 }
        : null,
    };
  },
});
