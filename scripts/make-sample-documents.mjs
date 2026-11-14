// Generates the SAMPLE demo documents (MVP_SCOPE 9.2, DP-10) as PDFs from
// samples/sample-sets.json into public/samples/<scenario>/ (served for the
// "Try sample documents" section). All content is fictional and marked "SAMPLE".
// No dependencies: writes plain PDF 1.4 with a real text layer (Helvetica).
//
//   npm run samples
//
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("samples/sample-sets.json", "utf8"));
const { shared } = data;
const OUT = "public/samples";

const fmt = (n, decimals = 2) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// ---------- tiny PDF page builder -------------------------------------------

const W = 595; // A4 width in points
const H = 842;
const M = 48;
const esc = (s) => String(s).replace(/[\\()]/g, (c) => "\\" + c);

class Page {
  ops = [];
  text(x, y, str, { size = 10, bold = false, gray = 0 } = {}) {
    this.ops.push(`BT ${gray} g /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${esc(str)}) Tj ET`);
  }
  textRight(xRight, y, str, opts = {}) {
    const size = opts.size ?? 10;
    this.text(xRight - String(str).length * size * (opts.bold ? 0.58 : 0.53), y, str, opts);
  }
  line(x1, y1, x2, y2, { width = 0.6, gray = 0.6 } = {}) {
    this.ops.push(`${gray} G ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }
  rect(x, y, w, h, { fill = null, stroke = 0.6 } = {}) {
    if (fill !== null) this.ops.push(`${fill} g ${x} ${y} ${w} ${h} re f`);
    if (stroke !== null) this.ops.push(`${stroke} G 0.6 w ${x} ${y} ${w} ${h} re S`);
  }
  watermark() {
    this.ops.unshift("q 0.92 g BT /F2 130 Tf 0.7071 0.7071 -0.7071 0.7071 120 230 Tm (SAMPLE) Tj ET Q");
  }
}

function writePdf(path, page, title) {
  const stream = page.ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${esc(title)}) /Producer (ClearGateAI sample generator) /Subject (SAMPLE - fictional data) >>`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(path, out, "latin1");
}

// ---------- shared parts -----------------------------------------------------

function header(p, title, number) {
  p.watermark();
  p.rect(M, H - 70, W - 2 * M, 22, { fill: 0.15, stroke: null });
  p.text(M + 10, H - 63, "SAMPLE DOCUMENT  -  FICTIONAL DATA  -  NOT A REAL TRANSACTION", { size: 9, bold: true, gray: 1 });
  p.text(M, H - 110, title, { size: 20, bold: true });
  p.textRight(W - M, H - 104, `No. ${number}`, { size: 10, bold: true });
  p.textRight(W - M, H - 118, `Date: ${shared.date}`, { size: 10 });
  p.line(M, H - 130, W - M, H - 130, { gray: 0.2, width: 1 });
}

/** Seller and buyer blocks with their identifying details; returns the y below them. */
function parties(p, y) {
  const s = shared.seller, b = shared.buyer;
  p.text(M, y, "SELLER / EXPORTER", { size: 8, bold: true, gray: 0.4 });
  p.text(W / 2, y, "BUYER / IMPORTER", { size: 8, bold: true, gray: 0.4 });
  const left = [s.name, ...s.address, s.taxId, `Tel: ${s.phone}`, `E-mail: ${s.email}`];
  const right = [b.name, ...b.address, b.taxId, `Tel: ${b.phone}`, `E-mail: ${b.email}`];
  left.forEach((l, i) => p.text(M, y - 15 - i * 12, l, { size: 9, bold: i === 0 }));
  right.forEach((l, i) => p.text(W / 2, y - 15 - i * 12, l, { size: 9, bold: i === 0 }));
  return y - 15 - Math.max(left.length, right.length) * 12 - 6;
}

function table(p, y, cols, rows) {
  p.rect(M, y - 6, W - 2 * M, 20, { fill: 0.93, stroke: null });
  cols.forEach((c) => (c.right ? p.textRight(c.x, y, c.label, { size: 8, bold: true }) : p.text(c.x, y, c.label, { size: 8, bold: true })));
  let yy = y - 24;
  for (const row of rows) {
    row.forEach((cell, i) => (cols[i].right ? p.textRight(cols[i].x, yy, cell, { size: 9 }) : p.text(cols[i].x, yy, cell, { size: 9 })));
    yy -= 16;
  }
  p.line(M, yy + 6, W - M, yy + 6);
  return yy - 10;
}

function totals(p, y, lines) {
  const xLabel = W / 2 + 10;
  lines.filter(Boolean).forEach(([label, value], i, all) => {
    p.text(xLabel, y - i * 16, label, { size: 10, bold: i === all.length - 1 });
    p.textRight(W - M, y - i * 16, value, { size: 10, bold: true });
  });
  return y - lines.filter(Boolean).length * 16;
}

function footer(p) {
  p.line(M, 80, W - M, 80);
  p.text(M, 66, "All names, numbers, tax IDs and bank details in this document are fictional and prepared for a ClearGateAI demonstration.", { size: 7.5, gray: 0.35 });
  p.text(M, 55, "The HS code is an illustrative placeholder, not a real classification. Not an official form.", { size: 7.5, gray: 0.35 });
}

// ---------- the three documents ---------------------------------------------

function invoice(d) {
  const p = new Page();
  header(p, "COMMERCIAL INVOICE", d.number);
  let y = parties(p, H - 155);
  p.text(M, y, "Terms: FOB (sample)    Payment: 30 days (sample)    Country of origin: Sampleland", { size: 9, gray: 0.3 });
  y = table(p, y - 30, [
    { label: "DESCRIPTION OF GOODS", x: M + 6 },
    { label: "HS CODE", x: 300 },
    { label: "QTY (CTN)", x: 385, right: true },
    { label: `UNIT PRICE (${shared.currency})`, x: 480, right: true },
    { label: `AMOUNT (${shared.currency})`, x: W - M - 6, right: true },
  ], [[shared.goods, d.hsCode ?? "", String(d.cartons), fmt(shared.unitPrice), d.total === null ? "" : fmt(d.total)]]);
  const after = totals(p, y - 10, [
    ["Total quantity:", `${d.cartons} cartons`],
    ["Total net weight:", `${fmt(d.netKg)} kg`],
    ["Total gross weight:", `${fmt(d.grossKg)} kg`],
    d.total === null ? null : ["TOTAL AMOUNT:", `${fmt(d.total)} ${shared.currency}`],
  ]);
  const s = shared.seller;
  p.text(M, after - 24, "BANK DETAILS OF THE SELLER", { size: 8, bold: true, gray: 0.4 });
  [s.bank, s.iban, s.swift, s.contact].forEach((l, i) => p.text(M, after - 39 - i * 12, l, { size: 9 }));
  footer(p);
  return p;
}

function packingList(d, invoiceNumber) {
  const p = new Page();
  header(p, "PACKING LIST", d.number);
  let y = parties(p, H - 155);
  p.text(M, y, `Invoice reference: ${invoiceNumber}    Marks: SAMPLE/1-${d.cartons}`, { size: 9, gray: 0.3 });
  y = table(p, y - 30, [
    { label: "DESCRIPTION OF GOODS", x: M + 6 },
    ...(d.hsCode === null ? [] : [{ label: "HS CODE", x: 300 }]),
    { label: "CARTONS", x: 400, right: true },
    { label: "NET (KG)", x: 470, right: true },
    { label: "GROSS (KG)", x: W - M - 6, right: true },
  ], [[shared.goods, ...(d.hsCode === null ? [] : [d.hsCode]), String(d.cartons), fmt(d.netKg), fmt(d.grossKg)]]);
  totals(p, y - 10, [
    ["Total packages:", `${d.cartons} cartons`],
    ["Total net weight:", `${fmt(d.netKg)} kg`],
    ["Total gross weight:", `${fmt(d.grossKg)} kg`],
    d.total === null ? null : ["Declared value:", `${fmt(d.total)} ${shared.currency}`],
  ]);
  footer(p);
  return p;
}

function customsDocument(d, invoiceNumber) {
  const p = new Page();
  header(p, "CUSTOMS DECLARATION", d.number);
  p.text(M, H - 150, "Generic sample layout for demonstration. Not an official form of any customs authority.", { size: 9, gray: 0.3 });
  const s = shared.seller, b = shared.buyer, dc = shared.declarant;
  const boxes = [
    ["2  Consignor / Exporter", [s.name, s.address[0], s.taxId]],
    ["8  Consignee", [b.name, b.address[0], b.taxId]],
    ["14  Declarant", [dc.name, dc.taxId, dc.contact]],
    ["44  Documents produced", [`Invoice ${invoiceNumber}`]],
    ["31  Description of goods", [shared.goods]],
    ...(d.hsCode === null ? [] : [["33  Commodity code (HS)", [d.hsCode]]]),
    ["6  Total packages", [`${d.cartons} cartons`]],
    ["35  Gross mass (kg)", [fmt(d.grossKg)]],
    ["38  Net mass (kg)", [fmt(d.netKg)]],
    ...(d.total === null ? [] : [["22  Currency and total invoiced amount", [`${shared.currency} ${fmt(d.total)}`]]]),
  ];
  const colW = (W - 2 * M) / 2;
  const boxH = 54;
  boxes.forEach(([label, lines], i) => {
    const x = M + (i % 2) * colW;
    const y = H - 175 - (Math.floor(i / 2) + 1) * boxH;
    p.rect(x, y, colW, boxH);
    p.text(x + 6, y + boxH - 13, label, { size: 7.5, bold: true, gray: 0.4 });
    lines.forEach((l, j) => p.text(x + 6, y + boxH - 27 - j * 11, l, { size: 9, bold: j === 0 && i >= 4 }));
  });
  footer(p);
  return p;
}

// ---------- write ------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
for (const set of data.sets) {
  const { invoice: inv, packingList: pl, customsDocument: cd } = set.documents;
  const dir = `${OUT}/${set.id}`;
  mkdirSync(dir, { recursive: true });
  writePdf(`${dir}/1-invoice.pdf`, invoice(inv), `SAMPLE commercial invoice ${inv.number}`);
  writePdf(`${dir}/2-packing-list.pdf`, packingList(pl, inv.number), `SAMPLE packing list ${pl.number}`);
  writePdf(`${dir}/3-customs-declaration.pdf`, customsDocument(cd, inv.number), `SAMPLE customs declaration ${cd.number}`);
  console.log(`wrote ${dir}/ (3 PDFs) - ${set.title}`);
}
