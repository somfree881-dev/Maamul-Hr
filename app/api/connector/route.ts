import { z } from "zod";
import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { ingestionSchema } from "@/lib/validation";
import { connectorAuthenticated } from "@/lib/connector-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 1048576)
      return NextResponse.json({ error: "Batch too large" }, { status: 413 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1048576)
      return NextResponse.json({ error: "Batch too large" }, { status: 413 });
    const input = JSON.parse(raw);
    const verifying = input.mode === "verify";
    const payload = verifying
      ? z
          .object({ device_id: z.uuid(), mode: z.literal("verify") })
          .strict()
          .parse(input)
      : ingestionSchema.parse(input);
    const authorization = request.headers.get("authorization");
    if (!authorization || authorization.length > 136)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
      return NextResponse.json(
        { error: "Connector ingestion is not configured" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    const db = admin();
    const { data: device, error } = await db
      .from("attendance_devices")
      .select("id,connector_key_hash,connection_type")
      .eq("id", payload.device_id)
      .single();
    if (
      error ||
      !device ||
      !connectorAuthenticated(authorization, device?.connector_key_hash)
    )
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (verifying)
      return NextResponse.json(
        { authenticated: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (!("events" in payload)) throw new Error("Invalid payload");
    const { data, error: syncError } = await db.rpc("ingest_device_events", {
      p_device: device.id,
      p_events: payload.events,
    });
    if (syncError) throw new Error("Database rejected synchronization");
    return NextResponse.json(
      { accepted: payload.events.length, inserted: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid batch or synchronization failed" },
      { status: 400 },
    );
  }
}
