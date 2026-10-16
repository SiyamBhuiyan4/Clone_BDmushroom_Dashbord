import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireTrainee } from "./traineeAuth";
import { doneLessonIds, lessonsOf, setLessonDone, withFileUrls } from "./courses";

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
          certificateApproved: Boolean(e.certificateApprovedAt),
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
    return {
      name: course.name,
      description: course.description,
      certificateApproved: Boolean(e.certificateApprovedAt),
      lessons: lessons.map((l) => ({ _id: l._id, title: l.title, done: done.has(l._id), hasVideo: Boolean(l.videoUrl) })),
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

/** What the certificate PDF needs — only once the shop has approved it. */
export const certificate = query({
  args: { token: v.string(), courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const trainee = await requireTrainee(ctx, args.token);
    const e = await enrollmentFor(ctx, trainee._id, args.courseId);
    if (!e.certificateApprovedAt) return null;
    const lessons = await lessonsOf(ctx, args.courseId);
    return { name: trainee.name, lessonNames: lessons.map((l) => l.title), issuedAt: e.certificateApprovedAt };
  },
});
