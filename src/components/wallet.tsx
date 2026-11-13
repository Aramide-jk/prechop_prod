"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Clock, Receipt, Wallet, X } from "@phosphor-icons/react";
import { money } from "@/lib/menu";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { SignInDialog } from "@/components/sign-in";
import { WalletSkeleton } from "@/components/skeletons";

type Entry = { id: string; date: string; title: string; amount: number; delivery: string; detail: string; balance: number };
// Independent sample ledger. Never used to authorise or settle a payment.
const entries: Entry[] = [
  { id: "DEMO-W004", date: "28 Sep 2026 · 9:42 AM", title: "Credit used on meals", amount: -1700, delivery: "DEMO-104", detail: "Wallet credit applied to a meal order. The remaining amount would be paid through Paystack.", balance: 1500 },
  { id: "DEMO-W003", date: "27 Sep 2026 · 4:15 PM", title: "Cancelled delivery refund", amount: 3200, delivery: "DEMO-105", detail: "Delivery cancelled before its ordering cutoff. Meal fees and the delivery fee were returned as wallet credit.", balance: 3200 },
  { id: "DEMO-W002", date: "26 Sep 2026 · 8:30 AM", title: "Credit used on meals", amount: -4900, delivery: "DEMO-103", detail: "Wallet credit covered the full cost of the meals and delivery in this sample order.", balance: 0 },
  { id: "DEMO-W001", date: "25 Sep 2026 · 2:10 PM", title: "Cancelled delivery refund", amount: 4900, delivery: "DEMO-106", detail: "Delivery cancelled before its ordering cutoff. The full delivery total was returned as wallet credit.", balance: 4900 },
];

function Transaction({ entry, close, sample }: { entry: Entry; close: () => void; sample: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current; const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal wallet-dialog" aria-labelledby="transaction-title" onCancel={e => { e.preventDefault(); close(); }}><button className="icon-button modal-close" aria-label="Close transaction" onClick={close}><X size={22} /></button><span className="eyebrow">{sample ? "SAMPLE TRANSACTION" : "WALLET TRANSACTION"}</span><h2 id="transaction-title">{entry.amount > 0 ? "Refund received." : "Credit put to good use."}</h2><p className={`wallet-detail-amount ${entry.amount > 0 ? "credit" : ""}`}>{entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}</p><span className="wallet-posted"><Check size={16} /> {sample ? "Completed · preview" : "Posted to your wallet"}</span><p className="wallet-detail-description">{entry.detail}</p><dl className="wallet-detail-list"><div><dt>Transaction</dt><dd>{entry.id}</dd></div><div><dt>Order reference</dt><dd>{entry.delivery}</dd></div><div><dt>Date</dt><dd>{entry.date}</dd></div><div><dt>Balance after transaction</dt><dd>{money(entry.balance)}</dd></div></dl>{sample && <p className="wallet-detail-note">These are sample records. No real refund or payment has been processed.</p>}<button className="primary" onClick={close}>Back to wallet <ArrowRight size={18} /></button></dialog>;
}

export function WalletPage() {
  const live = isSupabaseConfigured();
  const [filter, setFilter] = useState("All activity");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [empty, setEmpty] = useState(false);
  const [ledger, setLedger] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(live);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [signInOpen, setSignInOpen] = useState(false);
  useEffect(() => {
    if (!live) { const timer = setTimeout(() => { setLedger(entries); setSignedIn(true); setLoading(false); }, 0); return () => clearTimeout(timer); }
    let active = true;
    async function load() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { if (active) { setError("Supabase is not configured."); setLoading(false); } return; }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { if (active) { setSignedIn(false); setLedger([]); setLoading(false); } return; }
      if (active) setSignedIn(true);
      const { error: releaseError } = await supabase.rpc("release_expired_customer_wallet_credits");
      const { data, error: ledgerError } = await supabase.from("wallet_entries").select("id,order_id,kind,amount_ngn,description,created_at,orders(payment_reference)").eq("customer_id", auth.user.id).order("created_at", { ascending: true });
      if (!active) return;
      if (releaseError || ledgerError) { setError(releaseError?.message ?? ledgerError?.message ?? "We couldn’t load wallet activity."); setLedger([]); setLoading(false); return; }
      let balance = 0;
      const ascending = ((data ?? []) as unknown as { id: string; order_id: string | null; kind: string; amount_ngn: number; description: string; created_at: string; orders: { payment_reference: string | null } | { payment_reference: string | null }[] | null }[]).map(row => {
        balance += row.amount_ngn;
        const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
        return { id: row.id, date: new Date(row.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }), title: row.kind === "refund" ? "Cancelled delivery refund" : row.kind === "order_debit" ? "Credit used on meals" : "Wallet adjustment", amount: row.amount_ngn, delivery: order?.payment_reference ?? row.order_id ?? "Wallet", detail: row.description, balance };
      });
      setLedger(ascending.reverse()); setError(""); setLoading(false);
    }
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [live]);
  const entriesForView = live ? ledger : empty ? [] : ledger;
  const balance = entriesForView.reduce((sum, entry) => sum + entry.amount, 0);
  const shown = entriesForView.filter(entry => filter === "All activity" || (filter === "Refunds" ? entry.amount > 0 : entry.amount < 0));
  return <>
    <main className="wallet-shell">{!live && <div className="wallet-preview"><Receipt size={20} /><p><strong>Wallet design preview</strong> This sample balance and history are separate from your checkout and order previews.</p><label><input type="checkbox" checked={empty} onChange={e => setEmpty(e.target.checked)} /> Preview empty wallet</label></div>}
      {error && <p className="error" role="alert">{error}</p>}{loading && <WalletSkeleton />}{live && !signedIn && !loading && <button className="primary" onClick={() => setSignInOpen(true)}>Sign in to view wallet <ArrowRight size={18} /></button>}<div className="wallet-heading"><span className="eyebrow">READY FOR YOUR NEXT MEAL</span><h1>Your wallet.</h1><p>Refund credit, ready whenever you are.</p></div>
      <div className="wallet-overview"><section className="wallet-balance" aria-labelledby="balance-title"><div className="wallet-balance-label"><Wallet size={23} /><h2 id="balance-title">Available credit</h2><span>{live ? "Your balance" : "Sample balance"}</span></div><p className="wallet-balance-value">{money(balance)}</p><p>Use your credit towards meals, extras and delivery at checkout.</p><Link href="/" className="primary">Find your next meal <ArrowRight size={19} /></Link><span className="wallet-expiry"><Clock size={17} /> Your credit never expires</span></section>
      <aside className="wallet-explainer"><span className="eyebrow muted">A LITTLE MORE ABOUT YOUR CREDIT</span><h2>Good food, another day.</h2><p>When you cancel before a delivery’s cutoff, your refund comes back here as meal credit.</p><ul><li><Check size={18} />Use credit on your next order.</li><li><Check size={18} />Pay any remaining amount at checkout.</li><li><Check size={18} />Keep unused credit for another day.</li></ul><p className="wallet-cash-note">Wallet credit cannot be withdrawn or converted to cash.</p></aside></div>
      <section className="wallet-history" aria-labelledby="history-title"><div className="wallet-history-heading"><div><h2 id="history-title">Wallet activity</h2><p>Every refund and every meal it helped pay for.</p></div><span>{shown.length} {shown.length === 1 ? "transaction" : "transactions"}</span></div><div className="orders-tabs" aria-label="Filter wallet activity">{["All activity", "Refunds", "Credit used"].map(tab => <button aria-pressed={filter === tab} onClick={() => setFilter(tab)} key={tab}>{tab}</button>)}</div>
      {shown.length ? <div className="wallet-transactions">{shown.map(entry => <button className="wallet-transaction" key={entry.id} onClick={() => setSelected(entry)} aria-label={`View transaction ${entry.id}`}><span className={`wallet-transaction-icon ${entry.amount > 0 ? "credit" : ""}`}>{entry.amount > 0 ? <ArrowDownLeft size={23} /> : <ArrowUpRight size={23} />}</span><span className="wallet-transaction-copy"><strong>{entry.title}</strong><span>{entry.date}</span><small>{entry.delivery} · Completed</small></span><span className={`wallet-transaction-amount ${entry.amount > 0 ? "credit" : ""}`}>{entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}<small>Balance: {money(entry.balance)}</small></span><ArrowRight className="wallet-row-arrow" size={19} /></button>)}</div> : <div className="wallet-empty"><Wallet size={40} weight="light" /><h3>Your wallet starts here.</h3><p>Refunds and credit used on orders will appear here. You can still order and pay at checkout.</p><Link href="/">Explore the menu <ArrowRight size={18} /></Link></div>}
      </section><div className="wallet-faq"><h2>A few useful details</h2><details><summary>How do I use my credit?</summary><p>Choose wallet credit at checkout. It reduces your order total, including extras and delivery. If credit covers the whole total, no additional payment is needed.</p></details><details><summary>When can I cancel a delivery?</summary><p>You can cancel before that delivery batch’s cutoff. After the cutoff, ordering, cancellation and address changes are closed.</p></details><details><summary>What if PreChop cancels my delivery?</summary><p>We’ll contact you directly. You can choose wallet credit or a refund to the original payment method for the amount paid through it. Any portion paid with wallet credit returns to your wallet.</p></details></div>
      {selected && <Transaction entry={selected} close={() => setSelected(null)} sample={!live} />}
    </main>{signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={() => { setSignInOpen(false); window.location.reload(); }} />}</>;
}
