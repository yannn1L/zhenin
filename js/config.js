/* ============================================================
   ZHENIN - Config
   ============================================================ */

export const CONFIG = {
  // ===== APP =====
  APP_NAME: 'Zhenin',
  APP_FULL_NAME: 'Zhenin Keperawatan Suite',
  APP_VERSION: '2.1.0',
  APP_BUILD: '2025-09-19',
  
  // ===== BACKEND =====
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwnqOwEfaLB7UZ_PKBPXZ7UdjV3ZpaQhnH2ZkGY_7b4X46k4TzRUEBFILlYLPLFKyDi/exec',
  
  // ===== CONTACT =====
  CONTACT: {
    name: 'Tian Sumual',
    wa: '6289603970045',
    waDisplay: '0896-0397-0045',
    hours: 'Senin-Jumat, 10:00-14:00 & 16:00-21:00 WITA',
    hoursShort: 'Sen-Jum 10-14 & 16-21',
    note: 'Admin masih mahasiswa, jadwal bisa tidak menentu 🤣'
  },
  
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
    PROFILE: 'zhenin_profile_v1',
    BACKUP: 'zhenin_backup_v1',
    LAYOUT: 'zhenin_layout_v1',
    PROMO_DISMISSED: 'zhenin_promo_dismissed',
    ONBOARDED: 'zhenin_onboarded',
    ADMIN_SESSION: 'zhenin_admin_session_v1',
    CACHED_TEMPLATES: 'zhenin_cached_templates_v1' // ⚠️ NEW
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
    TEMPLATES_CACHE_MS: 24 * 60 * 60 * 1000 // 24 jam
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
  
  // ===== FALLBACK STRUCTURES (untuk preview only) =====
  // Struktur asli ada di Google Sheets (sheet: templates)
  FALLBACK_LP_STRUCTURE: '# BAB I : TINJAUAN TEORI KASUS\n\n## A. Konsep Penyakit\n### 1. Pengertian\n### 2. Penyebab / Etiologi\n### 3. Patofisiologi\n### 4. Tanda dan Gejala\n### 5. Pemeriksaan Penunjang\n### 6. Penatalaksanaan Medis\n\n## B. Pathway / Pohon Masalah\n\n\\page\n\n# BAB II : KONSEP KEBUTUHAN DASAR MANUSIA\n...',
  FALLBACK_ASKEP_STRUCTURE: '## A. IDENTITAS PASIEN\n\n\\page\n\n## B. RIWAYAT KESEHATAN\n...\n\n[TABEL_TTD]'
};

Object.freeze(CONFIG);