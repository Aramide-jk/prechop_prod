"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, MapPin, PencilSimple, Plus, Star, Trash, UserCircle, X } from "@phosphor-icons/react";
import { money } from "@/lib/menu";
 

const areas = [{ id: "abu", name: "ABU · Samaru campus", fee: 500 }, { id: "samaru", name: "Samaru", fee: 700 }, { id: "sabon-gari", name: "Sabon Gari", fee: 1000 }];
type Address = { id: string; label: string; area: string; address: string; note: string };
const initialAddresses: Address[] = [{ id: "department", label: "Department", area: "abu", address: "Faculty of Engineering, main entrance", note: "Please call when you arrive." }, { id: "home", label: "Home", area: "samaru", address: "Samaru market road, beside the pharmacy", note: "" }];

function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; element?.showModal(); document.body.style.overflow = "hidden"; return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  return <dialog ref={ref} className="modal account-dialog" aria-labelledby="account-dialog-title" onCancel={e => { e.preventDefault(); close(); }}><button className="icon-button modal-close" aria-label="Close dialog" onClick={close}><X size={22} /></button><span className="eyebrow">YOUR DETAILS</span><h2 id="account-dialog-title">{title}</h2>{children}</dialog>;
}

function AddressForm({ initial, close, save }: { initial?: Address; close: () => void; save: (address: Address) => void }) {
  const [draft, setDraft] = useState(initial ?? { id: "", label: "", area: "", address: "", note: "" });
  const [error, setError] = useState("");
  const area = areas.find(a => a.id === draft.area);
  return <Dialog title={initial ? "Edit saved address" : "A new delivery spot."} close={close}><p className="account-dialog-intro">Give it a name you’ll recognise at checkout.</p><form className="account-form" onSubmit={e => { e.preventDefault(); if (draft.label.trim().length < 2 || draft.address.trim().length < 8 || !area) { setError("Add a label, a delivery area and a full address with a landmark."); return; } save({ ...draft, id: initial?.id ?? crypto.randomUUID(), label: draft.label.trim(), address: draft.address.trim(), note: draft.note.trim() }); }}>
    <label>Address label<input required maxLength={35} placeholder="e.g. Home, Hostel or Department" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label>
    <label>Delivery area<select aria-label="Delivery area" required value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })}><option value="">Choose an area</option>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>Address & landmark<textarea required rows={3} maxLength={300} placeholder="Building, street and a nearby landmark" value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} /></label>
    <label>Delivery note <span>(optional)</span><input maxLength={200} placeholder="Anything that helps us find you?" value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
    <p className="account-fee">Delivery fee: <strong>{area ? money(area.fee) : "Choose an area"}</strong></p>{error && <p className="error" role="alert">{error}</p>}<button className="primary" type="submit">Save address <Check size={18} /></button><p className="account-dialog-note">Preview only. Changes reset when you refresh this page.</p>
  </form></Dialog>;
}

export function Account() {
  const [name, setName] = useState("Amina Yusuf");
  const [phone, setPhone] = useState("0803 123 4567");
  const [addresses, setAddresses] = useState(initialAddresses);
  const [defaultId, setDefaultId] = useState("department");
  const [mode, setMode] = useState<"name" | "phone" | "add" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<Address | undefined>();
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function close() { setMode(null); setError(""); }
  function editProfile(kind: "name" | "phone") { setDraft(kind === "name" ? name : phone); setCode(""); setVerifying(false); setError(""); setMode(kind); }
  return <>
    <main className="account-shell"><div className="account-preview"><UserCircle size={23} /><p><strong>Account design preview</strong> Sample profile and addresses. Edits stay on this page, reset on refresh, and do not change checkout or existing deliveries.</p></div><div className="account-heading"><span className="eyebrow">THE LITTLE DETAILS, SORTED</span><h1>Your account.</h1><p>Make your next order a little easier.</p></div>
      <section className="account-profile" aria-labelledby="profile-title"><div className="account-profile-heading"><span className="account-avatar"><UserCircle size={42} weight="light" /></span><div><h2 id="profile-title">Personal details</h2><p>Just what we need to get your meals to you.</p></div></div><div className="account-profile-row"><div><span>Name</span><strong>{name}</strong></div><button onClick={() => editProfile("name")} aria-label="Edit name"><PencilSimple size={18} /> Edit</button></div><div className="account-profile-row"><div><span>Phone number</span><strong>{phone}</strong><small>For sign-in and delivery calls</small></div><button onClick={() => editProfile("phone")} aria-label="Change phone number">Change <ArrowRight size={18} /></button></div></section>
      <section className="account-addresses" aria-labelledby="addresses-title"><div className="account-section-heading"><div><h2 id="addresses-title">Your delivery spots</h2><p>Save an address for home, class, work or wherever your day takes you.</p></div><button className="primary" onClick={() => { setSelected(undefined); setMode("add"); }}><Plus size={20} /> Add address</button></div>
      {addresses.length ? <div className="address-grid">{addresses.map(address => { const area = areas.find(a => a.id === address.area)!; return <article className="address-card" key={address.id}><div className="address-card-heading"><MapPin size={24} /><h3>{address.label}</h3>{address.id === defaultId && <span><Star size={14} weight="fill" /> Default</span>}</div><span className="address-area">{area.name}</span><p>{address.address}</p>{address.note && <p className="address-note">{address.note}</p>}<div className="address-fee"><span>Delivery fee</span><strong>{money(area.fee)}</strong></div><div className="address-actions"><button onClick={() => { setSelected(address); setMode("edit"); }} aria-label={`Edit ${address.label}`}><PencilSimple size={17} /> Edit</button>{address.id !== defaultId && <button onClick={() => { setDefaultId(address.id); setNotice(`${address.label} is now your default address in this preview.`); }} aria-label={`Make ${address.label} default`}>Make default</button>}<button onClick={() => { setSelected(address); setMode("delete"); }} aria-label={`Delete ${address.label}`}><Trash size={17} /> Delete</button></div></article>; })}</div> : <div className="account-empty"><MapPin size={38} /><h3>Where should we bring your meals?</h3><p>Add your first address to keep it handy for next time.</p></div>}
      <p className="account-address-hint">You can choose a different address for each scheduled delivery. Editing a saved address won’t change an order you’ve already placed.</p></section>
      {notice && <p className="account-notice" role="status"><Check size={20} />{notice}</p>}
      <div className="account-links"><Link href="/orders"><span><strong>Your orders</strong><small>See upcoming deliveries and track your plates.</small></span><ArrowRight size={22} /></Link><Link href="/wallet"><span><strong>Your wallet</strong><small>View refund credit and transaction history.</small></span><ArrowRight size={22} /></Link></div>
      {(mode === "add" || mode === "edit") && <AddressForm initial={mode === "edit" ? selected : undefined} close={close} save={address => { setAddresses(current => mode === "edit" ? current.map(a => a.id === address.id ? address : a) : [...current, address]); if (!addresses.length) setDefaultId(address.id); setNotice(`${address.label} saved in this preview.`); close(); }} />}
      {mode === "delete" && selected && <Dialog title={`Delete ${selected.label}?`} close={close}><p className="account-dialog-intro">This removes the saved address. Existing deliveries keep their current address.</p>{selected.id === defaultId && <p className="account-dialog-note">{addresses.length > 1 ? "Your next saved address will become the default." : "You’ll have no saved addresses left."}</p>}<button className="primary" onClick={() => { const remaining = addresses.filter(a => a.id !== selected.id); setAddresses(remaining); if (defaultId === selected.id) setDefaultId(remaining[0]?.id ?? ""); setNotice(`${selected.label} removed from this preview.`); close(); }}>Delete address</button><button className="signin-back" onClick={close}>Keep address</button></Dialog>}
      {(mode === "name" || mode === "phone") && <Dialog title={mode === "name" ? "What should we call you?" : verifying ? "Verify your new number." : "Change phone number"} close={close}><p className="account-dialog-intro">{mode === "name" ? "This name appears on your delivery details." : verifying ? "Preview code: 123456. No SMS has been sent." : "A new phone number must be verified before it replaces your current number."}</p><form className="account-form" onSubmit={e => { e.preventDefault(); setError(""); if (mode === "name") { if (draft.trim().length < 2) { setError("Enter at least two characters for your name."); return; } setName(draft.trim()); } else if (!verifying) { const digits = draft.replace(/\s/g, ""); if (!/^0[789]\d{9}$/.test(digits)) { setError("Enter an 11-digit Nigerian mobile number."); return; } setDraft(digits); setVerifying(true); return; } else { if (code !== "123456") { setError("Use 123456 for this design preview."); return; } setPhone(draft); } setNotice("Profile updated in this preview. No real account has changed."); close(); }}><label>{mode === "name" ? "Your name" : verifying ? "Verification code" : "New phone number"}<input key={verifying ? "code" : mode} required autoComplete={mode === "name" ? "name" : verifying ? "one-time-code" : "tel"} type={mode === "phone" && !verifying ? "tel" : "text"} inputMode={mode === "phone" ? "numeric" : "text"} maxLength={verifying ? 6 : mode === "name" ? 80 : 20} value={verifying ? code : draft} onChange={e => verifying ? setCode(e.target.value.replace(/\D/g, "")) : setDraft(e.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" type="submit">{mode === "name" ? "Save name" : verifying ? "Verify preview code" : "Continue"}<ArrowRight size={18} /></button>{verifying && <button type="button" className="signin-back" onClick={() => { setVerifying(false); setError(""); setCode(""); }}>Change number</button>}</form></Dialog>}
    </main></>;
}
