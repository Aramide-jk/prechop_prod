/**
 * PreChop Customer Notification Service
 * Supports transactional SMS formatting, TextBee gateway delivery, and WhatsApp link generation.
 */

export type NotificationType =
  | "order_confirmed"
  | "order_preparing"
  | "order_dispatched"
  | "order_delivered"
  | "delivery_cancelled";

export function formatNigerianPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (rawPhone.startsWith("+")) return `+${digits}`;
  return `+234${digits}`;
}

export function getWhatsAppChatUrl(phone: string, message: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function buildNotificationMessage(
  type: NotificationType,
  details: {
    customerName?: string;
    orderReference?: string;
    deliveryDate?: string;
    window?: string;
    stickerCodes?: string | number[];
    refundAmount?: string;
    refundMethod?: string;
    address?: string;
  }
): string {
  const greeting = details.customerName ? `Hi ${details.customerName.split(" ")[0]}, ` : "Hi, ";
  switch (type) {
    case "order_confirmed":
      return `${greeting}your PreChop pre-order (${details.orderReference}) for ${details.deliveryDate} (${details.window}) is confirmed! Track your meals anytime on prechop.`;
    case "order_preparing":
      return `${greeting}the kitchen has started preparing your meal for ${details.window}! Your meal sticker code is: ${Array.isArray(details.stickerCodes) ? details.stickerCodes.join(", ") : details.stickerCodes ?? "pending"}.`;
    case "order_dispatched":
      return `${greeting}your PreChop delivery (${details.orderReference}) is now on its way to ${details.address ?? "your address"}! Please keep your phone nearby.`;
    case "order_delivered":
      return `${greeting}your PreChop meal has been delivered. Enjoy your meal! Good food is better shared.`;
    case "delivery_cancelled":
      return `${greeting}your delivery for ${details.deliveryDate} (${details.window}) was cancelled. Refund of ${details.refundAmount ?? "funds"} has been processed to your ${details.refundMethod ?? "account"}.`;
    default:
      return `${greeting}update regarding your PreChop order ${details.orderReference ?? ""}.`;
  }
}

export async function sendTransactionalSms(phone: string, text: string): Promise<boolean> {
  const apiKey = process.env.TEXTBEE_API_KEY;
  if (!apiKey) {
    // In dev / preview without TextBee keys, simulate success
    return true;
  }

  try {
    const formattedPhone = formatNigerianPhone(phone);
    const response = await fetch("https://api.textbee.dev/api/v1/gateway/devices/send-sms", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipients: [formattedPhone],
        message: text,
      }),
      cache: "no-store",
    });
    return response.ok;
  } catch (err) {
    console.error("TextBee transactional SMS dispatch failed:", err);
    return false;
  }
}
