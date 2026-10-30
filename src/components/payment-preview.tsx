"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, CreditCard, MapPin, WarningCircle, X } from "@phosphor-icons/react";
import { formatDate, money } from "@/lib/menu";

export type PaymentDelivery = { date: string; window: string; time: string; cutoff: string; area: string; address: string; note: string; plates: number; fee: number };
export type PaymentDetails = {
  name: string;
  phone: string;
  email: string;
  food: number;
  credit: number;
  deliveries: PaymentDelivery[];
  reservationId?: string;
  reservationExpiresAt?: string;
  total?: number;
  deliveryTotal?: number;
};

export function PaymentPreview({ details, close }: { details: PaymentDetails; close: () => void }) {

  const heading = useRef<HTMLHeadingElement>(null);
  const reservationDialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stage, setStage] = useState<"review" | "processing" | "failed" | "success">("processing");
  const [outcome, setOutcome] = useState("success");
  const [tracking, setTracking] = useState(false);
  const [expired, setExpired] = useState(false);
  const [startingPayment, setStartingPayment] = useState(Boolean(details.reservationId));
  const [paymentError, setPaymentError] = useState("");
  const paymentStarted = useRef(false);
  const deliveryFee = details.deliveryTotal ?? details.deliveries.reduce((sum, d) => sum + d.fee, 0);
  const total = details.total ?? Math.max(0, details.food + deliveryFee - details.credit);
  useEffect(() => { if (details.reservationId) return; timer.current = setTimeout(() => { if (details.deliveries.some(d => Date.now() >= Date.parse(`${d.date}T${d.cutoff}:00+01:00`))) { setExpired(true); setStage("failed"); } else setStage("success"); }, 1400); return () => { if (timer.current) clearTimeout(timer.current); }; }, [details]);
  useEffect(() => { heading.current?.focus(); }, [stage]);
  function pay() {
    if (stage === "processing") return;
    if (details.deliveries.some(d => Date.now() >= Date.parse(`${d.date}T${d.cutoff}:00+01:00`))) { setExpired(true); return; }
    setStage("processing");
    timer.current = setTimeout(() => setStage(outcome === "success" ? "success" : "failed"), 1400);
  }
  const startPaystackPayment = useCallback(async () => {
    if (!details.reservationId || paymentStarted.current) return;
    paymentStarted.current = true;
    setStartingPayment(true);
    setPaymentError("");
    try {
      const response = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: details.reservationId, email: details.email.trim() }),
      });
      const result = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl) throw new Error(result.error ?? "We couldn’t open Paystack. Please try again.");
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "We couldn’t open Paystack. Please try again.");
      paymentStarted.current = false;
      setStartingPayment(false);
    }
  }, [details.email, details.reservationId]);
  useEffect(() => {
    if (!details.reservationId) return;
    const startTimer = setTimeout(() => { void startPaystackPayment(); }, 0);
    return () => clearTimeout(startTimer);
  }, [details.reservationId, startPaystackPayment]);
  useEffect(() => {
    if (!details.reservationId) return;
    const dialog = reservationDialog.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [details.reservationId]);
  const schedule = <div className="payment-deliveries">{details.deliveries.map((delivery, index) => <section key={`${delivery.date}-${delivery.window}`}><div className="payment-delivery-title"><span className="eyebrow muted">DELIVERY {index + 1}</span><span>{delivery.plates} {delivery.plates === 1 ? "plate" : "plates"}</span></div><h3>{formatDate(delivery.date)} · {delivery.window}</h3><p><Clock size={17} />{delivery.time}</p><p><MapPin size={17} />{delivery.area}</p><p className="payment-address">{delivery.address}</p>{delivery.note && <p className="payment-address">Note: {delivery.note}</p>}<small>Changes close at {delivery.cutoff} on {formatDate(delivery.date)}.</small></section>)}</div>;
  if (details.reservationId) return <dialog ref={reservationDialog} className="modal payment-reservation-modal" aria-labelledby="payment-title" onCancel={event => event.preventDefault()}><section className="payment-page" aria-labelledby="payment-title">
    <span className="eyebrow">CHECKOUT</span>
    <div className="payment-symbol processing" aria-hidden="true">{startingPayment ? <span className="payment-spinner" /> : <CreditCard size={32} />}</div>
    <h2 ref={heading} tabIndex={-1} id="payment-title">Your meals are held for payment.</h2>
    <p className="payment-intro">We’ve held your meals and delivery slots for 15 minutes. Opening Paystack now…</p>
    <div className="payment-notice"><p><strong>Reservation reference</strong><br />{details.reservationId}</p>{details.reservationExpiresAt && <p>Reservation expires {new Date(details.reservationExpiresAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}.</p>}</div>
    {schedule}
    <div className="payment-totals"><div><span>Meals, proteins & extras</span><strong>{money(details.food)}</strong></div><div><span>Delivery</span><strong>{money(deliveryFee)}</strong></div><div className="payment-grand-total"><span>Total to pay</span><strong>{money(total)}</strong></div></div>
    {paymentError && <p className="error" role="alert">{paymentError}</p>}
    <button className="primary" type="button" onClick={() => void startPaystackPayment()} disabled={startingPayment} aria-busy={startingPayment}>{startingPayment ? <><span className="payment-spinner" /> Opening Paystack…</> : <>Retry secure payment <ArrowRight size={19} /></>}</button>
    <p className="signin-preview">Payment is processed securely by Paystack. Your order is confirmed after payment is verified.</p>
  </section></dialog>;
  return <section className="payment-page" aria-labelledby="payment-title">
    <button className="icon-button modal-close" aria-label="Close payment preview" disabled={stage === "processing"} onClick={close}><X size={22} /></button>
    <span className="eyebrow">PAYMENT DESIGN PREVIEW</span>
    <div className={`payment-symbol ${stage}`} aria-hidden="true">{stage === "success" ? <Check size={32} /> : stage === "failed" ? <WarningCircle size={32} /> : stage === "processing" ? <span className="payment-spinner" /> : <CreditCard size={32} />}</div>
    <h2 ref={heading} tabIndex={-1} id="payment-title">{stage === "review" ? "One last look." : stage === "processing" ? "Confirming your payment…" : stage === "failed" ? "Let’s try that again." : "Your week is sorted."}</h2>
    <p className="payment-intro">{stage === "review" ? "Review your deliveries and total before you continue." : stage === "processing" ? "Please keep this window open while the preview finishes." : stage === "failed" ? "The simulated payment didn’t go through. Your meals and delivery details are still here." : `Thanks, ${details.name}. Here’s how your order confirmation will look.`}</p>
    {stage === "processing" ? <div className="payment-processing" role="status"><strong>{money(total)}</strong><p>Simulating payment confirmation. No money is being moved.</p></div> : <>
      {stage === "failed" && <div className="payment-notice" role="alert">No payment was taken. You can retry or go back to your delivery details.</div>}
      {stage === "success" && <div className="payment-notice success" role="status"><Check size={20} /><p><strong>Preview payment successful</strong>No real order has been placed and your wallet has not been charged.</p></div>}
      {stage !== "failed" && schedule}
      <div className="payment-totals"><div><span>Meals, proteins & extras</span><strong>{money(details.food)}</strong></div><div><span>Delivery</span><strong>{money(deliveryFee)}</strong></div><div><span>Wallet credit {stage === "success" ? "(simulated)" : ""}</span><strong>−{money(details.credit)}</strong></div><div className="payment-grand-total"><span>{stage === "success" ? "Payment simulated" : "Amount to pay"}</span><strong>{money(total)}</strong></div></div>
      {stage === "success" ? <><p className="payment-contact">Delivery contact: {details.name} · {details.phone}</p><button className="primary" onClick={() => setTracking(value => !value)}>{tracking ? "Hide delivery status" : "Track my order"}<ArrowRight size={19} /></button>{tracking && <section className="payment-tracking"><h3>Delivery status preview</h3><ol><li aria-current="step"><Check size={17} /><strong>Confirmed</strong></li><li>Preparing</li><li>Out for delivery</li><li>Delivered</li></ol><p>Live tracking will be connected when ordering launches. Plate sticker codes appear when preparation begins.</p></section>}<Link className="signin-back" href="/orders">Explore sample orders <ArrowRight size={17} /></Link><button className="signin-back" onClick={close}>Back to checkout</button></> : <>
        <div className="payment-method"><CreditCard size={22} /><div><strong>{total === 0 ? "Covered by wallet credit" : "Paystack"}</strong><p>{total === 0 ? "No additional payment would be needed." : "Payment options will open securely with Paystack when connected."}</p></div></div>
        <label className="payment-scenario">Preview outcome<select value={outcome} onChange={e => setOutcome(e.target.value)}><option value="success">Successful payment</option><option value="failed">Failed payment</option></select></label>
        {expired && <p className="error" role="alert">A delivery cutoff has passed. Go back and update your meals before continuing.</p>}
        <button className="primary" disabled={expired} onClick={pay}>{stage === "failed" ? "Retry simulated payment" : `Simulate payment · ${money(total)}`}<ArrowRight size={19} /></button><button className="signin-back" onClick={close}><ArrowLeft size={17} /> Edit delivery details</button>
      </>}
    </>}
    <p className="signin-preview">Design preview only. No card details are collected and no payment request is sent.</p>
  </section>;
}
