"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleNotch,
  DeviceMobile,
  X,
} from "@phosphor-icons/react";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { attributePendingReferral } from "@/lib/referrals";

type PreviewProfile = { name: string; phone: string };

/** Uses Supabase phone OTP when configured; otherwise it runs the unauthenticated design preview. */
export function SignInDialog({
  close,
  complete,
}: {
  close: () => void;
  complete: (profile: PreviewProfile) => void;
}) {
  const liveAuth = isSupabaseConfigured();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [expires, setExpires] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const element = dialog.current;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [seconds]);

  async function requestCode() {
    const digits = phone.replace(/[\s()-]/g, "");
    const normalized = digits.startsWith("+234")
      ? `0${digits.slice(4)}`
      : digits.startsWith("234")
        ? `0${digits.slice(3)}`
        : digits;
    if (!/^0[789]\d{9}$/.test(normalized)) {
      setError(
        "Enter an 11-digit Nigerian mobile number, such as 0803 123 4567.",
      );
      return;
    }
    if (liveAuth) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError(
          "Sign-in is not configured yet. Add the Supabase project settings and try again.",
        );
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+234${normalized.slice(1)}`,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setMessage("Your verification code is on its way.");
    } else {
      setMessage("");
      setExpires(Date.now() + 300000);
    }
    setPhone(normalized);
    setCode("");
    setError("");
    setSeconds(30);
    setStep("code");
  }

  async function resendCode() {
    if (busy) return;
    setBusy(true);
    setError("");
    setCode("");
    try {
      if (liveAuth) {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          setError("Sign-in is not configured yet.");
          return;
        }
        const { error } = await supabase.auth.signInWithOtp({
          phone: `+234${phone.slice(1)}`,
        });
        if (error) {
          setError(error.message);
          return;
        }
        setMessage("A new verification code has been sent.");
      } else {
        setExpires(Date.now() + 300000);
        setMessage("Preview code reset. Enter 123456.");
      }
      setSeconds(30);
    } catch {
      setError(
        "We couldn’t resend the code. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal sign-in-modal"
      aria-labelledby="signin-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <button
        className="icon-button modal-close"
        aria-label="Close sign-in"
        disabled={busy}
        onClick={close}
      >
        <X size={22} />
      </button>
      <div className="signin-symbol">
        <DeviceMobile size={30} weight="light" />
      </div>
      <span className="eyebrow">
        {step === "name" ? "ONE LAST THING" : "YOUR PRECHOP ACCOUNT"}
      </span>
      <h2 ref={heading} tabIndex={-1} id="signin-title">
        {step === "phone"
          ? "Good food starts here."
          : step === "code"
            ? "Check your phone."
            : "What should we call you?"}
      </h2>
      <p className="signin-intro">
        {step === "phone"
          ? "Sign in or create an account with your phone number. No password to remember."
          : step === "code"
            ? `Enter the six-digit code for ${phone}.`
            : "Just your name, so we know who to deliver to."}
      </p>
      <ol className="signin-progress" aria-label="Sign-in progress">
        {["phone", "code", "name"].map((value, index) => (
          <li key={value} aria-current={step === value ? "step" : undefined}>
            <span>{index + 1}</span>
            {["Phone", "Verify", "Name"][index]}
          </li>
        ))}
      </ol>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            if (step === "phone") await requestCode();
            else if (step === "code") {
              if (liveAuth) {
                const supabase = getSupabaseBrowserClient();
                if (!supabase) {
                  setError("Sign-in is not configured yet.");
                  return;
                }
                const { data, error } = await supabase.auth.verifyOtp({
                  phone: `+234${phone.slice(1)}`,
                  token: code,
                  type: "sms",
                });
                if (error || !data.user) {
                  setError(
                    error?.message ??
                      "We could not verify that code. Try again.",
                  );
                  return;
                }
                await attributePendingReferral();
                const { data: profile } = await supabase
                  .from("profiles")
                  .select("full_name")
                  .eq("id", data.user.id)
                  .maybeSingle();
                if (profile?.full_name && profile.full_name !== "New customer")
                  complete({ name: profile.full_name, phone });
                else setStep("name");
              } else {
                if (Date.now() > expires) {
                  setError(
                    "This preview code has expired. Request a new code below.",
                  );
                  return;
                }
                if (code !== "123456") {
                  setError(
                    "That code doesn’t match. Use 123456 for this design preview.",
                  );
                  return;
                }
                setStep("name");
              }
            } else {
              if (name.trim().length < 2) {
                setError("Please enter your name (at least two characters).");
                return;
              }
              if (liveAuth) {
                const supabase = getSupabaseBrowserClient();
                if (!supabase) {
                  setError("Sign-in is not configured yet.");
                  return;
                }
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                if (!user) {
                  setError(
                    "Your sign-in expired. Please verify your phone again.",
                  );
                  setStep("phone");
                  return;
                }
                const { error } = await supabase
                  .from("profiles")
                  .update({ full_name: name.trim() })
                  .eq("id", user.id);
                if (error) {
                  setError(error.message);
                  return;
                }
              }
              complete({ name: name.trim(), phone });
            }
          } catch {
            setError(
              "We couldn’t complete sign-in. Check your connection and try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {step === "phone" && (
          <>
            <label htmlFor="signin-phone">Phone number</label>
            <div className="phone-field">
              <span>NG</span>
              <input
                id="signin-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0803 123 4567"
                value={phone}
                maxLength={20}
                disabled={busy}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError("");
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "signin-error" : "phone-help"}
              />
            </div>
            <p id="phone-help" className="signin-help">
              Use the number we can reach you on for delivery.
            </p>
          </>
        )}
        {step === "code" && (
          <>
            <label htmlFor="signin-code">Verification code</label>
            <input
              className="code-field"
              id="signin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              disabled={busy}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              placeholder="000000"
              aria-invalid={!!error}
              aria-describedby="code-help signin-error"
            />
            <p id="code-help" className="signin-help">
              {liveAuth ? (
                "Enter the code sent to your phone."
              ) : (
                <>
                  Preview code: <strong>123456</strong>. No SMS has been sent.
                </>
              )}
            </p>
            <div className="code-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep("phone");
                  setError("");
                  setMessage("");
                }}
              >
                Change number
              </button>
              <button
                type="button"
                disabled={busy || seconds > 0}
                aria-busy={busy}
                onClick={resendCode}
              >
                {busy ? (
                  <>
                    <CircleNotch className="button-spinner" size={15} />{" "}
                    Sending…
                  </>
                ) : seconds > 0 ? (
                  `Resend in ${seconds}s`
                ) : (
                  "Resend code"
                )}
              </button>
            </div>
          </>
        )}
        {step === "name" && (
          <>
            <div className="phone-confirmed">
              <Check size={18} /> {phone}
              <span>{liveAuth ? "Verified" : "Preview verified"}</span>
            </div>
            <label htmlFor="signin-name">Your name</label>
            <input
              id="signin-name"
              autoComplete="name"
              maxLength={80}
              disabled={busy}
              placeholder="e.g. Amina Yusuf"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "signin-error" : undefined}
            />
            <p className="signin-help">
              We’ll only ask this when you create your account.
            </p>
          </>
        )}
        <p id="signin-error" className="error" role="alert">
          {error}
        </p>
        <p role="status" className="signin-help">
          {message}
        </p>
        <button
          className="primary"
          type="submit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? (
            <>
              <CircleNotch className="button-spinner" size={19} />
              {step === "phone"
                ? "Sending code…"
                : step === "code"
                  ? "Verifying…"
                  : "Saving details…"}
            </>
          ) : (
            <>
              {step === "phone"
                ? "Continue"
                : step === "code"
                  ? liveAuth
                    ? "Verify code"
                    : "Verify preview code"
                  : "Continue to checkout"}
              <ArrowRight size={19} />
            </>
          )}
        </button>
      </form>
      <p className="signin-preview">
        {liveAuth
          ? "Your phone number is your secure sign-in."
          : "Design preview · SMS and account creation are not connected yet."}
      </p>
      <button className="signin-back" disabled={busy} onClick={close}>
        <ArrowLeft size={17} /> Back to delivery details
      </button>
    </dialog>
  );
}
