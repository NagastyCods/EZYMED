const bookingState = {
  department: '',
  doctorId: '',
  doctorName: '',
  date: '',
  scheduledAt: '',
  type: 'virtual',
  urgency: 'routine',
  reason: '',
  rescheduleId: null,
};

let reminderTimer = null;
let appointmentsInitialized = false;

function initAppointments() {
  if (appointmentsInitialized) return;
  appointmentsInitialized = true;

  document.getElementById('bookAppointmentBtn').addEventListener('click', () => openBookingWizard());
  document.getElementById('bookingDepartment').addEventListener('change', onDepartmentChange);
  document.getElementById('bookingDate').addEventListener('change', onDateChange);
  document.getElementById('bookingForm').addEventListener('submit', handleBookSubmit);
  document.getElementById('bookingCancelWizard').addEventListener('click', closeBookingWizard);

  loadDepartments();
  loadAppointments();
  checkReminders();

  reminderTimer = setInterval(checkReminders, 5 * 60 * 1000);

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      if (item.dataset.section === 'appointments') checkReminders();
    });
  });
}

async function loadDepartments() {
  try {
    const data = await API.request('/api/appointments/departments');
    const select = document.getElementById('bookingDepartment');
    select.innerHTML = '<option value="">Select department</option>' +
      data.departments.map((d) => `<option value="${d}">${d}</option>`).join('');
  } catch {
    /* ignore */
  }
}

async function checkReminders() {
  try {
    const data = await API.request('/api/appointments/reminders');
    renderReminders(data.reminders || []);
  } catch {
    /* ignore */
  }
}

function renderReminders(reminders) {
  const banner = document.getElementById('appointmentReminders');
  const overviewBanner = document.getElementById('overviewReminders');

  if (!reminders.length) {
    banner.hidden = true;
    if (overviewBanner) overviewBanner.hidden = true;
    return;
  }

  const html = reminders.map((r) => `
    <div class="reminder-item reminder-${r.type}">
      <strong>${r.title}</strong>
      <p>${r.message}</p>
    </div>
  `).join('');

  banner.innerHTML = html;
  banner.hidden = false;

  if (overviewBanner) {
    overviewBanner.innerHTML = html;
    overviewBanner.hidden = false;
  }

  reminders.forEach((r) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`EZYMED — ${r.title}`, { body: r.message });
      } catch { /* ignore */ }
    }
  });
}

function openBookingWizard(prefill = {}) {
  bookingState.department = prefill.department || '';
  bookingState.doctorId = '';
  bookingState.doctorName = '';
  bookingState.date = '';
  bookingState.scheduledAt = '';
  bookingState.type = prefill.type || 'virtual';
  bookingState.urgency = prefill.urgency || 'routine';
  bookingState.reason = prefill.reason || '';
  bookingState.rescheduleId = prefill.rescheduleId || null;

  document.getElementById('bookingWizard').hidden = false;
  document.getElementById('bookingWizardTitle').textContent =
    bookingState.rescheduleId ? 'Reschedule appointment' : 'Book an appointment';
  document.getElementById('bookingSubmitBtn').textContent =
    bookingState.rescheduleId ? 'Confirm reschedule' : 'Confirm booking';

  const deptSelect = document.getElementById('bookingDepartment');
  if (bookingState.department) deptSelect.value = bookingState.department;

  document.getElementById('bookingReason').value = bookingState.reason;
  document.getElementById('bookingType').value = bookingState.type;
  document.getElementById('bookingUrgency').value = bookingState.urgency;

  document.getElementById('bookingAlert').innerHTML = '';
  document.getElementById('doctorList').innerHTML = '';
  document.getElementById('slotGrid').innerHTML = '';
  document.getElementById('bookingDate').innerHTML = '<option value="">Select a date</option>';

  if (bookingState.department) onDepartmentChange();

  document.querySelector('[data-section=appointments]')?.click();
  document.getElementById('bookingWizard').scrollIntoView({ behavior: 'smooth' });
}

window.openBookingWithPrefill = (department, urgency, reason) => {
  openBookingWizard({ department, urgency, reason });
};

function closeBookingWizard() {
  document.getElementById('bookingWizard').hidden = true;
  bookingState.rescheduleId = null;
}

async function onDepartmentChange() {
  const department = document.getElementById('bookingDepartment').value;
  bookingState.department = department;
  bookingState.doctorId = '';
  bookingState.scheduledAt = '';

  const doctorList = document.getElementById('doctorList');
  const dateSelect = document.getElementById('bookingDate');
  document.getElementById('slotGrid').innerHTML = '';

  if (!department) {
    doctorList.innerHTML = '';
    return;
  }

  try {
    const data = await API.request(`/api/appointments/doctors?department=${encodeURIComponent(department)}`);
    doctorList.innerHTML = data.doctors.map((d) => `
      <button type="button" class="doctor-card" data-doctor-id="${d.id}" data-doctor-name="${d.name}">
        <span class="doctor-card-icon">👨‍⚕️</span>
        <div>
          <strong>${d.name}</strong>
          <p class="text-small">${d.title}</p>
          <p class="text-small text-muted">${d.hours}</p>
        </div>
      </button>
    `).join('');

    doctorList.querySelectorAll('.doctor-card').forEach((btn) => {
      btn.addEventListener('click', () => selectDoctor(btn));
    });
  } catch (err) {
    doctorList.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }

  dateSelect.innerHTML = '<option value="">Select a date</option>';
}

async function selectDoctor(btn) {
  document.querySelectorAll('.doctor-card').forEach((el) => el.classList.remove('selected'));
  btn.classList.add('selected');

  bookingState.doctorId = btn.dataset.doctorId;
  bookingState.doctorName = btn.dataset.doctorName;
  bookingState.scheduledAt = '';

  await loadAvailableDates();
  document.getElementById('slotGrid').innerHTML = '';
}

async function loadAvailableDates() {
  const dateSelect = document.getElementById('bookingDate');
  dateSelect.innerHTML = '<option value="">Loading dates…</option>';

  try {
    const data = await API.request(
      `/api/appointments/availability?doctorId=${bookingState.doctorId}`
    );

    const options = data.availability
      .filter((day) => day.availableCount > 0)
      .map((day) => `<option value="${day.date}">${day.dayName}, ${formatDate(day.date)} (${day.availableCount} slots)</option>`)
      .join('');

    dateSelect.innerHTML = options
      ? `<option value="">Select a date</option>${options}`
      : '<option value="">No availability in the next 14 days</option>';
  } catch (err) {
    dateSelect.innerHTML = `<option value="">${err.message}</option>`;
  }
}

async function onDateChange() {
  const date = document.getElementById('bookingDate').value;
  bookingState.date = date;
  bookingState.scheduledAt = '';

  const slotGrid = document.getElementById('slotGrid');
  if (!date || !bookingState.doctorId) {
    slotGrid.innerHTML = '';
    return;
  }

  slotGrid.innerHTML = '<p class="text-muted">Loading time slots…</p>';

  try {
    const data = await API.request(
      `/api/appointments/availability?doctorId=${bookingState.doctorId}&date=${date}`
    );

    const day = data.availability[0];
    const available = day?.slots.filter((s) => s.available) || [];

    if (!available.length) {
      slotGrid.innerHTML = '<p class="empty-state">No slots available on this date.</p>';
      return;
    }

    slotGrid.innerHTML = available.map((s) => `
      <button type="button" class="slot-btn" data-time="${s.time}">${s.label}</button>
    `).join('');

    slotGrid.querySelectorAll('.slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        slotGrid.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        bookingState.scheduledAt = btn.dataset.time;
      });
    });
  } catch (err) {
    slotGrid.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

async function handleBookSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('bookingAlert');
  const btn = document.getElementById('bookingSubmitBtn');

  if (!bookingState.doctorId || !bookingState.scheduledAt) {
    showAlert(alertBox, 'Please select a doctor, date, and time slot.');
    return;
  }

  btn.disabled = true;

  try {
    const body = {
      doctorId: bookingState.doctorId,
      scheduledAt: bookingState.scheduledAt,
      type: document.getElementById('bookingType').value,
      urgency: document.getElementById('bookingUrgency').value,
      reason: document.getElementById('bookingReason').value.trim(),
      department: bookingState.department,
    };

    if (bookingState.rescheduleId) {
      await API.request(`/api/appointments/${bookingState.rescheduleId}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduledAt: body.scheduledAt, doctorId: body.doctorId }),
      });
      showAlert(alertBox, 'Appointment rescheduled successfully!', 'success');
    } else {
      await API.request('/api/appointments', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      showAlert(alertBox, 'Appointment booked successfully!', 'success');
    }

    closeBookingWizard();
    loadAppointments();
    checkReminders();
  } catch (err) {
    showAlert(alertBox, err.message);
  } finally {
    btn.disabled = false;
  }
}

async function loadAppointments() {
  const upcomingEl = document.getElementById('upcomingAppointments');
  const pastEl = document.getElementById('pastAppointments');

  try {
    const data = await API.request('/api/appointments');
    const now = new Date();
    const upcoming = data.appointments.filter(
      (a) => a.status === 'scheduled' && new Date(a.scheduledAt) >= now
    );
    const past = data.appointments.filter(
      (a) => a.status !== 'scheduled' || new Date(a.scheduledAt) < now
    );

    upcomingEl.innerHTML = upcoming.length
      ? upcoming.map(renderAppointmentCard).join('')
      : '<p class="empty-state">No upcoming appointments.</p>';

    pastEl.innerHTML = past.length
      ? past.map(renderAppointmentCard).join('')
      : '<p class="empty-state">No past appointments.</p>';
  } catch (err) {
    upcomingEl.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function renderAppointmentCard(a) {
  const isScheduled = a.status === 'scheduled' && new Date(a.scheduledAt) >= new Date();
  return `
    <div class="list-card appointment-card">
      <div class="list-card-main">
        <strong>${a.doctorName || 'Doctor TBD'}</strong>
        ${statusBadge(a.status)}
        ${statusBadge(a.urgency)}
        <p class="text-muted">${a.department} · ${capitalize(a.type)}</p>
        <p class="text-muted">${formatDateTime(a.scheduledAt)} · ${a.durationMinutes || 30} min</p>
        ${a.reason ? `<p class="text-small">${a.reason}</p>` : ''}
      </div>
      ${isScheduled ? `
        <div class="list-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="rescheduleAppointment('${a._id}', '${a.department}', '${a.doctorId || ''}')">Reschedule</button>
          <button class="btn btn-ghost btn-sm text-danger" onclick="cancelAppointment('${a._id}')">Cancel</button>
        </div>
      ` : ''}
    </div>
  `;
}

window.cancelAppointment = async (id) => {
  if (!confirm('Cancel this appointment?')) return;
  try {
    await API.request(`/api/appointments/${id}/cancel`, { method: 'PATCH' });
    loadAppointments();
    checkReminders();
  } catch (err) {
    alert(err.message);
  }
};

window.rescheduleAppointment = (id, department, doctorId) => {
  openBookingWizard({ rescheduleId: id, department });
};
