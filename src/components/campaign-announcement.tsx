"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Gift,
  MapPin,
  ShoppingCart,
  Users,
  X,
} from "@phosphor-icons/react";
import { money } from "@/lib/menu";
import { defaultStoreSettings, fetchStoreSettings, isCampaignLive, type StoreSettings } from "@/lib/settings";

const seenKey = "prechop-campaign-announcement-seen-v1";

export function CampaignAnnouncement() {
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(defaultStoreSettings);

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      const timer = window.setTimeout(() => setOpen(false), 0);
      return () => window.clearTimeout(timer);
    }
    if (pathname.startsWith("/campaign")) return;
    try {
      if (sessionStorage.getItem(seenKey)) return;
    } catch {
      /* Show the announcement when storage is unavailable. */
    }
    let cancelled = false;
    void (async () => {
      try {
        const settings = await fetchStoreSettings();
        if (!cancelled && isCampaignLive(settings)) {
          setStoreSettings(settings);
          setOpen(true);
        }
      } catch {
        /* The announcement is optional if campaign settings cannot be loaded. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
      cardRef.current?.focus({ preventScroll: true });
    } else if (!open && element?.open) element.close();
  }, [open]);

  function close() {
    try {
      sessionStorage.setItem(seenKey, "1");
    } catch {
      /* The dialog can still close without session storage. */
    }
    setOpen(false);
  }

  if (pathname.startsWith("/admin")) return null;

  const formattedPerFriendReward = money(storeSettings.reward_per_referral_ngn);
  const formattedTargetCredit = money(storeSettings.featured_target_credit_ngn);

  return (
    <dialog
      ref={dialog}
      className="modal campaign-announcement-modal"
      aria-labelledby="campaign-announcement-title"
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <button
        type="button"
        className="campaign-modal-close"
        aria-label="Close campaign announcement"
        onClick={close}
      >
        <X size={15} weight="bold" aria-hidden="true" />
      </button>

      <div
        ref={cardRef}
        tabIndex={-1}
        className="campaign-modal-card flex max-h-[90dvh] flex-col overflow-y-auto overscroll-contain outline-none"
      >
        {/* Hero Campus Banner */}
        <div className="campaign-modal-art relative w-full shrink-0 overflow-hidden bg-[#efe6d8]">
          <Image
            src="/images/abu-senate-building.jpg"
            alt="Ahmadu Bello University Senate Building, Samaru Campus, Zaria"
            width={1024}
            height={682}
            className="campaign-modal-image h-full w-full object-cover"
            priority
          />
          <span className="campaign-modal-badge">
            <MapPin
              size={13}
              weight="regular"
              className="shrink-0 text-[#c44812]"
              aria-hidden="true"
            />
            <span>ABU Samaru Campus</span>
          </span>
        </div>

        {/* Warm Ivory Campaign Body */}
        <div className="campaign-modal-body flex flex-col items-center px-5 pb-5 pt-4 text-center sm:px-7 sm:pb-6 sm:pt-5">
          <div className="flex w-full items-center gap-3">
            <span className="h-px flex-1 bg-[#e5dccf]" aria-hidden="true" />
            <span className="campaign-modal-eyebrow whitespace-nowrap">
              PRECHOP CAMPUS CAMPAIGN
            </span>
            <span className="h-px flex-1 bg-[#e5dccf]" aria-hidden="true" />
          </div>

          <h2 id="campaign-announcement-title" className="campaign-modal-headline">
            Good food is better shared.
          </h2>

          <p className="campaign-modal-desc">
            {storeSettings.featured_goal_enabled ? (
              storeSettings.featured_unlock_rule === "accumulated_credit" ? (
                <>
                  Earn{" "}
                  <strong className="font-semibold text-[#c44812]">
                    {formattedPerFriendReward} per friend
                  </strong>{" "}
                  to accumulate {formattedTargetCredit} and unlock{" "}
                  <strong>{storeSettings.featured_meal_title}</strong>.
                </>
              ) : (
                <>
                  Invite {storeSettings.featured_target_referrals} friends who place
                  a qualifying PreChop order to earn{" "}
                  <strong className="font-semibold text-[#c44812]">
                    {formattedPerFriendReward} credit per friend
                  </strong>{" "}
                  and unlock <strong>{storeSettings.featured_meal_title}</strong>.
                </>
              )
            ) : (
              <>
                Invite friends to PreChop and earn{" "}
                <strong className="font-semibold text-[#c44812]">
                  {formattedPerFriendReward} wallet credit
                </strong>{" "}
                after every qualifying order they place.
              </>
            )}
          </p>

          {/* Compact Three-Step Flow */}
          <ol
            className="campaign-modal-steps"
            aria-label="How campus referral rewards work"
          >
            <li className="campaign-modal-step">
              <Users
                size={19}
                weight="regular"
                className="campaign-modal-step-icon"
                aria-hidden="true"
              />
              <span className="campaign-modal-step-text">Invite friends</span>
            </li>
            <li className="campaign-modal-step">
              <ShoppingCart
                size={19}
                weight="regular"
                className="campaign-modal-step-icon"
                aria-hidden="true"
              />
              <span className="campaign-modal-step-text">First orders</span>
            </li>
            <li className="campaign-modal-step">
              <Gift
                size={19}
                weight="regular"
                className="campaign-modal-step-icon"
                aria-hidden="true"
              />
              <span className="campaign-modal-step-text">
                Earn{" "}
                <strong className="font-semibold text-[#c44812]">
                  {formattedPerFriendReward}/friend
                </strong>
              </span>
            </li>
          </ol>

          <div className="campaign-modal-actions mt-4 flex w-full flex-col items-center gap-1.5">
            <button
              type="button"
              className="campaign-modal-primary"
              onClick={() => {
                close();
                router.push("/campaign");
              }}
            >
              <span>Invite friends</span>
              <ArrowRight size={16} weight="regular" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="campaign-modal-dismiss"
              onClick={close}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
