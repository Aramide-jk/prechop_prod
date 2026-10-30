import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { confirmOrRefundLatePayment } from "@/lib/paystack/confirm-payment";

type VerifyResult = {
  status?: boolean;
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
  if (!secret) return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });

  let body: { reference?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid payment verification request." }, { status: 400 }); }
  if (typeof body.reference !== "string" || !/^[A-Za-z0-9.=:-]{8,100}$/.test(body.reference)) {
    return NextResponse.json({ error: "Invalid payment reference." }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Please sign in again to confirm your payment." }, { status: 401 });

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id,customer_id,payment_reference,payment_status,status,reservation_expires_at,subtotal_ngn,delivery_total_ngn,wallet_applied_ngn")
      .eq("payment_reference", body.reference)
      .eq("customer_id", authData.user.id)
      .maybeSingle();
    if (orderError || !order) return NextResponse.json({ error: "We couldn’t find this payment for your account." }, { status: 404 });

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(body.reference)}`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const result = await response.json() as VerifyResult;
    const transaction = result.data;
    if (!response.ok || result.status !== true || transaction?.status !== "success"
        || transaction.reference !== body.reference || transaction.currency !== "NGN"
        || transaction.amount !== (order.subtotal_ngn + order.delivery_total_ngn - order.wallet_applied_ngn) * 100
        || transaction.id === undefined) {
      return NextResponse.json({ error: "Paystack hasn’t confirmed this payment yet. If you paid, wait a moment and try again." }, { status: 409 });
    }

    const outcome = await confirmOrRefundLatePayment({
      reference: body.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      id: transaction.id,
    });
    if (outcome.confirmed) return NextResponse.json({ confirmed: true, orderId: outcome.orderId });
    if (outcome.refundPending || outcome.refunded) return NextResponse.json(outcome);
    return NextResponse.json({ error: "Payment was received, but the order could not be confirmed. Please contact PreChop with your payment reference." }, { status: 409 });
  } catch (error) {
    console.error("Paystack verification route failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "We couldn’t verify the payment right now. Please try again." }, { status: 500 });
  }
}
