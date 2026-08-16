// InkWaves payment configuration.
// The storefront uses the live Razorpay hosted Payment Page.
window.INKWAVES_PAYMENT_API_BASE = '';
window.INKWAVES_RAZORPAY_PAYMENT_PAGE_URL = 'https://pages.razorpay.com/pl_TQZxgrPxpK4GGO/view';

// Private Razorpay payment-sync Worker URL.
// After deploying the PRIVATE worker, paste only its public workers.dev URL here.
// Example: 'https://inkwaves-payments.your-account.workers.dev'
window.INKWAVES_RAZORPAY_SYNC_API_BASE = '';
window.INKWAVES_ADMIN_API_BASE = window.INKWAVES_RAZORPAY_SYNC_API_BASE;
