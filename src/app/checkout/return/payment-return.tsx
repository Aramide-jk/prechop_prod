"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle, WarningCircle } from "@phosphor-icons/react";

type Result = { confirmed?: boolean; refunded?: boolean; refundPending?: boolean; error?: string };

export function PaymentReturn({ reference }: { reference: string }) {
  const [state, setState] = useState<"checking" | "success" | "refund" | "error">("checking");
  const [message, setMessage] = useState("We’re checking your payment with Paystack.");

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      if (!reference) { setState("error"); setMessage("There was no payment reference in the return link."); return; }
      try {
        const response = await fetch("/api/paystack/verify", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ reference }),
        });
        const result = await response.json() as Result;
        if (cancelled) return;
        if (result.confirmed) { setState("success"); setMessage("Your payment is confirmed and your meals are booked."); }
        else if (result.refunded || result.refundPending) { setState("refund"); setMessage(result.refunded ? "The meal hold had expired, so we requested a refund to your original payment method." : "The meal hold had expired. Your refund request is being processed."); }
        else { setState("error"); setMessage(result.error || "We couldn’t confirm this payment yet. If you were charged, contact PreChop with the reference below."); }
      } catch {
        if (!cancelled) { setState("error"); setMessage("We couldn’t reach the payment service. If you were charged, contact PreChop with the reference below."); }
      }
    }
    void verify();
    return () => { cancelled = true; };
  }, [reference]);

  return <main className="payment-page payment-return" aria-live="polite">
    <span className="eyebrow">PAYMENT STATUS</span>
    <div className={`payment-symbol ${state === "success" ? "success" : state === "error" ? "failed" : "processing"}`} aria-hidden="true">
      {state === "success" ? <CheckCircle size={34} /> : state === "error" ? <WarningCircle size={34} /> : <span className="payment-spinner" />}
    </div>
    <h1 className="payment-return-title">{state === "checking" ? "Confirming your payment…" : state === "success" ? "Your week is sorted." : state === "refund" ? "Refund requested." : "Payment needs attention."}</h1>
    <p className="payment-intro">{message}</p>
    {reference && <p className="payment-notice"><span><strong>Payment reference</strong><br />{reference}</span></p>}
    <div className="payment-return-actions">
      {state === "success" && <Link className="primary" href="/orders">View my orders <ArrowRight size={19} /></Link>}
      {state === "error" && <button className="primary" onClick={() => window.location.reload()}>Check payment again <ArrowRight size={19} /></button>}
      <Link className="signin-back" href="/menu">Back to menu</Link>
    </div>
  </main>;
}
