"use client";

import Image from "next/image";
import {
  ArrowRight,
  Check,
  Copy,
  Info,
  LinkSimple,
  ShareNetwork,
} from "@phosphor-icons/react";
import { money } from "@/lib/menu";

type CampaignHeroProps = {
  inviteUrl: string;
  rewardPerReferralNgn: number;
  featuredMealImage?: string;
  featuredGoalEnabled?: boolean;
  signedIn?: boolean;
  inviteExpanded: boolean;
  copied: boolean;
  onGetInviteLink: () => void;
  onCopyLink: () => void;
  onShareLink: () => void;
  onScrollToHowItWorks: () => void;
};

export function CampaignHero({
  inviteUrl,
  rewardPerReferralNgn,
  featuredMealImage = "/images/jollof.png",
  featuredGoalEnabled = true,
  signedIn = true,
  inviteExpanded,
  copied,
  onGetInviteLink,
  onCopyLink,
  onShareLink,
  onScrollToHowItWorks,
}: CampaignHeroProps) {
  return (
    <section
      className="cp-hero"
      aria-labelledby="campaign-hero-heading"
    >
      <div className="cp-hero-copy">
        <span className="cp-eyebrow">PRECHOP CAMPUS CAMPAIGN · ABU ZARIA</span>
        <h1 id="campaign-hero-heading" className="cp-hero-title">
          Refer friends. Earn meal rewards.
        </h1>
        <p className="cp-hero-desc">
          {featuredGoalEnabled ? (
            <>
              Invite coursemates to order on PreChop and earn{" "}
              <strong>{money(rewardPerReferralNgn)} meal credit</strong> when
              they place a qualifying order.
            </>
          ) : (
            <>
              Invite coursemates to order on PreChop and receive{" "}
              <strong>{money(rewardPerReferralNgn)} wallet credit</strong> on
              every qualifying friend order to use anytime.
            </>
          )}
        </p>

        <div className="cp-hero-actions">
          <button
            type="button"
            className="cp-btn-primary"
            onClick={onGetInviteLink}
            aria-expanded={signedIn ? inviteExpanded : undefined}
            aria-controls={signedIn ? "campaign-invite-tray" : undefined}
          >
            <span>
              {!signedIn
                ? "Sign in to get invite link"
                : inviteExpanded
                  ? "Hide invite link"
                  : "Get my invite link"}
            </span>
            <ArrowRight size={16} weight="regular" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="cp-btn-secondary"
            onClick={onScrollToHowItWorks}
          >
            <Info size={16} weight="regular" aria-hidden="true" />
            <span>How it works</span>
          </button>
        </div>

        {signedIn && inviteExpanded && (
          <div
            id="campaign-invite-tray"
            className="cp-invite-tray"
            role="region"
            aria-label="Your personal invite link"
          >
            <div className="cp-invite-input-wrap">
              <LinkSimple
                size={17}
                weight="regular"
                className="cp-invite-icon"
                aria-hidden="true"
              />
              <input
                type="text"
                readOnly
                value={inviteUrl}
                aria-label="Personal PreChop invite link"
                onClick={(event) => event.currentTarget.select()}
              />
            </div>
            <div className="cp-invite-tray-buttons">
              <button
                type="button"
                className="cp-invite-copy-btn"
                onClick={onCopyLink}
              >
                {copied ? (
                  <>
                    <Check size={15} weight="bold" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={15} weight="regular" aria-hidden="true" />
                    <span>Copy link</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="cp-invite-share-btn"
                onClick={onShareLink}
              >
                <ShareNetwork size={15} weight="regular" aria-hidden="true" />
                <span>Share</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="cp-hero-visual" aria-hidden="true">
        <svg
          className="cp-hero-sparks"
          width="34"
          height="34"
          viewBox="0 0 34 34"
          fill="none"
        >
          <path
            d="M7 11L11.5 3.5"
            stroke="#c44812"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M15 17L24 9.5"
            stroke="#c44812"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M21 25.5L30.5 23.5"
            stroke="#c44812"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        <div className="cp-hero-plate">
          <Image
            src={featuredMealImage || "/images/jollof.png"}
            alt=""
            fill
            sizes="(max-width: 640px) 190px, 280px"
            className="cp-hero-plate-img"
            unoptimized={featuredMealImage.startsWith("http")}
            priority
          />
        </div>
      </div>
    </section>
  );
}
