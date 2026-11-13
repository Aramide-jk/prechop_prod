import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNigerianPhone,
  getWhatsAppChatUrl,
  buildNotificationMessage,
  sendTransactionalSms,
} from '../src/lib/notifications.ts';

test('formatNigerianPhone handles various Nigerian phone formats', () => {
  assert.equal(formatNigerianPhone('08012345678'), '+2348012345678');
  assert.equal(formatNigerianPhone('2348012345678'), '+2348012345678');
  assert.equal(formatNigerianPhone('+2348012345678'), '+2348012345678');
  assert.equal(formatNigerianPhone('8012345678'), '+2348012345678');
  assert.equal(formatNigerianPhone('0801-234-5678'), '+2348012345678');
});

test('getWhatsAppChatUrl formats correct WhatsApp API URL with encoded message', () => {
  const url = getWhatsAppChatUrl('+234 801 234 5678', 'Hello PreChop!');
  assert.equal(url, 'https://wa.me/2348012345678?text=Hello%20PreChop!');
});

test('buildNotificationMessage generates expected notification messages', () => {
  const confirmed = buildNotificationMessage('order_confirmed', {
    customerName: 'Amina Bello',
    orderReference: 'ORD-1234',
    deliveryDate: '2026-10-10',
    window: 'Lunch (12:30 PM - 2:00 PM)',
  });
  assert.match(confirmed, /^Hi Amina,/);
  assert.match(confirmed, /ORD-1234/);
  assert.match(confirmed, /2026-10-10/);

  const preparing = buildNotificationMessage('order_preparing', {
    customerName: 'Chidi',
    window: 'Lunch',
    stickerCodes: ['1042', '1043'],
  });
  assert.match(preparing, /1042, 1043/);

  const cancelled = buildNotificationMessage('delivery_cancelled', {
    customerName: 'Babatunde',
    deliveryDate: '2026-10-10',
    window: 'Lunch',
    refundAmount: '₦4,500',
    refundMethod: 'PreChop Wallet',
  });
  assert.match(cancelled, /cancelled/);
  assert.match(cancelled, /₦4,500/);
  assert.match(cancelled, /PreChop Wallet/);
});

test('sendTransactionalSms returns true in dev/test when TEXTBEE_API_KEY is not set', async () => {
  delete process.env.TEXTBEE_API_KEY;
  const result = await sendTransactionalSms('08012345678', 'Test message');
  assert.equal(result, true);
});
