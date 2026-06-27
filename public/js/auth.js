document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
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

        API.setToken(data.token);
        API.setPatient(data.patient);
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
