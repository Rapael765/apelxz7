import { $, esc, ic, avatar, toast } from './ui.js';
import { api, session } from './api.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
let cur = null; // { id, host, hostUid, room, timers }

const lk = () => {
  if (!window.LivekitClient) throw new Error('Pustaka live belum termuat. Muat ulang halaman.');
  return window.LivekitClient;
};

export const isActive = () => !!cur;

function openUI(isHost, hostName, title) {
  $('#room').classList.add('open');
  $('#room-av').innerHTML = avatar(hostName, 34);
  $('#room-host').textContent = '@' + hostName;
  $('#room-title').textContent = title;
  $('#room-end').style.display = isHost ? 'block' : 'none';
  $('#room-close').style.display = isHost ? 'none' : 'grid';
  $('#stage-wait').style.display = 'grid';
  $('#stage-wait').textContent = isHost ? 'Menyalakan kamera…' : 'Menunggu siaran dimulai…';
  $$stage().forEach((e) => e.remove());
  $('#chat').innerHTML = '';
  $('#vcount').textContent = '0';
}
const $$stage = () => [...document.querySelectorAll('#stage .lk-video')];

function addMsg(m, isHostMsg) {
  const c = $('#chat');
  const d = document.createElement('div');
  d.className = 'msg' + (isHostMsg ? ' h' : '');
  d.innerHTML = `<b>${esc(m.u)}</b>${esc(m.text)}`;
  c.appendChild(d);
  while (c.children.length > 40) c.firstChild.remove();
  c.scrollTop = c.scrollHeight;
}

function floatHeart() {
  const h = document.createElement('div');
  h.className = 'fh';
  h.style.left = Math.random() * 50 + 'px';
  h.style.setProperty('--dx', Math.random() * 40 - 20 + 'px');
  h.innerHTML = ic('heart');
  $('#hearts').appendChild(h);
  setTimeout(() => h.remove(), 2300);
}

function send(msg) {
  if (!cur) return;
  cur.room.localParticipant.publishData(enc.encode(JSON.stringify(msg)), { reliable: true }).catch(() => {});
}

function viewers() { return cur ? cur.room.remoteParticipants.size : 0; }
function count() { if (cur) $('#vcount').textContent = viewers(); }

async function connect(id, isHost, hostUid) {
  const L = lk();
  const me = session.get();
  const { token, url } = await api.liveToken(me.uid, id);
  const room = new L.Room({ adaptiveStream: true, dynacast: true });

  room.on(L.RoomEvent.TrackSubscribed, (track) => {
    const el = track.attach();
    if (track.kind === 'video') {
      el.className = 'lk-video';
      $('#stage').prepend(el);
      $('#stage-wait').style.display = 'none';
    } else {
      el.style.display = 'none';
      document.body.appendChild(el);
    }
  });
  room.on(L.RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((e) => e.remove()));
  room.on(L.RoomEvent.DataReceived, (payload, p) => {
    try {
      const m = JSON.parse(dec.decode(payload));
      if (m.t === 'chat') addMsg(m, p && p.identity === hostUid);
      if (m.t === 'heart') floatHeart();
    } catch { /* abaikan pesan rusak */ }
  });
  room.on(L.RoomEvent.ParticipantConnected, count);
  room.on(L.RoomEvent.ParticipantDisconnected, (p) => {
    count();
    if (!isHost && p.identity === hostUid) hostLeft();
  });
  room.on(L.RoomEvent.Disconnected, () => { if (cur && !isHost) hostLeft(); });

  await room.connect(url, token);
  return room;
}

function hostLeft() {
  $$stage().forEach((e) => e.remove());
  $('#stage-wait').style.display = 'grid';
  $('#stage-wait').textContent = 'Siaran sudah selesai';
}

export async function startHost(title) {
  const me = session.get();
  const { live } = await api.liveStart(me.uid, title);
  cur = { id: live.id, host: true, hostUid: me.uid, room: null, timers: [] };
  openUI(true, me.name, live.title);
  try {
    const room = await connect(live.id, true, me.uid);
    cur.room = room;
    const L = lk();
    await room.localParticipant.setCameraEnabled(true);
    try { await room.localParticipant.setMicrophoneEnabled(true); }
    catch { toast('Mikrofon tidak aktif. Izinkan akses mikrofon agar suaramu terdengar.'); }
    const pub = room.localParticipant.getTrackPublication(L.Track.Source.Camera);
    if (!pub || !pub.track) throw new Error('Kamera tidak bisa diakses.');
    const el = pub.track.attach();
    el.className = 'lk-video mirror';
    $('#stage').prepend(el);
    $('#stage-wait').style.display = 'none';
    const beat = () => api.liveBeat(me.uid, live.id, viewers()).catch(() => {});
    cur.timers.push(setInterval(beat, 8000), setInterval(count, 3000));
    count();
  } catch (e) {
    const msg = e.status === 503 ? e.message : 'Live gagal dimulai. Pastikan kamera diizinkan di browser.';
    await leave();
    toast(msg);
  }
}

export async function join(l) {
  const me = session.get();
  cur = { id: l.id, host: false, hostUid: l.uid, room: null, timers: [] };
  openUI(false, l.host, l.title);
  try {
    cur.room = await connect(l.id, false, l.uid);
    try { await cur.room.startAudio(); } catch { /* butuh interaksi pengguna */ }
    cur.timers.push(setInterval(count, 3000));
    count();
  } catch (e) {
    await leave();
    toast(e.message);
  }
}

export async function leave() {
  if (!cur) return;
  const c = cur;
  cur = null;
  c.timers.forEach(clearInterval);
  try { c.room && c.room.disconnect(); } catch { /* sudah terputus */ }
  document.querySelectorAll('body > audio').forEach((a) => a.remove());
  $('#room').classList.remove('open');
  if (c.host) {
    await api.liveEnd(session.get().uid, c.id).catch(() => {});
    toast('Siaran selesai');
  }
}

export function bindRoomUI() {
  $('#room-end').addEventListener('click', leave);
  $('#room-close').addEventListener('click', leave);
  const sendChat = () => {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text || !cur || !cur.room) return;
    input.value = '';
    const me = session.get();
    const m = { t: 'chat', u: me.name, text };
    addMsg(m, cur.host);
    send(m);
  };
  $('#chat-send').addEventListener('click', sendChat);
  $('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  const heart = () => { floatHeart(); send({ t: 'heart' }); };
  $('#heart-send').addEventListener('click', heart);
  $('#stage').addEventListener('dblclick', heart);
}
