// InkWaves V8.7 secure payment configuration.
// IMPORTANT: checkout intentionally has NO editable Razorpay Payment Page fallback.
// Paste the URL you receive after deploying the PRIVATE V8.7 Cloudflare Worker.
// Example: https://inkwaves-payments.your-subdomain.workers.dev
window.INKWAVES_PAYMENT_API_BASE = '';
window.INKWAVES_RAZORPAY_PAYMENT_PAGE_URL = '';
window.INKWAVES_RAZORPAY_SYNC_API_BASE = window.INKWAVES_PAYMENT_API_BASE;
window.INKWAVES_ADMIN_API_BASE = window.INKWAVES_PAYMENT_API_BASE;
