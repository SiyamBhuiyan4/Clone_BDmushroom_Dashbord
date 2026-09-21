/*
  Receipt layout.

  Deliberately free of React, Convex and the DOM: it takes a PDFKit document
  plus plain data, so the identical code can be rendered in the browser for a
  download and in Node for a visual check. A layout that can only be seen by
  clicking through the app is a layout nobody verifies.

  Everything is measured before it is drawn. The requirement is that long
  product and customer names wrap rather than overflow, that nothing overlaps,
  and that nothing is clipped — none of which survives fixed row heights.

  The palette is lifted from the bdmushroom.com logo: the deep green of the
  cap, the leaf green of its highlight and the coral of the swoosh beneath.
*/

export type ReceiptItem = {
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type ReceiptOrder = {
  orderNo: string;
  orderedAt: number;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  total: number;
  paymentStatus: string;
  /** What the customer has handed over so far; only meaningful when partial. */
  paidAmount?: number;
  orderStatus?: string;
  note?: string;
};

export type ShopInfo = {
  name: string;
  tagline?: string;
  phone?: string;
  address?: string;
  website?: string;
  /**
   * PNG bytes of the shop logo, flattened onto white rather than transparent:
   * PDFKit decodes an alpha channel through a Web Worker, while an opaque PNG
   * is passed straight through. Optional on purpose — a failed fetch should
   * cost the receipt its logo, not the download.
   */
  logo?: Uint8Array;
  /** Aspect ratio of the logo, used to reserve the right amount of height. */
  logoAspect?: number;
  /** The mark on its own, printed large and faint as a seal behind the page. */
  seal?: Uint8Array;
  /** Aspect ratio of the seal. */
  sealAspect?: number;
};

/** Minimal shape of the PDFKit document this module needs. */
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
  fillAndStroke(fill?: string, stroke?: string): Doc;
  heightOfString(text: string, options?: Record<string, unknown>): number;
  widthOfString(text: string, options?: Record<string, unknown>): number;
  image(src: unknown, x?: number, y?: number, options?: Record<string, unknown>): Doc;
  save(): Doc;
  restore(): Doc;
  opacity(value: number): Doc;
  addPage(options?: Record<string, unknown>): Doc;
};

const REGULAR = "bn";
const BOLD = "bnb";

/* --------------------------------------------------------------- palette */

/** Cap green — the logo's darkest tone, used for headings and the table band. */
const GREEN_DEEP = "#2e6b38";
/** The mid green of the mushroom stem, for rules and secondary marks. */
const GREEN = "#3e8548";
/** Leaf highlight, only ever used as a thin accent. */
const GREEN_LEAF = "#8dc07a";
/** Hairline that reads as a separator without competing with the text. */
const EDGE = "#dcebd6";
/** The swoosh under the wordmark: reserved for what the customer still owes. */
const CORAL = "#ee6c60";
const CORAL_DEEP = "#c2453a";
const INK = "#1f2a24";
const MUTED = "#6b7b70";
const PAPER = "#ffffff";

/*
  One inset, used by every column on the page: the product name from the left
  edge of the table, and every figure — row amounts, totals, the grand total
  in its band, the order's state in the customer block — from the right. A
  receipt is read down its right edge, and a single gutter is what makes that
  edge straight.
*/
const GUTTER = 12;

/** Bengali digits, so the receipt matches how the amounts are read aloud. */
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function toBengaliDigits(input: string) {
  return input.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function formatMoney(value: number, bengali: boolean) {
  const s = value.toLocaleString(bengali ? "bn-BD" : "en-GB", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `৳${s}`;
}

function formatQty(value: number, bengali: boolean) {
  return value.toLocaleString(bengali ? "bn-BD" : "en-GB", { maximumFractionDigits: 3 });
}

function formatDate(ts: number, bengali: boolean) {
  return new Date(ts).toLocaleDateString(bengali ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const PAYMENT_LABELS: Record<string, { en: string; bn: string }> = {
  paid: { en: "Paid", bn: "পরিশোধিত" },
  due: { en: "Due", bn: "বাকি" },
  partial: { en: "Partial", bn: "আংশিক" },
};

/** Ink colour per payment state: green settled, coral owed, amber in between. */
const PAYMENT_COLORS: Record<string, string> = {
  paid: GREEN_DEEP,
  due: CORAL_DEEP,
  partial: "#9a6b12",
};

const ORDER_STATUS_LABELS: Record<string, { en: string; bn: string }> = {
  pending: { en: "Pending", bn: "অপেক্ষমাণ" },
  processing: { en: "Processing", bn: "প্রক্রিয়াধীন" },
  shipped: { en: "Shipped", bn: "পাঠানো হয়েছে" },
  delivered: { en: "Delivered", bn: "ডেলিভারি সম্পন্ন" },
  cancelled: { en: "Cancelled", bn: "বাতিল" },
};

/**
 * Draws one receipt onto the current page.
 *
 * Columns are laid out from the right so the money columns stay aligned no
 * matter how wide the page or how long a product name is; the name column
 * simply takes whatever is left.
 */
export function drawReceipt(
  doc: Doc,
  order: ReceiptOrder,
  shop: ShopInfo,
  opts: { bengali?: boolean } = {},
) {
  const bn = opts.bengali ?? true;
  const money = (n: number) => formatMoney(n, bn);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const headerTop = doc.page.margins.top;

  /*
    The shop's seal, printed behind everything else on every sheet. Faint
    enough that a figure sitting on top of it stays legible on paper, and
    drawn first so nothing has to be knocked out around it. Its own graphics
    state, or the opacity would leak into the whole receipt.
  */
  const drawSeal = () => {
    const seal = shop.seal ?? shop.logo;
    if (!seal) return;
    const sealW = 260;
    const sealH = sealW * (shop.seal ? (shop.sealAspect ?? 0.61) : (shop.logoAspect ?? 0.75));
    doc
      .save()
      .opacity(0.05)
      .image(seal, left + (width - sealW) / 2, (doc.page.height - sealH) / 2, { width: sealW })
      .restore();
  };

  /*
    The footer is drawn on every page rather than only the last: a printed
    receipt that runs to two sheets should look finished on both, and the
    continuation line says which order the second sheet belongs to.
  */
  const drawFooter = (message: string, accent: string) => {
    const footerY = doc.page.height - doc.page.margins.bottom - 30;
    doc.rect(left, footerY, width, 2).fill(GREEN_LEAF);
    doc
      .font(BOLD)
      .fontSize(9)
      .fillColor(accent)
      .text(message, left, footerY + 10, { width: width * 0.6, lineBreak: false });
    if (shop.website) {
      doc
        .font(REGULAR)
        .fontSize(9)
        .fillColor(MUTED)
        .text(shop.website, left + width * 0.6, footerY + 10, {
          width: width * 0.4,
          align: "right",
          lineBreak: false,
        });
    }
  };

  drawSeal();

  /* ------------------------------------------------------------- header */
  /*
    Letterhead: the mark on the left with the shop's details beside it, the
    document's own identity on the right. The two sides are measured
    independently and the header ends below whichever runs longer.
  */
  let textX = left;
  let logoBottom = headerTop;
  if (shop.logo) {
    const logoW = 92;
    const logoH = logoW * (shop.logoAspect ?? 0.75);
    doc.image(shop.logo, left, headerTop, { width: logoW });
    textX = left + logoW + 16;
    logoBottom = headerTop + logoH;
  }

  const idColW = 165;
  const nameW = Math.max(120, right - idColW - 20 - textX);

  let y = headerTop + 4;
  doc.font(BOLD).fontSize(16).fillColor(GREEN_DEEP).text(shop.name, textX, y, { width: nameW });
  y = doc.y + 1;

  if (shop.tagline) {
    doc.font(REGULAR).fontSize(9.5).fillColor(MUTED).text(shop.tagline, textX, y, { width: nameW });
    y = doc.y + 1;
  }
  const contact = [shop.phone, shop.address, shop.website].filter(Boolean).join("  ·  ");
  if (contact) {
    doc.font(REGULAR).fontSize(8.5).fillColor(MUTED).text(contact, textX, y, { width: nameW });
    y = doc.y;
  }

  // Title and order meta, right-aligned against the header block.
  const idX = right - idColW;
  doc
    .font(BOLD)
    .fontSize(19)
    .fillColor(GREEN_DEEP)
    .text(bn ? "রসিদ" : "RECEIPT", idX, headerTop + 2, { width: idColW, align: "right" });
  let metaY = doc.y + 4;
  doc
    .font(BOLD)
    .fontSize(10)
    .fillColor(INK)
    .text(order.orderNo, idX, metaY, { width: idColW, align: "right" });
  metaY = doc.y + 1;
  doc
    .font(REGULAR)
    .fontSize(9)
    .fillColor(MUTED)
    .text(formatDate(order.orderedAt, bn), idX, metaY, { width: idColW, align: "right" });

  y = Math.max(y, doc.y, logoBottom) + 12;

  /*
    The brand rule: cap green running most of the way across, finished with
    the coral of the swoosh. Two rectangles rather than a stroked line, so the
    weight is exact at any zoom.
  */
  const coralW = 58;
  doc.rect(left, y, width - coralW, 3).fill(GREEN_DEEP);
  doc.rect(right - coralW, y, coralW, 3).fill(CORAL);
  y += 18;

  /* ----------------------------------------------------------- customer */
  /*
    Measured before it is drawn: the card is exactly as tall as the customer
    details inside it, so a two-line address does not spill past its border.
  */
  const cardPadY = 11;
  const cardTextX = left + GUTTER;
  const detailW = width * 0.52;

  /*
    The order's state sits in the card as a plain two-column list rather than
    as coloured chips. Chips read as buttons — something to press — and a
    printed receipt has nothing to press; a label and a value, right-aligned
    on the same edge as every figure below, is what a document does.
  */
  const stateRows: { label: string; value: string; color: string }[] = [];
  const payment = PAYMENT_LABELS[order.paymentStatus] ?? { en: order.paymentStatus, bn: order.paymentStatus };
  stateRows.push({
    label: bn ? "পেমেন্ট" : "Payment",
    value: bn ? payment.bn : payment.en,
    color: PAYMENT_COLORS[order.paymentStatus] ?? INK,
  });
  if (order.orderStatus) {
    const status = ORDER_STATUS_LABELS[order.orderStatus] ?? { en: order.orderStatus, bn: order.orderStatus };
    stateRows.push({ label: bn ? "অর্ডার" : "Order", value: bn ? status.bn : status.en, color: INK });
  }

  const stateValueW = 120;
  const stateValueX = right - GUTTER - stateValueW;
  const stateLabelW = 72;
  const stateLabelX = stateValueX - 10 - stateLabelW;

  doc.font(BOLD).fontSize(12);
  let cardH = cardPadY + 8 + 3 + doc.heightOfString(order.customerName, { width: detailW });
  const detailLines = [order.customerPhone, order.customerAddress].filter(Boolean) as string[];
  doc.font(REGULAR).fontSize(9.5);
  for (const line of detailLines) cardH += doc.heightOfString(line, { width: detailW });
  cardH = Math.max(cardH + cardPadY, cardPadY * 2 + stateRows.length * 15, 58);

  doc.rect(left, y, width, cardH).lineWidth(0.6).stroke(EDGE);
  // A green spine down the left edge, echoing the rule above.
  doc.rect(left, y, 3, cardH).fill(GREEN);

  doc
    .font(BOLD)
    .fontSize(7.5)
    .fillColor(GREEN)
    .text(bn ? "ক্রেতা" : "BILL TO", cardTextX, y + cardPadY, { width: detailW, characterSpacing: 0.8 });
  let cardY = doc.y + 3;
  doc.font(BOLD).fontSize(12).fillColor(INK).text(order.customerName, cardTextX, cardY, { width: detailW });
  cardY = doc.y;
  for (const line of detailLines) {
    doc.font(REGULAR).fontSize(9.5).fillColor(MUTED).text(line, cardTextX, cardY, { width: detailW });
    cardY = doc.y;
  }

  let stateY = y + cardPadY + 1;
  for (const row of stateRows) {
    doc
      .font(REGULAR)
      .fontSize(9)
      .fillColor(MUTED)
      .text(row.label, stateLabelX, stateY + 1, { width: stateLabelW, align: "right", lineBreak: false });
    doc
      .font(BOLD)
      .fontSize(10)
      .fillColor(row.color)
      .text(row.value, stateValueX, stateY, { width: stateValueW, align: "right", lineBreak: false });
    stateY += 15;
  }

  y += cardH + 18;

  /* -------------------------------------------------------------- table */
  // Fixed widths from the right; the product column absorbs the remainder,
  // so money never drifts out of alignment.
  const wAmount = 80;
  const wRate = 70;
  const wUnit = 50;
  const wQty = 50;
  const xAmount = right - wAmount;
  const xRate = xAmount - wRate;
  const xUnit = xRate - wUnit;
  const xQty = xUnit - wQty;
  const wName = xQty - left - GUTTER - 8;

  const header = bn
    ? { name: "পণ্য", qty: "পরিমাণ", unit: "একক", rate: "দর", amount: "মোট" }
    : { name: "Product", qty: "Qty", unit: "Unit", rate: "Rate", amount: "Amount" };

  const drawTableHeader = (top: number) => {
    doc.rect(left, top, width, 24).fill(GREEN_DEEP);
    doc.font(BOLD).fontSize(8.5).fillColor(PAPER);
    doc.text(header.name, left + GUTTER, top + 8, { width: wName, lineBreak: false });
    doc.text(header.qty, xQty, top + 8, { width: wQty, align: "right", lineBreak: false });
    doc.text(header.unit, xUnit + 8, top + 8, { width: wUnit - 8, lineBreak: false });
    doc.text(header.rate, xRate, top + 8, { width: wRate, align: "right", lineBreak: false });
    doc.text(header.amount, xAmount, top + 8, { width: wAmount - GUTTER, align: "right", lineBreak: false });
    return top + 24;
  };

  let tableTop = y;
  y = drawTableHeader(y);

  /*
    Ruled like a ledger rather than floating on the page: a single hairline
    box around the header and its rows, drawn last so it sits over the row
    fills. Reopened on every sheet, because the box has to close at whatever
    row the page happened to break on.
  */
  const closeTable = (bottom: number) => {
    doc.rect(left, tableTop, width, bottom - tableTop).lineWidth(0.6).stroke(EDGE);
  };

  /*
    Rows may run to just above the footer. The totals block is what needs
    headroom, and it asks for it once, after the last row — reserving that
    space on every page would strand half a page of white under a long order.
  */
  const rowLimit = doc.page.height - doc.page.margins.bottom - 48;
  const continued = `${order.orderNo} · ${bn ? "চলমান" : "continued"}`;

  /** Slim masthead for a second and subsequent sheet of the same receipt. */
  const drawContinuation = () => {
    const top = doc.page.margins.top;
    doc.font(BOLD).fontSize(10).fillColor(GREEN_DEEP).text(shop.name, left, top, {
      width: width * 0.5,
      lineBreak: false,
    });
    doc
      .font(REGULAR)
      .fontSize(9)
      .fillColor(MUTED)
      .text(continued, left + width * 0.5, top + 1, { width: width * 0.5, align: "right", lineBreak: false });
    const ruleY = top + 16;
    doc.rect(left, ruleY, width, 1.5).fill(GREEN_LEAF);
    return ruleY + 14;
  };

  doc.font(REGULAR).fontSize(10);

  for (const item of order.items) {
    // Measure first: the row is as tall as its tallest cell, which is what
    // stops long product names from colliding with the row beneath.
    const nameHeight = doc.heightOfString(item.productName, { width: wName });
    const rowHeight = Math.max(nameHeight, 12) + 12;

    if (y + rowHeight > rowLimit) {
      closeTable(y);
      drawFooter(continued, MUTED);
      doc.addPage();
      drawSeal();
      tableTop = drawContinuation();
      y = drawTableHeader(tableTop);
      doc.font(REGULAR).fontSize(10);
    }

    const amount = item.quantity * item.unitPrice;
    doc.font(REGULAR).fontSize(10).fillColor(INK).text(item.productName, left + GUTTER, y + 6, { width: wName });
    doc.fillColor(MUTED).text(formatQty(item.quantity, bn), xQty, y + 6, { width: wQty, align: "right" });
    doc.text(item.unit, xUnit + 8, y + 6, { width: wUnit - 8 });
    doc.text(money(item.unitPrice), xRate, y + 6, { width: wRate, align: "right" });
    doc.font(BOLD).fillColor(INK).text(money(amount), xAmount, y + 6, { width: wAmount - GUTTER, align: "right" });

    y += rowHeight;
    doc.strokeColor(EDGE).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
  }
  closeTable(y);

  /* ------------------------------------------------------------- totals */
  const bandX = xUnit;
  const labelX = bandX;
  const labelW = right - bandX - GUTTER - wAmount;

  /*
    Measured up front so the block is never split across a page boundary: a
    grand total on a sheet of its own, or worse, a total separated from the
    balance still owed, is exactly the kind of receipt that gets disputed.
  */
  const summaryRows = 1 + (order.discount > 0 ? 1 : 0) + (order.deliveryCharge > 0 ? 1 : 0);
  const balanceRows =
    order.paymentStatus === "partial" && order.paidAmount !== undefined
      ? 2
      : order.paymentStatus === "due"
        ? 1
        : 0;
  doc.font(REGULAR).fontSize(9);
  const noteHeight = order.note ? doc.heightOfString(order.note, { width: bandX - left - 20 }) + 16 : 0;
  const totalsHeight =
    14 + Math.max(summaryRows * 16 + 40 + balanceRows * 17, noteHeight) + 46;

  if (y + totalsHeight > rowLimit) {
    drawFooter(continued, MUTED);
    doc.addPage();
    drawSeal();
    y = drawContinuation();
  }

  y += 14;
  // Remembered before the totals column advances `y`, so the notes on the
  // left start level with the totals instead of at a guessed offset.
  const totalsTop = y;

  const totalRow = (label: string, value: string, color = MUTED, valueColor = INK, size = 10) => {
    doc
      .font(REGULAR)
      .fontSize(size)
      .fillColor(color)
      .text(label, labelX, y, { width: labelW, align: "right" });
    doc
      .font(BOLD)
      .fontSize(size)
      .fillColor(valueColor)
      .text(value, xAmount, y, { width: wAmount - GUTTER, align: "right" });
    y += size + 6;
  };

  totalRow(bn ? "সাবটোটাল" : "Subtotal", money(order.subtotal));
  if (order.discount > 0) {
    totalRow(bn ? "ডিসকাউন্ট" : "Discount", `− ${money(order.discount)}`, MUTED, CORAL_DEEP);
  }
  if (order.deliveryCharge > 0) {
    totalRow(bn ? "ডেলিভারি চার্জ" : "Delivery", money(order.deliveryCharge));
  }

  // The grand total gets the brand band; everything above it is arithmetic.
  y += 2;
  doc.rect(bandX, y, right - bandX, 30).fill(GREEN_DEEP);
  doc
    .font(BOLD)
    .fontSize(10)
    .fillColor(PAPER)
    .text(bn ? "সর্বমোট" : "TOTAL", bandX + GUTTER, y + 10, {
      width: labelW - GUTTER,
      align: "left",
      lineBreak: false,
    });
  doc
    .font(BOLD)
    .fontSize(14)
    .fillColor(PAPER)
    .text(money(order.total), xAmount, y + 8, { width: wAmount - GUTTER, align: "right", lineBreak: false });
  y += 38;

  /*
    A partly-paid order is the one case where the total is not the number the
    customer cares about — what they still owe is. Both are printed so the
    receipt doubles as a record of the balance, and the balance is the only
    figure allowed to wear the coral.
  */
  if (order.paymentStatus === "partial" && order.paidAmount !== undefined) {
    totalRow(bn ? "পরিশোধিত" : "Paid", money(order.paidAmount), MUTED, GREEN_DEEP);
    totalRow(bn ? "বাকি" : "Due", money(order.total - order.paidAmount), CORAL_DEEP, CORAL_DEEP, 11);
  } else if (order.paymentStatus === "due") {
    totalRow(bn ? "বাকি" : "Due", money(order.total), CORAL_DEEP, CORAL_DEEP, 11);
  }

  /* ------------------------------------------------- notes and signature */
  const noteW = bandX - left - 20;
  let leftY = totalsTop;
  if (order.note) {
    doc
      .font(BOLD)
      .fontSize(7.5)
      .fillColor(GREEN)
      .text(bn ? "নোট" : "NOTE", left, leftY, { width: noteW, characterSpacing: 0.8 });
    leftY = doc.y + 2;
    doc.font(REGULAR).fontSize(9).fillColor(MUTED).text(order.note, left, leftY, { width: noteW });
    leftY = doc.y;
  }

  /*
    Signature line: below both columns, so it can never land on top of a long
    note or a tall totals block — but on a short receipt it drops to just
    above the footer, where a signature belongs, instead of floating in the
    middle of the page.
  */
  const footerY = doc.page.height - doc.page.margins.bottom - 30;
  const signY = Math.max(Math.max(y, leftY) + 26, footerY - 46);
  doc.strokeColor(EDGE).lineWidth(0.75).moveTo(left, signY).lineTo(left + 150, signY).stroke();
  doc
    .font(REGULAR)
    .fontSize(8)
    .fillColor(MUTED)
    .text(bn ? "অনুমোদিত স্বাক্ষর" : "Authorised signature", left, signY + 5, { width: 150 });

  /* ------------------------------------------------------------- footer */
  drawFooter(bn ? "ধন্যবাদ — আবার আসবেন।" : "Thank you for your business.", GREEN_DEEP);
}
