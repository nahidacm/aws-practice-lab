const STORAGE_KEY = 'tiny-notes';

const form = document.getElementById('note-form');
const input = document.getElementById('note-input');
const list = document.getElementById('note-list');

function loadNotes() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function renderNotes() {
  const notes = loadNotes();
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

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const notes = loadNotes();
  notes.unshift({ id: Date.now(), text });
  saveNotes(notes);
  input.value = '';
  renderNotes();
});

list.addEventListener('click', e => {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const notes = loadNotes().filter(n => n.id !== id);
  saveNotes(notes);
  renderNotes();
});

renderNotes();
