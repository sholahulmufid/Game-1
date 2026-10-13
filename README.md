# CONNECTED — Chained Together Adventure

Platformer co-op 2 pemain dengan Canvas dan JavaScript. Nova dan Echo tampil sebagai robot imut dalam dunia pastel cream, pink, lilac, dan mint. Keduanya terhubung tali energi sepanjang 260 unit, menyelesaikan mekanisme fisik, dan masuk exit bersama.

## Main sekarang

Main online tanpa akun: **[CONNECTED — Kabur Bareng](https://connected-kabur-bareng.sholahulmufid26.chatgpt.site)**. Buka tautan ini pada kedua perangkat, atau klik **Mainkan Online.url**. Nova membuat room, lalu membagikan tautan undangan ke Echo; keduanya menekan **Aku siap**.

Jalankan `Mainkan Game.cmd`, atau `npm run dev`, lalu buka **http://127.0.0.1:4175/**. Pilih **Main berdua di satu keyboard**. Mode lokal tidak memerlukan internet atau Supabase. Font memiliki fallback lokal.

| Tindakan | Nova | Echo di mode lokal | Online, di setiap perangkat |
| --- | --- | --- | --- |
| Bergerak | A / D | ← / → | A / D atau ← / → |
| Lompat | W / Space | ↑ | W / Space / ↑ |
| Interact | E | ↓ / Enter | E / ↓ / Enter |
| Pull / anchor | F | Shift kanan | F / Shift kanan |
| Emote | 1–4 | Pilih Echo pada kontrol layar, lalu klik emote | 1–4 |
| Menu | Esc | Esc | Esc |

Tekan **Kontrol layar** untuk tombol sentuh. Di mode lokal, tombol **Kontrol Nova ⇄** mengganti karakter yang dikendalikan tombol layar dan emote. Laptop/desktop direkomendasikan; mode lokal membutuhkan keyboard yang mendukung beberapa tombol bersamaan.

## Tujuh sektor

1. **Connection** — gerakan, lompat, batas tali, exit bersama.
2. **Two Signals** — satu pemain per plate, tahan bersamaan 1 detik. Gate mengunci terbuka supaya kalian bisa berjalan menuju exit.
3. **Hold Me** — anchor tahan Pull di tepi. Partner menahan Interact saat turun untuk mengulur tali. Core otomatis diambil saat dekat, lalu anchor menarik partner naik. Bawa core ke socket sambil menahan Interact untuk membuat jembatan.
4. **Broken Bridge** — dua celah, platform bergerak, ayunan tali, spike, dan dua checkpoint.
5. **Heavy Core** — berdiri di sisi berbeda cell, tahan Interact bersama, lalu berjalan ke generator. Jika satu pemain melepas, cell jatuh.
6. **Laser Facility** — switch Nova di kiri mematikan laser 4 detik; Echo melewati laser lalu menekan switch kanan untuk membantu Nova.
7. **Final Escape** — gabungan semua mekanik dengan timer 02:30. Restart manual atau setelah waktu habis memberi timer baru dari checkpoint; respawn hazard mempertahankan sisa waktu.

Tali mempertahankan momentum tangensial untuk ayunan. Pull di tanah menahan posisi anchor dan menarik partner, dengan bantuan arah ke tepi saat partner berada di bawah platform. Coyote time dan jump buffer membuat gerakan lebih ramah. Checkpoint tersimpan saat kedua pemain mendekat, dan hazard mengembalikan pasangan ke checkpoint. Layar hasil menampilkan waktu, jatuh, penyelamatan, restart, dan pair rating.

## Aktifkan online dua perangkat

Versi hosting sudah menyertakan layanan private room dan penyimpanan checkpoint. Tidak perlu mengisi kredensial Supabase untuk mode ini. Website dihosting melalui Sites, dengan endpoint `/api/room` dan database Cloudflare D1. Kode room melindungi sesi dua pemain; website dapat dibuka tanpa akun setelah publikasi publik.

1. Buka tautan website online yang sama pada kedua perangkat.
2. Pemain pertama memilih **Ajak partner** dan memasukkan nickname. Ia menjadi Nova.
3. Pilih **Salin tautan undangan** atau bagikan kode room. Partner membuka tautan dan memasukkan nickname berbeda sebagai Echo.
4. Keduanya menekan **Aku siap**. Game dimulai ketika kedua pemain terhubung.

Untuk preview lokal, `npm run dev` menyediakan endpoint yang sama dan database SQLite di folder `.connected/` (diabaikan Git). Alamat `127.0.0.1` hanya untuk komputer sendiri; bagikan alamat hosting kepada partner.

Nova menjadi authority untuk physics bersama, objek, checkpoint, laser, dan exit; Echo memprediksi gerakan lokal dan mengoreksi posisi dari snapshot Nova. Posisi karakter jarak jauh diinterpolasi pada Canvas. Mode hosting mengirim paket terbaru melalui HTTPS, dengan jeda 80 ms antar pertukaran dan hanya satu permintaan berjalan per pemain. Jumlah pertukaran sebenarnya mengikuti latensi internet. Perintah next/restart ditahan sampai host mengaku sudah menerimanya agar tidak tertimpa input gerakan. Checkpoint terpisah dari posisi langsung, identitas pemain disimpan sebagai hash di server, dan room hanya menyediakan dua kursi.

Integrasi Supabase tetap tersedia sebagai alternatif: kosongkan `roomEndpoint` pada **config.js**, isi URL dan public anon/publishable key, lalu jalankan **supabase/schema.sql** sekali di project Supabase. Adapter ini menggunakan [Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast) dan SDK versi 2.57.4; jangan gunakan service-role key. Versi hosting bawaan tidak bergantung pada konfigurasi alternatif ini.

Lobby mengecek koneksi secara berkala. Jika paket partner hilang selama 2 detik, simulasi berhenti dan menunggu koneksi. Database menandai pemain offline setelah 16 detik tanpa heartbeat. Saat tersambung lagi, host melanjutkan dari checkpoint. Identitas disimpan di browser; kembali dengan browser, kode room, dan nickname yang sama. Room kedaluwarsa setelah 24 jam. Pause online hanya menghentikan input pemain yang membuka menu.

## Verifikasi

`npm test` menguji collision/lompat, batas tali, pengambilan core dan rescue, carrying dua pemain, plate, switch dan durasi laser, checkpoint, joint exit, timer, serta satu traversal tujuh sektor memakai input simulasi tanpa mengubah flag misi. Pengujian PostgreSQL lokal dengan PGlite memeriksa room dua pemain, RLS, token, ready, save host, reconnect, replay, dan expiry. Happy DOM dengan Canvas mock memeriksa menu, keyboard, pause, pergantian level, render semua sektor, hasil, replay, dan mute terpisah. Protokol Broadcast diuji dengan paket lokal, termasuk sequence setelah reconnect.

Pengujian tambahan memakai SQL dari migrasi hosting dan dua client HTTP: create/join, siap, input/world, perintah yang dikonfirmasi host, reconnect, replay, dan expiry. Tes tersebut tidak menggantikan playtest manusia atau pengukuran 60 FPS pada laptop. Target durasi sesi 20–30 menit dari PRD belum diukur dengan pemain; rute optimal pada simulasi lebih singkat.

Alamat produksi sudah lolos 9 pemeriksaan HTTP dengan dua identitas pemain: halaman/API, create/join, ready, pertukaran gerakan, checkpoint, penolakan pemain ketiga, reconnect, dan keluar room. Ulangi dengan `node scripts/verify-online.mjs https://connected-kabur-bareng.sholahulmufid26.chatgpt.site`.

## Source hosting

Source Sites berada di **online/**. Perbarui frontend utama, jalankan `node scripts/sync-online.mjs`, lalu build source hosting. Manifest `.openai/hosting.json` menyimpan identitas Site dan binding database; `online/db/schema.ts` serta `online/drizzle/` menyimpan migrasi schema. Folder **dist/** utama adalah keluaran frontend statis; room hosting memerlukan server dari **online/**, bukan hanya upload frontend ke static hosting.

## Berkas utama

`app.js`: menu/HUD/lobby/result · `game.js`: keyboard, loop 60 Hz, prediksi · `physics.js`: dunia dan constraint · `renderer.js`: visual Canvas · `levels.js`: tujuh sektor · `multiplayer.js`: RPC/Broadcast/reconnect · `audio.js`: ambient dan SFX hasil sintesis.
