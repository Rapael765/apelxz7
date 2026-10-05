import { del } from '@vercel/blob';
import { db, route, fail, parse, text, isUid, isVid, needUser, newId } from './_lib.js';

const LIMIT = 8;
const GRID = 24;

async function enrich(ids, me) {
  if (!ids.length) return [];
  const who = isUid(me) ? me : 'x';
  const p = db().pipeline();
  for (const id of ids) {
    p.get(`v:${id}`);
    p.scard(`vl:${id}`);
    p.llen(`vc:${id}`);
    p.get(`vv:${id}`);
    p.sismember(`vl:${id}`, who);
    p.sismember(`mk:${who}`, id);
  }
  const r = await p.exec();
  const out = [];
  ids.forEach((id, i) => {
    const [m, likes, comments, views, liked, saved] = r.slice(i * 6, i * 6 + 6);
    if (m) out.push({ ...m, likes, comments, views: Number(views) || 0, liked: !!liked, saved: !!saved });
  });
  return out;
}

export default route(async (req, res) => {
  const r = db();

  if (req.method === 'GET') {
    const { id, tab = 'fyp', uid, by, q, trending } = req.query;
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    if (trending) {
      const ids = await r.zrange('feed', 0, 199, { rev: true });
      const metas = ids.length ? await r.mget(...ids.map((i) => `v:${i}`)) : [];
      const count = {};
      for (const m of metas) {
        if (!m) continue;
        const seen = new Set((m.caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()));
        seen.forEach((t) => { count[t] = (count[t] || 0) + 1; });
      }
      const tags = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
      return res.json({ tags });
    }

    if (id) {
      if (!isVid(id)) throw fail(400, 'ID video tidak valid.');
      const [v] = await enrich([id], uid);
      if (!v) throw fail(404, 'Video tidak ditemukan.');
      return res.json({ video: v });
    }

    let ids = [];
    let next = null;

    if (tab === 'fyp') {
      ids = await r.zrange('feed', offset, offset + LIMIT - 1, { rev: true });
      next = ids.length === LIMIT ? offset + LIMIT : null;
    } else if (tab === 'user') {
      if (!isUid(by)) throw fail(400, 'Pengguna tidak valid.');
      ids = await r.zrange(`vu:${by}`, offset, offset + GRID - 1, { rev: true });
      next = ids.length === GRID ? offset + GRID : null;
    } else if (tab === 'saved') {
      await needUser(uid);
      ids = (await r.smembers(`mk:${uid}`)).slice(0, 60);
    } else if (tab === 'follow') {
      await needUser(uid);
      const f = (await r.smembers(`fol:${uid}`)).slice(0, 50);
      if (f.length) {
        const p = r.pipeline();
        f.forEach((x) => p.zrange(`vu:${x}`, 0, 19, { rev: true, withScores: true }));
        const rs = await p.exec();
        const all = [];
        rs.forEach((arr) => { for (let i = 0; i < arr.length; i += 2) all.push([arr[i], Number(arr[i + 1])]); });
        all.sort((a, b) => b[1] - a[1]);
        ids = all.slice(offset, offset + LIMIT).map((x) => x[0]);
        next = all.length > offset + LIMIT ? offset + LIMIT : null;
      }
    } else if (tab === 'search') {
      const term = text(q, 40).toLowerCase();
      const recent = await r.zrange('feed', 0, 199, { rev: true });
      const all = await enrich(recent, uid);
      const videos = term
        ? all.filter((v) => v.caption.toLowerCase().includes(term) || v.user.toLowerCase().includes(term.replace(/^@/, '')))
        : all;
      return res.json({ videos: videos.slice(0, 30), next: null });
    } else {
      throw fail(400, 'Tab tidak dikenal.');
    }

    return res.json({ videos: await enrich(ids, uid), next });
  }

  if (req.method === 'POST') {
    const b = parse(req);

    if (b.action === 'create') {
      const u = await needUser(b.uid);
      let host;
      try { host = new URL(String(b.url || '')).hostname; } catch { throw fail(400, 'URL tidak valid.'); }
      if (!host.endsWith('.blob.vercel-storage.com')) throw fail(400, 'Sumber file tidak diizinkan.');
      const id = newId();
      const v = {
        id, uid: u.uid, user: u.name,
        caption: text(b.caption, 150) || 'Tanpa keterangan',
        url: String(b.url), kind: b.kind === 'image' ? 'image' : 'video', t: Date.now(),
      };
      const p = r.pipeline();
      p.set(`v:${id}`, v);
      p.zadd('feed', { score: v.t, member: id });
      p.zadd(`vu:${u.uid}`, { score: v.t, member: id });
      await p.exec();
      return res.status(201).json({ video: { ...v, likes: 0, comments: 0, views: 0, liked: false, saved: false } });
    }

    if (b.action === 'view') {
      if (isVid(b.id)) await r.incr(`vv:${b.id}`);
      return res.json({ ok: true });
    }

    throw fail(400, 'Aksi tidak dikenal.');
  }

  if (req.method === 'DELETE') {
    const { id, uid } = req.query;
    const u = await needUser(uid);
    if (!isVid(id)) throw fail(400, 'ID video tidak valid.');
    const v = await r.get(`v:${id}`);
    if (!v) throw fail(404, 'Video tidak ditemukan.');
    if (v.uid !== u.uid) throw fail(403, 'Kamu hanya bisa menghapus videomu sendiri.');
    const p = r.pipeline();
    p.del(`v:${id}`, `vl:${id}`, `vc:${id}`, `vv:${id}`);
    p.zrem('feed', id);
    p.zrem(`vu:${u.uid}`, id);
    await p.exec();
    try { await del(v.url); } catch { /* file mungkin sudah terhapus */ }
    return res.json({ ok: true });
  }

  throw fail(405, 'Metode tidak didukung.');
});
