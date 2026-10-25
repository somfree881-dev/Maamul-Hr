import JSZip from "jszip";
import { z } from "zod";
import { session } from "@/lib/auth";
import { pdf } from "@/lib/exports";
import { failure } from "@/lib/http";
import { reportRecords } from "@/lib/report-records";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      company = z.uuid().parse(p.get("company")),
      id = z.uuid().parse(p.get("employee"));
    const { db } = await session(company);
    const { data: e, error } = await db
      .from("employees")
      .select("*")
      .eq("company_id", company)
      .eq("id", id)
      .single();
    if (error) throw new Error("Employee unavailable");
    const { data: documents, error: de } = await db
      .from("employee_documents")
      .select("*")
      .eq("company_id", company)
      .eq("employee_id", id);
    if (de) throw new Error(de.message);
    if (
      (documents ?? []).reduce((s, d) => s + Number(d.size_bytes), 0) >
      50 * 1024 * 1024
    )
      throw new Error("Archive exceeds 50 MB; download individual documents");
    const zip = new JSZip();
    delete e.user_id;
    zip.file(
      "employee-profile.pdf",
      await pdf("Employee profile", await reportRecords(db, company, [e])),
    );
    for (const d of documents ?? []) {
      const { data, error: download } = await db.storage
        .from("employee-documents")
        .download(d.storage_path);
      if (download || !data)
        throw new Error(
          "An authorized document could not be downloaded; no incomplete archive generated",
        );
      zip.file(
        `documents/${d.id}-${String(d.title)
          .replace(/[^a-zA-Z0-9 _.-]/g, "_")
          .slice(0, 80)}.${d.storage_path.split(".").at(-1)}`,
        await data.arrayBuffer(),
      );
    }
    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          employee: e.employee_number,
          documents: (documents ?? []).map((d) => ({
            id: d.id,
            title: d.title,
            type: d.document_type,
            expiration_date: d.expiration_date,
          })),
        },
        null,
        2,
      ),
    );
    return new Response(
      Buffer.from(
        await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
      ),
      {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="employee-${id}.zip"`,
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
