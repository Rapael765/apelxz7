import { db, route, fail, parse, text, isName, isUid, needUser, newUid } from './_lib.js';

const NAME_ERR = 'Gunakan 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.';

export default route(async (req, res) => {
  const r = db();

  if (req.method === 'GET') {
    const { name, me, following } = req.query;

    if (following) {
      await needUser(following);
      return res.json({ following: await r.smembers(`fol:${following}`) });
    }

    if (!isName(name)) throw fail(400, 'Nama tidak valid.');
    const uid = await r.get(`uname:${name}`);
    if (!uid) throw fail(404, 'Pengguna tidak ditemukan.');
    const u = await r.get(`u:${uid}`);
    const p = r.pipeline();
    p.scard(`fers:${uid}`);
    p.scard(`fol:${uid}`);
    p.zcard(`vu:${uid}`);
    p.get(`ulikes:${uid}`);
    p.sismember(`fol:${isUid(me) ? me : 'x'}`, uid);
    const [followers, followingN, videos, likes, isF] = await p.exec();
    return res.json({
      uid, name: u.name, bio: u.bio || '', joined: u.joined,
      followers, following: followingN, videos, likes: Number(likes) || 0, isFollowing: !!isF,
    });
  }

  if (req.method !== 'POST') throw fail(405, 'Metode tidak didukung.');
  const b = parse(req);

  if (b.action === 'register') {
    const name = text(b.name, 20).toLowerCase();
    if (!isName(name)) throw fail(400, NAME_ERR);
    const uid = newUid();
    const ok = await r.set(`uname:${name}`, uid, { nx: true });
    if (!ok) throw fail(409, 'Nama itu sudah dipakai. Coba yang lain.');
    const u = { uid, name, bio: '', joined: Date.now() };
    await r.set(`u:${uid}`, u);
    return res.json(u);
  }

  if (b.action === 'update') {
    const u = await needUser(b.uid);
    const next = { ...u };
    if (b.name !== undefined) {
      const name = text(b.name, 20).toLowerCase();
      if (name !== u.name) {
        if (!isName(name)) throw fail(400, NAME_ERR);
        const ok = await r.set(`uname:${name}`, u.uid, { nx: true });
        if (!ok) throw fail(409, 'Nama itu sudah dipakai. Coba yang lain.');
        await r.del(`uname:${u.name}`);
        next.name = name;
      }
    }
    if (b.bio !== undefined) next.bio = text(b.bio, 80);
    await r.set(`u:${u.uid}`, next);
    return res.json(next);
  }

  throw fail(400, 'Aksi tidak dikenal.');
});
