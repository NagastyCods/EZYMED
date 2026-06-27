let tmSocket = null;
let tmWebRTC = null;
let activeConsultation = null;
let tmInitialized = false;

function initTelemedicine() {
  if (tmInitialized) return;
  tmInitialized = true;

  document.getElementById('tmRequestForm').addEventListener('submit', handleRequestConsultation);
  document.getElementById('tmEndBtn').addEventListener('click', endActiveConsultation);
  document.getElementById('tmChatForm').addEventListener('submit', sendChatMessage);

  refreshTelemedicineState();
  loadClinicalRecords();
}

async function refreshTelemedicineState() {
  try {
    const data = await API.request('/api/consultations/active');
    if (data.hasActive && data.consultation) {
      await enterConsultationRoom(data.consultation);
    } else {
      showConsultationLobby();
    }
  } catch {
    showConsultationLobby();
  }
}

function showConsultationLobby() {
  document.getElementById('tmLobby').hidden = false;
  document.getElementById('tmRoom').hidden = true;
  teardownConsultation();
}

async function handleRequestConsultation(e) {
  e.preventDefault();
  const form = e.target;
  const alertBox = document.getElementById('tmRequestAlert');
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    const data = await API.request('/api/consultations/request', {
      method: 'POST',
      body: JSON.stringify({
        mode: form.mode.value,
        department: form.department.value,
        reason: form.reason.value.trim(),
      }),
    });
    showAlert(alertBox, 'Consultation requested. Waiting for your doctor…', 'success');
    await enterConsultationRoom(data.consultation);
  } catch (err) {
    showAlert(alertBox, err.message);
  } finally {
    btn.disabled = false;
  }
}

async function enterConsultationRoom(consultation) {
  activeConsultation = consultation;
  document.getElementById('tmLobby').hidden = true;
  document.getElementById('tmRoom').hidden = false;

  document.getElementById('tmRoomTitle').textContent =
    `${capitalize(consultation.mode)} consultation · ${consultation.doctorName || 'Awaiting doctor'}`;
  document.getElementById('tmRoomStatus').innerHTML = statusBadge(consultation.status);

  const isMedia = consultation.mode === 'video' || consultation.mode === 'voice';
  document.getElementById('tmVideoPanel').hidden = !isMedia;
  document.getElementById('tmVideoPanel').classList.toggle('voice-only', consultation.mode === 'voice');

  await connectConsultationSocket(consultation);
  await loadConsultationData(consultation._id);

  if (isMedia) await setupPatientMedia(consultation.mode);
}

async function connectConsultationSocket(consultation) {
  teardownSocket();

  tmSocket = io({
    auth: { token: API.getToken(), role: 'patient' },
  });

  tmSocket.on('connect', () => {
    tmSocket.emit('join-consultation', { roomId: consultation.roomId });
  });

  tmSocket.on('chat-message', appendChatMessage);
  tmSocket.on('consultation-updated', () => {
    if (activeConsultation) loadConsultationData(activeConsultation._id);
  });

  tmSocket.on('peer-joined', async ({ role }) => {
    if (role === 'doctor' && tmWebRTC && activeConsultation?.mode !== 'chat') {
      tmWebRTC.onIceCandidate = (candidate) => {
        tmSocket.emit('webrtc-ice-candidate', { roomId: activeConsultation.roomId, candidate });
      };
      const offer = await tmWebRTC.createOffer();
      tmSocket.emit('webrtc-offer', { roomId: activeConsultation.roomId, offer });
    }
    if (activeConsultation) loadConsultationData(activeConsultation._id);
  });

  tmSocket.on('webrtc-answer', async ({ answer }) => {
    if (tmWebRTC) await tmWebRTC.handleAnswer(answer);
  });

  tmSocket.on('webrtc-ice-candidate', async ({ candidate }) => {
    if (tmWebRTC) await tmWebRTC.addIceCandidate(candidate);
  });

  tmSocket.on('error', (err) => console.error(err));
}

async function setupPatientMedia(mode) {
  tmWebRTC = new WebRTCClient({
    onRemoteStream: (stream) => {
      const remote = document.getElementById('tmRemoteVideo');
      remote.srcObject = stream;
      remote.hidden = mode === 'voice';
    },
    onConnectionStateChange: (state) => {
      document.getElementById('tmConnectionStatus').textContent = `Connection: ${state}`;
    },
  });

  try {
    const local = await tmWebRTC.initLocalStream(mode);
    const localVideo = document.getElementById('tmLocalVideo');
    if (local && mode === 'video') {
      localVideo.srcObject = local;
      localVideo.hidden = false;
    } else {
      localVideo.hidden = true;
    }
    tmWebRTC.createPeerConnection();
  } catch {
    document.getElementById('tmConnectionStatus').textContent = 'Camera/microphone access denied';
  }
}

async function loadConsultationData(id) {
  try {
    const data = await API.request(`/api/consultations/${id}`);
    activeConsultation = data.consultation;
    document.getElementById('tmRoomStatus').innerHTML = statusBadge(data.consultation.status);
    document.getElementById('tmRoomTitle').textContent =
      `${capitalize(data.consultation.mode)} consultation · ${data.consultation.doctorName || 'Awaiting doctor'}`;

    const chatBox = document.getElementById('tmChatMessages');
    chatBox.innerHTML = data.messages.map(renderChatMessage).join('');
    chatBox.scrollTop = chatBox.scrollHeight;

    renderClinicalRecords(data.records);
  } catch { /* ignore */ }
}

function renderChatMessage(m) {
  const cls = m.senderType === 'patient' ? 'chat-msg-patient' : 'chat-msg-doctor';
  return `
    <div class="chat-msg ${cls}">
      <span class="chat-msg-sender">${m.senderName || capitalize(m.senderType)}</span>
      <p>${escapeHtml(m.content)}</p>
      <span class="chat-msg-time">${new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
    </div>`;
}

function appendChatMessage(m) {
  const chatBox = document.getElementById('tmChatMessages');
  chatBox.insertAdjacentHTML('beforeend', renderChatMessage(m));
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('tmChatInput');
  const content = input.value.trim();
  if (!content || !tmSocket || !activeConsultation) return;

  tmSocket.emit('chat-message', { roomId: activeConsultation.roomId, content });
  input.value = '';
}

function renderClinicalRecords(records) {
  const el = document.getElementById('tmClinicalRecords');
  if (!records?.length) {
    el.innerHTML = '<p class="empty-state">No prescriptions, tests, or referrals yet.</p>';
    return;
  }

  el.innerHTML = records.map((r) => {
    const icons = { prescription: '💊', test: '🧪', referral: '🏥', file: '📎' };
    let detail = '';
    if (r.type === 'prescription') {
      detail = [r.details.dosage, r.details.frequency, r.details.duration].filter(Boolean).join(' · ');
    } else if (r.type === 'test') {
      detail = r.details.instructions || '';
    } else if (r.type === 'referral') {
      detail = `${r.details.facility || ''} ${r.details.reason || ''}`.trim();
    } else if (r.type === 'file' && r.filePath) {
      detail = `<a href="/uploads/consultations/${r.filePath}" target="_blank" rel="noopener">Download ${r.fileName || r.title}</a>`;
    }

    return `
      <div class="clinical-record clinical-${r.type}">
        <span class="clinical-icon">${icons[r.type] || '📋'}</span>
        <div>
          <strong>${escapeHtml(r.title)}</strong>
          <p class="text-small">${capitalize(r.type)} · ${r.doctorName || 'Doctor'}</p>
          ${detail ? `<p class="text-muted text-small">${detail}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function loadClinicalRecords() {
  try {
    const data = await API.request('/api/consultations/records');
    const el = document.getElementById('tmRecordsHistory');
    if (!data.records?.length) {
      el.innerHTML = '<p class="empty-state">No clinical records from past consultations.</p>';
      return;
    }
    el.innerHTML = data.records.slice(0, 10).map((r) => `
      <div class="list-card">
        <div class="list-card-main">
          <strong>${escapeHtml(r.title)}</strong>
          ${statusBadge(r.type)}
          <p class="text-muted text-small">${formatDateTime(r.createdAt)} · ${r.doctorName || ''}</p>
        </div>
      </div>
    `).join('');
  } catch { /* ignore */ }
}

async function endActiveConsultation() {
  if (!activeConsultation || !confirm('End this consultation?')) return;

  const endedId = activeConsultation._id;

  try {
    if (tmSocket) {
      tmSocket.emit('leave-consultation', { roomId: activeConsultation.roomId });
    }
    await API.request(`/api/consultations/${endedId}/end`, { method: 'PATCH' });
    showConsultationLobby();
    loadClinicalRecords();
    promptSatisfaction(endedId);
  } catch (err) {
    alert(err.message);
  }
}

function promptSatisfaction(consultationId) {
  const rating = prompt('How was your consultation? Rate 1–5 (or Cancel to skip):');
  if (!rating || !/^[1-5]$/.test(rating)) return;

  const comment = prompt('Optional comment about your experience:') || '';

  API.request('/api/satisfaction', {
    method: 'POST',
    body: JSON.stringify({
      rating: Number(rating),
      comment,
      category: 'consultation',
      consultationId,
    }),
  }).catch(() => {});
}

function teardownSocket() {
  if (tmSocket) {
    tmSocket.disconnect();
    tmSocket = null;
  }
}

function teardownConsultation() {
  teardownSocket();
  tmWebRTC?.stop();
  tmWebRTC = null;
  activeConsultation = null;
  document.getElementById('tmLocalVideo').srcObject = null;
  document.getElementById('tmRemoteVideo').srcObject = null;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

window.startTelemedicineConsultation = (mode) => {
  document.querySelector('[data-section=telemedicine]')?.click();
  setTimeout(() => {
    const form = document.getElementById('tmRequestForm');
    if (form && mode) form.mode.value = mode;
  }, 100);
};
