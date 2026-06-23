// ═══════════════════════════════════════════════════════════════════════
// Push notification configuration for Focus PWA
//
// This file lives separately from index.html so your config survives every
// app update — same pattern as firebase-config.js. Paste your 2 values below
// (from deploying the Cloudflare Worker — see SETUP-NOTIFICATIONS.md).
//
// To DISABLE notifications entirely: just don't deploy this file, or leave
// the placeholder values below. The app gracefully falls back to having the
// Notifications toggle hidden in Settings.
// ═══════════════════════════════════════════════════════════════════════

window.PUSH_CONFIG = {
  backendUrl: 'https://focus-push.phil-crumb.workers.dev',
  vapidPublicKey: 'BK4UeK8INzNaAq-jPr94yVAW1-415UDqlEGY5Jg5AOQG-9fd5rrKzIfSO6YocnhuDx8RnVRvI2iOGqvRmUXcU2c',
};
