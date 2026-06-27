const API = {
  base: '',

  getToken() {
    return localStorage.getItem('ezymed_token');
  },

  setToken(token) {
    localStorage.setItem('ezymed_token', token);
  },

  clearToken() {
    localStorage.removeItem('ezymed_token');
    localStorage.removeItem('ezymed_patient');
  },

  getPatient() {
    const data = localStorage.getItem('ezymed_patient');
    return data ? JSON.parse(data) : null;
  },

  setPatient(patient) {
    localStorage.setItem('ezymed_patient', JSON.stringify(patient));
  },

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${this.base}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  },

  requireAuth() {
    if (!this.getToken()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },
};

function showAlert(container, message, type = 'error') {
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function statusBadge(status) {
  const map = {
    scheduled: 'badge-info',
    completed: 'badge-success',
    cancelled: 'badge-muted',
    'no-show': 'badge-warning',
    active: 'badge-warning',
    resolved: 'badge-success',
    managed: 'badge-info',
    mild: 'badge-success',
    moderate: 'badge-warning',
    severe: 'badge-danger',
    routine: 'badge-muted',
    urgent: 'badge-danger',
    emergency: 'badge-danger',
  };
  return `<span class="badge ${map[status] || 'badge-muted'}">${capitalize(status)}</span>`;
}
