"use client";

import { Basket, Gift, Users } from "@phosphor-icons/react";
import type { CampaignHowItWorksStep } from "@/lib/campaign";

function StepIcon({ kind }: { kind: CampaignHowItWorksStep["icon"] }) {
  switch (kind) {
    case "invite":
      return <Users size={19} weight="regular" aria-hidden="true" />;
    case "order":
      return <Basket size={19} weight="regular" aria-hidden="true" />;
    case "reward":
      return <Gift size={19} weight="regular" aria-hidden="true" />;
  }
}

export function CampaignHowItWorks({
  steps,
}: {
  steps: CampaignHowItWorksStep[];
}) {
  return (
    <section
      id="how-it-works"
      className="cp-how-section"
      aria-labelledby="campaign-how-heading"
    >
      <div className="cp-how-heading">
        <span className="cp-eyebrow">HOW IT WORKS</span>
        <h2 id="campaign-how-heading" className="cp-how-title">
          Three simple steps.
        </h2>
      </div>

      <ol className="cp-how-steps">
        {steps.map((step) => (
          <li key={step.id} className="cp-how-step">
            <div className="cp-how-icon" aria-hidden="true">
              <StepIcon kind={step.icon} />
            </div>
            <div className="cp-how-copy">
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
