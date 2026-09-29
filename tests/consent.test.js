const test = require('node:test');
const assert = require('node:assert/strict');
const {getConsentOptionsForRegistration,CONSENT_LABELS} = require('../services/consentService');

test('registration consent options mark treatment as required', () => {
  const options = getConsentOptionsForRegistration();
  const treatment = options.find((o) => o.consentType === 'treatment');
  const telemedicine = options.find((o) => o.consentType === 'telemedicine');

  assert.ok(treatment);
  assert.equal(treatment.required, true);
  assert.ok(telemedicine);
  assert.equal(telemedicine.required, false);
});

test('consent labels exist for all registration types', () => {
  assert.ok(CONSENT_LABELS.treatment);
  assert.ok(CONSENT_LABELS.telemedicine);
  assert.ok(CONSENT_LABELS.data_sharing);
  assert.ok(CONSENT_LABELS.research);
});
