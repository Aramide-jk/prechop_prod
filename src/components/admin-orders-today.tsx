"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, Check, Clock, CookingPot, ForkKnife, Package, Phone, Truck, WarningCircle } from "@phosphor-icons/react";
import { formatPackCode } from "@/lib/delivery-code";

type Plate = { sticker_id: number | null; meal: string; protein: string | null; extras: { name?: string; extra_name?: string; quantity?: number }[] };
type Delivery = { id: string; customer_name: string | null; phone: string | null; address: string; area: string; status: string; plates: Plate[] };
type Batch = { id: string; name: string; window: string; starts_at: string; ends_at: string; cutoff: string; deliveries: number; plates: number; status: string };
type TodayData = { service_date: string; active_deliveries: number; plates_to_prepare: number; batches: Batch[]; selected_batch_id: string | null; deliveries: Delivery[]; kitchen_totals: { name: string; kind: string; quantity: number }[] };
type ErrorBody = { error?: string };

const periods = ["all", "breakfast", "lunch", "dinner"];
const periodLabel = (value: string) => value === "all" ? "All periods" : `${value[0].toUpperCase()}${value.slice(1)}`;
const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hours, minutes)));
};
const formatDate = (date: string) => new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(new Date(`${date}T12:00:00`));
const statusLabel = (status: string) => status.replaceAll("_", " ");

export function AdminOrdersToday() {
  const [data, setData] = useState<TodayData | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [period, setPeriod] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (batchId?: string, quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/dashboard${batchId ? `?batchId=${encodeURIComponent(batchId)}` : ""}`, { cache: "no-store" });
      const result = await response.json() as TodayData & ErrorBody;
      if (!response.ok) throw new Error(result.error ?? "Today’s batches could not be loaded.");
      setData(result); setSelectedBatchId(result.selected_batch_id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Today’s batches could not be loaded.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const todaysBatches = useMemo(() => data?.batches.filter((batch) => batch.deliveries > 0 || batch.status === "orders_open") ?? [], [data]);
  const visibleBatches = useMemo(() => period === "all" ? todaysBatches : todaysBatches.filter((batch) => batch.window.toLowerCase() === period), [todaysBatches, period]);
  const selectedBatch = todaysBatches.find((batch) => batch.id === selectedBatchId) ?? null;

  async function runAction(action: string, ids: { batchId?: string; deliveryId?: string }, message: string) {
    if (actionBusy) return;
    const refreshId = ids.batchId ?? selectedBatchId;
    setActionBusy(action + (ids.batchId ?? ids.deliveryId ?? "")); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...ids }) });
      const result = await response.json() as ErrorBody;
      if (!response.ok) throw new Error(result.error ?? "That delivery update could not be saved.");
      setNotice(message);
      await load(refreshId || undefined, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That delivery update could not be saved.");
    } finally { setActionBusy(""); }
  }

  return <section className="admin-orders-today">
    <header className="admin-orders-today-heading"><div><span className="eyebrow">TODAY’S DELIVERY PLAN</span><h2>Work by delivery period.</h2><p>{data ? formatDate(data.service_date) : "Breakfast, lunch and dinner batches in one place."}</p></div><button className="admin-refresh" type="button" onClick={() => void load(selectedBatchId || undefined, true)} disabled={loading || refreshing}><ArrowClockwise size={17} className={refreshing ? "admin-refresh-spin" : undefined} /> Refresh</button></header>
    {notice && <p className="admin-action-notice" role="status"><Check size={17} /> {notice}</p>}{error && <p className="error admin-report-error" role="alert">{error}</p>}
    {data?.deliveries.some((delivery) => ["preparing", "out_for_delivery", "delivered"].includes(delivery.status) && delivery.plates.some((plate) => !plate.sticker_id)) && <p className="admin-sticker-warning" role="alert"><WarningCircle size={18} /> Some plates do not have sticker IDs yet. Start preparation to assign them.</p>}
    <div className="admin-orders-period-tabs" role="tablist" aria-label="Filter today’s batches by delivery period">{periods.map((item) => { const count = item === "all" ? todaysBatches.length : todaysBatches.filter((batch) => batch.window.toLowerCase() === item).length; return <button type="button" role="tab" aria-selected={period === item} className={period === item ? "is-active" : ""} onClick={() => { setPeriod(item); if (item !== "all") { const next = todaysBatches.find((batch) => batch.window.toLowerCase() === item); if (next && next.id !== selectedBatchId) { setSelectedBatchId(next.id); void load(next.id, true); } } }} key={item}>{periodLabel(item)} <span>{count}</span></button>; })}</div>
    {loading ? <div className="admin-module-loading"><span /><span /><span /></div> : visibleBatches.length ? <div className="admin-orders-batch-layout"><nav className="admin-orders-batch-list" aria-label="Today’s delivery batches">{visibleBatches.map((batch) => <button type="button" key={batch.id} className={selectedBatchId === batch.id ? "is-selected" : ""} onClick={() => { setSelectedBatchId(batch.id); void load(batch.id, true); }}><span className="admin-orders-batch-period">{batch.window}</span><strong>{batch.name}</strong><span className="admin-orders-batch-time"><Clock size={14} /> {formatTime(batch.starts_at)}–{formatTime(batch.ends_at)}</span><span className="admin-orders-batch-count">{batch.deliveries} deliveries · {batch.plates} plates</span><span className={`admin-status admin-status-${batch.status}`}>{statusLabel(batch.status)}</span></button>)}</nav>
      <section className="admin-orders-batch-detail"><header><div><span className="eyebrow">{selectedBatch?.window ?? "SELECTED BATCH"}</span><h3>{selectedBatch?.name ?? "Choose a batch"}</h3><p>{selectedBatch ? `${formatTime(selectedBatch.starts_at)}–${formatTime(selectedBatch.ends_at)} · cutoff ${formatTime(selectedBatch.cutoff)}` : "Select a delivery batch to see its kitchen and delivery list."}</p></div>{selectedBatch?.status === "ready_to_prepare" && <button className="admin-module-primary" type="button" disabled={!!actionBusy} onClick={() => void runAction("start_preparing", { batchId: selectedBatch.id }, `Preparation started for ${selectedBatch.name}. Sticker IDs have been assigned.`)}>{actionBusy ? "Starting…" : <><CookingPot size={16} /> Start preparing</>}</button>}{selectedBatch?.status === "preparing" && <button className="admin-module-primary" type="button" disabled={!!actionBusy} onClick={() => void runAction("dispatch_batch", { batchId: selectedBatch.id }, `${selectedBatch.name} is out for delivery.`)}>{actionBusy ? "Updating…" : <><Truck size={16} /> Start delivery</>}</button>}</header>
        <div className="admin-orders-today-columns"><section><h4><ForkKnife size={17} /> Kitchen totals</h4>{data?.kitchen_totals.length ? <ul className="admin-orders-kitchen-list">{data.kitchen_totals.map((item, index) => <li key={`${item.kind}-${item.name}-${index}`}><span><small>{item.kind}</small>{item.name}</span><strong>{item.quantity}</strong></li>)}</ul> : <p className="admin-orders-muted">No paid plates in this batch yet.</p>}</section><section><h4><Package size={17} /> Delivery stops <span>{data?.deliveries.length ?? 0}</span></h4>{data?.deliveries.length ? <div className="admin-orders-delivery-list">{data.deliveries.map((delivery, index) => <article key={delivery.id}><header><div><span>{String(index + 1).padStart(2, "0")}</span><strong>{delivery.customer_name || "PreChop customer"}</strong><small style={delivery.area === "Campus Pickup" ? { background: "#fae4d3", color: "#9f3a0a", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" } : undefined}>{delivery.area === "Campus Pickup" ? "🛍️ Campus Pickup" : delivery.area}</small></div>{delivery.phone && <a href={`tel:${delivery.phone}`} aria-label={`Call ${delivery.customer_name || "customer"}`}><Phone size={15} /> Call</a>}</header><p className="admin-orders-address">{delivery.address}</p><ul className="admin-orders-plates">{delivery.plates.map((plate, plateIndex) => <li key={`${delivery.id}-${plateIndex}`}><span><strong>{plate.sticker_id ? formatPackCode(plate.sticker_id) : "Code assigned at preparation"}</strong>{plate.meal}{plate.protein ? ` · ${plate.protein}` : " · no protein"}{plate.extras?.length ? ` · ${plate.extras.map((extra) => `${extra.name ?? extra.extra_name ?? "Extra"}${extra.quantity && extra.quantity > 1 ? ` ×${extra.quantity}` : ""}`).join(", ")}` : ""}</span></li>)}</ul>{delivery.status === "out_for_delivery" && <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}><button type="button" className="admin-delivered-button" disabled={!!actionBusy} onClick={() => void runAction("mark_delivered", { deliveryId: delivery.id }, `${delivery.customer_name || "Delivery"} marked delivered.`)}>{actionBusy === `mark_delivered${delivery.id}` ? "Saving…" : <>Mark delivered <Check size={15} /></>}</button>{delivery.area === "Campus Pickup" && <button type="button" className="admin-action-button" style={{ color: "#991b1b", borderColor: "#fecaca", padding: "6px 12px", fontSize: "12px", height: "auto" }} disabled={!!actionBusy} onClick={() => { if (confirm(`Mark pickup for ${delivery.customer_name || "customer"} as unclaimed? In accordance with food safety rules, meal will be forfeited without refund.`)) { void runAction("mark_pickup_unclaimed", { deliveryId: delivery.id }, "Pickup marked as unclaimed."); } }}>Mark unclaimed</button>}</div>}</article>)}</div> : <p className="admin-orders-muted">No confirmed deliveries in this batch yet.</p>}</section></div>
      </section>
    </div> : <div className="admin-empty-panel"><Clock size={22} /><p>{period === "all" ? "No batches are scheduled for delivery today." : `No ${periodLabel(period).toLowerCase()} batches are scheduled today.`}</p></div>}
    {data && <footer className="admin-dashboard-footer"><span>{data.active_deliveries} active deliveries · {data.plates_to_prepare} plates to prepare</span><span>Sticker IDs are allocated from the preprinted sequence when preparation starts.</span></footer>}
  </section>;
}
