import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

let _r;
export function db() {
  if (_r) return _r;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('NO_DB');
  _r = new Redis({ url, token });
  return _r;
}

export const fail = (status, msg) => Object.assign(new Error(msg), { status });

export const route = (fn) => async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await fn(req, res);
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Database belum terhubung. Ikuti langkah di README.' });
    }
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  }
};

export const parse = (req) => {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
};

export const text = (s, max) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ID selalu diawali huruf agar tidak pernah dibaca sebagai angka oleh Redis.
export const isUid = (s) => /^u[a-z0-9]{12,40}$/.test(s || '');
export const isVid = (s) => /^v[a-z0-9]{8,30}$/.test(s || '');
export const isName = (s) => /^[a-z0-9._]{3,20}$/.test(s || '');
export const newUid = () => 'u' + randomUUID().replace(/-/g, '');
export const newId = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function needUser(uid) {
  if (!isUid(uid)) throw fail(401, 'Sesi tidak valid. Muat ulang halaman.');
  const u = await db().get(`u:${uid}`);
  if (!u) throw fail(401, 'Akun tidak ditemukan. Muat ulang halaman.');
  return u;
}

export async function notify(uid, n) {
  const r = db();
  await Promise.all([r.lpush(`notif:${uid}`, { ...n, t: Date.now() }), r.incr(`unread:${uid}`)]);
  await r.ltrim(`notif:${uid}`, 0, 49);
}
