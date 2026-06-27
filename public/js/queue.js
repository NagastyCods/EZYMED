let queuePollTimer = null;
let lastNotificationKey = '';
let queueInitialized = false;

function initVirtualQueue() {
  if (queueInitialized) return;
  queueInitialized = true;

  document.getElementById('queueJoinForm').addEventListener('submit', handleJoinQueue);
  document.getElementById('queueLeaveBtn').addEventListener('click', handleLeaveQueue);
  document.getElementById('queueRefreshBtn').addEventListener('click', refreshQueueStatus);

  loadQueueDepartments();
  refreshQueueStatus();
  loadQueueHistory();

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      if (item.dataset.section === 'queue') startQueuePolling();
      else stopQueuePolling();
    });
  });

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

async function loadQueueDepartments() {
  try {
    const data = await API.request('/api/queue/departments');
    const select = document.getElementById('queueDepartment');
    select.innerHTML = data.departments
      .map((d) => `<option value="${d}">${d}</option>`)
      .join('');
  } catch {
    document.getElementById('queueDepartment').innerHTML =
      '<option value="General Medicine">General Medicine</option>';
  }
}

function startQueuePolling() {
  stopQueuePolling();
  queuePollTimer = setInterval(refreshQueueStatus, 10000);
}

function stopQueuePolling() {
  if (queuePollTimer) {
    clearInterval(queuePollTimer);
    queuePollTimer = null;
  }
}

async function refreshQueueStatus() {
  try {
    const data = await API.request('/api/queue/status');
    renderQueueStatus(data.queue, data.inQueue);
  } catch (err) {
    showAlert(document.getElementById('queueJoinAlert'), err.message);
  }
}

function renderQueueStatus(queue, inQueue) {
  const joinPanel = document.getElementById('queueJoinPanel');
  const statusPanel = document.getElementById('queueStatusPanel');

  if (!inQueue || !queue) {
    joinPanel.hidden = false;
    statusPanel.hidden = true;
    return;
  }

  joinPanel.hidden = true;
  statusPanel.hidden = false;

  document.getElementById('queueNumber').textContent = queue.queueNumber;
  document.getElementById('queuePosition').textContent = queue.status === 'waiting'
    ? `#${queue.position}`
    : '—';
  document.getElementById('queueWaitTime').textContent = queue.estimatedWaitMinutes > 0
    ? `~${queue.estimatedWaitMinutes} min`
    : queue.status === 'called' ? 'Now' : '0 min';
  document.getElementById('queueAhead').textContent = queue.status === 'waiting'
    ? queue.aheadCount
    : '0';
  document.getElementById('queueDoctor').textContent = queue.doctorName || 'Assigning soon…';
  document.getElementById('queueDepartmentLabel').textContent =
    `${queue.department}${queue.reason ? ` · ${queue.reason}` : ''}`;

  const statusMap = {
    waiting: ['Waiting', 'badge-info'],
    called: ['Called — your turn!', 'badge-warning'],
    in_consultation: ['In consultation', 'badge-success'],
  };
  const [label, badgeClass] = statusMap[queue.status] || ['Active', 'badge-muted'];
  document.getElementById('queueStatusBadge').innerHTML =
    `<span class="badge ${badgeClass}">${label}</span>`;

  const doctorCard = document.getElementById('queueDoctorCard');
  doctorCard.classList.toggle('queue-doctor-ready', queue.status === 'called');

  handleQueueNotifications(queue);
}

function handleQueueNotifications(queue) {
  const banner = document.getElementById('queueNotification');
  const notifications = queue.notifications || [];

  if (!notifications.length) {
    banner.hidden = true;
    return;
  }

  const primary = notifications.find((n) => n.type === 'called')
    || notifications.find((n) => n.type === 'almost_turn')
    || notifications[0];

  const key = `${primary.type}-${queue.position}-${queue.status}`;
  if (key !== lastNotificationKey) {
    lastNotificationKey = key;
    showBrowserNotification(primary.title, primary.message);
  }

  banner.hidden = false;
  banner.className = `queue-notification queue-notification-${primary.type}`;
  banner.innerHTML = `
    <strong>${primary.title}</strong>
    <p>${primary.message}</p>
  `;
}

function showBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(`EZYMED — ${title}`, { body, icon: '/favicon.ico' });
  } catch {
    /* ignore */
  }
}

async function handleJoinQueue(e) {
  e.preventDefault();
  const form = e.target;
  const alertBox = document.getElementById('queueJoinAlert');
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    await API.request('/api/queue/join', {
      method: 'POST',
      body: JSON.stringify({
        department: form.department.value,
        reason: form.reason.value.trim(),
        urgency: form.urgency.value,
      }),
    });

    showAlert(alertBox, 'You have joined the virtual queue!', 'success');
    form.reset();
    await refreshQueueStatus();
    loadQueueHistory();
    startQueuePolling();
  } catch (err) {
    showAlert(alertBox, err.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleLeaveQueue() {
  if (!confirm('Leave the virtual queue?')) return;

  try {
    await API.request('/api/queue/leave', { method: 'DELETE' });
    lastNotificationKey = '';
    document.getElementById('queueNotification').hidden = true;
    await refreshQueueStatus();
    loadQueueHistory();
    stopQueuePolling();
  } catch (err) {
    alert(err.message);
  }
}

async function loadQueueHistory() {
  const list = document.getElementById('queueHistoryList');
  try {
    const data = await API.request('/api/queue/history');
    if (!data.history?.length) {
      list.innerHTML = '<p class="empty-state">No queue history yet.</p>';
      return;
    }

    list.innerHTML = data.history.map((q) => `
      <div class="list-card">
        <div class="list-card-main">
          <strong>${q.queueNumber}</strong>
          ${queueStatusBadge(q.status)}
          <p class="text-muted">${q.department} · ${formatDateTime(q.joinedAt)}</p>
          ${q.doctorName ? `<p class="text-small">${q.doctorName}</p>` : ''}
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<p class="empty-state">Unable to load queue history.</p>';
  }
}

function queueStatusBadge(status) {
  const map = {
    waiting: 'badge-info',
    called: 'badge-warning',
    in_consultation: 'badge-success',
    completed: 'badge-success',
    cancelled: 'badge-muted',
  };
  return `<span class="badge ${map[status] || 'badge-muted'}">${capitalize(status.replace('_', ' '))}</span>`;
}

window.joinVirtualQueue = (department, urgency, reason) => {
  document.querySelector('[data-section=queue]').click();
  setTimeout(() => {
    const form = document.getElementById('queueJoinForm');
    if (department) form.department.value = department;
    if (urgency) form.urgency.value = urgency;
    if (reason) form.reason.value = reason;
  }, 100);
};
