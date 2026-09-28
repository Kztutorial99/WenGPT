# Tema WEBH berbasis keputusan AI

## Hasil yang dibangun
- Ubah pergantian tema dari pencocokan kata pada pesan menjadi keputusan WenGPT saat memahami topik.
- WenGPT memilih `WEBH` untuk pembahasan keamanan, reverse engineering, dan topik terkait; memilih `Prime` kembali setelah topik selesai.
- Permintaan pengguna untuk mengganti tema tetap dihormati.
- Terapkan tema sesi yang sama ke chat, File Manager, Linimasa, Terminal, Riwayat, dan Pengaturan.
- Animasi pertama menampilkan kotak lalu simbol; pengulangan berikutnya hanya menganimasikan simbol dengan jeda yang halus.
- Tambahkan aliran titik ringan pada garis kisi dan naikkan kejelasan warna kedua tema tanpa mengubah susunan layar.

## Teknis
- Tambahkan event mode ke aliran respons dan simpan hasil keputusan AI pada sesi aktif.
- Pindahkan pembungkus tema ke tata letak bersama agar seluruh halaman mewarisi token warna yang sama.
- Pisahkan animasi masuk wadah dari siklus simbol; gunakan transform/opacity agar ringan dan hormati pengaturan pengurangan gerak.
- Uji perpindahan Prime → WEBH → Prime, permintaan tema langsung, navigasi lintas halaman, serta tampilan ponsel dan desktop.
- Periksa hasil build, kirim perubahan ke GitHub dengan Git Data API, lalu pastikan deployment Vercel berstatus READY.
