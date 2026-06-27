let patient = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!API.requireAuth()) return;

  setupNavigation();
  setupMobileSidebar();
  setupLogout();
  setupProfileForm();
  setupInsuranceForm();
  setupModals();

  try {
    await loadPatient();
    renderOverview();
    renderAllSections();
    initSymptomChecker();
    initVirtualQueue();
    initAppointments();
    initTelemedicine();
  } catch {
    API.clearToken();
    window.location.href = '/login.html';
  }
});

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`section-${section}`).classList.add('active');
      closeMobileSidebar();
    });
  });
}

function setupMobileSidebar() {
  const toggle = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const sidebar = document.getElementById('sidebar');

  if (!toggle || !overlay || !sidebar) return;

  toggle.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('open', isOpen);
    document.body.classList.toggle('nav-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  });

  overlay.addEventListener('click', closeMobileSidebar);

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMobileSidebar();
  });
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggle = document.getElementById('sidebarToggle');

  sidebar?.classList.remove('open');
  overlay?.classList.remove('open');
  document.body.classList.remove('nav-open');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Open navigation menu');
}

function setupLogout() {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    API.clearToken();
    window.location.href = '/login.html';
  });
}

async function loadPatient() {
  const data = await API.request('/api/patient/profile');
  patient = data.patient;
  API.setPatient(patient);
  document.getElementById('userName').textContent = `${patient.firstName} ${patient.lastName}`;
  document.getElementById('userEmail').textContent = patient.email;
}

function renderOverview() {
  const el = document.getElementById('overviewStats');
  el.innerHTML = `
    <div class="stat-card">
      <span class="stat-value">${patient.allergies?.length || 0}</span>
      <span class="stat-label">Allergies</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">${patient.medications?.length || 0}</span>
      <span class="stat-label">Medications</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">${patient.medicalHistory?.length || 0}</span>
      <span class="stat-label">Conditions</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">${patient.emergencyContacts?.length || 0}</span>
      <span class="stat-label">Emergency Contacts</span>
    </div>
  `;
}

function renderAllSections() {
  fillProfileForm();
  renderAllergies();
  renderMedications();
  renderMedicalHistory();
  renderEmergencyContacts();
  fillInsuranceForm();
}

function fillProfileForm() {
  const form = document.getElementById('profileForm');
  form.firstName.value = patient.firstName || '';
  form.lastName.value = patient.lastName || '';
  form.email.value = patient.email || '';
  form.phone.value = patient.phone || '';
  form.dateOfBirth.value = patient.dateOfBirth ? patient.dateOfBirth.split('T')[0] : '';
  form.gender.value = patient.gender || '';
  form.bloodType.value = patient.bloodType || 'unknown';
  form.street.value = patient.address?.street || '';
  form.city.value = patient.address?.city || '';
  form.state.value = patient.address?.state || '';
  form.zipCode.value = patient.address?.zipCode || '';
  form.country.value = patient.address?.country || 'Nigeria';
}

function setupProfileForm() {
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('profileAlert');
    const form = e.target;

    try {
      const data = await API.request('/api/patient/profile', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: form.firstName.value.trim(),
          lastName: form.lastName.value.trim(),
          phone: form.phone.value.trim(),
          dateOfBirth: form.dateOfBirth.value || undefined,
          gender: form.gender.value,
          bloodType: form.bloodType.value,
          address: {
            street: form.street.value.trim(),
            city: form.city.value.trim(),
            state: form.state.value.trim(),
            zipCode: form.zipCode.value.trim(),
            country: form.country.value.trim(),
          },
        }),
      });
      patient = data.patient;
      API.setPatient(patient);
      document.getElementById('userName').textContent = `${patient.firstName} ${patient.lastName}`;
      showAlert(alertBox, 'Profile saved successfully', 'success');
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });
}

function fillInsuranceForm() {
  const ins = patient.insurance || {};
  const form = document.getElementById('insuranceForm');
  form.provider.value = ins.provider || '';
  form.policyNumber.value = ins.policyNumber || '';
  form.groupNumber.value = ins.groupNumber || '';
  form.planType.value = ins.planType || '';
  form.expiryDate.value = ins.expiryDate ? ins.expiryDate.split('T')[0] : '';
}

function setupInsuranceForm() {
  document.getElementById('insuranceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('insuranceAlert');
    const form = e.target;

    try {
      const data = await API.request('/api/patient/insurance', {
        method: 'PUT',
        body: JSON.stringify({
          provider: form.provider.value.trim(),
          policyNumber: form.policyNumber.value.trim(),
          groupNumber: form.groupNumber.value.trim(),
          planType: form.planType.value.trim(),
          expiryDate: form.expiryDate.value || undefined,
        }),
      });
      patient.insurance = data.insurance;
      showAlert(alertBox, 'Insurance information saved', 'success');
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });
}

function renderAllergies() {
  const list = document.getElementById('allergiesList');
  if (!patient.allergies?.length) {
    list.innerHTML = '<p class="empty-state">No allergies recorded. Add any known allergies for safer care.</p>';
    return;
  }
  list.innerHTML = patient.allergies.map((a) => `
    <div class="list-card" data-id="${a._id}">
      <div class="list-card-main">
        <strong>${a.allergen}</strong>
        ${statusBadge(a.severity)}
        ${a.reaction ? `<p class="text-muted">${a.reaction}</p>` : ''}
      </div>
      <div class="list-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="editAllergy('${a._id}')">Edit</button>
        <button class="btn btn-ghost btn-sm text-danger" onclick="deleteAllergy('${a._id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

function renderMedications() {
  const list = document.getElementById('medicationsList');
  if (!patient.medications?.length) {
    list.innerHTML = '<p class="empty-state">No current medications listed.</p>';
    return;
  }
  list.innerHTML = patient.medications.map((m) => `
    <div class="list-card" data-id="${m._id}">
      <div class="list-card-main">
        <strong>${m.name}</strong>
        <p class="text-muted">${[m.dosage, m.frequency].filter(Boolean).join(' · ') || 'No dosage info'}</p>
        ${m.prescribedBy ? `<p class="text-small">Prescribed by ${m.prescribedBy}</p>` : ''}
      </div>
      <div class="list-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="editMedication('${m._id}')">Edit</button>
        <button class="btn btn-ghost btn-sm text-danger" onclick="deleteMedication('${m._id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

function renderMedicalHistory() {
  const list = document.getElementById('historyList');
  if (!patient.medicalHistory?.length) {
    list.innerHTML = '<p class="empty-state">No medical history recorded yet.</p>';
    return;
  }
  list.innerHTML = patient.medicalHistory.map((h) => `
    <div class="list-card" data-id="${h._id}">
      <div class="list-card-main">
        <strong>${h.condition}</strong>
        ${statusBadge(h.status)}
        <p class="text-muted">Diagnosed: ${formatDate(h.diagnosedDate)}</p>
        ${h.notes ? `<p class="text-small">${h.notes}</p>` : ''}
      </div>
      <div class="list-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="editHistory('${h._id}')">Edit</button>
        <button class="btn btn-ghost btn-sm text-danger" onclick="deleteHistory('${h._id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

function renderEmergencyContacts() {
  const list = document.getElementById('contactsList');
  if (!patient.emergencyContacts?.length) {
    list.innerHTML = '<p class="empty-state">Add at least one emergency contact.</p>';
    return;
  }
  list.innerHTML = patient.emergencyContacts.map((c) => `
    <div class="list-card" data-id="${c._id}">
      <div class="list-card-main">
        <strong>${c.name}</strong>
        <p class="text-muted">${c.relationship} · ${c.phone}</p>
        ${c.email ? `<p class="text-small">${c.email}</p>` : ''}
      </div>
      <div class="list-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="editContact('${c._id}')">Edit</button>
        <button class="btn btn-ghost btn-sm text-danger" onclick="deleteContact('${c._id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

async function handleModalSubmit(e) {
  e.preventDefault();
  const config = modalConfigs[modalType];
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));

  Object.keys(body).forEach((k) => {
    if (body[k] === '') delete body[k];
  });

  try {
    await API.request(config.endpoint(editId), {
      method: config.method(editId),
      body: JSON.stringify(body),
    });

    const data = await API.request('/api/patient/profile');
    patient = data.patient;

    config.refresh();
    renderOverview();
    closeModal();
  } catch (err) {
    document.getElementById('modalAlert').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

function setupModals() {
  document.getElementById('addAllergyBtn').addEventListener('click', () => openModal('allergy'));
  document.getElementById('addMedicationBtn').addEventListener('click', () => openModal('medication'));
  document.getElementById('addHistoryBtn').addEventListener('click', () => openModal('history'));
  document.getElementById('addContactBtn').addEventListener('click', () => openModal('contact'));

  document.getElementById('modalForm').addEventListener('submit', handleModalSubmit);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}

let modalType = null;
let editId = null;

const modalConfigs = {
  allergy: {
    title: 'Add Allergy',
    editTitle: 'Edit Allergy',
    fields: `
      <div class="form-group"><label>Allergen *</label><input name="allergen" required></div>
      <div class="form-group"><label>Severity</label>
        <select name="severity"><option value="mild">Mild</option><option value="moderate" selected>Moderate</option><option value="severe">Severe</option></select>
      </div>
      <div class="form-group"><label>Reaction</label><textarea name="reaction" rows="2"></textarea></div>
    `,
    endpoint: (id) => id ? `/api/patient/allergies/${id}` : '/api/patient/allergies',
    method: (id) => id ? 'PUT' : 'POST',
    refresh: renderAllergies,
    getData: (item) => patient.allergies.find((a) => a._id === item),
    updatePatient: (data) => { patient.allergies = data.allergies; },
  },
  medication: {
    title: 'Add Medication',
    editTitle: 'Edit Medication',
    fields: `
      <div class="form-group"><label>Name *</label><input name="name" required></div>
      <div class="form-row"><div class="form-group"><label>Dosage</label><input name="dosage" placeholder="e.g. 500mg"></div>
      <div class="form-group"><label>Frequency</label><input name="frequency" placeholder="e.g. Twice daily"></div></div>
      <div class="form-group"><label>Prescribed by</label><input name="prescribedBy"></div>
      <div class="form-group"><label>Start date</label><input type="date" name="startDate"></div>
    `,
    endpoint: (id) => id ? `/api/patient/medications/${id}` : '/api/patient/medications',
    method: (id) => id ? 'PUT' : 'POST',
    refresh: renderMedications,
    getData: (item) => patient.medications.find((m) => m._id === item),
    updatePatient: (data) => { patient.medications = data.medications; },
  },
  history: {
    title: 'Add Medical Record',
    editTitle: 'Edit Medical Record',
    fields: `
      <div class="form-group"><label>Condition *</label><input name="condition" required></div>
      <div class="form-row"><div class="form-group"><label>Diagnosed date</label><input type="date" name="diagnosedDate"></div>
      <div class="form-group"><label>Status</label>
        <select name="status"><option value="active">Active</option><option value="managed">Managed</option><option value="resolved">Resolved</option></select>
      </div></div>
      <div class="form-group"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
    `,
    endpoint: (id) => id ? `/api/patient/medical-history/${id}` : '/api/patient/medical-history',
    method: (id) => id ? 'PUT' : 'POST',
    refresh: renderMedicalHistory,
    getData: (item) => patient.medicalHistory.find((h) => h._id === item),
    updatePatient: (data) => { patient.medicalHistory = data.medicalHistory; },
  },
  contact: {
    title: 'Add Emergency Contact',
    editTitle: 'Edit Emergency Contact',
    fields: `
      <div class="form-group"><label>Full name *</label><input name="name" required></div>
      <div class="form-group"><label>Relationship *</label><input name="relationship" required placeholder="e.g. Spouse, Parent"></div>
      <div class="form-row"><div class="form-group"><label>Phone *</label><input name="phone" required></div>
      <div class="form-group"><label>Email</label><input type="email" name="email"></div></div>
    `,
    endpoint: (id) => id ? `/api/patient/emergency-contacts/${id}` : '/api/patient/emergency-contacts',
    method: (id) => id ? 'PUT' : 'POST',
    refresh: renderEmergencyContacts,
    getData: (item) => patient.emergencyContacts.find((c) => c._id === item),
    updatePatient: (data) => { patient.emergencyContacts = data.emergencyContacts; },
  },
};

function openModal(type, id = null) {
  modalType = type;
  editId = id;
  const config = modalConfigs[type];
  document.getElementById('modalTitle').textContent = id ? config.editTitle || config.title : config.title;
  document.getElementById('modalFields').innerHTML = config.fields;
  document.getElementById('modalOverlay').classList.add('open');

  if (id && config.getData) {
    const item = config.getData(id);
    const form = document.getElementById('modalForm');
    Object.keys(item).forEach((key) => {
      if (form[key]) {
        if (key.includes('Date') && item[key]) {
          form[key].value = item[key].split('T')[0];
        } else {
          form[key].value = item[key] || '';
        }
      }
    });
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalForm').reset();
  modalType = null;
  editId = null;
}

window.editAllergy = (id) => openModal('allergy', id);
window.editMedication = (id) => openModal('medication', id);
window.editHistory = (id) => openModal('history', id);
window.editContact = (id) => openModal('contact', id);

window.deleteAllergy = (id) => deleteItem('/api/patient/allergies', id, renderAllergies, 'allergies');
window.deleteMedication = (id) => deleteItem('/api/patient/medications', id, renderMedications, 'medications');
window.deleteHistory = (id) => deleteItem('/api/patient/medical-history', id, renderMedicalHistory, 'medicalHistory');
window.deleteContact = (id) => deleteItem('/api/patient/emergency-contacts', id, renderEmergencyContacts, 'emergencyContacts');

async function deleteItem(path, id, refresh, field) {
  if (!confirm('Remove this item?')) return;
  try {
    const data = await API.request(`${path}/${id}`, { method: 'DELETE' });
    patient[field] = data[field];
    refresh();
    renderOverview();
  } catch (err) {
    alert(err.message);
  }
}
