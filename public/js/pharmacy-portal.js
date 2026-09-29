const PharmacyAPI = {
  getToken() { return localStorage.getItem('ezymed_pharmacy_token'); },
  setToken(t) { localStorage.setItem('ezymed_pharmacy_token', t); },
  clearToken() { localStorage.removeItem('ezymed_pharmacy_token'); localStorage.removeItem('ezymed_pharmacy'); },
  getPharmacy() {
    const d = localStorage.getItem('ezymed_pharmacy');
    return d ? JSON.parse(d) : null;
  },
  setPharmacy(p) { localStorage.setItem('ezymed_pharmacy', JSON.stringify(p)); },

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

let currentTab = 'inbox';
let dashboardData = null;
let activeOrderId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (PharmacyAPI.getToken()) showDashboard();
  else showLogin();

  document.getElementById('pharmacyLoginForm').addEventListener('submit', handleLogin);
  document.getElementById('pharmacyMfaForm')?.addEventListener('submit', handlePharmacyMfaLogin);
  document.getElementById('pharmacyLogoutBtn').addEventListener('click', () => {
    PharmacyAPI.clearToken();
    showLogin();
  });
  document.getElementById('refreshPharmacyBtn').addEventListener('click', loadDashboard);
  document.getElementById('closeOrderModalBtn').addEventListener('click', closeOrderModal);
  document.getElementById('orderModalBackdrop').addEventListener('click', closeOrderModal);

  document.querySelectorAll('.pharmacy-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      document.querySelectorAll('.pharmacy-tab').forEach((t) => t.classList.toggle('active', t === tab));
      renderOrders();
    });
  });

  loadPharmacyList();
});

function showLogin() {
  document.getElementById('pharmacyLogin').hidden = false;
  document.getElementById('pharmacyLoginForm').hidden = false;
  document.getElementById('pharmacyDashboard').hidden = true;
  document.getElementById('pharmacyNav').hidden = true;
  document.getElementById('pharmacyLoginAlert').innerHTML = '';
  document.getElementById('pharmacyLoginForm').reset();
  document.getElementById('pharmacyMfaForm')?.reset();
  document.getElementById('pharmacyMfaForm').hidden = true;
  sessionStorage.removeItem('ezymed_pharmacy_mfa_token');
}

function showDashboard() {
  const ph = PharmacyAPI.getPharmacy();
  document.getElementById('pharmacyLogin').hidden = true;
  document.getElementById('pharmacyDashboard').hidden = false;
  document.getElementById('pharmacyNav').hidden = false;
  document.getElementById('pharmacyNameLabel').textContent = ph?.name || '';
  document.getElementById('pharmacyWelcomeTitle').textContent = ph?.name || 'Pharmacy dashboard';
  document.getElementById('pharmacyAddressLabel').textContent = ph?.address || '';
  loadDashboard();
}

async function loadPharmacyList() {
  try {
    const data = await PharmacyAPI.request('/api/pharmacy/list');
    document.getElementById('pharmacyIdSelect').innerHTML = data.pharmacies
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join('');
  } catch { /* ignore */ }
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const alertBox = document.getElementById('pharmacyLoginAlert');
  try {
    const data = await PharmacyAPI.request('/api/pharmacy/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pharmacyId: form.pharmacyId.value, password: form.password.value }),
    });

    if (data.requiresMfa) {
      sessionStorage.setItem('ezymed_pharmacy_mfa_token', data.mfaToken);
      document.getElementById('pharmacyLoginForm').hidden = true;
      document.getElementById('pharmacyMfaForm').hidden = false;
      alertBox.innerHTML = '<div class="alert alert-success">Enter your authenticator code.</div>';
      return;
    }

    PharmacyAPI.setToken(data.token);
    PharmacyAPI.setPharmacy(data.pharmacy);
    showDashboard();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function handlePharmacyMfaLogin(e) {
  e.preventDefault();
  const alertBox = document.getElementById('pharmacyLoginAlert');
  const form = e.target;
  const mfaToken = sessionStorage.getItem('ezymed_pharmacy_mfa_token');

  try {
    const data = await PharmacyAPI.request('/api/security/mfa/verify-login', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code: form.code.value.trim() }),
    });
    sessionStorage.removeItem('ezymed_pharmacy_mfa_token');
    PharmacyAPI.setToken(data.token);
    PharmacyAPI.setPharmacy(data.pharmacy);
    showDashboard();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function loadDashboard() {
  try {
    dashboardData = await PharmacyAPI.request('/api/pharmacy/dashboard');
    renderKpis(dashboardData.stats);
    renderOrders();
  } catch (err) {
    if (err.message.includes('authentication') || err.message.includes('token')) {
      PharmacyAPI.clearToken();
      showLogin();
    }
  }
}

function renderKpis(stats) {
  document.getElementById('pharmacyKpiGrid').innerHTML = [
    { label: 'New Rx', value: stats.received },
    { label: 'Verified', value: stats.verified },
    { label: 'Preparing', value: stats.preparing },
    { label: 'Ready', value: stats.ready },
    { label: 'Out for delivery', value: stats.outForDelivery },
  ].map((k) => `
    <div class="kpi-card">
      <span class="kpi-value">${k.value}</span>
      <span class="kpi-label">${k.label}</span>
    </div>`).join('');
}

function renderOrders() {
  const orders = dashboardData?.orders || [];
  const filtered = orders.filter((o) => {
    if (currentTab === 'inbox') return o.status === 'received';
    if (currentTab === 'active') return ['verified', 'preparing', 'ready'].includes(o.status);
    if (currentTab === 'delivery') return o.status === 'out_for_delivery';
    if (currentTab === 'completed') return o.status === 'completed';
    return true;
  });

  const el = document.getElementById('pharmacyOrdersList');
  if (!filtered.length) {
    el.innerHTML = '<p class="empty-state">No orders in this queue.</p>';
    return;
  }

  el.innerHTML = filtered.map((o) => {
    const patient = o.patient || {};
    return `
      <div class="pharmacy-order-card">
        <div>
          <strong>${esc(o.medication)}</strong> ${statusBadge(o.status)}
          <p class="text-muted text-small">${esc(patient.firstName || '')} ${esc(patient.lastName || 'Patient')} · ${esc(o.doctorName || '')}</p>
          <p class="text-small">${[o.dosage, o.frequency, o.duration].filter(Boolean).join(' · ')}</p>
          ${o.patientNotifiedAt ? `<p class="text-small text-success">Patient notified ${new Date(o.patientNotifiedAt).toLocaleString()}</p>` : ''}
        </div>
        <button class="btn btn-outline btn-sm" onclick="openOrder('${o._id}')">Manage</button>
      </div>`;
  }).join('');
}

window.openOrder = async (id) => {
  activeOrderId = id;
  try {
    const data = await PharmacyAPI.request(`/api/pharmacy/orders/${id}`);
    renderOrderModal(data.order);
    document.getElementById('orderModal').hidden = false;
  } catch (err) {
    alert(err.message);
  }
};

function renderOrderModal(order) {
  const patient = order.patient || {};
  document.getElementById('orderModalTitle').textContent = order.medication;
  document.getElementById('orderModalBody').innerHTML = `
    <div class="order-detail-grid">
      <div><strong>Patient:</strong> ${esc(patient.firstName)} ${esc(patient.lastName)}</div>
      <div><strong>Phone:</strong> ${esc(patient.phone || '—')}</div>
      <div><strong>Doctor:</strong> ${esc(order.doctorName || '—')}</div>
      <div><strong>Status:</strong> ${statusBadge(order.status)}</div>
      <div><strong>Dosage:</strong> ${esc(order.dosage || '—')}</div>
      <div><strong>Frequency:</strong> ${esc(order.frequency || '—')}</div>
      <div><strong>Duration:</strong> ${esc(order.duration || '—')}</div>
      <div><strong>Instructions:</strong> ${esc(order.instructions || '—')}</div>
      ${order.verificationNotes ? `<div><strong>Verification:</strong> ${esc(order.verificationNotes)}</div>` : ''}
      ${order.deliveryMethod ? `<div><strong>Delivery:</strong> ${esc(order.deliveryMethod)} · ${esc(order.deliveryAddress || '')}</div>` : ''}
    </div>
    ${order.status === 'received' ? `
      <div class="form-group">
        <label>Verification notes</label>
        <textarea id="verifyNotes" rows="2" placeholder="Allergies checked, dosage confirmed…"></textarea>
      </div>` : ''}
    ${order.status === 'ready' ? `
      <div class="form-group">
        <label>Delivery method</label>
        <select id="deliveryMethod"><option value="pickup">Patient pickup</option><option value="delivery">Home delivery</option></select>
      </div>
      <div class="form-group"><label>Delivery address</label><input id="deliveryAddress" placeholder="Address for delivery"></div>
      <div class="form-group"><label>Scheduled time</label><input type="datetime-local" id="deliveryScheduledAt"></div>
      <div class="form-group"><label>Delivery notes</label><textarea id="deliveryNotes" rows="2"></textarea></div>
    ` : ''}
    <div class="order-actions">${renderOrderActions(order)}</div>`;
}

function renderOrderActions(order) {
  const actions = [];
  if (order.status === 'received') {
    actions.push(`<button class="btn btn-primary btn-sm" onclick="orderAction('claim')">Claim Rx</button>`);
    actions.push(`<button class="btn btn-primary btn-sm" onclick="orderAction('verify')">Verify medication</button>`);
  }
  if (order.status === 'verified') {
    actions.push(`<button class="btn btn-primary btn-sm" onclick="orderAction('prepare')">Start preparing</button>`);
  }
  if (order.status === 'preparing') {
    actions.push(`<button class="btn btn-primary btn-sm" onclick="orderAction('ready')">Mark ready</button>`);
  }
  if (order.status === 'ready') {
    actions.push(`<button class="btn btn-outline btn-sm" onclick="orderAction('notify')">Notify patient</button>`);
    actions.push(`<button class="btn btn-primary btn-sm" onclick="orderAction('delivery')">Coordinate delivery</button>`);
    actions.push(`<button class="btn btn-outline btn-sm" onclick="orderAction('complete')">Complete (pickup)</button>`);
  }
  if (order.status === 'out_for_delivery') {
    actions.push(`<button class="btn btn-outline btn-sm" onclick="orderAction('notify')">Notify patient</button>`);
    actions.push(`<button class="btn btn-primary btn-sm" onclick="orderAction('complete')">Mark delivered</button>`);
  }
  return actions.join('');
}

window.orderAction = async (action) => {
  if (!activeOrderId) return;
  try {
    if (action === 'claim') {
      await PharmacyAPI.request(`/api/pharmacy/orders/${activeOrderId}/claim`, { method: 'PATCH' });
    } else if (action === 'verify') {
      await PharmacyAPI.request(`/api/pharmacy/orders/${activeOrderId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ verificationNotes: document.getElementById('verifyNotes')?.value || '' }),
      });
    } else if (action === 'prepare') {
      await PharmacyAPI.request(`/api/pharmacy/orders/${activeOrderId}/prepare`, { method: 'PATCH' });
    } else if (action === 'ready') {
      await PharmacyAPI.request(`/api/pharmacy/orders/${activeOrderId}/ready`, { method: 'PATCH' });
    } else if (action === 'delivery') {
      await PharmacyAPI.request(`/api/pharmacy/orders/${activeOrderId}/delivery`, {
        method: 'PATCH',
        body: JSON.stringify({
          deliveryMethod: document.getElementById('deliveryMethod')?.value,
          deliveryAddress: document.getElementById('deliveryAddress')?.value,
          deliveryScheduledAt: document.getElementById('deliveryScheduledAt')?.value,
          deliveryNotes: document.getElementById('deliveryNotes')?.value,
        }),
      });
    } else if (action === 'notify') {
      await PharmacyAPI.request(`/api/pharmacy/orders/${activeOrderId}/notify`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      alert('Patient has been notified.');
    } else if (action === 'complete') {
      await PharmacyAPI.request(`/api/pharmacy/orders/${activeOrderId}/complete`, { method: 'PATCH' });
    }
    closeOrderModal();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
};

function closeOrderModal() {
  document.getElementById('orderModal').hidden = true;
  activeOrderId = null;
}

function statusBadge(status) {
  const map = {
    received: 'badge-info', verified: 'badge-info', preparing: 'badge-warning',
    ready: 'badge-success', out_for_delivery: 'badge-warning', completed: 'badge-success',
  };
  return `<span class="badge ${map[status] || 'badge-muted'}">${esc(status.replace(/_/g, ' '))}</span>`;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
