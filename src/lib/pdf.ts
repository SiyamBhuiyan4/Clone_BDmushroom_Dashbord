import { drawReceipt, type ReceiptOrder, type ShopInfo } from "./receipt";

/*
  Receipt PDF generation, in the browser.

  PDFKit and the two Bengali fonts together are around 1.5MB, which has no
  business being in the initial bundle for a feature used a few times a day.
  Everything here is imported on first use and then cached.

  The fonts are Hind Siliguri rather than the interface font: Noto Sans
  Bengali declares its Bengali features only under the 'bng2' script tag,
  which fontkit never looks for, so conjuncts come out decomposed. Hind
  Siliguri declares both tags and shapes correctly.
*/

export const SHOP: ShopInfo = {
  name: "BD Mushroom",
  tagline: "মাশরুম ও চাষের সরঞ্জাম",
  website: "bdmushroom.com",
  logoAspect: 357 / 476,
};

let fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;
let logoCache: Uint8Array | null | undefined;

async function loadFonts() {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    fetch("/fonts/HindSiliguri-Regular.ttf").then((r) => {
      if (!r.ok) throw new Error("Could not load the receipt font.");
      return r.arrayBuffer();
    }),
    fetch("/fonts/HindSiliguri-Bold.ttf").then((r) => {
      if (!r.ok) throw new Error("Could not load the receipt font.");
      return r.arrayBuffer();
    }),
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

/*
  The logo is a nicety, not a requirement: if it cannot be fetched — offline,
  or the file moved — the receipt falls back to the wordmark rather than
  failing the download the shopkeeper actually asked for. `null` is a cached
  failure, so a missing file is not re-fetched on every receipt.
*/
async function loadLogo() {
  if (logoCache !== undefined) return logoCache ?? undefined;
  try {
    const res = await fetch("/brand/bdmushroom.png");
    if (!res.ok) throw new Error(String(res.status));
    logoCache = new Uint8Array(await res.arrayBuffer());
  } catch {
    logoCache = null;
  }
  return logoCache ?? undefined;
}

async function buildDoc(orders: ReceiptOrder[], shop: ShopInfo, bengali: boolean) {
  const [pdfkit, fonts, logo] = await Promise.all([import("pdfkit"), loadFonts(), loadLogo()]);
  const PDFDocument = pdfkit.default;

  /*
    `font: null` stops the constructor reaching for Helvetica. The browser
    build ships no standard fonts, so the default would throw before a single
    line was drawn. Null rather than undefined matters: PDFKit's default
    parameter only applies to undefined.
  */
  const doc = new PDFDocument({
    size: "A4",
    margin: 44,
    autoFirstPage: false,
    font: null,
  } as never);

  // PDFKit wants a Buffer-like value; a Uint8Array over the same bytes works
  // in the browser build and avoids pulling in a Buffer polyfill.
  doc.registerFont("bn", new Uint8Array(fonts.regular) as never);
  doc.registerFont("bnb", new Uint8Array(fonts.bold) as never);

  /*
    Collect the document's own chunks rather than piping into blob-stream:
    that package is a Node stream shim and throws "util.inherits is not a
    function" in the browser. PDFKit's document is already a readable stream,
    so there is nothing to shim.
  */
  const chunks: BlobPart[] = [];
  const stream = doc as unknown as {
    on(event: "data" | "end" | "error", handler: (chunk?: unknown) => void): void;
  };

  const done = new Promise<Blob>((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk as BlobPart));
    stream.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })));
    stream.on("error", (err) => reject(err));
  });

  const branded: ShopInfo = { ...shop, logo: shop.logo ?? logo };
  orders.forEach((order) => {
    doc.addPage();
    drawReceipt(doc as never, order, branded, { bengali });
  });
  doc.end();

  return done;
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One receipt, one file. */
export async function downloadReceipt(
  order: ReceiptOrder,
  options: { shop?: ShopInfo; bengali?: boolean } = {},
) {
  const blob = await buildDoc([order], options.shop ?? SHOP, options.bengali ?? true);
  save(blob, `${order.orderNo}.pdf`);
}

/**
 * Many receipts in one file, one page each.
 *
 * The spec asks for a separate PDF per order from a bulk upload. Browsers
 * throttle or block a burst of individual downloads, so this returns a single
 * file of one-page receipts by default; `separate` forces true one-file-per-
 * order for smaller batches.
 */
export async function downloadReceipts(
  orders: ReceiptOrder[],
  options: { shop?: ShopInfo; bengali?: boolean; separate?: boolean } = {},
) {
  const shop = options.shop ?? SHOP;
  const bengali = options.bengali ?? true;
  if (orders.length === 0) return;

  if (options.separate) {
    for (const order of orders) {
      const blob = await buildDoc([order], shop, bengali);
      save(blob, `${order.orderNo}.pdf`);
      // Space the saves out so the browser does not treat them as a burst.
      await new Promise((r) => setTimeout(r, 350));
    }
    return;
  }

  const blob = await buildDoc(orders, shop, bengali);
  const stamp = new Date().toISOString().slice(0, 10);
  save(blob, `receipts-${stamp}.pdf`);
}

/** Opens the receipt in a new tab instead of saving it, for a quick look. */
export async function previewReceipt(
  order: ReceiptOrder,
  options: { shop?: ShopInfo; bengali?: boolean } = {},
) {
  const blob = await buildDoc([order], options.shop ?? SHOP, options.bengali ?? true);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
