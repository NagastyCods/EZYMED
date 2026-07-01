const { roleHasPermission } = require('../config/roles');

function resolveRole(req) {
  if (req.patient) return 'patient';
  if (req.doctor) return 'doctor';
  if (req.admin) return 'admin';
  if (req.pharmacy) return 'pharmacist';
  return null;
}

function requirePermission(...permissions) {
  return (req, res, next) => {
    const role = resolveRole(req);
    if (!role) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const missing = permissions.filter((p) => !roleHasPermission(role, p));
    if (missing.length) {
      return res.status(403).json({
        message: 'Insufficient permissions for this action',
        required: permissions,
      });
    }

    req.userRole = role;
    next();
  };
}

module.exports = { requirePermission, resolveRole };
