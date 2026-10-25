import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/auth";
import { checkOrigin, failure } from "@/lib/http";
const bucket = "employee-documents";
function validateMagic(bytes: Uint8Array, type: string) {
  return type === "application/pdf"
    ? Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-"
    : type === "image/png"
      ? Buffer.from(bytes.slice(0, 8)).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        )
      : type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : false;
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 11 * 1024 * 1024)
      throw new Error("File too large");
    const f = await request.formData();
    const company = z.uuid().parse(f.get("company_id")),
      employee = z.uuid().parse(f.get("employee_id"));
    const { db } = await session(company);
    const replacement = f.get("replace_id")
      ? z.uuid().parse(f.get("replace_id"))
      : null;
    let previousPath: string | undefined;
    if (replacement) {
      const { data: previous, error } = await db
        .from("employee_documents")
        .select("storage_path")
        .eq("company_id", company)
        .eq("employee_id", employee)
        .eq("id", replacement)
        .single();
      if (error) throw new Error("Replacement document unavailable");
      previousPath = previous.storage_path;
    }
    const metadata = {
      company_id: company,
      employee_id: employee,
      document_type: z.string().min(1).max(100).parse(f.get("document_type")),
      title: z.string().min(1).max(200).parse(f.get("title")),
      expiration_date: f.get("expiration_date")
        ? z.iso.date().parse(f.get("expiration_date"))
        : null,
      issue_date: f.get("issue_date")
        ? z.iso.date().parse(f.get("issue_date"))
        : null,
      notes: z.string().max(2000).nullable().parse(f.get("notes")),
    };
    const file = f.get("file");
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 10 * 1024 * 1024
    )
      throw new Error("Select a PDF, JPEG or PNG up to 10 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validateMagic(bytes, file.type))
      throw new Error("File type does not match its content");
    const path = `${company}/${employee}/${randomUUID()}.${file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg"}`;
    const { error: upload } = await db.storage
      .from(bucket)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (upload) throw new Error(upload.message);
    const values = {
      ...metadata,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    };
    const query = replacement
      ? db
          .from("employee_documents")
          .update(values)
          .eq("id", replacement)
          .eq("company_id", company)
          .eq("employee_id", employee)
      : db.from("employee_documents").insert(values);
    const { data, error } = await query.select("id").single();
    if (error) {
      await db.storage.from(bucket).remove([path]);
      throw new Error(error.message);
    }
    const cleanup = previousPath
      ? await db.storage.from(bucket).remove([previousPath])
      : null;
    return NextResponse.json({
      ...data,
      warning: cleanup?.error
        ? "Replacement saved; previous object cleanup needs administrator attention."
        : undefined,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const { db } = await session(z.uuid().parse(p.get("company")));
    const { data, error } = await db
      .from("employee_documents")
      .select("storage_path,title")
      .eq("id", z.uuid().parse(p.get("id")))
      .eq("company_id", p.get("company"))
      .single();
    if (error) throw new Error("Document unavailable");
    const { data: signed, error: se } = await db.storage
      .from(bucket)
      .createSignedUrl(data.storage_path, 60, {
        download: p.get("download") === "1",
      });
    if (se) throw new Error(se.message);
    return NextResponse.redirect(signed.signedUrl, {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const b = await request.json();
    const { db } = await session(z.uuid().parse(b.company_id));
    const { data, error } = await db
      .from("employee_documents")
      .select("storage_path")
      .eq("id", z.uuid().parse(b.id))
      .eq("company_id", b.company_id)
      .single();
    if (error) throw new Error(error.message);
    const { error: del } = await db
      .from("employee_documents")
      .delete()
      .eq("id", b.id)
      .eq("company_id", b.company_id)
      .select("id")
      .single();
    if (del) throw new Error(del.message);
    const { error: remove } = await db.storage
      .from(bucket)
      .remove([data.storage_path]);
    if (remove)
      throw new Error(
        "Metadata deleted; private object cleanup needs administrator attention.",
      );
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return failure(e);
  }
}
