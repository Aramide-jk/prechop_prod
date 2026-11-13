import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Phone, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Privacy Policy | PreChop",
  description:
    "PreChop privacy policy and data protection practices in accordance with the Nigeria Data Protection Act 2023 (NDPA).",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <nav className="legal-nav-pills" aria-label="Legal documents">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy" className="active" aria-current="page">
          Privacy Policy
        </Link>
      </nav>

      <header className="legal-header">
        <span className="eyebrow">DATA PROTECTION & PRIVACY</span>
        <h1>Privacy Policy</h1>
        <div className="legal-meta">
          <span>Effective: 1 November 2026</span>
          <span className="legal-meta-dot" aria-hidden="true">
            ·
          </span>
          <span>Compliant with NDPA 2023</span>
          <span className="legal-meta-dot" aria-hidden="true">
            ·
          </span>
          <span>Zaria, Kaduna State, Nigeria</span>
        </div>
      </header>

      <section className="legal-highlight-card" aria-labelledby="privacy-summary-heading">
        <strong id="privacy-summary-heading">Our Privacy Pledge:</strong>
        <p>
          PreChop treats your personal information with absolute care. We collect only what is strictly necessary to
          deliver your meals and confirm payments. We never sell or share your data with advertisers, and all customer
          records are protected by Row-Level Security.
        </p>
      </section>

      <div className="legal-content">
        <section className="legal-section">
          <h2>1. Overview & Data Controller</h2>
          <p>
            This Privacy Policy governs the collection, processing, and protection of personal data by{" "}
            <strong>PreChop Food Services</strong> (<strong>&ldquo;PreChop&rdquo;</strong>, <strong>&ldquo;we&rdquo;</strong>, or{" "}
            <strong>&ldquo;us&rdquo;</strong>) under the provisions of the{" "}
            <strong>Nigeria Data Protection Act 2023 (NDPA)</strong> and the Nigeria Data Protection Regulation (NDPR),
            enforced by the Nigeria Data Protection Commission (NDPC).
          </p>
          <p>
            When you use our website, place a food pre-order, or communicate with our support team, you entrust us
            with your information. This document clearly explains what we collect, how we use it, and your rights
            regarding your data.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Personal Data We Collect</h2>
          <p>We collect only the information required to provide smooth, on-time meal deliveries:</p>
          <div className="legal-table-box">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Data Collected</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Identity & Contact</strong>
                  </td>
                  <td>Full name, Nigerian phone number (+234), email address.</td>
                  <td>Account authentication via OTP, delivery rider calls, and payment receipts.</td>
                </tr>
                <tr>
                  <td>
                    <strong>Delivery Location</strong>
                  </td>
                  <td>Hostel/department, room/office, delivery area, and landmark note.</td>
                  <td>Enabling dispatch riders to find your exact drop-off spot on campus.</td>
                </tr>
                <tr>
                  <td>
                    <strong>Order & Preferences</strong>
                  </td>
                  <td>Meal choices, protein add-ons, portion limits, and scheduled dates.</td>
                  <td>Kitchen preparation, packaging, and plate sticker verification.</td>
                </tr>
                <tr>
                  <td>
                    <strong>Financial & Ledger</strong>
                  </td>
                  <td>Paystack transaction references and internal wallet credit ledger.</td>
                  <td>Verifying payments, managing refunds, and tracking wallet balances.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="legal-section">
          <h2>3. What We Do NOT Collect</h2>
          <p>
            We adhere strictly to data minimization principles. We do <strong>not</strong> collect or store:
          </p>
          <ul>
            <li>
              <strong>Card or Bank Security Details:</strong> We do not store raw debit/credit card numbers (PAN), CVVs,
              or bank PINs. All payment transactions are handled directly through Paystack&rsquo;s PCI-DSS Level 1
              certified infrastructure.
            </li>
            <li>
              <strong>Real-Time GPS Tracking:</strong> We do not track your real-time GPS location in the background.
              We rely strictly on the landmark address you provide.
            </li>
            <li>
              <strong>Sensitive Biometric Data:</strong> No biometric or sensitive profiling data is collected.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Lawful Basis for Processing</h2>
          <p>Under Section 25 of the NDPA 2023, we process your personal data under the following legal bases:</p>
          <ul>
            <li>
              <strong>Performance of a Contract:</strong> Processing your phone number, meal selection, and delivery
              address is essential to prepare, package, and physically deliver the meals you ordered.
            </li>
            <li>
              <strong>Compliance with Legal Obligations:</strong> Maintaining payment receipts, tax records, and audit
              logs as mandated by Nigerian fiscal and corporate regulations.
            </li>
            <li>
              <strong>Legitimate Business Interests:</strong> Monitoring kitchen inventory, preventing multi-account
              referral fraud, and improving delivery dispatch route efficiency.
            </li>
            <li>
              <strong>Consent:</strong> Storing voluntary saved addresses or opting into marketing announcements.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. How We Protect Your Data</h2>
          <p>We deploy rigorous security controls to protect your personal information:</p>
          <ul>
            <li>
              <strong>Row-Level Security (RLS):</strong> Our database enforces strict RLS policies on all customer tables.
              One customer can never access, read, or modify another customer&rsquo;s orders, addresses, or wallet.
            </li>
            <li>
              <strong>Encrypted Communication:</strong> All network traffic between your browser and our servers is
              encrypted using modern TLS 1.3 cryptographic protocols.
            </li>
            <li>
              <strong>Immutable Audit Logging:</strong> Critical administrative operations (such as manual wallet
              adjustments or delivery cancellations) are logged to an audit table with timestamp and admin identity.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Third-Party Service Providers</h2>
          <p>
            We do <strong>not</strong> sell, lease, or monetize your data. We share data solely with vetted
            service providers necessary for platform operations:
          </p>
          <ul>
            <li>
              <strong>Paystack Payments Limited:</strong> To securely initiate, process, and verify electronic
              payments.
            </li>
            <li>
              <strong>Supabase Inc.:</strong> Secure cloud database hosting and phone OTP authentication infrastructure.
            </li>
            <li>
              <strong>Transactional SMS & WhatsApp APIs:</strong> To send you login verification codes (OTP) and
              real-time delivery arrival notifications.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>7. Data Retention & Account Deletion</h2>
          <p>
            We retain customer account and order records for as long as your account is active to facilitate saved
            addresses, order history, and wallet credit redemption.
          </p>
          <p>
            If you wish to delete your account or have your delivery addresses purged from our system, you can submit
            a request to our Data Protection team at <strong>privacy@prechop.com</strong>. Upon verification, your
            identifiable records will be deleted, reserving only anonymized records required for tax and legal audits.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Your Rights Under the NDPA 2023</h2>
          <p>As a data subject in Nigeria, you have guaranteed statutory rights:</p>
          <ul>
            <li>
              <strong>Right to Access:</strong> The right to obtain confirmation and a copy of the personal data we hold
              about you.
            </li>
            <li>
              <strong>Right to Rectification:</strong> The right to update or correct inaccurate details (available
              directly on your Account page).
            </li>
            <li>
              <strong>Right to Erasure:</strong> The right to request the deletion of your personal data when it is no
              longer necessary for the purpose collected.
            </li>
            <li>
              <strong>Right to Object:</strong> The right to object to processing for direct marketing or promotional
              campaigns.
            </li>
            <li>
              <strong>Right to Lodge a Complaint:</strong> You have the right to lodge a formal complaint with the
              Nigeria Data Protection Commission (NDPC) if you believe your data privacy rights have been infringed.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>9. Cookies & Browser Local Storage</h2>
          <p>
            PreChop does not use intrusive tracking or advertising cookies. We use browser{" "}
            <strong>localStorage</strong> (<code>mealhr-cart-v1</code>) solely to preserve your meal cart selections
            between page visits so you don&rsquo;t lose your planned meals when browsing.
          </p>
        </section>

        <div className="legal-contact-box">
          <h3>Contact our Data Protection Team</h3>
          <p>
            If you have questions about this Privacy Policy, wish to exercise your statutory privacy rights, or need
            data assistance, please reach out:
          </p>
          <div className="legal-contact-actions">
            <a
              href="https://wa.me/2349076038204?text=Hello%20PreChop%2C%20I%20have%20an%20inquiry%20regarding%20my%20data%20privacy."
              className="legal-contact-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Phone size={16} /> WhatsApp Privacy Support
            </a>
            <a href="mailto:privacy@prechop.com" className="legal-contact-btn-secondary">
              <EnvelopeSimple size={16} /> privacy@prechop.com
            </a>
          </div>
        </div>

        <div className="legal-bottom-bar">
          <Link href="/">
            <ArrowLeft size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            Back to menu
          </Link>
          <span>
            Also read our <Link href="/terms">Terms of Service</Link>
          </span>
        </div>
      </div>
    </main>
  );
}
