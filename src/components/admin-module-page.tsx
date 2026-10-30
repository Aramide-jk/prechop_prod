"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowClockwise, CalendarBlank, CaretLeft, CaretRight, Check, ForkKnife, MagnifyingGlass, Plus, WarningCircle } from "@phosphor-icons/react";
import { SignInDialog } from "@/components/sign-in";
import { AdminOrdersToday } from "@/components/admin-orders-today";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { money } from "@/lib/menu";

export type AdminModuleKey = "menus" | "meals" | "add-ons" | "batches" | "orders" | "deliveries" | "refunds" | "areas" | "settings";
type Row = Record<string, unknown>;
type OrderDetail = { order: Row; customer: Row | null; deliveries: Row[]; items: Row[]; stickers: Row[]; batches: Row[]; windows: Row[] };
type MenuBatch = { id: string; name: string; window: string; starts: string; ends: string };
type MenuEntry = Row & { service_date: string; meal_name: string; meal_price: number; meal_image: string; meal_active: boolean; sold: number; remaining: number; postedBatches: MenuBatch[] };
type ModuleConfig = { title: string; eyebrow: string; description: string; table: string; columns: { key: string; label: string; format?: "money" | "date" | "status" | "boolean" }[]; search: string[]; editable?: boolean; create?: { label: string; fields: { key: string; label: string; type?: string; options?: string[] }[] } };

const config: Record<AdminModuleKey, ModuleConfig> = {
  menus: { title: "Weekly menus", eyebrow: "MENU PLANNING", description: "Post meals against service dates, portions and the batches that can serve them.", table: "meal_stock_pools", columns: [{ key: "service_date", label: "Service date", format: "date" }, { key: "meal_name", label: "Meal" }, { key: "portion_limit", label: "Portions" }, { key: "batches", label: "Posted batches" }], search: ["meal_name", "service_date"], create: { label: "Post a meal", fields: [{ key: "meal_id", label: "Meal", options: [] }, { key: "batch_id", label: "Delivery batch", options: [] }, { key: "service_date", label: "Service date", type: "date" }, { key: "portion_limit", label: "Available portions", type: "number" }] } },
  meals: { title: "Meals", eyebrow: "MENU CATALOGUE", description: "Manage the dishes customers can order, including their price, photo and availability.", table: "meals", columns: [{ key: "name", label: "Meal" }, { key: "base_price_ngn", label: "Base price", format: "money" }, { key: "image_url", label: "Image" }, { key: "active", label: "Availability", format: "boolean" }], search: ["name", "slug"], editable: true, create: { label: "Add meal", fields: [{ key: "name", label: "Meal name" }, { key: "slug", label: "URL slug" }, { key: "base_price_ngn", label: "Base price (₦)", type: "number" }, { key: "description", label: "Description" }, { key: "image_url", label: "Upload image", type: "image" }] } },
  "add-ons": { title: "Proteins & extras", eyebrow: "ADD-ON CATALOGUE", description: "Set protein, side and drink prices with their shared stock limits and photos.", table: "add_on_catalog", columns: [{ key: "name", label: "Item" }, { key: "category", label: "Type" }, { key: "price_ngn", label: "Price", format: "money" }, { key: "stock_limit", label: "Stock limit" }, { key: "image_url", label: "Photo" }, { key: "active", label: "Availability", format: "boolean" }], search: ["name", "slug", "category"], editable: true, create: { label: "Add item", fields: [{ key: "name", label: "Item name" }, { key: "slug", label: "URL slug" }, { key: "category", label: "Type", options: ["protein", "side", "drink"] }, { key: "price_ngn", label: "Price (₦)", type: "number" }, { key: "stock_limit", label: "Stock limit", type: "number" }, { key: "image_url", label: "Upload image", type: "image" }] } },
  batches: { title: "Batches", eyebrow: "DELIVERY WINDOWS", description: "Control breakfast, lunch and dinner delivery slots, their cutoffs and active state.", table: "delivery_batches", columns: [{ key: "name", label: "Batch" }, { key: "window_name", label: "Window" }, { key: "delivery_starts_at", label: "Starts" }, { key: "delivery_ends_at", label: "Ends" }, { key: "cutoff_time", label: "Order cutoff" }, { key: "active", label: "Active", format: "boolean" }], search: ["name", "window_name"], editable: true, create: { label: "Add batch", fields: [{ key: "window_id", label: "Window", options: ["breakfast", "lunch", "dinner"] }, { key: "name", label: "Batch name" }, { key: "delivery_starts_at", label: "Delivery starts", type: "time" }, { key: "delivery_ends_at", label: "Delivery ends", type: "time" }, { key: "cutoff_time", label: "Ordering cutoff", type: "time" }] } },
  orders: { title: "Orders", eyebrow: "CUSTOMER ORDERS", description: "Run today’s delivery batches and review orders scheduled for future dates.", table: "orders", columns: [{ key: "service_date", label: "Delivery day", format: "date" }, { key: "window_summary", label: "Delivery window" }, { key: "customer", label: "Customer" }, { key: "status", label: "Order status", format: "status" }, { key: "payment_status", label: "Payment", format: "status" }, { key: "total_ngn", label: "Total", format: "money" }, { key: "payment_reference", label: "Paystack reference" }], search: ["customer", "payment_reference", "status"] },
  deliveries: { title: "Deliveries", eyebrow: "DELIVERY RUNS", description: "Review each delivery stop, address, plate count and sticker code at a glance.", table: "order_deliveries", columns: [{ key: "service_date", label: "Delivery date", format: "date" }, { key: "window_name", label: "Window" }, { key: "batch_name", label: "Batch" }, { key: "customer", label: "Customer" }, { key: "area_name", label: "Area" }, { key: "address_text", label: "Delivery address" }, { key: "plates_count", label: "Plates" }, { key: "sticker_codes", label: "Sticker IDs" }, { key: "status", label: "Status", format: "status" }], search: ["customer", "area_name", "window_name", "status", "address_text"] },
  refunds: { title: "Refunds & wallets", eyebrow: "CUSTOMER CREDITS", description: "Review delivery refund requests and the wallet activity linked to customer orders.", table: "customer_delivery_refunds", columns: [{ key: "created_at", label: "Requested", format: "date" }, { key: "customer", label: "Customer" }, { key: "method", label: "Destination" }, { key: "total_ngn", label: "Refund", format: "money" }, { key: "wallet_refund_ngn", label: "Wallet", format: "money" }, { key: "cash_refund_ngn", label: "Original payment", format: "money" }, { key: "status", label: "Status", format: "status" }], search: ["customer", "method", "status"] },
  areas: { title: "Delivery areas", eyebrow: "DELIVERY COVERAGE", description: "Manage the places you deliver to and the fee customers pay for each area.", table: "delivery_areas", columns: [{ key: "name", label: "Area" }, { key: "fee_ngn", label: "Delivery fee", format: "money" }, { key: "active", label: "Available", format: "boolean" }], search: ["name"], editable: true, create: { label: "Add delivery area", fields: [{ key: "name", label: "Area name" }, { key: "fee_ngn", label: "Delivery fee (₦)", type: "number" }] } },
  settings: { title: "Settings", eyebrow: "SERVICE SETTINGS", description: "Set the referral reward and review your delivery windows and campaign configuration.", table: "referral_campaign_settings", columns: [{ key: "enabled", label: "Campaign active", format: "boolean" }, { key: "referrals_required", label: "Qualified invitations" }, { key: "reward_amount_ngn", label: "Reward", format: "money" }, { key: "updated_at", label: "Last updated", format: "date" }], search: ["enabled"], create: { label: "Edit campaign settings", fields: [{ key: "enabled", label: "Campaign active", options: ["true", "false"] }, { key: "referrals_required", label: "Qualified invitations", type: "number" }, { key: "reward_amount_ngn", label: "Wallet reward (₦)", type: "number" }] } },
};

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
function todayInZaria() {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Lagos" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}
function mondayOf(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = (value.getUTCDay() + 6) % 7;
  return addDays(date, -day);
}
function formattedDay(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-NG", { ...options, timeZone: "Africa/Lagos" }).format(new Date(`${date}T12:00:00Z`));
}

const humanDate = (value: unknown) => typeof value === "string" && value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : "—";
const display = (value: unknown, format?: string) => {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money") return money(Number(value));
  if (format === "date") return humanDate(value);
  if (format === "boolean") return value ? "Active" : "Paused";
  if (format === "status") return String(value).replaceAll("_", " ");
  return String(value);
};

function TablePagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.ceil(total / pageSize);
  if (pageCount < 2) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return <nav className="admin-table-pagination" aria-label="Table pages"><span>Showing {first}–{last} of {total}</span><div><button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => onChange(page - 1)}><CaretLeft size={16} /></button><span>Page {page + 1} of {pageCount}</span><button type="button" aria-label="Next page" disabled={page + 1 >= pageCount} onClick={() => onChange(page + 1)}><CaretRight size={16} /></button></div></nav>;
}

function OrderDetailModal({ loading, error, detail, close }: { loading: boolean; error: string; detail: OrderDetail | null; close: () => void }) {
  return <div className="admin-module-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="admin-module-modal admin-order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="admin-order-detail-title"><div><span className="eyebrow">CUSTOMER ORDER</span><button type="button" aria-label="Close order details" onClick={close}>×</button><h2 id="admin-order-detail-title">Order details.</h2></div>{loading ? <div className="admin-module-loading"><span /><span /></div> : error ? <p className="error" role="alert">{error}</p> : detail && <><section className="admin-order-summary"><div><span>Customer</span><strong>{String(detail.customer?.full_name ?? "PreChop customer")}</strong><small>{String(detail.customer?.phone_e164 ?? "Phone not provided")}</small></div><div><span>Order status</span><strong className="admin-order-status">{String(detail.order.status).replaceAll("_", " ")}</strong><small>Placed {humanDate(detail.order.created_at)}</small></div></section><section className="admin-order-payment"><h3>Payment summary</h3><dl><div><dt>Meal subtotal</dt><dd>{money(Number(detail.order.subtotal_ngn))}</dd></div><div><dt>Delivery fees</dt><dd>{money(Number(detail.order.delivery_total_ngn))}</dd></div><div><dt>Wallet credit</dt><dd>−{money(Number(detail.order.wallet_applied_ngn))}</dd></div><div><dt>Paid</dt><dd>{money(Number(detail.order.amount_paid_ngn))}</dd></div><div className="is-total"><dt>Order total</dt><dd>{money(Number(detail.order.subtotal_ngn) + Number(detail.order.delivery_total_ngn) - Number(detail.order.wallet_applied_ngn))}</dd></div></dl><p>Payment: <strong>{String(detail.order.payment_status).replaceAll("_", " ")}</strong>{detail.order.payment_reference ? <> · Reference {String(detail.order.payment_reference)}</> : null}</p></section><div className="admin-order-detail-deliveries"><h3>Scheduled deliveries <span>{detail.deliveries.length}</span></h3>{detail.deliveries.map((delivery) => { const batch = detail.batches.find((entry) => entry.id === delivery.batch_id); const window = detail.windows.find((entry) => entry.id === batch?.window_id); const items = detail.items.filter((item) => item.delivery_id === delivery.id); return <article className="admin-order-detail-delivery" key={String(delivery.id)}><header><div><span>{humanDate(delivery.service_date)}</span><h4>{String(window?.window ?? "Delivery")} · {String(batch?.name ?? "Batch")}</h4></div><span className={`admin-status admin-status-${String(delivery.status)}`}>{String(delivery.status).replaceAll("_", " ")}</span></header><p className="admin-order-address">{String(delivery.area_name)} · {String(delivery.address_text)}</p>{delivery.delivery_note ? <p className="admin-order-note">Note: {String(delivery.delivery_note)}</p> : null}<ul>{items.map((item) => { const sticker = detail.stickers.find((entry) => entry.order_item_id === item.id); const extras = Array.isArray(item.extras_snapshot) ? item.extras_snapshot as Row[] : []; return <li key={String(item.id)}><div><strong>{String(item.meal_name)}</strong><span>{item.protein_name ? `Protein: ${String(item.protein_name)}` : "No protein"}{extras.length ? ` · ${extras.map((extra) => `${String(extra.name ?? "Extra")}${Number(extra.quantity) > 1 ? ` ×${String(extra.quantity)}` : ""}`).join(", ")}` : ""}</span></div><div><strong>{money(Number(item.base_price_ngn) + Number(item.protein_price_ngn) + extras.reduce((sum, extra) => sum + Number(extra.price_ngn ?? 0) * Number(extra.quantity ?? 1), 0))}</strong><small>{sticker ? `Sticker ${sticker.sticker_id}` : "Sticker assigned at preparation"}</small></div></li>; })}</ul><footer><span>{items.length} {items.length === 1 ? "plate" : "plates"}</span><span>{String(delivery.area_name)} delivery · {money(Number(delivery.area_fee_ngn))}</span></footer></article>; })}</div></>}</section></div>;
}

export function AdminModulePage({ section }: { section: AdminModuleKey }) {
  const page = config[section];
  const [rows, setRows] = useState<Row[]>([]);
  const [walletEntries, setWalletEntries] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [addonTab, setAddonTab] = useState<"protein" | "extras">("protein");
  const [orderWindowFilter, setOrderWindowFilter] = useState("all");
  const [orderTab, setOrderTab] = useState<"today" | "future">("today");
  const [tablePage, setTablePage] = useState(0);
  const [walletPage, setWalletPage] = useState(0);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [access, setAccess] = useState<"checking" | "signed_out" | "not_admin" | "allowed">("checking");
  const [signInOpen, setSignInOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [clearImage, setClearImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [windows, setWindows] = useState<Row[]>([]);
  const [selectOptions, setSelectOptions] = useState<Record<string, Row[]>>({});
  const [selectedDate, setSelectedDate] = useState(todayInZaria);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayInZaria()));
  const [windowFilter, setWindowFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setError(""); setNotice("");
    setWalletEntries([]);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError("Supabase is not configured for this environment."); setLoading(false); return; }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setAccess("signed_out"); setRows([]); setLoading(false); return; }
    const { data: adminCheck, error: adminError } = await supabase.rpc("is_admin_user");
    if (adminError) { setAccess("allowed"); setError("Admin access check is not available yet. Apply the latest admin access migration, then reload."); setLoading(false); return; }
    if (!adminCheck) { setAccess("not_admin"); setRows([]); setLoading(false); return; }
    setAccess("allowed");
    let result: { data: Row[] | null; error: { message: string } | null };
    if (section === "menus") {
      const weekEnd = addDays(weekStart, 6);
      const [pools, meals, menuLinks, batches, deliveryWindows] = await Promise.all([
        supabase.from("meal_stock_pools").select("id,meal_id,service_date,portion_limit").gte("service_date", weekStart).lte("service_date", weekEnd).order("service_date"),
        supabase.from("meals").select("id,name,base_price_ngn,image_url,active").order("name"),
        supabase.from("batch_menu_items").select("stock_pool_id,batch_id,active"),
        supabase.from("delivery_batches").select("id,name,window_id,delivery_starts_at,delivery_ends_at,active").order("delivery_starts_at"),
        supabase.from("delivery_windows").select("id,window,active").order("window"),
      ]);
      setWindows(deliveryWindows.data ?? []);
      const activeBatches = (batches.data ?? []).filter((batch: Row) => batch.active);
      setSelectOptions({ meal_id: (meals.data ?? []).filter((meal: Row) => meal.active), batch_id: activeBatches });
      const poolIds = (pools.data ?? []).map((pool: Row) => pool.id);
      const [items, deliveries] = poolIds.length ? await Promise.all([
        supabase.from("order_items").select("stock_pool_id,delivery_id").in("stock_pool_id", poolIds),
        supabase.from("order_deliveries").select("id,order_id,status").gte("service_date", weekStart).lte("service_date", weekEnd),
      ]) : [{ data: [], error: null }, { data: [], error: null }];
      const orderIds = [...new Set((deliveries.data ?? []).map((delivery: Row) => String(delivery.order_id)))];
      const orders = orderIds.length ? await supabase.from("orders").select("id,payment_status,status,reservation_expires_at").in("id", orderIds) : { data: [], error: null };
      const err = pools.error ?? meals.error ?? menuLinks.error ?? batches.error ?? deliveryWindows.error ?? items.error ?? deliveries.error ?? orders.error;
      const liveOrderIds = new Set((orders.data ?? []).filter((order: Row) => (order.payment_status === "succeeded" && order.status !== "cancelled") || (order.status === "pending_payment" && typeof order.reservation_expires_at === "string" && new Date(order.reservation_expires_at).getTime() > Date.now())).map((order: Row) => order.id));
      const activeDeliveryIds = new Set((deliveries.data ?? []).filter((delivery: Row) => delivery.status !== "cancelled" && liveOrderIds.has(delivery.order_id)).map((delivery: Row) => delivery.id));
      const soldByPool = new Map<string, number>();
      for (const item of items.data ?? []) if (activeDeliveryIds.has(item.delivery_id)) soldByPool.set(item.stock_pool_id, (soldByPool.get(item.stock_pool_id) ?? 0) + 1);
      const enriched = (pools.data ?? []).map((pool: Row) => {
        const meal = meals.data?.find((entry: Row) => entry.id === pool.meal_id);
        const postedBatches = (menuLinks.data ?? []).filter((link: Row) => link.stock_pool_id === pool.id && link.active).map((link: Row) => {
          const batch = batches.data?.find((entry: Row) => entry.id === link.batch_id);
          const window = deliveryWindows.data?.find((entry: Row) => entry.id === batch?.window_id);
          return batch?.active ? { id: batch.id, name: batch.name, window: String(window?.window ?? ""), starts: String(batch.delivery_starts_at ?? ""), ends: String(batch.delivery_ends_at ?? "") } : null;
        }).filter(Boolean);
        const sold = soldByPool.get(String(pool.id)) ?? 0;
        return { ...pool, meal_name: meal?.name ?? "Unknown meal", meal_price: meal?.base_price_ngn ?? 0, meal_image: meal?.image_url ?? "", meal_active: meal?.active ?? false, sold, remaining: Math.max(0, Number(pool.portion_limit) - sold), postedBatches };
      });
      result = { data: err ? null : enriched, error: err ? { message: err.message } : null };
    } else if (section === "batches") {
      const [batches, windows] = await Promise.all([supabase.from("delivery_batches").select("*").order("delivery_starts_at"), supabase.from("delivery_windows").select("id,window")]);
      setWindows(windows.data ?? []);
      result = { data: batches.error ? null : (batches.data ?? []).map((batch: Row) => ({ ...batch, window_name: windows.data?.find((window: Row) => window.id === batch.window_id)?.window ?? "—" })), error: batches.error ? { message: batches.error.message } : null };
    } else if (section === "orders") {
      const weekEnd = addDays(weekStart, 6);
      const [orders, profiles, deliveries, batches, deliveryWindows] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("id,full_name,phone_e164"),
        supabase.from("order_deliveries").select("id,order_id,service_date,batch_id,status").gte("service_date", weekStart).lte("service_date", weekEnd),
        supabase.from("delivery_batches").select("id,name,window_id"),
        supabase.from("delivery_windows").select("id,window"),
      ]);
      setWindows(deliveryWindows.data ?? []);
      const enriched = orders.data?.flatMap((order: Row) => {
        const scheduledDays = [...new Set((deliveries.data ?? []).filter((delivery: Row) => delivery.order_id === order.id && delivery.status !== "cancelled").map((delivery: Row) => String(delivery.service_date)))];
        return scheduledDays.map((serviceDate) => {
          const dayDeliveries = (deliveries.data ?? []).filter((delivery: Row) => delivery.order_id === order.id && delivery.service_date === serviceDate && delivery.status !== "cancelled");
          const windowsForDay = [...new Set(dayDeliveries.map((delivery: Row) => {
            const batch = batches.data?.find((entry: Row) => entry.id === delivery.batch_id);
            const window = deliveryWindows.data?.find((entry: Row) => entry.id === batch?.window_id);
            return [window?.window, batch?.name].filter(Boolean).join(" · ");
          }).filter(Boolean))];
          const windowNames = [...new Set(dayDeliveries.map((delivery: Row) => {
            const batch = batches.data?.find((entry: Row) => entry.id === delivery.batch_id);
            return deliveryWindows.data?.find((entry: Row) => entry.id === batch?.window_id)?.window;
          }).filter(Boolean).map(String))];
          return { ...order, id: `${order.id}:${serviceDate}`, order_id: order.id, service_date: serviceDate, window_names: windowNames, window_summary: windowsForDay.join(", ") || "Scheduled delivery", customer: profiles.data?.find((profile: Row) => profile.id === order.customer_id)?.full_name ?? "Customer", total_ngn: Number(order.subtotal_ngn) + Number(order.delivery_total_ngn) - Number(order.wallet_applied_ngn) };
        });
      }) ?? [];
      const err = orders.error ?? profiles.error ?? deliveries.error ?? batches.error ?? deliveryWindows.error;
      result = { data: err ? null : enriched, error: err ? { message: err.message } : null };
    } else if (section === "deliveries") {
      const [deliveries, orders, profiles, batches] = await Promise.all([supabase.from("order_deliveries").select("*").order("service_date", { ascending: false }).limit(500), supabase.from("orders").select("id,customer_id"), supabase.from("profiles").select("id,full_name,phone_e164"), supabase.from("delivery_batches").select("id,name,window_id")]);
      const windowIds = [...new Set((batches.data ?? []).map((batch: Row) => batch.window_id))];
      const windowResult = windowIds.length ? await supabase.from("delivery_windows").select("id,window").in("id", windowIds) : { data: [], error: null };
      const deliveryIds = (deliveries.data ?? []).map((delivery: Row) => delivery.id);
      const itemResult = deliveryIds.length ? await supabase.from("order_items").select("id,delivery_id,meal_name").in("delivery_id", deliveryIds) : { data: [], error: null };
      const itemIds = (itemResult.data ?? []).map((item: Row) => item.id);
      const stickerResult = itemIds.length ? await supabase.from("plate_stickers").select("order_item_id,sticker_id").in("order_item_id", itemIds) : { data: [], error: null };
      result = { data: deliveries.error ? null : (deliveries.data ?? []).map((delivery: Row) => { const order = orders.data?.find((item: Row) => item.id === delivery.order_id); const batch = batches.data?.find((item: Row) => item.id === delivery.batch_id); const deliveryItems = (itemResult.data ?? []).filter((item: Row) => item.delivery_id === delivery.id); const stickers = deliveryItems.map((item: Row) => stickerResult.data?.find((entry: Row) => entry.order_item_id === item.id)?.sticker_id).filter((id: unknown) => id !== undefined && id !== null); return { ...delivery, plates_count: deliveryItems.length, sticker_codes: stickers.length ? stickers.join(", ") : deliveryItems.length ? "Assigned at preparation" : "—", customer: profiles.data?.find((profile: Row) => profile.id === order?.customer_id)?.full_name ?? "Customer", customer_phone: profiles.data?.find((profile: Row) => profile.id === order?.customer_id)?.phone_e164 ?? "", batch_name: batch?.name ?? "—", window_name: windowResult.data?.find((window: Row) => window.id === batch?.window_id)?.window ?? "—" }; }), error: deliveries.error ? { message: deliveries.error.message } : itemResult.error ? { message: itemResult.error.message } : stickerResult.error ? { message: stickerResult.error.message } : orders.error ? { message: orders.error.message } : profiles.error ? { message: profiles.error.message } : windowResult.error ? { message: windowResult.error.message } : null };
    } else if (section === "refunds") {
      const [refunds, profiles, ledger] = await Promise.all([supabase.from("customer_delivery_refunds").select("*").order("created_at", { ascending: false }).limit(200), supabase.from("profiles").select("id,full_name"), supabase.from("wallet_entries").select("id,customer_id,kind,amount_ngn,description,created_at").order("created_at", { ascending: false }).limit(200)]);
      setWalletEntries((ledger.data ?? []).map((entry: Row) => ({ ...entry, customer: profiles.data?.find((profile: Row) => profile.id === entry.customer_id)?.full_name ?? "Customer" })));
      result = { data: refunds.error ? null : (refunds.data ?? []).map((refund: Row) => ({ ...refund, customer: profiles.data?.find((profile: Row) => profile.id === refund.customer_id)?.full_name ?? "Customer" })), error: refunds.error ? { message: refunds.error.message } : profiles.error ? { message: profiles.error.message } : null };
    } else {
      const baseQuery = supabase.from(page.table).select("*");
      result = await (section === "settings" ? baseQuery : baseQuery.order("created_at", { ascending: false })).limit(200);
    }
    if (result.error) setError(result.error.message.includes("schema cache") || result.error.message.includes("permission denied") ? "This admin data is protected until the latest admin access migration is applied in Supabase." : result.error.message);
    else setRows(result.data ?? []);
    setLoading(false);
  }, [page.table, section, weekStart]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { if (!imagePreview.startsWith("blob:")) return; const preview = imagePreview; return () => URL.revokeObjectURL(preview); }, [imagePreview]);
  const matchingRows = useMemo(() => rows.filter((row) => {
    const matchesQuery = page.search.some((key) => String(row[key] ?? "").toLowerCase().includes(query.toLowerCase()));
    const matchesAddonTab = section !== "add-ons" || (addonTab === "protein" ? row.category === "protein" : row.category === "side" || row.category === "drink");
    const matchesOrderDate = section !== "orders" || (orderTab === "future" && String(row.service_date) > todayInZaria() && row.service_date === selectedDate && (orderWindowFilter === "all" || (Array.isArray(row.window_names) && row.window_names.some((name: string) => name.toLowerCase() === orderWindowFilter.toLowerCase()))));
    return matchesQuery && matchesAddonTab && matchesOrderDate;
  }), [rows, page.search, query, section, addonTab, selectedDate, orderWindowFilter, orderTab]);
  const tablePageSize = 10;
  const effectiveTablePage = Math.min(tablePage, Math.max(0, Math.ceil(matchingRows.length / tablePageSize) - 1));
  const effectiveWalletPage = Math.min(walletPage, Math.max(0, Math.ceil(walletEntries.length / tablePageSize) - 1));
  const filtered = useMemo(() => matchingRows.slice(effectiveTablePage * tablePageSize, (effectiveTablePage + 1) * tablePageSize), [matchingRows, effectiveTablePage]);
  const paginatedWalletEntries = useMemo(() => walletEntries.slice(effectiveWalletPage * tablePageSize, (effectiveWalletPage + 1) * tablePageSize), [walletEntries, effectiveWalletPage]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const menuRows = useMemo(() => rows.filter((row) => row.service_date === selectedDate && (!query || String(row.meal_name ?? "").toLowerCase().includes(query.toLowerCase())) && (windowFilter === "all" || (Array.isArray(row.postedBatches) && row.postedBatches.some((batch: MenuBatch) => batch.window === windowFilter)))) as MenuEntry[], [rows, selectedDate, query, windowFilter]);
  const menuWindows = useMemo(() => [...new Set(windows.map((row) => String(row.window ?? "")).filter(Boolean))], [windows]);
  const moveWeek = (offset: number) => { const next = addDays(weekStart, 7 * offset); setWeekStart(next); setSelectedDate(addDays(selectedDate, 7 * offset)); };

  async function createRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !page.create) { setBusy(false); return; }
    const form = new FormData(event.currentTarget);
    const values: Row = {};
    for (const field of page.create.fields) {
      if (field.key === "image_url") continue;
      const value = String(form.get(field.key) ?? "").trim();
      if (field.key === "window_id") values.window_id = windows.find((row) => row.window === value)?.id;
      else if (field.type === "number") values[field.key] = Number(value);
      else if (field.key === "enabled") values[field.key] = value === "true";
      else values[field.key] = value;
    }
    const selectedFile = form.get("image_url");
    const uploadFile = selectedFile instanceof File && selectedFile.size > 0 ? selectedFile : imageFile;
    if (clearImage) values.image_url = "";
    if (uploadFile) {
      setUploadingImage(true);
      try {
        const imageData = new FormData();
        imageData.set("file", uploadFile);
        imageData.set("category", section === "meals" ? "meals" : "add-ons");
        const response = await fetch("/api/admin/images", { method: "POST", body: imageData });
        const result = await response.json() as { url?: string; error?: string };
        if (!response.ok || !result.url) {
          setError(result.error ?? "We could not upload that image.");
          setBusy(false); setUploadingImage(false); return;
        }
        values.image_url = result.url;
      } catch {
        setError("We could not upload that image. Check your connection and try again.");
        setBusy(false); setUploadingImage(false); return;
      }
      setUploadingImage(false);
    }
    let insertError: { message: string } | null = null;
    if (editingRow) {
      if (section === "menus") {
        const { error } = await supabase.from("meal_stock_pools").update({ meal_id: values.meal_id, service_date: values.service_date, portion_limit: values.portion_limit }).eq("id", editingRow.id);
        if (error) insertError = error;
        else {
          const { error: linkError } = await supabase.from("batch_menu_items").upsert({ stock_pool_id: editingRow.id, batch_id: values.batch_id, active: true }, { onConflict: "batch_id,stock_pool_id" });
          insertError = linkError;
        }
      } else {
        const { error } = await supabase.from(page.table).update(values).eq("id", editingRow.id);
        insertError = error;
      }
    } else if (section === "menus") {
      const pool = await supabase.from("meal_stock_pools").upsert({ meal_id: values.meal_id, service_date: values.service_date, portion_limit: values.portion_limit }, { onConflict: "meal_id,service_date" }).select("id").single();
      if (pool.error) insertError = pool.error;
      else {
        const linked = await supabase.from("batch_menu_items").upsert({ stock_pool_id: pool.data.id, batch_id: values.batch_id, active: true }, { onConflict: "batch_id,stock_pool_id" });
        if (linked.error) insertError = linked.error;
      }
    } else if (section === "settings") {
      const { error } = await supabase.from(page.table).upsert({ id: 1, ...values, updated_at: new Date().toISOString() });
      insertError = error;
    } else {
      const { error } = await supabase.from(page.table).insert(values);
      insertError = error;
    }
    if (insertError) setError(insertError.message);
    else { setCreateOpen(false); setEditingRow(null); setImageFile(null); setImagePreview(""); setClearImage(false); setNotice(`${page.create.label} saved.`); await load(); }
    setBusy(false);
  }

  async function toggleActive(row: Row) {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setBusy(true); setError("");
    const { error: updateError } = await supabase.from(page.table).update({ active: !row.active }).eq("id", row.id);
    if (updateError) setError(updateError.message); else await load();
    setBusy(false);
  }

  async function showOrderDetail(orderId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSelectedOrderId(orderId); setOrderDetail(null); setDetailError(""); setDetailLoading(true);
    try {
      const [orderResult, deliveryResult] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).single(),
        supabase.from("order_deliveries").select("*").eq("order_id", orderId).order("service_date"),
      ]);
      if (orderResult.error) throw orderResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      const [customerResult, itemResult] = await Promise.all([
        supabase.from("profiles").select("full_name,phone_e164").eq("id", orderResult.data.customer_id).maybeSingle(),
        deliveryResult.data.length ? supabase.from("order_items").select("*").in("delivery_id", deliveryResult.data.map((delivery: Row) => delivery.id)) : Promise.resolve({ data: [], error: null }),
      ]);
      if (customerResult.error) throw customerResult.error;
      if (itemResult.error) throw itemResult.error;
      const itemIds = (itemResult.data ?? []).map((item: Row) => item.id);
      const batchIds = [...new Set(deliveryResult.data.map((delivery: Row) => delivery.batch_id))];
      const [stickerResult, batchResult] = await Promise.all([
        itemIds.length ? supabase.from("plate_stickers").select("order_item_id,sticker_id").in("order_item_id", itemIds) : Promise.resolve({ data: [], error: null }),
        batchIds.length ? supabase.from("delivery_batches").select("id,name,window_id,delivery_starts_at,delivery_ends_at").in("id", batchIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (stickerResult.error) throw stickerResult.error;
      if (batchResult.error) throw batchResult.error;
      const windowIds = [...new Set((batchResult.data ?? []).map((batch: Row) => batch.window_id))];
      const windowResult = windowIds.length ? await supabase.from("delivery_windows").select("id,window").in("id", windowIds) : { data: [], error: null };
      if (windowResult.error) throw windowResult.error;
      setOrderDetail({ order: orderResult.data, customer: customerResult.data, deliveries: deliveryResult.data, items: itemResult.data ?? [], stickers: stickerResult.data ?? [], batches: batchResult.data ?? [], windows: windowResult.data ?? [] });
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "We couldn’t load this order. Try again.");
    } finally { setDetailLoading(false); }
  }

  return <main className="admin-module-page">
    {selectedOrderId && <OrderDetailModal loading={detailLoading} error={detailError} detail={orderDetail} close={() => { setSelectedOrderId(""); setOrderDetail(null); }} />}
    <header className="admin-dashboard-heading"><div><span className="eyebrow">{page.eyebrow}</span><h1>{page.title}.</h1><p>{page.description}</p></div><div className="admin-module-actions"><button className="admin-refresh" onClick={() => void load()} disabled={loading}><ArrowClockwise size={18} className={loading ? "admin-refresh-spin" : undefined} /> Refresh</button>{page.create && <button className="admin-module-primary" onClick={() => { setEditingRow(null); setCreateOpen(true); }}><Plus size={18} /> {page.create.label}</button>}</div></header>
    {access === "signed_out" && !loading && <section className="admin-access-card"><span className="admin-access-icon"><WarningCircle size={25} /></span><h2>Sign in to continue.</h2><p>Use the PreChop account approved for administrator access.</p><button className="primary" onClick={() => setSignInOpen(true)}>Sign in</button></section>}
    {access === "not_admin" && !loading && <section className="admin-access-card"><span className="admin-access-icon"><WarningCircle size={25} /></span><h2>Admin access required.</h2><p>This account is not on the PreChop admin allowlist.</p></section>}
    {access === "allowed" && <>
      {notice && <p className="admin-action-notice"><Check size={17} /> {notice}</p>}{error && <p className="error admin-report-error" role="alert">{error}</p>}
      {section === "orders" && <div className="admin-orders-view-tabs" role="tablist" aria-label="Orders view"><button type="button" role="tab" aria-selected={orderTab === "today"} className={orderTab === "today" ? "is-active" : ""} onClick={() => setOrderTab("today")}>Today’s batches <span>Live operations</span></button><button type="button" role="tab" aria-selected={orderTab === "future"} className={orderTab === "future" ? "is-active" : ""} onClick={() => { setOrderTab("future"); if (selectedDate <= todayInZaria()) { const tomorrow = addDays(todayInZaria(), 1); setSelectedDate(tomorrow); setWeekStart(mondayOf(tomorrow)); } }}>Future deliveries <span>Scheduled orders</span></button></div>}
      {section === "orders" && orderTab === "today" && <AdminOrdersToday />}
      {section === "menus" && <section className="admin-menu-summary"><div><span>Meals on this week’s menu</span><strong>{loading ? "—" : rows.length}</strong></div><div><span>Days with a menu</span><strong>{loading ? "—" : new Set(rows.map((row) => row.service_date)).size}</strong></div><div><span>Portions remaining</span><strong>{loading ? "—" : rows.reduce((sum, row) => sum + Number(row.remaining ?? 0), 0)}</strong></div></section>}
      {section !== "orders" && section !== "menus" && <section className="admin-module-stats"><div><span>Records</span><strong>{loading ? "—" : rows.length}</strong></div><p><CalendarBlank size={17} /> Data shown from the connected PreChop database</p></section>}
      {section === "orders" && orderTab === "future" && <><section className="admin-module-stats"><div><span>Upcoming orders</span><strong>{loading ? "—" : new Set(rows.filter((row) => String(row.service_date) > todayInZaria()).map((row) => row.order_id)).size}</strong></div><p><CalendarBlank size={17} /> Future deliveries only</p></section><section className="admin-menu-planner admin-orders-planner"><div className="admin-menu-week-heading"><div><span className="eyebrow">FUTURE DELIVERIES BY DATE</span><h2>{formattedDay(weekStart, { month: "long" })} {formattedDay(weekStart, { day: "numeric" })} <span>—</span> {formattedDay(addDays(weekStart, 6), { month: "long", day: "numeric", year: "numeric" })}</h2><p>Select a future delivery date to review its orders.</p></div><div className="admin-orders-controls"><label><span>Jump to date</span><input aria-label="Choose a delivery date" type="date" min={addDays(todayInZaria(), 1)} value={selectedDate} onChange={(event) => { const nextDate = event.currentTarget.value; if (!nextDate) return; setSelectedDate(nextDate); setWeekStart(mondayOf(nextDate)); }} /></label><div className="admin-menu-week-controls"><button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)}><CaretLeft size={18} /></button><button type="button" onClick={() => { const tomorrow = addDays(todayInZaria(), 1); setWeekStart(mondayOf(tomorrow)); setSelectedDate(tomorrow); }}>Next delivery</button><button type="button" aria-label="Next week" onClick={() => moveWeek(1)}><CaretRight size={18} /></button></div></div></div><div className="admin-menu-date-strip" role="tablist" aria-label="Choose future delivery day">{weekDays.map((date) => { const dayOrders = rows.filter((row) => row.service_date === date); const activeDate = selectedDate === date; return <button type="button" role="tab" aria-selected={activeDate} className={activeDate ? "is-active" : ""} key={date} onClick={() => setSelectedDate(date)} disabled={date <= todayInZaria()}><span>{formattedDay(date, { weekday: "short" })}</span><strong>{formattedDay(date, { day: "numeric" })}</strong><small>{dayOrders.length} {dayOrders.length === 1 ? "order" : "orders"}</small></button>; })}</div></section><div className="admin-order-window-filter" role="group" aria-label="Filter orders by delivery window"><span>DELIVERY WINDOW</span><button type="button" className={orderWindowFilter === "all" ? "is-active" : ""} onClick={() => setOrderWindowFilter("all")}>All windows</button>{menuWindows.map((name) => <button type="button" key={name} className={orderWindowFilter === name ? "is-active" : ""} onClick={() => setOrderWindowFilter(name)}>{name}</button>)}</div></>}
      {section === "orders" && orderTab === "today" ? null : section === "menus" ? <>
        <section className="admin-menu-planner">
          <div className="admin-menu-week-heading"><div><span className="eyebrow">YOUR SERVICE CALENDAR</span><h2>{formattedDay(weekStart, { month: "long" })} {formattedDay(weekStart, { day: "numeric" })} <span>—</span> {formattedDay(addDays(weekStart, 6), { month: "long", day: "numeric", year: "numeric" })}</h2><p>Choose a day to review or post its meals.</p></div><div className="admin-menu-week-controls"><button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)}><CaretLeft size={18} /></button><button type="button" onClick={() => { const current = mondayOf(todayInZaria()); setWeekStart(current); setSelectedDate(todayInZaria()); }}>This week</button><button type="button" aria-label="Next week" onClick={() => moveWeek(1)}><CaretRight size={18} /></button></div></div>
          <div className="admin-menu-date-strip" role="tablist" aria-label="Choose service date">{weekDays.map((date) => { const dayRows = rows.filter((row) => row.service_date === date); const activeDate = selectedDate === date; return <button type="button" role="tab" aria-selected={activeDate} className={activeDate ? "is-active" : ""} key={date} onClick={() => setSelectedDate(date)}><span>{formattedDay(date, { weekday: "short" })}</span><strong>{formattedDay(date, { day: "numeric" })}</strong><small>{dayRows.length ? `${dayRows.length} ${dayRows.length === 1 ? "meal" : "meals"}` : "No menu"}</small></button>; })}</div>
        </section>
        <section className="admin-menu-day-board">
            <div className="admin-menu-day-heading"><div><span className="eyebrow">{formattedDay(selectedDate, { weekday: "long" }).toUpperCase()}</span><h2>{formattedDay(selectedDate, { month: "long", day: "numeric" })}</h2><p>{menuRows.length} {menuRows.length === 1 ? "meal" : "meals"} {windowFilter === "all" ? "posted" : `available for ${windowFilter}`}</p></div><label className="admin-module-search"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a meal" /></label></div>
          <div className="admin-menu-filters" aria-label="Filter by delivery window"><button type="button" className={windowFilter === "all" ? "is-active" : ""} onClick={() => setWindowFilter("all")}>All windows</button>{menuWindows.map((name) => <button type="button" key={name} className={windowFilter === name ? "is-active" : ""} onClick={() => setWindowFilter(name)}>{name}</button>)}</div>
          {loading ? <div className="admin-menu-card-grid"><div className="admin-menu-card-skeleton" /><div className="admin-menu-card-skeleton" /></div> : menuRows.length === 0 ? <div className="admin-menu-empty"><span><CalendarBlank size={24} /></span><h3>{rows.some((row) => row.service_date === selectedDate) ? "No meals match this view." : "Nothing posted for this day yet."}</h3><p>{rows.some((row) => row.service_date === selectedDate) ? "Try another window or search term." : "Post a meal to make it available for customers on this date."}</p><button type="button" className="admin-module-primary" onClick={() => { setEditingRow(null); setCreateOpen(true); }}><Plus size={17} /> Post a meal</button></div> : <div className="admin-menu-card-grid">{menuRows.map((row) => <article className="admin-menu-card" key={String(row.id)}><div className="admin-menu-card-top">{row.meal_image ? <Image src={String(row.meal_image)} alt="" width={75} height={70} unoptimized /> : <div className="admin-menu-image-placeholder"><ForkKnife size={24} /></div>}<div className="admin-menu-card-copy"><div className="admin-menu-name-row"><h3>{String(row.meal_name)}</h3>{row.meal_active ? <span className="admin-menu-state">Live</span> : <span className="admin-menu-state is-paused">Meal paused</span>}</div><p>{money(Number(row.meal_price))}</p></div></div><div className="admin-menu-stock"><div><span>Remaining</span><strong className={Number(row.remaining) <= 3 ? "is-low" : ""}>{String(row.remaining)} <small>of {String(row.portion_limit)}</small></strong></div><div className="admin-menu-stock-track"><span style={{ width: `${Number(row.portion_limit) ? Math.min(100, Number(row.remaining) / Number(row.portion_limit) * 100) : 0}%` }} /></div><p>{Number(row.sold)} ordered · stock is shared across posted batches</p></div><div className="admin-menu-batch-heading"><span>DELIVERY WINDOWS</span><button type="button" onClick={() => { setEditingRow({ ...row, batch_id: row.postedBatches?.[0]?.id ?? "" }); setCreateOpen(true); }}>Adjust</button></div><div className="admin-menu-batches">{row.postedBatches.length ? row.postedBatches.map((batch) => <span key={batch.id}>{batch.window} · {batch.name}<small>{batch.starts.slice(0, 5)}–{batch.ends.slice(0, 5)}</small></span>) : <span className="is-unposted">Not linked to a delivery batch</span>}</div></article>)}</div>}
        </section>
      </> : <section className="admin-section admin-module-section">{section === "add-ons" && <div className="admin-addon-tabs" role="tablist" aria-label="Add-on category"><button type="button" role="tab" aria-selected={addonTab === "protein"} className={addonTab === "protein" ? "is-active" : ""} onClick={() => setAddonTab("protein")}>Proteins <span>{rows.filter((row) => row.category === "protein").length}</span></button><button type="button" role="tab" aria-selected={addonTab === "extras"} className={addonTab === "extras" ? "is-active" : ""} onClick={() => setAddonTab("extras")}>Extras <span>{rows.filter((row) => row.category === "side" || row.category === "drink").length}</span></button></div>}<div className="admin-section-heading"><div><span className="eyebrow">CURRENT RECORDS</span><h2>{section === "add-ons" ? addonTab === "protein" ? "Proteins" : "Extras" : page.title}</h2></div><label className="admin-module-search"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "add-ons" ? `Search ${addonTab === "protein" ? "proteins" : "extras"}` : "Search records"} /></label></div>
        {loading ? <div className="admin-module-loading"><span /><span /><span /></div> : filtered.length === 0 ? <div className="admin-module-empty"><h3>{section === "orders" ? "No orders for this delivery window." : rows.length ? "No matching records." : "Nothing here yet."}</h3><p>{section === "orders" ? "Try another delivery window or date." : rows.length ? "Try another search." : "Records will appear here when they are added to PreChop."}</p></div> : <div className="admin-table-wrap"><table className={`admin-batches-table admin-module-table ${section === "deliveries" ? "admin-deliveries-table" : ""}`}><thead><tr>{page.columns.map((column) => <th key={column.key}>{column.label}</th>)}{(page.editable || section === "settings") && <th>Action</th>}{(section === "orders" || section === "deliveries") && <th>Details</th>}</tr></thead><tbody>{filtered.map((row, index) => <tr key={String(row.id ?? index)}>{page.columns.map((column) => <td key={column.key}>{column.key === "image_url" && row.image_url ? <a href={String(row.image_url)} target="_blank" rel="noreferrer">View image</a> : <span className={column.format === "status" ? `admin-status admin-status-${String(row[column.key])}` : ""}>{display(row[column.key], column.format)}</span>}</td>)}{page.editable && <td><div className="admin-module-row-actions"><button className="admin-action-button" disabled={busy} onClick={() => { setEditingRow(row); setCreateOpen(true); }}>{section === "batches" ? "Edit times" : "Edit"}</button>{"active" in row && <button className="admin-action-button" disabled={busy} onClick={() => void toggleActive(row)}>{row.active ? "Pause" : "Make active"}</button>}</div></td>}{section === "settings" && <td><button className="admin-action-button" onClick={() => { setEditingRow(row); setCreateOpen(true); }}>Edit settings</button></td>}{(section === "orders" || section === "deliveries") && <td><button type="button" className="admin-action-button" onClick={() => void showOrderDetail(String(row.order_id ?? row.id))}>View order</button></td>}</tr>)}</tbody></table></div>}
        {!loading && <TablePagination page={effectiveTablePage} pageSize={tablePageSize} total={matchingRows.length} onChange={setTablePage} />}
      </section>}
      {section === "refunds" && <section className="admin-section admin-module-section admin-wallet-ledger"><div className="admin-section-heading"><div><span className="eyebrow">CUSTOMER CREDIT HISTORY</span><h2>Wallet activity</h2></div></div>{walletEntries.length ? <div className="admin-table-wrap"><table className="admin-batches-table admin-module-table"><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Amount</th><th>Description</th></tr></thead><tbody>{paginatedWalletEntries.map((entry) => <tr key={String(entry.id)}><td>{humanDate(entry.created_at)}</td><td>{String(entry.customer)}</td><td>{String(entry.kind).replaceAll("_", " ")}</td><td>{money(Number(entry.amount_ngn))}</td><td>{String(entry.description)}</td></tr>)}</tbody></table></div> : <div className="admin-module-empty"><h3>No wallet activity yet.</h3><p>Refunds and order credits will appear here.</p></div>}</section>}
      {section === "refunds" && <div className="admin-module-pagination-bottom"><TablePagination page={effectiveWalletPage} pageSize={tablePageSize} total={walletEntries.length} onChange={setWalletPage} /></div>}
    </>}
    {createOpen && page.create && <div className="admin-module-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCreateOpen(false); setEditingRow(null); } }}><form className="admin-module-modal" onSubmit={(event) => void createRecord(event)}><div><span className="eyebrow">{section === "settings" ? "CAMPAIGN" : editingRow ? "EDIT RECORD" : "NEW RECORD"}</span><button type="button" aria-label="Close" onClick={() => { setCreateOpen(false); setEditingRow(null); }}>×</button><h2>{editingRow ? section === "menus" ? "Adjust menu posting" : `Edit ${page.title.toLowerCase()}` : page.create.label}</h2></div>{page.create.fields.map((field) => <label key={field.key}>{field.label}{field.options ? <select name={field.key} required defaultValue={editingRow ? field.key === "window_id" ? String(windows.find((row) => row.id === editingRow.window_id)?.window ?? "") : String(editingRow[field.key] ?? "") : section === "settings" ? String(rows[0]?.[field.key] ?? "") : ""}><option value="" disabled>Select {field.label.toLowerCase()}</option>{(field.key === "window_id" ? windows.map((row) => ({ value: String(row.window), label: String(row.window) })) : (selectOptions[field.key] ?? []).length ? (selectOptions[field.key] ?? []).map((row) => ({ value: String(row.id ?? row.slug ?? row.name), label: String(row.window ?? row.name) })) : field.options.map((option) => ({ value: option, label: option }))).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "image" ? <><input name={field.key} type="file" accept="image/jpeg,image/png,image/webp" required={!editingRow && field.key === "image_url"} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setImageFile(file); setImagePreview(file ? URL.createObjectURL(file) : ""); setClearImage(false); }} />{imagePreview || (editingRow && typeof editingRow.image_url === "string" && editingRow.image_url) ? <Image className="admin-image-preview" src={imagePreview || String(editingRow?.image_url)} alt="Selected meal or add-on" width={120} height={90} unoptimized /> : null}<small className="admin-image-help">JPG, PNG or WebP · up to 8 MB.{editingRow ? " Choose a new image to replace the current one." : ""}</small></> : <input name={field.key} type={field.type ?? "text"} defaultValue={editingRow ? editingRow[field.key] == null ? undefined : String(editingRow[field.key]) : section === "menus" && field.key === "service_date" ? selectedDate : section === "settings" ? rows[0]?.[field.key] == null ? undefined : String(rows[0][field.key]) : undefined} required={field.key !== "description" && field.key !== "image_url"} min={field.type === "number" ? 0 : undefined} />}</label>)}<div className="admin-module-modal-actions"><button type="button" className="admin-refresh" onClick={() => { setCreateOpen(false); setEditingRow(null); setImageFile(null); setImagePreview(""); setClearImage(false); }}>Cancel</button><button className="admin-module-primary" disabled={busy}>{uploadingImage ? "Uploading image…" : busy ? "Saving…" : "Save"}</button></div></form></div>}
    {signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={() => { setSignInOpen(false); void load(); }} />}
  </main>;
}
