"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowClockwise, ArrowLeft, ArrowRight, Clock, Phone, WarningCircle } from "@phosphor-icons/react";
import { SignInDialog } from "@/components/sign-in";
import { money } from "@/lib/menu";

type DeliverySummary = { service_date: string; window: string; batch: string; area: string; meals: string[] };
type AbandonedPayment = {
  order_id: string;
  customer_name: string;
  customer_phone: string;
  payment_email: string | null;
  payment_reference: string;
  total_ngn: number;
  created_at: string;
  reservation_expires_at: string;
  plate_count: number;
  delivery_summary: DeliverySummary[];
};
type ApiResult = { entries?: AbandonedPayment[]; error?: string; code?: string };

function localDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AdminAbandonedPayments() {
  const [entries, setEntries] = useState<AbandonedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [access, setAccess] = useState<"checking" | "signed_out" | "not_admin" | "allowed">("checking");
  const [signInOpen, setSignInOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/abandoned-payments", { cache: "no-store" });
      const result = await response.json() as ApiResult;
      if (response.status === 401) { setAccess("signed_out"); setEntries([]); }
      else if (response.status === 403) { setAccess("not_admin"); setEntries([]); }
      else if (!response.ok) { setAccess("allowed"); setError(result.error ?? "We couldn’t load the report."); }
      else { setAccess("allowed"); setEntries(result.entries ?? []); }
    } catch {
      setAccess("allowed");
      setError("We couldn’t connect to the report. Check your connection and try again.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const expiredTotal = entries.reduce((sum, entry) => sum + entry.total_ngn, 0);

  return <main className="admin-payments-shell">
    <Link className="admin-back-link" href="/"><ArrowLeft size={17} /> Back to PreChop</Link>
    <header className="admin-payments-heading"><div><span className="eyebrow">PRECHOP ADMIN</span><h1>Unfinished payments.</h1><p>Customers who opened Paystack but didn’t complete payment before their meal hold expired.</p></div><button className="admin-refresh" onClick={() => void load(true)} disabled={loading || refreshing}><ArrowClockwise size={18} className={refreshing ? "admin-refresh-spin" : undefined} /> Refresh</button></header>

    {access === "signed_out" && !loading ? <section className="admin-access-card"><span className="admin-access-icon"><WarningCircle size={25} /></span><h2>Sign in to continue.</h2><p>Use the account that has been approved for PreChop admin reports.</p><button className="primary" onClick={() => setSignInOpen(true)}>Sign in <ArrowRight size={18} /></button></section> : null}
    {access === "not_admin" && !loading ? <section className="admin-access-card"><span className="admin-access-icon"><WarningCircle size={25} /></span><h2>Admin access required.</h2><p>This account isn’t on the admin allowlist. Switch accounts and sign in with the approved admin account.</p><Link className="admin-switch-account" href="/account">Go to your account <ArrowRight size={18} /></Link></section> : null}

    {access === "allowed" && <>
      {error && <p className="error admin-report-error" role="alert">{error}</p>}
      <section className="admin-payment-summary" aria-label="Unfinished payment summary"><div><span>Expired checkouts</span><strong>{loading ? "—" : entries.length}</strong></div><div><span>Unpaid total</span><strong>{loading ? "—" : money(expiredTotal)}</strong></div><p><Clock size={16} /> Only Paystack sessions whose 15-minute meal hold has expired appear here. Recent 90 days, up to 100 checkouts.</p></section>
      {loading ? <div className="admin-payment-loading" aria-label="Loading payments"><span /><span /><span /></div> : !entries.length ? <section className="admin-payment-empty"><span><Clock size={28} /></span><h2>No expired payments.</h2><p>Check back here when a customer leaves a Paystack checkout unpaid past the reservation window.</p></section> : <div className="admin-payment-list">{entries.map(entry => <article className="admin-payment-card" key={entry.order_id}>
        <div className="admin-payment-card-heading"><div><span className="admin-payment-status"><Clock size={15} /> Abandoned</span><p>Started {localDate(entry.created_at)} · hold expired {localDate(entry.reservation_expires_at)}</p></div><strong>{money(entry.total_ngn)}</strong></div>
        <div className="admin-payment-customer"><div><span>Customer</span><strong>{entry.customer_name}</strong></div><div><span>Phone</span><a href={`tel:${entry.customer_phone}`}><Phone size={15} /> {entry.customer_phone}</a></div>{entry.payment_email && <div><span>Payment email</span><a href={`mailto:${entry.payment_email}`}>{entry.payment_email}</a></div>}</div>
        <div className="admin-payment-order"><div><span>{entry.plate_count} {entry.plate_count === 1 ? "plate" : "plates"}</span><span>Reference · {entry.payment_reference}</span></div>{entry.delivery_summary.map((delivery, index) => <p key={`${entry.order_id}-${index}`}><strong>{localDate(`${delivery.service_date}T12:00:00`)} · {delivery.window}{delivery.batch ? ` · ${delivery.batch}` : ""}</strong><span>{delivery.meals.join(", ")} · {delivery.area}</span></p>)}</div>
      </article>)}</div>}
    </>}

    {signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={() => { setSignInOpen(false); setAccess("checking"); void load(); }} />}
  </main>;
}
