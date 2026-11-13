"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowSquareOut, CalendarBlank, ChartBar, ClipboardText, ForkKnife, Gear, House,
  List, MapPin, Package, Receipt, SignOut, Stack, Truck, Wallet, X,
} from "@phosphor-icons/react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const links = [
  { href: "/admin", label: "Today", icon: House, exact: true, available: true },
  { href: "/admin/menus", label: "Weekly menus", icon: CalendarBlank, exact: false, available: true },
  { href: "/admin/meals", label: "Meals", icon: ForkKnife, exact: false, available: true },
  { href: "/admin/add-ons", label: "Proteins & extras", icon: Package, exact: false, available: true },
  { href: "/admin/batches", label: "Batches", icon: Stack, exact: false, available: true },
  { href: "/admin/orders", label: "Orders", icon: Receipt, exact: false, available: true },
  { href: "/admin/deliveries", label: "Deliveries", icon: Truck, exact: false, available: true },
  { href: "/admin/refunds", label: "Refunds & wallets", icon: Wallet, exact: false, available: true },
  { href: "/admin/areas", label: "Delivery areas", icon: MapPin, exact: false, available: true },
  { href: "/admin/abandoned-payments", label: "Reports", icon: ChartBar, exact: false, available: true },
  { href: "/admin/audit-log", label: "Audit log", icon: ClipboardText, exact: false, available: true },
  { href: "/admin/settings", label: "Settings", icon: Gear, exact: false, available: true },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setMobileOpen(false);
    router.replace("/admin");
    router.refresh();
  }

  return <div className="admin-workspace">
    {mobileOpen && <button className="admin-scrim" aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`admin-sidebar${mobileOpen ? " is-open" : ""}`} aria-label="Admin navigation">
      <Link className="admin-brand" href="/admin" onClick={() => setMobileOpen(false)}>
        <Image src="/images/prechop-logo.jpeg" alt="PreChop" width={144} height={36} priority />
        <span>ADMIN</span>
      </Link>
      <p className="admin-nav-label">WORKSPACE</p>
      <nav className="admin-nav">
        {links.map(({ href, label, icon: Icon, exact, available }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          if (!available) return <span key={href} className="admin-nav-item admin-nav-upcoming" aria-disabled="true" title={`${label} is coming next`}><Icon size={19} /><span>{label}</span><small>SOON</small></span>;
          return <Link key={href} href={href} className={`admin-nav-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)}><Icon size={19} weight={active ? "fill" : "regular"} /><span>{label}</span></Link>;
        })}
      </nav>
      <div className="admin-sidebar-bottom">
        <Link href="/" onClick={() => setMobileOpen(false)}><ArrowSquareOut size={18} /> Customer app</Link>
        <button type="button" onClick={() => void signOut()}><SignOut size={18} /> Sign out</button>
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <button className="admin-mobile-menu" type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>{mobileOpen ? <X size={22} /> : <List size={22} />}</button>
        <span>PreChop operations</span>
        <Link href="/" className="admin-topbar-customer">View customer app <ArrowSquareOut size={16} /></Link>
      </header>
      <div className="admin-content">{children}</div>
    </div>
  </div>;
}
