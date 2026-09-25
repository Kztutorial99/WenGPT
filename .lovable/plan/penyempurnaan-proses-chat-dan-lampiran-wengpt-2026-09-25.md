# Penyempurnaan proses chat dan lampiran WenGPT

## Hasil yang akan dibuat
- Status proses hanya tampil pada fase yang tepat: menunggu jawaban atau saat tool benar-benar berjalan, lalu hilang saat teks jawaban sedang mengalir.
- Fokus tidak lagi otomatis pindah ke kolom pesan setelah AI selesai; percakapan otomatis turun setelah jawaban selesai tanpa mengganggu pengguna yang sedang membaca bagian lama.
- Angka pada File Manager dan Linimasa diganti titik status “baru”; status hilang setelah menu dibuka. Riwayat sesi hanya menunjukkan jumlah sesi yang belum dibaca.
- Tambahkan tombol lampiran pada kolom chat. File maksimal 20 MB disimpan sebagai `attached_assets/<nama-file>`, muncul di File Manager, dan dapat dianalisis AI berdasarkan nama, tipe, ukuran, serta cuplikan isi yang aman.

## Detail teknis
- Perluas penyimpanan browser dengan metadata lampiran, status baca per menu/sesi, dan kompatibilitas data lama.
- Baca file teks dengan batas cuplikan; file biner disimpan sebagai data untuk dipulihkan ke sandbox, tetapi tidak dipaksa menjadi teks. Validasi ukuran dan nama file di sisi pengguna dan server.
- Kirim lampiran ke sandbox E2B saat diperlukan dan sertakan ringkasan terstruktur ke konteks chat tanpa memenuhi percakapan dengan isi panjang.
- Gunakan kontrol lampiran AI Elements yang sudah tersedia, notifikasi kesalahan yang jelas, serta uji tampilan ponsel dan desktop.
