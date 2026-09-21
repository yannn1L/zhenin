/* ============================================================
   ZHENIN - Config (v2.3.0)
   Sprint 2C+ : Profile Enhancement + Onboarding + Promo
   ============================================================ */

export const CONFIG = {
  // ===== APP =====
  APP_NAME: 'Zhenin',
  APP_FULL_NAME: 'Zhenin Nurse Suite',
  APP_VERSION: '2.7.1',
  APP_BUILD: '2025-09-19',

  // ===== BACKEND =====
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwCiHvmE1O8lNB6C92knp9VpcTYu_wJLvjBCrqYz8izJ2y86Y0Mu2kTgzqSbMh4T7vT/exec',

  // ===== CONTACT =====
  CONTACT: {
    name: 'Tian',
    wa: '6289603970045',
    waDisplay: '0896-0397-0045',
    hours: 'Senin-Jumat, 10:00-14:00 & 16:00-21:00 WITA',
    hoursShort: 'Sen-Jum 10-14 & 16-21',
    note: 'Admin masih mahasiswa, jadwal bisa tidak menentu'
  },

  // ===== PROFILE FIELDS (untuk Askep) =====
  PROFILE_FIELDS: [
    { key: 'nama', label: 'Nama Mahasiswa', placeholder: 'Sumual', required: true, maxLength: 80 },
    { key: 'nim', label: 'NIM', placeholder: '-', required: false, maxLength: 30 },
    { key: 'kelompok', label: 'Kelompok', placeholder: '6', required: false, maxLength: 20 },
    { key: 'tempatPraktik', label: 'Tempat Praktik', placeholder: 'C5 - Ruang Infeksius', required: false, maxLength: 100 },
    { key: 'periodePraktik', label: 'Periode Praktik', placeholder: '5-7 September 2025', required: false, maxLength: 80 },
    { key: 'ci', label: 'Clinical Instruktur (CI)', placeholder: 'Ns., S.Kep', required: false, maxLength: 100 }
  ],

  // ===== PLACEHOLDER MAPPING (untuk auto-fill markdown) =====
  PLACEHOLDER_MAP: {
    '[NAMA_MHS]': 'nama',
    '[NIM]': 'nim',
    '[KELOMPOK]': 'kelompok',
    '[TEMPAT]': 'tempatPraktik',
    '[PERIODE]': 'periodePraktik',
    '[NAMA_CI]': 'ci'
  },

  // ===== ONBOARDING SLIDES =====
  ONBOARDING_SLIDES: [
    {
      icon: '🎓',
      title: 'Selamat Datang di Zhenin',
      desc: 'Buat LP & Askep lengkap dengan AI hanya dalam 30 detik.'
    },
    {
      icon: '✨',
      title: '3 Langkah Mudah',
      desc: 'Pilih jenis → Isi topik → Generate dengan AI.'
    },
    {
      icon: '💎',
      title: 'Tentang Token',
      desc: '1 token = 1 dokumen. Token tidak hangus. Kalau AI gagal, token kembali.'
    },
    {
      icon: '👤',
      title: 'Jangan Lupa Profil',
      desc: 'Isi profil mahasiswa untuk identitas otomatis di semua dokumen.'
    }
  ],

  // ===== DEVICE PATTERNS =====
  DEVICE_PATTERNS: [
    { pattern: /iPhone/, name: 'iPhone' },
    { pattern: /iPad/, name: 'iPad' },
    { pattern: /iPod/, name: 'iPod' },
    { pattern: /Samsung|SM-/, name: 'Samsung' },
    { pattern: /Xiaomi|Mi |Redmi|POCO/, name: 'Xiaomi' },
    { pattern: /Oppo|OPPO/, name: 'OPPO' },
    { pattern: /Vivo|vivo/, name: 'Vivo' },
    { pattern: /Realme|realme/, name: 'Realme' },
    { pattern: /Huawei|HUAWEI/, name: 'Huawei' },
    { pattern: /Infinix/, name: 'Infinix' },
    { pattern: /Asus|ASUS/, name: 'Asus' },
    { pattern: /Lenovo/, name: 'Lenovo' },
    { pattern: /Windows/, name: 'Windows PC' },
    { pattern: /Macintosh|Mac OS/, name: 'Mac' },
    { pattern: /Linux/, name: 'Linux PC' },
    { pattern: /Android/, name: 'Android' }
  ],

  BROWSER_PATTERNS: [
    { pattern: /Edg\//, name: 'Edge' },
    { pattern: /OPR\/|Opera/, name: 'Opera' },
    { pattern: /Chrome\//, name: 'Chrome' },
    { pattern: /Firefox\//, name: 'Firefox' },
    { pattern: /Safari\//, name: 'Safari' }
  ],

  // ===== STORAGE KEYS =====
  STORAGE: {
    SESSION: 'zhenin_session_v1',
    DEVICE: 'zhenin_device_hash',
    LP: 'zhenin_lp_v1',
    ASKEP: 'zhenin_askep_v1',
    PROFILE: 'zhenin_profile_v2',
    BACKUP: 'zhenin_backup_v1',
    LAYOUT: 'zhenin_layout_v1',
    PROMO_DISMISSED: 'zhenin_promo_dismissed',
    ONBOARDED: 'zhenin_onboarded',
    ADMIN_SESSION: 'zhenin_admin_session_v1',
    CACHED_TEMPLATES: 'zhenin_cached_templates_v1',
    PROMO_CACHE: 'zhenin_promo_cache_v1'
  },

  // ===== TIMING =====
  TIMING: {
    AUTOSAVE_MS: 60 * 1000,
    AUTOBACKUP_MS: 10 * 60 * 1000,
    SESSION_MAX_AGE_MS: 365 * 24 * 60 * 60 * 1000,
    SESSION_REFRESH_MS: 60 * 60 * 1000,
    AI_TIMEOUT_MS: 90000,
    SPLASH_DURATION_MS: 2800,
    TOAST_DURATION_MS: 3200,
    TEMPLATES_CACHE_MS: 24 * 60 * 60 * 1000,
    PROFILE_DEBOUNCE_MS: 500,
    PROMO_CACHE_MS: 60 * 60 * 1000,       // 1 jam
    PROMO_DISMISS_MS: 7 * 24 * 60 * 60 * 1000  // 7 hari
  },

  // ===== LIMITS =====
  LIMITS: {
    TOPIC_MAX: 120,
    PROMPT_MAX: 1500,
    PATIENT_FIELD_MAX: 500,
    DOCS_MAX_PER_TYPE: 200,
    TOKEN_WARNING_THRESHOLD: 2
  },

  // ===== BACKUP =====
  BACKUP: {
    MAX_SNAPSHOTS: 3
  },

  // ===== STORAGE MONITOR =====
  STORAGE_MONITOR: {
    LIMIT_MB: 5,
    WARN_PCT: 80,
    CRIT_PCT: 95
  },

  // ===== BRAND COLORS =====
  COLORS: {
    night: '#0F0B1A',
    deep: '#1A1A2E',
    plum: '#2D1B3D',
    shadow: '#4A2C5A',
    violet: '#6B3FA0',
    lavender: '#A67BC8',
    gold: '#C9A961',
    crimson: '#8B0000'
  },

  // ===== TOPIC SUGGESTIONS =====
  TOPIC_SUGGESTIONS: [
    'Hipertensi Grade II',
    'Diabetes Melitus Tipe 2',
    'Gagal Jantung Kongestif',
    'Stroke Hemoragik',
    'Stroke Iskemik',
    'Penyakit Paru Obstruktif Kronik (PPOK)',
    'Asma Bronkial',
    'Tuberkulosis Paru',
    'Demam Tifoid',
    'Gastritis Akut',
    'Appendisitis Akut',
    'Batu Ginjal (Nefrolitiasis)',
    'Gagal Ginjal Kronik',
    'Anemia Defisiensi Besi',
    'Dengue Hemorrhagic Fever (DHF)',
    'Pneumonia Komunitas',
    'Diabetes Ketoasidosis',
    'Hipoglikemia',
    'Luka Bakar Derajat II',
    'Post Operasi Laparatomi'
  ],

  // ===== DEFAULT PRICING =====
  DEFAULT_PRICING: [
    { package: 'Starter', price: 14900, token: 3, popular: false },
    { package: 'Core', price: 34900, token: 10, popular: true },
    { package: 'Pro', price: 99900, token: 30, popular: false },
    { package: 'Ultimate', price: 199900, token: 80, popular: false }
  ],

  // ===== FALLBACK STRUCTURES =====
  FALLBACK_LP_STRUCTURE: '# BAB I : TINJAUAN TEORI KASUS\n## A. Konsep Penyakit\n...',
  FALLBACK_ASKEP_STRUCTURE: '## A. IDENTITAS PASIEN\n\n\\page\n\n[TABEL_TTD]'
};

Object.freeze(CONFIG);