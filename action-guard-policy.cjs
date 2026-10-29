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
  const key = String(action || '');
  return ACTIONS[key] ? { action: key, ...ACTIONS[key] } : {
    action: key.slice(0, 80), decision: 'BLOCKED', reason: 'Action is not in the explicit allowlist.'
  };
}

module.exports = { ACTIONS, decideAction };
