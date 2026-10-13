/* EDEN CRM — sign-in with Google and calls to the Apps Script API */
(function () {
  const CFG = window.EDEN_CONFIG || {};
  const KEY = 'eden.crm.session';
  let session = null, started = false;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.session && s.exp > Date.now() + 60000) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function save(s) { session = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function clear() { session = null; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  const $ = function (id) { return document.getElementById(id); };

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

  function showSignIn(text) {
    $('app').hidden = true;
    $('signin').hidden = false;
    $('drawer-root').replaceChildren();
    msg(text || '', !!text);
    initGsi();
  }

  let gsiReady = false;
  function initGsi() {
    if (gsiReady) { try { google.accounts.id.prompt(); } catch (e) { /* ignore */ } return; }
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(initGsi, 150); return; }
    google.accounts.id.initialize({
      client_id: CFG.googleClientId,
      callback: onCredential,
      auto_select: true,
      hd: CFG.domain || undefined,
      use_fedcm_for_prompt: true,
      itp_support: true,
    });
    google.accounts.id.renderButton($('gsi-btn'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 });
    google.accounts.id.prompt();
    gsiReady = true;
  }

  async function onCredential(resp) {
    msg('Signing in…');
    try {
      const j = await post({ fn: 'auth', idToken: resp.credential });
      if (!j.ok) throw new Error(j.error || 'Sign-in failed.');
      save(j.result);
      msg('');
      start();
    } catch (e) {
      msg(e.message, true);
      try { google.accounts.id.disableAutoSelect(); } catch (x) { /* ignore */ }
    }
  }

  function start() {
    $('signin').hidden = true;
    $('app').hidden = false;
    started = true;
    window.EdenApp.boot();
  }

  function signOut() {
    clear();
    try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    location.reload();
  }

  window.EdenAuth = { call: call, signOut: signOut, isStarted: function () { return started; } };

  if (!CFG.apiUrl || !CFG.googleClientId) {
    $('signin').hidden = false;
    msg('EDEN CRM is not connected yet. The admin needs to finish the setup on GitHub (API URL and Google client ID).', true);
    return;
  }
  session = load();
  if (session) start(); else showSignIn();
})();
