"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  ForkKnife,
  Lock,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import type { CampaignClaimStatus, CampaignGoalEvaluation } from "@/lib/campaign";

type FeaturedMealGoalCardProps = {
  meal: {
    slug: string;
    name: string;
    image: string;
    imageAlt: string;
  };
  evaluation: CampaignGoalEvaluation;
  claimStatus: CampaignClaimStatus;
  expiresAt?: string | null;
  signedIn?: boolean;
  onInviteMore: () => void;
};

function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  }).format(new Date(ms));
}

export function FeaturedMealGoalCard({
  meal,
  evaluation,
  claimStatus,
  expiresAt,
  signedIn = true,
  onInviteMore,
}: FeaturedMealGoalCardProps) {
  const {
    claimBehavior,
    targetReferrals,
    qualifiedReferrals,
    remainingReferrals,
    progressPercent,
    isUnlocked,
  } = evaluation;

  const visualUnlocked =
    claimStatus === "unlocked" || claimStatus === "claimed" || (isUnlocked && claimStatus !== "expired");
  const deadlineLabel = formatDeadline(expiresAt);

  function renderRemainingText() {
    if (remainingReferrals <= 0) {
      return "Almost there!";
    }
    const friendWord = remainingReferrals === 1 ? "friend" : "friends";
    return `${remainingReferrals} more ${friendWord} to unlock (${qualifiedReferrals} of ${targetReferrals})`;
  }

  return (
    <section
      className="cp-goal-card"
      aria-labelledby="featured-meal-goal-heading"
    >
      <div className="cp-goal-media">
        <Image
          src={meal.image || "/images/jollof.png"}
          alt={meal.imageAlt}
          fill
          sizes="(max-width: 860px) 100vw, 480px"
          unoptimized={meal.image.startsWith("http")}
          className={`cp-goal-img ${
            visualUnlocked ? "cp-goal-img-unlocked" : "cp-goal-img-locked"
          }`}
        />
        <div className="cp-goal-scrim" aria-hidden="true" />

        <div className="cp-goal-media-overlay">
          {!visualUnlocked && (
            <span className="cp-goal-lock-badge" aria-hidden="true">
              <Lock size={22} weight="regular" />
            </span>
          )}
          <span className="cp-goal-meal-name">{meal.name}</span>
        </div>
      </div>

      <div className="cp-goal-content">
        <div className="cp-goal-top-row">
          <span className="cp-eyebrow">YOUR NEXT MEAL GOAL</span>
          {claimStatus === "claimed" ? (
            <span className="cp-claimed-pill">
              <CheckCircle size={15} weight="fill" aria-hidden="true" />
              <span>Meal claimed</span>
            </span>
          ) : claimStatus === "expired" ? (
            <span className="cp-expired-pill">
              <Clock size={15} weight="regular" aria-hidden="true" />
              <span>Claim expired</span>
            </span>
          ) : visualUnlocked ? (
            <span className="cp-unlocked-pill">
              <CheckCircle size={15} weight="regular" aria-hidden="true" />
              <span>Meal unlocked</span>
            </span>
          ) : null}
        </div>

        <h2 id="featured-meal-goal-heading" className="cp-goal-headline">
          {claimStatus === "claimed"
            ? "You’ve claimed this meal reward!"
            : claimStatus === "expired"
              ? "Your bonus meal claim window ended."
              : visualUnlocked
                ? "Your next meal is ready!"
                : "Keep sharing — your next meal is getting closer."}
        </h2>

        {claimStatus === "claimed" ? (
          <p className="cp-goal-desc">
            Your featured campaign meal has been redeemed. Keep inviting coursemates to continue earning wallet credit on every qualifying order.
          </p>
        ) : claimStatus === "expired" ? (
          <p className="cp-goal-desc">
            The claim window for this bonus prize closed, but all wallet credit you earned remains active and never expires.
          </p>
        ) : visualUnlocked ? (
          <p className="cp-goal-desc">
            {claimBehavior === "bonus_free_claim" ? (
              <>
                You unlocked 1 free plate of <strong>{meal.name}</strong> — your wallet credit stays intact!{" "}
                {deadlineLabel ? `Claim by ${deadlineLabel}.` : "Apply it at checkout."}
              </>
            ) : (
              <>
                You’ve earned enough referral rewards to enjoy this meal or pick another dish from the menu. Apply your wallet credit at checkout.
              </>
            )}
          </p>
        ) : null}

        <div className="cp-goal-progress-block">
          <div className="cp-goal-progress-row">
            <div
              className="cp-goal-track"
              role="progressbar"
              aria-label="Featured meal goal progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <span
                className={`cp-goal-fill ${
                  visualUnlocked ? "cp-goal-fill-unlocked" : "cp-goal-fill-locked"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="cp-goal-percent">{progressPercent}% complete</span>
          </div>

          {!visualUnlocked && claimStatus !== "expired" && (
            <p className="cp-goal-remaining">
              <Users size={15} weight="regular" aria-hidden="true" />
              <span>{renderRemainingText()}</span>
            </p>
          )}
        </div>

        <div className="cp-goal-actions">
          {claimStatus === "claimed" ? (
            <>
              <Link href="/orders" className="cp-btn-primary">
                <span>View your orders</span>
                <ArrowRight size={16} weight="regular" aria-hidden="true" />
              </Link>
              <Link href="/" className="cp-btn-secondary">
                <ForkKnife size={16} weight="regular" aria-hidden="true" />
                <span>Explore menu</span>
              </Link>
            </>
          ) : claimStatus === "expired" ? (
            <>
              <Link href="/" className="cp-btn-primary">
                <ForkKnife size={16} weight="regular" aria-hidden="true" />
                <span>Explore menu</span>
              </Link>
              <Link href="/wallet" className="cp-btn-secondary">
                <Wallet size={16} weight="regular" aria-hidden="true" />
                <span>View wallet</span>
              </Link>
            </>
          ) : visualUnlocked ? (
            <>
              <Link href="/checkout?claim=featured" className="cp-btn-primary">
                <span>Claim meal</span>
                <ArrowRight size={16} weight="regular" aria-hidden="true" />
              </Link>
              <Link href="/" className="cp-btn-secondary">
                <ForkKnife size={16} weight="regular" aria-hidden="true" />
                <span>Explore menu</span>
              </Link>
            </>
          ) : (
            <button
              type="button"
              className="cp-btn-primary"
              onClick={onInviteMore}
            >
              <span>{signedIn ? "Invite more friends" : "Sign in to start inviting"}</span>
              <ArrowRight size={16} weight="regular" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
