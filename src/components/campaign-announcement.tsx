"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, X } from "@phosphor-icons/react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const seenKey = "prechop-campaign-announcement-seen-v1";

export function CampaignAnnouncement() {
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      const timer = window.setTimeout(() => setOpen(false), 0);
      return () => window.clearTimeout(timer);
    }
    if (pathname.startsWith("/campaign")) return;
    try { if (sessionStorage.getItem(seenKey)) return; } catch { /* Show the announcement when storage is unavailable. */ }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await supabase.from("referral_campaign_settings").select("enabled").eq("id", 1).maybeSingle();
        if (!cancelled && result.data?.enabled) setOpen(true);
      } catch { /* The announcement is optional if campaign settings cannot be loaded. */ }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    else if (!open && element?.open) element.close();
  }, [open]);

  function close() {
    try { sessionStorage.setItem(seenKey, "1"); } catch { /* The dialog can still close without session storage. */ }
    setOpen(false);
  }

  if (pathname.startsWith("/admin")) return null;

  return <dialog ref={dialog} className="modal campaign-announcement" aria-labelledby="campaign-announcement-title" onCancel={event => { event.preventDefault(); close(); }}>
    <button className="icon-button modal-close" aria-label="Close campaign announcement" onClick={close}><X size={21} /></button>
    <div className="campaign-announcement-art"><Image src="/images/campaign.jpeg" alt="PreChop ABU campus campaign: refer friends and earn meal credit" width={1600} height={900} /></div>
    <span className="eyebrow">PRECHOP CAMPUS CAMPAIGN</span>
    <h2 id="campaign-announcement-title">Invite friends. Earn meal credit.</h2>
    <p>Share your personal link. When invited friends order, you’ll earn credit for your next PreChop meal.</p>
    <button className="primary" onClick={() => { close(); router.push("/campaign"); }}>Get your campaign link <ArrowRight size={19} /></button>
  </dialog>;
}
