import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNigerianPhone, getWhatsAppChatUrl } from '../src/lib/notifications.ts';

const validRoles = new Set(['super_admin', 'kitchen_manager', 'dispatch_lead']);
const nigerianMobileRegex = /^\+234[789]\d{9}$/;

function validateAdminRole(role) {
  if (!role || typeof role !== 'string') return false;
  return validRoles.has(role);
}

function isValidNigerianAdminPhone(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const formatted = formatNigerianPhone(raw);
  return nigerianMobileRegex.test(formatted);
}

function canRemoveAdmin(adminId, teamList) {
  if (!Array.isArray(teamList)) return { allowed: false, reason: 'Invalid team list' };
  if (teamList.length <= 1) {
    return { allowed: false, reason: 'Cannot remove the only remaining admin account. PreChop requires at least one admin.' };
  }
  const exists = teamList.some((m) => m.id === adminId);
  if (!exists) {
    return { allowed: false, reason: 'Admin member not found.' };
  }
  return { allowed: true };
}

function buildAdminInviteMessage({ name, appUrl, roleTitle }) {
  return `👋 Hello ${name},\n\nYou have been approved as a ${roleTitle} on PreChop Admin!\n\nYou can sign in now with your phone number at:\n${appUrl}/admin\n\nNo initial password required — simply sign in with your phone OTP to access the dashboard.`;
}

test('formatNigerianPhone and isValidNigerianAdminPhone formats and validates admin phone numbers', () => {
  assert.equal(formatNigerianPhone('08031234567'), '+2348031234567');
  assert.equal(formatNigerianPhone('07012345678'), '+2347012345678');
  assert.equal(formatNigerianPhone('09098765432'), '+2349098765432');
  assert.equal(formatNigerianPhone('+2348031234567'), '+2348031234567');
  assert.equal(formatNigerianPhone('2348031234567'), '+2348031234567');
  assert.equal(formatNigerianPhone('8031234567'), '+2348031234567');

  // Spaces and hyphens
  assert.equal(formatNigerianPhone('0803 123 4567'), '+2348031234567');
  assert.equal(formatNigerianPhone('080-3123-4567'), '+2348031234567');

  // Validation
  assert.equal(isValidNigerianAdminPhone('08031234567'), true);
  assert.equal(isValidNigerianAdminPhone('+2348031234567'), true);
  assert.equal(isValidNigerianAdminPhone('2349012345678'), true);
  assert.equal(isValidNigerianAdminPhone('12345'), false);
  assert.equal(isValidNigerianAdminPhone('abcdefghijk'), false);
  assert.equal(isValidNigerianAdminPhone(''), false);
});

test('validateAdminRole strictly validates allowed administrative roles', () => {
  assert.equal(validateAdminRole('super_admin'), true);
  assert.equal(validateAdminRole('kitchen_manager'), true);
  assert.equal(validateAdminRole('dispatch_lead'), true);

  // Invalid roles
  assert.equal(validateAdminRole('root'), false);
  assert.equal(validateAdminRole('admin'), false);
  assert.equal(validateAdminRole(''), false);
  assert.equal(validateAdminRole(null), false);
  assert.equal(validateAdminRole(undefined), false);
});

test('canRemoveAdmin strictly enforces sole admin lockout protection', () => {
  const singleAdminTeam = [
    { id: 'admin-uuid-1', phone: '+2348031234567', role: 'super_admin' },
  ];

  // Attempting to remove the sole admin must be blocked
  const soleRemove = canRemoveAdmin('admin-uuid-1', singleAdminTeam);
  assert.equal(soleRemove.allowed, false);
  assert.match(soleRemove.reason, /Cannot remove the only remaining admin/);

  // Multi-admin team allows safe removal
  const multiAdminTeam = [
    { id: 'admin-uuid-1', phone: '+2348031234567', role: 'super_admin' },
    { id: 'admin-uuid-2', phone: '+2348099887766', role: 'kitchen_manager' },
  ];

  const safeRemove = canRemoveAdmin('admin-uuid-1', multiAdminTeam);
  assert.equal(safeRemove.allowed, true);

  // Attempting to remove a nonexistent admin ID
  const missingRemove = canRemoveAdmin('nonexistent-id', multiAdminTeam);
  assert.equal(missingRemove.allowed, false);
  assert.equal(missingRemove.reason, 'Admin member not found.');
});

test('buildAdminInviteMessage generates clear WhatsApp onboarding instructions', () => {
  const msg = buildAdminInviteMessage({
    name: 'Amina',
    appUrl: 'https://prechop.com.ng',
    roleTitle: 'Kitchen Manager',
  });

  assert.match(msg, /👋 Hello Amina,/);
  assert.match(msg, /approved as a Kitchen Manager on PreChop Admin/);
  assert.match(msg, /https:\/\/prechop\.com\.ng\/admin/);
  assert.match(msg, /phone OTP/);

  const whatsappUrl = getWhatsAppChatUrl('+2348031234567', msg);
  assert.match(whatsappUrl, /wa\.me\/2348031234567/);
  assert.match(whatsappUrl, /text=/);
});
