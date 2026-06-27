const DEPARTMENT_CODES = {
  'General Medicine': 'GM',
  'Pediatrics': 'PD',
  'Cardiology': 'CD',
  'Pulmonology': 'PL',
  'Neurology': 'NR',
  'Gastroenterology': 'GI',
  'Dermatology': 'DM',
  'Orthopedics': 'OR',
  'Emergency Medicine': 'EM',
  'Psychiatry / Mental Health': 'MH',
};

const DOCTORS = [
  { id: 'okonkwo', name: 'Dr. Sarah Okonkwo', department: 'General Medicine', title: 'General Practitioner', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
  { id: 'adeyemi', name: 'Dr. James Adeyemi', department: 'General Medicine', title: 'General Practitioner', days: [1, 2, 3, 4, 5], startHour: 10, endHour: 18 },
  { id: 'eze', name: 'Dr. Chioma Eze', department: 'General Medicine', title: 'Family Medicine', days: [1, 2, 3, 4, 5, 6], startHour: 9, endHour: 13 },
  { id: 'yusuf', name: 'Dr. Amina Yusuf', department: 'Pediatrics', title: 'Pediatrician', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 16 },
  { id: 'okafor', name: 'Dr. David Okafor', department: 'Pediatrics', title: 'Pediatrician', days: [1, 2, 3, 4, 5], startHour: 11, endHour: 18 },
  { id: 'bello', name: 'Dr. Fatima Bello', department: 'Cardiology', title: 'Cardiologist', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 15 },
  { id: 'chen', name: 'Dr. Michael Chen', department: 'Cardiology', title: 'Cardiologist', days: [2, 3, 4, 5, 6], startHour: 10, endHour: 16 },
  { id: 'grant', name: 'Dr. Helen Grant', department: 'Pulmonology', title: 'Pulmonologist', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
  { id: 'singh', name: 'Dr. Robert Singh', department: 'Neurology', title: 'Neurologist', days: [1, 2, 3, 4, 5], startHour: 10, endHour: 17 },
  { id: 'mensah', name: 'Dr. Laura Mensah', department: 'Gastroenterology', title: 'Gastroenterologist', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 16 },
  { id: 'williams', name: 'Dr. Kate Williams', department: 'Dermatology', title: 'Dermatologist', days: [1, 2, 3, 4, 5, 6], startHour: 9, endHour: 14 },
  { id: 'morrison', name: 'Dr. Paul Morrison', department: 'Orthopedics', title: 'Orthopedic Surgeon', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
  { id: 'emergency', name: 'Dr. Emergency Team', department: 'Emergency Medicine', title: 'Emergency Physician', days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24 },
  { id: 'akpan', name: 'Dr. Grace Akpan', department: 'Psychiatry / Mental Health', title: 'Psychiatrist', days: [1, 2, 3, 4, 5], startHour: 10, endHour: 18 },
];

const DEPARTMENT_DOCTORS = DOCTORS.reduce((acc, doc) => {
  if (!acc[doc.department]) acc[doc.department] = [];
  acc[doc.department].push(doc.name);
  return acc;
}, {});

const DEPARTMENTS = Object.keys(DEPARTMENT_DOCTORS);

function findDoctorByName(name) {
  return DOCTORS.find((d) => d.name === name);
}

function findDoctorById(id) {
  return DOCTORS.find((d) => d.id === id);
}

module.exports = {
  DOCTORS,
  DEPARTMENTS,
  DEPARTMENT_CODES,
  DEPARTMENT_DOCTORS,
  findDoctorByName,
  findDoctorById,
};
