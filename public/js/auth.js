document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const mfaForm = document.getElementById('mfaForm');
  const alertBox = document.getElementById('alertBox');

  if (API.getToken()) {
    window.location.href = '/dashboard.html';
    return;
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
