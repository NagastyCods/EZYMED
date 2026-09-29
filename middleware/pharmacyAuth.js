const jwt = require('jsonwebtoken');
const { findPharmacyById, PHARMACIES } = require('../config/pharmacies');
const PharmacistAccount = require('../models/PharmacistAccount');
const { logAudit } = require('../services/auditService');
const { getJwtSecret } = require('../config/secrets');
const { accountRequiresMfa, signMfaPendingToken } = require('../services/mfaService');

const signPharmacyToken = (pharmacy) =>
  jwt.sign(
    { id: pharmacy.id, role: 'pharmacist', name: pharmacy.name },
    getJwtSecret(),
    { expiresIn: '12h' }
  );

async function authenticatePharmacist(pharmacyId, password, req) {
  const pharmacy = findPharmacyById(pharmacyId);
  if (!pharmacy) throw new Error('Invalid pharmacy credentials');

  const account = await PharmacistAccount.findOne({ pharmacyId: pharmacy.id, active: true }).select('+password +mfaSecret');
  if (!account) throw new Error('Invalid pharmacy credentials');

  const valid = await account.comparePassword(password);
  if (!valid) {
    await logAudit({
      actorRole: 'pharmacist',
      actorId: pharmacy.id,
      actorName: pharmacy.name,
      action: 'auth.login_failed',
      outcome: 'failure',
      req,
    });
    throw new Error('Invalid pharmacy credentials');
  }

  account.lastLoginAt = new Date();
  await account.save();

  if (accountRequiresMfa(account)) {
    return {
      requiresMfa: true,
      mfaToken: signMfaPendingToken({
        role: 'pharmacist',
        id: pharmacy.id,
        name: pharmacy.name,
      }),
      pharmacy: { id: pharmacy.id, name: pharmacy.name, address: pharmacy.address, phone: pharmacy.phone },
    };
  }

  await logAudit({
    actorRole: 'pharmacist',
    actorId: pharmacy.id,
    actorName: pharmacy.name,
    action: 'auth.login',
    req,
  });

  return { pharmacy, token: signPharmacyToken(pharmacy) };
}

const pharmacyAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Pharmacy authentication required' });
    }

    const decoded = jwt.verify(header.split(' ')[1], getJwtSecret());
    if (decoded.role !== 'pharmacist') {
      return res.status(403).json({ message: 'Pharmacy access only' });
    }

    const pharmacy = findPharmacyById(decoded.id);
    if (!pharmacy) {
      return res.status(401).json({ message: 'Invalid pharmacy token' });
    }

    req.pharmacy = pharmacy;
    req.pharmacyId = pharmacy.id;
    req.userRole = 'pharmacist';
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired pharmacy token' });
  }
};

module.exports = {
  PHARMACIES,
  authenticatePharmacist,
  pharmacyAuth,
  signPharmacyToken,
};
