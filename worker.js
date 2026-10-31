export default {
  async fetch(request, env, ctx) {
    const TOKEN = "1770378457:ANe6HwJnllzJ1qTjLQkcuOi1x8IH0zcUCGY";
    const ADMIN_ID = 402413224;
    const API_URL = "https://tapi.bale.ai/bot" + TOKEN + "/";
    const CHANNELS = [
      { id: 4671301600, username: "efootball_1" },
      { id: 5230550803, username: "shopping_efootball_1" },
      { id: 4528794092, username: "News_Salavati" }
    ];

    async function sendMessage(chatId, text, replyMarkup) {
      const payload = { chat_id: chatId, text: text };
      if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
      return fetch(API_URL + "sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    async function checkChannel(userId, channel) {
      try {
        const res = await fetch(API_URL + "getChatMember", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: channel.id, user_id: userId })
        });
        const data = await res.json();
        return data.ok && data.result && ["member", "administrator", "creator"].includes(data.result.status);
      } catch (e) {
        return false;
      }
    }

    async function checkAllChannels(userId) {
      for (const ch of CHANNELS) {
        if (!(await checkChannel(userId, ch))) {
          return false;
        }
      }
      return true;
    }

    const getChannelsKeyboard = () => ({
      inline_keyboard: [
        [{ text: "📢 کانال اول", url: "https://ble.ir/efootball_1" }],
        [{ text: "📢 کانال دوم", url: "https://ble.ir/shopping_efootball_1" }],
        [{ text: "📢 کانال سوم", url: "https://ble.ir/News_Salavati" }],
        [{ text: "✓ بررسی عضویت", callback_data: "check_membership" }]
      ]
    });

    const getMethodKeyboard = () => ({
      inline_keyboard: [[{ text: "🎁 دریافت روش", callback_data: "get_method" }]]
    });

    const sendMembershipRequired = (chatId) => sendMessage(chatId, "🔐 **برای استفاده از ربات، لطفاً در کانال‌های زیر عضو شوید:**\n\nپس از عضویت، روی دکمه «✓ بررسی عضویت» کلیک کنید.", getChannelsKeyboard());

    const sendMethod = (chatId) => sendMessage(chatId, "🎁 **روش باکس**\n\nتوضیحات روش باکس تنظیم نشده است.", getMethodKeyboard());

    const url = new URL(request.url);
    if (url.pathname === "/setWebhook") {
      const webhookUrl = url.origin + "/";
      const res = await fetch(API_URL + "setWebhook?url=" + webhookUrl);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (request.method === "POST") {
      const update = await request.json();
      
      if (update.callback_query) {
        const cb = update.callback_query;
        const chatId = cb.message.chat.id;
        const userId = cb.from.id;
        const data = cb.data;

        if (data === "check_membership") {
          if (await checkAllChannels(userId)) {
            await sendMessage(chatId, "✅ **عضویت شما تایید شد**");
            await sendMethod(chatId);
          } else {
            await sendMessage(chatId, "❌ **شما در همه کانال‌ها عضو نشده‌اید!**", getChannelsKeyboard());
          }
        } else if (data === "get_method") {
          await sendMethod(chatId);
        }
        return new Response("ok");
      }

      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (userId == ADMIN_ID) {
          await sendMessage(chatId, "👋 به پنل ادمین خوش اومدی!");
          return new Response("ok");
        }

        if (await checkAllChannels(userId)) {
          await sendMethod(chatId);
        } else {
          await sendMembershipRequired(chatId);
        }
      }
      return new Response("ok");
    }

    return new Response("Bot is running!");
  }
};
