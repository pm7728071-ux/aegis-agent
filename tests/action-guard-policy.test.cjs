'use strict';

const assert = require('node:assert/strict');
const { decideAction } = require('../action-guard-policy.cjs');

assert.equal(decideAction('crm.property.hold').decision, 'APPROVED');
assert.equal(decideAction('crm.external_commitment').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.payment.initiate').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.lease.sign').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.booking.confirm').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.tenant.delete').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('crm.property.status.change').decision, 'PENDING_APPROVAL');
assert.equal(decideAction('admin.override').decision, 'BLOCKED');
assert.equal(decideAction('').decision, 'BLOCKED');
console.log('Action guard policy tests passed.');
