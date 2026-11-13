"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowClockwise, CalendarBlank, CaretLeft, CaretRight, Check, FloppyDisk, ForkKnife, Gift, MagnifyingGlass, Megaphone, Phone, Plus, Storefront, WarningCircle } from "@phosphor-icons/react";
import {
  defaultStoreSettings,
  isCampaignLive,
  parseStoreSettings,
  type FeaturedClaimBehavior,
  type FeaturedUnlockRule,
  type StoreSettings,
} from "@/lib/settings";
import { SignInDialog } from "@/components/sign-in";
import { AdminOrdersToday } from "@/components/admin-orders-today";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { money } from "@/lib/menu";
import { formatPackCode } from "@/lib/delivery-code";

type AdminMealOption = {
  slug: string;
  name: string;
  image_url: string;
  base_price_ngn: number;
  active: boolean;
};

type AdminCampaignTopReferrer = {
  referrer_id: string;
  full_name: string;
  phone_e164: string;
  referral_code: string;
  link_visits: number;
  pending_count: number;
  qualified_count: number;
  earned_credit_ngn: number;
  claim_status: string;
};

type AdminCampaignReport = {
  total_link_visits: number;
  unique_referrers_with_visits: number;
  pending_signups: number;
  qualified_referrals: number;
  total_wallet_credit_disbursed_ngn: number;
  claimed_meals_count: number;
  bonus_prizes_cost_ngn: number;
  top_referrers: AdminCampaignTopReferrer[];
};

function toDateTimeLocalValue(isoValue: string | null): string {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocalValue(localValue: string): string | null {
  if (!localValue || !localValue.trim()) return null;
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export type AdminModuleKey = "menus" | "meals" | "add-ons" | "batches" | "orders" | "deliveries" | "refunds" | "areas" | "settings" | "audit-log";
type Row = Record<string, unknown>;
type OrderDetail = { order: Row; customer: Row | null; deliveries: Row[]; items: Row[]; stickers: Row[]; batches: Row[]; windows: Row[] };
type MenuBatch = { id: string; name: string; window: string; starts: string; ends: string };
type MenuEntry = Row & { service_date: string; meal_name: string; meal_price: number; meal_image: string; meal_active: boolean; sold: number; remaining: number; postedBatches: MenuBatch[] };
type ModuleConfig = {
  title: string;
  eyebrow: string;
  description: string;
  table: string;
  columns: { key: string; label: string; format?: "money" | "date" | "status" | "boolean" }[];
  search: string[];
  editable?: boolean;
  create?: { label: string; fields: { key: string; label: string; type?: string; options?: string[] }[] };
};

const config: Record<AdminModuleKey, ModuleConfig> = {
  menus: {
    title: "Weekly menus",
    eyebrow: "MENU PLANNING",
    description: "Post meals against service dates, portions and the batches that can serve them.",
    table: "meal_stock_pools",
    columns: [
      { key: "service_date", label: "Service date", format: "date" },
      { key: "meal_name", label: "Meal" },
      { key: "portion_limit", label: "Portions" },
      { key: "batches", label: "Posted batches" },
    ],
    search: ["meal_name", "service_date"],
    create: {
      label: "Post a meal",
      fields: [
        { key: "meal_id", label: "Meal", options: [] },
        { key: "service_date", label: "Service date", type: "date" },
        { key: "portion_limit", label: "Available portions", type: "number" },
      ],
    },
  },
  meals: {
    title: "Meals",
    eyebrow: "MENU CATALOGUE",
    description: "Manage dishes customers can order, their prices, photos, and attached proteins & extras.",
    table: "meals",
    columns: [
      { key: "name", label: "Meal" },
      { key: "base_price_ngn", label: "Base price", format: "money" },
      { key: "protein_summary", label: "Proteins" },
      { key: "extra_summary", label: "Extras" },
      { key: "image_url", label: "Image" },
      { key: "active", label: "Availability", format: "boolean" },
    ],
    search: ["name", "slug"],
    editable: true,
    create: {
      label: "Add meal",
      fields: [
        { key: "name", label: "Meal name" },
        { key: "slug", label: "URL slug" },
        { key: "base_price_ngn", label: "Base price (₦)", type: "number" },
        { key: "description", label: "Description" },
        { key: "allergen_note", label: "Allergen notes" },
        { key: "image_url", label: "Upload image", type: "image" },
      ],
    },
  },
  "add-ons": {
    title: "Proteins & extras",
    eyebrow: "ADD-ON CATALOGUE",
    description: "Set protein, side and drink prices with their shared stock limits and photos.",
    table: "add_on_catalog",
    columns: [
      { key: "name", label: "Item" },
      { key: "category", label: "Type" },
      { key: "price_ngn", label: "Price", format: "money" },
      { key: "stock_limit", label: "Stock limit" },
      { key: "image_url", label: "Photo" },
      { key: "active", label: "Availability", format: "boolean" },
    ],
    search: ["name", "slug", "category"],
    editable: true,
    create: {
      label: "Add item",
      fields: [
        { key: "name", label: "Item name" },
        { key: "slug", label: "URL slug" },
        { key: "category", label: "Type", options: ["protein", "side", "drink"] },
        { key: "price_ngn", label: "Price (₦)", type: "number" },
        { key: "stock_limit", label: "Stock limit", type: "number" },
        { key: "image_url", label: "Upload image", type: "image" },
      ],
    },
  },
  batches: {
    title: "Batches",
    eyebrow: "DELIVERY WINDOWS",
    description: "Control breakfast, lunch and dinner delivery slots, their cutoffs and active state.",
    table: "delivery_batches",
    columns: [
      { key: "name", label: "Batch" },
      { key: "window_name", label: "Window" },
      { key: "delivery_starts_at", label: "Starts" },
      { key: "delivery_ends_at", label: "Ends" },
      { key: "cutoff_time", label: "Order cutoff" },
      { key: "active", label: "Active", format: "boolean" },
    ],
    search: ["name", "window_name"],
    editable: true,
    create: {
      label: "Add batch",
      fields: [
        { key: "window_id", label: "Window", options: ["breakfast", "lunch", "dinner"] },
        { key: "name", label: "Batch name" },
        { key: "delivery_starts_at", label: "Delivery starts", type: "time" },
        { key: "delivery_ends_at", label: "Delivery ends", type: "time" },
        { key: "cutoff_time", label: "Ordering cutoff", type: "time" },
      ],
    },
  },
  orders: {
    title: "Orders",
    eyebrow: "CUSTOMER ORDERS",
    description: "Run today’s delivery batches and review orders scheduled for future dates.",
    table: "orders",
    columns: [
      { key: "service_date", label: "Delivery day", format: "date" },
      { key: "window_summary", label: "Delivery window" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Order status", format: "status" },
      { key: "payment_status", label: "Payment", format: "status" },
      { key: "total_ngn", label: "Total", format: "money" },
      { key: "payment_reference", label: "Paystack reference" },
    ],
    search: ["customer", "payment_reference", "status"],
  },
  deliveries: {
    title: "Deliveries",
    eyebrow: "DELIVERY RUNS",
    description: "Review each delivery stop, address, plate count and sticker code at a glance.",
    table: "order_deliveries",
    columns: [
      { key: "service_date", label: "Delivery date", format: "date" },
      { key: "window_name", label: "Window" },
      { key: "batch_name", label: "Batch" },
      { key: "customer", label: "Customer" },
      { key: "area_name", label: "Area" },
      { key: "address_text", label: "Delivery address" },
      { key: "plates_count", label: "Plates" },
      { key: "sticker_codes", label: "Sticker IDs" },
      { key: "status", label: "Status", format: "status" },
    ],
    search: ["customer", "area_name", "window_name", "status", "address_text"],
  },
  refunds: {
    title: "Refunds & wallets",
    eyebrow: "CUSTOMER CREDITS",
    description: "Review delivery refund requests and resolve pending credits for customer orders.",
    table: "customer_delivery_refunds",
    columns: [
      { key: "created_at", label: "Requested", format: "date" },
      { key: "customer", label: "Customer" },
      { key: "method", label: "Destination" },
      { key: "total_ngn", label: "Refund", format: "money" },
      { key: "wallet_refund_ngn", label: "Wallet", format: "money" },
      { key: "cash_refund_ngn", label: "Original payment", format: "money" },
      { key: "status", label: "Status", format: "status" },
    ],
    search: ["customer", "method", "status"],
  },
  areas: {
    title: "Delivery areas",
    eyebrow: "DELIVERY COVERAGE",
    description: "Manage the places you deliver to and the fee customers pay for each area.",
    table: "delivery_areas",
    columns: [
      { key: "name", label: "Area" },
      { key: "fee_ngn", label: "Delivery fee", format: "money" },
      { key: "active", label: "Available", format: "boolean" },
    ],
    search: ["name"],
    editable: true,
    create: {
      label: "Add delivery area",
      fields: [
        { key: "name", label: "Area name" },
        { key: "fee_ngn", label: "Delivery fee (₦)", type: "number" },
      ],
    },
  },
  settings: {
    title: "Settings",
    eyebrow: "SERVICE SETTINGS",
    description: "Manage WhatsApp customer support, announcement banner, store operational status, and referral rewards.",
    table: "referral_campaign_settings",
    columns: [
      { key: "service_active", label: "Store open", format: "boolean" },
      { key: "whatsapp_number", label: "WhatsApp support" },
      { key: "support_email", label: "Support email" },
      { key: "announcement_banner", label: "Notice banner" },
      { key: "enabled", label: "Campaign active", format: "boolean" },
      { key: "reward_amount_ngn", label: "Reward", format: "money" },
    ],
    search: ["whatsapp_number", "support_email"],
    create: {
      label: "Edit settings",
      fields: [
        { key: "service_active", label: "Store open for orders", options: ["true", "false"] },
        { key: "service_paused_message", label: "Store pause notice (shown when store closed)" },
        { key: "whatsapp_number", label: "WhatsApp support phone number (e.g. +2348031234567)" },
        { key: "support_email", label: "Support email address" },
        { key: "announcement_banner", label: "Header marquee announcement banner (optional)" },
        { key: "enabled", label: "Referral campaign active", options: ["true", "false"] },
        { key: "referrals_required", label: "Qualified invitations required", type: "number" },
        { key: "reward_amount_ngn", label: "Wallet reward (₦)", type: "number" },
      ],
    },
  },
  "audit-log": {
    title: "Audit log & traffic",
    eyebrow: "ACTIVITY & VISITORS",
    description: "Review daily unique site visitors, customer order conversions, and operational activity trails.",
    table: "admin_audit_logs",
    columns: [
      { key: "created_at", label: "Date & time", format: "date" },
      { key: "admin_email", label: "Admin user" },
      { key: "category", label: "Module" },
      { key: "action", label: "Action" },
      { key: "details", label: "Details" },
    ],
    search: ["admin_email", "category", "action", "details"],
  },
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

function OrderDetailModal({
  loading,
  error,
  detail,
  close,
  onCancelDelivery,
  onMarkUnclaimed,
  onRerouteDelivery,
}: {
  loading: boolean;
  error: string;
  detail: OrderDetail | null;
  close: () => void;
  onCancelDelivery?: (deliveryId: string) => void;
  onMarkUnclaimed?: (deliveryId: string) => void;
  onRerouteDelivery?: (deliveryId: string) => void;
}) {
  return <div className="admin-module-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="admin-module-modal admin-order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="admin-order-detail-title"><div><span className="eyebrow">CUSTOMER ORDER</span><button type="button" aria-label="Close order details" onClick={close}>×</button><h2 id="admin-order-detail-title">Order details.</h2></div>{loading ? <div className="admin-module-loading"><span /><span /></div> : error ? <p className="error" role="alert">{error}</p> : detail && <><section className="admin-order-summary"><div><span>Customer</span><strong>{String(detail.customer?.full_name ?? "PreChop customer")}</strong><small>{String(detail.customer?.phone_e164 ?? "Phone not provided")}</small></div><div><span>Order status</span><strong className="admin-order-status">{String(detail.order.status).replaceAll("_", " ")}</strong><small>Placed {humanDate(detail.order.created_at)}</small></div></section><section className="admin-order-payment"><h3>Payment summary</h3><dl><div><dt>Meal subtotal</dt><dd>{money(Number(detail.order.subtotal_ngn))}</dd></div><div><dt>Delivery fees</dt><dd>{money(Number(detail.order.delivery_total_ngn))}</dd></div><div><dt>Wallet credit</dt><dd>−{money(Number(detail.order.wallet_applied_ngn))}</dd></div><div><dt>Paid</dt><dd>{money(Number(detail.order.amount_paid_ngn))}</dd></div><div className="is-total"><dt>Order total</dt><dd>{money(Number(detail.order.subtotal_ngn) + Number(detail.order.delivery_total_ngn) - Number(detail.order.wallet_applied_ngn))}</dd></div></dl><p>Payment: <strong>{String(detail.order.payment_status).replaceAll("_", " ")}</strong>{detail.order.payment_reference ? <> · Reference {String(detail.order.payment_reference)}</> : null}</p></section><div className="admin-order-detail-deliveries"><h3>Scheduled deliveries <span>{detail.deliveries.length}</span></h3>{detail.deliveries.map((delivery) => { const batch = detail.batches.find((entry) => entry.id === delivery.batch_id); const window = detail.windows.find((entry) => entry.id === batch?.window_id); const items = detail.items.filter((item) => item.delivery_id === delivery.id); const canCancel = delivery.status !== "delivered" && delivery.status !== "cancelled"; const isPickup = delivery.fulfillment_type === "pickup" || delivery.area_name === "Campus Pickup"; return <article className="admin-order-detail-delivery" key={String(delivery.id)}><header><div><span>{humanDate(delivery.service_date)}</span><h4>{isPickup ? "🛍️ Campus Pickup" : String(window?.window ?? "Delivery")} · {String(batch?.name ?? "Batch")}</h4></div><span className={`admin-status admin-status-${String(delivery.status)}`}>{String(delivery.status).replaceAll("_", " ")}</span></header><p className="admin-order-address">{isPickup ? "🛍️ Pickup Point: " : `${String(delivery.area_name)} · `}{String(delivery.address_text)}</p>{delivery.delivery_note ? <p className="admin-order-note">Note: {String(delivery.delivery_note)}</p> : null}<ul>{items.map((item) => { const sticker = detail.stickers.find((entry) => entry.order_item_id === item.id); const extras = Array.isArray(item.extras_snapshot) ? item.extras_snapshot as Row[] : []; return <li key={String(item.id)}><div><strong>{String(item.meal_name)}</strong><span>{item.protein_name ? `Protein: ${String(item.protein_name)}` : "No protein"}{extras.length ? ` · ${extras.map((extra) => `${String(extra.name ?? "Extra")}${Number(extra.quantity) > 1 ? ` ×${String(extra.quantity)}` : ""}`).join(", ")}` : ""}</span></div><div><strong>{money(Number(item.base_price_ngn) + Number(item.protein_price_ngn) + extras.reduce((sum, extra) => sum + Number(extra.price_ngn ?? 0) * Number(extra.quantity ?? 1), 0))}</strong><small>{sticker ? formatPackCode(sticker.sticker_id as number | string) : "Code assigned at preparation"}</small></div></li>; })}</ul><footer><div><span>{items.length} {items.length === 1 ? "plate" : "plates"}</span> · <span>{isPickup ? "Campus pickup · Free" : `${String(delivery.area_name)} delivery · ${money(Number(delivery.area_fee_ngn))}`}</span></div>{canCancel && isPickup && onMarkUnclaimed && <button type="button" className="admin-action-button" style={{ color: "#991b1b", borderColor: "#fecaca" }} onClick={() => onMarkUnclaimed(String(delivery.id))}>Mark unclaimed</button>}{canCancel && isPickup && onRerouteDelivery && <button type="button" className="admin-action-button" style={{ color: "#d97706", borderColor: "#fde68a" }} onClick={() => onRerouteDelivery(String(delivery.id))}>Reroute to delivery</button>}{canCancel && onCancelDelivery && <button type="button" className="admin-action-button" style={{ color: "#ba3c11", borderColor: "#edd6c5" }} onClick={() => onCancelDelivery(String(delivery.id))}>Cancel delivery</button>}</footer></article>; })}</div></>}</section></div>;
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
  const [batchesList, setBatchesList] = useState<Row[]>([]);
  const [selectOptions, setSelectOptions] = useState<Record<string, Row[]>>({});
  const [selectedDate, setSelectedDate] = useState(todayInZaria);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayInZaria()));
  const [windowFilter, setWindowFilter] = useState("all");

  // Meal customization links state
  const [availableProteins, setAvailableProteins] = useState<Row[]>([]);
  const [availableExtras, setAvailableExtras] = useState<Row[]>([]);
  const [selectedProteins, setSelectedProteins] = useState<string[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [settingsForm, setSettingsForm] = useState<StoreSettings>(defaultStoreSettings);

  // Modals for admin operations
  const [cancelModalDeliveryId, setCancelModalDeliveryId] = useState<string | null>(null);
  const [cancelRefundMethod, setCancelRefundMethod] = useState<"wallet" | "original">("wallet");
  const [cancelReason, setCancelReason] = useState("");
  const [unclaimedModalDeliveryId, setUnclaimedModalDeliveryId] = useState<string | null>(null);
  const [unclaimedReason, setUnclaimedReason] = useState("");
  const [rerouteModalDeliveryId, setRerouteModalDeliveryId] = useState<string | null>(null);
  const [rerouteAddress, setRerouteAddress] = useState("");
  const [rerouteAreaName, setRerouteAreaName] = useState("ABU Samaru");

  const [resolveRefundRow, setResolveRefundRow] = useState<Row | null>(null);
  const [resolveMethod, setResolveMethod] = useState<"wallet" | "offline_paid" | "failed">("wallet");
  const [resolveNotes, setResolveNotes] = useState("");

  // Audit log & traffic state
  const [trafficData, setTrafficData] = useState<Row[]>([]);
  const [auditMetrics, setAuditMetrics] = useState<Record<string, number>>({});
  const [auditTab, setAuditTab] = useState<"traffic" | "campaign" | "activity">("traffic");
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>("all");
  const [availableSettingsMeals, setAvailableSettingsMeals] = useState<AdminMealOption[]>([]);
  const [missingCampaignSchema, setMissingCampaignSchema] = useState(false);
  const [campaignReport, setCampaignReport] = useState<AdminCampaignReport | null>(null);
  const [campaignReportError, setCampaignReportError] = useState("");

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
      setBatchesList(activeBatches);
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
    } else if (section === "meals") {
      const [mealsResult, addonCatalog, mealProteins, mealExtras] = await Promise.all([
        supabase.from("meals").select("*").order("name"),
        supabase.from("add_on_catalog").select("id,slug,name,category,price_ngn").eq("active", true).order("name"),
        supabase.from("meal_proteins").select("meal_id,addon_id").eq("active", true),
        supabase.from("meal_extras").select("meal_id,addon_id").eq("active", true),
      ]);
      const proteins = (addonCatalog.data ?? []).filter((item: Row) => item.category === "protein");
      const extras = (addonCatalog.data ?? []).filter((item: Row) => item.category === "side" || item.category === "drink");
      setAvailableProteins(proteins);
      setAvailableExtras(extras);
      const enriched = (mealsResult.data ?? []).map((meal: Row) => {
        const attachedProteinIds = (mealProteins.data ?? []).filter((mp: Row) => mp.meal_id === meal.id).map((mp: Row) => mp.addon_id);
        const attachedExtraIds = (mealExtras.data ?? []).filter((me: Row) => me.meal_id === meal.id).map((me: Row) => me.addon_id);
        const proteinNames = attachedProteinIds.map((id: unknown) => proteins.find((p: Row) => p.id === id)?.name).filter(Boolean);
        const extraNames = attachedExtraIds.map((id: unknown) => extras.find((e: Row) => e.id === id)?.name).filter(Boolean);
        return {
          ...meal,
          attachedProteinIds,
          attachedExtraIds,
          protein_summary: proteinNames.length ? proteinNames.join(", ") : "None assigned",
          extra_summary: extraNames.length ? extraNames.join(", ") : "None assigned",
        };
      });
      result = { data: mealsResult.error ? null : enriched, error: mealsResult.error ? { message: mealsResult.error.message } : null };
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
      result = { data: deliveries.error ? null : (deliveries.data ?? []).map((delivery: Row) => { const order = orders.data?.find((item: Row) => item.id === delivery.order_id); const batch = batches.data?.find((item: Row) => item.id === delivery.batch_id); const deliveryItems = (itemResult.data ?? []).filter((item: Row) => item.delivery_id === delivery.id); const stickers = deliveryItems.map((item: Row) => stickerResult.data?.find((entry: Row) => entry.order_item_id === item.id)?.sticker_id).filter((id: unknown) => id !== undefined && id !== null).map((id: unknown) => formatPackCode(id as number | string)); return { ...delivery, plates_count: deliveryItems.length, sticker_codes: stickers.length ? stickers.join(", ") : deliveryItems.length ? "Assigned at preparation" : "—", customer: profiles.data?.find((profile: Row) => profile.id === order?.customer_id)?.full_name ?? "Customer", customer_phone: profiles.data?.find((profile: Row) => profile.id === order?.customer_id)?.phone_e164 ?? "", batch_name: batch?.name ?? "—", window_name: windowResult.data?.find((window: Row) => window.id === batch?.window_id)?.window ?? "—" }; }), error: deliveries.error ? { message: deliveries.error.message } : itemResult.error ? { message: itemResult.error.message } : stickerResult.error ? { message: stickerResult.error.message } : orders.error ? { message: orders.error.message } : profiles.error ? { message: profiles.error.message } : windowResult.error ? { message: windowResult.error.message } : null };
    } else if (section === "refunds") {
      const [refunds, profiles, ledger] = await Promise.all([supabase.from("customer_delivery_refunds").select("*").order("created_at", { ascending: false }).limit(200), supabase.from("profiles").select("id,full_name"), supabase.from("wallet_entries").select("id,customer_id,kind,amount_ngn,description,created_at").order("created_at", { ascending: false }).limit(200)]);
      setWalletEntries((ledger.data ?? []).map((entry: Row) => ({ ...entry, customer: profiles.data?.find((profile: Row) => profile.id === entry.customer_id)?.full_name ?? "Customer" })));
      result = { data: refunds.error ? null : (refunds.data ?? []).map((refund: Row) => ({ ...refund, customer: profiles.data?.find((profile: Row) => profile.id === refund.customer_id)?.full_name ?? "Customer" })), error: refunds.error ? { message: refunds.error.message } : profiles.error ? { message: profiles.error.message } : null };
    } else if (section === "audit-log") {
      const [{ data, error }, reportRes] = await Promise.all([
        supabase.rpc("get_admin_audit_and_traffic", { p_days: 14 }),
        fetch("/api/admin/campaign-report", { cache: "no-store" }).catch(() => null),
      ]);
      if (reportRes) {
        try {
          const parsedReport = (await reportRes.json()) as { report?: AdminCampaignReport; error?: string };
          if (reportRes.ok && parsedReport.report) {
            setCampaignReport(parsedReport.report);
            setCampaignReportError("");
          } else if (parsedReport.error) {
            setCampaignReportError(parsedReport.error);
          }
        } catch {
          setCampaignReportError("Could not parse campaign report.");
        }
      }
      if (error) {
        result = { data: null, error: { message: error.message } };
      } else {
        const auditPayload = (data as { traffic?: Row[]; logs?: Row[]; today?: Record<string, number> }) ?? {};
        setTrafficData(auditPayload.traffic ?? []);
        setAuditMetrics(auditPayload.today ?? {});
        result = { data: auditPayload.logs ?? [], error: null };
      }
    } else if (section === "settings") {
      const [settingsQuery, mealsQuery] = await Promise.all([
        supabase.from(page.table).select("*").limit(200),
        supabase.from("meals").select("slug,name,image_url,base_price_ngn,active").order("name"),
      ]);
      setAvailableSettingsMeals((mealsQuery.data ?? []) as AdminMealOption[]);
      result = settingsQuery;
    } else {
      const baseQuery = supabase.from(page.table).select("*");
      result = await baseQuery.order("created_at", { ascending: false }).limit(200);
    }
    if (result.error) setError(result.error.message.includes("schema cache") || result.error.message.includes("permission denied") ? "This admin data is protected until the latest admin access migration is applied in Supabase." : result.error.message);
    else {
      const data = result.data ?? [];
      setRows(data);
      if (section === "settings") {
        const firstRow = (data[0] as Record<string, unknown> | undefined) ?? {};
        setMissingCampaignSchema(!("featured_goal_enabled" in firstRow));
        setSettingsForm(parseStoreSettings(data[0] as Record<string, unknown> | undefined));
      }
    }
    setLoading(false);
  }, [page.table, section, weekStart]);

  useEffect(() => {
    if (section !== "audit-log" || typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab !== "campaign" && tab !== "activity" && tab !== "traffic") return;
    const timer = window.setTimeout(() => setAuditTab(tab), 0);
    return () => window.clearTimeout(timer);
  }, [section]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { if (!imagePreview.startsWith("blob:")) return; const preview = imagePreview; return () => URL.revokeObjectURL(preview); }, [imagePreview]);

  const matchingRows = useMemo(() => rows.filter((row) => {
    const matchesQuery = page.search.some((key) => String(row[key] ?? "").toLowerCase().includes(query.toLowerCase()));
    const matchesAddonTab = section !== "add-ons" || (addonTab === "protein" ? row.category === "protein" : row.category === "side" || row.category === "drink");
    const matchesOrderDate = section !== "orders" || (orderTab === "future" && String(row.service_date) > todayInZaria() && row.service_date === selectedDate && (orderWindowFilter === "all" || (Array.isArray(row.window_names) && row.window_names.some((name: string) => name.toLowerCase() === orderWindowFilter.toLowerCase()))));
    const matchesAuditCategory = section !== "audit-log" || auditCategoryFilter === "all" || String(row.category ?? "").toLowerCase() === auditCategoryFilter.toLowerCase();
    return matchesQuery && matchesAddonTab && matchesOrderDate && matchesAuditCategory;
  }), [rows, page.search, query, section, addonTab, selectedDate, orderWindowFilter, orderTab, auditCategoryFilter]);

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
      else if (field.key === "enabled" || field.key === "service_active") values[field.key] = value === "true";
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
          await supabase.from("batch_menu_items").delete().eq("stock_pool_id", editingRow.id);
          const batchInserts = selectedBatchIds.map(batchId => ({ stock_pool_id: editingRow.id, batch_id: batchId, active: true }));
          if (batchInserts.length) {
            const { error: linkError } = await supabase.from("batch_menu_items").insert(batchInserts);
            insertError = linkError;
          }
        }
      } else if (section === "meals") {
        const { error } = await supabase.from(page.table).update(values).eq("id", editingRow.id);
        if (error) insertError = error;
        else {
          await Promise.all([
            supabase.from("meal_proteins").delete().eq("meal_id", editingRow.id),
            supabase.from("meal_extras").delete().eq("meal_id", editingRow.id),
          ]);
          const proteinRows = selectedProteins.map(addonId => ({ meal_id: editingRow.id, addon_id: addonId, active: true }));
          const extraRows = selectedExtras.map(addonId => ({ meal_id: editingRow.id, addon_id: addonId, active: true }));
          if (proteinRows.length) await supabase.from("meal_proteins").insert(proteinRows);
          if (extraRows.length) await supabase.from("meal_extras").insert(extraRows);
        }
      } else {
        const { error } = await supabase.from(page.table).update(values).eq("id", editingRow.id);
        insertError = error;
      }
    } else if (section === "menus") {
      const pool = await supabase.from("meal_stock_pools").upsert({ meal_id: values.meal_id, service_date: values.service_date, portion_limit: values.portion_limit }, { onConflict: "meal_id,service_date" }).select("id").single();
      if (pool.error) insertError = pool.error;
      else {
        const batchInserts = selectedBatchIds.map(batchId => ({ stock_pool_id: pool.data.id, batch_id: batchId, active: true }));
        if (batchInserts.length) {
          const linked = await supabase.from("batch_menu_items").upsert(batchInserts, { onConflict: "batch_id,stock_pool_id" });
          if (linked.error) insertError = linked.error;
        }
      }
    } else if (section === "meals") {
      const { data: newMeal, error: mealErr } = await supabase.from(page.table).insert(values).select("id").single();
      if (mealErr) insertError = mealErr;
      else if (newMeal) {
        const proteinRows = selectedProteins.map(addonId => ({ meal_id: newMeal.id, addon_id: addonId, active: true }));
        const extraRows = selectedExtras.map(addonId => ({ meal_id: newMeal.id, addon_id: addonId, active: true }));
        if (proteinRows.length) await supabase.from("meal_proteins").insert(proteinRows);
        if (extraRows.length) await supabase.from("meal_extras").insert(extraRows);
      }
    } else if (section === "settings") {
      const { error } = await supabase.from(page.table).upsert({ id: 1, ...values, updated_at: new Date().toISOString() });
      insertError = error;
    } else {
      const { error } = await supabase.from(page.table).insert(values);
      insertError = error;
    }

    if (insertError) setError(insertError.message);
    else {
      setCreateOpen(false); setEditingRow(null); setImageFile(null); setImagePreview(""); setClearImage(false);
      setSelectedProteins([]); setSelectedExtras([]); setSelectedBatchIds([]);
      setNotice(`${page.create.label} saved.`);
      await load();
    }
    setBusy(false);
  }

  async function toggleActive(row: Row) {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setBusy(true); setError("");
    const { error: updateError } = await supabase.from(page.table).update({ active: !row.active }).eq("id", row.id);
    if (updateError) setError(updateError.message); else await load();
    setBusy(false);
  }

  async function unpostMenuMeal(stockPoolId: string, mealName: string) {
    if (!confirm(`Are you sure you want to remove ${mealName} from this day's menu?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "unpost_menu_meal", stockPoolId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not unpost meal.");
      setNotice(`${mealName} removed from menu.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unpost meal.");
    } finally {
      setBusy(false);
    }
  }



  async function handleAdminCancelDelivery() {
    if (!cancelModalDeliveryId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "cancel_delivery",
          deliveryId: cancelModalDeliveryId,
          refundMethod: cancelRefundMethod,
          reason: cancelReason,
        }),
      });
      const result = await response.json() as { error?: string; cancelled?: boolean };
      if (!response.ok) throw new Error(result.error ?? "Failed to cancel delivery.");
      setNotice("Delivery cancelled and refund processed.");
      setCancelModalDeliveryId(null);
      setCancelReason("");
      if (selectedOrderId) await showOrderDetail(selectedOrderId.split(":")[0]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel delivery.");
    } finally {
      setBusy(false);
    }
  }



  async function handleAdminResolveRefund() {
    if (!resolveRefundRow) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "resolve_refund",
          refundId: resolveRefundRow.id,
          resolution: resolveMethod,
          notes: resolveNotes,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Failed to resolve refund.");
      setNotice("Refund resolution saved.");
      setResolveRefundRow(null);
      setResolveNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve refund.");
    } finally {
      setBusy(false);
    }
  }



  
  async function saveSettings(event?: React.FormEvent) {
    if (event) event.preventDefault();
    if (
      settingsForm.campaign_starts_at &&
      settingsForm.campaign_ends_at &&
      Date.parse(settingsForm.campaign_ends_at) <= Date.parse(settingsForm.campaign_starts_at)
    ) {
      setError("Campaign end date must be after the campaign start date.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const result = await response.json() as {
        success?: boolean;
        error?: string;
        warning?: string;
        settings?: StoreSettings;
      };
      if (response.status >= 400 && response.status < 500) {
        setError(result.error ?? "Check your settings values and try again.");
        setBusy(false);
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Failed to save store settings.");
      }
      if (result.settings) {
        setSettingsForm(result.settings);
      }
      if (result.warning) {
        setMissingCampaignSchema(true);
        setError(result.warning);
      } else {
        setMissingCampaignSchema(false);
        setNotice("Store settings saved successfully. Live across storefront and campaign pages.");
      }
      setBusy(false);
      return;
    } catch (apiErr) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError(apiErr instanceof Error ? apiErr.message : "Database connection is not configured.");
        setBusy(false);
        return;
      }
      const { error: saveError } = await supabase.from("referral_campaign_settings").upsert({
        id: 1,
        enabled: settingsForm.referral_campaign_enabled,
        referrals_required: settingsForm.referrals_required,
        reward_amount_ngn: settingsForm.reward_amount_ngn,
        whatsapp_number: settingsForm.whatsapp_number,
        support_email: settingsForm.support_email,
        dispatch_phone: settingsForm.dispatch_phone,
        support_hours: settingsForm.support_hours,
        announcement_banner: settingsForm.announcement_banner,
        service_active: settingsForm.service_active,
        service_paused_message: settingsForm.service_paused_message,
        allow_same_day_ordering: settingsForm.allow_same_day_ordering,
        advance_order_days: settingsForm.advance_order_days,
        min_order_amount_ngn: settingsForm.min_order_amount_ngn,
        max_plates_per_order: settingsForm.max_plates_per_order,
        free_delivery_threshold_ngn: settingsForm.free_delivery_threshold_ngn,
        business_name: settingsForm.business_name,
        service_area_tagline: settingsForm.service_area_tagline,
        footer_tagline: settingsForm.footer_tagline,
        delivery_enabled: settingsForm.delivery_enabled,
        pickup_enabled: settingsForm.pickup_enabled,
        pickup_station_name: settingsForm.pickup_station_name,
        pickup_station_address: settingsForm.pickup_station_address,
        pickup_instructions: settingsForm.pickup_instructions,
        updated_at: new Date().toISOString(),
      });
      if (saveError) {
        setError(saveError.message);
      } else {
        setNotice("Store settings saved successfully.");
        await supabase.rpc("log_admin_action", {
          p_category: "settings",
          p_action: "update_store_settings",
          p_entity_id: "store_settings",
          p_details: "Updated store operations, WhatsApp, referral, and delivery rules.",
          p_metadata: { service_active: settingsForm.service_active, whatsapp_number: settingsForm.whatsapp_number }
        });
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminMarkUnclaimed() {
    if (!unclaimedModalDeliveryId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "mark_pickup_unclaimed",
          deliveryId: unclaimedModalDeliveryId,
          reason: unclaimedReason.trim() || "Holding window expired without pickup",
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Failed to mark pickup as unclaimed.");
      setNotice("Pickup marked as unclaimed and forfeited.");
      setUnclaimedModalDeliveryId(null);
      setUnclaimedReason("");
      if (selectedOrderId) await showOrderDetail(selectedOrderId.split(":")[0]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark pickup as unclaimed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminRerouteDelivery() {
    if (!rerouteModalDeliveryId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reroute_pickup_to_delivery",
          deliveryId: rerouteModalDeliveryId,
          address: rerouteAddress.trim(),
          areaName: rerouteAreaName.trim() || "ABU Samaru",
          notes: "Rerouted by customer request via WhatsApp",
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Failed to reroute delivery.");
      setNotice("Pickup order rerouted to doorstep delivery.");
      setRerouteModalDeliveryId(null);
      setRerouteAddress("");
      if (selectedOrderId) await showOrderDetail(selectedOrderId.split(":")[0]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reroute delivery.");
    } finally {
      setBusy(false);
    }
  }

  async function showOrderDetail(orderId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const cleanId = orderId.split(":")[0];
    setSelectedOrderId(cleanId); setOrderDetail(null); setDetailError(""); setDetailLoading(true);
    try {
      const [orderResult, deliveryResult] = await Promise.all([
        supabase.from("orders").select("*").eq("id", cleanId).single(),
        supabase.from("order_deliveries").select("*").eq("order_id", cleanId).order("service_date"),
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

  function openCreateModal(rowToEdit?: Row) {
    setEditingRow(rowToEdit ?? null);
    if (section === "meals") {
      if (rowToEdit) {
        setSelectedProteins(Array.isArray(rowToEdit.attachedProteinIds) ? rowToEdit.attachedProteinIds.map(String) : []);
        setSelectedExtras(Array.isArray(rowToEdit.attachedExtraIds) ? rowToEdit.attachedExtraIds.map(String) : []);
      } else {
        setSelectedProteins(availableProteins.map(p => String(p.id)));
        setSelectedExtras(availableExtras.map(e => String(e.id)));
      }
    } else if (section === "menus") {
      if (rowToEdit && Array.isArray(rowToEdit.postedBatches)) {
        setSelectedBatchIds(rowToEdit.postedBatches.map((b: MenuBatch) => b.id));
      } else {
        setSelectedBatchIds(batchesList.map(b => String(b.id)));
      }
    }
    setCreateOpen(true);
  }

  return <main className="admin-module-page">
    {selectedOrderId && <OrderDetailModal loading={detailLoading} error={detailError} detail={orderDetail} close={() => { setSelectedOrderId(""); setOrderDetail(null); }} onCancelDelivery={(id) => setCancelModalDeliveryId(id)} onMarkUnclaimed={(id) => setUnclaimedModalDeliveryId(id)} onRerouteDelivery={(id) => setRerouteModalDeliveryId(id)} />}

    {cancelModalDeliveryId && <div className="admin-module-modal-backdrop" role="presentation"><div className="admin-module-modal"><div><span className="eyebrow">ORDER ACTION</span><button type="button" onClick={() => setCancelModalDeliveryId(null)}>×</button><h2>Cancel delivery & issue refund</h2></div><p style={{ fontSize: "14px", color: "var(--admin-muted)" }}>This delivery will be cancelled and stock returned. Choose how the customer receives their refund.</p><label>Refund destination<select value={cancelRefundMethod} onChange={e => setCancelRefundMethod(e.target.value as "wallet" | "original")}><option value="wallet">PreChop Wallet credit (Immediate)</option><option value="original">Original payment method (Paystack card refund)</option></select></label><label>Reason / Note for customer<input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Kitchen item unavailable, customer requested" /></label><div className="admin-module-modal-actions"><button type="button" className="admin-refresh" onClick={() => setCancelModalDeliveryId(null)}>Back</button><button type="button" className="admin-module-primary" style={{ background: "#ba3c11" }} disabled={busy} onClick={() => void handleAdminCancelDelivery()}>{busy ? "Processing…" : "Confirm cancellation"}</button></div></div></div>}

    {unclaimedModalDeliveryId && (
      <div className="admin-module-modal-backdrop" role="presentation">
        <div className="admin-module-modal">
          <div>
            <span className="eyebrow">CAMPUS PICKUP ACTION</span>
            <button type="button" onClick={() => setUnclaimedModalDeliveryId(null)}>×</button>
            <h2>Mark pickup as unclaimed</h2>
          </div>
          <p style={{ fontSize: "14px", color: "var(--admin-muted)" }}>
            This meal will be marked as unclaimed because the student did not arrive during the holding window. In accordance with campus food safety rules, no refund is issued.
          </p>
          <label>
            Reason / Operator note
            <input
              value={unclaimedReason}
              onChange={(e) => setUnclaimedReason(e.target.value)}
              placeholder="e.g. Holding period expired without collection"
            />
          </label>
          <div className="admin-module-modal-actions">
            <button type="button" className="admin-refresh" onClick={() => setUnclaimedModalDeliveryId(null)}>
              Back
            </button>
            <button
              type="button"
              className="admin-module-primary"
              style={{ background: "#991b1b" }}
              disabled={busy}
              onClick={() => void handleAdminMarkUnclaimed()}
            >
              {busy ? "Processing…" : "Confirm Unclaimed (Forfeit)"}
            </button>
          </div>
        </div>
      </div>
    )}

    {rerouteModalDeliveryId && (
      <div className="admin-module-modal-backdrop" role="presentation">
        <div className="admin-module-modal">
          <div>
            <span className="eyebrow">RESCUE / REROUTE</span>
            <button type="button" onClick={() => setRerouteModalDeliveryId(null)}>×</button>
            <h2>Reroute Pickup to Hostel Delivery</h2>
          </div>
          <p style={{ fontSize: "14px", color: "var(--admin-muted)" }}>
            Switch this order from campus station pickup to doorstep delivery. Ensure the student arranged this on WhatsApp and transferred the delivery fee.
          </p>
          <label>
            Hostel / Campus Delivery Address
            <input
              required
              value={rerouteAddress}
              onChange={(e) => setRerouteAddress(e.target.value)}
              placeholder="e.g. Ribadu Hall, Block B, Room 14"
            />
          </label>
          <label>
            Campus Area
            <input
              value={rerouteAreaName}
              onChange={(e) => setRerouteAreaName(e.target.value)}
              placeholder="e.g. ABU Samaru campus"
            />
          </label>
          <div className="admin-module-modal-actions">
            <button type="button" className="admin-refresh" onClick={() => setRerouteModalDeliveryId(null)}>
              Back
            </button>
            <button
              type="button"
              className="admin-module-primary"
              style={{ background: "#d97706" }}
              disabled={busy || !rerouteAddress.trim()}
              onClick={() => void handleAdminRerouteDelivery()}
            >
              {busy ? "Saving…" : "Confirm Reroute to Delivery"}
            </button>
          </div>
        </div>
      </div>
    )}

    {resolveRefundRow && <div className="admin-module-modal-backdrop" role="presentation"><div className="admin-module-modal"><div><span className="eyebrow">REFUND RESOLUTION</span><button type="button" onClick={() => setResolveRefundRow(null)}>×</button><h2>Resolve customer refund</h2></div><p style={{ fontSize: "14px", color: "var(--admin-muted)" }}>Customer: <strong>{String(resolveRefundRow.customer)}</strong> · Total: <strong>{money(Number(resolveRefundRow.total_ngn))}</strong> ({String(resolveRefundRow.method)})</p><label>Resolution action<select value={resolveMethod} onChange={e => setResolveMethod(e.target.value as "wallet" | "offline_paid" | "failed")}><option value="wallet">Deposit refund into customer wallet</option><option value="offline_paid">Mark as resolved (Manual bank transfer completed)</option><option value="failed">Mark refund as rejected / failed</option></select></label><label>Admin resolution note<input value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} placeholder="e.g. Sent via OPay transfer or resolved via WhatsApp" /></label><div className="admin-module-modal-actions"><button type="button" className="admin-refresh" onClick={() => setResolveRefundRow(null)}>Back</button><button type="button" className="admin-module-primary" disabled={busy} onClick={() => void handleAdminResolveRefund()}>{busy ? "Saving…" : "Save resolution"}</button></div></div></div>}

    <header className="admin-dashboard-heading"><div><span className="eyebrow">{page.eyebrow}</span><h1>{page.title}.</h1><p>{page.description}</p></div><div className="admin-module-actions"><button className="admin-refresh" onClick={() => void load()} disabled={loading}><ArrowClockwise size={18} className={loading ? "admin-refresh-spin" : undefined} /> Refresh</button>{section === "settings" ? <button className="admin-module-primary" onClick={() => void saveSettings()} disabled={busy}><FloppyDisk size={18} /> {busy ? "Saving…" : "Save settings"}</button> : page.create && <button className="admin-module-primary" onClick={() => openCreateModal()}><Plus size={18} /> {page.create.label}</button>}</div></header>

    {access === "signed_out" && !loading && <section className="admin-access-card"><span className="admin-access-icon"><WarningCircle size={25} /></span><h2>Sign in to continue.</h2><p>Use the PreChop account approved for administrator access.</p><button className="primary" onClick={() => setSignInOpen(true)}>Sign in</button></section>}
    {access === "not_admin" && !loading && <section className="admin-access-card"><span className="admin-access-icon"><WarningCircle size={25} /></span><h2>Admin access required.</h2><p>This account is not on the PreChop admin allowlist.</p></section>}

    {access === "allowed" && <>
      {notice && <p className="admin-action-notice"><Check size={17} /> {notice}</p>}{error && <p className="error admin-report-error" role="alert">{error}</p>}
      {section === "orders" && <div className="admin-orders-view-tabs" role="tablist" aria-label="Orders view"><button type="button" role="tab" aria-selected={orderTab === "today"} className={orderTab === "today" ? "is-active" : ""} onClick={() => setOrderTab("today")}>Today’s batches <span>Live operations</span></button><button type="button" role="tab" aria-selected={orderTab === "future"} className={orderTab === "future" ? "is-active" : ""} onClick={() => { setOrderTab("future"); if (selectedDate <= todayInZaria()) { const tomorrow = addDays(todayInZaria(), 1); setSelectedDate(tomorrow); setWeekStart(mondayOf(tomorrow)); } }}>Future deliveries <span>Scheduled orders</span></button></div>}
      {section === "orders" && orderTab === "today" && <AdminOrdersToday />}
      {section === "menus" && <section className="admin-menu-summary"><div><span>Meals on this week’s menu</span><strong>{loading ? "—" : rows.length}</strong></div><div><span>Days with a menu</span><strong>{loading ? "—" : new Set(rows.map((row) => row.service_date)).size}</strong></div><div><span>Portions remaining</span><strong>{loading ? "—" : rows.reduce((sum, row) => sum + Number(row.remaining ?? 0), 0)}</strong></div></section>}
      {section !== "orders" && section !== "menus" && section !== "audit-log" && <section className="admin-module-stats"><div><span>Records</span><strong>{loading ? "—" : rows.length}</strong></div><p><CalendarBlank size={17} /> Data shown from the connected PreChop database</p></section>}
      {section === "audit-log" && (
        <section className="admin-audit-kpis">
          <div className="admin-audit-kpi">
            <span>Today’s unique visitors</span>
            <strong>{loading ? "—" : (auditMetrics.today_visitors ?? 0).toLocaleString()}</strong>
            <small>{(auditMetrics.today_page_views ?? 0).toLocaleString()} page views</small>
          </div>
          <div className="admin-audit-kpi">
            <span>Today’s customer orders</span>
            <strong>{loading ? "—" : (auditMetrics.today_orders ?? 0).toLocaleString()}</strong>
            <small>Total checkout submissions</small>
          </div>
          <div className="admin-audit-kpi">
            <span>Today’s conversion rate</span>
            <strong className="admin-audit-conversion-badge">
              {loading ? "—" : `${(auditMetrics.today_visitors ? Math.round(((auditMetrics.today_orders ?? 0) / auditMetrics.today_visitors) * 1000) / 10 : 0)}%`}
            </strong>
            <small>Visitors converting to orders</small>
          </div>
          <div className="admin-audit-kpi">
            <span>Today’s paid revenue</span>
            <strong>{loading ? "—" : money(Number(auditMetrics.today_sales_ngn ?? 0))}</strong>
            <small>Completed paid volume</small>
          </div>
        </section>
      )}
      {section === "orders" && orderTab === "future" && <><section className="admin-module-stats"><div><span>Upcoming orders</span><strong>{loading ? "—" : new Set(rows.filter((row) => String(row.service_date) > todayInZaria()).map((row) => row.order_id)).size}</strong></div><p><CalendarBlank size={17} /> Future deliveries only</p></section><section className="admin-menu-planner admin-orders-planner"><div className="admin-menu-week-heading"><div><span className="eyebrow">FUTURE DELIVERIES BY DATE</span><h2>{formattedDay(weekStart, { month: "long" })} {formattedDay(weekStart, { day: "numeric" })} <span>—</span> {formattedDay(addDays(weekStart, 6), { month: "long", day: "numeric", year: "numeric" })}</h2><p>Select a future delivery date to review its orders.</p></div><div className="admin-orders-controls"><label><span>Jump to date</span><input aria-label="Choose a delivery date" type="date" min={addDays(todayInZaria(), 1)} value={selectedDate} onChange={(event) => { const nextDate = event.currentTarget.value; if (!nextDate) return; setSelectedDate(nextDate); setWeekStart(mondayOf(nextDate)); }} /></label><div className="admin-menu-week-controls"><button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)}><CaretLeft size={18} /></button><button type="button" onClick={() => { const tomorrow = addDays(todayInZaria(), 1); setWeekStart(mondayOf(tomorrow)); setSelectedDate(tomorrow); }}>Next delivery</button><button type="button" aria-label="Next week" onClick={() => moveWeek(1)}><CaretRight size={18} /></button></div></div></div><div className="admin-menu-date-strip" role="tablist" aria-label="Choose future delivery day">{weekDays.map((date) => { const dayOrders = rows.filter((row) => row.service_date === date); const activeDate = selectedDate === date; return <button type="button" role="tab" aria-selected={activeDate} className={activeDate ? "is-active" : ""} key={date} onClick={() => setSelectedDate(date)} disabled={date <= todayInZaria()}><span>{formattedDay(date, { weekday: "short" })}</span><strong>{formattedDay(date, { day: "numeric" })}</strong><small>{dayOrders.length} {dayOrders.length === 1 ? "order" : "orders"}</small></button>; })}</div></section><div className="admin-order-window-filter" role="group" aria-label="Filter orders by delivery window"><span>DELIVERY WINDOW</span><button type="button" className={orderWindowFilter === "all" ? "is-active" : ""} onClick={() => setOrderWindowFilter("all")}>All windows</button>{menuWindows.map((name) => <button type="button" key={name} className={orderWindowFilter === name ? "is-active" : ""} onClick={() => setOrderWindowFilter(name)}>{name}</button>)}</div></>}

      {section === "settings" ? (
        <form className="admin-settings-dashboard" onSubmit={(e) => void saveSettings(e)}>
          <section className="admin-settings-card">
            <div className="admin-settings-card-header">
              <div>
                <h3 className="admin-settings-card-title"><Storefront size={22} /> Store Operations & Availability</h3>
                <p className="admin-settings-card-desc">Control whether PreChop is currently accepting orders, emergency pause notices, and order horizons.</p>
              </div>
              <div>
                {settingsForm.service_active ? (
                  <span className="admin-settings-badge-open">● Store Open</span>
                ) : (
                  <span className="admin-settings-badge-closed">● Store Paused</span>
                )}
              </div>
            </div>
            <div className="admin-settings-grid-fields">
              <div className="admin-settings-field" style={{ gridColumn: "1 / -1" }}>
                <label className="admin-settings-switch-label">
                  <input
                    type="checkbox"
                    checked={settingsForm.service_active}
                    onChange={(e) => setSettingsForm({ ...settingsForm, service_active: e.target.checked })}
                  />
                  Store is open for customer orders
                </label>
                <small>Unchecking this instantly pauses checkout and displays your custom closure notice to customers.</small>
              </div>
              {!settingsForm.service_active && (
                <div className="admin-settings-field" style={{ gridColumn: "1 / -1" }}>
                  <label>Store closed notice (shown across storefront)</label>
                  <textarea
                    value={settingsForm.service_paused_message}
                    onChange={(e) => setSettingsForm({ ...settingsForm, service_paused_message: e.target.value })}
                    placeholder="e.g. Our kitchen is taking a short break for maintenance. Pre-orders reopen tomorrow at 7:00 AM."
                  />
                </div>
              )}
              <div className="admin-settings-field">
                <label className="admin-settings-switch-label">
                  <input
                    type="checkbox"
                    checked={settingsForm.allow_same_day_ordering}
                    onChange={(e) => setSettingsForm({ ...settingsForm, allow_same_day_ordering: e.target.checked })}
                  />
                  Allow same-day ordering (before cutoff)
                </label>
                <small>When unchecked, customers can only book meals for tomorrow onwards.</small>
              </div>
              <div className="admin-settings-field">
                <label>Advance ordering horizon (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={settingsForm.advance_order_days}
                  onChange={(e) => setSettingsForm({ ...settingsForm, advance_order_days: Number(e.target.value) || 7 })}
                />
                <small>How many calendar days ahead customers can view and book meals (default: 7).</small>
              </div>
              <div className="admin-settings-field">
                <label>Minimum order amount (₦)</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={settingsForm.min_order_amount_ngn}
                  onChange={(e) => setSettingsForm({ ...settingsForm, min_order_amount_ngn: Number(e.target.value) || 0 })}
                />
                <small>Leave at 0 for no minimum cart total requirement.</small>
              </div>
              <div className="admin-settings-field">
                <label>Maximum plates per order</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={settingsForm.max_plates_per_order}
                  onChange={(e) => setSettingsForm({ ...settingsForm, max_plates_per_order: Number(e.target.value) || 20 })}
                />
                <small>Prevents excessive batch depletion by single checkout submissions (default: 20).</small>
              </div>
            </div>
          </section>

          <section className="admin-settings-card">
            <div className="admin-settings-card-header">
              <div>
                <h3 className="admin-settings-card-title"><Phone size={22} /> Customer Support & Contact Channels</h3>
                <p className="admin-settings-card-desc">Powers the WhatsApp chat buttons on customer order pages, recovery links, and support emails.</p>
              </div>
            </div>
            <div className="admin-settings-grid-fields">
              <div className="admin-settings-field">
                <label>WhatsApp support phone number</label>
                <input
                  type="text"
                  value={settingsForm.whatsapp_number}
                  onChange={(e) => setSettingsForm({ ...settingsForm, whatsapp_number: e.target.value })}
                  placeholder="+2348031234567"
                />
                <small>International format (+234...). Used for customer WhatsApp support buttons.</small>
              </div>
              <div className="admin-settings-field">
                <label>Customer support email</label>
                <input
                  type="email"
                  value={settingsForm.support_email}
                  onChange={(e) => setSettingsForm({ ...settingsForm, support_email: e.target.value })}
                  placeholder="support@prechop.com"
                />
                <small>Official support email shown on receipts and footer.</small>
              </div>
              <div className="admin-settings-field">
                <label>Delivery dispatch helpline</label>
                <input
                  type="text"
                  value={settingsForm.dispatch_phone}
                  onChange={(e) => setSettingsForm({ ...settingsForm, dispatch_phone: e.target.value })}
                  placeholder="+2348031234567"
                />
                <small>Direct phone line for riders and delivery stop inquiries.</small>
              </div>
              <div className="admin-settings-field">
                <label>Support operating hours</label>
                <input
                  type="text"
                  value={settingsForm.support_hours}
                  onChange={(e) => setSettingsForm({ ...settingsForm, support_hours: e.target.value })}
                  placeholder="Mon–Sat: 7:00 AM – 8:30 PM"
                />
                <small>Operating hours shown to customers needing assistance.</small>
              </div>
            </div>
          </section>

          <section className="admin-settings-card">
            <div className="admin-settings-card-header">
              <div>
                <h3 className="admin-settings-card-title"><Megaphone size={22} /> Promotions, Announcements & Delivery</h3>
                <p className="admin-settings-card-desc">Configure top marquee banner alerts and free delivery order incentives.</p>
              </div>
            </div>
            <div className="admin-settings-grid-fields">
              <div className="admin-settings-field" style={{ gridColumn: "1 / -1" }}>
                <label>Header marquee announcement text</label>
                <input
                  type="text"
                  value={settingsForm.announcement_banner}
                  onChange={(e) => setSettingsForm({ ...settingsForm, announcement_banner: e.target.value })}
                  placeholder="e.g. 🔥 New Menu: Asun & Fried Yam is now available for Friday lunch!"
                />
                <small>Displays inside the animated top announcement banner across customer pages. Leave blank to show default campaign message.</small>
              </div>
              <div className="admin-settings-field">
                <label>Free delivery threshold (₦)</label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={settingsForm.free_delivery_threshold_ngn}
                  onChange={(e) => setSettingsForm({ ...settingsForm, free_delivery_threshold_ngn: Number(e.target.value) || 0 })}
                />
                <small>Orders above this food subtotal get 100% free delivery. Enter 0 to charge regular area delivery fees.</small>
              </div>
            </div>
          </section>

          <section className="admin-settings-card">
            <div className="admin-settings-card-header">
              <div>
                <h3 className="admin-settings-card-title"><Gift size={22} /> Customer Referral & Loyalty Program</h3>
                <p className="admin-settings-card-desc">
                  Control wallet rewards per qualified friend order, minimum qualifying spend, availability window, and the featured meal goal.
                </p>
              </div>
              <div>
                {!settingsForm.referral_campaign_enabled ? (
                  <span className="admin-settings-badge-closed">● Campaign Paused</span>
                ) : isCampaignLive(settingsForm) ? (
                  <span className="admin-settings-badge-open">● Campaign Active</span>
                ) : settingsForm.campaign_starts_at && Date.parse(settingsForm.campaign_starts_at) > Date.now() ? (
                  <span className="admin-settings-badge-warn">● Scheduled</span>
                ) : (
                  <span className="admin-settings-badge-closed">● Window Ended</span>
                )}
              </div>
            </div>
            {missingCampaignSchema && (
              <div
                className="admin-sticker-warning"
                role="alert"
                style={{ margin: "0 0 16px", padding: "12px 14px", borderRadius: "6px" }}
              >
                <strong>Database migration required:</strong> New campaign controls (including switching Featured Meal Goal on/off, per-referral reward, min order guardrail, and availability window) are not in Supabase yet. Run{" "}
                <code>supabase/migrations/202610060013_campaign_goals_and_link_visits.sql</code> in the Supabase SQL Editor so changes persist on the customer page.
              </div>
            )}
            <div className="admin-settings-grid-fields">
              <div className="admin-settings-field" style={{ gridColumn: "1 / -1" }}>
                <label className="admin-settings-switch-label">
                  <input
                    type="checkbox"
                    checked={settingsForm.referral_campaign_enabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, referral_campaign_enabled: e.target.checked })}
                  />
                  Referral campaign is active
                </label>
                <small>Customers can share their invite link, record link visits, and earn wallet credit when friends complete qualifying orders.</small>
              </div>

              <div className="admin-settings-field">
                <label>Campaign availability starts (optional)</label>
                <input
                  type="datetime-local"
                  value={toDateTimeLocalValue(settingsForm.campaign_starts_at)}
                  onChange={(e) => setSettingsForm({ ...settingsForm, campaign_starts_at: fromDateTimeLocalValue(e.target.value) })}
                />
                <small>Leave blank to start immediately once active.</small>
              </div>

              <div className="admin-settings-field">
                <label>Campaign availability ends (optional)</label>
                <input
                  type="datetime-local"
                  value={toDateTimeLocalValue(settingsForm.campaign_ends_at)}
                  onChange={(e) => setSettingsForm({ ...settingsForm, campaign_ends_at: fromDateTimeLocalValue(e.target.value) })}
                />
                <small>Leave blank for an ongoing evergreen campaign. Wallet balances earned never expire when window closes.</small>
              </div>

              <div className="admin-settings-field">
                <label>Reward amount credited per qualified friend (₦)</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={settingsForm.reward_per_referral_ngn}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      reward_per_referral_ngn: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
                <small>Deposited into the referrer’s wallet immediately when a friend’s qualifying order confirms (default: ₦500).</small>
              </div>

              <div className="admin-settings-field">
                <label>Minimum friend order to qualify (₦)</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={settingsForm.min_qualifying_order_ngn}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      min_qualifying_order_ngn: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
                <small>Strongly recommended guardrail: friend’s food subtotal (before delivery fee) must be at least this amount (default: ₦1,500).</small>
              </div>
            </div>

            <div className="admin-campaign-subpanel">
              <div className="admin-campaign-subpanel-head">
                <label className="admin-settings-switch-label">
                  <input
                    type="checkbox"
                    checked={settingsForm.featured_goal_enabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, featured_goal_enabled: e.target.checked })}
                  />
                  Enable Featured Meal Goal &amp; Claiming on /campaign
                </label>
                {settingsForm.featured_goal_enabled ? (
                  <span className="admin-settings-badge-open">● Meal Goal On</span>
                ) : (
                  <span className="admin-settings-badge-warn">● Wallet-Only Mode</span>
                )}
              </div>

              {!settingsForm.featured_goal_enabled ? (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--admin-muted)" }}>
                  Featured meal claiming is switched off. Customers still earn <strong>{money(settingsForm.reward_per_referral_ngn)}</strong> per successful referral straight in their wallet and can spend it anytime at checkout.
                </p>
              ) : (() => {
                const selectedMeal = availableSettingsMeals.find(
                  (m) => m.slug === settingsForm.featured_meal_slug,
                );
                const mealMenuPrice = selectedMeal?.base_price_ngn ?? 1500;
                const reqReferrals =
                  settingsForm.featured_unlock_rule === "accumulated_credit"
                    ? settingsForm.reward_per_referral_ngn > 0
                      ? Math.ceil(settingsForm.featured_target_credit_ngn / settingsForm.reward_per_referral_ngn)
                      : 0
                    : settingsForm.featured_target_referrals;
                const walletEarnedAtUnlock = reqReferrals * settingsForm.reward_per_referral_ngn;
                const totalExposure =
                  settingsForm.featured_claim_behavior === "bonus_free_claim"
                    ? walletEarnedAtUnlock + mealMenuPrice
                    : Math.max(walletEarnedAtUnlock, mealMenuPrice);

                return (
                  <>
                    <div className="admin-settings-grid-fields">
                      <div className="admin-settings-field">
                        <label>Featured meal from menu</label>
                        <select
                          value={settingsForm.featured_meal_slug}
                          onChange={(e) => {
                            const slug = e.target.value;
                            const chosen = availableSettingsMeals.find((m) => m.slug === slug);
                            setSettingsForm({
                              ...settingsForm,
                              featured_meal_slug: slug,
                              featured_meal_title: chosen?.name ?? settingsForm.featured_meal_title,
                              featured_meal_image: chosen?.image_url || settingsForm.featured_meal_image,
                            });
                          }}
                        >
                          {availableSettingsMeals.length === 0 ? (
                            <option value={settingsForm.featured_meal_slug}>{settingsForm.featured_meal_title}</option>
                          ) : (
                            availableSettingsMeals.map((m) => (
                              <option key={m.slug} value={m.slug}>
                                {m.name} ({money(m.base_price_ngn)}){m.active ? "" : " — Paused"}
                              </option>
                            ))
                          )}
                          {!availableSettingsMeals.some((m) => m.slug === settingsForm.featured_meal_slug) &&
                            availableSettingsMeals.length > 0 && (
                              <option value={settingsForm.featured_meal_slug}>
                                Custom slug: {settingsForm.featured_meal_slug}
                              </option>
                            )}
                        </select>
                        <small>Customer claims this meal from checkout once their goal unlocks.</small>
                      </div>

                      <div className="admin-settings-field">
                        <label>Featured meal card preview</label>
                        <div className="admin-campaign-meal-preview">
                          <Image
                            src={settingsForm.featured_meal_image || "/images/jollof.png"}
                            alt={settingsForm.featured_meal_title}
                            width={52}
                            height={52}
                            unoptimized
                          />
                          <div>
                            <strong style={{ display: "block", fontSize: "13px" }}>
                              {settingsForm.featured_meal_title}
                            </strong>
                            <span style={{ fontSize: "12px", color: "var(--admin-muted)" }}>
                              Menu base: {money(mealMenuPrice)} · Slug: <code>{settingsForm.featured_meal_slug}</code>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="admin-settings-field">
                        <label>Featured meal display title</label>
                        <input
                          type="text"
                          value={settingsForm.featured_meal_title}
                          onChange={(e) => setSettingsForm({ ...settingsForm, featured_meal_title: e.target.value })}
                        />
                        <small>Shown on /campaign hero &amp; featured meal goal card.</small>
                      </div>

                      <div className="admin-settings-field">
                        <label>Featured meal image path or URL</label>
                        <input
                          type="text"
                          value={settingsForm.featured_meal_image}
                          onChange={(e) => setSettingsForm({ ...settingsForm, featured_meal_image: e.target.value })}
                        />
                        <small>Auto-filled from selected meal or customize (e.g. /images/jollof.png).</small>
                      </div>

                      <div className="admin-settings-field">
                        <label>Unlock rule</label>
                        <select
                          value={settingsForm.featured_unlock_rule}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              featured_unlock_rule: e.target.value as FeaturedUnlockRule,
                            })
                          }
                        >
                          <option value="referral_count">Number of qualified referrals</option>
                          <option value="accumulated_credit">Accumulated campaign credit amount (₦)</option>
                          <option value="both">Both count &amp; accumulated credit</option>
                        </select>
                        <small>Controls what unlocks the Claim meal action on /campaign.</small>
                      </div>

                      <div className="admin-settings-field">
                        <label>Claiming behavior</label>
                        <select
                          value={settingsForm.featured_claim_behavior}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              featured_claim_behavior: e.target.value as FeaturedClaimBehavior,
                            })
                          }
                        >
                          <option value="consumes_credit">Consumes accumulated wallet credit at checkout</option>
                          <option value="bonus_free_claim">Bonus free meal prize (wallet credit stays intact)</option>
                        </select>
                        <small>Recommended: Consumes wallet credit to protect kitchen margins.</small>
                      </div>

                      <div className="admin-settings-field">
                        <label>Qualified friend invitations required</label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={settingsForm.featured_target_referrals}
                          onChange={(e) => {
                            const nextVal = Math.max(1, Number(e.target.value) || 1);
                            setSettingsForm({
                              ...settingsForm,
                              featured_target_referrals: nextVal,
                              referrals_required: nextVal,
                            });
                          }}
                        />
                        <small>Number of successful friend orders required to unlock (synced with referrals target).</small>
                      </div>

                      <div className="admin-settings-field">
                        <label>Target accumulated credit to unlock (₦)</label>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={settingsForm.featured_target_credit_ngn}
                          onChange={(e) => {
                            const nextCredit = Math.max(0, Number(e.target.value) || 0);
                            setSettingsForm({
                              ...settingsForm,
                              featured_target_credit_ngn: nextCredit,
                              reward_amount_ngn: Math.max(1, nextCredit || settingsForm.reward_amount_ngn),
                            });
                          }}
                        />
                        <small>Total campaign wallet credit required before the featured meal goal unlocks.</small>
                      </div>

                      {settingsForm.featured_claim_behavior === "bonus_free_claim" && (
                        <div className="admin-settings-field">
                          <label>Bonus meal claim expiry (days after unlock)</label>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={settingsForm.featured_claim_expiry_days}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                featured_claim_expiry_days: Math.max(1, Number(e.target.value) || 14),
                              })
                            }
                          />
                          <small>How long the unlocked free meal prize stays valid (earned wallet credit itself never expires).</small>
                        </div>
                      )}
                    </div>

                    <div className="admin-campaign-estimator">
                      <strong>Live campaign economics estimate:</strong>{" "}
                      With <strong>{reqReferrals}</strong> qualified friend order{reqReferrals === 1 ? "" : "s"} (min.{" "}
                      <strong>{money(settingsForm.min_qualifying_order_ngn)}</strong> each), the referrer earns{" "}
                      <strong>{money(walletEarnedAtUnlock)}</strong> in wallet credit
                      {settingsForm.featured_claim_behavior === "bonus_free_claim" ? (
                        <>
                          {" "}
                          plus a free <strong>{settingsForm.featured_meal_title}</strong> ({money(mealMenuPrice)}), totaling{" "}
                          <strong>{money(totalExposure)}</strong> in reward value within{" "}
                          <strong>{settingsForm.featured_claim_expiry_days} days</strong> of unlock.
                        </>
                      ) : (
                        <>
                          {" "}
                          and uses that credit toward claiming <strong>{settingsForm.featured_meal_title}</strong> ({money(mealMenuPrice)} menu price).
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </section>

          <section className="admin-settings-card">
            <div className="admin-settings-card-header">
              <div>
                <h3 className="admin-settings-card-title"><Storefront size={22} /> Fulfillment & Campus Pickup Channels</h3>
                <p className="admin-settings-card-desc">Control whether customers can choose delivery, campus pickup, or both, and manage campus pickup station details.</p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {settingsForm.delivery_enabled ? (
                  <span className="admin-settings-badge-open">● Delivery Active</span>
                ) : (
                  <span className="admin-settings-badge-closed">● Delivery Paused</span>
                )}
                {settingsForm.pickup_enabled ? (
                  <span className="admin-settings-badge-open">● Pickup Active</span>
                ) : (
                  <span className="admin-settings-badge-closed">● Pickup Paused</span>
                )}
                <button
                  type="button"
                  className="admin-module-primary"
                  style={{ padding: "6px 14px", fontSize: "13px", height: "32px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  disabled={busy}
                  onClick={() => void saveSettings()}
                >
                  <FloppyDisk size={16} /> {busy ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
            <div className="admin-settings-grid-fields">
              <div className="admin-settings-field">
                <label className="admin-settings-switch-label">
                  <input
                    type="checkbox"
                    checked={settingsForm.delivery_enabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, delivery_enabled: e.target.checked })}
                  />
                  Enable Doorstep & Campus Delivery
                </label>
                <small>Allows customers to order meals delivered to hostels, faculties, and off-campus addresses.</small>
              </div>
              <div className="admin-settings-field">
                <label className="admin-settings-switch-label">
                  <input
                    type="checkbox"
                    checked={settingsForm.pickup_enabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, pickup_enabled: e.target.checked })}
                  />
                  Enable Campus Pickup (Free)
                </label>
                <small>Allows students to order ahead and pick up meals at the designated campus station with zero delivery fee.</small>
              </div>
              <div className="admin-settings-field">
                <label>Pickup Station Name</label>
                <input
                  type="text"
                  value={settingsForm.pickup_station_name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, pickup_station_name: e.target.value })}
                  placeholder="ABU Social Center"
                />
                <small>Displayed to customers at checkout and on order receipts.</small>
              </div>
              <div className="admin-settings-field">
                <label>Pickup Station Address / Landmark</label>
                <input
                  type="text"
                  value={settingsForm.pickup_station_address}
                  onChange={(e) => setSettingsForm({ ...settingsForm, pickup_station_address: e.target.value })}
                  placeholder="Social Center, Samaru Campus, ABU Zaria"
                />
                <small>Physical location and landmarks for collecting meals.</small>
              </div>
              <div className="admin-settings-field" style={{ gridColumn: "1 / -1" }}>
                <label>Pickup Collection Instructions</label>
                <input
                  type="text"
                  value={settingsForm.pickup_instructions}
                  onChange={(e) => setSettingsForm({ ...settingsForm, pickup_instructions: e.target.value })}
                  placeholder="Collect your meal at the PreChop desk inside Social Center during your meal window."
                />
                <small>Instructional guidance provided to customers choosing pickup.</small>
              </div>
              <div className="admin-settings-field">
                <label>Pickup Holding Grace Period (Minutes)</label>
                <input
                  type="number"
                  min="10"
                  max="240"
                  step="5"
                  value={settingsForm.pickup_holding_minutes}
                  onChange={(e) => setSettingsForm({ ...settingsForm, pickup_holding_minutes: Number(e.target.value) || 45 })}
                />
                <small>Duration station staff holds meals after window ends before marking unclaimed.</small>
              </div>
              <div className="admin-settings-field">
                <label className="admin-settings-switch-label" style={{ marginTop: "24px" }}>
                  <input
                    type="checkbox"
                    checked={settingsForm.pickup_delivery_reroute_enabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, pickup_delivery_reroute_enabled: e.target.checked })}
                  />
                  Allow WhatsApp Hostel Delivery Reroute
                </label>
                <small>Permits students delayed in class to request emergency delivery via WhatsApp dispatch.</small>
              </div>
              <div className="admin-settings-field" style={{ gridColumn: "1 / -1" }}>
                <label>Unclaimed Meal Policy Notice (Displayed to customers)</label>
                <textarea
                  rows={2}
                  value={settingsForm.pickup_unclaimed_policy}
                  onChange={(e) => setSettingsForm({ ...settingsForm, pickup_unclaimed_policy: e.target.value })}
                  placeholder="Meals not collected within 45 minutes of window close are forfeited for food safety reasons and cannot be refunded."
                />
                <small>Official policy notice displayed on checkout and order receipts regarding unclaimed meals.</small>
              </div>
            </div>
          </section>

          <section className="admin-settings-card">
            <div className="admin-settings-card-header">
              <div>
                <h3 className="admin-settings-card-title"><Check size={22} /> Business Identity & Branding</h3>
                <p className="admin-settings-card-desc">Define store brand names and service coverage text displayed across customer pages.</p>
              </div>
            </div>
            <div className="admin-settings-grid-fields">
              <div className="admin-settings-field">
                <label>Business / Brand name</label>
                <input
                  type="text"
                  value={settingsForm.business_name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, business_name: e.target.value })}
                  placeholder="PreChop"
                />
              </div>
              <div className="admin-settings-field">
                <label>Service area coverage tagline</label>
                <input
                  type="text"
                  value={settingsForm.service_area_tagline}
                  onChange={(e) => setSettingsForm({ ...settingsForm, service_area_tagline: e.target.value })}
                  placeholder="ABU Samaru, Kongo & Sabon Gari, Zaria"
                />
              </div>
              <div className="admin-settings-field" style={{ gridColumn: "1 / -1" }}>
                <label>Footer tagline</label>
                <input
                  type="text"
                  value={settingsForm.footer_tagline}
                  onChange={(e) => setSettingsForm({ ...settingsForm, footer_tagline: e.target.value })}
                  placeholder="Good food, planned around you."
                />
              </div>
            </div>
          </section>

          <div className="admin-settings-save-bar">
            <span>Make sure to save your changes to apply them to all customer pages.</span>
            <button type="submit" className="admin-module-primary" disabled={busy}>
              <FloppyDisk size={18} /> {busy ? "Saving settings…" : "Save settings"}
            </button>
          </div>
        </form>
      ) : section === "orders" && orderTab === "today" ? null : section === "audit-log" ? (
        <section className="admin-section admin-module-section">
          <div className="admin-addon-tabs" role="tablist" aria-label="Audit log view tabs" style={{ marginBottom: "16px" }}>
            <button
              type="button"
              role="tab"
              aria-selected={auditTab === "traffic"}
              className={auditTab === "traffic" ? "is-active" : ""}
              onClick={() => setAuditTab("traffic")}
            >
              Daily site traffic &amp; orders <span>{trafficData.length} days</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={auditTab === "campaign"}
              className={auditTab === "campaign" ? "is-active" : ""}
              onClick={() => setAuditTab("campaign")}
            >
              Referral campaign <span>{campaignReport ? campaignReport.qualified_referrals : "—"}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={auditTab === "activity"}
              className={auditTab === "activity" ? "is-active" : ""}
              onClick={() => setAuditTab("activity")}
            >
              Operational audit trail <span>{matchingRows.length}</span>
            </button>
          </div>

          {auditTab === "traffic" ? (
            <>
              <div className="admin-section-heading">
                <div>
                  <span className="eyebrow">SITE VISITORS VS ORDERS BREAKDOWN</span>
                  <h2>Daily traffic and conversions</h2>
                </div>
              </div>
              {loading ? (
                <div className="admin-module-loading"><span /><span /><span /></div>
              ) : trafficData.length === 0 ? (
                <div className="admin-module-empty">
                  <h3>No traffic records logged yet.</h3>
                  <p>When customers visit PreChop storefront, daily visitor statistics and conversions will appear here.</p>
                </div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-batches-table admin-module-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Unique site visitors</th>
                        <th>Page views</th>
                        <th>Total orders</th>
                        <th>Paid orders</th>
                        <th>Daily revenue</th>
                        <th>Conversion rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trafficData.map((dayRow, idx) => {
                        const dayDate = String(dayRow.date ?? "");
                        const isToday = dayDate === todayInZaria();
                        const conv = Number(dayRow.conversion_rate ?? 0);
                        return (
                          <tr key={dayDate || idx} style={isToday ? { background: "#fffbf7" } : undefined}>
                            <td>
                              <strong>{humanDate(dayDate)}</strong>
                              {isToday && <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--admin-orange)", fontWeight: "700" }}>TODAY</span>}
                            </td>
                            <td>
                              <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--admin-ink)" }}>
                                {Number(dayRow.unique_visitors ?? 0).toLocaleString()}
                              </span>
                            </td>
                            <td>{Number(dayRow.page_views ?? 0).toLocaleString()}</td>
                            <td>{Number(dayRow.total_orders ?? 0).toLocaleString()}</td>
                            <td>
                              <span style={{ fontWeight: "600", color: "#15803d" }}>
                                {Number(dayRow.paid_orders ?? 0).toLocaleString()}
                              </span>
                            </td>
                            <td><strong>{money(Number(dayRow.total_sales_ngn ?? 0))}</strong></td>
                            <td>
                              <span className={`admin-audit-conversion-badge ${conv < 5 && conv > 0 ? "low" : ""}`}>
                                {conv}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : auditTab === "campaign" ? (
            <>
              <div className="admin-section-heading">
                <div>
                  <span className="eyebrow">CAMPUS CAMPAIGN FUNNEL &amp; ANTI-FRAUD</span>
                  <h2>Referral link visits, rewards &amp; meal claims</h2>
                </div>
              </div>
              {campaignReportError && (
                <p className="error admin-report-error" role="alert" style={{ marginBottom: "16px" }}>
                  {campaignReportError}
                </p>
              )}
              <section className="admin-audit-kpis" aria-label="Referral campaign summary">
                <div className="admin-audit-kpi">
                  <span>Unique ?ref= link visits</span>
                  <strong>{loading ? "—" : (campaignReport?.total_link_visits ?? 0).toLocaleString()}</strong>
                  <small>{(campaignReport?.unique_referrers_with_visits ?? 0).toLocaleString()} active sharers</small>
                </div>
                <div className="admin-audit-kpi">
                  <span>Qualified referrals</span>
                  <strong>{loading ? "—" : (campaignReport?.qualified_referrals ?? 0).toLocaleString()}</strong>
                  <small>{(campaignReport?.pending_signups ?? 0).toLocaleString()} pending signups</small>
                </div>
                <div className="admin-audit-kpi">
                  <span>Wallet credit disbursed</span>
                  <strong>{loading ? "—" : money(campaignReport?.total_wallet_credit_disbursed_ngn ?? 0)}</strong>
                  <small>Deposited into customer wallets</small>
                </div>
                <div className="admin-audit-kpi">
                  <span>Claimed meal goals</span>
                  <strong>{loading ? "—" : (campaignReport?.claimed_meals_count ?? 0).toLocaleString()}</strong>
                  <small>Bonus prize value: {money(campaignReport?.bonus_prizes_cost_ngn ?? 0)}</small>
                </div>
              </section>
              {loading ? (
                <div className="admin-module-loading"><span /><span /><span /></div>
              ) : !campaignReport?.top_referrers?.length ? (
                <div className="admin-module-empty">
                  <h3>No referral link visits or referrals yet.</h3>
                  <p>As soon as students share their personal ?ref= invite links, link visits, signups, and payouts will appear here.</p>
                </div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-batches-table admin-module-table">
                    <thead>
                      <tr>
                        <th>Referrer</th>
                        <th>Invite code</th>
                        <th>Link visits</th>
                        <th>Pending</th>
                        <th>Qualified</th>
                        <th>Visit → order</th>
                        <th>Credit earned</th>
                        <th>Goal claim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignReport.top_referrers.map((refRow) => {
                        const convRate =
                          refRow.link_visits > 0
                            ? Math.round((refRow.qualified_count / refRow.link_visits) * 1000) / 10
                            : 0;
                        return (
                          <tr key={refRow.referrer_id}>
                            <td>
                              <strong>{refRow.full_name || "Customer"}</strong>
                              <div style={{ fontSize: "12px", color: "var(--admin-muted)" }}>{refRow.phone_e164}</div>
                            </td>
                            <td><code>{refRow.referral_code}</code></td>
                            <td><strong>{refRow.link_visits.toLocaleString()}</strong></td>
                            <td>{refRow.pending_count.toLocaleString()}</td>
                            <td><span style={{ fontWeight: "700", color: "#15803d" }}>{refRow.qualified_count.toLocaleString()}</span></td>
                            <td>
                              <span className={`admin-audit-conversion-badge ${convRate < 5 && convRate > 0 ? "low" : ""}`}>
                                {convRate}%
                              </span>
                            </td>
                            <td><strong>{money(refRow.earned_credit_ngn)}</strong></td>
                            <td>
                              <span className={`admin-audit-category-tag ${refRow.claim_status === "claimed" ? "orders" : "menus"}`}>
                                {refRow.claim_status.replaceAll("_", " ")}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="admin-section-heading">
                <div>
                  <span className="eyebrow">ADMIN ACTIONS & SYSTEM AUDIT</span>
                  <h2>Activity trail</h2>
                </div>
                <label className="admin-module-search">
                  <MagnifyingGlass size={17} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search audit trail..."
                  />
                </label>
              </div>

              <div className="admin-menu-filters" style={{ marginBottom: "16px" }} aria-label="Filter by audit category">
                {["all", "batches", "deliveries", "orders", "menus", "settings", "refunds"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={auditCategoryFilter === cat ? "is-active" : ""}
                    onClick={() => setAuditCategoryFilter(cat)}
                  >
                    {cat === "all" ? "All categories" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="admin-module-loading"><span /><span /><span /></div>
              ) : filtered.length === 0 ? (
                <div className="admin-module-empty">
                  <h3>{rows.length ? "No audit records match your filters." : "No admin actions recorded yet."}</h3>
                  <p>{rows.length ? "Try clearing search or picking another category." : "Admin operations like batch dispatches, cancellations and settings updates are logged here automatically."}</p>
                </div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-batches-table admin-module-table">
                    <thead>
                      <tr>
                        <th>Date & time</th>
                        <th>Admin user</th>
                        <th>Module</th>
                        <th>Action</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((logRow, idx) => (
                        <tr key={String(logRow.id ?? idx)}>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {typeof logRow.created_at === "string"
                              ? new Intl.DateTimeFormat("en-NG", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: "Africa/Lagos",
                                }).format(new Date(logRow.created_at))
                              : "—"}
                          </td>
                          <td>
                            <span style={{ fontSize: "13px", fontWeight: "500" }}>
                              {String(logRow.admin_email ?? "admin")}
                            </span>
                          </td>
                          <td>
                            <span className={`admin-audit-category-tag ${String(logRow.category ?? "").toLowerCase()}`}>
                              {String(logRow.category ?? "system")}
                            </span>
                          </td>
                          <td>
                            <strong style={{ fontSize: "13px" }}>
                              {String(logRow.action ?? "").replaceAll("_", " ")}
                            </strong>
                          </td>
                          <td>
                            <span style={{ fontSize: "13px", color: "var(--admin-ink)" }}>
                              {String(logRow.details ?? "—")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!loading && (
                <TablePagination
                  page={effectiveTablePage}
                  pageSize={tablePageSize}
                  total={matchingRows.length}
                  onChange={setTablePage}
                />
              )}
            </>
          )}
        </section>
      ) : section === "menus" ? <>
        <section className="admin-menu-planner">
          <div className="admin-menu-week-heading"><div><span className="eyebrow">YOUR SERVICE CALENDAR</span><h2>{formattedDay(weekStart, { month: "long" })} {formattedDay(weekStart, { day: "numeric" })} <span>—</span> {formattedDay(addDays(weekStart, 6), { month: "long", day: "numeric", year: "numeric" })}</h2><p>Choose a day to review or post its meals.</p></div><div className="admin-menu-week-controls"><button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)}><CaretLeft size={18} /></button><button type="button" onClick={() => { const current = mondayOf(todayInZaria()); setWeekStart(current); setSelectedDate(todayInZaria()); }}>This week</button><button type="button" aria-label="Next week" onClick={() => moveWeek(1)}><CaretRight size={18} /></button></div></div>
          <div className="admin-menu-date-strip" role="tablist" aria-label="Choose service date">{weekDays.map((date) => { const dayRows = rows.filter((row) => row.service_date === date); const activeDate = selectedDate === date; return <button type="button" role="tab" aria-selected={activeDate} className={activeDate ? "is-active" : ""} key={date} onClick={() => setSelectedDate(date)}><span>{formattedDay(date, { weekday: "short" })}</span><strong>{formattedDay(date, { day: "numeric" })}</strong><small>{dayRows.length ? `${dayRows.length} ${dayRows.length === 1 ? "meal" : "meals"}` : "No menu"}</small></button>; })}</div>
        </section>
        <section className="admin-menu-day-board">
          <div className="admin-menu-day-heading"><div><span className="eyebrow">{formattedDay(selectedDate, { weekday: "long" }).toUpperCase()}</span><h2>{formattedDay(selectedDate, { month: "long", day: "numeric" })}</h2><p>{menuRows.length} {menuRows.length === 1 ? "meal" : "meals"} {windowFilter === "all" ? "posted" : `available for ${windowFilter}`}</p></div><label className="admin-module-search"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a meal" /></label></div>
          <div className="admin-menu-filters" aria-label="Filter by delivery window"><button type="button" className={windowFilter === "all" ? "is-active" : ""} onClick={() => setWindowFilter("all")}>All windows</button>{menuWindows.map((name) => <button type="button" key={name} className={windowFilter === name ? "is-active" : ""} onClick={() => setWindowFilter(name)}>{name}</button>)}</div>
          {loading ? <div className="admin-menu-card-grid"><div className="admin-menu-card-skeleton" /><div className="admin-menu-card-skeleton" /></div> : menuRows.length === 0 ? <div className="admin-menu-empty"><span><CalendarBlank size={24} /></span><h3>{rows.some((row) => row.service_date === selectedDate) ? "No meals match this view." : "Nothing posted for this day yet."}</h3><p>{rows.some((row) => row.service_date === selectedDate) ? "Try another window or search term." : "Post a meal to make it available for customers on this date."}</p><button type="button" className="admin-module-primary" onClick={() => openCreateModal()}><Plus size={17} /> Post a meal</button></div> : <div className="admin-menu-card-grid">{menuRows.map((row) => <article className="admin-menu-card" key={String(row.id)}><div className="admin-menu-card-top">{row.meal_image ? <Image src={String(row.meal_image)} alt="" width={75} height={70} unoptimized /> : <div className="admin-menu-image-placeholder"><ForkKnife size={24} /></div>}<div className="admin-menu-card-copy"><div className="admin-menu-name-row"><h3>{String(row.meal_name)}</h3>{row.meal_active ? <span className="admin-menu-state">Live</span> : <span className="admin-menu-state is-paused">Meal paused</span>}</div><p>{money(Number(row.meal_price))}</p></div></div><div className="admin-menu-stock"><div><span>Remaining</span><strong className={Number(row.remaining) <= 3 ? "is-low" : ""}>{String(row.remaining)} <small>of {String(row.portion_limit)}</small></strong></div><div className="admin-menu-stock-track"><span style={{ width: `${Number(row.portion_limit) ? Math.min(100, Number(row.remaining) / Number(row.portion_limit) * 100) : 0}%` }} /></div><p>{Number(row.sold)} ordered · stock is shared across posted batches</p></div><div className="admin-menu-batch-heading"><span>DELIVERY WINDOWS</span><div style={{ display: "flex", gap: "8px" }}><button type="button" onClick={() => openCreateModal(row)}>Adjust</button><button type="button" style={{ color: "#ba3c11" }} onClick={() => void unpostMenuMeal(String(row.id), String(row.meal_name))}>Unpost</button></div></div><div className="admin-menu-batches">{row.postedBatches.length ? row.postedBatches.map((batch) => <span key={batch.id}>{batch.window} · {batch.name}<small>{batch.starts.slice(0, 5)}–{batch.ends.slice(0, 5)}</small></span>) : <span className="is-unposted">Not linked to a delivery batch</span>}</div></article>)}</div>}
        </section>
      </> : <section className="admin-section admin-module-section">{section === "add-ons" && <div className="admin-addon-tabs" role="tablist" aria-label="Add-on category"><button type="button" role="tab" aria-selected={addonTab === "protein"} className={addonTab === "protein" ? "is-active" : ""} onClick={() => setAddonTab("protein")}>Proteins <span>{rows.filter((row) => row.category === "protein").length}</span></button><button type="button" role="tab" aria-selected={addonTab === "extras"} className={addonTab === "extras" ? "is-active" : ""} onClick={() => setAddonTab("extras")}>Extras <span>{rows.filter((row) => row.category === "side" || row.category === "drink").length}</span></button></div>}<div className="admin-section-heading"><div><span className="eyebrow">CURRENT RECORDS</span><h2>{section === "add-ons" ? addonTab === "protein" ? "Proteins" : "Extras" : page.title}</h2></div><label className="admin-module-search"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "add-ons" ? `Search ${addonTab === "protein" ? "proteins" : "extras"}` : "Search records"} /></label></div>
        {loading ? <div className="admin-module-loading"><span /><span /><span /></div> : filtered.length === 0 ? <div className="admin-module-empty"><h3>{section === "orders" ? "No orders for this delivery window." : rows.length ? "No matching records." : "Nothing here yet."}</h3><p>{section === "orders" ? "Try another delivery window or date." : rows.length ? "Try another search." : "Records will appear here when they are added to PreChop."}</p></div> : <div className="admin-table-wrap"><table className={`admin-batches-table admin-module-table ${section === "deliveries" ? "admin-deliveries-table" : ""}`}><thead><tr>{page.columns.map((column) => <th key={column.key}>{column.label}</th>)}{page.editable && <th>Action</th>}{(section === "orders" || section === "deliveries" || section === "refunds") && <th>Details & Action</th>}</tr></thead><tbody>{filtered.map((row, index) => <tr key={String(row.id ?? index)}>{page.columns.map((column) => <td key={column.key}>{column.key === "image_url" && row.image_url ? <a href={String(row.image_url)} target="_blank" rel="noreferrer">View image</a> : <span className={column.format === "status" ? `admin-status admin-status-${String(row[column.key])}` : ""}>{display(row[column.key], column.format)}</span>}</td>)}{page.editable && <td><div className="admin-module-row-actions"><button className="admin-action-button" disabled={busy} onClick={() => openCreateModal(row)}>{section === "batches" ? "Edit times" : "Edit"}</button>{"active" in row && <button className="admin-action-button" disabled={busy} onClick={() => void toggleActive(row)}>{row.active ? "Pause" : "Make active"}</button>}</div></td>}{(section === "orders" || section === "deliveries") && <td><button type="button" className="admin-action-button" onClick={() => void showOrderDetail(String(row.order_id ?? row.id))}>View order</button></td>}{section === "refunds" && <td>{(row.status === "pending" || row.status === "failed") ? <button type="button" className="admin-action-button" style={{ color: "#c9430b" }} onClick={() => setResolveRefundRow(row)}>Resolve</button> : <span style={{ color: "var(--admin-muted)", fontSize: "12px" }}>Resolved</span>}</td>}</tr>)}</tbody></table></div>}
        {!loading && <TablePagination page={effectiveTablePage} pageSize={tablePageSize} total={matchingRows.length} onChange={setTablePage} />}
      </section>}

      {section === "refunds" && <section className="admin-section admin-module-section admin-wallet-ledger"><div className="admin-section-heading"><div><span className="eyebrow">CUSTOMER CREDIT HISTORY</span><h2>Wallet activity</h2></div></div>{walletEntries.length ? <div className="admin-table-wrap"><table className="admin-batches-table admin-module-table"><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Amount</th><th>Description</th></tr></thead><tbody>{paginatedWalletEntries.map((entry) => <tr key={String(entry.id)}><td>{humanDate(entry.created_at)}</td><td>{String(entry.customer)}</td><td>{String(entry.kind).replaceAll("_", " ")}</td><td>{money(Number(entry.amount_ngn))}</td><td>{String(entry.description)}</td></tr>)}</tbody></table></div> : <div className="admin-module-empty"><h3>No wallet activity yet.</h3><p>Refunds and order credits will appear here.</p></div>}</section>}
      {section === "refunds" && <div className="admin-module-pagination-bottom"><TablePagination page={effectiveWalletPage} pageSize={tablePageSize} total={walletEntries.length} onChange={setWalletPage} /></div>}
    </>}

    {createOpen && page.create && <div className="admin-module-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCreateOpen(false); setEditingRow(null); } }}><form className="admin-module-modal" onSubmit={(event) => void createRecord(event)}><div><span className="eyebrow">{editingRow ? "EDIT RECORD" : "NEW RECORD"}</span><button type="button" aria-label="Close" onClick={() => { setCreateOpen(false); setEditingRow(null); }}>×</button><h2>{editingRow ? section === "menus" ? "Adjust menu posting" : `Edit ${page.title.toLowerCase()}` : page.create.label}</h2></div>{page.create.fields.map((field) => <label key={field.key}>{field.label}{field.options ? <select name={field.key} required defaultValue={editingRow ? field.key === "window_id" ? String(windows.find((row) => row.id === editingRow.window_id)?.window ?? "") : String(editingRow[field.key] ?? "") : ""}><option value="" disabled>Select {field.label.toLowerCase()}</option>{(field.key === "window_id" ? windows.map((row) => ({ value: String(row.window), label: String(row.window) })) : (selectOptions[field.key] ?? []).length ? (selectOptions[field.key] ?? []).map((row) => ({ value: String(row.id ?? row.slug ?? row.name), label: String(row.window ?? row.name) })) : field.options.map((option) => ({ value: option, label: option }))).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "image" ? <><input name={field.key} type="file" accept="image/jpeg,image/png,image/webp" required={!editingRow && field.key === "image_url"} onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setImageFile(file); setImagePreview(file ? URL.createObjectURL(file) : ""); setClearImage(false); }} />{imagePreview || (editingRow && typeof editingRow.image_url === "string" && editingRow.image_url) ? <Image className="admin-image-preview" src={imagePreview || String(editingRow?.image_url)} alt="Selected meal or add-on" width={120} height={90} unoptimized /> : null}<small className="admin-image-help">JPG, PNG or WebP · up to 8 MB.{editingRow ? " Choose a new image to replace the current one." : ""}</small></> : <input name={field.key} type={field.type ?? "text"} defaultValue={editingRow ? editingRow[field.key] == null ? undefined : String(editingRow[field.key]) : section === "menus" && field.key === "service_date" ? selectedDate : undefined} required={field.key !== "description" && field.key !== "image_url" && field.key !== "announcement_banner" && field.key !== "service_paused_message" && field.key !== "allergen_note"} min={field.type === "number" ? 0 : undefined} />}</label>)}

      {section === "menus" && <fieldset style={{ border: "1px solid var(--admin-line)", borderRadius: "6px", padding: "14px", marginTop: "10px" }}><legend style={{ fontSize: "12px", fontWeight: "600", color: "#5e5b56", padding: "0 6px" }}>Available delivery batches for this meal</legend><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>{batchesList.map(batch => <label key={String(batch.id)} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}><input type="checkbox" checked={selectedBatchIds.includes(String(batch.id))} onChange={(e) => { if (e.target.checked) setSelectedBatchIds(curr => [...curr, String(batch.id)]); else setSelectedBatchIds(curr => curr.filter(id => id !== String(batch.id))); }} />{String(batch.name)} ({String(windows.find(w => w.id === batch.window_id)?.window ?? "")})</label>)}</div></fieldset>}

      {section === "meals" && <><fieldset style={{ border: "1px solid var(--admin-line)", borderRadius: "6px", padding: "14px", marginTop: "10px" }}><legend style={{ fontSize: "12px", fontWeight: "600", color: "#5e5b56", padding: "0 6px" }}>Compatible proteins</legend><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>{availableProteins.map(p => <label key={String(p.id)} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}><input type="checkbox" checked={selectedProteins.includes(String(p.id))} onChange={(e) => { if (e.target.checked) setSelectedProteins(curr => [...curr, String(p.id)]); else setSelectedProteins(curr => curr.filter(id => id !== String(p.id))); }} />{String(p.name)} ({money(Number(p.price_ngn))})</label>)}</div></fieldset><fieldset style={{ border: "1px solid var(--admin-line)", borderRadius: "6px", padding: "14px", marginTop: "10px" }}><legend style={{ fontSize: "12px", fontWeight: "600", color: "#5e5b56", padding: "0 6px" }}>Compatible extras & sides</legend><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>{availableExtras.map(e => <label key={String(e.id)} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}><input type="checkbox" checked={selectedExtras.includes(String(e.id))} onChange={(ev) => { if (ev.target.checked) setSelectedExtras(curr => [...curr, String(e.id)]); else setSelectedExtras(curr => curr.filter(id => id !== String(e.id))); }} />{String(e.name)} ({money(Number(e.price_ngn))})</label>)}</div></fieldset></>}

      <div className="admin-module-modal-actions"><button type="button" className="admin-refresh" onClick={() => { setCreateOpen(false); setEditingRow(null); setImageFile(null); setImagePreview(""); setClearImage(false); }}>Cancel</button><button className="admin-module-primary" disabled={busy}>{uploadingImage ? "Uploading image…" : busy ? "Saving…" : "Save"}</button></div></form></div>}

    {signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={() => { setSignInOpen(false); void load(); }} />}
  </main>;
}
