"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaymentPreview, type PaymentDetails } from "@/components/payment-preview";
import { PaymentReturnDialog } from "@/components/payment-return-dialog";
import { CheckoutSkeleton } from "@/components/skeletons";
import { SignInDialog } from "@/components/sign-in";
import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, CircleNotch, Clock, ShoppingBag, Wallet } from "@phosphor-icons/react";
import { addons, formatDate, meals, money, plateTotal, readCart, upcomingDates, type AddOn, type Meal, type Plate, type WindowName } from "@/lib/menu";

import { slots as previewSlots } from "@/lib/delivery-slots";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
const areas = [{ id: "abu", name: "ABU · Samaru campus", fee: 500 }, { id: "samaru", name: "Samaru", fee: 700 }, { id: "sabon-gari", name: "Sabon Gari", fee: 1000 }];
type Area = { id: string; name: string; fee: number };
type SavedAddress = { id: string; label: string; areaId: string; address: string; note: string };
type Delivery = { slot: string; area: string; address: string; note: string; savedAddressId: string };
type CheckoutSlot = { id: string; label: string; cutoff: string };
type CheckoutSlots = Record<WindowName, CheckoutSlot[]>;
const emptyDelivery: Delivery = { slot: "", area: "", address: "", note: "", savedAddressId: "" };

function clockLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(Date.UTC(2020, 0, 1, hour, minute)).toLocaleTimeString("en-NG", {
    hour: "numeric", minute: "2-digit", timeZone: "UTC",
  });
}

export function Checkout() {
  const router = useRouter();
  const [cart, setCart] = useState<Plate[]>([]);
  const [checkoutMeals, setCheckoutMeals] = useState<Meal[]>(meals);
  const [checkoutAddons, setCheckoutAddons] = useState<AddOn[]>(addons);
  const [walletBalance, setWalletBalance] = useState(0);
  const [ready, setReady] = useState(false);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery>>({});
  const [useCredit, setUseCredit] = useState(false);
  const [review, setReview] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<{ name: string; phone: string } | null>(null);
  const [now, setNow] = useState(0);
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [paymentEmail, setPaymentEmail] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [paystackReturn, setPaystackReturn] = useState<string | null>(null);
  const liveAuth = isSupabaseConfigured();
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("paystack") === "return") setPaystackReturn(params.get("reference") || params.get("trxref") || "");
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [areaCatalog, setAreaCatalog] = useState<Area[]>(areas);
  const [slotCatalog, setSlotCatalog] = useState<CheckoutSlots>(previewSlots);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [loadError, setLoadError] = useState("");
  const [backendReady, setBackendReady] = useState(false);
  const loadCustomerData = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoadError("Supabase is not configured."); setReady(true); setBackendReady(false); return; }
    const [userResult, areaResult, batchResult, menuResult, addonImagesResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("delivery_areas").select("id,name,fee_ngn").eq("active", true).order("name"),
      supabase.from("delivery_batches").select("id,name,delivery_starts_at,delivery_ends_at,cutoff_time,delivery_windows!inner(window,active)").eq("active", true).eq("delivery_windows.active", true).order("delivery_starts_at"),
      supabase.rpc("get_customer_menu", { p_service_date: upcomingDates()[0], p_days: 14 }),
      supabase.from("add_on_catalog").select("slug,image_url").eq("active", true),
    ]);
    if (areaResult.error || batchResult.error || menuResult.error || addonImagesResult.error) {
      setLoadError(areaResult.error?.message ?? batchResult.error?.message ?? menuResult.error?.message ?? addonImagesResult.error?.message ?? "We couldn’t load delivery options.");
      setBackendReady(false);
      setReady(true);
    } else if (areaResult.data && batchResult.data && menuResult.data) {
      setAreaCatalog((areaResult.data as { id: string; name: string; fee_ngn: number }[]).map(area => ({ id: area.id, name: area.name, fee: area.fee_ngn })));
      const liveSlots: CheckoutSlots = { Breakfast: [], Lunch: [], Dinner: [] };
      const batchRows = batchResult.data as unknown as { id: string; delivery_starts_at: string; delivery_ends_at: string; cutoff_time: string; delivery_windows: { window: string; active: boolean } }[];
      for (const batch of batchRows) {
        const window = ({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" } as Record<string, WindowName>)[batch.delivery_windows.window];
        if (!window || !batch.delivery_windows.active) continue;
        liveSlots[window].push({ id: batch.id, label: `${clockLabel(batch.delivery_starts_at)}–${clockLabel(batch.delivery_ends_at)}`, cutoff: batch.cutoff_time.slice(0, 5) });
      }
      setSlotCatalog(liveSlots);
      type MenuRow = { service_date: string; slug: string; name: string; description: string; base_price_ngn: number; image_url: string; allergen_note: string; stock_limit: number; stock_remaining: number; proteins: { slug: string; name: string; price_ngn: number; stock_limit: number }[]; extras: { slug: string; name: string; price_ngn: number; category: string; stock_limit: number }[] };
      const rows = menuResult.data as unknown as MenuRow[];
      const addonImages = new Map(((addonImagesResult.data ?? []) as { slug: string; image_url: string }[]).map(addon => [addon.slug, addon.image_url]));
      const menuBySlug = new Map<string, Meal>(); const addonsBySlug = new Map<string, AddOn>();
      for (const row of rows) {
        const meal = menuBySlug.get(row.slug) ?? { id: row.slug, name: row.name, description: row.description, price: row.base_price_ngn, stock: row.stock_limit, stockByDate: {}, image: row.image_url || "/images/beans.png", allergens: row.allergen_note, proteins: [], extras: [] };
        meal.stockByDate![row.service_date] = Math.max(meal.stockByDate?.[row.service_date] ?? 0, row.stock_remaining);
        for (const addon of [...(row.proteins ?? []), ...(row.extras ?? [])]) addonsBySlug.set(addon.slug, { id: addon.slug, name: addon.name, price: addon.price_ngn, stock: addon.stock_limit, image: addonImages.get(addon.slug) ?? "", category: "category" in addon ? addon.category === "drink" ? "Drink" : addon.category === "side" ? "Side" : "Protein" : "Protein" });
        meal.proteins = Array.from(new Set([...meal.proteins, ...(row.proteins ?? []).map(addon => addon.slug)]));
        meal.extras = Array.from(new Set([...meal.extras, ...(row.extras ?? []).map(addon => addon.slug)]));
        menuBySlug.set(row.slug, meal);
      }
      const liveMeals = [...menuBySlug.values()]; const liveAddons = [...addonsBySlug.values()];
      setCheckoutMeals(liveMeals); setCheckoutAddons(liveAddons);
      try { setCart(readCart(localStorage.getItem("mealhr-cart-v1"), liveMeals, liveAddons).filter(plate => upcomingDates().includes(plate.date))); } catch { setCart([]); }
      setReady(true);
      setBackendReady(true);
      setLoadError("");
    }
    if (userResult.error) { setLoadError(userResult.error.message); setReady(true); setBackendReady(false); return; }
    const user = userResult.data.user;
    if (!user) { setPreviewProfile(null); setSavedAddresses([]); setWalletBalance(0); return; }
    if (user.email) setPaymentEmail(user.email);
    const [profileResult, addressResult, walletReleaseResult, walletResult] = await Promise.all([
      supabase.from("profiles").select("full_name,phone_e164,email").eq("id", user.id).maybeSingle(),
      supabase.from("customer_addresses").select("id,label,area_id,address,delivery_note").eq("customer_id", user.id).order("created_at"),
      supabase.rpc("release_expired_customer_wallet_credits"),
      supabase.from("wallet_entries").select("amount_ngn").eq("customer_id", user.id),
    ]);
    if (profileResult.error || addressResult.error || walletReleaseResult.error || walletResult.error) setLoadError(profileResult.error?.message ?? addressResult.error?.message ?? walletReleaseResult.error?.message ?? walletResult.error?.message ?? "We couldn’t load your saved addresses.");
    setWalletBalance(((walletResult.data ?? []) as { amount_ngn: number }[]).reduce((sum, entry) => sum + entry.amount_ngn, 0));
    if (profileResult.data) {
      setPreviewProfile({ name: profileResult.data.full_name, phone: profileResult.data.phone_e164 });
      setPaymentEmail(profileResult.data.email || user.email || "");
    } else if (user.email) setPaymentEmail(user.email);
    setSavedAddresses(((addressResult.data ?? []) as { id: string; label: string; area_id: string; address: string; delivery_note: string }[]).map(address => ({ id: address.id, label: address.label, areaId: address.area_id, address: address.address, note: address.delivery_note })));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!liveAuth) {
        try { const dates = upcomingDates(); setCart(readCart(localStorage.getItem("mealhr-cart-v1")).filter(p => dates.includes(p.date))); } catch { /* Session storage may be unavailable. */ }
        setReady(true);
      }
      setNow(Date.now());
    }, 0);
    const interval = setInterval(() => setNow(Date.now()), 30000);
    const customerTimer = liveAuth ? setTimeout(() => { void loadCustomerData(); }, 0) : undefined;
    return () => { clearTimeout(timer); clearInterval(interval); if (customerTimer) clearTimeout(customerTimer); };
  }, [liveAuth, loadCustomerData]);
  const groups = Array.from(new Set(cart.map(p => `${p.date}|${p.window}`))).sort();
  const mealCost = cart.reduce((sum, p) => sum + (checkoutMeals.find(m => m.id === p.mealId)?.price ?? 0), 0);
  const foodTotal = cart.reduce((sum, p) => sum + plateTotal(p, checkoutMeals, checkoutAddons), 0);
  const deliveryFee = groups.reduce((sum, key) => sum + (areaCatalog.find(a => a.id === deliveries[key]?.area)?.fee ?? 0), 0);
  const allAreas = groups.every(key => deliveries[key]?.area);
  const credit = useCredit ? Math.min(liveAuth ? walletBalance : 1500, foodTotal + deliveryFee) : 0;
  const total = foodTotal + deliveryFee - credit;
  const isClosed = (date: string, cutoff: string) => now >= Date.parse(`${date}T${cutoff}:00+01:00`);
  function update(key: string, patch: Partial<Delivery>) { setReview(false); setDeliveries(current => ({ ...current, [key]: { ...emptyDelivery, ...current[key], ...patch } })); }
  const validSlots = groups.every(key => { const [date, window] = key.split("|"); const slot = slotCatalog[window as WindowName].find(s => s.id === deliveries[key]?.slot); return slot && !isClosed(date, slot.cutoff); });

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkoutBusy) return;
    if (!validSlots) return;
    setReview(true);
    if (!previewProfile) { setSignInOpen(true); return; }
    if (!liveAuth) {
      setPayment({ ...previewProfile, food: foodTotal, credit, deliveries: groups.map(key => {
        const [date, window] = key.split("|");
        const delivery = deliveries[key];
        const slot = slotCatalog[window as WindowName].find(s => s.id === delivery.slot)!;
        const area = areaCatalog.find(a => a.id === delivery.area)!;
        return { date, window, time: slot.label, cutoff: slot.cutoff, area: area.name, address: delivery.address, note: delivery.note, plates: cart.filter(p => `${p.date}|${p.window}` === key).length, fee: area.fee };
      }), email: paymentEmail.trim() });
      return;
    }
    if (!backendReady) { setLoadError("Delivery options are still loading. Please try again in a moment."); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoadError("We couldn’t connect to your account. Please refresh and try again."); return; }
    setLoadError("");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { setLoadError("Please sign in again before continuing."); return; }
    const email = paymentEmail.trim();
    const { error: emailError } = await supabase.from("profiles").update({ email, updated_at: new Date().toISOString() }).eq("id", authData.user.id);
    if (emailError) { setLoadError(`We couldn't save your email for next time: ${emailError.message}`); return; }
    {
      let hasDefaultAddress = savedAddresses.length > 0;
      for (const key of groups) {
        const delivery = deliveries[key];
        if (delivery.savedAddressId) continue;
        const area = areaCatalog.find(item => item.id === delivery.area);
        if (!area) continue;
        const { data: existingAddress, error: findAddressError } = await supabase.from("customer_addresses").select("id").eq("customer_id", authData.user.id).eq("area_id", delivery.area).eq("address", delivery.address.trim()).maybeSingle();
        if (findAddressError) { setLoadError(`We couldn't save your delivery address: ${findAddressError.message}`); return; }
        const addressPayload = { customer_id: authData.user.id, area_id: delivery.area, label: area.name.slice(0, 35), address: delivery.address.trim(), delivery_note: delivery.note.trim() };
        const addressSave = existingAddress
          ? await supabase.from("customer_addresses").update({ delivery_note: addressPayload.delivery_note, updated_at: new Date().toISOString() }).eq("id", existingAddress.id).eq("customer_id", authData.user.id)
          : await supabase.from("customer_addresses").insert({ ...addressPayload, is_default: !hasDefaultAddress });
        if (addressSave.error) { setLoadError(`We couldn't save your delivery address: ${addressSave.error.message}`); return; }
        if (!existingAddress) hasDefaultAddress = true;
      }
    }
    const payload = groups.map(key => {
      const [service_date] = key.split("|");
      const delivery = deliveries[key];
      return {
        service_date,
        batch_id: delivery.slot,
        area_id: delivery.area,
        address: delivery.address,
        delivery_note: delivery.note,
        items: cart.filter(plate => `${plate.date}|${plate.window}` === key).map(plate => ({
          meal_slug: plate.mealId,
          protein_slug: plate.protein,
          extras: Object.entries(plate.extras).filter(([, quantity]) => quantity > 0).map(([slug, quantity]) => ({ slug, quantity })),
        })),
      };
    });
    setCheckoutBusy(true);
    let checkoutResult: { data: unknown; error: { message: string } | null };
    try {
      checkoutResult = await supabase.rpc("create_customer_checkout", { p_deliveries: payload });
    } catch {
      setLoadError("We couldn’t start checkout. Check your connection and try again.");
      setCheckoutBusy(false);
      return;
    }
    const { data, error } = checkoutResult;
    if (error) { setLoadError(error.message); setCheckoutBusy(false); return; }
    const reservation = data as { order_id: string; subtotal_ngn: number; delivery_total_ngn: number; total_ngn: number; reservation_expires_at: string };
    let walletApplied = 0;
    let payableTotal = reservation.total_ngn;
    if (useCredit) {
      const { data: walletData, error: walletError } = await supabase.rpc("apply_customer_wallet_credit", { p_order_id: reservation.order_id });
      if (walletError) { setLoadError(walletError.message); setCheckoutBusy(false); return; }
      const applied = walletData as { wallet_applied_ngn: number; total_ngn: number };
      walletApplied = applied.wallet_applied_ngn;
      payableTotal = applied.total_ngn;
    }
    if (payableTotal === 0) {
      const { error: completionError } = await supabase.rpc("complete_customer_wallet_order", { p_order_id: reservation.order_id });
      if (completionError) { setLoadError(completionError.message); setCheckoutBusy(false); return; }
      try { localStorage.removeItem("mealhr-cart-v1"); } catch { /* Checkout completes even if browser storage is unavailable. */ }
      setCheckoutBusy(false);
      router.replace("/orders");
      return;
    }
    setPayment({
      ...previewProfile,
      email,
      food: reservation.subtotal_ngn,
      credit: walletApplied,
      total: payableTotal,
      deliveryTotal: reservation.delivery_total_ngn,
      reservationId: reservation.order_id,
      reservationExpiresAt: reservation.reservation_expires_at,
      deliveries: groups.map(key => {
        const [date, window] = key.split("|");
        const delivery = deliveries[key];
        const slot = slotCatalog[window as WindowName].find(s => s.id === delivery.slot)!;
        const area = areaCatalog.find(a => a.id === delivery.area)!;
        return { date, window, time: slot.label, cutoff: slot.cutoff, area: area.name, address: delivery.address, note: delivery.note, plates: cart.filter(p => `${p.date}|${p.window}` === key).length, fee: area.fee };
      }),
    });
    setCheckoutBusy(false);
  }

  if (payment && !payment.reservationId) return <main className="checkout-shell"><PaymentPreview details={payment} close={() => setPayment(null)} /></main>;
  return <>
    <main className="checkout-shell">
      <div className="checkout-title"><span className="eyebrow">A GOOD WEEK STARTS HERE</span><h1>Make it yours.</h1><p>Choose a time and address for each delivery.</p><ol className="checkout-steps" aria-label="Checkout progress"><li><Check size={15} /> Meals</li><li aria-hidden="true"><ArrowRight size={22} /></li><li aria-current="step"><span>2</span> Delivery details</li><li aria-hidden="true"><ArrowRight size={22} /></li><li>3 · Sign in & pay</li></ol></div>
      {!ready ? <CheckoutSkeleton /> : !cart.length ? <section className="checkout-empty"><ShoppingBag size={42} weight="light" /><h2>Your week is still open.</h2><p>Add a few meals, then come back to arrange delivery.</p><Link className="primary" href="/">Explore the menu <ArrowRight size={18} /></Link></section> : <form className="checkout-grid" onSubmit={submitCheckout}>
        <div className="delivery-list">{loadError && <p role="alert" className="error">{loadError}</p>}{groups.map((key, index) => {
          const [date, window] = key.split("|");
          const delivery = deliveries[key] ?? emptyDelivery;
          const available = slotCatalog[window as WindowName];
          const selectedSlot = available.find(s => s.id === delivery.slot);
          const area = areaCatalog.find(a => a.id === delivery.area);
          return <section className="delivery-card" key={key} aria-labelledby={`delivery-${index}`}>
            <div className="delivery-card-heading"><div><span className="eyebrow muted">DELIVERY {String(index + 1).padStart(2, "0")}</span><h2 id={`delivery-${index}`}>{formatDate(date, { weekday: "long", day: "numeric", month: "short" })} <span>· {window}</span></h2></div><Link href="/">Edit meals</Link></div>
            <div className="checkout-plates">{cart.filter(p => `${p.date}|${p.window}` === key).map(p => { const meal = checkoutMeals.find(m => m.id === p.mealId)!; return <div className="checkout-plate" key={p.id}><Image src={meal.image} alt="" width={76} height={76} unoptimized /><div><h3>{meal.name}</h3><p>{checkoutAddons.find(a => a.id === p.protein)?.name ?? "No protein"}</p><p>{Object.entries(p.extras).filter(([, qty]) => qty > 0).map(([id, qty]) => `${checkoutAddons.find(a => a.id === id)?.name} × ${qty}`).join(" · ") || "No extras"}</p></div><strong>{money(plateTotal(p, checkoutMeals, checkoutAddons))}</strong></div>; })}</div>
            <fieldset className="delivery-times"><legend><Clock size={17} /> Delivery time</legend><div>{available.map(slot => { const closed = isClosed(date, slot.cutoff); return <label key={slot.id} className={`${delivery.slot === slot.id ? "chosen" : ""} ${closed ? "closed" : ""}`}><input required type="radio" name={`time-${index}`} checked={delivery.slot === slot.id} disabled={closed} onChange={() => update(key, { slot: slot.id })} /><span>{slot.label}{closed && <small>Ordering closed</small>}</span></label>; })}</div><p>{selectedSlot ? `Order, cancel or change this delivery before ${selectedSlot.cutoff}. All times are in Zaria.` : "Select a delivery time to see its ordering cutoff."}</p>{available.every(s => isClosed(date, s.cutoff)) && <p className="error">This meal window has closed. Return to the menu to remove these plates and choose another day.</p>}</fieldset>
            <div className="delivery-address">{savedAddresses.length > 0 && <><label htmlFor={`saved-address-${index}`}>Use a saved address</label><select id={`saved-address-${index}`} value={delivery.savedAddressId} onChange={e => { const saved = savedAddresses.find(address => address.id === e.target.value); update(key, saved ? { savedAddressId: saved.id, area: saved.areaId, address: saved.address, note: saved.note } : { savedAddressId: "" }); }}><option value="">Enter a different address</option>{savedAddresses.map(saved => <option key={saved.id} value={saved.id}>{saved.label}</option>)}</select></>}
              <label htmlFor={`area-${index}`}>Delivery area</label><select id={`area-${index}`} required value={delivery.area} onChange={e => update(key, { area: e.target.value, savedAddressId: "" })}><option value="">Choose an area</option>{areaCatalog.map(a => <option key={a.id} value={a.id}>{a.name} · {money(a.fee)}</option>)}</select>
              <label htmlFor={`address-${index}`}>Address & landmark</label><textarea id={`address-${index}`} required minLength={8} maxLength={300} rows={2} placeholder="Hostel, department or street. Add a nearby landmark." value={delivery.address} onChange={e => update(key, { address: e.target.value, savedAddressId: "" })} />
              <label htmlFor={`note-${index}`}>Delivery note <span>(optional)</span></label><input id={`note-${index}`} maxLength={200} placeholder="Anything that will help us find you?" value={delivery.note} onChange={e => update(key, { note: e.target.value, savedAddressId: "" })} />
              {index > 0 && <button type="button" className="copy-address" onClick={() => { const first = deliveries[groups[0]]; if (first) update(key, { area: first.area, address: first.address, note: first.note, savedAddressId: first.savedAddressId }); }} disabled={!deliveries[groups[0]]?.area}>Use the first delivery’s address</button>}
            </div><div className="delivery-fee"><span>Delivery fee</span><strong>{area ? money(area.fee) : "Choose an area"}</strong></div>
          </section>;
        })}<div className="checkout-account-note"><Check size={21} /><div><h3>Your details, just once.</h3><p>You’ll sign in or create an account with your name and phone number before paying.</p></div></div><p className="preview-note">{liveAuth ? "Prices, delivery fees, stock and cutoffs are checked again before payment." : "Design preview · Sample delivery times, areas, fees and wallet balance. Address details stay on this page and are not submitted."}</p></div>
        <aside className="checkout-summary" aria-label="Order summary"><span className="eyebrow muted">YOUR WEEK, PLANNED</span><h2>Order summary</h2><p className="summary-caption">{cart.length} {cart.length === 1 ? "plate" : "plates"} · {groups.length} {groups.length === 1 ? "delivery" : "deliveries"}</p>
          <div className="summary-lines"><div><span>Meals</span><strong>{money(mealCost)}</strong></div><div><span>Proteins & extras</span><strong>{money(foodTotal - mealCost)}</strong></div><div><span>Delivery ({groups.length} trips)</span><strong>{allAreas ? money(deliveryFee) : "Select areas"}</strong></div></div>
          <div className="checkout-wallet"><div><Wallet size={21} /><h3>Wallet credit</h3></div><label><input type="checkbox" checked={useCredit} onChange={e => { setUseCredit(e.target.checked); setReview(false); }} /> {liveAuth ? "Use wallet credit" : "Use sample wallet credit"}</label><p>{liveAuth ? "Available balance" : "Preview balance"}: {money(liveAuth ? walletBalance : 1500)}</p>{useCredit && <div className="subtotal"><span>Credit applied</span><strong>−{money(credit)}</strong></div>}</div>
          <label className="checkout-email" htmlFor="checkout-email">Delivery & payment email<input id="checkout-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={checkoutBusy} value={paymentEmail} onChange={event => setPaymentEmail(event.target.value)} placeholder="you@example.com" /><small>For your payment receipt and order updates. Saved to your account for next time.</small></label>
          <div className="checkout-total"><span>{allAreas ? "Total to pay" : "Total before delivery"}</span><strong>{money(allAreas ? total : foodTotal - (useCredit ? Math.min(1500, foodTotal) : 0))}</strong></div>
          <button type="submit" className="primary" disabled={!validSlots || (liveAuth && !backendReady) || checkoutBusy} aria-busy={checkoutBusy}>{checkoutBusy ? <><CircleNotch className="button-spinner" size={19} /> Opening secure payment…</> : <>{previewProfile ? liveAuth ? `Pay securely · ${money(total)}` : `Continue to payment preview · ${money(total)}` : "Continue to sign in"} <ArrowRight size={18} /></>}</button><p className="checkout-payment-note">{liveAuth ? "Your meals are confirmed after Paystack verifies payment." : "No payment is taken in this preview."}</p>
          {review && <div className="checkout-reviewed" role="status"><Check size={23} /><div><strong>Your delivery details are ready.</strong><p>{previewProfile ? `Thanks, ${previewProfile.name}. Your details are ready. Press Pay securely to continue.` : "Sign in to continue. Your order has not been placed."}</p></div></div>}
          <p className="cancellation-note">Cancel before your delivery cutoff for a refund as wallet credit. Credit never expires and cannot be withdrawn as cash.</p>
        </aside>
      </form>}
    </main>{signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={profile => { setPreviewProfile(profile); setSignInOpen(false); setLoadError(""); void loadCustomerData(); }} />}{payment?.reservationId && <PaymentPreview details={payment} close={() => setPayment(null)} />}{paystackReturn !== null && <PaymentReturnDialog reference={paystackReturn} close={() => { setPaystackReturn(null); window.history.replaceState(null, "", "/checkout"); }} />}</>;
}
