let securityInitialized = false;

function initSecurityPanel() {
  if (securityInitialized) return;
  securityInitialized = true;

  document.getElementById('mfaSetupBtn')?.addEventListener('click', setupMfa);
  document.getElementById('mfaConfirmBtn')?.addEventListener('click', confirmMfa);
  document.getElementById('mfaDisableBtn')?.addEventListener('click', disableMfa);
  document.getElementById('exportDataBtn')?.addEventListener('click', exportPatientData);
  document.getElementById('loadPrivacyBtn')?.addEventListener('click', loadPrivacyNotice);

  loadSecurityStatus();
  loadConsents();
}

async function loadSecurityStatus() {
  try {
    const data = await API.request('/api/security/mfa/status');
    document.getElementById('mfaStatusLabel').textContent =
      data.mfaEnabled ? 'Enabled — authenticator app required at login' : 'Not enabled';
    document.getElementById('mfaSetupPanel').hidden = data.mfaEnabled;
    document.getElementById('mfaManagePanel').hidden = !data.mfaEnabled;
  } catch {
    document.getElementById('mfaStatusLabel').textContent = 'Unable to load status';
  }
}

async function setupMfa() {
  const alertBox = document.getElementById('securityAlert');
  try {
    const data = await API.request('/api/security/mfa/setup', { method: 'POST' });
    document.getElementById('mfaSetupDetails').hidden = false;
    document.getElementById('mfaSecretDisplay').textContent = data.secret;
    document.getElementById('mfaOtpauth').textContent = data.otpauth;
    showAlert(alertBox, 'Add the secret to your authenticator app, then enter a code below.', 'success');
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

async function confirmMfa() {
  const alertBox = document.getElementById('securityAlert');
  const code = document.getElementById('mfaConfirmCode').value.trim();
  if (!code) return showAlert(alertBox, 'Enter the 6-digit code from your app');

  try {
    await API.request('/api/security/mfa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    showAlert(alertBox, 'Multi-factor authentication enabled.', 'success');
    document.getElementById('mfaSetupDetails').hidden = true;
    document.getElementById('mfaConfirmCode').value = '';
    loadSecurityStatus();
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

async function disableMfa() {
  const code = prompt('Enter your current authenticator code to disable MFA:');
  if (!code) return;

  try {
    await API.request('/api/security/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    loadSecurityStatus();
    showAlert(document.getElementById('securityAlert'), 'MFA disabled.', 'success');
  } catch (err) {
    alert(err.message);
  }
}

async function loadConsents() {
  const el = document.getElementById('consentList');
  try {
    const data = await API.request('/api/security/consents');
    el.innerHTML = data.consents.map((c) => `
      <div class="list-card">
        <div class="list-card-main">
          <strong>${esc(c.label)}</strong>
          ${statusBadge(c.granted ? 'active' : 'cancelled')}
          <p class="text-small text-muted">${c.consentType}</p>
        </div>
        <div class="list-card-actions">
          ${c.granted
            ? (c.consentType !== 'treatment'
              ? `<button class="btn btn-ghost btn-sm text-danger" onclick="revokeConsent('${c.consentType}')">Revoke</button>`
              : '<span class="text-small text-muted">Required</span>')
            : `<button class="btn btn-primary btn-sm" onclick="grantConsent('${c.consentType}')">Grant</button>`}
        </div>
      </div>`).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

window.grantConsent = async (consentType) => {
  try {
    await API.request('/api/security/consents', {
      method: 'POST',
      body: JSON.stringify({ consentType }),
    });
    loadConsents();
  } catch (err) {
    alert(err.message);
  }
};

window.revokeConsent = async (consentType) => {
  if (!confirm('Revoke this consent? Some features may stop working.')) return;
  try {
    await API.request(`/api/security/consents/${consentType}`, { method: 'DELETE' });
    loadConsents();
  } catch (err) {
    alert(err.message);
  }
};

async function exportPatientData() {
  try {
    const token = localStorage.getItem('ezymed_token');
    if (!token) throw new Error('Authentication required');

    const res = await fetch('/api/compliance/patient/export', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Export failed');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ezymed-export-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showAlert(document.getElementById('securityAlert'), 'Your data export has downloaded as a PDF.', 'success');
  } catch (err) {
    showAlert(document.getElementById('securityAlert'), err.message);
  }
}

async function loadPrivacyNotice() {
  const el = document.getElementById('privacyNoticeContent');
  try {
    const data = await API.request('/api/compliance/privacy-notice');
    el.innerHTML = `
      <p class="text-small text-muted">Version ${data.version} · Effective ${data.effectiveDate}</p>
      <p><strong>Regulations:</strong> ${data.regulations.join('; ')}</p>
      <ul class="ai-summary-list">${data.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <p class="text-small"><strong>Your rights:</strong></p>
      <ul class="ai-summary-list">${data.rights.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="text-small">Contact: ${esc(data.contact.privacyEmail)}</p>`;
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
