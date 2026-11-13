import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Phone, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Terms of Service | PreChop",
  description:
    "PreChop terms of service, kitchen ordering cutoffs, closed-loop wallet rules, doorstep delivery, and campus pickup policies for ABU and Sabon Gari, Zaria.",
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <nav className="legal-nav-pills" aria-label="Legal documents">
        <Link href="/terms" className="active" aria-current="page">
          Terms of Service
        </Link>
        <Link href="/privacy">Privacy Policy</Link>
      </nav>

      <header className="legal-header">
        <span className="eyebrow">PRECHOP LEGAL & POLICIES</span>
        <h1>Terms of Service</h1>
        <div className="legal-meta">
          <span>Effective: 9 November 2026</span>
          <span className="legal-meta-dot" aria-hidden="true">
            ·
          </span>
          <span>Version 1.3</span>
          <span className="legal-meta-dot" aria-hidden="true">
            ·
          </span>
          <span>Zaria, Kaduna State, Nigeria</span>
        </div>
      </header>

      <section className="legal-highlight-card" aria-labelledby="terms-summary-heading">
        <strong id="terms-summary-heading">Key points you should know before ordering:</strong>
        <p>
          PreChop prepares fresh food on a planned schedule with strict kitchen cutoffs. You can cancel any meal
          before its cutoff for an instant 100% refund credited to your PreChop wallet. Customers may choose either
          doorstep delivery or free campus pickup at designated stations. Unclaimed pickup meals are held for a
          45-minute grace period before forfeiture without refund due to food safety regulations. Wallet credits
          represent closed-loop store credit redeemable for future meals and cannot be withdrawn as cash.
        </p>
      </section>

      <div className="legal-content">
        <section className="legal-section">
          <h2>1. Introduction & Acceptance</h2>
          <p>
            Welcome to PreChop (<strong>&ldquo;PreChop&rdquo;</strong>, <strong>&ldquo;we&rdquo;</strong>, or{" "}
            <strong>&ldquo;us&rdquo;</strong>), operating food delivery and campus pickup services across Ahmadu Bello
            University (Samaru and Kongo campuses) and Sabon Gari, Zaria, Kaduna State, Nigeria.
          </p>
          <p>
            By accessing our website, creating an account, or placing an order, you agree to comply with and be
            bound by these Terms of Service (<strong>&ldquo;Terms&rdquo;</strong>). If you do not agree to these
            Terms, you must discontinue using PreChop.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Service Channels & Timetable</h2>
          <p>
            PreChop provides scheduled fresh meal fulfillment through two channels, operating on predetermined meal
            windows:
          </p>
          <ul>
            <li>
              <strong>Breakfast:</strong> Morning window between 8:00 AM – 12:00 PM.
            </li>
            <li>
              <strong>Lunch:</strong> Afternoon window between 12:00 PM – 2:00 PM.
            </li>
            <li>
              <strong>Dinner:</strong> Evening window between 6:00 PM – 8:00 PM.
            </li>
          </ul>
          <h3>Fulfillment Options</h3>
          <ul>
            <li>
              <strong>Doorstep & Campus Delivery:</strong> Meals are dispatched via riders directly to your designated
              hostel, faculty, or off-campus residence within active coverage zones in ABU Samaru, Kongo campus, and
              Sabon Gari. Standard delivery fees apply based on your selected delivery area.
            </li>
            <li>
              <strong>Campus Pickup (Free):</strong> Meals are made available for personal collection with zero
              delivery fee (₦0) at our designated campus pickup station (e.g., PreChop desk inside ABU Social Center,
              Samaru campus).
            </li>
          </ul>
          <p>
            PreChop reserves the right to activate, pause, or adjust either fulfillment channel in response to campus
            holidays, academic schedules, weather, or operational station availability.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Kitchen Cutoff Times & Batch Planning</h2>
          <p>
            To guarantee food quality and on-time preparation, our kitchens operate on batch-cooking schedules. Each
            meal window has an enforced ordering cutoff:
          </p>
          <ul>
            <li>
              <strong>Breakfast Cutoffs:</strong> 6:00 AM / 8:00 AM West Africa Time (WAT).
            </li>
            <li>
              <strong>Lunch Cutoff:</strong> 10:00 AM WAT.
            </li>
            <li>
              <strong>Dinner Cutoff:</strong> 3:00 PM / 4:00 PM WAT.
            </li>
          </ul>
          <p>
            Once a cutoff time passes for a particular meal, the ordering window closes automatically. Orders cannot
            be added, modified, or cancelled after cutoff because kitchen procurement and meal preparation begin
            immediately.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Pricing, Payments & Security</h2>
          <p>
            All prices are denominated in Nigerian Naira (₦ / NGN). Total order amounts are clearly displayed before
            payment and include:
          </p>
          <ul>
            <li>Base price of the selected meal.</li>
            <li>Cost of any selected protein (beef, chicken, fish, egg, or none).</li>
            <li>Cost of optional sides or drinks added to the plate.</li>
            <li>Delivery fee corresponding to the chosen delivery area (or ₦0 when Campus Pickup is chosen).</li>
          </ul>
          <p>
            Payments are securely processed via <strong>Paystack</strong> (licensed and regulated by the Central Bank
            of Nigeria and PCI-DSS Level 1 certified). PreChop does not collect, handle, or store raw debit/credit card
            numbers, CVVs, or bank account PINs.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. PreChop Wallet & Store Credit Rules</h2>
          <p>
            PreChop operates an in-app customer wallet designed to manage refunds, promotional bonuses, and referral
            rewards:
          </p>
          <ul>
            <li>
              <strong>Closed-Loop Store Credit:</strong> In compliance with Central Bank of Nigeria non-banking
              store credit standards, your PreChop wallet balance constitutes closed-loop store credit solely redeemable
              for meals on PreChop.
            </li>
            <li>
              <strong>Non-Transferable & Non-Withdrawable:</strong> Wallet balances cannot be withdrawn to external
              commercial bank accounts, transferred to other users, or redeemed for physical currency.
            </li>
            <li>
              <strong>No Expiry:</strong> Legitimate refund credits never expire and will remain available on your
              account for future meal orders. Time-limited promotional marketing credits will specify their validity
              period.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Cancellations & Refund Policy</h2>
          <ul>
            <li>
              <strong>Before Kitchen Cutoff:</strong> You can cancel any scheduled delivery or pickup order directly
              from your Orders dashboard before its designated cutoff time. You will receive an instant 100% refund
              credited directly to your PreChop wallet.
            </li>
            <li>
              <strong>After Kitchen Cutoff:</strong> Because ingredients have been allocated and food preparation
              has begun, cancellations, changes, or refunds are strictly not supported once the cutoff time has
              passed.
            </li>
            <li>
              <strong>Kitchen Out-of-Stock / Service Failure:</strong> If PreChop fails to fulfill an order due to a
              kitchen outage, severe weather disruption, or dispatch failure within our control, you are entitled to a
              free replacement or a full 100% wallet refund.
            </li>
            <li>
              <strong>Unclaimed Campus Pickup Orders (Strict No-Refund):</strong> Meals selected for Campus Pickup
              are held at the station for a 45-minute grace period after the close of the meal window. If you do not
              collect your meal within this holding window, the meal is forfeited for hygiene and food safety reasons.
              Because meals are prepared freshly to order and cannot be safely preserved or resold, unclaimed orders are
              strictly non-refundable.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>7. Customer Fulfillment Obligations</h2>
          <h3>A. For Doorstep & Campus Deliveries</h3>
          <ul>
            <li>
              Provide an accurate, accessible address with clear landmarks (e.g. hostel block, room number, or
              department).
            </li>
            <li>
              Keep your registered Nigerian phone number reachable during the scheduled delivery window so dispatch
              riders can notify you upon arrival.
            </li>
            <li>
              Collect your meal promptly. Dispatch riders will wait a maximum of 10 minutes at the agreed drop-off
              point before moving to subsequent campus deliveries.
            </li>
          </ul>

          <h3>B. For Campus Pickup Orders</h3>
          <ul>
            <li>
              <strong>Collection Location & Hours:</strong> Collect your meal at the designated PreChop campus station
              desk during the scheduled meal window.
            </li>
            <li>
              <strong>Verification:</strong> Present your digital order receipt, Order reference ID, or registered phone
              number to the PreChop station attendant to claim your meal.
            </li>
            <li>
              <strong>Third-Party Collection:</strong> You may authorize a coursemate or friend to collect on your
              behalf, provided they present your valid order reference ID or are noted in your order instructions.
            </li>
            <li>
              <strong>Holding Grace Period:</strong> Pickup orders are held for a maximum of 45 minutes after the meal
              window closes. After this period, uncollected meals are discarded for food safety.
            </li>
            <li>
              <strong>Emergency Hostel Delivery Reroute:</strong> If you are delayed in a lecture or unwell in your
              hostel, you may contact PreChop WhatsApp dispatch before your holding window closes to request an
              emergency reroute to doorstep delivery, subject to rider availability and standard hostel delivery fees.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>8. Food Hygiene & Allergen Disclaimers</h2>
          <p>
            All meals are freshly prepared following commercial hygiene and food safety guidelines. However, our
            kitchens handle common culinary ingredients including peanuts/groundnuts, fish, eggs, dairy, and
            spices.
          </p>
          <p>
            While we display allergen notices on individual meal cards, customers with severe or life-threatening food
            allergies must exercise due care and review meal descriptions before placing an order.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Referral Campaign &amp; Fair Usage</h2>
          <p>
            PreChop may operate a campus referral campaign subject to an active campaign window, qualifying order rules,
            and featured meal goal settings configured by PreChop.
          </p>
          <ul>
            <li>
              <strong>Qualifying Orders &amp; Minimum Spend:</strong> A referral counts as qualified only after the
              invited friend’s first paid food order (subtotal before delivery fees or wallet deductions) meets or
              exceeds the minimum qualifying order amount configured for the campaign and is confirmed by PreChop.
            </li>
            <li>
              <strong>Link Visits vs. Qualified Referrals:</strong> Unique referral link visit counters help participants
              track engagement and exclude automated preview bots, repeated daily refreshes, and self-visits; only
              completed qualifying friend orders generate wallet credit or unlock meal goals.
            </li>
            <li>
              <strong>Wallet Credit vs. Featured Meal Claims:</strong> Wallet credit earned from qualified referrals
              is closed-loop store credit that never expires and remains usable at checkout even after a campaign window
              closes. Where a bonus free-claim featured meal prize is offered, claiming the prize itself may carry an
              expiry deadline after unlock, and delivery fees or optional extras still apply unless waived.
            </li>
            <li>
              <strong>Fair Usage &amp; Abuse Prevention:</strong> Self-referrals, duplicate accounts, split-basket
              manipulation, or automated traffic will result in reward disqualification, forfeiture of campaign credits,
              and potential account suspension. PreChop reserves the right to pause or modify campaign rules at any time.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>10. Governing Law & Dispute Resolution</h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of the Federal Republic of Nigeria.
            Any disputes arising from these Terms or your use of PreChop shall be resolved amicably through customer
            support, or failing that, through the courts of Kaduna State, Nigeria.
          </p>
        </section>

        <div className="legal-contact-box">
          <h3>Questions or need assistance?</h3>
          <p>
            Our customer care team is available to assist you with delivery questions, pickup inquiries, account
            support, or cancellations.
          </p>
          <div className="legal-contact-actions">
            <a
              href="https://wa.me/2349076038204?text=Hello%20PreChop%2C%20I%20have%20a%20question%20about%20the%20Terms%20of%20Service."
              className="legal-contact-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Phone size={16} /> WhatsApp Support
            </a>
            <a href="mailto:support@prechop.com" className="legal-contact-btn-secondary">
              <EnvelopeSimple size={16} /> support@prechop.com
            </a>
          </div>
        </div>

        <div className="legal-bottom-bar">
          <Link href="/">
            <ArrowLeft size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            Back to menu
          </Link>
          <span>
            Also read our <Link href="/privacy">Privacy Policy</Link>
          </span>
        </div>
      </div>
    </main>
  );
}
