// ── Config ── update COGNITO_DOMAIN and CLIENT_ID before deploying ────────────
const API_BASE = 'https://cfxwpi073d.execute-api.us-east-1.amazonaws.com';
const COGNITO_DOMAIN = 'https://us-east-1czfat1thc.auth.us-east-1.amazoncognito.com';
const CLIENT_ID = '32gjhi4l7ojonjioqvitgtsrn5';
// ─────────────────────────────────────────────────────────────────────────────

const REDIRECT_URI = window.location.origin;

// ── Token helpers ─────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem('id_token'); }
function setToken(t) { localStorage.setItem('id_token', t); }
function clearToken() { localStorage.removeItem('id_token'); }

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

// Cognito redirects back with tokens in the URL hash after sign-in.
function consumeHashToken() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('id_token');
  if (token) {
    setToken(token);
    history.replaceState(null, '', window.location.pathname);
  }
}

function signIn() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'token',
    scope: 'openid email',
    redirect_uri: REDIRECT_URI,
  });
  window.location.href = `${COGNITO_DOMAIN}/login?${params}`;
}

function signOut() {
  clearToken();
  const params = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: REDIRECT_URI });
  window.location.href = `${COGNITO_DOMAIN}/logout?${params}`;
}

// ── UI elements ───────────────────────────────────────────────────────────────

const signedOutEl = document.getElementById('signed-out');
const signedInEl = document.getElementById('signed-in');
const userLabelEl = document.getElementById('user-label');
const signinBtn = document.getElementById('signin-btn');
const signoutBtn = document.getElementById('signout-btn');
const form = document.getElementById('note-form');
const input = document.getElementById('note-input');
const list = document.getElementById('note-list');
const statusEl = document.getElementById('status');

let busy = false;
let refreshTimer = null;

function setStatus(msg) { statusEl.textContent = msg; }

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function renderNotes(notes) {
  list.innerHTML = '';
  notes.forEach(note => {
    const { id, text, processedStatus, summary, attachmentKey, attachmentUrl } = note;

    const badge = processedStatus === 'done'
      ? `<span class="badge done">${escapeHtml(summary || 'done')}</span>`
      : `<span class="badge pending">processing…</span>`;

    const filename = attachmentKey ? attachmentKey.split('/').pop() : '';
    const attachment = attachmentKey
      ? `<a class="attach-link" href="${escapeHtml(attachmentUrl)}" target="_blank"
            rel="noopener" title="${escapeHtml(filename)}">📎 ${escapeHtml(filename)}</a>`
      : `<button class="attach-btn" data-note-id="${id}" title="Attach a file">📎</button>`;

    const li = document.createElement('li');
    li.innerHTML = `
      <span class="note-text">${escapeHtml(text)}</span>
      ${badge}
      ${attachment}
      <button class="delete-btn" data-id="${id}" aria-label="Delete note">✕</button>
    `;
    list.appendChild(li);
  });
}

// ── API calls ─────────────────────────────────────────────────────────────────

// Attaches the Cognito id_token as a Bearer token on every request.
// API Gateway's JWT authorizer validates it before Lambda is called.
function authFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
  });
}

async function loadNotes() {
  setStatus('Loading…');
  try {
    const res = await authFetch(`${API_BASE}/notes`);
    if (res.status === 401 || res.status === 403) { signOut(); return; }
    const notes = await res.json();
    renderNotes(notes);
    setStatus('');
    // Keep polling until every note has been processed by the worker.
    clearTimeout(refreshTimer);
    if (notes.some(n => n.processedStatus !== 'done')) {
      refreshTimer = setTimeout(loadNotes, 3000);
    }
  } catch { setStatus('Could not load notes — check the console.'); }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  if (!text) return;
  busy = true; setStatus('Saving…');
  try {
    await authFetch(`${API_BASE}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    input.value = '';
    await loadNotes();
  } catch { setStatus('Failed to save note.'); }
  finally { busy = false; }
});

// ── File upload ───────────────────────────────────────────────────────────────
// A single persistent <input type="file"> in the HTML is clicked programmatically
// by the per-note attach buttons. This avoids relying on change-event delegation
// from dynamically created inputs, which silently breaks when renderNotes() reruns
// (e.g. the 3 s auto-refresh) while the OS file picker is still open — the original
// input is detached from the DOM and its change event never reaches the listener.

const fileInput = document.getElementById('file-input');

fileInput.addEventListener('change', async () => {
  if (!fileInput.files[0]) return;
  const file   = fileInput.files[0];
  const noteId = fileInput.dataset.noteId;
  fileInput.value = ''; // reset so the same file can be re-selected next time

  setStatus('Uploading…');
  try {
    // Step 1: get a presigned PUT URL from the API.
    const res = await authFetch(`${API_BASE}/notes/${noteId}/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }),
    });
    const { uploadUrl } = await res.json();

    // Step 2: PUT directly to S3.
    // No Authorization header — the presigned URL already embeds credentials.
    const s3Res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!s3Res.ok) throw new Error(`S3 PUT ${s3Res.status}`);

    await loadNotes();
  } catch (err) {
    setStatus('Upload failed — check the console.');
    console.error(err);
  }
});

list.addEventListener('click', async e => {
  // Attach button — stamp the note ID onto the shared input, then open the picker.
  const attachBtn = e.target.closest('.attach-btn');
  if (attachBtn) {
    fileInput.dataset.noteId = attachBtn.dataset.noteId;
    fileInput.click();
    return;
  }

  const btn = e.target.closest('.delete-btn');
  if (!btn || busy) return;
  busy = true; setStatus('Deleting…');
  try {
    await authFetch(`${API_BASE}/notes/${btn.dataset.id}`, { method: 'DELETE' });
    await loadNotes();
  } catch { setStatus('Failed to delete note.'); }
  finally { busy = false; }
});

signinBtn.addEventListener('click', signIn);
signoutBtn.addEventListener('click', signOut);

// ── Boot ──────────────────────────────────────────────────────────────────────

consumeHashToken();

const token = getToken();
const claims = token && parseJwt(token);
const valid = claims && claims.exp * 1000 > Date.now();

if (valid) {
  signedOutEl.hidden = true;
  signedInEl.hidden = false;
  userLabelEl.textContent = claims.email || claims.sub;
  loadNotes();
} else {
  clearToken();
  signedOutEl.hidden = false;
  signedInEl.hidden = true;
  if (COGNITO_DOMAIN.includes('YOUR_DOMAIN')) {
    document.querySelector('.auth-msg').textContent =
      'Set COGNITO_DOMAIN and CLIENT_ID in app.js before deploying.';
  }
}
