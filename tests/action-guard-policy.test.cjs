'use strict';

const assert = require('node:assert/strict');
const { ACTIONS, decideAction } = require('../action-guard-policy.cjs');

assert.equal(decideAction('crm.property.hold').decision, 'APPROVED');
assert.equal(decideAction('crm.external_commitment').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.payment.initiate').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.lease.sign').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.booking.confirm').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.tenant.delete').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.property.status.change').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('admin.override').decision, 'BLOCKED');
assert.equal(decideAction('').decision, 'BLOCKED');

// Prototype property names must never bypass the explicit allowlist.
for (const action of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
  assert.equal(decideAction(action).decision, 'BLOCKED', `${action} must be default-denied`);
}
for (const action of [null, undefined, 42, {}, ['crm.property.hold']]) {
  assert.equal(decideAction(action).decision, 'BLOCKED', 'non-string action values must be default-denied');
}
assert.equal(Object.isFrozen(ACTIONS), true, 'the policy map must remain immutable');
for (const [action, policy] of Object.entries(ACTIONS)) {
  assert.ok(['APPROVED', 'PENDING_APPROVAL'].includes(policy.decision), `${action} must have an explicit safe verdict`);
}
console.log('Action guard policy tests passed.');

const { validateActionRequest } = require('../action-guard-policy.cjs');

const validRequest = {
  idempotencyKey: 'request-123',
  action: 'crm.property.hold',
  resourceRef: 'property-456'
};
assert.deepEqual(validateActionRequest(validRequest), {
  ok: true,
  value: validRequest
});
for (const invalid of [
  { ...validRequest, action: { toString: () => 'crm.property.hold' } },
  { ...validRequest, action: ['crm.property.hold'] },
  { ...validRequest, action: '' },
  { ...validRequest, action: 'x'.repeat(81) },
  { ...validRequest, resourceRef: { value: 'property-456' } },
  { ...validRequest, resourceRef: '' },
  { ...validRequest, resourceRef: 'x'.repeat(241) },
  { ...validRequest, idempotencyKey: 12345678 },
  { ...validRequest, idempotencyKey: 'short' },
  { ...validRequest, idempotencyKey: 'bad key 123' }
]) {
  assert.equal(validateActionRequest(invalid).ok, false, 'malformed values must be rejected without coercion');
}
assert.equal(validateActionRequest({
  ...validRequest,
  idempotencyKey: '  request-123  ',
  action: ' crm.property.hold ',
  resourceRef: ' property-456 '
}).value.action, 'crm.property.hold');
