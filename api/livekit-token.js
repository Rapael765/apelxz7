import { AccessToken } from 'livekit-server-sdk';
import { db, route, fail, parse, needUser } from './_lib.js';

export default route(async (req, res) => {
  if (req.method !== 'POST') throw fail(405, 'Metode tidak didukung.');
  const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret, LIVEKIT_URL: url } = process.env;
  if (!key || !secret || !url) {
    throw fail(503, 'Live belum diaktifkan di server. Ikuti langkah LiveKit di README.');
  }
  const b = parse(req);
  const u = await needUser(b.uid);
  const live = await db().get(`live:${b.id}`);
  if (!live) throw fail(404, 'Siaran tidak ditemukan atau sudah selesai.');
  const host = live.uid === u.uid;

  const at = new AccessToken(key, secret, { identity: u.uid, name: u.name, ttl: '4h' });
  at.addGrant({ room: b.id, roomJoin: true, canPublish: host, canSubscribe: true, canPublishData: true });
  res.json({ token: await at.toJwt(), url, host });
});
