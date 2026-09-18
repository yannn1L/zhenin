/* ============================================================
   ZHENIN - Config
   Konstanta aplikasi, endpoint, dan pengaturan global
   ============================================================ */

export const CONFIG = {
  // ===== APP =====
  APP_NAME: 'Zhenin',
  APP_FULL_NAME: 'Zhenin Keperawatan Suite',
  APP_VERSION: '2.0.0',
  APP_BUILD: '2025-09-18',
  
  // ===== BACKEND =====
  // Ganti dengan URL Apps Script Anda
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxyICAEaetJyO1xjxMcH3pdbpr-LZxi6y0jvF1sFOViyNjHz3PNsvzhaktkNs9z2XuA/exec',
  
  // ===== CONTACT =====
  CONTACT: {
    name: 'Tian Sumual',
    wa: '6289603970045',
    waDisplay: '0896-0397-0045',
    hours: 'Senin-Jumat, 10:00-14:00 & 16:00-21:00 WITA',
    hoursShort: 'Sen-Jum 10-14 & 16-21',
    note: 'Admin masih mahasiswa, jadwal bisa tidak menentu 🤣'
  },
  
  // ===== DEVICE NAME PARSING =====
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
    ADMIN_SESSION: 'zhenin_admin_session_v1'
  },
  
  // ===== TIMING =====
  TIMING: {
    AUTOSAVE_MS: 60 * 1000,
    AUTOBACKUP_MS: 10 * 60 * 1000,
    SESSION_MAX_AGE_MS: 365 * 24 * 60 * 60 * 1000,
    SESSION_REFRESH_MS: 60 * 60 * 1000,
    AI_TIMEOUT_MS: 60 * 1000,
    SPLASH_DURATION_MS: 2800,
    TOAST_DURATION_MS: 3200
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
  ]
};

Object.freeze(CONFIG);