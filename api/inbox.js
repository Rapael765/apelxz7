import { db, route, fail, parse, needUser } from './_lib.js';

export default route(async (req, res) => {
  const r = db();

  if (req.method === 'GET') {
    const { uid, badge } = req.query;
    await needUser(uid);
    const unread = Number(await r.get(`unread:${uid}`)) || 0;
    if (badge) return res.json({ unread });
    const items = await r.lrange(`notif:${uid}`, 0, 49);
    return res.json({ items, unread });
  }

  if (req.method === 'POST') {
    const b = parse(req);
    await needUser(b.uid);
    await r.set(`unread:${b.uid}`, 0);
    return res.json({ ok: true });
  }

  throw fail(405, 'Metode tidak didukung.');
});
