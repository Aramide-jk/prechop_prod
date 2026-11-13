"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ForkKnife, Gift, MapPin, Megaphone, Receipt, User, Wallet } from "@phosphor-icons/react";
import { captureReferralCode, attributePendingReferral, recordReferralLinkVisit } from "@/lib/referrals";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchStoreSettings, isCampaignLive } from "@/lib/settings";

const links = [
  { label: "Menu", href: "/", icon: ForkKnife },
  { label: "Orders", href: "/orders", icon: Receipt },
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Campaign", href: "/campaign", icon: Gift },
  { label: "Account", href: "/account", icon: User },
];

export function CustomerNavigation() {
  const pathname = usePathname();
  const [customNotice, setCustomNotice] = useState("");
  const [campaignEnabled, setCampaignEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let sid = "";
    try {
      const todayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      sid = window.sessionStorage.getItem(`prechop_sid_${todayKey}`) ?? "";
      if (!sid) {
        sid = `pc_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        window.sessionStorage.setItem(`prechop_sid_${todayKey}`, sid);
      }
      void fetch("/api/analytics/visit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, path: pathname }),
      });
    } catch {
      /* Ignore storage access restrictions */
    }

    const supabase = getSupabaseBrowserClient();
    const refParam = new URLSearchParams(window.location.search).get("ref");

    void (async () => {
      try {
        const [authRes, storeSettings] = await Promise.all([
          supabase ? supabase.auth.getUser() : Promise.resolve({ data: { user: null } }),
          fetchStoreSettings(),
        ]);

        const isLive = isCampaignLive(storeSettings);
        setCampaignEnabled(isLive);
        if (storeSettings.announcement_banner) {
          setCustomNotice(storeSettings.announcement_banner);
        }

        // Only capture, count link visits, and attribute referrals while campaign is live & in window
        if (isLive) {
          if (refParam) {
            captureReferralCode(refParam);
            if (sid) {
              void recordReferralLinkVisit(refParam, sid, pathname);
            }
          }
          if (authRes.data?.user) {
            await attributePendingReferral(storeSettings);
          }
        }
      } catch {
        /* Attribution and settings load silently retry on next page navigation. */
      }
    })();
  }, [pathname]);

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  if (pathname.startsWith("/admin")) return null;

  return (
    <>
      {customNotice ? (
        <div className="campaign-marquee" role="region" aria-label="Store announcement">
          <span className="campaign-marquee-track" aria-hidden="true">
            <span>{customNotice}</span>
            <Megaphone size={16} weight="fill" />
            <span className="campaign-marquee-separator">✦</span>
            <span>{customNotice}</span>
            <Megaphone size={16} weight="fill" />
            <span className="campaign-marquee-separator">✦</span>
            <span>{customNotice}</span>
            <Megaphone size={16} weight="fill" />
            <span className="campaign-marquee-separator">✦</span>
          </span>
        </div>
      ) : campaignEnabled ? (
        <Link
          className="campaign-marquee"
          href="/campaign"
          aria-label="Visit the PreChop friends campaign"
        >
          <span className="sr-only">
            Invite friends to PreChop. When they order, you earn wallet credit. Visit the campaign page.
          </span>
          <span className="campaign-marquee-track" aria-hidden="true">
            <span>Good food is better shared</span>
            <Gift size={16} weight="fill" />
            <span>Invite friends to PreChop and earn wallet credit when they order</span>
            <span className="campaign-marquee-separator">✦</span>
            <span>Good food is better shared</span>
            <Gift size={16} weight="fill" />
            <span>Invite friends to PreChop and earn wallet credit when they order</span>
            <span className="campaign-marquee-separator">✦</span>
          </span>
          <span className="campaign-marquee-cta" aria-hidden="true">
            Explore campaign <ArrowRight size={16} />
          </span>
        </Link>
      ) : null}

      <header className="header customer-header">
        <Link className="brand" href="/" aria-label="PreChop home">
          <Image
            src="/images/prechop-logo.jpeg"
            alt="PreChop"
            width={432}
            height={108}
            priority
          />
        </Link>
        <nav aria-label="Main navigation">
          {links.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={active(href) ? "active" : undefined}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="header-location" aria-label="Delivery location: ABU Samaru, Zaria">
          <MapPin size={13} weight="fill" />
          <span>ABU Samaru, Zaria</span>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.map(({ label, href, icon: Icon }) => {
          const isSelected = active(href);
          return (
            <Link
              key={href}
              href={href}
              className={`mobile-nav-link ${isSelected ? "active" : ""}`}
              aria-current={isSelected ? "page" : undefined}
            >
              <Icon size={22} weight="regular" aria-hidden="true" />
              <span className="mobile-nav-label">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
