import { db, route, fail, parse, text, isUid, isVid, needUser, notify } from './_lib.js';

export default route(async (req, res) => {
  const r = db();

  if (req.method === 'GET') {
    const { comments } = req.query;
    if (!isVid(comments)) throw fail(400, 'ID video tidak valid.');
    const list = await r.lrange(`vc:${comments}`, -50, -1);
    return res.json({ comments: list });
  }

  if (req.method !== 'POST') throw fail(405, 'Metode tidak didukung.');
  const b = parse(req);
  const u = await needUser(b.uid);

  if (b.action === 'like') {
    if (!isVid(b.vid)) throw fail(400, 'ID video tidak valid.');
    const v = await r.get(`v:${b.vid}`);
    if (!v) throw fail(404, 'Video tidak ditemukan.');
    const added = await r.sadd(`vl:${b.vid}`, u.uid);
    if (added) {
      await r.incr(`ulikes:${v.uid}`);
      if (v.uid !== u.uid) await notify(v.uid, { type: 'like', from: u.name, vid: b.vid });
    } else {
      await r.srem(`vl:${b.vid}`, u.uid);
      await r.decr(`ulikes:${v.uid}`);
    }
    return res.json({ liked: !!added, likes: await r.scard(`vl:${b.vid}`) });
  }

  if (b.action === 'comment') {
    if (!isVid(b.vid)) throw fail(400, 'ID video tidak valid.');
    const v = await r.get(`v:${b.vid}`);
    if (!v) throw fail(404, 'Video tidak ditemukan.');
    const body = text(b.text, 140);
    if (!body) throw fail(400, 'Komentar tidak boleh kosong.');
    const c = { uid: u.uid, user: u.name, text: body, t: Date.now() };
    await r.rpush(`vc:${b.vid}`, c);
    if (v.uid !== u.uid) await notify(v.uid, { type: 'comment', from: u.name, text: body, vid: b.vid });
    return res.json({ comment: c, comments: await r.llen(`vc:${b.vid}`) });
  }

  if (b.action === 'follow') {
    if (!isUid(b.target) || b.target === u.uid) throw fail(400, 'Pengguna tidak valid.');
    const t = await r.get(`u:${b.target}`);
    if (!t) throw fail(404, 'Pengguna tidak ditemukan.');
    const added = await r.sadd(`fol:${u.uid}`, b.target);
    if (added) {
      await r.sadd(`fers:${b.target}`, u.uid);
      await notify(b.target, { type: 'follow', from: u.name });
    } else {
      await r.srem(`fol:${u.uid}`, b.target);
      await r.srem(`fers:${b.target}`, u.uid);
    }
    return res.json({ following: !!added, followers: await r.scard(`fers:${b.target}`) });
  }

  if (b.action === 'mark') {
    if (!isVid(b.vid)) throw fail(400, 'ID video tidak valid.');
    const added = await r.sadd(`mk:${u.uid}`, b.vid);
    if (!added) await r.srem(`mk:${u.uid}`, b.vid);
    return res.json({ saved: !!added });
  }

  throw fail(400, 'Aksi tidak dikenal.');
});
