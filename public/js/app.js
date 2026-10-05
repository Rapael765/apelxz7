import { $, $$, esc, fmt, ago, hue, ic, avatar, paintIcons, rich, toast } from './ui.js';
import { api, session } from './api.js';
import * as live from './live.js';

/* ============ State ============ */
const S = {
  me: null, follows: new Set(), tab: 'fyp', cur: 'home',
  sound: false, unlocked: false, offset: 0, next: null, req: 0, seen: new Set(), seenUnread: 0,
};
const byId = {};
const TABS = ['home', 'live', 'add', 'inbox', 'me'];
const nav = $('#nav');
const feed = $('#feed');

const DEMOS = [
  { id: 'demo1', demo: true, uid: 'otok', user: 'otok', caption: "Selamat datang di o'tok! Ketuk + untuk unggah videomu #otok #halo", hue: 340, glyph: '👋' },
  { id: 'demo2', demo: true, uid: 'otok', user: 'otok', caption: 'Geser ke atas untuk video berikutnya #tips', hue: 200, glyph: '👆' },
  { id: 'demo3', demo: true, uid: 'otok', user: 'otok', caption: 'Mulai live dari tab Live dan biarkan orang lain menonton #live', hue: 150, glyph: '🔴' },
].map((d) => ({ ...d, likes: 0, comments: 0, views: 0, liked: false, saved: false }));

/* ============ Navigasi ============ */
function setView(view, navKey) {
  S.cur = view;
  $$('.view').forEach((x) => x.classList.toggle('active', x.id === 'v-' + view));
  const i = TABS.indexOf(navKey);
  nav.style.setProperty('--i', Math.max(0, i));
  nav.classList.toggle('nopill', i < 0);
  $$('.nav button[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === navKey));
  if (view !== 'home') pauseAll(); else resumeVisible(feed);
}
function go(v) {
  closePlayer();
  if (v === 'home') setView('home', 'home');
  else if (v === 'live') { setView('live', 'live'); loadLive(); }
  else if (v === 'add') openSheet('sh-upload');
  else if (v === 'inbox') { setView('inbox', 'inbox'); loadInbox(); }
  else if (v === 'me') showProfile(S.me.name);
  else if (v === 'explore') { setView('explore', null); initExplore(); }
}
$$('.nav button[data-v]').forEach((b) => b.addEventListener('click', () => go(b.dataset.v)));
$('#btn-search').addEventListener('click', () => go('explore'));
$('#profile-back').addEventListener('click', () => go('home'));

$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  S.tab = b.dataset.tab;
  $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  loadFeed(true);
}));

function syncSound() {
  $('#btn-sound').innerHTML = ic(S.sound ? 'sound' : 'mute');
  $$('video.media').forEach((v) => { v.muted = !S.sound; });
}
$('#btn-sound').addEventListener('click', () => { S.sound = !S.sound; syncSound(); });
// Browser hanya mengizinkan suara setelah interaksi pertama.
window.addEventListener('pointerdown', () => {
  if (S.unlocked) return;
  S.unlocked = true; S.sound = true; syncSound();
}, { once: true });

/* ============ Sheet ============ */
const openSheet = (id) => $('#' + id).classList.add('open');
const closeSheet = (id) => $('#' + id).classList.remove('open');
$$('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(s.id); }));

/* ============ Nama pengguna ============ */
function askName(initial = '') {
  return new Promise((resolve) => {
    $('#w-name').value = initial;
    $('#w-err').textContent = '';
    openSheet('sh-welcome');
    const ok = $('#w-ok');
    const submit = async () => {
      const name = $('#w-name').value.trim().toLowerCase();
      if (!/^[a-z0-9._]{3,20}$/.test(name)) {
        $('#w-err').textContent = 'Gunakan 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.';
        return;
      }
      ok.disabled = true;
      try {
        const u = await api.register(name);
        ok.removeEventListener('click', submit);
        ok.disabled = false;
        closeSheet('sh-welcome');
        resolve(u);
      } catch (e) {
        ok.disabled = false;
        $('#w-err').textContent = e.message;
      }
    };
    ok.addEventListener('click', submit);
  });
}

/* ============ Feed ============ */
function buildFeed(container, list, onMore) {
  container.innerHTML = '';
  if (container._obs) container._obs.disconnect();
  container._onMore = onMore;
  container._obs = new IntersectionObserver((es) => es.forEach((e) => {
    e.isIntersecting ? activate(e.target, container) : deactivate(e.target);
  }), { root: container, threshold: 0.65 });
  appendPosts(container, list);
}
function appendPosts(container, list) {
  list.forEach((p) => {
    const a = postEl(p);
    container.appendChild(a);
    container._obs.observe(a);
  });
}

function postEl(p) {
  byId[p.id] = p;
  const a = document.createElement('article');
  a.className = 'post';
  a.dataset.id = p.id;
  let media;
  if (p.demo) media = `<div class="media seed" style="--h:${p.hue}"><span>${p.glyph}</span></div>`;
  else if (p.kind === 'image') media = `<img class="media" src="${esc(p.url)}" alt="" loading="lazy">`;
  else media = `<video class="media" src="${esc(p.url)}" loop playsinline muted preload="metadata"></video>`;
  a.innerHTML = `${media}<div class="shade"></div><div class="pause-ico">${ic('play')}</div>
    <div class="rail">
      <div class="creator">
        <button class="av-btn" data-user="@${esc(p.user)}" aria-label="Profil ${esc(p.user)}">${avatar(p.user, 50)}</button>
        <button class="follow" data-act="follow" aria-label="Ikuti">+</button>
      </div>
      <button class="r-btn" data-act="like" aria-label="Suka">${ic('heart')}<b class="n-like">0</b></button>
      <button class="r-btn" data-act="comment" aria-label="Komentar">${ic('comment')}<b class="n-cm">0</b></button>
      <button class="r-btn" data-act="mark" aria-label="Simpan">${ic('mark')}<b>Simpan</b></button>
      <button class="r-btn" data-act="share" aria-label="Bagikan">${ic('share')}<b>Bagikan</b></button>
      <div class="disc">${avatar(p.user, 30)}</div>
    </div>
    <div class="info">
      <h3><a data-user="@${esc(p.user)}">@${esc(p.user)}</a></h3>
      <p class="cap">${rich(p.caption)}</p>
      <div class="music">${ic('music')}<span><i>suara asli · @${esc(p.user)}</i></span></div>
      ${p.demo ? '<span class="chip">Contoh</span>' : ''}
    </div>
    <div class="prog"><i></i></div>`;
  const m = a.querySelector('.media');
  m.addEventListener('click', (e) => mediaTap(a, p, e));
  const v = a.querySelector('video');
  if (v) {
    v.addEventListener('timeupdate', () => { if (v.duration) a.querySelector('.prog i').style.width = (v.currentTime / v.duration) * 100 + '%'; });
    v.addEventListener('play', () => a.classList.remove('paused'));
    v.addEventListener('pause', () => { if (a.classList.contains('playing')) a.classList.add('paused'); });
  }
  paint(a);
  return a;
}

function paint(a) {
  const p = byId[a.dataset.id];
  if (!p) return;
  a.querySelector('.n-like').textContent = fmt(p.likes);
  a.querySelector('.n-cm').textContent = fmt(p.comments);
  a.querySelector('[data-act=like]').classList.toggle('on', !!p.liked);
  a.querySelector('[data-act=mark]').classList.toggle('on', !!p.saved);
  const f = a.querySelector('.follow');
  f.classList.toggle('hide', p.demo || p.uid === S.me.uid);
  f.classList.toggle('done', S.follows.has(p.uid));
  f.textContent = S.follows.has(p.uid) ? '✓' : '+';
}
const repaintAll = () => $$('.post').forEach(paint);

function activate(a, container) {
  const p = byId[a.dataset.id];
  if (!p) return;
  a.classList.add('playing');
  a.classList.remove('paused');
  const v = a.querySelector('video');
  if (v) {
    v.muted = !S.sound;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }
  if (!p.demo && !S.seen.has(p.id)) { S.seen.add(p.id); api.view(p.id).catch(() => {}); }
  if (container._onMore && !a.nextElementSibling?.nextElementSibling) container._onMore();
}
function deactivate(a) {
  a.classList.remove('playing', 'paused');
  const v = a.querySelector('video');
  if (v) v.pause();
}
function pauseAll() { $$('video.media').forEach((v) => v.pause()); }
function resumeVisible(container) {
  const box = container.getBoundingClientRect();
  const a = $$('.post', container).find((x) => Math.abs(x.getBoundingClientRect().top - box.top) < box.height / 2);
  if (a) activate(a, container);
}

let lastTap = 0, tapTimer;
function mediaTap(a, p, e) {
  const now = Date.now();
  if (now - lastTap < 300) {
    clearTimeout(tapTimer); lastTap = 0;
    burst(a, e);
    if (!p.liked) toggleLike(p);
  } else {
    lastTap = now;
    tapTimer = setTimeout(() => {
      const v = a.querySelector('video');
      if (v) v.paused ? v.play().catch(() => {}) : v.pause();
    }, 300);
  }
}
function burst(a, e) {
  const r = a.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.left = e.clientX - r.left + 'px';
  b.style.top = e.clientY - r.top + 'px';
  b.innerHTML = ic('heart');
  a.appendChild(b);
  setTimeout(() => b.remove(), 850);
}
const cardFor = (id) => $$('.post').filter((a) => a.dataset.id === id);
const repaintPost = (id) => cardFor(id).forEach(paint);

async function toggleLike(p) {
  if (p.demo) return toast('Ini video contoh. Unggah videomu sendiri!');
  p.liked = !p.liked; p.likes += p.liked ? 1 : -1;
  repaintPost(p.id);
  try {
    const r = await api.like(S.me.uid, p.id);
    p.liked = r.liked; p.likes = r.likes; repaintPost(p.id);
  } catch (e) {
    p.liked = !p.liked; p.likes += p.liked ? 1 : -1; repaintPost(p.id); toast(e.message);
  }
}
async function toggleFollow(uid) {
  if (uid === S.me.uid) return;
  const was = S.follows.has(uid);
  was ? S.follows.delete(uid) : S.follows.add(uid);
  repaintAll();
  try {
    const r = await api.follow(S.me.uid, uid);
    r.following ? S.follows.add(uid) : S.follows.delete(uid);
    repaintAll();
    return r;
  } catch (e) {
    was ? S.follows.add(uid) : S.follows.delete(uid); repaintAll(); toast(e.message);
  }
}

document.addEventListener('click', async (e) => {
  const tag = e.target.closest('[data-tag]');
  if (tag) { e.preventDefault(); closePlayer(); go('explore'); $('#q').value = tag.dataset.tag; runSearch(); return; }
  const usr = e.target.closest('[data-user]');
  if (usr) { e.preventDefault(); const n = usr.dataset.user.replace('@', ''); if (n === 'otok') return toast("Akun resmi o'tok"); closePlayer(); showProfile(n); return; }
  const cap = e.target.closest('.cap');
  if (cap && !e.target.closest('a')) { cap.classList.toggle('open'); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.closest('.post');
  const p = a && byId[a.dataset.id];
  if (!p) return;
  const act = b.dataset.act;
  if (act === 'like') toggleLike(p);
  else if (p.demo) toast('Ini video contoh. Unggah videomu sendiri!');
  else if (act === 'follow') toggleFollow(p.uid);
  else if (act === 'comment') openComments(p);
  else if (act === 'share') openShare(p);
  else if (act === 'mark') {
    p.saved = !p.saved; repaintPost(p.id);
    try { const r = await api.mark(S.me.uid, p.id); p.saved = r.saved; repaintPost(p.id); toast(r.saved ? 'Disimpan' : 'Dihapus dari simpanan'); }
    catch (err) { p.saved = !p.saved; repaintPost(p.id); toast(err.message); }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea')) return;
  const c = $('#player').classList.contains('open') ? $('#player-feed') : S.cur === 'home' ? feed : null;
  if (!c) return;
  if (e.key === 'ArrowDown') c.scrollBy({ top: c.clientHeight, behavior: 'smooth' });
  if (e.key === 'ArrowUp') c.scrollBy({ top: -c.clientHeight, behavior: 'smooth' });
  if (e.key === 'Escape') closePlayer();
});

async function loadFeed(reset) {
  if (!reset && (S.next == null)) return;
  const my = ++S.req;
  try {
    if (reset) {
      pauseAll();
      feed.innerHTML = '<div class="skel"><div class="spinner"></div></div>';
      S.offset = 0; S.next = null;
    }
    const r = await api.videos({ tab: S.tab, uid: S.me.uid, offset: reset ? 0 : S.next });
    if (my !== S.req) return;
    let list = r.videos;
    if (reset) {
      if (!list.length) {
        if (S.tab === 'fyp') list = DEMOS;
        else {
          feed.innerHTML = `<div class="empty"><b>Belum ada yang kamu ikuti</b><span>Ikuti kreator lewat tanda + di avatar mereka untuk melihat video terbaru di sini.</span><button class="btn" id="to-fyp">Jelajahi Untuk Anda</button></div>`;
          $('#to-fyp').addEventListener('click', () => $('.tabs [data-tab=fyp]').click());
          return;
        }
      }
      buildFeed(feed, list, () => loadFeed(false));
    } else appendPosts(feed, list);
    S.next = r.next;
  } catch (e) {
    if (my !== S.req) return;
    if (reset) {
      feed.innerHTML = `<div class="empty"><b>Feed belum bisa dimuat</b><span>${esc(e.message)}</span><button class="btn" id="retry">Coba lagi</button></div>`;
      $('#retry').addEventListener('click', () => loadFeed(true));
    } else toast(e.message);
  }
}

/* ============ Pemutar (dari profil, jelajah, tautan) ============ */
function openPlayer(list, index = 0) {
  pauseAll();
  const pf = $('#player-feed');
  $('#player').classList.add('open');
  buildFeed(pf, list, null);
  requestAnimationFrame(() => { const t = pf.children[index]; if (t) pf.scrollTop = t.offsetTop; });
}
function closePlayer() {
  const pl = $('#player');
  if (!pl.classList.contains('open')) return;
  pl.classList.remove('open');
  if (pl.querySelector('#player-feed')._obs) pl.querySelector('#player-feed')._obs.disconnect();
  $('#player-feed').innerHTML = '';
  if (location.hash) history.replaceState(null, '', location.pathname);
  if (S.cur === 'home') resumeVisible(feed);
}
$('#player-close').addEventListener('click', closePlayer);

/* ============ Komentar ============ */
let cmPost = null;
const cmRow = (c) => `<div class="cm"><a data-user="@${esc(c.user)}">${avatar(c.user, 34)}</a><div><b>@${esc(c.user)}</b><small>${ago(c.t)}</small><div>${rich(c.text)}</div></div></div>`;
async function openComments(p) {
  cmPost = p;
  $('#c-title').textContent = 'Komentar';
  $('#c-list').innerHTML = '<div class="skel" style="height:80px"><div class="spinner"></div></div>';
  openSheet('sh-comments');
  try {
    const { comments } = await api.comments(p.id);
    $('#c-title').textContent = comments.length ? `${fmt(p.comments)} komentar` : 'Komentar';
    $('#c-list').innerHTML = comments.length ? comments.map(cmRow).join('') : '<div style="color:var(--mute)">Belum ada komentar. Tulis yang pertama.</div>';
    $('#c-list').scrollTop = $('#c-list').scrollHeight;
  } catch (e) { $('#c-list').textContent = e.message; }
}
async function sendComment() {
  const text = $('#c-in').value.trim();
  if (!text || !cmPost) return;
  $('#c-in').value = '';
  try {
    const r = await api.comment(S.me.uid, cmPost.id, text);
    const l = $('#c-list');
    if (!l.querySelector('.cm')) l.innerHTML = '';
    l.insertAdjacentHTML('beforeend', cmRow(r.comment));
    l.scrollTop = l.scrollHeight;
    cmPost.comments = r.comments; repaintPost(cmPost.id);
    $('#c-title').textContent = `${fmt(r.comments)} komentar`;
  } catch (e) { toast(e.message); $('#c-in').value = text; }
}
$('#c-send').addEventListener('click', sendComment);
$('#c-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendComment(); });

/* ============ Bagikan ============ */
let shPost = null;
function openShare(p) {
  shPost = p;
  $('#share-del').style.display = p.uid === S.me.uid ? 'flex' : 'none';
  openSheet('sh-share');
}
$('#sh-share').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-share]');
  if (!b || !shPost) return;
  const link = `${location.origin}/#/v/${shPost.id}`;
  const msg = `${shPost.caption} — @${shPost.user} di o'tok`;
  const k = b.dataset.share;
  if (k === 'copy') { try { await navigator.clipboard.writeText(link); toast('Tautan disalin'); } catch { toast(link); } }
  else if (k === 'wa') window.open(`https://wa.me/?text=${encodeURIComponent(msg + ' ' + link)}`, '_blank', 'noopener');
  else if (k === 'tg') window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  else if (k === 'x') window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  else if (k === 'native') { if (navigator.share) navigator.share({ title: "o'tok", text: msg, url: link }).catch(() => {}); else toast(link); }
  closeSheet('sh-share');
});
$('#share-del').addEventListener('click', async () => {
  if (!shPost || !confirm('Hapus video ini secara permanen?')) return;
  try {
    await api.deleteVideo(S.me.uid, shPost.id);
    cardFor(shPost.id).forEach((a) => a.remove());
    closeSheet('sh-share'); toast('Video dihapus');
  } catch (e) { toast(e.message); }
});

/* ============ Unggah ============ */
let upFile = null, upPreview = '';
$('#file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  $('#u-err').textContent = ''; upFile = null; $('#u-ok').disabled = true;
  if (!f) return;
  if (!/^(video|image)\//.test(f.type)) { $('#u-err').textContent = 'Pilih file video atau foto.'; return; }
  if (f.size > 200 * 1024 * 1024) { $('#u-err').textContent = 'File terlalu besar. Maksimal 200 MB.'; return; }
  upFile = f;
  if (upPreview) URL.revokeObjectURL(upPreview);
  upPreview = URL.createObjectURL(f);
  const d = $('#drop');
  $$('video,img', d).forEach((x) => x.remove());
  const el = document.createElement(f.type.startsWith('image/') ? 'img' : 'video');
  el.src = upPreview;
  if (el.tagName === 'VIDEO') Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true });
  d.appendChild(el);
  $('#drop-t').textContent = '';
  $('#u-ok').disabled = false;
});
$('#u-ok').addEventListener('click', async () => {
  if (!upFile) return;
  const btn = $('#u-ok');
  btn.disabled = true; $('#u-err').textContent = '';
  try {
    const { upload } = await import('https://esm.sh/@vercel/blob@1/client');
    const blob = await upload(upFile.name, upFile, {
      access: 'public',
      handleUploadUrl: '/api/upload',
      clientPayload: S.me.uid,
      multipart: upFile.size > 8 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => { btn.textContent = `Mengunggah ${Math.round(percentage)}%`; },
    });
    btn.textContent = 'Menyimpan…';
    await api.createVideo(S.me.uid, blob.url, upFile.type.startsWith('image/') ? 'image' : 'video', $('#u-cap').value);
    upFile = null; $('#file').value = ''; $('#u-cap').value = '';
    $$('#drop video,#drop img').forEach((x) => x.remove());
    $('#drop-t').textContent = 'Pilih video atau foto';
    closeSheet('sh-upload'); toast('Terunggah. Videomu sudah tayang.');
    S.tab = 'fyp';
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'fyp'));
    go('home'); await loadFeed(true);
  } catch (e) {
    $('#u-err').textContent = e.message || 'Gagal mengunggah. Coba lagi.';
    btn.disabled = false;
  } finally { btn.textContent = 'Unggah'; }
});

/* ============ Jelajah ============ */
const tile = (p, i, list) => {
  const t = document.createElement('button');
  t.className = 'tile';
  t.innerHTML = (p.kind === 'image' ? `<img src="${esc(p.url)}" alt="" loading="lazy">` : `<video src="${esc(p.url)}#t=0.1" muted playsinline preload="metadata"></video>`)
    + `<em>${ic('play')}${fmt(p.views)}</em>`;
  t.addEventListener('click', () => openPlayer(list, i));
  return t;
};
function drawTiles(grid, list, emptyMsg) {
  grid.innerHTML = '';
  if (!list.length) { grid.style.display = 'block'; grid.innerHTML = `<div class="empty" style="min-height:30vh"><b>${esc(emptyMsg[0])}</b><span>${esc(emptyMsg[1])}</span></div>`; return; }
  grid.style.display = 'grid';
  list.forEach((p, i) => { byId[p.id] = p; grid.appendChild(tile(p, i, list)); });
}
async function initExplore() {
  $('#q').value = '';
  runSearch();
  try {
    const { tags } = await api.trending();
    $('#trending').innerHTML = tags.map((t) => `<button data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  } catch { $('#trending').innerHTML = ''; }
}
let searchTimer;
async function runSearch() {
  const q = $('#q').value.trim();
  try {
    const { videos } = await api.videos({ tab: 'search', q, uid: S.me.uid });
    drawTiles($('#explore-grid'), videos, q ? ['Tidak ada hasil', 'Coba kata kunci atau tagar lain.'] : ['Belum ada video', 'Jadilah yang pertama mengunggah.']);
  } catch (e) { drawTiles($('#explore-grid'), [], ['Gagal memuat', e.message]); }
}
$('#q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 350); });

/* ============ Profil ============ */
let profile = null, profSeg = 'videos';
async function showProfile(name) {
  const own = name === S.me.name;
  setView('profile', own ? 'me' : null);
  $('#profile-back').style.display = own ? 'none' : 'grid';
  $('#seg-saved').style.display = own ? '' : 'none';
  profSeg = 'videos';
  $$('#profile-seg button').forEach((b) => b.classList.toggle('on', b.dataset.s === 'videos'));
  $('#profile-head').innerHTML = '<div class="spinner"></div>';
  $('#profile-grid').innerHTML = '';
  try { profile = await api.profile(name, S.me.uid); }
  catch (e) { $('#profile-head').innerHTML = `<div class="empty" style="min-height:40vh"><b>Profil tidak ditemukan</b><span>${esc(e.message)}</span></div>`; return; }
  if (profile.isFollowing) S.follows.add(profile.uid); else if (!own) S.follows.delete(profile.uid);
  drawProfileHead(own);
  loadProfileGrid();
}
function drawProfileHead(own) {
  const p = profile;
  $('#profile-head').innerHTML = `${avatar(p.name, 92)}<div style="font-weight:800;font-size:1.2rem">@${esc(p.name)}</div>
    <div class="stats"><div><b>${fmt(p.following)}</b><span>Mengikuti</span></div><div><b id="p-fers">${fmt(p.followers)}</b><span>Pengikut</span></div><div><b>${fmt(p.likes)}</b><span>Suka</span></div></div>
    ${p.bio ? `<div class="bio">${rich(p.bio)}</div>` : ''}
    <div style="display:flex;gap:10px">${own
      ? '<button class="btn ghost" id="edit-prof">Ubah profil</button><button class="btn" id="prof-up">Unggah</button>'
      : `<button class="btn ${S.follows.has(p.uid) ? 'ghost' : ''}" id="prof-follow">${S.follows.has(p.uid) ? 'Mengikuti' : 'Ikuti'}</button>`}</div>`;
  if (own) {
    $('#edit-prof').addEventListener('click', () => { $('#e-name').value = S.me.name; $('#e-bio').value = p.bio || ''; $('#e-err').textContent = ''; openSheet('sh-edit'); });
    $('#prof-up').addEventListener('click', () => openSheet('sh-upload'));
  } else {
    $('#prof-follow').addEventListener('click', async () => {
      const r = await toggleFollow(p.uid);
      if (r) { p.followers = r.followers; p.isFollowing = r.following; drawProfileHead(false); }
    });
  }
}
async function loadProfileGrid() {
  const grid = $('#profile-grid');
  grid.innerHTML = '<div class="spinner" style="margin:30px auto"></div>';
  try {
    const q = profSeg === 'saved' ? { tab: 'saved', uid: S.me.uid } : { tab: 'user', by: profile.uid, uid: S.me.uid };
    const { videos } = await api.videos(q);
    drawTiles(grid, videos, profSeg === 'saved' ? ['Belum ada yang disimpan', 'Ketuk ikon simpan pada video untuk menyimpannya.'] : ['Belum ada video', profile.uid === S.me.uid ? 'Ketuk Unggah untuk mulai tayang.' : 'Pengguna ini belum mengunggah video.']);
  } catch (e) { drawTiles(grid, [], ['Gagal memuat', e.message]); }
}
$$('#profile-seg button').forEach((b) => b.addEventListener('click', () => {
  profSeg = b.dataset.s;
  $$('#profile-seg button').forEach((x) => x.classList.toggle('on', x === b));
  loadProfileGrid();
}));
$('#e-ok').addEventListener('click', async () => {
  try {
    const u = await api.update(S.me.uid, { name: $('#e-name').value.trim().toLowerCase(), bio: $('#e-bio').value });
    S.me = { ...S.me, name: u.name }; session.set(S.me);
    closeSheet('sh-edit'); toast('Profil diperbarui'); showProfile(S.me.name);
  } catch (e) { $('#e-err').textContent = e.message; }
});

/* ============ Inbox ============ */
let notifs = [], inboxF = 'all';
function setBadge(n) { const b = $('#badge'); b.textContent = n > 9 ? '9+' : n; b.classList.toggle('show', n > 0); }
async function loadInbox() {
  $('#inbox-list').innerHTML = '<div class="spinner" style="margin:40px auto"></div>';
  try {
    const r = await api.inbox(S.me.uid);
    notifs = r.items;
    renderInbox();
    if (r.unread) { setBadge(0); api.readInbox(S.me.uid).catch(() => {}); }
  } catch (e) { $('#inbox-list').innerHTML = `<div class="empty"><b>Gagal memuat</b><span>${esc(e.message)}</span></div>`; }
}
function renderInbox() {
  const list = notifs.filter((n) => inboxF === 'all' || n.type === inboxF);
  $('#inbox-list').innerHTML = list.length ? list.map((n, i) => {
    const txt = n.type === 'like' ? `<b>@${esc(n.from)}</b> menyukai videomu`
      : n.type === 'comment' ? `<b>@${esc(n.from)}</b> berkomentar: ${esc(n.text)}`
      : `<b>@${esc(n.from)}</b> mulai mengikutimu`;
    return `<button class="nrow" data-i="${notifs.indexOf(n)}"><div class="kind ${n.type === 'follow' ? 'cy' : ''}">${ic(n.type === 'like' ? 'heart' : n.type === 'comment' ? 'comment' : 'users')}</div><div class="tx">${txt}<small>${ago(n.t)}</small></div></button>`;
  }).join('') : '<div class="empty"><b>Belum ada aktivitas</b><span>Suka, komentar, dan pengikut baru muncul di sini.</span></div>';
}
$('#inbox-list').addEventListener('click', async (e) => {
  const row = e.target.closest('.nrow');
  if (!row) return;
  const n = notifs[+row.dataset.i];
  if (n.type === 'follow') return showProfile(n.from);
  try { const { video } = await api.video(n.vid, S.me.uid); openPlayer([video], 0); }
  catch { toast('Video ini sudah tidak tersedia.'); }
});
$$('#inbox-chips button').forEach((b) => b.addEventListener('click', () => {
  inboxF = b.dataset.f;
  $$('#inbox-chips button').forEach((x) => x.classList.toggle('on', x === b));
  renderInbox();
}));
setInterval(async () => {
  if (!S.me || S.cur === 'inbox' || document.hidden) return;
  try { setBadge((await api.badge(S.me.uid)).unread); } catch { /* abaikan */ }
}, 15000);

/* ============ Live ============ */
let liveTimer;
async function loadLive() {
  clearInterval(liveTimer);
  const draw = async () => {
    if (S.cur !== 'live') return clearInterval(liveTimer);
    const g = $('#live-grid'), em = $('#live-empty');
    try {
      const { lives } = await api.lives();
      em.style.display = lives.length ? 'none' : 'grid';
      if (!lives.length) em.innerHTML = '<b>Belum ada yang live</b><span>Jadilah yang pertama. Ketuk Mulai live di kanan atas.</span>';
      g.innerHTML = lives.map((l) => `<button class="lcard" style="--h:${hue(l.host)}" data-id="${l.id}"><span class="livebadge">LIVE</span><span class="viewcnt">${fmt(l.viewers)} menonton</span>${avatar(l.host, 72)}<div class="meta"><b>@${esc(l.host)}</b><span>${esc(l.title)}</span></div></button>`).join('');
      $$('.lcard', g).forEach((c) => c.addEventListener('click', () => live.join(lives.find((x) => x.id === c.dataset.id))));
    } catch (e) { em.style.display = 'grid'; em.innerHTML = `<b>Live belum bisa dimuat</b><span>${esc(e.message)}</span>`; }
  };
  await draw();
  liveTimer = setInterval(draw, 5000);
}
$('#btn-golive').addEventListener('click', () => { $('#g-title').value = ''; openSheet('sh-golive'); });
$('#g-ok').addEventListener('click', () => { const t = $('#g-title').value.trim(); closeSheet('sh-golive'); live.startHost(t); });
live.bindRoomUI();

/* ============ Tautan langsung (#/v/<id>, #/@nama) ============ */
async function route() {
  const h = location.hash;
  let m;
  if ((m = h.match(/^#\/v\/(v[a-z0-9]+)$/))) {
    try { const { video } = await api.video(m[1], S.me.uid); openPlayer([video], 0); }
    catch { toast('Video tidak ditemukan.'); }
  } else if ((m = h.match(/^#\/@([a-z0-9._]{3,20})$/))) showProfile(m[1]);
}
window.addEventListener('hashchange', route);

/* ============ Mulai ============ */
(async function init() {
  if (window.chrome) document.documentElement.classList.add('refract');
  paintIcons();
  syncSound();
  if ('serviceWorker' in navigator) { /* PWA dasar tanpa cache offline */ }

  S.me = session.get();
  if (!S.me) {
    try {
      const u = await askName('');
      S.me = { uid: u.uid, name: u.name };
      session.set(S.me);
    } catch (e) { toast(e.message); return; }
  }
  try { (await api.following(S.me.uid)).following.forEach((u) => S.follows.add(u)); }
  catch (e) {
    if (e.status === 401) { session.clear(); location.reload(); return; }
  }
  await loadFeed(true);
  try { setBadge((await api.badge(S.me.uid)).unread); } catch { /* abaikan */ }
  route();
})();
