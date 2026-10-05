import { db, route, fail, parse, text, needUser, newId } from './_lib.js';

const TTL = 30000;

export default route(async (req, res) => {
  const r = db();

  if (req.method === 'GET') {
    const ids = await r.zrange('lives', Date.now() - TTL, '+inf', { byScore: true });
    if (!ids.length) return res.json({ lives: [] });
    const lives = (await r.mget(...ids.map((i) => `live:${i}`))).filter(Boolean);
    return res.json({ lives });
  }

  if (req.method !== 'POST') throw fail(405, 'Metode tidak didukung.');
  const b = parse(req);
  const u = await needUser(b.uid);

  if (b.action === 'start') {
    const id = newId();
    const live = { id, uid: u.uid, host: u.name, title: text(b.title, 60) || "Live dari o'tok", t: Date.now(), viewers: 0 };
    await r.set(`live:${id}`, live, { ex: 40 });
    await r.zadd('lives', { score: live.t, member: id });
    await r.zremrangebyscore('lives', 0, Date.now() - TTL * 4);
    return res.json({ live });
  }

  if (b.action === 'beat') {
    const l = await r.get(`live:${b.id}`);
    if (!l || l.uid !== u.uid) throw fail(404, 'Siaran tidak ditemukan.');
    l.t = Date.now();
    l.viewers = Math.min(Math.max(0, Number(b.viewers) || 0), 1000000);
    await r.set(`live:${b.id}`, l, { ex: 40 });
    await r.zadd('lives', { score: l.t, member: b.id });
    return res.json({ ok: true });
  }

  if (b.action === 'end') {
    const l = await r.get(`live:${b.id}`);
    if (l && l.uid === u.uid) {
      await r.del(`live:${b.id}`);
      await r.zrem('lives', b.id);
    }
    return res.json({ ok: true });
  }

  throw fail(400, 'Aksi tidak dikenal.');
});
