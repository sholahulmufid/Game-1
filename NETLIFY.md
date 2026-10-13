# Hosting CONNECTED di Netlify

Konfigurasi saat ini memindahkan website ke Netlify dan mempertahankan server room/database yang sudah aktif di Sites. Alamat yang terlihat oleh pemain dan tautan undangan mengikuti domain Netlify atau domain sendiri. Ini belum merupakan migrasi backend sepenuhnya; server Sites harus tetap aktif untuk online.

## Deploy dari repository

1. Hubungkan repository project ini ke Netlify melalui Add new project / Import an existing project.
2. Base directory: root project, bukan online/.
3. Build command: npm run build.
4. Publish directory: dist.
5. Deploy. netlify.toml sudah menyertakan proxy /api/room ke server yang aktif.

Folder online/ merupakan checkout Sites terpisah, bukan submodule GitHub. Repository Netlify mengabaikan folder tersebut; server/ menyimpan layanan room dan migrasi yang dibutuhkan untuk menjalankan serta menguji game secara lokal. Jika log menyebut "No url found for submodule path 'online'", pastikan commit perbaikan yang menghapus pencatatan gitlink online sudah masuk ke branch main, lalu Retry deploy.

## Upload manual

Jalankan npm run build lalu upload folder dist melalui Netlify Drop. File dist/_redirects memuat proxy room, sehingga mode online tidak hilang pada upload statis.

## Domain

Netlify menyediakan subdomain netlify.app. Untuk domain sendiri, tambahkan domain yang dimiliki ke Domain management dan ikuti instruksi DNS dari dashboard untuk domain tersebut. Jangan menggunakan contoh domain sebagai domain yang sudah tersedia atau dimiliki.

## Verifikasi setelah deploy

Jalankan node scripts/verify-online.mjs https://ALAMAT-NETLIFY-ATAU-DOMAIN-SENDIRI untuk memeriksa halaman, database room, join/ready, pertukaran gerakan, checkpoint, reconnect, dan cleanup. Lakukan juga playtest dengan dua perangkat. Proxy Netlify belum diuji sebelum ada deployment Netlify yang sebenarnya.

Jika ingin menghapus ketergantungan pada Sites, layanan room dan database perlu dimigrasikan terpisah, misalnya menggunakan integrasi Supabase yang tersedia di project. Mengupload dist saja tanpa proxy tidak menyediakan layanan multiplayer.
