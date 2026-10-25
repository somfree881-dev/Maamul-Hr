import { rosterMessageSchema } from "@/lib/device-import";
import { z } from "zod";
import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { ingestionSchema } from "@/lib/validation";
import { connectorAuthenticated } from "@/lib/connector-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const bearer = request.headers.get("authorization");
    if (!bearer || !/^Bearer [A-Za-z0-9_-]{32,128}$/.test(bearer))
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    if (Number(request.headers.get("content-length") ?? 0) > 1048576)
      return NextResponse.json({ error: "Batch too large" }, { status: 413 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1048576)
      return NextResponse.json({ error: "Batch too large" }, { status: 413 });
    const input = JSON.parse(raw);
    const verifying = input.mode === "verify";
    const roster = ["users_poll", "users_batch", "users_error"].includes(
      input.mode,
    );
    const payload = roster
      ? rosterMessageSchema.parse(input)
      : verifying
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
    if ("mode" in payload && payload.mode === "users_poll") {
      const result = await db.rpc("poll_device_employee_import", {
        p_device: device.id,
      });
      if (result.error?.code === "PGRST202")
        return NextResponse.json({ request_id: null, available: false });
      if (result.error) throw Error("User import poll failed");
      return NextResponse.json(
        { request_id: result.data },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      "mode" in payload &&
      (payload.mode === "users_batch" || payload.mode === "users_error")
    ) {
      if (payload.mode === "users_error") {
        const result = await db.rpc("fail_device_employee_import", {
          p_device: device.id,
          p_request: payload.request_id,
          p_error: payload.error,
        });
        if (result.error) throw Error("Import error report failed");
        return NextResponse.json({ reported: true });
      }
      const result = await db.rpc("stage_device_employee_users", {
        p_device: device.id,
        p_request: payload.request_id,
        p_offset: payload.offset,
        p_users: payload.users,
        p_final: payload.final,
      });
      if (result.error) {
        // A cancelled/failed import must not block the connector's durable metadata queue forever.
        if (result.error.message === "Invalid roster offset")
          return NextResponse.json({ cancelled: true });
        throw Error("User roster rejected");
      }
      return NextResponse.json(
        { received: result.data },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
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
