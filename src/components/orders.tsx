"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  Check,
  Clock,
  MapPin,
  Package,
  Phone,
  Receipt,
  Storefront,
  X,
} from "@phosphor-icons/react";
import {
  formatDisplayAddress,
  formatPackCode,
  formatPackCodeSummary,
  formatShortOrderRef,
} from "@/lib/delivery-code";
import { formatDate, money, upcomingDates } from "@/lib/menu";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { SignInDialog } from "@/components/sign-in";
import { defaultStoreSettings, fetchStoreSettings, type StoreSettings } from "@/lib/settings";
import { OrdersSkeleton } from "@/components/skeletons";

type Status = "Pending payment" | "Confirmed" | "Preparing" | "Out for delivery" | "Delivered" | "Cancelled" | "Unclaimed";
type Order = {
  id: string;
  shortRef: string;
  paymentReference?: string;
  deliveryId?: string;
  orderId?: string;
  date: string;
  window: string;
  time: string;
  cutoff: string;
  status: Status;
  address: string;
  note?: string;
  fee: number;
  refundStatus?: string;
  isPickup?: boolean;
  plates: { name: string; image: string; protein: string; extras: string; price: number; code?: number }[];
};
const steps: Status[] = ["Confirmed", "Preparing", "Out for delivery", "Delivered"];
function samples(): Order[] {
  const dates = upcomingDates();
  return [
    { id: "DEMO-104", shortRef: "DEMO-104", date: dates[1], window: "Lunch", time: "12:00 PM–2:00 PM", cutoff: "10:00", status: "Confirmed", address: "Faculty of Engineering, main entrance · ABU Samaru", fee: 500, plates: [{ name: "Smoky jollof rice", image: "/images/jollof.png", protein: "Chicken", extras: "Coleslaw × 1", price: 2700 }] },
    { id: "DEMO-103", shortRef: "DEMO-103", date: dates[0], window: "Lunch", time: "12:00 PM–2:00 PM", cutoff: "10:00", status: "Preparing", address: "Queen Amina Hall, reception · ABU Samaru", fee: 500, plates: [{ name: "Smoky jollof rice", image: "/images/jollof.png", protein: "Chicken", extras: "Bottled water × 1", price: 2600, code: 1001 }, { name: "Beans & plantain", image: "/images/beans.png", protein: "No protein", extras: "No extras", price: 1800, code: 1002 }] },
    { id: "DEMO-102", shortRef: "DEMO-102", date: dates[0], window: "Breakfast", time: "9:00 AM–10:00 AM", cutoff: "08:00", status: "Out for delivery", address: "Samaru market, main entrance · Samaru", fee: 700, plates: [{ name: "Yam & egg sauce", image: "/images/yam.png", protein: "No protein", extras: "Bottled water × 1", price: 2500, code: 1003 }] },
    { id: "DEMO-101", shortRef: "DEMO-101", date: dates[0], window: "Breakfast", time: "7:00 AM–8:00 AM", cutoff: "06:00", status: "Delivered", address: "Faculty of Engineering, main entrance · ABU Samaru", fee: 500, plates: [{ name: "Beans & plantain", image: "/images/beans.png", protein: "Egg", extras: "No extras", price: 2100, code: 1004 }] },
  ];
}

function clockText(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(Date.UTC(2020, 0, 1, hour, minute)).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}
function statusText(value: string): Status {
  return ({ pending_payment: "Pending payment", confirmed: "Confirmed", preparing: "Preparing", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled", unclaimed: "Unclaimed" } as Record<string, Status>)[value] ?? "Pending payment";
}
type DbItem = { meal_name: string; base_price_ngn: number; protein_name: string | null; protein_price_ngn: number; extras_snapshot: { name: string; price_ngn: number; quantity: number }[]; plate_stickers?: { sticker_id: number }[] | { sticker_id: number } | null };
type DbDelivery = { id: string; service_date: string; area_name: string; area_fee_ngn: number; address_text: string; delivery_note: string; cutoff_at: string; status: string; fulfillment_type?: string; delivery_batches: { name: string; delivery_starts_at: string; delivery_ends_at: string; delivery_windows: { window: string } | { window: string }[] } | { name: string; delivery_starts_at: string; delivery_ends_at: string; delivery_windows: { window: string } | { window: string }[] }[]; order_items: DbItem[] };
type DbOrder = { id: string; payment_reference: string | null; status: string; payment_status: string; created_at: string; order_deliveries: DbDelivery[] };
function mapOrders(rows: DbOrder[], imageByName: Map<string, string>, refundByDelivery: Map<string, string>): Order[] {
  return rows.flatMap(order => order.order_deliveries.map(delivery => {
    const batch = Array.isArray(delivery.delivery_batches) ? delivery.delivery_batches[0] : delivery.delivery_batches;
    const rawWindow = batch ? (Array.isArray(batch.delivery_windows) ? batch.delivery_windows[0]?.window : batch.delivery_windows?.window) : "lunch";
    const window = rawWindow ? rawWindow[0].toUpperCase() + rawWindow.slice(1) : "Lunch";
    const extras = (item: DbItem) => (item.extras_snapshot ?? []).map(extra => `${extra.name} × ${extra.quantity}`).join(" · ") || "No extras";
    const plates = (delivery.order_items ?? []).map(item => {
      const stickerRelation = item.plate_stickers;
      const sticker = Array.isArray(stickerRelation) ? stickerRelation[0]?.sticker_id : stickerRelation?.sticker_id;
      return { name: item.meal_name, image: imageByName.get(item.meal_name) || "/images/beans.png", protein: item.protein_name ?? "No protein", extras: extras(item), price: item.base_price_ngn + item.protein_price_ngn + (item.extras_snapshot ?? []).reduce((sum, extra) => sum + extra.price_ngn * extra.quantity, 0), ...(sticker ? { code: sticker } : {}) };
    });
    const cutoffDate = new Date(delivery.cutoff_at);
    const cutoff = cutoffDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" });
    const finalStatus = refundByDelivery.get(delivery.id);
    const isPickup = delivery.area_name === "Campus Pickup" || delivery.fulfillment_type === "pickup";
    const isUnclaimed = Boolean(delivery.delivery_note?.includes("[UNCLAIMED]"));
    const status = isUnclaimed ? "Unclaimed" : statusText(delivery.status);
    const rawId = order.payment_reference || order.id.slice(0, 8).toUpperCase();
    return {
      id: rawId,
      shortRef: formatShortOrderRef(order.payment_reference, order.id),
      paymentReference: order.payment_reference ?? undefined,
      orderId: order.id,
      deliveryId: delivery.id,
      date: delivery.service_date.slice(0, 10),
      window,
      time: batch ? `${clockText(batch.delivery_starts_at)}–${clockText(batch.delivery_ends_at)}` : window,
      cutoff,
      status,
      address: delivery.address_text,
      note: delivery.delivery_note,
      fee: delivery.area_fee_ngn,
      refundStatus: finalStatus,
      plates,
      isPickup,
    };
  }));
}

function ActionDialog({ order, mode, close, save }: { order: Order; mode: "address" | "cancel"; close: () => void; save: (address?: string, refundMethod?: "wallet" | "original", deliveryNote?: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [address, setAddress] = useState(order.address);
  const [deliveryNote, setDeliveryNote] = useState(order.note ?? "");
  const [refundMethod, setRefundMethod] = useState<"wallet" | "original">("wallet");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isPending = order.status === "Pending payment";
  useEffect(() => {
    const element = dialog.current; const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog className="modal order-action-dialog" ref={dialog} aria-labelledby="action-title" onCancel={e => { e.preventDefault(); close(); }}><button className="icon-button modal-close" aria-label="Close dialog" onClick={close} disabled={busy}><X size={22} /></button><span className="eyebrow">{mode === "address" ? "DELIVERY DETAILS" : "CANCELLATION"}</span><h2 id="action-title">{mode === "address" ? "Change delivery address" : isPending ? "Cancel this unpaid order?" : "Cancel this delivery?"}</h2><p className="modal-intro">{mode === "address" ? "Update this address before its ordering cutoff." : isPending ? "This order will be cancelled and your meal portion released." : "You can choose wallet credit or a refund to your original payment method."}</p><form onSubmit={async e => { e.preventDefault(); setError(""); if (!isPending && Date.now() >= Date.parse(`${order.date}T${order.cutoff}:00+01:00`)) { setError("The cutoff has passed. This delivery can no longer be changed."); return; } if (mode === "address" && address.trim().length < 8) { setError("Please enter an address with a landmark."); return; } setBusy(true); try { await save(mode === "address" ? address.trim() : undefined, mode === "cancel" ? refundMethod : undefined, deliveryNote); } catch (reason) { setError(reason instanceof Error ? reason.message : "We couldn’t save this change."); } finally { setBusy(false); } }}>
    {mode === "address" ? <><label className="order-address-field">Address & landmark<textarea rows={4} maxLength={300} required value={address} onChange={e => setAddress(e.target.value)} /></label><label className="order-address-field">Delivery note <span>(optional)</span><textarea rows={2} maxLength={200} value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} /></label></> : isPending ? <p className="order-cancel-notice" style={{ margin: "16px 0 20px", fontSize: "14px", color: "var(--muted)", lineHeight: 1.6 }}>Since payment was not completed, no charge was made and no refund is needed.</p> : <fieldset className="order-refund-options"><legend>Refund destination</legend><label><input type="radio" name="refund-method" checked={refundMethod === "wallet"} onChange={() => setRefundMethod("wallet")} /><span>PreChop wallet credit<small>Available right away for a future order.</small></span></label><label><input type="radio" name="refund-method" checked={refundMethod === "original"} onChange={() => setRefundMethod("original")} /><span>Original payment method<small>Paystack processes the cash portion; any wallet-paid portion returns to wallet.</small></span></label></fieldset>}
    {error && <p className="error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : mode === "address" ? "Save address" : "Confirm cancellation"}</button><button className="signin-back" type="button" onClick={close} disabled={busy}>{mode === "cancel" ? "Keep this order" : "Keep current address"}</button></form></dialog>;
}

export function Orders() {
  const live = isSupabaseConfigured();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("Upcoming");
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<"address" | "cancel" | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const [supportWhatsApp, setSupportWhatsApp] = useState(defaultStoreSettings.whatsapp_number);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(defaultStoreSettings);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [payError, setPayError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const loadOrders = useCallback(async () => {
    if (!live) { setOrders(samples()); setSignedIn(true); setReady(true); setNow(Date.now()); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError("Supabase is not configured."); setReady(true); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) { setOrders([]); setSignedIn(false); setReady(true); return; }
    setSignedIn(true);
    if (auth.user.email) setUserEmail(auth.user.email);
    const [orderResult, mealResult, settingsResult] = await Promise.all([
      supabase.from("orders").select("id,payment_reference,status,payment_status,created_at,order_deliveries(id,service_date,area_name,area_fee_ngn,address_text,delivery_note,cutoff_at,status,fulfillment_type,delivery_batches(name,delivery_starts_at,delivery_ends_at,delivery_windows(window)),order_items(id,meal_name,base_price_ngn,protein_name,protein_price_ngn,extras_snapshot,plate_stickers(sticker_id)))").order("created_at", { ascending: false }),
      supabase.from("meals").select("name,image_url"),
      fetchStoreSettings(),
    ]);
    if (settingsResult) { setStoreSettings(settingsResult); if (settingsResult.whatsapp_number) setSupportWhatsApp(settingsResult.whatsapp_number); }
    if (orderResult.error || mealResult.error) { setError(orderResult.error?.message ?? mealResult.error?.message ?? "We couldn’t load your orders."); setOrders([]); }
    else {
      const rows = (Array.isArray(orderResult.data) ? orderResult.data : []) as unknown as DbOrder[];
      const images = new Map(((Array.isArray(mealResult.data) ? mealResult.data : []) as { name: string; image_url: string }[]).map(meal => [meal.name, meal.image_url || "/images/beans.png"]));
      const deliveryIds = rows.flatMap(order => order.order_deliveries ?? []).map(delivery => delivery.id);
      const refundByDelivery = new Map<string, string>();
      if (deliveryIds.length) {
        const { data: refunds, error: refundError } = await supabase.from("customer_delivery_refunds").select("delivery_id,status").in("delivery_id", deliveryIds);
        if (refundError) console.warn("Could not load delivery refund statuses.");
        else for (const refund of (refunds ?? []) as { delivery_id: string; status: string }[]) refundByDelivery.set(refund.delivery_id, refund.status);
      }
      setOrders(mapOrders(rows, images, refundByDelivery));
      setError("");
    }
    setReady(true); setNow(Date.now());
  }, [live]);
  useEffect(() => {
    const initial = setTimeout(() => { void loadOrders(); }, 0);
    const clock = setInterval(() => { setNow(Date.now()); if (live) void loadOrders(); }, 20000);
    return () => { clearTimeout(initial); clearInterval(clock); };
  }, [live, loadOrders]);
  useEffect(() => { title.current?.focus(); }, [selected]);
  const order = orders.find(o => (o.deliveryId ?? o.id) === selected);
  const shown = orders.filter(o => filter === "Upcoming" ? !["Delivered", "Cancelled", "Unclaimed"].includes(o.status) : filter === "Delivered" ? o.status === "Delivered" : ["Cancelled", "Unclaimed"].includes(o.status));
  const editable = order?.status === "Confirmed" && now < Date.parse(`${order.date}T${order.cutoff}:00+01:00`);
  function open(id: string) { setSelected(id); setNotice(""); window.scrollTo({ top: 0, behavior: "instant" }); }

  async function saveAction(address?: string, refundMethod?: "wallet" | "original", deliveryNote?: string) {
    if (!order) return;
    if (!live) {
      setOrders(current => current.map(item => item.id === order.id ? { ...item, ...(address ? { address, note: deliveryNote } : { status: "Cancelled" as Status }) } : item));
      setNotice(address ? "Delivery address updated for this preview." : "Delivery cancelled in this preview."); setAction(null); return;
    }
    if (!order.deliveryId) throw new Error("We couldn’t identify this delivery. Refresh and try again.");
    const endpoint = address ? "/api/customer/deliveries/address" : "/api/customer/deliveries/cancel";
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(address ? { deliveryId: order.deliveryId, address, deliveryNote } : { deliveryId: order.deliveryId, refundMethod }) });
    const result = await response.json() as { error?: string; refundStatus?: string; walletRefund?: number; cashRefund?: number };
    if (!response.ok) throw new Error(result.error ?? "We couldn’t update this delivery.");
    const isPending = order.status === "Pending payment";
    setNotice(address ? "Delivery address updated." : isPending ? "Order cancelled. Your meal portion was released." : `Delivery cancelled. ${result.walletRefund ? `${money(result.walletRefund)} added to your PreChop wallet.` : ""} ${result.cashRefund ? `Cash refund status: ${result.refundStatus ?? "pending"}.` : ""}`);
    setAction(null); await loadOrders();
  }

  async function retryPaystackPayment(targetOrder: Order) {
    if (!targetOrder.orderId) return;
    setPayingOrderId(targetOrder.orderId);
    setPayError("");
    try {
      const email = userEmail.trim() || `${targetOrder.orderId.slice(0, 8)}@prechop.me`;
      const response = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: targetOrder.orderId, email }),
      });
      const result = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.error ?? "We couldn’t start Paystack payment. Please try again.");
      }
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "We couldn’t open Paystack. Please try again.");
      setPayingOrderId(null);
    }
  }

  return <>
    <main className="orders-shell">{!live && <div className="orders-preview"><Receipt size={20} /><p><strong>Sample orders</strong> These examples are separate from checkout and are not real orders.</p></div>}{error && <p className="error" role="alert">{error}</p>}
      {order ? <><button className="orders-back" onClick={() => { setSelected(null); setNotice(""); }}><ArrowLeft size={18} /> All deliveries</button><div className="orders-heading"><span className="eyebrow">{order.shortRef} · {formatDate(order.date)}</span><h1 ref={title} tabIndex={-1}>{order.status === "Pending payment" ? "Payment required to confirm your meal." : order.status === "Preparing" ? (order.isPickup ? "Your pickup meal is being prepared." : "Your meal is being prepared.") : order.status === "Out for delivery" ? (order.isPickup ? `Ready for collection at ${storeSettings.pickup_station_name}.` : "Good food is on its way.") : order.status === "Delivered" ? (order.isPickup ? "Collected. Enjoy your meal!" : "Delivered. Enjoy your meal.") : order.status === "Unclaimed" ? "Collection window expired (Unclaimed)." : order.status === "Cancelled" ? "This delivery was cancelled." : "Your meal is on the calendar."}</h1><p>{order.window} · {order.time}</p></div>
        {order.status === "Pending payment" ? (
          <>
            <div className="order-pending-banner">
              <div className="order-pending-badge">
                <Clock size={16} weight="bold" />
                <span>Awaiting payment</span>
              </div>
              <div className="order-pending-copy">
                <h2>Payment not completed yet</h2>
                <p>
                  Your meal selection is saved. Complete payment before <strong>{clockText(order.cutoff)} ({formatDate(order.date)})</strong> to confirm your order with the kitchen.
                </p>
              </div>
              <div className="order-pending-actions">
                <button
                  className="primary order-pay-button"
                  onClick={() => retryPaystackPayment(order)}
                  disabled={payingOrderId === order.orderId}
                >
                  {payingOrderId === order.orderId
                    ? "Opening Paystack…"
                    : `Pay now · ${money(order.plates.reduce((sum, p) => sum + p.price, order.fee))}`}
                </button>
                <button
                  className="signin-back order-cancel-pending-button"
                  onClick={() => setAction("cancel")}
                >
                  Cancel order
                </button>
              </div>
              {payError && <p className="order-pay-error" role="alert">{payError}</p>}
            </div>
            <div className="order-timeline-pending">
              <Clock size={17} />
              <p>Delivery progress tracking (Confirmed → Preparing → Out for delivery → Delivered) begins once payment is confirmed.</p>
            </div>
          </>
        ) : order.status !== "Cancelled" && order.status !== "Unclaimed" && (
          <ol className="order-timeline" aria-label="Delivery progress">
            {steps.map((step, index) => {
              const currentIdx = steps.indexOf(order.status);
              const isReached = index <= currentIdx;
              const isCompleted = order.status === "Delivered" ? isReached : index < currentIdx;
              const hasLineReached = index < currentIdx;
              const label = order.isPickup && step === "Delivered" ? "Collected" : step;
              const classNames = [
                isReached ? "reached" : "",
                hasLineReached ? "line-reached" : "",
              ].filter(Boolean).join(" ");

              return (
                <li key={step} className={classNames} aria-current={step === order.status ? "step" : undefined}>
                  <span>{isCompleted ? <Check size={18} weight="bold" /> : index + 1}</span>
                  <strong>{label}</strong>
                </li>
              );
            })}
          </ol>
        )}
        <div className="order-detail-grid"><section><h2>Your packs</h2><p className="orders-subtext">{order.status === "Pending payment" ? "Your pack codes (PC1001…) will be assigned once payment is confirmed and cooking starts." : order.status === "Confirmed" ? "Sequential pack codes (PC1001…) are assigned automatically when preparation begins." : order.status === "Cancelled" ? "These packs are no longer scheduled for delivery." : order.status === "Delivered" ? (order.isPickup ? "Collected · Pack code kept for your records." : "Delivered · Pack code kept for your records.") : "Match each PC code on your screen with the preprinted code on your food pack."}</p>{order.plates.map((plate, index) => <article className="tracking-plate" key={index}><Image src={plate.image} alt={plate.name} width={120} height={110} /><div><h3>{plate.name}</h3><p>Protein: {plate.protein}</p><p>{plate.extras}</p><strong>{money(plate.price)}</strong></div>{plate.code && order.status !== "Cancelled" && <div className="plate-code"><span>Delivery code</span><strong>{formatPackCode(plate.code)}</strong></div>}</article>)}
          <div className={`order-payment-status ${order.status === "Pending payment" ? "payment-pending" : ""}`}>{order.status === "Pending payment" ? <Clock size={22} /> : <Check size={22} />}<div><strong>{order.status === "Pending payment" ? "Payment pending" : order.status === "Cancelled" ? `Delivery cancelled${order.refundStatus ? ` · refund ${order.refundStatus}` : ""}` : live ? "Payment confirmed" : "Payment confirmed · sample"}</strong><p>{money(order.plates.reduce((sum, p) => sum + p.price, order.fee))} including {order.fee > 0 ? `${money(order.fee)} delivery` : "free campus pickup"}{order.status === "Pending payment" ? " · payment has not been received yet" : ""}</p>{order.paymentReference && <span className="order-payment-ref">Ref: {order.paymentReference}</span>}</div></div>
        </section><aside className="order-delivery-info"><h2>{order.isPickup ? "Campus pickup details" : "Delivery details"}</h2>{order.isPickup && order.status === "Unclaimed" && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", color: "#991b1b", margin: "0 0 14px" }}><strong>Unclaimed Notice: </strong>{storeSettings.pickup_unclaimed_policy}</div>}{order.isPickup && (order.status === "Preparing" || order.status === "Out for delivery") && <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", color: "#92400e", margin: "0 0 14px" }}><span><strong>Holding grace:</strong> Held for {storeSettings.pickup_holding_minutes} mins after window close.</span>{storeSettings.pickup_delivery_reroute_enabled && <p style={{ margin: "6px 0 0" }}>Delayed in lecture? Request emergency hostel drop-off below.</p>}</div>}<div><CalendarBlank size={21} /><p><strong>{formatDate(order.date)}</strong>{order.window} · {order.time}</p></div><div><MapPin size={21} /><p>{order.isPickup ? `Pickup point: ${formatDisplayAddress(order.address)}` : formatDisplayAddress(order.address)}</p></div><div><Clock size={21} /><p>{order.status === "Pending payment" ? `Complete payment before ${clockText(order.cutoff)} on ${formatDate(order.date)} to guarantee your meal portion.` : editable ? `You can cancel or change this address before ${clockText(order.cutoff)} on ${formatDate(order.date)}.` : order.status === "Unclaimed" ? "Holding window has expired for this pickup." : order.status === "Cancelled" ? "This delivery has been cancelled." : "Ordering and changes are closed for this delivery."}</p></div>{editable ? <div className="order-detail-actions"><button className="primary" onClick={() => setAction("address")}>Change address</button><button className="cancel-delivery" onClick={() => setAction("cancel")}>Cancel delivery</button></div> : order.status === "Pending payment" ? <div className="order-detail-actions"><button className="primary" onClick={() => retryPaystackPayment(order)} disabled={payingOrderId === order.orderId}>{payingOrderId === order.orderId ? "Opening Paystack…" : "Pay now"}</button><button className="cancel-delivery" onClick={() => setAction("cancel")}>Cancel order</button></div> : null}<div className="order-whatsapp-wrap"><a className="order-whatsapp-button" href={`https://wa.me/${supportWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent(order.isPickup && (order.status === "Preparing" || order.status === "Out for delivery") && storeSettings.pickup_delivery_reroute_enabled ? `Hello PreChop, I have a pickup order ${order.shortRef} for ${formatDate(order.date)} (${order.window}) at ${storeSettings.pickup_station_name}. I am delayed in class/hostel. Can I arrange emergency hostel delivery?` : `Hello PreChop, I have an inquiry about my delivery ${order.shortRef} for ${formatDate(order.date)} (${order.window}).`)}`} target="_blank" rel="noopener noreferrer"><Phone size={18} /> {order.isPickup && (order.status === "Preparing" || order.status === "Out for delivery") && storeSettings.pickup_delivery_reroute_enabled ? "Request hostel delivery on WhatsApp" : "Chat with support on WhatsApp"}</a></div></aside></div>
      </> : ready && !signedIn && live ? <section className="orders-empty"><Package size={42} weight="light" /><h2>Sign in to see your deliveries.</h2><p>Your orders and delivery updates are linked to your phone account.</p><button className="primary" onClick={() => setSignInOpen(true)}>Sign in <ArrowRight size={18} /></button></section> : <><div className="orders-heading"><span className="eyebrow">GOOD FOOD, ON SCHEDULE</span><h1 ref={title} tabIndex={-1}>Your meals are on their way.</h1><p>All your deliveries, from kitchen to doorstep.</p></div><div className="orders-tabs" aria-label="Filter deliveries">{["Upcoming", "Delivered", "Cancelled"].map(tab => <button key={tab} aria-pressed={tab === filter} onClick={() => setFilter(tab)}>{tab}</button>)}</div>{!ready ? <OrdersSkeleton /> : !shown.length ? <div className="orders-empty"><Package size={42} weight="light" /><h2>No {filter.toLowerCase()} deliveries.</h2><p>Your deliveries will appear here.</p><Link href="/" className="primary">Explore the menu <ArrowRight size={18} /></Link></div> : <div className="orders-list">{shown.map(item => {
        const packCodeSummary = item.status !== "Cancelled" ? formatPackCodeSummary(item.plates.map(p => p.code)) : "";
        const mealTitle = item.plates.length > 2
          ? `${item.plates[0].name} + ${item.plates.length - 1} more`
          : item.plates.map(p => p.name).join(" + ");
        const formattedAddress = formatDisplayAddress(item.address);
        return (
          <article className="order-card" key={item.deliveryId ?? item.id}>
            <div className="order-card-top">
              {packCodeSummary ? (
                <span className="order-code-pill">{packCodeSummary}</span>
              ) : (
                <span className="order-ref-wrap">
                  <span className="order-ref-code">{item.shortRef}</span>
                  {item.status === "Confirmed" && (
                    <span className="order-ref-hint">· Code at prep</span>
                  )}
                </span>
              )}
              <span className={`order-status status-${item.status.replaceAll(" ", "-").toLowerCase()}`}>
                {item.status}
              </span>
            </div>
            <h2>
              {formatDate(item.date, { weekday: "short", day: "numeric", month: "short" })} · {item.window}
            </h2>
            <p className="order-slot">
              <Clock size={16} aria-hidden="true" />
              <span>{item.time} · {item.plates.length} {item.plates.length === 1 ? "plate" : "plates"}</span>
            </p>
            <div className="order-card-meals">
              {item.plates[0] && (
                <Image src={item.plates[0].image} alt="" width={88} height={88} unoptimized />
              )}
              <div className="order-card-meal-copy">
                <h3>{mealTitle}</h3>
                <p className="order-card-location">
                  {item.isPickup ? (
                    <Storefront size={14} weight="regular" aria-hidden="true" />
                  ) : (
                    <MapPin size={14} weight="regular" aria-hidden="true" />
                  )}
                  <span>
                    {item.isPickup ? `Campus Pickup · ${formattedAddress}` : formattedAddress}
                  </span>
                </p>
              </div>
            </div>
            <div className="order-card-bottom">
              <strong>{money(item.plates.reduce((sum, p) => sum + p.price, item.fee))}</strong>
              <button onClick={() => open(item.deliveryId ?? item.id)} aria-label={`View delivery ${item.id}`}>
                View delivery <ArrowRight size={18} />
              </button>
            </div>
          </article>
        );
      })}</div>}</>}
      {notice && <p className="order-notice" role="status">{notice}</p>}
      {action && order && <ActionDialog order={order} mode={action} close={() => setAction(null)} save={saveAction} />}
    </main>{signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={() => { setSignInOpen(false); void loadOrders(); }} />}</>;
}
