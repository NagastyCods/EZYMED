document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const mfaForm = document.getElementById('mfaForm');
  const alertBox = document.getElementById('alertBox');

  if (API.getToken()) {
    window.location.href = '/dashboard.html';
    return;
  }

  if (registerForm) {
    loadConsentOptions();
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type="submit"]');
      btn.disabled = true;

      try {
        const data = await API.request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: loginForm.email.value.trim(),
            password: loginForm.password.value,
          }),
        });

        if (data.requiresMfa) {
          sessionStorage.setItem('ezymed_mfa_token', data.mfaToken);
          loginForm.hidden = true;
          if (mfaForm) mfaForm.hidden = false;
          showAlert(alertBox, 'Enter the code from your authenticator app.', 'success');
          btn.disabled = false;
          return;
        }

        API.setToken(data.token);
        API.setPatient(data.patient);
        window.location.href = '/dashboard.html';
      } catch (err) {
        showAlert(alertBox, err.message);
        btn.disabled = false;
      }
    });
  }

  if (mfaForm) {
    mfaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mfaToken = sessionStorage.getItem('ezymed_mfa_token');
      const btn = mfaForm.querySelector('button[type="submit"]');
      btn.disabled = true;

      try {
        const data = await API.request('/api/security/mfa/verify-login', {
          method: 'POST',
          body: JSON.stringify({
            mfaToken,
            code: mfaForm.code.value.trim(),
          }),
        });
        sessionStorage.removeItem('ezymed_mfa_token');
        API.setToken(data.token);
        if (data.patient) API.setPatient(data.patient);
        window.location.href = '/dashboard.html';
      } catch (err) {
        showAlert(alertBox, err.message);
        btn.disabled = false;
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector('button[type="submit"]');
      btn.disabled = true;

      if (registerForm.password.value !== registerForm.confirmPassword.value) {
        showAlert(alertBox, 'Passwords do not match');
        btn.disabled = false;
        return;
      }

      const consents = collectRegistrationConsents();
      if (!consents.treatment) {
        showAlert(alertBox, 'Treatment consent is required to create an account.');
        btn.disabled = false;
        return;
      }

      try {
        const data = await API.request('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: registerForm.email.value.trim(),
            password: registerForm.password.value,
            firstName: registerForm.firstName.value.trim(),
            lastName: registerForm.lastName.value.trim(),
            phone: registerForm.phone.value.trim(),
            dateOfBirth: registerForm.dateOfBirth.value || undefined,
            consents,
          }),
        });

        API.setToken(data.token);
        API.setPatient(data.patient);
        window.location.href = '/dashboard.html';
      } catch (err) {
        showAlert(alertBox, err.message);
        btn.disabled = false;
      }
    });
  }
});

async function loadConsentOptions() {
  const container = document.getElementById('consentOptions');
  if (!container) return;

  try {
    const data = await API.request('/api/compliance/consent-options');
    container.innerHTML = (data.options || []).map((opt) => `
      <label class="consent-option">
        <input type="checkbox" name="consent_${opt.consentType}" value="${opt.consentType}"
          ${opt.required ? 'required checked' : ''}>
        <span>
          <strong>${opt.label}${opt.required ? ' *' : ''}</strong>
          <span class="text-small text-muted">${opt.description || ''}</span>
        </span>
      </label>
    `).join('');
  } catch {
    container.innerHTML = `
      <label class="consent-option">
        <input type="checkbox" name="consent_treatment" value="treatment" required checked>
        <span><strong>Treatment and care *</strong></span>
      </label>
    `;
  }
}

function collectRegistrationConsents() {
  const types = ['treatment', 'telemedicine', 'data_sharing', 'research'];
  const consents = {};
  types.forEach((type) => {
    const input = document.querySelector(`input[name="consent_${type}"]`);
    consents[type] = Boolean(input?.checked);
  });
  return consents;
}
