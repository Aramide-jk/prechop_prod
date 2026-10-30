import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type VerifiedPaystackPayment = {
  reference: string;
  amount: number;
  currency: string;
  id: string | number;
};

type RefundPreparation = {
  should_refund: boolean;
  already_confirmed: boolean;
  refund_status: "none" | "pending" | "accepted" | "processed" | "failed";
};

export async function confirmOrRefundLatePayment(payment: VerifiedPaystackPayment) {
  const supabase = getSupabaseAdminClient();
  const transactionId = String(payment.id);
  const { data: confirmation, error: confirmationError } = await supabase.rpc("confirm_paystack_payment", {
    p_reference: payment.reference,
    p_amount_kobo: payment.amount,
    p_currency: payment.currency,
    p_transaction_id: transactionId,
  });
  if (!confirmationError) return { confirmed: true as const, orderId: (confirmation as { order_id: string }).order_id };

  const { data, error } = await supabase.rpc("prepare_late_paystack_refund", {
    p_reference: payment.reference,
    p_amount_kobo: payment.amount,
    p_currency: payment.currency,
    p_transaction_id: transactionId,
  });
  if (error) throw new Error(confirmationError.message);

  const refund = data as RefundPreparation;
  if (refund.already_confirmed) return { confirmed: true as const, orderId: "" };
  if (!refund.should_refund) {
    return { confirmed: false as const, refundPending: refund.refund_status !== "processed", refunded: refund.refund_status === "processed" };
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("Paystack secret is not configured.");
  try {
    const response = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ transaction: payment.id, amount: payment.amount }),
      cache: "no-store",
    });
    const result = await response.json() as { status?: boolean };
    if (!response.ok || result.status !== true) throw new Error(`Paystack refund request failed (${response.status}).`);
    await supabase.rpc("finish_late_paystack_refund", { p_reference: payment.reference, p_result: "accepted" });
    return { confirmed: false as const, refundPending: true, refunded: false };
  } catch (error) {
    await supabase.rpc("finish_late_paystack_refund", { p_reference: payment.reference, p_result: "failed" });
    throw error;
  }
}
