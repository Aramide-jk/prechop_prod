import type { ReactNode } from "react";

function Block({ className = "" }: { className?: string }) {
  return <span className={`skeleton-block ${className}`} aria-hidden="true" />;
}

function Status({ label, children }: { label: string; children: ReactNode }) {
  return <div className="skeleton-state" role="status" aria-label={label} aria-busy="true">{children}<span className="sr-only">{label}</span></div>;
}

export function MealGridSkeleton() {
  return <Status label="Loading meals"><div className="skeleton-meal-grid">{Array.from({ length: 4 }, (_, index) => <article className="skeleton-meal" key={index}><Block className="skeleton-meal-image" /><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /><div className="skeleton-meal-bottom"><Block className="skeleton-line skeleton-line-price" /><Block className="skeleton-circle" /></div></article>)}</div></Status>;
}

export function DateStripSkeleton() {
  return <Status label="Loading dates"><div className="skeleton-date-strip">{Array.from({ length: 7 }, (_, index) => <Block className="skeleton-date" key={index} />)}</div></Status>;
}

export function CartSkeleton() {
  return <Status label="Loading your order"><div className="skeleton-cart"><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-cart-meal" /><Block className="skeleton-cart-meal" /><Block className="skeleton-line skeleton-line-price" /><Block className="skeleton-field" /></div></Status>;
}

export function CheckoutSkeleton() {
  return <Status label="Loading checkout"><div className="skeleton-checkout"><div className="skeleton-checkout-deliveries">{[0, 1].map(item => <section className="skeleton-checkout-card" key={item}><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /><Block className="skeleton-field" /><Block className="skeleton-field" /><Block className="skeleton-field skeleton-field-tall" /></section>)}</div><aside className="skeleton-checkout-summary"><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /><Block className="skeleton-field" /><Block className="skeleton-field" /><Block className="skeleton-field" /></aside></div></Status>;
}

export function OrdersSkeleton() {
  return <Status label="Loading deliveries"><div className="skeleton-orders">{[0, 1, 2].map(item => <article className="skeleton-order-card" key={item}><div className="skeleton-order-top"><Block className="skeleton-line skeleton-line-copy" /><Block className="skeleton-pill" /></div><Block className="skeleton-line skeleton-line-title" /><div className="skeleton-order-meal"><Block className="skeleton-order-image" /><div><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /></div></div></article>)}</div></Status>;
}

export function WalletSkeleton() {
  return <Status label="Loading wallet"><div className="skeleton-wallet-page"><div className="skeleton-wallet-heading"><Block className="skeleton-line skeleton-line-copy" /><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /></div><div className="skeleton-wallet"><section className="skeleton-wallet-balance"><Block className="skeleton-line skeleton-line-copy" /><Block className="skeleton-line skeleton-balance-value" /><Block className="skeleton-line skeleton-line-copy" /></section><section className="skeleton-wallet-list"><Block className="skeleton-line skeleton-line-title" />{[0, 1, 2, 3].map(item => <div className="skeleton-wallet-row" key={item}><Block className="skeleton-circle" /><div><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /></div><Block className="skeleton-line skeleton-line-price" /></div>)}</section></div></div></Status>;
}

export function AccountSkeleton() {
  return <Status label="Loading account"><div className="skeleton-account"><section className="skeleton-account-profile"><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /><Block className="skeleton-field" /><Block className="skeleton-field" /></section><div className="skeleton-account-addresses">{[0, 1].map(item => <section className="skeleton-account-address" key={item}><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /><Block className="skeleton-line skeleton-line-copy" /></section>)}</div></div></Status>;
}

export function CampaignSkeleton() {
  return <Status label="Loading campaign"><div className="skeleton-campaign"><Block className="skeleton-campaign-art" /><section className="skeleton-campaign-progress"><Block className="skeleton-line skeleton-line-title" /><Block className="skeleton-line skeleton-line-copy" /><Block className="skeleton-field" /><Block className="skeleton-field" /></section><section className="skeleton-account-addresses">{[0, 1].map(item => <Block className="skeleton-field skeleton-campaign-friend" key={item} />)}</section></div></Status>;
}
