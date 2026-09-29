const test = require('node:test');
const assert = require('node:assert/strict');
const { hashToken, generateToken } = require('../services/accountLifecycleService');

test('hashToken is deterministic', () => {
  const token = 'sample-token-value';
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), hashToken('other-token'));
});

test('generateToken returns unique hex strings', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a, b);
  assert.match(a, /^[a-f0-9]{64}$/ );
});
