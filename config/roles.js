const ROLES = {
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  ADMIN: 'admin',
  PHARMACIST: 'pharmacist',
};

const PERMISSIONS = {
  PROFILE_READ: 'profile:read',
  PROFILE_WRITE: 'profile:write',
  CONSENT_MANAGE: 'consent:manage',
  DATA_EXPORT: 'data:export',
  APPOINTMENTS_MANAGE: 'appointments:manage',
  CONSULTATIONS_REQUEST: 'consultations:request',
  CONSULTATIONS_CONDUCT: 'consultations:conduct',
  PRESCRIPTIONS_ISSUE: 'prescriptions:issue',
  PATIENT_RECORDS_READ: 'patient_records:read',
  PATIENT_RECORDS_WRITE: 'patient_records:write',
  HOSPITAL_MONITOR: 'hospital:monitor',
  HOSPITAL_BEDS: 'hospital:beds',
  AUDIT_READ: 'audit:read',
  MFA_MANAGE: 'mfa:manage',
  PHARMACY_ORDERS: 'pharmacy:orders',
  PHARMACY_NOTIFY: 'pharmacy:notify',
};

const ROLE_PERMISSIONS = {
  [ROLES.PATIENT]: [
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.PROFILE_WRITE,
    PERMISSIONS.CONSENT_MANAGE,
    PERMISSIONS.DATA_EXPORT,
    PERMISSIONS.APPOINTMENTS_MANAGE,
    PERMISSIONS.CONSULTATIONS_REQUEST,
    PERMISSIONS.MFA_MANAGE,
  ],
  [ROLES.DOCTOR]: [
    PERMISSIONS.CONSULTATIONS_CONDUCT,
    PERMISSIONS.PRESCRIPTIONS_ISSUE,
    PERMISSIONS.PATIENT_RECORDS_READ,
    PERMISSIONS.PATIENT_RECORDS_WRITE,
    PERMISSIONS.MFA_MANAGE,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.HOSPITAL_MONITOR,
    PERMISSIONS.HOSPITAL_BEDS,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.MFA_MANAGE,
  ],
  [ROLES.PHARMACIST]: [
    PERMISSIONS.PHARMACY_ORDERS,
    PERMISSIONS.PHARMACY_NOTIFY,
    PERMISSIONS.MFA_MANAGE,
  ],
};

function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function roleHasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission);
}

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  roleHasPermission,
};
