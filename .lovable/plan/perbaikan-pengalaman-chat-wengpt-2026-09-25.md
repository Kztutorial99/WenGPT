# Perbaikan pengalaman chat WenGPT

## Hasil yang akan dibuat
- Menerapkan tampilan **modern glassmorphism dark** yang sudah dipilih tanpa mengubah identitas dan fungsi WenGPT.
- Menghilangkan geser horizontal pada layar ponsel, termasuk untuk teks panjang, kode, tabel, URL, dan hasil terminal.
- Membuat scroll mengikuti jawaban saat pengguna berada di bawah, berhenti saat pengguna membaca pesan lama, dan menyediakan tombol kembali ke pesan terbaru.
- Merapikan kolom pesan agar tingginya menyesuaikan isi, aman terhadap keyboard dan safe area ponsel, serta nyaman untuk kirim atau hentikan jawaban.
- Merapikan jawaban Markdown: judul, paragraf, daftar, kutipan, tautan, tabel, kode, dan tanda baca tampil konsisten.
- Menampilkan proses terminal/file dalam kartu ringkas yang tertutup secara default.

## Detail teknis
- Gunakan komponen AI Elements untuk percakapan, pesan Markdown, kolom pesan, status loading, dan kartu tool; sesuaikan visualnya dengan token desain WenGPT.
- Pertahankan penyimpanan riwayat dan protokol streaming yang sudah ada.
- Perketat instruksi sistem agar jawaban mengikuti bahasa pengguna dan struktur Markdown yang bersih.
- Uji pada lebar ponsel 393 px dan desktop, termasuk kasus teks/kode sangat panjang, scroll saat streaming, reset chat, stop, dan pengiriman pesan.
- Setelah lolos pemeriksaan, kirim perubahan ke GitHub dan pastikan deployment Vercel siap.
