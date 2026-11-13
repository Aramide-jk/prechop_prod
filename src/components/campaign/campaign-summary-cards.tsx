"use client";

import { Eye, Users, Wallet } from "@phosphor-icons/react";
import { money } from "@/lib/menu";

type CampaignSummaryCardsProps = {
  availableCreditNgn: number;
  linkVisits: number;
  successfulReferrals: number;
};

export function CampaignSummaryCards({
  availableCreditNgn,
  linkVisits,
  successfulReferrals,
}: CampaignSummaryCardsProps) {
  return (
    <section
      className="cp-summary-grid"
      aria-label="Campaign reward summary"
    >
      <article className="cp-summary-card cp-summary-card-featured">
        <div className="cp-summary-head">
          <div className="cp-summary-icon" aria-hidden="true">
            <Wallet size={22} weight="regular" />
          </div>
          <span className="cp-summary-label">Meal credit</span>
        </div>
        <strong className="cp-summary-value">{money(availableCreditNgn)}</strong>
      </article>

      <article className="cp-summary-card">
        <div className="cp-summary-head">
          <div className="cp-summary-icon" aria-hidden="true">
            <Eye size={22} weight="regular" />
          </div>
          <span className="cp-summary-label">Link visits</span>
        </div>
        <strong className="cp-summary-value">{linkVisits}</strong>
      </article>

      <article className="cp-summary-card">
        <div className="cp-summary-head">
          <div className="cp-summary-icon" aria-hidden="true">
            <Users size={22} weight="regular" />
          </div>
          <span className="cp-summary-label">Successful referrals</span>
        </div>
        <strong className="cp-summary-value">{successfulReferrals}</strong>
      </article>
    </section>
  );
}
