const PHARMACIES = [
  {
    id: 'central',
    name: 'EZYMED Central Pharmacy',
    address: '12 Medical Plaza, Lagos',
    phone: '+234 801 000 1001',
    hours: '8:00 – 20:00',
  },
  {
    id: 'north',
    name: 'EZYMED North Pharmacy',
    address: '45 Health Avenue, Abuja',
    phone: '+234 801 000 1002',
    hours: '9:00 – 18:00',
  },
  {
    id: 'express',
    name: 'EZYMED Express Pharmacy',
    address: '3 QuickCare Road, Port Harcourt',
    phone: '+234 801 000 1003',
    hours: '24 hours',
  },
];

function findPharmacyById(id) {
  return PHARMACIES.find((p) => p.id === id);
}

module.exports = { PHARMACIES, findPharmacyById };
