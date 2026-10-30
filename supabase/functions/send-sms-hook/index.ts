import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type SendSmsEvent = {
  user?: { phone?: string };
  sms?: { otp?: string; phone?: string };
};

const json = (body: Record<string, string>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const signingSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  const textbeeApiKey = Deno.env.get("TEXTBEE_API_KEY");
  if (!signingSecret || !textbeeApiKey) {
    console.error("Send SMS hook is missing required secrets.");
    return json({ error: "SMS service is not configured." }, 500);
  }

  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);
  let event: SendSmsEvent | undefined;
  for (const secret of signingSecret.split("|")) {
    try {
      const normalizedSecret = secret.trim().replace(/^v\d+,whsec_/, "");
      event = new Webhook(normalizedSecret).verify(payload, headers) as SendSmsEvent;
      break;
    } catch {
      // Try the next configured signing secret during a key rotation.
    }
  }
  if (!event) {
    return json({ error: "Invalid hook signature." }, 401);
  }

  // Supabase Send SMS hook sends the destination phone in sms.phone.
  const phoneValue = event.sms?.phone ?? event.user?.phone;
  const otpValue = event.sms?.otp;
  const rawPhone = typeof phoneValue === "string" ? phoneValue.trim() : "";
  const phoneDigits = rawPhone.replace(/\D/g, "");
  const phone = rawPhone.startsWith("+")
    ? `+${phoneDigits}`
    : phoneDigits.startsWith("234")
      ? `+${phoneDigits}`
      : phoneDigits.startsWith("0")
        ? `+234${phoneDigits.slice(1)}`
        : `+${phoneDigits}`;
  const otp = typeof otpValue === "string" ? otpValue : typeof otpValue === "number" ? String(otpValue) : "";
  const phoneIsValid = /^\+[1-9]\d{7,14}$/.test(phone);
  const otpIsValid = /^\d{4,10}$/.test(otp);
  if (!phoneIsValid || !otpIsValid) {
    console.error("Send SMS hook received invalid fields.", {
      eventKeys: Object.keys(event),
      userKeys: Object.keys(event.user ?? {}),
      smsKeys: Object.keys(event.sms ?? {}),
      phoneType: typeof phoneValue,
      phoneIsValid,
      otpType: typeof otpValue,
      otpIsValid,
    });
    return json({ error: "Invalid SMS event." }, 400);
  }

  try {
    const response = await fetch("https://api.textbee.dev/api/v1/gateway/send-sms", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": textbeeApiKey,
      },
      body: JSON.stringify({
        recipients: [phone],
        message: `Your PreChop verification code is ${otp}. Do not share this code with anyone.`,
      }),
    });

    if (!response.ok) {
      console.error(`TextBee rejected an OTP SMS request (HTTP ${response.status}).`);
      return json({ error: "SMS delivery failed." }, 502);
    }
    const result = await response.json() as { data?: { success?: boolean } };
    if (result.data?.success !== true) {
      console.error("TextBee did not accept the OTP SMS request.");
      return json({ error: "SMS delivery failed." }, 502);
    }
  } catch {
    console.error("TextBee could not be reached for an OTP SMS request.");
    return json({ error: "SMS delivery failed." }, 502);
  }

  return json({}, 200);
});
