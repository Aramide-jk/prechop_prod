"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, CheckCircle, CircleNotch, Clock, WarningCircle, X } from "@phosphor-icons/react";

type Status = "checking" | "success" | "failed" | "pending";

export function PaymentReturnDialog({ reference, close }: { reference: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("We’re checking your payment with Paystack.");

  const verify = useCallback(async () => {
    if (!reference) {
      setStatus("failed");
      setMessage("We couldn’t find a payment reference. Check your orders before trying again.");
      return;
    }
    setStatus("checking");
    setMessage("We’re checking your payment with Paystack.");
    try {
      const response = await fetch("/api/paystack/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const result = await response.json() as { confirmed?: boolean; refundPending?: boolean; refunded?: boolean; error?: string; message?: string };
      if (response.ok && result.confirmed) {
        try { localStorage.removeItem("mealhr-cart-v1"); } catch { /* Payment confirmation does not depend on browser storage. */ }
        setStatus("success");
        setMessage("Your payment is confirmed and your meals are on the way.");
        redirectTimer.current = setTimeout(() => router.replace("/orders"), 1400);
      } else if (response.status === 409 || result.refundPending) {
        setStatus("pending");
        setMessage(result.message || "Paystack is still confirming this payment. Check again in a moment.");
      } else if (result.refunded) {
        setStatus("failed");
        setMessage("This payment arrived too late and has been refunded. You can check the refund in your wallet.");
      } else {
        setStatus("failed");
        setMessage(result.message || result.error || "We couldn’t confirm this payment. Check your orders before paying again.");
      }
    } catch {
      setStatus("pending");
      setMessage("We couldn’t reach the payment service just now. Your payment may still be processing; check again shortly.");
    }
  }, [reference, router]);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    const verifyTimer = setTimeout(() => { void verify(); }, 0);
    return () => {
      clearTimeout(verifyTimer);
      if (element?.open) element.close();
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [verify]);

  const title = status === "checking" ? "Confirming your payment…" : status === "success" ? "Payment successful" : status === "pending" ? "Payment is pending" : "Payment not confirmed";
  const Icon = status === "checking" ? CircleNotch : status === "success" ? CheckCircle : status === "pending" ? Clock : WarningCircle;

  return <dialog ref={dialog} className={`modal payment-return-modal payment-return-${status}`} aria-labelledby="payment-return-title" onCancel={event => { event.preventDefault(); if (status !== "checking") close(); }}>
    <button className="payment-return-close" type="button" aria-label="Close payment status" onClick={close} disabled={status === "checking"}><X size={20} /></button>
    <span className="eyebrow">PAYMENT STATUS</span>
    <div className="payment-return-icon"><Icon size={30} weight="regular" className={status === "checking" ? "button-spinner" : undefined} /></div>
    <h2 id="payment-return-title">{title}</h2>
    <p className="payment-return-message" role="status">{message}</p>
    {reference && <div className="payment-return-reference"><strong>Payment reference</strong><span>{reference}</span></div>}
    <div className="payment-return-actions">
      {status !== "success" && <button type="button" className="secondary" onClick={() => void verify()} disabled={status === "checking"} aria-busy={status === "checking"}>{status === "checking" ? <><CircleNotch className="button-spinner" size={18} /> Checking…</> : <><ArrowClockwise size={18} /> Check again</>}</button>}
      <button type="button" className="primary" onClick={() => status === "success" ? router.replace("/orders") : close()} disabled={status === "checking"}>{status === "success" ? "View my orders" : "Back to checkout"}</button>
    </div>
  </dialog>;
}
