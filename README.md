# o'tok

Video pendek, live, dan komunitas. Frontend statis + API serverless di Vercel.

## Struktur

```
otok/
├─ api/                  Fungsi serverless Vercel (Node.js)
│  ├─ _lib.js            Koneksi database dan helper bersama
│  ├─ users.js           Daftar, ubah profil, lihat profil
│  ├─ videos.js          Feed, jelajah, unggah, hapus, tagar populer
│  ├─ interact.js        Suka, komentar, ikuti, simpan
│  ├─ inbox.js           Notifikasi
│  ├─ live.js            Daftar siaran live
│  ├─ livekit-token.js   Token masuk ruang live
│  └─ upload.js          Izin unggah file ke Vercel Blob
├─ public/               Frontend (disajikan langsung)
│  ├─ index.html
│  ├─ css/style.css
│  ├─ js/{app,api,ui,live}.js
│  ├─ manifest.json, icon.svg
├─ package.json
├─ vercel.json
└─ .env.example
```

## Deploy lewat GitHub dan Vercel

1. Buat repo baru di GitHub, lalu unggah seluruh isi folder ini.
2. Di vercel.com pilih **Add New → Project**, impor repo tadi. Framework preset: **Other**. Tidak perlu build command. Klik **Deploy**.
3. Setelah proyek dibuat, buka tab **Storage** di proyek tersebut dan hubungkan:
   - **Upstash Redis** (dari Marketplace): menyimpan akun, video, suka, komentar, notifikasi.
   - **Blob**: menyimpan file video dan foto.
   Variabel lingkungan terisi otomatis.
4. Untuk **Live**, buat proyek gratis di https://cloud.livekit.io lalu tambahkan tiga variabel di **Settings → Environment Variables**:
   `LIVEKIT_URL` (berbentuk `wss://...livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
5. Klik **Redeploy** agar variabel baru terbaca.

Tanpa langkah 4, semua fitur tetap jalan kecuali Live.

## Jalankan di komputer sendiri

```bash
npm i -g vercel
npm install
vercel link
vercel env pull .env.local
vercel dev
```

## Catatan penting

- **Akun masih sederhana.** Identitas pengguna disimpan di browser (nama + ID acak), belum ada kata sandi. Cocok untuk prototipe. Untuk produksi, tambahkan login (misalnya Clerk, Auth.js, atau Supabase Auth) dan verifikasi token di setiap endpoint API.
- **Belum ada moderasi.** Sebelum dibuka untuk publik, tambahkan fitur laporan, pembatasan laju (rate limit), dan pemeriksaan konten.
- **Feed berurutan waktu.** "Untuk Anda" menampilkan video terbaru, belum memakai rekomendasi.
- Video tersimpan di Vercel Blob, jadi mengikuti batas paket Blob dan Redis yang kamu pakai.
