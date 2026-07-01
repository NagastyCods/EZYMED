let pharmacyOrdersInitialized = false;

function initPharmacyOrders() {
  if (pharmacyOrdersInitialized) return;
  pharmacyOrdersInitialized = true;
  loadPharmacyOrders();
}

async function loadPharmacyOrders() {
  const el = document.getElementById('pharmacyOrdersList');
  if (!el) return;

  try {
    const data = await API.request('/api/patient/pharmacy-orders');
    if (!data.orders?.length) {
      el.innerHTML = '<p class="empty-state">No pharmacy orders yet. Prescriptions from your doctor will appear here.</p>';
      return;
    }

    el.innerHTML = data.orders.map((o) => {
      const notified = o.patientNotifiedAt
        ? `<div class="pharmacy-notification-banner"><strong>Pharmacy update</strong><p>${escPharm(o.notificationMessage)}</p><span class="text-small text-muted">${new Date(o.patientNotifiedAt).toLocaleString()}</span></div>`
        : '';

      return `
        <div class="list-card">
          <div class="list-card-main">
            <strong>${escPharm(o.medication)}</strong> ${pharmacyStatusBadge(o.status)}
            <p class="text-muted text-small">${escPharm(o.doctorName || 'Doctor')} · ${new Date(o.createdAt).toLocaleDateString()}</p>
            <p class="text-small">${[o.dosage, o.frequency, o.duration].filter(Boolean).join(' · ')}</p>
            ${notified}
            ${o.deliveryMethod ? `<p class="text-small">Fulfillment: ${escPharm(o.deliveryMethod)}${o.deliveryAddress ? ` · ${escPharm(o.deliveryAddress)}` : ''}</p>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function pharmacyStatusBadge(status) {
  const map = {
    received: 'badge-info', verified: 'badge-info', preparing: 'badge-warning',
    ready: 'badge-success', out_for_delivery: 'badge-warning', completed: 'badge-success',
  };
  const label = (status || '').replace(/_/g, ' ');
  return `<span class="badge ${map[status] || 'badge-muted'}">${label}</span>`;
}

function escPharm(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
