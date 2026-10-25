import { it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { csv, xlsx, pdf, safeCell } from "../lib/exports";
it("escapes CSV quotations, newlines and formula injection", () => {
  const result = csv([{ name: '=HYPERLINK("evil")', notes: "a\nb" }]);
  expect(result).toContain("'=HYPERLINK");
  expect(result).toContain('"a\nb"');
  expect(safeCell(" @SUM(A1)")).toBe("' @SUM(A1)");
});
it("creates a readable PDF with pagination", async () => {
  const data = await pdf(
    "Payroll",
    Array.from({ length: 100 }, (_, i) => ({
      employee: `Employee ${i}`,
      net: "276.92",
    })),
  );
  const parsed = await PDFDocument.load(data);
  expect(parsed.getPageCount()).toBeGreaterThan(1);
  expect(parsed.getTitle()).toBe("Payroll");
});
it("creates a valid XLSX container with escaped text and numeric cells", async () => {
  const zip = await JSZip.loadAsync(
    await xlsx([{ name: "A&B <test>", net: 276.92, input: "=1+1" }]),
  );
  expect(zip.file("[Content_Types].xml")).not.toBeNull();
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  expect(sheet).toContain("A&amp;B &lt;test&gt;");
  expect(sheet).toContain("<v>276.92</v>");
  expect(sheet).not.toContain("<f>");
});
it("exports empty reports and long multiline records without page overflow errors", async () => {
  const empty = await PDFDocument.load(await pdf("Empty attendance", []));
  expect(empty.getPageCount()).toBe(1);
  const long = await PDFDocument.load(
    await pdf("Employee profile", [
      {
        name: "Sample employee",
        notes: "Long supporting explanation\n".repeat(300),
      },
    ]),
  );
  expect(long.getPageCount()).toBeGreaterThan(1);
});
it("paginates wide tables using column groups and repeated headers", async () => {
  const rows = Array.from({ length: 65 }, (_, index) => ({
    employee: `Employee ${index}`,
    branch: "Test branch",
    scheduled: 26,
    worked: 24,
    late: 1,
    leave: 2,
    net: 276.92,
    currency: "USD",
  }));
  const report = await PDFDocument.load(
    await pdf("Attendance and payroll", rows),
  );
  expect(report.getPageCount()).toBeGreaterThan(2);
  expect(report.getAuthor()).toBe("Maamul HR");
});
