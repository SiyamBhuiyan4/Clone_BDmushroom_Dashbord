import type { ShopInfo } from "./receipt";

/*
  Certificate layout — landscape, one page, handed out once a trainee has
  finished every lesson allocated to them. Deliberately plain: a border, the
  shop's own mark, the trainee's name large in the middle, the lessons they
  completed, and a date. Nothing here depends on React, Convex or the DOM, the
  same reason receipt.ts doesn't — a layout only ever clicked through the app
  is a layout nobody actually checks.
*/

export type CompletedCourse = {
  courseName: string;
  grade?: string;
  lessonNames: string[];
};

export type CertificateTrainee = {
  name: string;
  issuedAt: number;
  /** The course finished, when the certificate is for one. */
  courseName?: string;
  /** The grade earned (A+, A, …), when the course was marked. */
  grade?: string;
  lessonNames?: string[];
  /** Unified list of completed courses and their completed lessons */
  courses?: CompletedCourse[];
};

/** Minimal shape of the PDFKit document this module needs — mirrors receipt.ts's. */
type Doc = {
  page: { width: number; height: number; margins: { top: number; bottom: number; left: number; right: number } };
  y: number;
  font(name: string): Doc;
  fontSize(size: number): Doc;
  fillColor(color: string): Doc;
  strokeColor(color: string): Doc;
  lineWidth(w: number): Doc;
  text(text: string, x?: number, y?: number, options?: Record<string, unknown>): Doc;
  moveTo(x: number, y: number): Doc;
  lineTo(x: number, y: number): Doc;
  stroke(color?: string): Doc;
  rect(x: number, y: number, w: number, h: number): Doc;
  fill(color?: string): Doc;
  heightOfString(text: string, options?: Record<string, unknown>): number;
  widthOfString(text: string, options?: Record<string, unknown>): number;
  image(src: unknown, x?: number, y?: number, options?: Record<string, unknown>): Doc;
};

const REGULAR = "bn";
const BOLD = "bnb";

const GREEN_DEEP = "#2e6b38";
const GREEN = "#3e8548";
const GREEN_LEAF = "#8dc07a";
const CORAL = "#ee6c60";
const INK = "#1f2a24";
const MUTED = "#6b7b70";
const PAPER = "#ffffff";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export function drawCertificate(doc: Doc, trainee: CertificateTrainee, shop: ShopInfo) {
  const { width, height } = doc.page;
  const margin = 36;

  doc.rect(0, 0, width, height).fill(PAPER);

  // Outer and inner borders, the leaf green between them.
  doc
    .lineWidth(2)
    .strokeColor(GREEN_DEEP)
    .rect(margin, margin, width - margin * 2, height - margin * 2)
    .stroke();
  doc
    .lineWidth(0.75)
    .strokeColor(GREEN_LEAF)
    .rect(margin + 8, margin + 8, width - (margin + 8) * 2, height - (margin + 8) * 2)
    .stroke();

  let y = margin + 42;

  if (shop.logo) {
    const logoW = 96;
    const logoH = logoW * (shop.logoAspect ?? 1);
    doc.image(shop.logo, (width - logoW) / 2, y, { width: logoW });
    y += logoH + 18;
  }

  doc
    .font(BOLD)
    .fontSize(26)
    .fillColor(GREEN_DEEP)
    .text("Certificate of Completion", margin, y, { width: width - margin * 2, align: "center" });
  y += 38;

  doc
    .font(REGULAR)
    .fontSize(12)
    .fillColor(MUTED)
    .text("This is to certify that", margin, y, { width: width - margin * 2, align: "center" });
  y += 30;

  doc
    .font(BOLD)
    .fontSize(30)
    .fillColor(INK)
    .text(trainee.name, margin, y, { width: width - margin * 2, align: "center" });
  y += 42;

  // A short rule under the name, centred, the same width whatever the name's length.
  const ruleWidth = 220;
  doc
    .moveTo((width - ruleWidth) / 2, y)
    .lineTo((width + ruleWidth) / 2, y)
    .lineWidth(1)
    .strokeColor(CORAL)
    .stroke();
  y += 22;

  // Determine completed courses to display on the single certificate
  const courses: CompletedCourse[] =
    trainee.courses && trainee.courses.length > 0
      ? trainee.courses
      : trainee.courseName
      ? [
          {
            courseName: trainee.courseName,
            grade: trainee.grade,
            lessonNames: trainee.lessonNames ?? [],
          },
        ]
      : [];

  if (courses.length > 1) {
    doc
      .font(REGULAR)
      .fontSize(11.5)
      .fillColor(MUTED)
      .text(
        "has successfully completed training at BD Mushroom, covering the following courses and lessons:",
        margin,
        y,
        { width: width - margin * 2, align: "center" },
      );
    y = doc.y + 12;

    for (const c of courses) {
      const headerText = c.grade ? `Course: ${c.courseName}  (Grade: ${c.grade})` : `Course: ${c.courseName}`;
      doc
        .font(BOLD)
        .fontSize(12)
        .fillColor(INK)
        .text(headerText, margin + 40, y, { width: width - (margin + 40) * 2, align: "center" });
      y = doc.y + 3;

      if (c.lessonNames.length > 0) {
        const lessonsText = c.lessonNames.join("  •  ");
        doc
          .font(REGULAR)
          .fontSize(10.5)
          .fillColor(GREEN)
          .text(lessonsText, margin + 50, y, { width: width - (margin + 50) * 2, align: "center" });
        y = doc.y + 8;
      } else {
        y += 4;
      }
    }
  } else if (courses.length === 1) {
    const single = courses[0];
    const hasLessons = single.lessonNames.length > 0;
    doc
      .font(REGULAR)
      .fontSize(12)
      .fillColor(MUTED)
      .text(
        hasLessons
          ? `has successfully completed the course “${single.courseName}” at BD Mushroom, covering:`
          : `has successfully completed the course “${single.courseName}” at BD Mushroom.`,
        margin,
        y,
        { width: width - margin * 2, align: "center" },
      );
    y = doc.y + 10;

    if (hasLessons) {
      const lessonsText = single.lessonNames.join("  •  ");
      doc
        .font(BOLD)
        .fontSize(13)
        .fillColor(GREEN)
        .text(lessonsText, margin + 60, y, { width: width - (margin + 60) * 2, align: "center" });
      y += doc.heightOfString(lessonsText, { width: width - (margin + 60) * 2, align: "center" }) + 14;
    }

    if (single.grade) {
      doc
        .font(BOLD)
        .fontSize(15)
        .fillColor(INK)
        .text(`Grade: ${single.grade}`, margin, y, { width: width - margin * 2, align: "center" });
      y = doc.y + 14;
    }
  } else {
    doc
      .font(REGULAR)
      .fontSize(12)
      .fillColor(MUTED)
      .text("has successfully completed training at BD Mushroom.", margin, y, {
        width: width - margin * 2,
        align: "center",
      });
    y = doc.y + 14;
  }

  const footerY = height - margin - 70;
  doc
    .font(REGULAR)
    .fontSize(11)
    .fillColor(MUTED)
    .text(`Issued ${fmtDate(trainee.issuedAt)}`, margin + 50, footerY, { width: 220, align: "left" });

  if (shop.seal) {
    const sealW = 60;
    const sealH = sealW * (shop.sealAspect ?? 1);
    doc.image(shop.seal, width - margin - 50 - sealW, footerY - (sealH - 20) / 2, { width: sealW });
  }
  doc
    .font(BOLD)
    .fontSize(12)
    .fillColor(INK)
    .text(shop.name, width - margin - 50 - 140, footerY + 36, { width: 140, align: "center" });
  doc
    .moveTo(width - margin - 50 - 140, footerY + 32)
    .lineTo(width - margin - 50, footerY + 32)
    .lineWidth(0.75)
    .strokeColor(MUTED)
    .stroke();
}
