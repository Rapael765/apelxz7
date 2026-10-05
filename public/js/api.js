const KEY = 'otok.session';

export const session = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(s) { localStorage.setItem(KEY, JSON.stringify(s)); },
  clear() { localStorage.removeItem(KEY); },
};

async function req(path, { method = 'GET', body, query } = {}) {
  const url = new URL(path, location.origin);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && v !== '' && url.searchParams.set(k, v));
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Permintaan gagal. Coba lagi.'), { status: r.status });
  return data;
}

export const api = {
  register: (name) => req('/api/users', { method: 'POST', body: { action: 'register', name } }),
  update: (uid, patch) => req('/api/users', { method: 'POST', body: { action: 'update', uid, ...patch } }),
  profile: (name, me) => req('/api/users', { query: { name, me } }),
  following: (uid) => req('/api/users', { query: { following: uid } }),

  videos: (query) => req('/api/videos', { query }),
  video: (id, uid) => req('/api/videos', { query: { id, uid } }),
  trending: () => req('/api/videos', { query: { trending: 1 } }),
  createVideo: (uid, url, kind, caption) => req('/api/videos', { method: 'POST', body: { action: 'create', uid, url, kind, caption } }),
  view: (id) => req('/api/videos', { method: 'POST', body: { action: 'view', id } }),
  deleteVideo: (uid, id) => req('/api/videos', { method: 'DELETE', query: { uid, id } }),

  like: (uid, vid) => req('/api/interact', { method: 'POST', body: { action: 'like', uid, vid } }),
  comment: (uid, vid, text) => req('/api/interact', { method: 'POST', body: { action: 'comment', uid, vid, text } }),
  comments: (vid) => req('/api/interact', { query: { comments: vid } }),
  follow: (uid, target) => req('/api/interact', { method: 'POST', body: { action: 'follow', uid, target } }),
  mark: (uid, vid) => req('/api/interact', { method: 'POST', body: { action: 'mark', uid, vid } }),

  inbox: (uid) => req('/api/inbox', { query: { uid } }),
  badge: (uid) => req('/api/inbox', { query: { uid, badge: 1 } }),
  readInbox: (uid) => req('/api/inbox', { method: 'POST', body: { uid } }),

  lives: () => req('/api/live'),
  liveStart: (uid, title) => req('/api/live', { method: 'POST', body: { action: 'start', uid, title } }),
  liveBeat: (uid, id, viewers) => req('/api/live', { method: 'POST', body: { action: 'beat', uid, id, viewers } }),
  liveEnd: (uid, id) => req('/api/live', { method: 'POST', body: { action: 'end', uid, id } }),
  liveToken: (uid, id) => req('/api/livekit-token', { method: 'POST', body: { uid, id } }),
};
