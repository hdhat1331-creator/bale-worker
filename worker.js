export default {
  async fetch(request) {
    const TOKEN = "1770378457:ANe6HwJnllzJ1qTjLQkcuOi1x8IH0zcUCGY";
    const ADMIN_ID = 402413224;
    const API_URL = "https://tapi.bale.ai/bot" + TOKEN + "/";
    
    const url = new URL(request.url);

    // تنظیم Webhook
    if (url.pathname === "/setWebhook") {
      const webhookUrl = url.origin + "/";
      const res = await fetch(API_URL + "setWebhook?url=" + webhookUrl);
      return new Response(JSON.stringify(await res.json()), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // دریافت پیام
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        // ارسال پاسخ ساده برای تست
        if (update.message) {
          const chatId = update.message.chat.id;
          await fetch(API_URL + "sendMessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "✅ ربات با موفقیت به کلادفلر وصل شد! (نسخه تست)"
            })
          });
        }
        return new Response("ok");
      } catch (e) {
        return new Response("error");
      }
    }
    return new Response("Bot is running!");
  }
};
