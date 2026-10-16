import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireSession, verifyPasscode } from "./auth";
import { gradeFor } from "./shared";

/*
  Courses, from the shop's side: build them, assign them to trainees, and
  follow each trainee's progress through them. What a trainee sees of the
  same data is in portal.ts.
*/

/** A lesson's files, each with a signed URL the browser can open. */
export async function withFileUrls(ctx: QueryCtx, lesson: Doc<"courseLessons">) {
  const files = await Promise.all(
    (lesson.files ?? []).map(async (f) => ({ ...f, url: await ctx.storage.getUrl(f.storageId) })),
  );
  return { ...lesson, files };
}

export async function lessonsOf(ctx: QueryCtx, courseId: Id<"courses">) {
  const rows = await ctx.db
    .query("courseLessons")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  return rows.sort((a, b) => a.order - b.order);
}

export async function assignmentsOf(ctx: QueryCtx, courseId: Id<"courses">) {
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  return rows.sort((a, b) => a.order - b.order);
}

/** This trainee's submissions in one course, by assignment id. */
export async function submissionsIn(ctx: QueryCtx, traineeId: Id<"trainees">, courseId: Id<"courses">) {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_trainee", (q) => q.eq("traineeId", traineeId))
    .collect();
  return new Map(rows.filter((r) => r.courseId === courseId).map((r) => [r.assignmentId as string, r]));
}

/**
 * A trainee's score in a course: assignment marks plus the final exam, if
 * there is one. `grade` only exists once everything is marked — a grade
 * from half the work would be a guess presented as a result — while
 * `gradeSoFar` reflects just what has been marked.
 */
export async function scoreOf(ctx: QueryCtx, enrollment: Doc<"enrollments">) {
  const assignments = await assignmentsOf(ctx, enrollment.courseId);
  const subs = await submissionsIn(ctx, enrollment.traineeId, enrollment.courseId);
  let earned = 0;
  let max = 0;
  let markedMax = 0;
  let allMarked = true;
  for (const a of assignments) {
    max += a.maxMarks;
    const sub = subs.get(a._id);
    if (sub?.marks !== undefined) {
      earned += sub.marks;
      markedMax += a.maxMarks;
    } else {
      allMarked = false;
    }
  }
  if (enrollment.finalMax) {
    max += enrollment.finalMax;
    if (enrollment.finalMarks !== undefined) {
      earned += enrollment.finalMarks;
      markedMax += enrollment.finalMax;
    } else {
      allMarked = false;
    }
  }
  const graded = max > 0;
  const percent = graded && allMarked ? (earned / max) * 100 : null;
  return {
    graded,
    earned,
    max,
    allMarked,
    percent,
    grade: percent !== null ? gradeFor(percent) : null,
    gradeSoFar: markedMax > 0 ? gradeFor((earned / markedMax) * 100) : null,
  };
}

/** Deletes a submission and the files the trainee attached to it. */
export async function deleteSubmission(ctx: MutationCtx, sub: Doc<"submissions">) {
  for (const f of sub.files ?? []) {
    try {
      await ctx.storage.delete(f.storageId);
    } catch {
      // Already gone.
    }
  }
  await ctx.db.delete(sub._id);
}

/** Lesson ids this trainee has finished. */
export async function doneLessonIds(ctx: QueryCtx, traineeId: Id<"trainees">) {
  const rows = await ctx.db
    .query("lessonProgress")
    .withIndex("by_trainee", (q) => q.eq("traineeId", traineeId))
    .collect();
  return new Set(rows.map((r) => r.lessonId as string));
}

/** A YouTube link as typed, checked to be one — the lesson page embeds it. */
function cleanVideoUrl(raw?: string) {
  const url = (raw ?? "").trim();
  if (!url) return undefined;
  if (!/^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
    throw new ConvexError("The video link has to be a YouTube link.");
  }
  return url;
}

/* ---------------------------------------------------------------- courses */

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const courses = await ctx.db.query("courses").withIndex("by_order").collect();
    return await Promise.all(
      courses.map(async (c) => ({
        ...c,
        lessonCount: (await lessonsOf(ctx, c._id)).length,
        traineeCount: (
          await ctx.db
            .query("enrollments")
            .withIndex("by_course", (q) => q.eq("courseId", c._id))
            .collect()
        ).length,
      })),
    );
  },
});

export const detail = query({
  args: { token: v.string(), id: v.id("courses") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const course = await ctx.db.get(args.id);
    if (!course) return null;
    const lessons = await Promise.all((await lessonsOf(ctx, args.id)).map((l) => withFileUrls(ctx, l)));
    return { course, lessons, assignments: await assignmentsOf(ctx, args.id) };
  },
});

function cleanName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ConvexError("A course needs a name.");
  return trimmed;
}

export const create = mutation({
  args: { token: v.string(), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const all = await ctx.db.query("courses").collect();
    return await ctx.db.insert("courses", {
      name: cleanName(args.name),
      description: args.description?.trim() || undefined,
      order: all.reduce((max, c) => Math.max(max, c.order), -1) + 1,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { token: v.string(), id: v.id("courses"), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    if (!(await ctx.db.get(args.id))) throw new ConvexError("That course no longer exists.");
    await ctx.db.patch(args.id, {
      name: cleanName(args.name),
      description: args.description?.trim() || undefined,
    });
  },
});

async function deleteLesson(ctx: MutationCtx, lesson: Doc<"courseLessons">) {
  for (const f of lesson.files ?? []) {
    try {
      await ctx.storage.delete(f.storageId);
    } catch {
      // Already gone; nothing left to clean up.
    }
  }
  const progress = await ctx.db
    .query("lessonProgress")
    .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
    .collect();
  for (const p of progress) await ctx.db.delete(p._id);
  await ctx.db.delete(lesson._id);
}

/** Deletes a course with its lessons, files, assignments and everyone's progress in it. */
export const remove = mutation({
  args: { token: v.string(), id: v.id("courses"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    for (const lesson of await lessonsOf(ctx, args.id)) await deleteLesson(ctx, lesson);
    for (const a of await assignmentsOf(ctx, args.id)) {
      for (const sub of await ctx.db
        .query("submissions")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", a._id))
        .collect()) {
        await deleteSubmission(ctx, sub);
      }
      await ctx.db.delete(a._id);
    }
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_course", (q) => q.eq("courseId", args.id))
      .collect();
    for (const e of enrollments) await ctx.db.delete(e._id);
    await ctx.db.delete(args.id);
  },
});

/* ---------------------------------------------------------------- lessons */

const lessonFields = {
  title: v.string(),
  body: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
};

export const addLesson = mutation({
  args: { token: v.string(), courseId: v.id("courses"), ...lessonFields },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    if (!(await ctx.db.get(args.courseId))) throw new ConvexError("That course no longer exists.");
    const title = args.title.trim();
    if (!title) throw new ConvexError("A lesson needs a title.");
    const existing = await lessonsOf(ctx, args.courseId);
    return await ctx.db.insert("courseLessons", {
      courseId: args.courseId,
      title,
      body: args.body?.trim() || undefined,
      videoUrl: cleanVideoUrl(args.videoUrl),
      order: existing.reduce((max, l) => Math.max(max, l.order), -1) + 1,
      createdAt: Date.now(),
    });
  },
});

export const updateLesson = mutation({
  args: { token: v.string(), id: v.id("courseLessons"), ...lessonFields },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    if (!(await ctx.db.get(args.id))) throw new ConvexError("That lesson no longer exists.");
    const title = args.title.trim();
    if (!title) throw new ConvexError("A lesson needs a title.");
    await ctx.db.patch(args.id, {
      title,
      body: args.body?.trim() || undefined,
      videoUrl: cleanVideoUrl(args.videoUrl),
    });
  },
});

export const removeLesson = mutation({
  args: { token: v.string(), id: v.id("courseLessons"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const lesson = await ctx.db.get(args.id);
    if (lesson) await deleteLesson(ctx, lesson);
  },
});

/** Swaps a lesson with its neighbour above or below. */
export const moveLesson = mutation({
  args: { token: v.string(), id: v.id("courseLessons"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const lesson = await ctx.db.get(args.id);
    if (!lesson) return;
    const lessons = await lessonsOf(ctx, lesson.courseId);
    const at = lessons.findIndex((l) => l._id === lesson._id);
    const other = lessons[args.direction === "up" ? at - 1 : at + 1];
    if (!other) return;
    await ctx.db.patch(lesson._id, { order: other.order });
    await ctx.db.patch(other._id, { order: lesson.order });
  },
});

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachFile = mutation({
  args: {
    token: v.string(),
    lessonId: v.id("courseLessons"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    kind: v.union(v.literal("image"), v.literal("pdf")),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new ConvexError("That lesson no longer exists.");
    await ctx.db.patch(args.lessonId, {
      files: [...(lesson.files ?? []), { storageId: args.storageId, fileName: args.fileName, kind: args.kind }],
    });
  },
});

export const removeFile = mutation({
  args: { token: v.string(), lessonId: v.id("courseLessons"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) return;
    await ctx.db.patch(args.lessonId, { files: (lesson.files ?? []).filter((f) => f.storageId !== args.storageId) });
    try {
      await ctx.storage.delete(args.storageId);
    } catch {
      // Already gone.
    }
  },
});

/* ------------------------------------------------------ trainee's courses */

/** Every course assigned to one trainee, with how far they are in each. */
export const ofTrainee = query({
  args: { token: v.string(), traineeId: v.id("trainees") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const trainee = await ctx.db.get(args.traineeId);
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_trainee", (q) => q.eq("traineeId", args.traineeId))
      .collect();
    const done = await ctx.db
      .query("lessonProgress")
      .withIndex("by_trainee", (q) => q.eq("traineeId", args.traineeId))
      .collect();
    const doneAt = new Map(done.map((d) => [d.lessonId as string, d.completedAt]));
    const rows = await Promise.all(
      enrollments.map(async (e) => {
        const course = await ctx.db.get(e.courseId);
        if (!course) return null;
        const lessons = await lessonsOf(ctx, e.courseId);
        const subs = await submissionsIn(ctx, args.traineeId, e.courseId);
        const assignments = await Promise.all(
          (await assignmentsOf(ctx, e.courseId)).map(async (a) => {
            const sub = subs.get(a._id);
            return {
              ...a,
              submission: sub
                ? {
                    ...sub,
                    files: await Promise.all(
                      (sub.files ?? []).map(async (f) => ({ ...f, url: await ctx.storage.getUrl(f.storageId) })),
                    ),
                  }
                : null,
            };
          }),
        );
        return {
          enrollment: e,
          course,
          lessons: lessons.map((l) => ({ _id: l._id, title: l.title, completedAt: doneAt.get(l._id) ?? null })),
          assignments,
          score: await scoreOf(ctx, e),
          traineeCertifiedAt: trainee?.certificateIssuedAt ?? null,
        };
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => a.enrollment.assignedAt - b.enrollment.assignedAt);
  },
});

export const assign = mutation({
  args: { token: v.string(), traineeId: v.id("trainees"), courseId: v.id("courses") },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    if (!(await ctx.db.get(args.traineeId))) throw new ConvexError("That trainee no longer exists.");
    if (!(await ctx.db.get(args.courseId))) throw new ConvexError("That course no longer exists.");
    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_trainee", (q) => q.eq("traineeId", args.traineeId))
      .collect();
    if (existing.some((e) => e.courseId === args.courseId)) {
      throw new ConvexError("This course is already assigned to them.");
    }
    return await ctx.db.insert("enrollments", {
      traineeId: args.traineeId,
      courseId: args.courseId,
      assignedAt: Date.now(),
    });
  },
});

/** Takes a course back off a trainee, with their progress in it. */
export const unassign = mutation({
  args: { token: v.string(), id: v.id("enrollments"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    const e = await ctx.db.get(args.id);
    if (!e) return;
    const progress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_trainee", (q) => q.eq("traineeId", e.traineeId))
      .collect();
    for (const p of progress) if (p.courseId === e.courseId) await ctx.db.delete(p._id);
    for (const sub of (await submissionsIn(ctx, e.traineeId, e.courseId)).values()) await deleteSubmission(ctx, sub);
    await ctx.db.delete(e._id);
  },
});

/** Shared by the shop's checkbox and the trainee's "Mark as done". */
export async function setLessonDone(
  ctx: MutationCtx,
  traineeId: Id<"trainees">,
  lesson: Doc<"courseLessons">,
  done: boolean,
) {
  const existing = await ctx.db
    .query("lessonProgress")
    .withIndex("by_trainee_lesson", (q) => q.eq("traineeId", traineeId).eq("lessonId", lesson._id))
    .unique();
  if (done && !existing) {
    await ctx.db.insert("lessonProgress", {
      traineeId,
      courseId: lesson.courseId,
      lessonId: lesson._id,
      completedAt: Date.now(),
    });
  } else if (!done && existing) {
    await ctx.db.delete(existing._id);
  }
}

export const setProgress = mutation({
  args: { token: v.string(), traineeId: v.id("trainees"), lessonId: v.id("courseLessons"), done: v.boolean() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new ConvexError("That lesson no longer exists.");
    await setLessonDone(ctx, args.traineeId, lesson, args.done);
  },
});

/** Approves (or withdraws) the certificate — only once every lesson is done and trainee has passed. */
export const setCertificate = mutation({
  args: { token: v.string(), id: v.id("enrollments"), approved: v.boolean() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const e = await ctx.db.get(args.id);
    if (!e) throw new ConvexError("That course is no longer assigned.");
    if (args.approved) {
      const lessons = await lessonsOf(ctx, e.courseId);
      const done = await doneLessonIds(ctx, e.traineeId);
      if (lessons.length === 0) {
        throw new ConvexError("Add lessons to this course and mark them done before approving a certificate.");
      }
      if (lessons.some((l) => !done.has(l._id))) {
        throw new ConvexError("Every lesson has to be done first.");
      }
      const score = await scoreOf(ctx, e);
      if (score.graded && !score.allMarked) {
        throw new ConvexError("Every assignment (and the final exam, if set) has to be marked first.");
      }
      if (score.graded && score.grade === "F") {
        throw new ConvexError("Cannot approve certificate: The trainee has failed the course (Grade F).");
      }
    }
    await ctx.db.patch(args.id, { certificateApprovedAt: args.approved ? Date.now() : undefined });
  },
});

/** Approves (or withdraws) the trainee's single official certificate — covering all completed courses. */
export const setTraineeCertificate = mutation({
  args: { token: v.string(), traineeId: v.id("trainees"), approved: v.boolean() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const trainee = await ctx.db.get(args.traineeId);
    if (!trainee) throw new ConvexError("That trainee no longer exists.");

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_trainee", (q) => q.eq("traineeId", args.traineeId))
      .collect();

    const now = Date.now();

    if (args.approved) {
      if (enrollments.length === 0) {
        throw new ConvexError("No courses assigned to this trainee yet.");
      }
      const done = await doneLessonIds(ctx, args.traineeId);
      let anyComplete = false;
      for (const e of enrollments) {
        const lessons = await lessonsOf(ctx, e.courseId);
        const score = await scoreOf(ctx, e);
        const isFailed = score.graded && score.grade === "F";
        const allDone = lessons.length > 0 && lessons.every((l) => done.has(l._id));
        if (allDone && !isFailed) {
          anyComplete = true;
          await ctx.db.patch(e._id, { certificateApprovedAt: now });
        } else {
          await ctx.db.patch(e._id, { certificateApprovedAt: undefined });
        }
      }
      if (!anyComplete) {
        throw new ConvexError(
          "At least one course must have all lessons completed and a passing grade to approve the certificate.",
        );
      }
      await ctx.db.patch(args.traineeId, { certificateIssuedAt: now });
    } else {
      await ctx.db.patch(args.traineeId, { certificateIssuedAt: undefined });
      for (const e of enrollments) {
        await ctx.db.patch(e._id, { certificateApprovedAt: undefined });
      }
    }
  },
});

/* ------------------------------------------------------------ assignments */

const assignmentFields = {
  title: v.string(),
  instructions: v.optional(v.string()),
  maxMarks: v.number(),
  dueAt: v.optional(v.number()),
};

function checkAssignment(args: { title: string; maxMarks: number }) {
  if (!args.title.trim()) throw new ConvexError("An assignment needs a title.");
  if (!Number.isFinite(args.maxMarks) || args.maxMarks <= 0) {
    throw new ConvexError("Total marks must be more than zero.");
  }
}

export const addAssignment = mutation({
  args: { token: v.string(), courseId: v.id("courses"), ...assignmentFields },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    if (!(await ctx.db.get(args.courseId))) throw new ConvexError("That course no longer exists.");
    checkAssignment(args);
    const existing = await assignmentsOf(ctx, args.courseId);
    return await ctx.db.insert("assignments", {
      courseId: args.courseId,
      title: args.title.trim(),
      instructions: args.instructions?.trim() || undefined,
      maxMarks: args.maxMarks,
      dueAt: args.dueAt,
      order: existing.reduce((max, a) => Math.max(max, a.order), -1) + 1,
      createdAt: Date.now(),
    });
  },
});

export const updateAssignment = mutation({
  args: { token: v.string(), id: v.id("assignments"), ...assignmentFields },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That assignment no longer exists.");
    checkAssignment(args);
    // Lowering the total can't leave marks above it.
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.id))
      .collect();
    if (subs.some((sub) => (sub.marks ?? 0) > args.maxMarks)) {
      throw new ConvexError("Someone already has more marks than that — lower their marks first.");
    }
    await ctx.db.patch(args.id, {
      title: args.title.trim(),
      instructions: args.instructions?.trim() || undefined,
      maxMarks: args.maxMarks,
      dueAt: args.dueAt,
    });
  },
});

export const removeAssignment = mutation({
  args: { token: v.string(), id: v.id("assignments"), passcode: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    await verifyPasscode(ctx, args.passcode);
    for (const sub of await ctx.db
      .query("submissions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.id))
      .collect()) {
      await deleteSubmission(ctx, sub);
    }
    await ctx.db.delete(args.id);
  },
});

/** Marks a submission. Clearing the marks (undefined) un-grades it. */
export const gradeSubmission = mutation({
  args: {
    token: v.string(),
    id: v.id("submissions"),
    marks: v.optional(v.number()),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const sub = await ctx.db.get(args.id);
    if (!sub) throw new ConvexError("That submission no longer exists.");
    const assignment = await ctx.db.get(sub.assignmentId);
    if (!assignment) throw new ConvexError("That assignment no longer exists.");
    if (args.marks !== undefined && (!Number.isFinite(args.marks) || args.marks < 0 || args.marks > assignment.maxMarks)) {
      throw new ConvexError(`Marks must be between 0 and ${assignment.maxMarks}.`);
    }
    await ctx.db.patch(args.id, {
      marks: args.marks,
      feedback: args.feedback?.trim() || undefined,
      gradedAt: args.marks !== undefined ? Date.now() : undefined,
    });
  },
});

/** The final exam or practical: out of `max`, with `marks` once it's marked. Both empty removes it. */
export const setFinal = mutation({
  args: {
    token: v.string(),
    id: v.id("enrollments"),
    marks: v.optional(v.number()),
    max: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    if (!(await ctx.db.get(args.id))) throw new ConvexError("That course is no longer assigned.");
    if (args.max !== undefined && (!Number.isFinite(args.max) || args.max <= 0)) {
      throw new ConvexError("Total marks must be more than zero.");
    }
    if (args.marks !== undefined) {
      if (args.max === undefined) throw new ConvexError("Set the total marks first.");
      if (!Number.isFinite(args.marks) || args.marks < 0 || args.marks > args.max) {
        throw new ConvexError(`Marks must be between 0 and ${args.max}.`);
      }
    }
    await ctx.db.patch(args.id, { finalMarks: args.marks, finalMax: args.max });
  },
});
