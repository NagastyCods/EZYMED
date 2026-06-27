const HospitalAPI = {
  getToken() { return localStorage.getItem('ezymed_hospital_token'); },
  setToken(t) { localStorage.setItem('ezymed_hospital_token', t); },
  clearToken() { localStorage.removeItem('ezymed_hospital_token'); },

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  },
};

let refreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  if (HospitalAPI.getToken()) showDashboard();
  else showLogin();

  document.getElementById('hospitalLoginForm').addEventListener('submit', handleLogin);
  document.getElementById('hospitalLogoutBtn').addEventListener('click', () => {
    stopRefresh();
    HospitalAPI.clearToken();
    showLogin();
  });
  document.getElementById('refreshDashboardBtn').addEventListener('click', loadDashboard);
});

function showLogin() {
  document.getElementById('hospitalLogin').hidden = false;
  document.getElementById('hospitalDashboard').hidden = true;
  document.getElementById('hospitalNav').hidden = true;
  document.getElementById('hospitalLoginAlert').innerHTML = '';
  document.getElementById('hospitalLoginForm').reset();
}

function showDashboard() {
  document.getElementById('hospitalLogin').hidden = true;
  document.getElementById('hospitalDashboard').hidden = false;
  document.getElementById('hospitalNav').hidden = false;
  document.getElementById('hospitalLoginAlert').innerHTML = '';
  loadDashboard();
  startRefresh();
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const alertBox = document.getElementById('hospitalLoginAlert');

  try {
    const data = await HospitalAPI.request('/api/hospital/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.email.value, password: form.password.value }),
    });
    HospitalAPI.setToken(data.token);
    showDashboard();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

function startRefresh() {
  stopRefresh();
  refreshTimer = setInterval(loadDashboard, 15000);
}

function stopRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
}

async function loadDashboard() {
  try {
    const data = await HospitalAPI.request('/api/hospital/dashboard');
    renderDashboard(data);
    document.getElementById('lastUpdated').textContent =
      `Updated ${new Date(data.generatedAt).toLocaleTimeString()}`;
  } catch (err) {
    if (err.message.includes('authentication') || err.message.includes('token')) {
      HospitalAPI.clearToken();
      showLogin();
    }
  }
}

function renderDashboard(data) {
  renderKPIs(data.summary);
  renderLiveQueue(data.liveQueue);
  renderConsultations(data.activeConsultations);
  renderWaitingTimes(data.waitingTimes);
  renderDoctors(data.doctorAvailability);
  renderBeds(data.bedOccupancy);
  renderAppointments(data.dailyAppointments);
  renderAnalytics(data.queueAnalytics);
  renderSatisfaction(data.patientSatisfaction);
}

function renderKPIs(s) {
  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card"><span class="kpi-value">${s.queueSize}</span><span class="kpi-label">In queue</span></div>
    <div class="kpi-card kpi-warning"><span class="kpi-value">${s.activeConsultations}</span><span class="kpi-label">Active consultations</span></div>
    <div class="kpi-card kpi-success"><span class="kpi-value">${s.doctorsAvailable}</span><span class="kpi-label">Doctors available</span></div>
    <div class="kpi-card"><span class="kpi-value">${s.doctorsBusy}</span><span class="kpi-label">Doctors in session</span></div>
    <div class="kpi-card"><span class="kpi-value">${s.appointmentsToday}</span><span class="kpi-label">Appointments today</span></div>
    <div class="kpi-card ${s.bedOccupancyRate > 85 ? 'kpi-danger' : ''}"><span class="kpi-value">${s.bedOccupancyRate}%</span><span class="kpi-label">Bed occupancy</span></div>
    <div class="kpi-card kpi-success"><span class="kpi-value">${s.satisfactionScore ?? '—'}${s.satisfactionScore ? '/5' : ''}</span><span class="kpi-label">Satisfaction (30d)</span></div>
  `;
}

function renderLiveQueue(queue) {
  document.getElementById('queueCountBadge').textContent = queue.length;

  if (!queue.length) {
    document.getElementById('liveQueueTable').innerHTML =
      '<p class="empty-state">No patients currently in the virtual queue.</p>';
    return;
  }

  document.getElementById('liveQueueTable').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Queue #</th><th>Patient</th><th>Department</th><th>Status</th><th>Urgency</th><th>Wait</th><th>Doctor</th>
      </tr></thead>
      <tbody>
        ${queue.map((q) => `
          <tr>
            <td><strong>${q.queueNumber}</strong></td>
            <td>${esc(q.patientName)}</td>
            <td>${esc(q.department)}</td>
            <td>${badge(q.status)}</td>
            <td>${badge(q.urgency)}</td>
            <td>${q.waitMinutes} min</td>
            <td>${esc(q.doctorName || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderConsultations(list) {
  const el = document.getElementById('activeConsultationsList');
  if (!list?.length) {
    el.innerHTML = '<p class="empty-state">No active telemedicine sessions.</p>';
    return;
  }

  el.innerHTML = list.map((c) => {
    const p = c.patient || {};
    return `
      <div class="consultation-item">
        <strong>${esc(p.firstName || '')} ${esc(p.lastName || '')}</strong>
        ${badge(c.mode)} ${badge(c.status)}
        <p class="text-muted text-small">${esc(c.department || '')} · ${esc(c.doctorName || 'Awaiting doctor')}</p>
        <p class="text-small">${c.reason || 'No reason given'}</p>
      </div>`;
  }).join('');
}

function renderWaitingTimes(times) {
  const el = document.getElementById('waitingTimesChart');
  if (!times?.length) {
    el.innerHTML = '<p class="empty-state">No patients waiting.</p>';
    return;
  }

  const maxWait = Math.max(...times.map((t) => t.maxWaitMinutes), 1);

  el.innerHTML = times.map((t) => {
    const pct = Math.min(100, Math.round((t.avgWaitMinutes / maxWait) * 100));
    const high = t.avgWaitMinutes > 30;
    return `
      <div class="wait-bar-row">
        <div class="wait-bar-header">
          <span><strong>${esc(t.department)}</strong> (${t.patientsWaiting} waiting)</span>
          <span>Avg ${t.avgWaitMinutes} min · Max ${t.maxWaitMinutes} min</span>
        </div>
        <div class="wait-bar-track">
          <div class="wait-bar-fill ${high ? 'high' : ''}" style="width:${pct}%"></div>
        </div>
        ${t.urgentCases ? `<p class="text-small text-danger">${t.urgentCases} urgent case(s)</p>` : ''}
      </div>`;
  }).join('');
}

function renderDoctors(doctors) {
  const el = document.getElementById('doctorAvailabilityList');
  const order = { available: 0, in_consultation: 1, off_duty: 2 };
  const sorted = [...doctors].sort((a, b) => order[a.status] - order[b.status]);

  el.innerHTML = sorted.map((d) => `
    <div class="doctor-status-row">
      <div>
        <span class="status-dot ${d.status}"></span>
        <strong>${esc(d.name)}</strong>
        <p class="text-small text-muted">${esc(d.department)} · ${d.hours}</p>
      </div>
      ${badge(d.status.replace('_', ' '))}
    </div>`).join('');
}

function renderBeds(data) {
  const el = document.getElementById('bedOccupancyPanel');
  const summary = data.summary;

  el.innerHTML = `
    <p class="text-small text-muted" style="margin-bottom:1rem;">
      Hospital-wide: <strong>${summary.occupiedBeds}/${summary.totalBeds}</strong> beds occupied (${summary.occupancyRate}%)
    </p>
    ${data.wards.map((w) => `
      <div class="bed-ward-row">
        <div class="bed-ward-header">
          <span>${esc(w.name)}</span>
          <span>${w.occupiedBeds}/${w.totalBeds} (${w.occupancyRate}%)</span>
        </div>
        <div class="wait-bar-track">
          <div class="wait-bar-fill ${w.occupancyRate > 85 ? 'high' : ''}" style="width:${w.occupancyRate}%"></div>
        </div>
        <div class="bed-controls">
          <label class="text-small">Update occupied:</label>
          <input type="number" min="0" max="${w.totalBeds}" value="${w.occupiedBeds}" data-ward="${w.id}">
          <button type="button" class="btn btn-ghost btn-sm" onclick="updateBeds('${w.id}', this)">Save</button>
        </div>
      </div>`).join('')}`;
}

window.updateBeds = async (wardId, btn) => {
  const input = btn.previousElementSibling;
  try {
    await HospitalAPI.request(`/api/hospital/beds/${wardId}`, {
      method: 'PATCH',
      body: JSON.stringify({ occupiedBeds: Number(input.value) }),
    });
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
};

function renderAppointments(data) {
  document.getElementById('dailyAppointmentsSummary').innerHTML = `
    <span class="mini-stat">Total: <strong>${data.summary.total}</strong></span>
    <span class="mini-stat">Scheduled: <strong>${data.summary.scheduled}</strong></span>
    <span class="mini-stat">Completed: <strong>${data.summary.completed}</strong></span>
    <span class="mini-stat">Virtual: <strong>${data.summary.virtual}</strong></span>
    <span class="mini-stat">Cancelled: <strong>${data.summary.cancelled}</strong></span>
  `;

  const el = document.getElementById('dailyAppointmentsList');
  if (!data.appointments?.length) {
    el.innerHTML = '<p class="empty-state">No appointments scheduled for today.</p>';
    return;
  }

  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Time</th><th>Patient</th><th>Doctor</th><th>Dept</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>
        ${data.appointments.map((a) => `
          <tr>
            <td>${new Date(a.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</td>
            <td>${esc(a.patientName)}</td>
            <td>${esc(a.doctorName)}</td>
            <td>${esc(a.department)}</td>
            <td>${esc(a.type)}</td>
            <td>${badge(a.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAnalytics(a) {
  const el = document.getElementById('queueAnalyticsPanel');
  const t = a.today;
  const maxHour = Math.max(...a.hourlyVolume.map((h) => h.count), 1);

  el.innerHTML = `
    <div class="analytics-stat-grid">
      <div class="analytics-stat"><div class="value">${t.totalJoined}</div><div class="label">Joined today</div></div>
      <div class="analytics-stat"><div class="value">${t.completed}</div><div class="label">Completed</div></div>
      <div class="analytics-stat"><div class="value">${t.avgWaitMinutes}m</div><div class="label">Avg wait</div></div>
      <div class="analytics-stat"><div class="value">${t.peakHour}</div><div class="label">Peak hour</div></div>
    </div>
    <p class="text-small"><strong>By department:</strong></p>
    ${a.byDepartment.map((d) => `
      <p class="text-small">${esc(d.department)}: ${d.joined} joined, ${d.completed} completed, ${d.waiting} waiting</p>
    `).join('') || '<p class="text-small text-muted">No data yet today.</p>'}
    ${a.hourlyVolume.length ? `
      <p class="text-small" style="margin-top:0.75rem"><strong>Hourly volume:</strong></p>
      <div class="hourly-chart">
        ${a.hourlyVolume.map((h) => `
          <div class="hour-bar-wrap">
            <div class="hour-bar" style="height:${Math.max(4, (h.count / maxHour) * 80)}px" title="${h.count} patients"></div>
            <span class="hour-label">${h.label.replace(':00', '')}</span>
          </div>`).join('')}
      </div>` : ''}`;
}

function renderSatisfaction(s) {
  const el = document.getElementById('satisfactionPanel');
  const avg = s.last30Days.average;
  const maxDist = Math.max(...s.distribution.map((d) => d.count), 1);

  el.innerHTML = `
    <div class="satisfaction-score">
      <div class="score">${avg ?? '—'}</div>
      <div class="out-of">${avg ? 'out of 5 · last 30 days' : 'No ratings yet'}</div>
      <p class="text-small text-muted">${s.last30Days.count} total ratings · ${s.today.count} today</p>
    </div>
    <div class="star-distribution">
      ${s.distribution.slice().reverse().map((d) => `
        <div class="star-row">
          <span>${d.stars}★</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(d.count / maxDist) * 100}%"></div></div>
          <span>${d.count}</span>
        </div>`).join('')}
    </div>
    <p class="text-small"><strong>Recent feedback:</strong></p>
    ${s.recentFeedback.length
      ? s.recentFeedback.map((f) => `
          <div class="feedback-item">
            <strong>${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</strong>
            ${f.comment ? `<p>${esc(f.comment)}</p>` : ''}
            <span class="text-small text-muted">${new Date(f.createdAt).toLocaleDateString()}</span>
          </div>`).join('')
      : '<p class="text-small text-muted">Patients can rate visits after consultations.</p>'}`;
}

function badge(text) {
  const map = {
    waiting: 'badge-info', called: 'badge-warning', 'in_consultation': 'badge-warning',
    active: 'badge-success', scheduled: 'badge-info', completed: 'badge-success',
    cancelled: 'badge-muted', available: 'badge-success', off_duty: 'badge-muted',
    video: 'badge-info', voice: 'badge-info', chat: 'badge-muted',
    urgent: 'badge-danger', emergency: 'badge-danger', routine: 'badge-muted',
  };
  const key = String(text).toLowerCase().replace(' ', '_');
  return `<span class="badge ${map[key] || 'badge-muted'}">${esc(text)}</span>`;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
