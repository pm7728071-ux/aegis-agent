'use strict';

const ACTIONS = Object.freeze({
  'crm.property.hold': { decision: 'APPROVED', reason: 'Protective listing hold is permitted.' },
  'crm.external_commitment': { decision: 'PENDING_APPROVAL', reason: 'External commitments require a human decision in the CRM approval queue.' },
  'crm.payment.initiate': { decision: 'PENDING_APPROVAL', reason: 'Money movement requires explicit human approval.' },
  'crm.lease.sign': { decision: 'PENDING_APPROVAL', reason: 'Lease signing requires explicit human approval.' },
  'crm.booking.confirm': { decision: 'PENDING_APPROVAL', reason: 'Booking confirmation requires verified availability and human approval.' },
  'crm.tenant.delete': { decision: 'PENDING_APPROVAL', reason: 'Tenant deletion requires explicit human approval.' },
  'crm.property.status.change': { decision: 'PENDING_APPROVAL', reason: 'Property status changes require explicit human approval.' }
});

function decideAction(action) {
  const key = typeof action === 'string' ? action : '';
  return Object.prototype.hasOwnProperty.call(ACTIONS, key) ? { action: key, ...ACTIONS[key] } : {
    action: key.slice(0, 80), decision: 'BLOCKED', reason: 'Action is not in the explicit allowlist.'
  };
}

function validateActionRequest({ idempotencyKey, action, resourceRef } = {}) {
  if (typeof idempotencyKey !== 'string') {
    return { ok: false, reason: 'A valid X-Idempotency-Key (8-120 safe characters) is required' };
  }
  const key = idempotencyKey.trim();
  if (!/^[a-zA-Z0-9._:-]{8,120}$/.test(key)) {
    return { ok: false, reason: 'A valid X-Idempotency-Key (8-120 safe characters) is required' };
  }
  if (typeof action !== 'string' || !action.trim() || action.trim().length > 80) {
    return { ok: false, reason: 'action must be a non-empty string of at most 80 characters' };
  }
  if (typeof resourceRef !== 'string' || !resourceRef.trim() || resourceRef.trim().length > 240) {
    return { ok: false, reason: 'resourceRef must be a non-empty string of at most 240 characters' };
  }
  return {
    ok: true,
    value: { idempotencyKey: key, action: action.trim(), resourceRef: resourceRef.trim() }
  };
}

module.exports = { ACTIONS, decideAction, validateActionRequest };
