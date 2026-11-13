"use client";

import {
  ArrowsClockwise,
  BowlFood,
  Lightning,
  Wallet,
} from "@phosphor-icons/react";
import type { CampaignBenefit } from "@/lib/campaign";

function BenefitIcon({ kind }: { kind: CampaignBenefit["icon"] }) {
  switch (kind) {
    case "instant":
      return <Lightning size={18} weight="regular" aria-hidden="true" />;
    case "wallet":
      return <Wallet size={18} weight="regular" aria-hidden="true" />;
    case "repeat":
      return <ArrowsClockwise size={18} weight="regular" aria-hidden="true" />;
    case "meal":
      return <BowlFood size={18} weight="regular" aria-hidden="true" />;
  }
}

export function CampaignBenefitsStrip({
  benefits,
}: {
  benefits: CampaignBenefit[];
}) {
  return (
    <section
      className="cp-benefits-strip"
      aria-label="Campaign wallet benefits"
    >
      <ul className="cp-benefits-list">
        {benefits.map((benefit) => (
          <li key={benefit.id} className="cp-benefit-item">
            <span className="cp-benefit-icon" aria-hidden="true">
              <BenefitIcon kind={benefit.icon} />
            </span>
            <span>{benefit.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
