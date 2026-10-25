import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanRecord } from "./display-records";
export type ExportRow = Record<string, unknown>;
const value = (x: unknown) =>
  x == null ? "" : typeof x === "object" ? JSON.stringify(x) : String(x);
/** Prevent spreadsheet formula execution from employee-controlled values. */
export function safeCell(x: unknown) {
  const s = value(x);
  return /^[\s]*[=+@\-]/.test(s) ? `'${s}` : s;
}
export function csv(rows: ExportRow[], columns = Object.keys(rows[0] ?? {})) {
  const q = (s: unknown) => `"${safeCell(s).replaceAll('"', '""')}"`;
  return (
    "\ufeff" +
    [
      columns.map(q).join(","),
      ...rows.map((r) => columns.map((c) => q(r[c])).join(",")),
    ].join("\r\n")
  );
}
const xml = (x: unknown) =>
  safeCell(x)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
/** Minimal OOXML workbook with inline strings; no macros, formulas or external dependencies. */
export async function xlsx(
  rows: ExportRow[],
  columns = Object.keys(rows[0] ?? {}),
) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  const data = [Object.fromEntries(columns.map((c) => [c, c])), ...rows];
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data.map((r, i) => `<row r="${i + 1}">${columns.map((c) => (typeof r[c] === "number" && Number.isFinite(r[c]) ? `<c><v>${r[c]}</v></c>` : `<c t="inlineStr"><is><t xml:space="preserve">${xml(r[c])}</t></is></c>`)).join("")}</row>`).join("")}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
export async function pdf(title: string, rows: ExportRow[]) {
  rows = rows.map(cleanRecord);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(
    await readFile(join(process.cwd(), "public", "logo.png")),
  );
  const navy = rgb(0.08, 0.17, 0.26),
    green = rgb(0.09, 0.43, 0.34);
  const muted = rgb(0.31, 0.38, 0.45),
    border = rgb(0.87, 0.91, 0.93);
  const generated = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Mogadishu",
  }).format(new Date());
  let page = doc.addPage([595.28, 841.89]),
    y = 0;
  const latin = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
  function wrap(text: string, width: number, size: number, face = font) {
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/).map(latin)) {
      let line = "";
      for (const character of paragraph) {
        if (line && face.widthOfTextAtSize(line + character, size) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
      lines.push(line);
    }
    return lines;
  }
  function text(
    s: string,
    x: number,
    at: number,
    size = 11,
    strong = false,
    color = navy,
  ) {
    page.drawText(latin(s), {
      x,
      y: at,
      size,
      font: strong ? bold : font,
      color,
    });
  }
  function header() {
    page.drawRectangle({ x: 0, y: 833, width: 596, height: 9, color: green });
    const scaled = logo.scaleToFit(145, 46);
    page.drawImage(logo, {
      x: 40,
      y: 766,
      width: scaled.width,
      height: scaled.height,
    });
    text("PEOPLE & PAYROLL", 392, 791, 10, true, green);
    text("CONFIDENTIAL REPORT", 392, 775, 9, false, muted);
    page.drawLine({
      start: { x: 40, y: 750 },
      end: { x: 555, y: 750 },
      thickness: 1,
      color: border,
    });
    y = 719;
    for (const line of wrap(title, 515, 23, bold)) {
      text(line, 40, y, 23, true);
      y -= 29;
    }
    text(
      `Generated ${generated} (Africa/Mogadishu)`,
      40,
      y - 1,
      9,
      false,
      muted,
    );
    y -= 37;
  }
  function nextPage() {
    page = doc.addPage([595.28, 841.89]);
    header();
  }
  header();
  text(
    `${rows.length} ${rows.length === 1 ? "RECORD" : "RECORDS"}  /  AUTHORIZED EXPORT`,
    40,
    y,
    9,
    true,
    green,
  );
  y -= 26;
  const labelFor = (key: string) =>
    key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cards = [
    {
      label: "Records included",
      value: String(rows.length),
      note: "Selected export records",
    },
    {
      label: "Report fields",
      value: String(fields.length),
      note: "All exported fields retained",
    },
    { label: "Access", value: "Private", note: "Authorized company records" },
  ];
  const financial = [
    "net_salary",
    "net",
    "remaining_payable",
    "remaining_salary",
  ].find((key) => rows[0]?.[key] != null);
  if (financial && rows.length === 1)
    cards[1] = {
      label: labelFor(financial),
      value: value(rows[0][financial]),
      note: rows[0].currency
        ? `Currency: ${value(rows[0].currency)}`
        : "As recorded in this report",
    };
  for (const [i, card] of cards.entries()) {
    const x = 40 + i * 176;
    page.drawRectangle({
      x,
      y: y - 84,
      width: 163,
      height: 88,
      color: i === 1 ? rgb(0.91, 0.96, 0.94) : rgb(0.95, 0.97, 0.99),
      borderColor: border,
      borderWidth: 0.7,
    });
    page.drawRectangle({
      x,
      y: y + 1,
      width: 163,
      height: 3,
      color: i === 1 ? green : navy,
    });
    text(card.label, x + 12, y - 18, 10, true, muted);
    let size = 23;
    while (size > 10 && bold.widthOfTextAtSize(latin(card.value), size) > 139)
      size--;
    const lines = wrap(card.value, 139, size, bold);
    text(lines[0], x + 12, y - 47, size, true, i === 1 ? green : navy);
    text(card.note, x + 12, y - 70, 7.5, false, muted);
  }
  y -= 113;
  if (fields.length) {
    // Column groups keep every field readable on A4; no data columns are dropped.
    for (let group = 0; group < fields.length; group += 4) {
      const identity = [
        "employee_name",
        "full_name",
        "employee_number",
        "name",
        "section",
      ].find((key) => fields.includes(key));
      const columns = fields.slice(group, group + 4);
      // Repeat the employee/section on every group so wide reports remain identifiable.
      if (group && identity && !columns.includes(identity))
        columns.unshift(identity);
      const width = 515 / columns.length;
      function tableHeader() {
        if (y < 160) nextPage();
        const labels = columns.map((key) =>
          wrap(labelFor(key), width - 20, 10, bold),
        );
        const height =
          Math.max(...labels.map((lines) => lines.length)) * 14 + 18;
        page.drawRectangle({
          x: 40,
          y: y - height,
          width: 515,
          height,
          color: navy,
        });
        labels.forEach((lines, col) =>
          lines.forEach((line, index) =>
            text(
              line,
              50 + col * width,
              y - 19 - index * 14,
              10,
              true,
              rgb(1, 1, 1),
            ),
          ),
        );
        y -= height;
      }
      if (group) {
        nextPage();
      }
      text(
        `RECORDS TABLE${fields.length > 4 ? ` | Fields ${group + 1}-${Math.min(group + 4, fields.length)}` : ""}`,
        40,
        y,
        11,
        true,
        green,
      );
      y -= 20;
      tableHeader();
      for (const [index, row] of rows.entries()) {
        const cells = columns.map((key) =>
          wrap(
            row[key] == null || row[key] === "" ? "-" : value(row[key]),
            width - 20,
            10,
          ),
        );
        const lineCount = Math.max(...cells.map((lines) => lines.length));
        for (let offset = 0; offset < lineCount;) {
          if (y < 112) {
            nextPage();
            tableHeader();
          }
          const fit = Math.max(
            1,
            Math.min(lineCount - offset, Math.floor((y - 76) / 15) - 1),
          );
          const height = fit * 15 + 16;
          page.drawRectangle({
            x: 40,
            y: y - height,
            width: 515,
            height,
            color: index % 2 === 0 ? rgb(0.95, 0.98, 0.97) : rgb(1, 1, 1),
          });
          cells.forEach((lines, col) => {
            for (let line = 0; line < fit; line++)
              if (lines[offset + line])
                text(
                  lines[offset + line],
                  50 + col * width,
                  y - 19 - line * 15,
                  10,
                  /^(net|gross|total|remaining)/.test(columns[col]),
                );
          });
          y -= height;
          page.drawLine({
            start: { x: 40, y },
            end: { x: 555, y },
            thickness: 0.5,
            color: border,
          });
          offset += fit;
        }
      }
      y -= 24;
    }
  }
  if (!rows.length) {
    page.drawRectangle({
      x: 40,
      y: y - 65,
      width: 515,
      height: 80,
      color: rgb(0.94, 0.97, 0.96),
    });
    text("No records in selected period.", 60, y - 20, 13, true, green);
  }
  for (const [index, sheet] of doc.getPages().entries()) {
    sheet.drawLine({
      start: { x: 40, y: 52 },
      end: { x: 555, y: 52 },
      thickness: 1,
      color: border,
    });
    sheet.drawText("MAAMUL HR  |  Private personnel information", {
      x: 40,
      y: 34,
      size: 8,
      font,
      color: muted,
    });
    const pagination = `${index + 1} / ${doc.getPageCount()}`;
    sheet.drawText(pagination, {
      x: 555 - font.widthOfTextAtSize(pagination, 9),
      y: 34,
      size: 9,
      font,
      color: muted,
    });
  }
  doc.setTitle(title);
  doc.setAuthor("Maamul HR");
  return doc.save();
}
