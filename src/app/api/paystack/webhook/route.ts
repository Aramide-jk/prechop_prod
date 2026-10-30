import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { confirmOrRefundLatePayment } from "@/lib/paystack/confirm-payment";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type PaystackEvent = {
  event?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    id?: string | number;
  };
};

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = request.headers.get("x-paystack-signature");
  if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const rawBody = await request.text();
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: PaystackEvent;
  try { event = JSON.parse(rawBody) as PaystackEvent; }
  catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  if (["refund.pending", "refund.processing", "refund.processed", "refund.failed"].includes(event.event ?? "")) {
    const refundId = Number(event.data?.id);
    if (!Number.isSafeInteger(refundId) || refundId <= 0) return NextResponse.json({ error: "Invalid refund event." }, { status: 400 });
    const state = event.event === "refund.processed" ? "processed" : event.event === "refund.failed" ? "failed" : event.event === "refund.processing" ? "processing" : "accepted";
    try {
      const admin = getSupabaseAdminClient();
      const { data: refund, error: lookupError } = await admin.from("customer_delivery_refunds").select("id").eq("paystack_refund_id", refundId).maybeSingle();
      if (lookupError) throw lookupError;
      if (refund) {
        const { error } = await admin.rpc("finish_customer_delivery_refund", { p_refund_id: refund.id, p_provider_id: refundId, p_result: state });
        if (error) throw error;
      }
      return NextResponse.json({ received: true });
    } catch (error) {
      console.error("Paystack refund webhook failed.", error instanceof Error ? error.message : "Unknown error");
      return NextResponse.json({ error: "Refund webhook processing failed." }, { status: 500 });
    }
  }
  if (event.event !== "charge.success") return NextResponse.json({ received: true });

  const payment = event.data;
  if (payment?.status !== "success" || typeof payment.reference !== "string"
      || typeof payment.amount !== "number" || payment.currency !== "NGN"
      || payment.id === undefined) {
    return NextResponse.json({ error: "Incomplete Paystack payment event." }, { status: 400 });
  }

  try {
    await confirmOrRefundLatePayment({
      reference: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
      id: payment.id,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paystack webhook handler failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
