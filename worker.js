// حافظه موقت ضداسپم در سطح Worker؛ از نوشتن مکرر در KV برای هر پیام جلوگیری می‌کند.
// این داده فقط برای کنترل نرخ پیام در همان isolate است و اطلاعات دائمی کاربران نیست.
const SPAM_MEMORY = new Map();
const BANNED_NOTICE_MEMORY = new Map();

export default {
  async fetch(request, env, ctx) {
    const TOKEN = "13152928:q7hjUZELQK_DxjiNhRi65KH9Tcwxh3WQiL0";
    const ADMIN_ID = 402413224;
    const API_URL = "https://tapi.bale.ai/bot" + TOKEN + "/";
    const CHANNELS = [
      { id: 4671301600, username: "efootball_1" },
      { id: 5230550803, username: "shopping_efootball_1" },
      { id: 4528794092, username: "News_Salavati" }
    ];

    const KV = env.KV;
