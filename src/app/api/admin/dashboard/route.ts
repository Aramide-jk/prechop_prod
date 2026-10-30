import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status, headers });
}

async function getAdminClient() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { response: errorResponse("Sign in with the admin account to continue.", 401, "signed_out") };
  return { supabase, userId: data.user.id };
}

function mapRpcError(error: { code?: string } | null, userId: string) {
  if (error?.code === "42501") {
    const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://unknown.invalid").hostname.split(".")[0];
    return NextResponse.json({ error: "This account is not approved for PreChop admin operations.", code: "not_admin", user_id: userId, project_ref: projectRef }, { status: 403, headers });
  }
  return errorResponse("The admin dashboard is not set up yet. Apply the admin dashboard migration and try again.", 503, "dashboard_unavailable");
}

export async function GET(request: Request) {
  try {
    const client = await getAdminClient();
    if ("response" in client) return client.response;
    const batchId = new URL(request.url).searchParams.get("batchId");
    if (batchId && !uuid.test(batchId)) return errorResponse("Invalid delivery batch.", 400);
    const { data, error } = await client.supabase.rpc("get_admin_today_dashboard", { p_batch_id: batchId || null });
    if (error) return mapRpcError(error, client.userId);
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error("Admin dashboard request failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("We couldn’t load today’s dashboard. Please try again.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const client = await getAdminClient();
    if ("response" in client) return client.response;
    const body = await request.json() as { action?: string; batchId?: string; deliveryId?: string };
    let result;
    if (body.action === "start_preparing" && body.batchId && uuid.test(body.batchId)) {
      result = await client.supabase.rpc("admin_start_delivery_batch", { p_batch_id: body.batchId });
    } else if (body.action === "dispatch_batch" && body.batchId && uuid.test(body.batchId)) {
      result = await client.supabase.rpc("admin_dispatch_delivery_batch", { p_batch_id: body.batchId });
    } else if (body.action === "mark_delivered" && body.deliveryId && uuid.test(body.deliveryId)) {
      result = await client.supabase.rpc("admin_mark_delivery_delivered", { p_delivery_id: body.deliveryId });
    } else return errorResponse("Choose a valid delivery action.", 400);
    if (result.error) {
      if (result.error.code === "42501") return mapRpcError(result.error, client.userId);
      return errorResponse(result.error.message || "That delivery update could not be saved.", 409, "action_failed");
    }
    return NextResponse.json({ updated: result.data ?? true }, { headers });
  } catch (error) {
    console.error("Admin delivery action failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("We couldn’t save that delivery update. Please try again.", 500);
  }
}
