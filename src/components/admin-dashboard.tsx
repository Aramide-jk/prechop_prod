"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise, ArrowRight, CaretLeft, CaretRight, Check, Clock, CookingPot, ForkKnife,
  Package, Phone, Receipt, Truck, WarningCircle,
} from "@phosphor-icons/react";
import { SignInDialog } from "@/components/sign-in";

type Batch = {
  id: string; name: string; window: string; starts_at: string; ends_at: string;
  cutoff: string; deliveries: number; plates: number; confirmed: number;
  preparing: number; out_for_delivery: number; delivered: number;
  status: "orders_open" | "no_orders" | "ready_to_prepare" | "preparing" | "out_for_delivery" | "delivered";
};
type Extra = { name?: string; quantity?: number; extra_name?: string };
type Plate = { sticker_id: number | null; meal: string; protein: string | null; extras: Extra[] };
type Delivery = {
  id: string; customer_name: string | null; phone: string | null;
  address: string; area: string; status: string; plates: Plate[];
};
type DashboardData = {
  service_date: string; active_deliveries: number; plates_to_prepare: number;
  refunds_to_review: number; batches: Batch[]; selected_batch_id: string | null;
  deliveries: Delivery[]; kitchen_totals: { name: string; kind: string; quantity: number }[];
};
type ApiError = { error?: string; code?: string; user_id?: string; project_ref?: string };
type AccessState = "checking" | "signed_out" | "not_admin" | "allowed";

function formatDate(date: string, options: Intl.DateTimeFormatOptions = { dateStyle: "full" }) {
  return new Intl.DateTimeFormat("en-NG", { ...options, timeZone: "Africa/Lagos" }).format(new Date(`${date}T12:00:00`));
}
function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hours, minutes)));
}
function batchLabel(status: Batch["status"]) {
  return ({ orders_open: "Orders open", no_orders: "No orders", ready_to_prepare: "Ready to prepare", preparing: "Preparing", out_for_delivery: "Out for delivery", delivered: "Complete" } as const)[status];
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [access, setAccess] = useState<AccessState>("checking");
  const [accessIdentity, setAccessIdentity] = useState<{ userId: string; projectRef: string } | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [batchPage, setBatchPage] = useState(0);

  const load = useCallback(async (batchId?: string, quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const query = batchId ? `?batchId=${encodeURIComponent(batchId)}` : "";
      const response = await fetch(`/api/admin/dashboard${query}`, { cache: "no-store" });
      const result = await response.json() as DashboardData & ApiError;
      if (response.status === 401) { setAccess("signed_out"); setData(null); }
      else if (response.status === 403) {
        setAccess("not_admin"); setData(null);
        if (result.user_id && result.project_ref) setAccessIdentity({ userId: result.user_id, projectRef: result.project_ref });
      }
      else if (!response.ok) { setAccess("allowed"); setError(result.error ?? "The dashboard could not be loaded."); }
      else {
        setAccess("allowed"); setData(result);
        setSelectedBatchId(result.selected_batch_id ?? "");
      }
    } catch {
      setAccess("allowed");
      setError("We couldn’t connect to the dashboard. Check your connection and try again.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedBatch = useMemo(() => data?.batches.find(batch => batch.id === selectedBatchId) ?? null, [data, selectedBatchId]);

  async function runAction(action: string, ids: { batchId?: string; deliveryId?: string }, successMessage: string) {
    if (actionBusy) return;
    const refreshBatchId = ids.batchId ?? selectedBatchId;
    if (ids.batchId) setSelectedBatchId(ids.batchId);
    setActionBusy(action + (ids.batchId ?? ids.deliveryId ?? "")); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...ids }),
      });
      const result = await response.json() as ApiError;
      if (response.status === 401) { setAccess("signed_out"); setData(null); return; }
      if (response.status === 403) {
        setAccess("not_admin"); setData(null);
        if (result.user_id && result.project_ref) setAccessIdentity({ userId: result.user_id, projectRef: result.project_ref });
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "That update could not be saved.");
      setNotice(successMessage);
      await load(refreshBatchId || undefined, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That update could not be saved.");
    } finally { setActionBusy(""); }
  }

  const statusMessage = access === "signed_out" ? "Sign in with your PreChop admin account to see daily operations." : access === "not_admin" ? "This account doesn’t have admin access yet. Add it to the admin allowlist in Supabase, then sign in again." : "";

  if (loading && !data && access === "checking") return <main className="admin-dashboard-page"><div className="admin-dashboard-skeleton"><span /><span /><span /><section /><section /></div></main>;

  if (access === "signed_out" || access === "not_admin") return <main className="admin-dashboard-page"><div className="admin-dashboard-heading"><div><span className="eyebrow">PRECHOP ADMIN</span><h1>Today, at a glance.</h1></div></div><section className="admin-access-card"><span className="admin-access-icon"><WarningCircle size={25} /></span><h2>{access === "signed_out" ? "Sign in to continue." : "Admin access required."}</h2><p>{statusMessage}</p>{access === "signed_out" ? <button className="primary" onClick={() => setSignInOpen(true)}>Sign in <ArrowRight size={18} /></button> : accessIdentity ? <div className="admin-access-diagnostic"><p>The app recognizes this signed-in account:</p><code>{accessIdentity.userId}</code><p>App project reference: <code>{accessIdentity.projectRef}</code></p><p>Compare this ID with the UID in Supabase Authentication → Users. If that user is missing there, the dashboard is open to a different Supabase project.</p></div> : <p className="admin-access-hint">The app couldn’t read the signed-in account details. Sign out and sign back in, then reload.</p>}</section>{signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={() => { setSignInOpen(false); void load(); }} />}</main>;

  if (!data) return <main className="admin-dashboard-page"><div className="admin-dashboard-heading"><div><span className="eyebrow">PRECHOP ADMIN</span><h1>Today, at a glance.</h1></div><button className="admin-refresh" onClick={() => void load()}><ArrowClockwise size={18} /> Retry</button></div>{error && <p className="error admin-report-error" role="alert">{error}</p>}</main>;

  const todayBatches = data.batches.filter(batch => batch.deliveries > 0 || batch.status === "orders_open");
  const batchPageSize = 8;
  const visibleTodayBatches = todayBatches.slice(batchPage * batchPageSize, (batchPage + 1) * batchPageSize);
  const orderBatches = todayBatches.filter(batch => batch.deliveries > 0);

  return <main className="admin-dashboard-page">
    <header className="admin-dashboard-heading">
      <div><span className="eyebrow">PRECHOP ADMIN · {formatDate(data.service_date, { weekday: "long" }).toUpperCase()}</span><h1>Today, at a glance.</h1><p>Daily kitchen and delivery operations for {formatDate(data.service_date, { day: "numeric", month: "long", year: "numeric" })}.</p></div>
      <button className="admin-refresh" onClick={() => void load(selectedBatchId || undefined, true)} disabled={loading || refreshing}><ArrowClockwise size={18} className={refreshing ? "admin-refresh-spin" : undefined} /> Refresh</button>
    </header>

    {error && <p className="error admin-report-error" role="alert">{error}</p>}
    {notice && <p className="admin-action-notice" role="status"><Check size={17} /> {notice}</p>}
    {data.deliveries.some(delivery => ["preparing", "out_for_delivery", "delivered"].includes(delivery.status) && delivery.plates.some(plate => !plate.sticker_id)) && <p className="admin-sticker-warning" role="alert"><WarningCircle size={18} /> Some plates have no delivery code. Apply the plate sticker allocation migration, then refresh this dashboard.</p>}

    <section className="admin-kpis" aria-label="Today’s summary">
      <article className="admin-kpi"><span><Truck size={20} /> ACTIVE DELIVERIES</span><strong>{data.active_deliveries}</strong><p>Paid orders scheduled for today</p></article>
      <article className="admin-kpi"><span><CookingPot size={20} /> PLATES TO PREPARE</span><strong>{data.plates_to_prepare}</strong><p>Confirmed plates waiting for the kitchen</p></article>
      <article className="admin-kpi"><span><Receipt size={20} /> REFUNDS TO REVIEW</span><strong>{data.refunds_to_review}</strong><p>Pending refund requests</p></article>
    </section>

    <section className="admin-section admin-batches-section">
      <div className="admin-section-heading"><div><span className="eyebrow">DELIVERY PLAN</span><h2>Today’s batches</h2><p className="admin-section-description">Update preparation and dispatch for a whole batch.</p></div><span className="admin-muted">{todayBatches.length} {todayBatches.length === 1 ? "batch" : "batches"}</span></div>
      {todayBatches.length ? <><div className="admin-table-wrap"><table className="admin-batches-table"><thead><tr><th>Batch</th><th>Delivery time</th><th>Cutoff</th><th>Deliveries</th><th>Plates</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visibleTodayBatches.map(batch => <tr key={batch.id} className={batch.id === selectedBatchId ? "is-selected" : undefined}>
        <td><button className="admin-batch-name" onClick={() => { setSelectedBatchId(batch.id); void load(batch.id, true); }}><strong>{batch.name}</strong><span>{batch.window}</span></button></td>
        <td>{formatTime(batch.starts_at)}–{formatTime(batch.ends_at)}</td><td>{formatTime(batch.cutoff)}</td><td>{batch.deliveries}</td><td>{batch.plates}</td><td><span className={`admin-status admin-status-${batch.status}`}>{batchLabel(batch.status)}</span></td>
        <td className="admin-batch-action">{batch.status === "ready_to_prepare" && <button className="admin-action-button" disabled={!!actionBusy} onClick={() => void runAction("start_preparing", { batchId: batch.id }, `Preparation started for ${batch.name}. Sticker IDs have been assigned.`)}>{actionBusy === `start_preparing${batch.id}` ? "Starting…" : "Start preparing"}</button>}{batch.status === "preparing" && <button className="admin-action-button" disabled={!!actionBusy} onClick={() => void runAction("dispatch_batch", { batchId: batch.id }, `${batch.name} has been marked out for delivery.`)}>{actionBusy === `dispatch_batch${batch.id}` ? "Sending…" : "Start delivery"}</button>}{!['ready_to_prepare', 'preparing'].includes(batch.status) && <button className="admin-view-batch" onClick={() => { setSelectedBatchId(batch.id); void load(batch.id, true); }}>View <ArrowRight size={15} /></button>}</td>
      </tr>)}</tbody></table></div>{todayBatches.length > batchPageSize && <nav className="admin-table-pagination" aria-label="Batch table pages"><span>Showing {batchPage * batchPageSize + 1}–{Math.min(todayBatches.length, (batchPage + 1) * batchPageSize)} of {todayBatches.length}</span><div><button type="button" aria-label="Previous page" disabled={batchPage === 0} onClick={() => setBatchPage(batchPage - 1)}><CaretLeft size={16} /></button><span>Page {batchPage + 1} of {Math.ceil(todayBatches.length / batchPageSize)}</span><button type="button" aria-label="Next page" disabled={(batchPage + 1) * batchPageSize >= todayBatches.length} onClick={() => setBatchPage(batchPage + 1)}><CaretRight size={16} /></button></div></nav>}</> : <div className="admin-empty-panel"><Clock size={22} /><p>No delivery batches are scheduled for today.</p></div>}
    </section>

    {selectedBatch && <section className="admin-operations-grid">
      <article className="admin-section admin-kitchen-card"><div className="admin-section-heading"><div><span className="eyebrow">KITCHEN TOTALS</span><h2>{selectedBatch.name}</h2></div><span className="admin-batch-time">{selectedBatch.window} · {formatTime(selectedBatch.starts_at)}</span></div>
        {data.kitchen_totals.length ? <ul className="admin-kitchen-list">{data.kitchen_totals.map((item, index) => <li key={`${item.kind}-${item.name}-${index}`}><span><small>{item.kind}</small>{item.name}</span><strong>{item.quantity}</strong></li>)}</ul> : <div className="admin-empty-panel compact"><ForkKnife size={21} /><p>No paid plates in this batch yet.</p></div>}
      </article>
      <article className="admin-section admin-packing-card"><div className="admin-section-heading"><div><span className="eyebrow">PACKING & DELIVERY</span><h2>Delivery list</h2></div><span className="admin-muted">{data.deliveries.length} stops</span></div>
        {data.deliveries.length ? <div className="admin-delivery-list">{data.deliveries.map((delivery, index) => <section className="admin-delivery-row" key={delivery.id}><div className="admin-delivery-top"><span className="admin-delivery-index">{String(index + 1).padStart(2, "0")}</span><div className="admin-delivery-customer"><strong>{delivery.customer_name || "PreChop customer"}</strong><span>{delivery.area}</span></div>{delivery.phone && <a className="admin-call-link" href={`tel:${delivery.phone}`} aria-label={`Call ${delivery.customer_name || "customer"}`}><Phone size={17} /> Call</a>}</div><p className="admin-delivery-address">{delivery.address}</p>
          <div className="admin-plate-tags">{delivery.plates.map((plate, plateIndex) => <span className="admin-plate-tag" key={`${delivery.id}-${plateIndex}`}><Package size={15} /><span><strong>{plate.sticker_id ? `DELIVERY CODE · ${plate.sticker_id}` : "Sticker pending"}</strong>{plate.meal}{plate.protein ? ` · ${plate.protein}` : " · no protein"}</span></span>)}</div>
          {delivery.plates.some(plate => plate.extras?.length) && <p className="admin-delivery-extras">Extras: {delivery.plates.flatMap(plate => plate.extras ?? []).map(extra => `${extra.name ?? extra.extra_name ?? "Extra"}${extra.quantity && extra.quantity > 1 ? ` ×${extra.quantity}` : ""}`).join(", ")}</p>}
          {delivery.status === "out_for_delivery" && <button className="admin-delivered-button" disabled={!!actionBusy} onClick={() => void runAction("mark_delivered", { deliveryId: delivery.id }, `${delivery.customer_name || "Delivery"} marked delivered.`)}>{actionBusy === `mark_delivered${delivery.id}` ? "Saving…" : <>Mark delivered <Check size={16} /></>}</button>}
        </section>)}</div> : <div className="admin-empty-panel compact"><Truck size={21} /><p>No confirmed deliveries in this batch.</p></div>}
      </article>
    </section>}

    {!selectedBatch && orderBatches.length === 0 && <section className="admin-empty-day"><span><ForkKnife size={25} /></span><h2>A little breathing room.</h2><p>There are no paid deliveries scheduled for today. New orders will appear here automatically.</p></section>}
    <footer className="admin-dashboard-footer"><span>All times shown in West Africa Time.</span><span>Sticker IDs are assigned from your preprinted sequence when preparation starts.</span></footer>
  </main>;
}
