# Penyempurnaan WenGPT seperti Lovable

## Hasil yang akan dibuat
- Mengubah chat menjadi beberapa sesi dengan URL sesi sendiri, daftar **Riwayat sesi**, tombol sesi baru, pindah sesi, dan hapus seluruh sesi aktif.
- Menyimpan sesi, pesan, Linimasa, file, serta ID sandbox di browser; setiap sesi mempunyai sandbox E2B terpisah.
- Menjaga proses jawaban tetap berjalan ketika pengguna membuka File Manager, Linimasa, atau Riwayat, lalu menyambungkan kembali tampilan chat saat kembali.
- Membuat WenGPT memberi respons pembuka singkat sebelum memakai terminal/file, lalu memberi rangkuman setelah pekerjaan selesai.
- Memperbaiki alur eksekusi agar kegagalan diperiksa, dikoreksi, dan diuji ulang sebelum AI menyatakan berhasil.
- Mengganti ikon Linimasa dengan ikon langkah/aktivitas, bukan ikon riwayat.
- Menata ulang Linimasa dengan waktu mulai, durasi, status, langkah yang lebih ringkas, dan satu checkpoint aktif.
- Mengubah tema menjadi **Red Dark Smooth**: merah elegan sebagai aksen, latar gelap netral, tanpa cyan.
- Menghapus efek sentuh yang lengket dan menggantinya dengan umpan balik tekan singkat yang halus.
- Menguji tampilan dan alur utama langsung di WenGPT pada ukuran ponsel 393 px dan desktop.

## Penyimpanan paket dan file
- Paket dipasang langsung di lingkungan E2B milik sesi aktif, sama seperti alat coding berbasis sandbox pada umumnya.
- Paket dan file bertahan selama sandbox sesi tersebut masih hidup; sesi lain memakai lingkungan terpisah.
- Jika sandbox kedaluwarsa, WenGPT membuat sandbox baru dan memberi tahu pengguna bahwa paket sementara perlu dipasang ulang.

## Detail teknis
- Gunakan rute sesi nyata seperti `/chat/:sessionId`; `/` membuka sesi terakhir atau membuat sesi awal secara idempoten.
- Pindahkan streaming ke pengelola global di atas pergantian halaman agar navigasi internal tidak membatalkan permintaan aktif.
- Simpan tiap sesi sebagai `{ id, title, updatedAt, sandboxId, messages }`, dengan langkah tool memiliki cap waktu dan durasi.
- Pertahankan tool `write_file` dan `run_command`, tetapi perketat instruksi agen agar mengumumkan rencana sebelum tool, membaca error, memperbaiki akar masalah, dan memvalidasi hasil.
- Tambahkan penanganan sandbox kedaluwarsa dan pesan kesalahan yang jelas tanpa menampilkan JSON tool mentah.
- Perbarui metadata setiap halaman dan gunakan token warna semantik untuk seluruh tema.
