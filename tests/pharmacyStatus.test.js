const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS_FLOW } = require('../services/pharmacyService');

test('pharmacy status flow allows verified after received', () => {
  assert.ok(STATUS_FLOW.received.includes('verified'));
});

test('pharmacy status flow allows ready after preparing', () => {
  assert.ok(STATUS_FLOW.preparing.includes('ready'));
});

test('completed is reachable from ready', () => {
  assert.ok(STATUS_FLOW.ready.includes('completed'));
});

test('cancelled is allowed from early statuses', () => {
  assert.ok(STATUS_FLOW.received.includes('cancelled'));
  assert.ok(STATUS_FLOW.verified.includes('cancelled'));
});
