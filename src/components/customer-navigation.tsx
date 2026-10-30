"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, ForkKnife, Gift, MapPin, Receipt, UserCircle, Wallet } from "@phosphor-icons/react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { attributePendingReferral, captureReferralCode } from "@/lib/referrals";

const links = [
  { label: "Menu", href: "/", icon: ForkKnife },
  { label: "Orders", href: "/orders", icon: Receipt },
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Campaign", href: "/campaign", icon: Gift },
  { label: "Account", href: "/account", icon: UserCircle },
];
export function CustomerNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    captureReferralCode(new URLSearchParams(window.location.search).get("ref"));
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void (async () => {
      try {
        const result = await supabase.auth.getUser();
        if (result.data.user) await attributePendingReferral();
      } catch { /* Referral attribution retries when the next app page loads. */ }
    })();
  }, [pathname]);
  const active = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  if (pathname.startsWith("/admin")) return null;
  return <><Link className="campaign-marquee" href="/campaign" aria-label="Visit the PreChop friends campaign"><span className="sr-only">Invite friends to PreChop. When they order, you earn wallet credit. Visit the campaign page.</span><span className="campaign-marquee-track" aria-hidden="true"><span>Good food is better shared</span><Gift size={16} weight="fill" /><span>Invite friends to PreChop and earn wallet credit when they order</span><span className="campaign-marquee-separator">✦</span><span>Good food is better shared</span><Gift size={16} weight="fill" /><span>Invite friends to PreChop and earn wallet credit when they order</span><span className="campaign-marquee-separator">✦</span></span><span className="campaign-marquee-cta" aria-hidden="true">Explore campaign <ArrowRight size={16} /></span></Link><header className="header customer-header"><Link className="brand" href="/" aria-label="PreChop home"><Image src="/images/prechop-logo.jpeg" alt="PreChop" width={432} height={108} priority /></Link><nav aria-label="Main navigation">{links.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className={active(href) ? "active" : undefined} aria-current={active(href) ? "page" : undefined}><Icon size={20} /><span>{label}</span></Link>)}</nav><div className="header-location"><MapPin size={18} /><span>ABU · Sabon Gari</span></div></header><nav className="mobile-nav customer-mobile-nav" aria-label="Mobile navigation">{links.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className={active(href) ? "active" : undefined} aria-current={active(href) ? "page" : undefined}><Icon size={22} weight={active(href) ? "fill" : "regular"} /><span>{label}</span></Link>)}</nav></>;
}
