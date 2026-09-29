const test = require('node:test');
const assert = require('node:assert/strict');
const { roleHasPermission, PERMISSIONS, ROLES } = require('../config/roles');

test('patient role has expected permissions', () => {
  assert.equal(roleHasPermission(ROLES.PATIENT, PERMISSIONS.PROFILE_READ), true);
  assert.equal(roleHasPermission(ROLES.PATIENT, PERMISSIONS.CONSULTATIONS_REQUEST), true);
  assert.equal(roleHasPermission(ROLES.PATIENT, PERMISSIONS.PRESCRIPTIONS_ISSUE), false);
});

test('doctor role cannot manage pharmacy orders', () => {
  assert.equal(roleHasPermission(ROLES.DOCTOR, PERMISSIONS.PHARMACY_ORDERS), false);
  assert.equal(roleHasPermission(ROLES.DOCTOR, PERMISSIONS.PATIENT_RECORDS_READ), true);
});

test('pharmacist role has pharmacy permissions only', () => {
  assert.equal(roleHasPermission(ROLES.PHARMACIST, PERMISSIONS.PHARMACY_ORDERS), true);
  assert.equal(roleHasPermission(ROLES.PHARMACIST, PERMISSIONS.HOSPITAL_MONITOR), false);
});

test('admin role can read audit logs', () => {
  assert.equal(roleHasPermission(ROLES.ADMIN, PERMISSIONS.AUDIT_READ), true);
  assert.equal(roleHasPermission(ROLES.ADMIN, PERMISSIONS.DATA_EXPORT), false);
});
