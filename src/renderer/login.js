document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error');
  errorEl.textContent = '';

  try {
    await window.agent.login(email, password);
    await window.agent.afterLogin();
  } catch (err) {
    errorEl.textContent = 'Login gagal — cek email/password.';
  }
});