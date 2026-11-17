import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/menu-calendar";

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
    const body = await request.json() as {
      action?: string;
      batchId?: string;
      deliveryId?: string;
      refundMethod?: string;
      reason?: string;
      refundId?: string;
      resolution?: string;
      notes?: string;
      stockPoolId?: string;
      address?: string;
      areaName?: string;
      sourceWeekStart?: string;
      targetWeekStart?: string;
    };
    let result;
    if (body.action === "start_preparing" && body.batchId && uuid.test(body.batchId)) {
      result = await client.supabase.rpc("admin_start_delivery_batch", { p_batch_id: body.batchId });
      if (!result.error) {
        await client.supabase.rpc("log_admin_action", {
          p_category: "batches",
          p_action: "start_preparing",
          p_entity_id: body.batchId,
          p_details: `Batch ${body.batchId.slice(0, 8)} marked as preparing in kitchen.`
        });
      }
    } else if (body.action === "dispatch_batch" && body.batchId && uuid.test(body.batchId)) {
      result = await client.supabase.rpc("admin_dispatch_delivery_batch", { p_batch_id: body.batchId });
      if (!result.error) {
        await client.supabase.rpc("log_admin_action", {
          p_category: "batches",
          p_action: "dispatch_batch",
          p_entity_id: body.batchId,
          p_details: `Batch ${body.batchId.slice(0, 8)} dispatched out for delivery.`
        });
      }
    } else if (body.action === "mark_delivered" && body.deliveryId && uuid.test(body.deliveryId)) {
      result = await client.supabase.rpc("admin_mark_delivery_delivered", { p_delivery_id: body.deliveryId });
      if (!result.error) {
        await client.supabase.rpc("log_admin_action", {
          p_category: "deliveries",
          p_action: "mark_delivered",
          p_entity_id: body.deliveryId,
          p_details: `Delivery ${body.deliveryId.slice(0, 8)} confirmed delivered.`
        });
      }
    } else if (body.action === "cancel_delivery" && body.deliveryId && uuid.test(body.deliveryId)) {
      result = await client.supabase.rpc("admin_cancel_delivery", {
        p_delivery_id: body.deliveryId,
        p_refund_method: body.refundMethod === "original" ? "original" : "wallet",
        p_reason: typeof body.reason === "string" ? body.reason.trim() : "",
      });
      if (!result.error) {
        await client.supabase.rpc("log_admin_action", {
          p_category: "deliveries",
          p_action: "cancel_delivery",
          p_entity_id: body.deliveryId,
          p_details: `Delivery cancelled with refund to ${body.refundMethod || "wallet"}. Reason: ${body.reason || "Not specified"}`
        });
      }
    } else if (body.action === "resolve_refund" && body.refundId && uuid.test(body.refundId)) {
      result = await client.supabase.rpc("admin_resolve_delivery_refund", {
        p_refund_id: body.refundId,
        p_resolution: body.resolution || "wallet",
        p_notes: typeof body.notes === "string" ? body.notes.trim() : "",
      });
      if (!result.error) {
        await client.supabase.rpc("log_admin_action", {
          p_category: "refunds",
          p_action: "resolve_refund",
          p_entity_id: body.refundId,
          p_details: `Refund resolved via ${body.resolution || "wallet"}. Notes: ${body.notes || "None"}`
        });
      }
    } else if (body.action === "unpost_menu_meal" && body.stockPoolId && uuid.test(body.stockPoolId)) {
      result = await client.supabase.rpc("admin_unpost_menu_meal", {
        p_stock_pool_id: body.stockPoolId,
      });
      if (!result.error) {
        await client.supabase.rpc("log_admin_action", {
          p_category: "menus",
          p_action: "unpost_menu_meal",
          p_entity_id: body.stockPoolId,
          p_details: `Meal slot ${body.stockPoolId.slice(0, 8)} unposted from menu.`
        });
      }
    } else if (body.action === "mark_pickup_unclaimed" && body.deliveryId && uuid.test(body.deliveryId)) {
      const reason = typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Holding window expired without pickup";
      const note = `[UNCLAIMED] ${reason}. Forfeited per campus pickup policy.`;
      const { error: updateErr } = await client.supabase
        .from("order_deliveries")
        .update({ status: "cancelled", delivery_note: note })
        .eq("id", body.deliveryId);
      if (updateErr) {
        result = { error: updateErr, data: null };
      } else {
        await client.supabase.rpc("log_admin_action", {
          p_category: "deliveries",
          p_action: "mark_pickup_unclaimed",
          p_entity_id: body.deliveryId,
          p_details: `Pickup ${body.deliveryId.slice(0, 8)} marked as unclaimed and forfeited. Reason: ${reason}.`,
          p_metadata: { reason, note },
        });
        result = { data: true, error: null };
      }
    } else if (body.action === "reroute_pickup_to_delivery" && body.deliveryId && uuid.test(body.deliveryId)) {
      const addressText = typeof body.address === "string" ? body.address.trim() : "";
      const areaName = typeof body.areaName === "string" ? body.areaName.trim() : "Campus Delivery";
      const note = typeof body.notes === "string" && body.notes.trim()
        ? `[REROUTED FROM PICKUP] ${body.notes.trim()}`
        : "[REROUTED FROM PICKUP] Customer requested emergency hostel drop-off.";
      const updatePayload: Record<string, unknown> = {
        fulfillment_type: "delivery",
        address_text: addressText || "Hostel delivery (Customer arranged)",
        area_name: areaName,
        delivery_note: note,
      };
      if (body.batchId && uuid.test(body.batchId)) {
        updatePayload.batch_id = body.batchId;
      }
      const { error: rerouteErr } = await client.supabase
        .from("order_deliveries")
        .update(updatePayload)
        .eq("id", body.deliveryId);
      if (rerouteErr) {
        result = { error: rerouteErr, data: null };
      } else {
        await client.supabase.rpc("log_admin_action", {
          p_category: "deliveries",
          p_action: "reroute_pickup_to_delivery",
          p_entity_id: body.deliveryId,
          p_details: `Pickup ${body.deliveryId.slice(0, 8)} rerouted to doorstep delivery: ${addressText || areaName}.`,
          p_metadata: { addressText, areaName },
        });
        result = { data: true, error: null };
      }
    } else if (body.action === "duplicate_weekly_menu" && body.sourceWeekStart && body.targetWeekStart) {
      const sourceStart = String(body.sourceWeekStart).slice(0, 10);
      const sourceEnd = addDays(sourceStart, 6);
      const targetStart = String(body.targetWeekStart).slice(0, 10);

      const { data: pools, error: poolsErr } = await client.supabase
        .from("meal_stock_pools")
        .select("id, meal_id, service_date, portion_limit")
        .gte("service_date", sourceStart)
        .lte("service_date", sourceEnd);

      if (poolsErr) {
        result = { error: poolsErr, data: null };
      } else if (!pools || pools.length === 0) {
        return errorResponse("There are no meals posted in the source week to duplicate.", 400);
      } else {
        const poolIds = pools.map((p: { id: string }) => p.id);
        const { data: links } = await client.supabase
          .from("batch_menu_items")
          .select("stock_pool_id, batch_id, active")
          .in("stock_pool_id", poolIds);

        let duplicatedCount = 0;
        for (const pool of pools) {
          const dayOffset = Math.round((new Date(`${pool.service_date}T12:00:00Z`).getTime() - new Date(`${sourceStart}T12:00:00Z`).getTime()) / 86400000);
          const targetDate = addDays(targetStart, dayOffset);

          const { data: newPool, error: poolUpsertErr } = await client.supabase
            .from("meal_stock_pools")
            .upsert(
              {
                meal_id: pool.meal_id,
                service_date: targetDate,
                portion_limit: pool.portion_limit,
              },
              { onConflict: "meal_id,service_date" }
            )
            .select("id")
            .single();

          if (poolUpsertErr || !newPool) {
            console.error("Failed to copy pool:", poolUpsertErr?.message);
            continue;
          }

          duplicatedCount++;

          const poolLinks = (links ?? []).filter((l: { stock_pool_id: string; active: boolean }) => l.stock_pool_id === pool.id && l.active);
          if (poolLinks.length > 0) {
            const batchInserts = poolLinks.map((l: { batch_id: string }) => ({
              stock_pool_id: newPool.id,
              batch_id: l.batch_id,
              active: true,
            }));
            await client.supabase
              .from("batch_menu_items")
              .upsert(batchInserts, { onConflict: "batch_id,stock_pool_id" });
          }
        }

        await client.supabase.rpc("log_admin_action", {
          p_category: "menus",
          p_action: "duplicate_weekly_menu",
          p_entity_id: targetStart,
          p_details: `Duplicated ${duplicatedCount} meal posting(s) from week ${sourceStart} to week ${targetStart}.`,
          p_metadata: { sourceStart, targetStart, duplicatedCount },
        });

        result = { data: { success: true, count: duplicatedCount, targetWeekStart: targetStart }, error: null };
      }
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
