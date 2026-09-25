# Roadmap

- [x] Design system (dark builder aesthetic, Space Grotesk + JetBrains Mono)
- [x] Streaming AI endpoint using own provider key (AI_API_KEY / AI_BASE_URL / AI_MODEL)
- [x] Builder page: chat + live sandbox preview + code view
- [x] Provider key saved as project secret
- [x] Auto-updating AI address: Kaggle notebook reports its fresh trycloudflare
      URL to Upstash Redis (registry), /api/chat reads it per request and falls
      back to static AI_BASE_URL (no more dead 530 after notebook restarts)
- [x] User: create free Upstash Redis, save AI_REGISTRY_URL + AI_REGISTRY_TOKEN
      as project secrets
- [x] Multi-account Kaggle script (kaggle/foundry_kaggle.py) + web picks first live account
- [x] GitHub Actions auto-restart of dead Kaggle accounts
- [ ] User: GitHub secrets (KAGGLE_USERNAME_1..3, KAGGLE_KEY_1..3, UPSTASH_URL, UPSTASH_TOKEN), dataset rvn-cache public
- [ ] End-to-end test with a real generation (blocked: needs the notebook
      reporting a live tunnel URL)
- [ ] Optional: Vercel build target adjustment once the GitHub repo is imported

## Perbaikan pengalaman chat
- [x] Terapkan gaya modern glassmorphism dark
- [x] Hilangkan overflow horizontal di mobile
- [x] Benahi auto-scroll dan tombol kembali ke bawah
- [x] Rapikan composer dan tampilan Markdown
- [x] Uji mobile/desktop, push, dan verifikasi deployment
