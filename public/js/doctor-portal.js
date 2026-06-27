const DoctorAPI = {
  getToken() { return localStorage.getItem('ezymed_doctor_token'); },
  setToken(t) { localStorage.setItem('ezymed_doctor_token', t); },
  clearToken() { localStorage.removeItem('ezymed_doctor_token'); localStorage.removeItem('ezymed_doctor'); },
  getDoctor() {
    const d = localStorage.getItem('ezymed_doctor');
    return d ? JSON.parse(d) : null;
  },
  setDoctor(doc) { localStorage.setItem('ezymed_doctor', JSON.stringify(doc)); },

  async request(path, options = {}) {
    const headers = { ...options.headers };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const res = await fetch(`${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  },
};

let doctorSocket = null;
let doctorWebRTC = null;
let activeConsultation = null;
let chartPatientId = null;
let dashboardData = null;

document.addEventListener('DOMContentLoaded', () => {
  if (DoctorAPI.getToken()) showDashboard();
  else showLogin();

  document.getElementById('doctorLoginForm').addEventListener('submit', handleDoctorLogin);
  document.getElementById('doctorLogoutBtn').addEventListener('click', () => {
    teardownDoctorRoom();
    DoctorAPI.clearToken();
    showLogin();
  });

  document.getElementById('refreshDashboardBtn').addEventListener('click', loadDashboard);
  document.getElementById('refreshQueueBtn').addEventListener('click', loadQueue);
  document.getElementById('refreshConsultationsBtn').addEventListener('click', loadQueue);
  document.getElementById('doctorEndBtn').addEventListener('click', endDoctorConsultation);
  document.getElementById('doctorChatForm').addEventListener('submit', sendDoctorChat);
  document.getElementById('viewPatientChartBtn').addEventListener('click', () => {
    if (activeConsultation?.patient?._id) openPatientChart(activeConsultation.patient._id);
  });

  document.getElementById('prescriptionForm').addEventListener('submit', (e) => submitClinical(e, 'prescription'));
  document.getElementById('testForm').addEventListener('submit', (e) => submitClinical(e, 'test'));
  document.getElementById('referralForm').addEventListener('submit', (e) => submitClinical(e, 'referral'));
  document.getElementById('fileForm').addEventListener('submit', submitFile);
  document.getElementById('consultNoteForm').addEventListener('submit', submitConsultNote);
  document.getElementById('patientNoteForm').addEventListener('submit', submitPatientNote);

  document.querySelectorAll('.doctor-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('appointmentDateFilter').addEventListener('change', loadAppointments);
  document.getElementById('appointmentStatusFilter').addEventListener('change', loadAppointments);
  document.getElementById('closePatientChartBtn').addEventListener('click', closePatientChart);
  document.getElementById('patientChartBackdrop').addEventListener('click', closePatientChart);
  document.getElementById('refreshSummaryBtn').addEventListener('click', loadAiSummary);

  loadDoctorList();
});

function showLogin() {
  document.getElementById('doctorLogin').hidden = false;
  document.getElementById('doctorDashboard').hidden = true;
  document.getElementById('doctorRoom').hidden = true;
  document.getElementById('doctorNav').hidden = true;
  document.getElementById('patientChartModal').hidden = true;
  document.getElementById('doctorLoginAlert').innerHTML = '';
  document.getElementById('doctorLoginForm').reset();
  chartPatientId = null;
}

function showDashboard() {
  const doc = DoctorAPI.getDoctor();
  document.getElementById('doctorLogin').hidden = true;
  document.getElementById('doctorDashboard').hidden = false;
  document.getElementById('doctorRoom').hidden = true;
  document.getElementById('doctorNav').hidden = false;
  document.getElementById('doctorLoginAlert').innerHTML = '';
  document.getElementById('doctorNameLabel').textContent = doc?.name || '';
  document.getElementById('doctorWelcomeTitle').textContent = doc?.name || 'Doctor dashboard';
  document.getElementById('doctorDeptLabel').textContent = doc?.department || '';
  loadDashboard();
}

function switchTab(tab) {
  document.querySelectorAll('.doctor-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.doctor-tab-panel').forEach((el) => {
    el.classList.toggle('active', el.id === `tab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
  });

  if (tab === 'appointments') loadAppointments();
  if (tab === 'consultations') loadQueue(document.getElementById('consultationQueue'));
}

async function loadDoctorList() {
  try {
    const data = await DoctorAPI.request('/api/doctor/list');
    document.getElementById('doctorIdSelect').innerHTML = data.doctors
      .map((d) => `<option value="${d.id}">${d.name} — ${d.department}</option>`)
      .join('');
  } catch { /* ignore */ }
}

async function handleDoctorLogin(e) {
  e.preventDefault();
  const form = e.target;
  const alertBox = document.getElementById('doctorLoginAlert');

  try {
    const data = await DoctorAPI.request('/api/doctor/auth/login', {
      method: 'POST',
      body: JSON.stringify({ doctorId: form.doctorId.value, password: form.password.value }),
    });
    DoctorAPI.setToken(data.token);
    DoctorAPI.setDoctor(data.doctor);
    showDashboard();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function loadDashboard() {
  try {
    dashboardData = await DoctorAPI.request('/api/doctor/dashboard');
    renderKpis(dashboardData.stats);
    renderTodayAppointments(dashboardData.todayAppointments || []);
    loadQueue(document.getElementById('overviewQueueList'));
  } catch (err) {
    document.getElementById('doctorKpiGrid').innerHTML =
      `<p class="empty-state">${err.message}</p>`;
  }
}

function renderKpis(stats) {
  document.getElementById('doctorKpiGrid').innerHTML = [
    { label: 'Appointments today', value: stats.appointmentsToday },
    { label: 'Waiting', value: stats.waitingConsultations, warn: stats.waitingConsultations > 0 },
    { label: 'Active visits', value: stats.activeConsultations },
    { label: 'Completed today', value: stats.completedToday, success: true },
  ].map((k) => `
    <div class="kpi-card${k.warn ? ' kpi-warning' : ''}${k.success ? ' kpi-success' : ''}">
      <span class="kpi-value">${k.value}</span>
      <span class="kpi-label">${k.label}</span>
    </div>`).join('');
}

function renderTodayAppointments(appointments) {
  const el = document.getElementById('todayAppointmentsList');
  if (!appointments.length) {
    el.innerHTML = '<p class="empty-state text-small">No appointments scheduled for today.</p>';
    return;
  }

  el.innerHTML = appointments.map(renderAppointmentCard).join('');
}

function renderAppointmentCard(a) {
  const patient = a.patient || {};
  const patientId = patient._id || a.patient;
  const time = new Date(a.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const date = new Date(a.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return `
    <div class="appointment-card">
      <div class="appointment-card-main">
        <strong>${esc(patient.firstName || '')} ${esc(patient.lastName || 'Patient')}</strong>
        <span class="badge badge-${statusBadge(a.status)}">${a.status}</span>
        <span class="badge badge-info">${a.type}</span>
        <p class="text-muted text-small">${date} at ${time}</p>
        <p class="text-small">${esc(a.reason || 'No reason given')}</p>
      </div>
      <div class="appointment-actions">
        <button class="btn btn-outline btn-sm" onclick="openPatientChart('${patientId}')">Chart</button>
        ${a.status === 'scheduled' ? `
          <button class="btn btn-primary btn-sm" onclick="completeAppointment('${a._id}')">Complete</button>
        ` : ''}
      </div>
    </div>`;
}

function statusBadge(status) {
  return { scheduled: 'info', completed: 'success', cancelled: 'danger', 'no-show': 'warning' }[status] || 'info';
}

async function loadAppointments() {
  const el = document.getElementById('appointmentsList');
  const date = document.getElementById('appointmentDateFilter').value;
  const status = document.getElementById('appointmentStatusFilter').value;
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (status) params.set('status', status);

  try {
    const data = await DoctorAPI.request(`/api/doctor/appointments?${params}`);
    if (!data.appointments?.length) {
      el.innerHTML = '<p class="empty-state">No appointments found for this filter.</p>';
      return;
    }
    el.innerHTML = data.appointments.map(renderAppointmentCard).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

window.completeAppointment = async (id) => {
  try {
    await DoctorAPI.request(`/api/doctor/appointments/${id}/complete`, { method: 'PATCH' });
    loadDashboard();
    loadAppointments();
  } catch (err) {
    alert(err.message);
  }
};

async function loadQueue(targetEl) {
  const el = targetEl || document.getElementById('consultationQueue');
  try {
    const data = await DoctorAPI.request('/api/doctor/consultations');
    if (!data.consultations?.length) {
      el.innerHTML = '<p class="empty-state">No patients waiting for consultation.</p>';
      return;
    }

    el.innerHTML = data.consultations.map((c) => {
      const patient = c.patient || {};
      const patientId = patient._id || c.patient;
      return `
        <div class="consult-card">
          <div class="consult-card-main">
            <strong>${esc(patient.firstName || '')} ${esc(patient.lastName || 'Patient')}</strong>
            <span class="badge badge-info">${c.mode}</span>
            <span class="badge badge-${c.status === 'active' ? 'success' : 'warning'}">${c.status}</span>
            <p class="text-muted text-small">${esc(c.department)} · ${esc(c.reason || 'No reason given')}</p>
            <p class="text-small">Requested ${new Date(c.createdAt).toLocaleString()}</p>
          </div>
          <div class="consult-actions">
            <button class="btn btn-outline btn-sm" onclick="openPatientChart('${patientId}')">Chart</button>
            <button class="btn btn-primary btn-sm" onclick="joinConsultation('${c._id}')">
              ${c.status === 'active' ? 'Rejoin' : 'Start consultation'}
            </button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

window.joinConsultation = async (id) => {
  try {
    const data = await DoctorAPI.request(`/api/doctor/consultations/${id}/join`, { method: 'PATCH' });
    await enterDoctorRoom(data.consultation, data.messages, data.records);
  } catch (err) {
    alert(err.message);
  }
};

window.openPatientChart = async (patientId) => {
  chartPatientId = patientId;
  document.getElementById('patientChartModal').hidden = false;
  document.getElementById('aiSummaryContent').innerHTML = '<p class="text-muted text-small">Loading summary…</p>';
  document.getElementById('patientHistoryContent').innerHTML = '<p class="text-muted text-small">Loading history…</p>';

  try {
    const history = await DoctorAPI.request(`/api/doctor/patients/${patientId}/history`);
    const p = history.patient;
    document.getElementById('patientChartTitle').textContent =
      `${p.firstName || ''} ${p.lastName || 'Patient'}`.trim();
    document.getElementById('patientChartSubtitle').textContent =
      [p.email, p.phone, p.bloodType !== 'unknown' ? `Blood type: ${p.bloodType}` : ''].filter(Boolean).join(' · ');
    renderPatientHistory(history);
    loadAiSummary();
  } catch (err) {
    document.getElementById('patientHistoryContent').innerHTML =
      `<p class="empty-state">${err.message}</p>`;
  }
};

function closePatientChart() {
  document.getElementById('patientChartModal').hidden = true;
  chartPatientId = null;
}

async function loadAiSummary() {
  if (!chartPatientId) return;
  const el = document.getElementById('aiSummaryContent');
  el.innerHTML = '<p class="text-muted text-small">Generating AI summary…</p>';

  try {
    const data = await DoctorAPI.request(`/api/doctor/patients/${chartPatientId}/summary`);
    const s = data.summary;
    el.innerHTML = `
      <p class="ai-summary-headline">${esc(s.headline)}</p>
      <p class="ai-summary-text">${esc(s.summary)}</p>
      ${s.keyAlerts?.length ? `
        <h4 class="text-small" style="margin:0 0 0.35rem">Key alerts</h4>
        <ul class="ai-summary-list">${s.keyAlerts.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      ` : ''}
      ${s.suggestedFocus?.length ? `
        <h4 class="text-small" style="margin:0.75rem 0 0.35rem">Suggested focus</h4>
        <ul class="ai-summary-list">${s.suggestedFocus.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      ` : ''}
      <span class="ai-badge">${s.provider === 'openai' ? 'AI generated' : 'Rule-based summary'} · ${new Date(s.generatedAt).toLocaleString()}</span>`;
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function renderPatientHistory(history) {
  const el = document.getElementById('patientHistoryContent');
  const sections = [];

  if (history.patient.allergies?.length) {
    sections.push(`
      <div class="history-section">
        <h4>Allergies</h4>
        ${history.patient.allergies.map((a) =>
          `<div class="history-item"><strong>${esc(a.allergen)}</strong> — ${a.severity}${a.reaction ? ` · ${esc(a.reaction)}` : ''}</div>`
        ).join('')}
      </div>`);
  }

  if (history.patient.medications?.length) {
    sections.push(`
      <div class="history-section">
        <h4>Medications</h4>
        ${history.patient.medications.map((m) =>
          `<div class="history-item"><strong>${esc(m.name)}</strong> ${esc(m.dosage || '')} ${esc(m.frequency || '')}</div>`
        ).join('')}
      </div>`);
  }

  if (history.patient.medicalHistory?.length) {
    sections.push(`
      <div class="history-section">
        <h4>Medical history</h4>
        ${history.patient.medicalHistory.map((h) =>
          `<div class="history-item"><strong>${esc(h.condition)}</strong> — ${h.status}</div>`
        ).join('')}
      </div>`);
  }

  if (history.assessments?.length) {
    sections.push(`
      <div class="history-section">
        <h4>Symptom assessments</h4>
        ${history.assessments.map((a) =>
          `<div class="history-item">
            <strong>${new Date(a.createdAt).toLocaleDateString()}</strong> — ${a.urgency} · ${esc(a.department)}
            <br><span class="text-muted">${esc(a.recommendationTitle)}</span>
          </div>`
        ).join('')}
      </div>`);
  }

  if (history.notes?.length) {
    sections.push(`
      <div class="history-section">
        <h4>Clinical notes</h4>
        ${history.notes.map((n) =>
          `<div class="history-item">
            <strong>${esc(n.title)}</strong> · ${esc(n.doctorName || '')} · ${new Date(n.createdAt).toLocaleString()}
            <p class="text-small">${esc(n.content)}</p>
          </div>`
        ).join('')}
      </div>`);
  }

  if (history.records?.length) {
    sections.push(`
      <div class="history-section">
        <h4>Prescriptions, tests &amp; referrals</h4>
        ${history.records.map((r) =>
          `<div class="history-item">
            <strong>${esc(r.title)}</strong> (${r.type}) · ${new Date(r.createdAt).toLocaleDateString()}
          </div>`
        ).join('')}
      </div>`);
  }

  if (history.appointments?.length) {
    sections.push(`
      <div class="history-section">
        <h4>Appointments</h4>
        ${history.appointments.slice(0, 8).map((a) =>
          `<div class="history-item">
            ${new Date(a.scheduledAt).toLocaleString()} — ${a.status} · ${esc(a.doctorName)}
          </div>`
        ).join('')}
      </div>`);
  }

  el.innerHTML = sections.length
    ? sections.join('')
    : '<p class="empty-state text-small">No history on file yet.</p>';
}

async function submitPatientNote(e) {
  e.preventDefault();
  if (!chartPatientId) return;
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));

  try {
    await DoctorAPI.request(`/api/doctor/patients/${chartPatientId}/notes`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    form.reset();
    const history = await DoctorAPI.request(`/api/doctor/patients/${chartPatientId}/history`);
    renderPatientHistory(history);
  } catch (err) {
    alert(err.message);
  }
}

async function submitConsultNote(e) {
  e.preventDefault();
  if (!activeConsultation) return;
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));

  try {
    await DoctorAPI.request(`/api/doctor/consultations/${activeConsultation._id}/note`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    form.reset();
  } catch (err) {
    alert(err.message);
  }
}

async function enterDoctorRoom(consultation, messages, records) {
  activeConsultation = consultation;
  const patient = consultation.patient || {};

  document.getElementById('doctorDashboard').hidden = true;
  document.getElementById('doctorRoom').hidden = false;

  document.getElementById('doctorRoomTitle').textContent =
    `${consultation.mode} consultation — ${patient?.firstName || ''} ${patient?.lastName || ''}`.trim();
  document.getElementById('doctorPatientInfo').innerHTML = `
    <p><strong>${esc(patient?.firstName || '')} ${esc(patient?.lastName || '')}</strong></p>
    <p class="text-muted text-small">${esc(patient?.email || '')}</p>
    <p class="text-small">${esc(consultation.department)} · ${esc(consultation.reason || '')}</p>
    <button type="button" class="btn btn-outline btn-sm" style="margin-top:0.5rem"
      onclick="openPatientChart('${patient._id}')">View full chart</button>`;

  const isMedia = consultation.mode === 'video' || consultation.mode === 'voice';
  document.getElementById('doctorVideoPanel').hidden = !isMedia;
  document.getElementById('doctorVideoPanel').classList.toggle('voice-only', consultation.mode === 'voice');

  renderDoctorChat(messages);
  renderDoctorRecords(records);

  await connectDoctorSocket(consultation);
  if (isMedia) await setupDoctorMedia(consultation.mode);
}

async function connectDoctorSocket(consultation) {
  doctorSocket?.disconnect();

  doctorSocket = io({
    auth: { token: DoctorAPI.getToken(), role: 'doctor' },
  });

  doctorSocket.on('connect', () => {
    doctorSocket.emit('join-consultation', { roomId: consultation.roomId });
  });

  doctorSocket.on('chat-message', (m) => {
    const box = document.getElementById('doctorChatMessages');
    box.insertAdjacentHTML('beforeend', renderChatLine(m));
    box.scrollTop = box.scrollHeight;
  });

  doctorSocket.on('webrtc-offer', async ({ offer }) => {
    if (!doctorWebRTC) return;
    doctorWebRTC.onIceCandidate = (candidate) => {
      doctorSocket.emit('webrtc-ice-candidate', { roomId: consultation.roomId, candidate });
    };
    const answer = await doctorWebRTC.handleOffer(offer);
    doctorSocket.emit('webrtc-answer', { roomId: consultation.roomId, answer });
  });

  doctorSocket.on('webrtc-ice-candidate', async ({ candidate }) => {
    if (doctorWebRTC) await doctorWebRTC.addIceCandidate(candidate);
  });
}

async function setupDoctorMedia(mode) {
  doctorWebRTC = new WebRTCClient({
    onRemoteStream: (stream) => {
      const v = document.getElementById('doctorRemoteVideo');
      v.srcObject = stream;
      v.hidden = mode === 'voice';
    },
    onConnectionStateChange: (s) => {
      document.getElementById('doctorConnectionStatus').textContent = `Connection: ${s}`;
    },
  });

  try {
    const local = await doctorWebRTC.initLocalStream(mode);
    const lv = document.getElementById('doctorLocalVideo');
    if (local && mode === 'video') { lv.srcObject = local; lv.hidden = false; }
    else lv.hidden = true;
    doctorWebRTC.createPeerConnection();
  } catch {
    document.getElementById('doctorConnectionStatus').textContent = 'Media access denied';
  }
}

function renderDoctorChat(messages) {
  document.getElementById('doctorChatMessages').innerHTML =
    (messages || []).map(renderChatLine).join('');
}

function renderChatLine(m) {
  const cls = m.senderType === 'doctor' ? 'chat-msg-doctor' : 'chat-msg-patient';
  return `<div class="chat-msg ${cls}"><span class="chat-msg-sender">${esc(m.senderName || m.senderType)}</span><p>${esc(m.content)}</p></div>`;
}

function sendDoctorChat(e) {
  e.preventDefault();
  const input = document.getElementById('doctorChatInput');
  const content = input.value.trim();
  if (!content || !doctorSocket || !activeConsultation) return;
  doctorSocket.emit('chat-message', { roomId: activeConsultation.roomId, content });
  input.value = '';
}

async function submitClinical(e, type) {
  e.preventDefault();
  if (!activeConsultation) return;
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));

  try {
    await DoctorAPI.request(`/api/doctor/consultations/${activeConsultation._id}/${type}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    form.reset();
    refreshDoctorRecords();
    doctorSocket?.emit('consultation-updated', { roomId: activeConsultation.roomId, type });
  } catch (err) {
    alert(err.message);
  }
}

async function submitFile(e) {
  e.preventDefault();
  if (!activeConsultation) return;
  const form = e.target;
  const fd = new FormData(form);

  try {
    await DoctorAPI.request(`/api/doctor/consultations/${activeConsultation._id}/file`, {
      method: 'POST',
      body: fd,
    });
    form.reset();
    refreshDoctorRecords();
    doctorSocket?.emit('consultation-updated', { roomId: activeConsultation.roomId, type: 'file' });
  } catch (err) {
    alert(err.message);
  }
}

async function refreshDoctorRecords() {
  if (!activeConsultation) return;
  try {
    const data = await DoctorAPI.request(`/api/doctor/consultations/${activeConsultation._id}`);
    renderDoctorRecords(data.records);
  } catch { /* ignore */ }
}

function renderDoctorRecords(records) {
  const el = document.getElementById('doctorClinicalRecords');
  if (!records?.length) {
    el.innerHTML = '<p class="text-small text-muted">Nothing sent yet.</p>';
    return;
  }
  el.innerHTML = records.map((r) =>
    `<p class="text-small"><strong>${esc(r.title)}</strong> (${r.type}) · ${new Date(r.createdAt).toLocaleString()}</p>`
  ).join('');
}

async function endDoctorConsultation() {
  if (!activeConsultation || !confirm('End this consultation?')) return;
  try {
    await DoctorAPI.request(`/api/doctor/consultations/${activeConsultation._id}/end`, { method: 'PATCH' });
    teardownDoctorRoom();
    showDashboard();
  } catch (err) {
    alert(err.message);
  }
}

function teardownDoctorRoom() {
  doctorSocket?.disconnect();
  doctorSocket = null;
  doctorWebRTC?.stop();
  doctorWebRTC = null;
  activeConsultation = null;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
