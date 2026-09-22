# 🏥 Zhenin Nurse Suite

> Aplikasi web untuk mahasiswa keperawatan Indonesia dalam membuat **LP (Laporan Pendahuluan)** dan **Askep (Asuhan Keperawatan)** dengan bantuan AI.

**Version**: 2.7.2  
**Build**: 2025  
**Platform**: Web (Mobile-first PWA)  
**Author**: Christian / Tian Sumual  
**License**: Proprietary

---

## 📋 DAFTAR ISI

1. [Ringkasan](#-ringkasan)
2. [Fitur Utama](#-fitur-utama)
3. [Arsitektur Sistem](#-arsitektur-sistem)
4. [Tech Stack](#-tech-stack)
5. [Struktur Project](#-struktur-project)
6. [Instalasi & Setup](#-instalasi--setup)
7. [Backend Setup (Google Apps Script)](#-backend-setup-google-apps-script)
8. [Frontend Deployment](#-frontend-deployment)
9. [Environment Variables & Config](#-environment-variables--config)
10. [Alur Aplikasi](#-alur-aplikasi)
11. [API Reference](#-api-reference)
12. [Data Model](#-data-model)
13. [Markdown Syntax Guide](#-markdown-syntax-guide)
14. [Admin Panel](#-admin-panel)
15. [Troubleshooting](#-troubleshooting)
16. [Changelog](#-changelog)
17. [Roadmap](#-roadmap)

---

## 🎯 RINGKASAN

**Zhenin** adalah aplikasi web yang dirancang khusus untuk **mahasiswa keperawatan Indonesia** dalam menyusun dokumen akademik:

- **LP (Laporan Pendahuluan)** — 5 BAB lengkap (Tinjauan Teori → Daftar Pustaka)
- **Askep (Asuhan Keperawatan)** — Pengkajian → Implementasi & Evaluasi 3 hari (SOAP)

Dengan integrasi **Google Gemini AI**, mahasiswa dapat membuat dokumen lengkap dalam ~30 detik, dibandingkan dengan cara manual yang memakan waktu berjam-jam.

**Value Proposition:**
- ⚡ Generate dokumen dalam 30 detik
- 📝 Output format Word (DOCX) siap kumpul
- 💎 Sistem token (1 token = 1 dokumen)
- 📱 Mobile-first (bisa dipakai di HP)

---

## ✨ FITUR UTAMA

### **Untuk User (Mahasiswa):**

| Fitur | Deskripsi |
|-------|-----------|
| 🔐 **Login Aman** | Password format `USER-XXXX-XXXX`, device binding |
| ✨ **AI Generator** | Generate LP/Askep dengan topik + data pasien |
| 📄 **WYSIWYG Editor** | Edit dokumen langsung di preview |
| 📝 **Markdown Mode** | Edit raw markdown untuk kontrol penuh |
| 📤 **Export DOCX** | Download Word siap kumpul |
| 📁 **File Manager** | Rename, duplikat, hapus dokumen |
| 👤 **Profil Mahasiswa** | Nama, NIM, kelompok, CI, auto-fill di dokumen |
| 🎓 **Onboarding** | Tutorial 4 slide untuk pengguna baru |
| 💎 **Token System** | 1 token = 1 dokumen, tidak hangus |
| 📊 **Kuota Harian** | Rate limit 10 AI/hari (default) |
| 📥 **Backup/Restore** | Export & import JSON |

### **Untuk Admin:**

| Fitur | Deskripsi |
|-------|-----------|
| 🔑 **Generate Password** | Batch generate (1-100) dengan paket |
| 💎 **Top-up Token** | Tambah token user by password/username |
| 👥 **User Management** | Search, filter, revoke, reset device |
| ⚙️ **Template Manager** | Edit struktur LP/Askep, AI config |
| 📊 **Statistics** | Total user, token, AI usage, timeout rate |
| 🔧 **Settings** | Kontak admin, pricing, promo banner |
| 🔍 **Key Stats** | Status API keys rotation |
| 📈 **AI Logs** | Track prompt & response AI |

### **Sistem Otomatis:**

- 🔄 **Multi-key Rotation** — 3-5 API key Gemini dengan fallback
- 🛡️ **Session Guard** — Auto-logout kalau session invalid
- 💰 **Auto-refund Token** — Kalau AI gagal, token kembali
- 🚦 **Rate Limiting** — Per menit/jam/hari
- 🚫 **Prompt Blacklist** — Cegah prompt off-topic
- 💾 **Auto Backup** — Setiap 10 menit
- 📱 **Responsive Layout** — Mobile, tablet, desktop
