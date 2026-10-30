"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, MapPin, Plus, Star, Trash, UserCircle, X } from "@phosphor-icons/react";
import { Account as AccountPreview } from "@/components/account";
import { SignInDialog } from "@/components/sign-in";
import { AccountSkeleton } from "@/components/skeletons";
import { money } from "@/lib/menu";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type Area = { id: string; name: string; fee: number };
type Address = { id: string; label: string; areaId: string; address: string; note: string; isDefault: boolean };
type Profile = { id: string; name: string; phone: string };
type AddressDraft = { label: string; areaId: string; address: string; note: string };

function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal account-dialog" aria-label={title} onCancel={event => { event.preventDefault(); close(); }}>
    <button className="icon-button modal-close" aria-label="Close dialog" onClick={close}><X size={22} /></button>
    <span className="eyebrow">YOUR DETAILS</span><h2>{title}</h2>{children}
  </dialog>;
}

export function AccountApp() {
  const live = isSupabaseConfigured();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(live);
  const [signInOpen, setSignInOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [draft, setDraft] = useState<AddressDraft>({ label: "", areaId: "", address: "", note: "" });
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshAccount = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) setError(userError.message);
    if (!user) {
      setProfile(null); setAddresses([]); setAreas([]); setLoading(false); return;
    }
    const [profileResult, areasResult, addressResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,phone_e164").eq("id", user.id).maybeSingle(),
      supabase.from("delivery_areas").select("id,name,fee_ngn").eq("active", true).order("name"),
      supabase.from("customer_addresses").select("id,label,area_id,address,delivery_note,is_default").eq("customer_id", user.id).order("created_at"),
    ]);
    if (profileResult.error || areasResult.error || addressResult.error) {
      setError(profileResult.error?.message ?? areasResult.error?.message ?? addressResult.error?.message ?? "We couldn’t load your account.");
    }
    if (profileResult.data) setProfile({ id: user.id, name: profileResult.data.full_name, phone: profileResult.data.phone_e164 });
    const nextAreas: Area[] = ((areasResult.data ?? []) as { id: string; name: string; fee_ngn: number }[]).map(area => ({ id: area.id, name: area.name, fee: area.fee_ngn }));
    setAreas(nextAreas);
    setAddresses(((addressResult.data ?? []) as { id: string; label: string; area_id: string; address: string; delivery_note: string; is_default: boolean }[]).map(address => ({
      id: address.id,
      label: address.label,
      areaId: address.area_id,
      address: address.address,
      note: address.delivery_note,
      isDefault: address.is_default,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => { void refreshAccount(); }, 0);
    return () => clearTimeout(timer);
  }, [live, refreshAccount]);

  if (!live) return <AccountPreview />;

  async function saveAddress() {
    if (!profile) throw new Error("Sign in again to save this address.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const payload = {
      customer_id: profile.id,
      area_id: draft.areaId,
      label: draft.label.trim(),
      address: draft.address.trim(),
      delivery_note: draft.note.trim(),
      is_default: editing ? editing.isDefault : addresses.length === 0,
    };
    const result = editing
      ? await supabase.from("customer_addresses").update(payload).eq("id", editing.id).eq("customer_id", profile.id).select("id").single()
      : await supabase.from("customer_addresses").insert(payload).select("id").single();
    if (result.error) throw new Error(result.error.message);
    setFormOpen(false); setEditing(null); setNotice(`${payload.label} saved to your account.`); setError("");
    await refreshAccount();
  }

  async function makeDefault(address: Address) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error: updateError } = await supabase.rpc("set_default_customer_address", { p_address_id: address.id });
    if (updateError) { setError(updateError.message); return; }
    setNotice(`${address.label} is now your default address.`); await refreshAccount();
  }

  async function deleteAddress() {
    if (!deleteTarget || !profile) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const other = addresses.find(address => address.id !== deleteTarget.id);
    if (deleteTarget.isDefault && other) {
      const { error: defaultError } = await supabase.rpc("set_default_customer_address", { p_address_id: other.id });
      if (defaultError) { setError(defaultError.message); return; }
    }
    const { error: deleteError } = await supabase.from("customer_addresses").delete().eq("id", deleteTarget.id).eq("customer_id", profile.id);
    if (deleteError) { setError(deleteError.message); return; }
    setNotice(`${deleteTarget.label} removed from your saved addresses.`); setDeleteTarget(null); setError(""); await refreshAccount();
  }

  function beginAddress(address?: Address) {
    setEditing(address ?? null);
    setDraft(address ? { label: address.label, areaId: address.areaId, address: address.address, note: address.note } : { label: "", areaId: "", address: "", note: "" });
    setFormOpen(true); setError("");
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const fullName = nameDraft.trim();
    if (fullName.length < 2 || fullName.length > 80) { setError("Enter a name between 2 and 80 characters."); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setSavingName(true); setError("");
    try {
      const { error: updateError } = await supabase.from("profiles").update({ full_name: fullName, updated_at: new Date().toISOString() }).eq("id", profile.id);
      if (updateError) throw updateError;
      setProfile({ ...profile, name: fullName }); setNameOpen(false); setNotice("Your name has been updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t update your name.");
    } finally { setSavingName(false); }
  }

  return <main className="account-shell">
    <div className="account-heading"><span className="eyebrow">THE LITTLE DETAILS, SORTED</span><h1>Your account.</h1><p>Make your next order a little easier.</p></div>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="account-notice" role="status"><Check size={20} />{notice}</p>}
    {loading ? <AccountSkeleton /> : !profile ? <section className="account-profile"><div className="account-profile-heading"><span className="account-avatar"><UserCircle size={42} weight="light" /></span><div><h2>Sign in to your account</h2><p>Use your phone number to view and save delivery addresses.</p></div></div><button className="primary" onClick={() => setSignInOpen(true)}>Sign in or create account <ArrowRight size={18} /></button></section> : <>
      <section className="account-profile" aria-labelledby="profile-title"><div className="account-profile-heading"><span className="account-avatar"><UserCircle size={42} weight="light" /></span><div><h2 id="profile-title">Personal details</h2><p>Used for your delivery updates.</p></div></div><div className="account-profile-row"><div><span>Name</span><strong>{profile.name}</strong></div><button onClick={() => { setNameDraft(profile.name); setNameOpen(true); setError(""); }} aria-label="Edit name">Edit <ArrowRight size={18} /></button></div><div className="account-profile-row"><div><span>Phone number</span><strong>{profile.phone}</strong><small>Verified for sign-in and delivery calls</small></div></div><button className="signin-back" onClick={async () => { const supabase = getSupabaseBrowserClient(); await supabase?.auth.signOut(); setProfile(null); setAddresses([]); setNotice("You have signed out."); }}>Sign out</button></section>
      <section className="account-addresses" aria-labelledby="addresses-title"><div className="account-section-heading"><div><h2 id="addresses-title">Your delivery spots</h2><p>Save an address for home, class, work or wherever your day takes you.</p></div><button className="primary" onClick={() => beginAddress()}><Plus size={20} /> Add address</button></div>
        {addresses.length ? <div className="address-grid">{addresses.map(address => { const area = areas.find(item => item.id === address.areaId); return <article className="address-card" key={address.id}><div className="address-card-heading"><MapPin size={24} /><h3>{address.label}</h3>{address.isDefault && <span><Star size={14} weight="fill" /> Default</span>}</div><span className="address-area">{area?.name ?? "Delivery area"}</span><p>{address.address}</p>{address.note && <p className="address-note">{address.note}</p>}<div className="address-fee"><span>Delivery fee</span><strong>{area ? money(area.fee) : "—"}</strong></div><div className="address-actions"><button onClick={() => beginAddress(address)} aria-label={`Edit ${address.label}`}>Edit</button>{!address.isDefault && <button onClick={() => void makeDefault(address)}>Make default</button>}<button onClick={() => setDeleteTarget(address)} aria-label={`Delete ${address.label}`}><Trash size={17} /> Delete</button></div></article>; })}</div> : <div className="account-empty"><MapPin size={38} /><h3>Where should we bring your meals?</h3><p>Add your first address to keep it handy for next time.</p></div>}
        <p className="account-address-hint">Choose a different saved address for each scheduled delivery. Existing orders keep the address you used at checkout.</p>
      </section>
    </>}
    <div className="account-links"><Link href="/orders"><span><strong>Your orders</strong><small>See upcoming deliveries and track your plates.</small></span><ArrowRight size={22} /></Link><Link href="/wallet"><span><strong>Your wallet</strong><small>View refund credit and transaction history.</small></span><ArrowRight size={22} /></Link><Link href="/campaign"><span><strong>Invite friends</strong><small>Share your link and earn wallet credit when they order.</small></span><ArrowRight size={22} /></Link></div>
    {signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={profileInfo => { setSignInOpen(false); setNotice(`Welcome, ${profileInfo.name}.`); void refreshAccount(); }} />}
    {nameOpen && <Dialog title="What should we call you?" close={() => { if (!savingName) setNameOpen(false); }}><p className="account-dialog-intro">This name appears on your delivery details.</p><form className="account-form" onSubmit={saveName}><label>Your name<input autoFocus required minLength={2} maxLength={80} autoComplete="name" value={nameDraft} onChange={event => setNameDraft(event.target.value)} disabled={savingName} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={savingName}>{savingName ? "Saving…" : "Save name"} <Check size={18} /></button></form></Dialog>}
    {formOpen && <Dialog title={editing ? "Edit saved address" : "A new delivery spot."} close={() => { setFormOpen(false); setEditing(null); }}><p className="account-dialog-intro">Give it a name you’ll recognise at checkout.</p><form className="account-form" onSubmit={async event => { event.preventDefault(); if (draft.label.trim().length < 2 || draft.address.trim().length < 8 || !draft.areaId) { setError("Add a label, a delivery area and a full address with a landmark."); return; } try { await saveAddress(); } catch (reason) { setError(reason instanceof Error ? reason.message : "We couldn’t save this address."); } }}>
      <label>Address label<input required maxLength={35} placeholder="e.g. Home, Hostel or Department" value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} /></label>
      <label>Delivery area<select required value={draft.areaId} onChange={event => setDraft({ ...draft, areaId: event.target.value })}><option value="">Choose an area</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
      <label>Address & landmark<textarea required minLength={8} maxLength={300} rows={3} placeholder="Building, street and a nearby landmark" value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
      <label>Delivery note <span>(optional)</span><input maxLength={200} placeholder="Anything that helps us find you?" value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
      {error && <p className="error" role="alert">{error}</p>}<button className="primary" type="submit">Save address <Check size={18} /></button>
    </form></Dialog>}
    {deleteTarget && <Dialog title={`Delete ${deleteTarget.label}?`} close={() => setDeleteTarget(null)}><p className="account-dialog-intro">Existing orders keep their current address.</p>{error && <p className="error" role="alert">{error}</p>}<button className="primary" onClick={() => void deleteAddress()}>Delete address</button><button className="signin-back" onClick={() => setDeleteTarget(null)}>Keep address</button></Dialog>}
  </main>;
}
