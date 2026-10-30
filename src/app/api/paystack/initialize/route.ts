import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type InitializeResult = {
  status?: boolean;
  data?: { authorization_url?: string; reference?: string };
};

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });

  let body: { orderId?: unknown; email?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid payment request." }, { status: 400 }); }

  if (typeof body.orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.orderId)
      || typeof body.email !== "string" || body.email.trim().length > 254) {
    return NextResponse.json({ error: "Enter a valid email address and try again." }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Please sign in again before paying." }, { status: 401 });

    const reference = `prechop-${crypto.randomUUID()}`;
    const { data, error } = await supabase.rpc("start_customer_payment", {
      p_order_id: body.orderId,
      p_email: body.email.trim(),
      p_reference: reference,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const payment = data as { reference: string; authorization_url: string | null; total_ngn: number };
    if (payment.authorization_url) {
      return NextResponse.json({ authorizationUrl: payment.authorization_url });
    }
    const amountKobo = payment.total_ngn * 100;
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
      return NextResponse.json({ error: "The order total is invalid. Please return to checkout." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    const callbackUrl = new URL("/checkout?paystack=return", appUrl).toString();
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({
        email: body.email.trim(),
        amount: String(amountKobo),
        currency: "NGN",
        reference: payment.reference,
        callback_url: callbackUrl,
        metadata: { order_id: body.orderId, customer_id: authData.user.id },
      }),
      cache: "no-store",
    });
    const result = await paystackResponse.json() as InitializeResult;
    const authorizationUrl = result.data?.authorization_url;
    if (!paystackResponse.ok || result.status !== true || !authorizationUrl?.startsWith("https://checkout.paystack.com/")) {
      console.error("Paystack transaction initialization failed.", { status: paystackResponse.status });
      return NextResponse.json({ error: "Paystack couldn’t start the payment. Please try again." }, { status: 502 });
    }

    const { error: saveError } = await supabase.rpc("save_customer_payment_url", {
      p_order_id: body.orderId,
      p_reference: payment.reference,
      p_authorization_url: authorizationUrl,
    });
    if (saveError) console.error("Could not cache the Paystack checkout link for this order.");

    return NextResponse.json({ authorizationUrl });
  } catch (error) {
    console.error("Paystack initialization route failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "We couldn’t start your payment. Please try again." }, { status: 500 });
  }
}
