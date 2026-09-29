function initForgotPasswordForm(formId, alertId) {
  const form = document.getElementById(formId);
  const alertBox = document.getElementById(alertId);
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const data = await API.request('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: form.email.value.trim() }),
      });
      showAlert(alertBox, data.message, 'success');
      form.reset();
    } catch (err) {
      showAlert(alertBox, err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function initResetPasswordForm(formId, alertId) {
  const form = document.getElementById(formId);
  const alertBox = document.getElementById(alertId);
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const email = params.get('email');

  if (!token || !email) {
    showAlert(alertBox, 'Invalid reset link. Request a new one from the forgot password page.');
    form.hidden = true;
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.password.value !== form.confirmPassword.value) {
      showAlert(alertBox, 'Passwords do not match');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const data = await API.request('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email,
          token,
          password: form.password.value,
        }),
      });
      showAlert(alertBox, data.message, 'success');
      form.hidden = true;
    } catch (err) {
      showAlert(alertBox, err.message);
      btn.disabled = false;
    }
  });
}

async function verifyEmailFromQuery(alertId) {
  const alertBox = document.getElementById(alertId);
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const email = params.get('email');

  if (!token || !email) {
    showAlert(alertBox, 'Invalid verification link.');
    return;
  }

  try {
    const data = await API.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, token }),
    });
    showAlert(alertBox, data.message, 'success');
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}
