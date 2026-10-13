/* EDEN CRM — sign-in (email code, or Google when configured) and calls to the Apps Script API */
(function () {
  const CFG = window.EDEN_CONFIG || {};
  const KEY = 'eden.crm.session';
  const EMAIL_KEY = 'eden.crm.email';
  let session = null;
  const $ = function (id) { return document.getElementById(id); };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.session && s.exp > Date.now() + 60000) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function save(s) { session = s; try { localStorage.setItem(KEY, JSON.stringify(s)); localStorage.setItem(EMAIL_KEY, s.email); } catch (e) { /* ignore */ } }
  function clear() { session = null; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function lastEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { return ''; } }
  function msg(text, err) { const m = $('signin-msg'); m.textContent = text || ''; m.className = 'status' + (err ? ' err' : ''); }

  async function post(body) {
    let r;
    try {
      r = await fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    } catch (e) {
      throw new Error('No connection to the CRM server. Check your internet and try again.');
    }
    if (!r.ok) throw new Error('The CRM server did not answer (HTTP ' + r.status + '). Try again in a minute.');
    try { return await r.json(); } catch (e) { throw new Error('The CRM server sent an unexpected reply. Try again in a minute.'); }
  }

  async function call(fn, args) {
    if (!session) session = load();
    if (!session) { showSignIn(); const e = new Error('Please sign in.'); e.auth = true; throw e; }
    const j = await post({ fn: fn, args: args || [], session: session.session });
    if (!j.ok) {
      const e = new Error(j.error || 'Something went wrong.');
      if (j.auth) { e.auth = true; clear(); showSignIn(j.error); }
      throw e;
    }
    return j.result;
  }

  /* ---------- sign-in screen ---------- */
  function showSignIn(text) {
    $('app').hidden = true;
    $('signin').hidden = false;
    $('drawer-root').replaceChildren();
    msg(text || '', !!text);
    step('email');
    if (CFG.googleClientId) initGsi();
  }

  function step(which) {
    $('step-email').hidden = which !== 'email';
    $('step-code').hidden = which !== 'code';
    const f = which === 'email' ? $('si-email') : $('si-code');
    setTimeout(function () { f.focus(); }, 30);
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    if (label) btn.textContent = label;
  }

  $('si-email').value = lastEmail();
  $('code-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!$('step-email').hidden) {
      const email = $('si-email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg('Enter your work email address.', true); return; }
      busy($('si-send'), true, 'Sending…'); msg('');
      try {
        const j = await post({ fn: 'sendCode', email: email });
        if (!j.ok) throw new Error(j.error || 'Could not send the code.');
        $('si-to').textContent = email;
        $('si-code').value = '';
        step('code');
        msg('Check your inbox. The code works for ' + (j.result.minutes || 10) + ' minutes.');
      } catch (err) { msg(err.message, true); }
      busy($('si-send'), false, 'Email me a sign-in code');
      return;
    }
    const code = $('si-code').value.replace(/\D/g, '');
    if (code.length !== 6) { msg('Enter the 6-digit code from the email.', true); return; }
    busy($('si-verify'), true, 'Signing in…');
    try {
      const j = await post({ fn: 'verifyCode', email: $('si-to').textContent, code: code });
      if (!j.ok) throw new Error(j.error || 'Sign-in failed.');
      save(j.result); msg(''); start();
    } catch (err) { msg(err.message, true); }
    busy($('si-verify'), false, 'Sign in');
  });
  $('si-code').addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (e.target.value.length === 6) $('code-form').requestSubmit();
  });
  $('si-back').addEventListener('click', function () { msg(''); step('email'); });

  /* ---------- Google (optional) ---------- */
  let gsiReady = false;
  function initGsi() {
    if (gsiReady) return;
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(initGsi, 200); return; }
    google.accounts.id.initialize({
      client_id: CFG.googleClientId, callback: onCredential, auto_select: true,
      hd: CFG.domain || undefined, use_fedcm_for_prompt: true, itp_support: true,
    });
    google.accounts.id.renderButton($('gsi-btn'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 });
    $('gsi-wrap').hidden = false;
    google.accounts.id.prompt();
    gsiReady = true;
  }
  async function onCredential(resp) {
    msg('Signing in…');
    try {
      const j = await post({ fn: 'auth', idToken: resp.credential });
      if (!j.ok) throw new Error(j.error || 'Sign-in failed.');
      save(j.result); msg(''); start();
    } catch (e) {
      msg(e.message, true);
      try { google.accounts.id.disableAutoSelect(); } catch (x) { /* ignore */ }
    }
  }

  function start() {
    $('signin').hidden = true;
    $('app').hidden = false;
    window.EdenApp.boot();
  }

  function signOut() {
    clear();
    try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    location.reload();
  }

  window.EdenAuth = { call: call, signOut: signOut };

  if (!CFG.apiUrl) {
    $('signin').hidden = false;
    $('code-form').hidden = true;
    $('signin-intro').textContent = 'EDEN CRM is almost ready.';
    msg('The server is not connected yet. The admin needs to finish the GitHub setup (CLASPRC_JSON and SCRIPT_ID).', true);
    return;
  }
  session = load();
  if (session) start(); else showSignIn();
})();
