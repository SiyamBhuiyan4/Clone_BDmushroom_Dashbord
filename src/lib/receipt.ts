/*
  Receipt layout.

  Deliberately free of React, Convex and the DOM: it takes a PDFKit document
  plus plain data, so the identical code can be rendered in the browser for a
  download and in Node for a visual check. A layout that can only be seen by
  clicking through the app is a layout nobody verifies.

  Everything is measured before it is drawn. The requirement is that long
  product and customer names wrap rather than overflow, that nothing overlaps,
  and that nothing is clipped — none of which survives fixed row heights.
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
  orderStatus?: string;
  note?: string;
};

export type ShopInfo = {
  name: string;
  tagline?: string;
  phone?: string;
  address?: string;
  website?: string;
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
  stroke(): Doc;
  rect(x: number, y: number, w: number, h: number): Doc;
  fill(color?: string): Doc;
  heightOfString(text: string, options?: Record<string, unknown>): number;
  addPage(options?: Record<string, unknown>): Doc;
};

const REGULAR = "bn";
const BOLD = "bnb";

const INK = "#111111";
const MUTED = "#666666";
const RULE = "#cccccc";
const BAND = "#f2f2f2";

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

  /* ------------------------------------------------------------- header */
  doc.font(BOLD).fontSize(20).fillColor(INK).text(shop.name, left, doc.page.margins.top, {
    width: width * 0.62,
  });
  const headerTop = doc.page.margins.top;
  let y = doc.y;

  if (shop.tagline) {
    doc.font(REGULAR).fontSize(9.5).fillColor(MUTED).text(shop.tagline, left, y, {
      width: width * 0.62,
    });
    y = doc.y;
  }
  const contact = [shop.phone, shop.address, shop.website].filter(Boolean).join("  ·  ");
  if (contact) {
    doc.font(REGULAR).fontSize(9).fillColor(MUTED).text(contact, left, y, { width: width * 0.62 });
    y = doc.y;
  }

  // Title and order meta, right-aligned against the header block.
  doc.font(BOLD).fontSize(16).fillColor(INK).text(bn ? "রসিদ" : "RECEIPT", left, headerTop, {
    width,
    align: "right",
  });
  doc
    .font(REGULAR)
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(order.orderNo, left, headerTop + 22, { width, align: "right" })
    .text(formatDate(order.orderedAt, bn), left, headerTop + 35, { width, align: "right" });

  y = Math.max(y, headerTop + 50) + 10;
  doc.strokeColor(RULE).lineWidth(1).moveTo(left, y).lineTo(right, y).stroke();
  y += 14;

  /* ----------------------------------------------------------- customer */
  doc.font(BOLD).fontSize(10).fillColor(INK).text(bn ? "ক্রেতা" : "Customer", left, y);
  y = doc.y + 2;
  doc.font(REGULAR).fontSize(11).fillColor(INK).text(order.customerName, left, y, {
    width: width * 0.6,
  });
  y = doc.y;
  const lines = [order.customerPhone, order.customerAddress].filter(Boolean) as string[];
  for (const line of lines) {
    doc.font(REGULAR).fontSize(9.5).fillColor(MUTED).text(line, left, y, { width: width * 0.6 });
    y = doc.y;
  }
  y += 12;

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
  const wName = xQty - left - 8;

  const header = bn
    ? { name: "পণ্য", qty: "পরিমাণ", unit: "একক", rate: "দর", amount: "মোট" }
    : { name: "Product", qty: "Qty", unit: "Unit", rate: "Rate", amount: "Amount" };

  const drawTableHeader = (top: number) => {
    doc.rect(left, top, width, 22).fill(BAND);
    doc.font(BOLD).fontSize(9).fillColor(INK);
    doc.text(header.name, left + 6, top + 7, { width: wName });
    doc.text(header.qty, xQty, top + 7, { width: wQty, align: "right" });
    doc.text(header.unit, xUnit + 6, top + 7, { width: wUnit - 6 });
    doc.text(header.rate, xRate, top + 7, { width: wRate, align: "right" });
    doc.text(header.amount, xAmount, top + 7, { width: wAmount, align: "right" });
    return top + 22;
  };

  y = drawTableHeader(y);

  const bottomLimit = doc.page.height - doc.page.margins.bottom - 130;
  doc.font(REGULAR).fontSize(10);

  for (const item of order.items) {
    // Measure first: the row is as tall as its tallest cell, which is what
    // stops long product names from colliding with the row beneath.
    const nameHeight = doc.heightOfString(item.productName, { width: wName });
    const rowHeight = Math.max(nameHeight, 12) + 10;

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawTableHeader(y);
      doc.font(REGULAR).fontSize(10);
    }

    const amount = item.quantity * item.unitPrice;
    doc.fillColor(INK).text(item.productName, left + 6, y + 5, { width: wName });
    doc.text(formatQty(item.quantity, bn), xQty, y + 5, { width: wQty, align: "right" });
    doc.text(item.unit, xUnit + 6, y + 5, { width: wUnit - 6 });
    doc.text(money(item.unitPrice), xRate, y + 5, { width: wRate, align: "right" });
    doc.text(money(amount), xAmount, y + 5, { width: wAmount, align: "right" });

    y += rowHeight;
    doc.strokeColor(RULE).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
  }

  /* ------------------------------------------------------------- totals */
  y += 10;
  const labelX = xRate - 40;
  const labelW = wRate + 40;
  // Remembered before the totals column advances `y`, so the payment note on
  // the left starts level with the totals instead of at a guessed offset.
  const totalsTop = y;

  const totalRow = (label: string, value: string, bold = false) => {
    doc
      .font(bold ? BOLD : REGULAR)
      .fontSize(bold ? 12 : 10)
      .fillColor(bold ? INK : MUTED)
      .text(label, labelX, y, { width: labelW, align: "right" });
    doc
      .font(bold ? BOLD : REGULAR)
      .fillColor(INK)
      .text(value, xAmount, y, { width: wAmount, align: "right" });
    y += bold ? 20 : 15;
  };

  totalRow(bn ? "সাবটোটাল" : "Subtotal", money(order.subtotal));
  if (order.discount > 0) totalRow(bn ? "ডিসকাউন্ট" : "Discount", `− ${money(order.discount)}`);
  if (order.deliveryCharge > 0) {
    totalRow(bn ? "ডেলিভারি চার্জ" : "Delivery", money(order.deliveryCharge));
  }

  doc.strokeColor(RULE).lineWidth(1).moveTo(labelX, y).lineTo(right, y).stroke();
  y += 8;
  totalRow(bn ? "সর্বমোট" : "Total", money(order.total), true);

  /* ------------------------------------------------------------- footer */
  y += 6;
  const payment = PAYMENT_LABELS[order.paymentStatus] ?? { en: order.paymentStatus, bn: order.paymentStatus };
  doc
    .font(REGULAR)
    .fontSize(10)
    .fillColor(INK)
    .text(`${bn ? "পেমেন্ট" : "Payment"}: ${bn ? payment.bn : payment.en}`, left, totalsTop, {
      // Stop short of the totals column so the two can never collide,
      // however many total rows an order happens to have.
      width: labelX - left - 16,
    });

  if (order.note) {
    doc.font(REGULAR).fontSize(9).fillColor(MUTED).text(order.note, left, doc.y + 2, {
      width: labelX - left - 16,
    });
  }

  const footerY = doc.page.height - doc.page.margins.bottom - 28;
  doc.strokeColor(RULE).lineWidth(0.5).moveTo(left, footerY).lineTo(right, footerY).stroke();
  doc
    .font(REGULAR)
    .fontSize(9)
    .fillColor(MUTED)
    .text(bn ? "ধন্যবাদ — আবার আসবেন।" : "Thank you for your business.", left, footerY + 8, {
      width,
      align: "center",
    });
}
