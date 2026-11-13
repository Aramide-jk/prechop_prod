import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type Cancellation = {
  refund_id: string;
  refund_status: string;
  wallet_refund_ngn: number;
  cash_refund_ngn: number;
  paystack_transaction_id: string | null;
};
type PaystackRefundResponse = { status?: boolean; message?: string; data?: { id?: number; status?: string } };

export async function POST(request: Request) {
  try {
    const body = await request.json() as { deliveryId?: unknown; refundMethod?: unknown };
    if (typeof body.deliveryId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.deliveryId)
      || (body.refundMethod !== "wallet" && body.refundMethod !== "original")) {
      return NextResponse.json({ error: "Choose a valid refund option." }, { status: 400 });
    }
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (body.refundMethod === "original" && !secret) {
      return NextResponse.json({ error: "Original-payment refunds are not configured. Choose wallet credit for now." }, { status: 503 });
    }
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to cancel this delivery." }, { status: 401 });
    const { data: deliveryRow } = await supabase
      .from("order_deliveries")
      .select("id,status,order_id,orders(id,customer_id,status)")
      .eq("id", body.deliveryId)
      .maybeSingle();

    const orderRow = (Array.isArray(deliveryRow?.orders) ? deliveryRow?.orders[0] : deliveryRow?.orders) as { id: string; customer_id: string; status: string } | null | undefined;
    if (deliveryRow && orderRow?.customer_id === user.id && (deliveryRow.status === "pending_payment" || orderRow.status === "pending_payment")) {
      const { getSupabaseAdminClient } = await import("@/lib/supabase/admin");
      const admin = getSupabaseAdminClient();
      await admin.from("order_deliveries").update({ status: "cancelled" }).eq("id", body.deliveryId);
      await admin.from("orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", orderRow.id);
      return NextResponse.json({
        cancelled: true,
        refundStatus: "none",
        walletRefund: 0,
        cashRefund: 0,
      });
    }

    const { data, error } = await supabase.rpc("request_customer_delivery_cancellation", {
      p_delivery_id: body.deliveryId,
      p_refund_method: body.refundMethod,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const refund = data as Cancellation;
    if (refund.cash_refund_ngn > 0 && refund.refund_status !== "processed") {
      const { data: claimed, error: claimError } = await supabase.rpc("claim_customer_delivery_refund", { p_refund_id: refund.refund_id });
      if (claimError) return NextResponse.json({ error: "The delivery is cancelled, but its refund could not be started. Please contact PreChop with your order reference." }, { status: 202 });
      if (claimed) {
        try {
          const paystackResponse = await fetch("https://api.paystack.co/refund", {
            method: "POST",
            headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
            body: JSON.stringify({ transaction: refund.paystack_transaction_id, amount: refund.cash_refund_ngn * 100, currency: "NGN", customer_note: "PreChop delivery cancelled before cutoff" }),
            cache: "no-store",
          });
          const result = await paystackResponse.json() as PaystackRefundResponse;
          if (!paystackResponse.ok || result.status !== true) throw new Error("Paystack could not start the refund.");
          const paystackStatus = result.data?.status === "processed" ? "processed" : result.data?.status === "processing" ? "processing" : "accepted";
          const { error: finishError } = await supabase.rpc("finish_customer_delivery_refund", {
            p_refund_id: refund.refund_id, p_provider_id: result.data?.id ?? null, p_result: paystackStatus,
          });
          if (finishError) console.error("Could not save the Paystack refund status.");
          refund.refund_status = paystackStatus;
        } catch (error) {
          await supabase.rpc("finish_customer_delivery_refund", { p_refund_id: refund.refund_id, p_provider_id: null, p_result: "failed" });
          console.error("Paystack refund request failed.", error instanceof Error ? error.message : "Unknown error");
          refund.refund_status = "failed";
        }
      }
    }
    return NextResponse.json({
      cancelled: true,
      refundStatus: refund.refund_status,
      walletRefund: refund.wallet_refund_ngn,
      cashRefund: refund.cash_refund_ngn,
    });
  } catch {
    return NextResponse.json({ error: "We couldn’t cancel this delivery. Please try again." }, { status: 500 });
  }
}
