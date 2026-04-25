// Replace this with the API Gateway endpoint printed at the end of the deploy guide.
const API_BASE = 'https://cfxwpi073d.execute-api.us-east-1.amazonaws.com';

const form = document.getElementById('note-form');
const input = document.getElementById('note-input');
const list = document.getElementById('note-list');
const statusEl = document.getElementById('status');

let busy = false;

function setStatus(msg) {
  statusEl.textContent = msg;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function renderNotes(notes) {
  list.innerHTML = '';
  notes.forEach(({ id, text }) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${escapeHtml(text)}</span>
      <button class="delete-btn" data-id="${id}" aria-label="Delete note">✕</button>
    `;
    list.appendChild(li);
  });
}

async function loadNotes() {
  if (API_BASE.includes('YOUR_API_ID')) {
    setStatus('Set API_BASE in app.js to your API Gateway URL, then re-upload.');
    return;
  }
  setStatus('Loading…');
  try {
    const res = await fetch(`${API_BASE}/notes`);
    const notes = await res.json();
    renderNotes(notes);
    setStatus('');
  } catch {
    setStatus('Could not load notes — check the console.');
  }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  if (!text) return;

  busy = true;
  setStatus('Saving…');
  try {
    await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    input.value = '';
    await loadNotes();
  } catch {
    setStatus('Failed to save note.');
  } finally {
    busy = false;
  }
});

list.addEventListener('click', async e => {
  const btn = e.target.closest('.delete-btn');
  if (!btn || busy) return;

  busy = true;
  setStatus('Deleting…');
  try {
    await fetch(`${API_BASE}/notes/${btn.dataset.id}`, { method: 'DELETE' });
    await loadNotes();
  } catch {
    setStatus('Failed to delete note.');
  } finally {
    busy = false;
  }
});

loadNotes();
