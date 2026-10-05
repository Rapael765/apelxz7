export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const hue = (s) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

export const fmt = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + 'jt'
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + 'rb'
  : String(n || 0);

export const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 60 ? 'baru saja' : s < 3600 ? Math.floor(s / 60) + ' mnt' : s < 86400 ? Math.floor(s / 3600) + ' j' : Math.floor(s / 86400) + ' hr';
};

const I = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  live: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  inbox: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5"/>',
  mark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  send: '<path d="M3 11l18-8-8 18-2-8z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.4-5 7-5s6.2 1.5 7 5M17 4.5a3.5 3.5 0 0 1 0 7M18 15c2.2.5 3.6 2 4 5"/>',
};

export const ic = (n, c = '') =>
  `<svg class="ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

export const avatar = (name, size = 40) =>
  `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${size * 0.42}px;background:linear-gradient(135deg,hsl(${hue(name)} 80% 58%),hsl(${hue(name) + 50} 75% 38%))">${esc((name || '?')[0].toUpperCase())}</span>`;

export function paintIcons(root = document) {
  $$('[data-ic]', root).forEach((e) => {
    if (!e.dataset.done) { e.innerHTML = ic(e.dataset.ic); e.dataset.done = 1; }
  });
}

// Teks aman + #tagar dan @nama yang bisa diketuk.
export const rich = (t) =>
  esc(t)
    .replace(/(#[\p{L}\p{N}_]+)/gu, '<a class="tag" data-tag="$1">$1</a>')
    .replace(/(^|\s)(@[a-z0-9._]{3,20})/g, '$1<a class="mention" data-user="$2">$2</a>');

let toastTimer;
export function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
