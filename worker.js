export default {
  async fetch(request, env) {
    const TOKEN = "13152928:XUXyBQ9XN5UJdCCg9Xcn7Qhnfsz0eTD1MXw";
    const ADMIN_ID = 402413224;
    const API_URL = "https://tapi.bale.ai/bot" + TOKEN + "/";
    const CHANNELS = [
      { id: 4671301600, username: "efootball_1" },
      { id: 5230550803, username: "shopping_efootball_1" },
      { id: 4528794092, username: "News_Salavati" }
    ];

    const KV = env.KV;
    const db = {
      get: async (k, def = {}) => { try { let v = await KV.get(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
      set: async (k, v) => { await KV.put(k, JSON.stringify(v)); }
    };

    async function sendMessage(chatId, text, replyMarkup = null) {
      const payload = { chat_id: chatId, text: text };
      if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
      try { return await fetch(API_URL + "sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch (e) {}
    }

    async function sendVideo(chatId, videoId, caption = null) {
      const payload = { chat_id: chatId, video: videoId };
      if (caption) payload.caption = caption;
      try { return await fetch(API_URL + "sendVideo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch (e) {}
    }

    async function editMessage(chatId, msgId, text) {
      const payload = { chat_id: chatId, message_id: msgId, text: text };
      try { return await fetch(API_URL + "editMessageText", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch (e) {}
    }

    async function editMessageReplyMarkup(chatId, msgId, replyMarkup = null) {
      const payload = { chat_id: chatId, message_id: msgId };
      if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
      try { return await fetch(API_URL + "editMessageReplyMarkup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch (e) {}
    }

    async function checkChannel(userId, ch) {
      try {
        let res = await fetch(API_URL + "getChatMember", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: ch.id, user_id: userId }) });
        let data = await res.json();
        if (data.ok && data.result && ["member", "administrator", "creator"].includes(data.result.status)) return true;
        res = await fetch(API_URL + "getChatMember", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: "@" + ch.username, user_id: userId }) });
        data = await res.json();
        return data.ok && data.result && ["member", "administrator", "creator"].includes(data.result.status);
      } catch (e) { return false; }
    }

    async function checkAllChannels(userId) {
      for (const ch of CHANNELS) { if (!(await checkChannel(userId, ch))) return false; }
      return true;
    }

    async function getUser(uid) { return (await db.get("users", {}))[String(uid)]; }
    async function saveUser(uid, data) { const u = await db.get("users", {}); u[String(uid)] = data; await db.set("users", u); }
    
    async function createUserIfNotExists(uid) {
      const users = await db.get("users", {});
      const s = String(uid);
      if (!users[s]) {
        users[s] = { user_id: uid, join_date: new Date().toISOString(), verified: false, warnings: 0, spam_history: [], violation_history: [] };
        await db.set("users", users);
        if (Object.keys(users).length % 30 === 0) {
          await sendMessage(ADMIN_ID, "🎉 تبریک! تعداد کاربران به " + Object.keys(users).length + " نفر رسید.");
        }
      }
      return users[s];
    }

    async function isBanned(uid) {
      const b = await db.get("banned", {});
      const item = b[String(uid)];
      if (!item) return false;
      if (item.type === "temporary") {
        if (new Date() < new Date(item.until)) return true;
        delete b[String(uid)];
        await db.set("banned", b);
        return false;
      }
      return true;
    }

    async function banUser(uid, by, reason, hours = null) {
      const b = await db.get("banned", {});
      b[String(uid)] = { user_id: uid, banned_by: by, banned_at: new Date().toISOString(), reason: reason, review_requests: 0, last_request: null, type: hours ? "temporary" : "permanent", until: hours ? new Date(Date.now() + hours * 3600000).toISOString() : null };
      await db.set("banned", b);
    }

    async function unbanUser(uid) {
      const b = await db.get("banned", {});
      if (b[String(uid)]) { delete b[String(uid)]; await db.set("banned", b); return true; }
      return false;
    }

    async function getBanned() { return await db.get("banned", {}); }
    async function getAdmins() { return await db.get("admins", {}); }
    async function isMainAdmin(uid) { return Number(uid) === ADMIN_ID; }
    async function isAnyAdmin(uid) { return isMainAdmin(uid) || !!(await getAdmins())[String(uid)]; }
    async function getBox() { return await db.get("box", { old: { name: "باکس قدیمی", desc: "تنظیم نشده", video: null }, new: { name: "باکس جدید", desc: "تنظیم نشده", video: null } }); }
    async function saveBox(type, name, desc, video) { const b = await getBox(); b[type] = { name, desc, video, updated_at: new Date().toISOString() }; await db.set("box", b); }
    async function getWords() { return await db.get("words", []); }
    async function saveWords(w) { await db.set("words", w); }
    async function getRestricted(text) { const w = await getWords(); for (const word of w) { if (text.includes(word)) return word; } return null; }
    async function getAdminState(uid) { return (await db.get("states", {}))[String(uid)]; }
    async function setAdminState(uid, s) { const st = await db.get("states", {}); st[String(uid)] = s; await db.set("states", st); }
    async function clearAdminState(uid) { const st = await db.get("states", {}); delete st[String(uid)]; await db.set("states", st); }
    async function getAdminTemp(uid) { return (await db.get("temps", {}))[String(uid)] || {}; }
    async function setAdminTemp(uid, k, v) { const t = await db.get("temps", {}); if (!t[String(uid)]) t[String(uid)] = {}; t[String(uid)][k] = v; await db.set("temps", t); }
    async function clearAdminTemp(uid) { const t = await db.get("temps", {}); delete t[String(uid)]; await db.set("temps", t); }

    async function checkSpamAndWarnings(uid, text, isCallback = false) {
      if (await isAnyAdmin(uid)) return false;
      
      const u = (await getUser(uid)) || (await createUserIfNotExists(uid));
      const now = Date.now();
      let history = u.spam_history || [];
      history = history.filter(t => now - t < 60000);
      history.push(now);
      u.spam_history = history;
      
      if (history.length > 10) {
        await banUser(uid, "system", "اسپم (بیش از ۱۰ پیام/کلیک در ۱ دقیقه)");
        await saveUser(uid, u);
        await sendMessage(uid, "🚫 شما به دلیل اسپم مسدود شدید!\n\n📩 درخواست بررسی مجدد دهید.", { inline_keyboard: [[{ text: "📩 درخواست بررسی مجدد", callback_data: "user_review_request" }]] });
        return true;
      }

      if (!isCallback && text) {
        const restricted = await getRestricted(text);
        if (restricted) {
          u.warnings = (u.warnings || 0) + 1;
          let vh = u.violation_history || [];
          vh.push({ type: "کلمه نامناسب", word: restricted, message: text, time: new Date().toISOString() });
          u.violation_history = vh;
          if (u.warnings >= 8) {
            await banUser(uid, "system", "استفاده مکرر از کلمات نامناسب (تعداد: " + u.warnings + ")");
            await saveUser(uid, u);
            await sendMessage(uid, "🚫 شما به دلیل کلمات نامناسب مسدود شدید!\n\n📩 درخواست بررسی مجدد دهید.", { inline_keyboard: [[{ text: "📩 درخواست بررسی مجدد", callback_data: "user_review_request" }]] });
            return true;
          }
        }
      }
      await saveUser(uid, u);
      return false;
        }

      // ========== کیبوردها ==========
    const getChannelsKeyboard = () => ({ inline_keyboard: [[{ text: "📢 کانال اول", url: "https://ble.ir/efootball_1" }], [{ text: "📢 کانال دوم", url: "https://ble.ir/shopping_efootball_1" }], [{ text: "📢 کانال سوم", url: "https://ble.ir/News_Salavati" }], [{ text: "✓ بررسی عضویت", callback_data: "check_membership" }]] });
    const getUserMainKeyboard = () => ({ keyboard: [[{ text: "👤 پروفایل من" }]], resize_keyboard: true, is_persistent: true });
    const getGetMethodKeyboard = () => ({ inline_keyboard: [[{ text: "📥 دریافت روش باکس قبل", callback_data: "get_old_method" }], [{ text: "✨ دریافت آخرین روش آپلود شده", callback_data: "get_new_method" }]] });
    const getProfileCopyKeyboard = (uid) => ({ inline_keyboard: [[{ text: "📋 کپی آیدی عددی", callback_data: "copy_id_" + uid }]] });
    
    const getAdminKeyboard = () => ({
      inline_keyboard: [
        [{ text: "📥 بروزرسانی روش باکس ها", callback_data: "admin_update_box" }],
        [{ text: "📢 اطلاع رسانی به همه کاربر ها", callback_data: "admin_broadcast" }],
        [{ text: "📊 آمار ربات", callback_data: "admin_stats" }],
        [{ text: "🚫 لیست مسدودی", callback_data: "admin_ban_list" }],
        [{ text: "📋 لیست مسدودها", callback_data: "admin_banned_users" }],
        [{ text: "👑 افزودن ادمین", callback_data: "admin_add_admin" }],
        [{ text: "📋 لیست ادمین‌ها", callback_data: "admin_admins_list" }],
        [{ text: "🚫 محدود کردن کلمه", callback_data: "admin_restrict_word" }]
      ]
    });

    const getExtraAdminKeyboard = () => ({ inline_keyboard: [[{ text: "🚫 لیست مسدودی", callback_data: "admin_ban_list" }], [{ text: "📋 لیست مسدودها", callback_data: "admin_banned_users" }]] });
    const getBanActionsKeyboard = () => ({ inline_keyboard: [[{ text: "🔒 مسدود کردن کاربر", callback_data: "ban_user_start" }], [{ text: "🔓 رفع مسدودیت کاربر", callback_data: "unban_user_start" }]] });
    const getConfirmKeyboard = () => ({ inline_keyboard: [[{ text: "✅ تایید", callback_data: "confirm_yes" }], [{ text: "❌ لغو و ویرایش", callback_data: "confirm_no" }]] });
    const getBanConfirmKeyboard = () => ({ inline_keyboard: [[{ text: "✅ تایید", callback_data: "ban_confirm_yes" }], [{ text: "❌ لغو", callback_data: "ban_confirm_no" }]] });
    const getUnbanConfirmKeyboard = () => ({ inline_keyboard: [[{ text: "✅ تایید", callback_data: "unban_confirm_yes" }], [{ text: "❌ لغو", callback_data: "unban_confirm_no" }]] });
    const getBroadcastConfirmKeyboard = () => ({ inline_keyboard: [[{ text: "✅ تایید", callback_data: "broadcast_yes" }], [{ text: "❌ لغو", callback_data: "broadcast_no" }]] });
    const getBannedUserKeyboard = () => ({ inline_keyboard: [[{ text: "📩 درخواست بررسی مجدد از ادمین", callback_data: "user_review_request" }]] });
    
    const getReviewActionKeyboard = (uid) => ({
      inline_keyboard: [
        [{ text: "✅ بررسی شد و رفع بن شود", callback_data: "review_approve_" + uid }],
        [{ text: "❌ بررسی شد اما رفع بن نشود", callback_data: "review_reject_" + uid }],
        [{ text: "🔍 بررسی اختلاف ایجاد شده", callback_data: "review_check_" + uid }],
        [{ text: "⏳ مسدودیت موقت", callback_data: "review_temp_ban_" + uid }]
      ]
    });

    const getTempBanDurationsKeyboard = (uid) => ({
      inline_keyboard: [
        [{ text: "۱ ساعت", callback_data: "tban_" + uid + "_1" }],
        [{ text: "۲ ساعت", callback_data: "tban_" + uid + "_2" }],
        [{ text: "۴ ساعت", callback_data: "tban_" + uid + "_4" }],
        [{ text: "۸ ساعت", callback_data: "tban_" + uid + "_8" }],
        [{ text: "۱۶ ساعت", callback_data: "tban_" + uid + "_16" }],
        [{ text: "۲۴ ساعت", callback_data: "tban_" + uid + "_24" }],
        [{ text: "۴۸ ساعت", callback_data: "tban_" + uid + "_48" }],
        [{ text: "۷۲ ساعت", callback_data: "tban_" + uid + "_72" }],
        [{ text: "۱ هفته", callback_data: "tban_" + uid + "_168" }],
        [{ text: "🔙 بازگشت", callback_data: "review_back_" + uid }]
      ]
    });

    const getUpdateBoxTypeKeyboard = () => ({ inline_keyboard: [[{ text: "🆕 باکس جدید", callback_data: "box_new" }], [{ text: "📜 باکس قدیمی‌تر", callback_data: "box_old" }]] });
    const getVideoChoiceKeyboard = () => ({ inline_keyboard: [[{ text: "🎥 بله (بارگذاری ویدیو)", callback_data: "video_yes" }], [{ text: "💾 خیر (ذخیره بدون ویدیو)", callback_data: "video_no" }]] });
    const getRemoveAdminConfirmKeyboard = (uid) => ({ inline_keyboard: [[{ text: "✅ تایید حذف", callback_data: "remove_admin_yes_" + uid }], [{ text: "❌ لغو", callback_data: "remove_admin_no" }]] });
    const getRestrictWordKeyboard = () => ({ inline_keyboard: [[{ text: "➕ اضافه کردن کلمه", callback_data: "add_word" }], [{ text: "➖ حذف کردن کلمه", callback_data: "remove_word" }], [{ text: "🔙 بازگشت", callback_data: "back_to_admin" }]] });
    const getWordConfirmKeyboard = (action) => ({ inline_keyboard: [[{ text: "✅ بله", callback_data: "word_confirm_yes_" + action }], [{ text: "❌ لغو", callback_data: "word_confirm_no" }]] });

    // ========== ارسال پیام‌های خاص ==========
    const sendMembershipRequired = (c) => sendMessage(c, "🔐 **برای استفاده از ربات، لطفاً در کانال‌های زیر عضو شوید:**\n\nپس از عضویت، روی دکمه «✓ بررسی عضویت» کلیک کنید.", getChannelsKeyboard());
    
    const sendGetMethodMessage = async (c) => {
      const box = await getBox();
      const text = "🎁 **لطفاً یک گزینه را انتخاب کنید:**\n\n📅 **آخرین باکس بروزرسانی شده:** `" + box.new.name + "`\n\n👇 روی دکمه زیر بزنید:";
      await sendMessage(c, text, getGetMethodKeyboard());
    };

    const sendUserMainMenu = async (c) => {
      await sendMessage(c, "👋 **منوی اصلی**\n\nاز دکمه‌های زیر استفاده کنید:", getUserMainKeyboard());
      await new Promise(r => setTimeout(r, 300));
      await sendGetMethodMessage(c);
    };

    const sendBannedMessage = (c) => sendMessage(c, "🚫 **کاربر گرامی،**\n\nبا نظر ادمین یا سیستم، استفاده از ربات برای شما امکان‌پذیر نیست!\n\nدر صورت اعتراض، می‌توانید درخواست بررسی مجدد ارسال کنید.", getBannedUserKeyboard());
    
    const sendProfileMessage = async (c, uid) => {
      const user = await getUser(uid);
      const banned = await isBanned(uid);
      const status = banned ? "🚫 مسدود" : "✅ آزاد";
      const text = "👤 **پروفایل من**\n\n📊 وضعیت اکانت: " + status + "\n📩 تعداد درخواست پشتیبانی: 0\n🆔 آیدی عددی: `" + uid + "`";
      await sendMessage(c, text, getProfileCopyKeyboard(uid));
    };

      // ========== پردازش دکمه‌های شیشه‌ای ==========
    async function processCallback(cb) {
      const chatId = cb.message.chat.id;
      const msgId = cb.message.message_id;
      const uid = cb.from.id;
      const data = cb.data;

      // بررسی اسپم برای کلیک‌ها
      if (await checkSpamAndWarnings(uid, "", true)) return;

      // بررسی عضویت (دکمه بررسی عضویت)
      if (data === "check_membership") {
        if (await checkAllChannels(uid)) {
          await sendMessage(chatId, "✅ **عضویت شما تایید شد**");
          await new Promise(r => setTimeout(r, 500));
          await sendUserMainMenu(chatId);
        } else {
          await sendMessage(chatId, "❌ **شما در همه کانال‌ها عضو نشده‌اید!**", getChannelsKeyboard());
        }
        return;
      }
      
      // کپی آیدی (بدون نیاز به چک عضویت)
      if (data.startsWith("copy_id_")) {
        await sendMessage(chatId, "`" + data.replace("copy_id_", "") + "`");
        return;
      }

      // ⛔ اگر کاربر مسدود است، فقط دکمه درخواست بررسی مجدد کار کند
      if (await isBanned(uid)) {
        if (data === "user_review_request") {
          const banned = await getBanned();
          const item = banned[String(uid)];
          if (!item || (item.last_request && (new Date() - new Date(item.last_request)) < 86400000)) {
            await sendMessage(chatId, "⏳ **شما هر ۲۴ ساعت فقط یکبار می‌توانید درخواست بدهید.**");
            return;
          }
          item.review_requests = (item.review_requests || 0) + 1;
          item.last_request = new Date().toISOString();
          await db.set("banned", banned);
          await sendMessage(chatId, "✅ **درخواست شما ارسال شد.**");
          
          const req = "📩 **درخواست بررسی**\n🆔 `" + uid + "`\n📊 تعداد: " + item.review_requests;
          
          // ارسال به ادمین اصلی و ذخیره message_id
          const sentMsgs = [];
          const resMain = await sendMessage(ADMIN_ID, req, getReviewActionKeyboard(uid));
          if (resMain && resMain.result) sentMsgs.push({ chat_id: ADMIN_ID, message_id: resMain.result.message_id });

          // ارسال به ادمین‌های اضافی
          const admins = await getAdmins();
          for (const k of Object.keys(admins)) {
            try {
              const res = await sendMessage(parseInt(k), req, getReviewActionKeyboard(uid));
              if (res && res.result) sentMsgs.push({ chat_id: parseInt(k), message_id: res.result.message_id });
            } catch (e) {}
          }
          
          // ذخیره لیست پیام‌های ارسال شده برای حذف بعدی
          await db.set("review_msg_" + uid, sentMsgs);
        } else {
          const b = (await getBanned())[String(uid)] || {};
          const reason = b.reason || "نقض قوانین";
          await sendMessage(chatId, "🚫 **شما به دلیل " + reason + " مسدود شده‌اید.**\n\n📩 می‌توانید درخواست بررسی مجدد دهید.", getBannedUserKeyboard());
        }
        return;
      }

      // چک عضویت برای بقیه دکمه‌ها (به جز ادمین)
      if (!(await checkAllChannels(uid)) && !(await isAnyAdmin(uid))) {
        await sendMessage(chatId, "🔐 **ابتدا در کانال‌ها عضو شوید.**", getChannelsKeyboard());
        return;
      }

      // ===== ادمین =====
      if (await isAnyAdmin(uid)) {
        if (data === "admin_ban_list") {
          await sendMessage(chatId, "🚫 **لیست مسدودی**", getBanActionsKeyboard());
        } else if (data === "ban_user_start") {
          await setAdminState(uid, "waiting_for_ban_id");
          await sendMessage(chatId, "🆔 **آیدی عددی را ارسال کنید:**");
        } else if (data === "unban_user_start") {
          await setAdminState(uid, "waiting_for_unban_id");
          await sendMessage(chatId, "🆔 **آیدی عددی را ارسال کنید:**");
        } else if (data === "ban_confirm_yes") {
          const t = await getAdminTemp(uid);
          if (t.target_ban_id) {
            await banUser(t.target_ban_id, uid, "دستی توسط ادمین");
            await sendBannedMessage(t.target_ban_id);
            await sendMessage(chatId, "✅ کاربر مسدود شد!", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
            await clearAdminTemp(uid);
          }
        } else if (data === "ban_confirm_no") {
          await clearAdminTemp(uid);
          await sendMessage(chatId, "❌ لغو شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
        } else if (data === "unban_confirm_yes") {
          const t = await getAdminTemp(uid);
          if (t.target_unban_id) {
            if (await unbanUser(t.target_unban_id)) {
              await sendMessage(t.target_unban_id, "✅ **شما رفع مسدودیت شدید.**");
              await sendMessage(chatId, "✅ کاربر رفع مسدودیت شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
            } else {
              await sendMessage(chatId, "❌ کاربر در لیست نیست!", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
            }
            await clearAdminTemp(uid);
          }
        } else if (data === "unban_confirm_no") {
          await clearAdminTemp(uid);
          await sendMessage(chatId, "❌ لغو شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
        } else if (data.startsWith("review_check_")) {
          const target = data.replace("review_check_", "");
          const u = await getUser(target);
          const b = (await getBanned())[target] || {};
          const vh = u ? (u.violation_history || []) : [];
          let txt = "🔍 **گزارش تخلفات کاربر `" + target + "`:**\n\n";
          txt += "🚫 دلیل بن: " + (b.reason || "نامشخص") + "\n";
          txt += "⚠️ تعداد اخطار: " + (u ? (u.warnings || 0) : 0) + "\n\n📝 **لیست تخلفات:**\n";
          if (vh.length) { vh.forEach((v, i) => { txt += (i+1) + ". پیام: «" + v.message + "» (کلمه: " + v.word + ")\n"; }); }
          else { txt += "تاریخچه‌ای یافت نشد.\n"; }
          await sendMessage(chatId, txt, getReviewActionKeyboard(target));
        } else if (data.startsWith("review_temp_ban_")) {
          const target = data.replace("review_temp_ban_", "");
          await sendMessage(chatId, "⏳ **مدت مسدودیت موقت را انتخاب کنید:**", getTempBanDurationsKeyboard(target));
        } else if (data.startsWith("tban_")) {
          const parts = data.split("_");
          const target = parseInt(parts[1]);
          const hours = parseInt(parts[2]);
          await banUser(target, uid, "مسدودیت موقت (" + hours + " ساعت)", hours);
          await sendMessage(chatId, "✅ کاربر `" + target + "` به مدت " + hours + " ساعت مسدود شد.", getAdminKeyboard());
          await sendMessage(target, "🚫 **شما به مدت " + hours + " ساعت مسدود شدید.**", getBannedUserKeyboard());
        } else if (data.startsWith("review_back_")) {
          const target = data.replace("review_back_", "");
          await sendMessage(chatId, "بازگشت به منوی بررسی:", getReviewActionKeyboard(target));
        } else if (data.startsWith("review_approve_")) {
          const target = parseInt(data.replace("review_approve_", ""));
          await unbanUser(target);
          await sendMessage(target, "✅ **درخواست شما پذیرفته شد.**");
          await sendMessage(chatId, "✅ کاربر " + target + " رفع بن شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
          
          // 🟢 حذف دکمه‌ها برای بقیه ادمین‌ها
          const sentMsgs = await db.get("review_msg_" + target, []);
          for (const m of sentMsgs) {
            if (m.chat_id === chatId && m.message_id === msgId) continue;
            await editMessageReplyMarkup(m.chat_id, m.message_id, null);
          }
          await db.set("review_msg_" + target, []);
          
        } else if (data.startsWith("review_reject_")) {
          const target = parseInt(data.replace("review_reject_", ""));
          await sendMessage(target, "❌ **درخواست شما رد شد.**");
          await sendMessage(chatId, "❌ درخواست " + target + " رد شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
          
          // 🟢 حذف دکمه‌ها برای بقیه ادمین‌ها
          const sentMsgs = await db.get("review_msg_" + target, []);
          for (const m of sentMsgs) {
            if (m.chat_id === chatId && m.message_id === msgId) continue;
            await editMessageReplyMarkup(m.chat_id, m.message_id, null);
          }
          await db.set("review_msg_" + target, []);
          
        } else if (data === "admin_banned_users") {
          const banned = await getBanned();
          const keys = Object.keys(banned);
          if (!keys.length) {
            await sendMessage(chatId, "✅ هیچ کاربر مسدودی نیست.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
            return;
          }
          let txt = "📋 **لیست مسدودها:**\n\n";
          keys.forEach((k, i) => { txt += (i+1) + ". 🆔 `" + k + "` - 📩 " + (banned[k].review_requests || 0) + "\n"; });
          await sendMessage(chatId, txt, isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
        } else if (data === "admin_update_box") {
          if (!isMainAdmin(uid)) return;
          await sendMessage(chatId, "📦 **کدوم باکس رو می‌خوای آپلود کنی؟**", getUpdateBoxTypeKeyboard());
        } else if (data === "box_new" || data === "box_old") {
          if (!isMainAdmin(uid)) return;
          await setAdminTemp(uid, "box_type", data === "box_new" ? "new" : "old");
          await setAdminState(uid, "waiting_for_box_name");
          await sendMessage(chatId, "📝 **اسم باکس رو وارد کنید:**");
        } else if (data === "video_yes") {
          if (!isMainAdmin(uid)) return;
          await setAdminState(uid, "waiting_for_video");
          await sendMessage(chatId, "🎥 **ویدیو رو ارسال کنید:**");
        } else if (data === "video_no") {
          if (!isMainAdmin(uid)) return;
          const t = await getAdminTemp(uid);
          await saveBox(t.box_type || "new", t.box_name, t.box_desc, null);
          await clearAdminTemp(uid);
          await sendMessage(chatId, "✅ **باکس بدون ویدیو ذخیره شد!**", getAdminKeyboard());
        } else if (data === "confirm_yes") {
          if (!isMainAdmin(uid)) return;
          await sendMessage(chatId, "🎥 **آیا ویدیویی برای این باکس داری؟**", getVideoChoiceKeyboard());
        } else if (data === "confirm_no") {
          if (!isMainAdmin(uid)) return;
          await clearAdminTemp(uid);
          await setAdminState(uid, "waiting_for_box_name");
          await sendMessage(chatId, "🔄 **دوباره اسم باکس رو وارد کنید:**");
        } else if (data === "admin_broadcast") {
          if (!isMainAdmin(uid)) return;
          await setAdminState(uid, "waiting_for_broadcast");
          await sendMessage(chatId, "📢 **پیام رو بفرستید:**");
        } else if (data === "broadcast_yes") {
          if (!isMainAdmin(uid)) return;
          const t = await getAdminTemp(uid);
          if (t.broadcast_text) {
            const users = await db.get("users", {});
            const total = Object.keys(users).length;
            const res = await sendMessage(chatId, "⏳ در حال ارسال...\n\n👥 تعداد: " + total + "\n📤 ارسال شده: 0 ✓");
            const bMsgId = res && res.result ? res.result.message_id : null;
            let count = 0;
            for (const k of Object.keys(users)) {
              try {
                await sendMessage(users[k].user_id, "📢 **اطلاعیه:**\n\n" + t.broadcast_text);
                count++;
                if (bMsgId && count % 5 === 0) await editMessage(chatId, bMsgId, "⏳ در حال ارسال...\n\n👥 تعداد: " + total + "\n📤 ارسال شده: " + count + " ✓");
              } catch (e) {}
              await new Promise(r => setTimeout(r, 50));
            }
            if (bMsgId) await editMessage(chatId, bMsgId, "✅ **تمام شد!**\n\n👥 تعداد: " + total + "\n📤 ارسال شده: " + count + " ✓");
            else await sendMessage(chatId, "✅ اطلاع‌رسانی تمام شد!", getAdminKeyboard());
            await clearAdminTemp(uid);
          }
        } else if (data === "broadcast_no") {
          if (!isMainAdmin(uid)) return;
          await clearAdminTemp(uid);
          await sendMessage(chatId, "❌ لغو شد.", getAdminKeyboard());
        } else if (data === "admin_stats") {
          if (!isMainAdmin(uid)) return;
          const users = await db.get("users", {});
          const banned = await getBanned();
          const total = Object.keys(users).length;
          const verified = Object.values(users).filter(u => u.verified === true).length;
          const txt = "📊 **آمار ربات**\n\n👥 کل: " + total + "\n✅ تایید شده: " + verified + "\n⏳ تایید نشده: " + (total - verified) + "\n🚫 مسدود: " + Object.keys(banned).length;
          await sendMessage(chatId, txt, getAdminKeyboard());
        } else if (data === "admin_restrict_word") {
          if (!isMainAdmin(uid)) return;
          const words = await getWords();
          const txt = "🚫 **کلمات نامناسب:**\n\n" + (words.length ? words.join("\n") : "لیست خالی است.");
          await sendMessage(chatId, txt, getRestrictWordKeyboard());
        } else if (data === "add_word") {
          if (!isMainAdmin(uid)) return;
          await setAdminState(uid, "waiting_for_new_word");
          await sendMessage(chatId, "📝 **کلمه جدید را ارسال کنید:**");
        } else if (data === "remove_word") {
          if (!isMainAdmin(uid)) return;
          await setAdminState(uid, "waiting_for_remove_word");
          await sendMessage(chatId, "📝 **کلمه برای حذف را ارسال کنید:**");
        } else if (data.startsWith("word_confirm_yes_")) {
          if (!isMainAdmin(uid)) return;
          const action = data.replace("word_confirm_yes_", "");
          const t = await getAdminTemp(uid);
          const word = t.temp_word;
          let words = await getWords();
          if (action === "add" && !words.includes(word)) { words.push(word); await saveWords(words); await sendMessage(chatId, "✅ کلمه اضافه شد.", getAdminKeyboard()); }
          else if (action === "remove" && words.includes(word)) { words = words.filter(w => w !== word); await saveWords(words); await sendMessage(chatId, "✅ کلمه حذف شد.", getAdminKeyboard()); }
          await clearAdminTemp(uid);
        } else if (data === "word_confirm_no") {
          if (!isMainAdmin(uid)) return;
          await clearAdminTemp(uid);
          await sendMessage(chatId, "❌ لغو شد.", getAdminKeyboard());
        } else if (data === "admin_add_admin") {
          if (!isMainAdmin(uid)) return;
          await setAdminState(uid, "waiting_for_new_admin_id");
          await sendMessage(chatId, "👑 **آیدی ادمین جدید را ارسال کنید:**");
        } else if (data === "admin_admins_list") {
          if (!isMainAdmin(uid)) return;
          const admins = await getAdmins();
          const keys = Object.keys(admins);
          let txt = "👑 **لیست ادمین‌ها:**\n\n" + (keys.length ? keys.join("\n") : "خالی");
          txt += "\n\n🆔 **برای حذف، آیدی را ارسال کنید:**";
          await setAdminState(uid, "waiting_for_remove_admin_id");
          await sendMessage(chatId, txt);
        } else if (data.startsWith("remove_admin_yes_")) {
          if (!isMainAdmin(uid)) return;
          const target = data.replace("remove_admin_yes_", "");
          const admins = await getAdmins();
          if (admins[target]) { delete admins[target]; await db.set("admins", admins); await sendMessage(chatId, "✅ ادمین حذف شد.", getAdminKeyboard()); }
          await clearAdminTemp(uid);
        } else if (data === "back_to_admin") {
          await sendMessage(chatId, "👋 پنل ادمین", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
        }
      } else {
        // ===== کاربر عادی =====
        if (data === "get_old_method") {
          const box = (await getBox()).old;
          const text = "🎁 **" + box.name + "**\n\n" + box.desc;
          if (box.video) await sendVideo(chatId, box.video, text);
          else await sendMessage(chatId, text);
        } else if (data === "get_new_method") {
          const box = (await getBox()).new;
          const text = "🎁 **" + box.name + "**\n\n" + box.desc;
          if (box.video) await sendVideo(chatId, box.video, text);
          else await sendMessage(chatId, text);
        }
      }
    }

    // ========== پردازش پیام‌های متنی ==========
    async function processMessage(msg) {
      const chatId = msg.chat.id;
      const uid = msg.from.id;
      const text = msg.text || "";
      const video = msg.video;

      if (await checkSpamAndWarnings(uid, text)) return;

      if (text === "👤 پروفایل من") {
        await createUserIfNotExists(uid);
        await sendProfileMessage(chatId, uid);
        return;
      }
      if (await isBanned(uid)) { 
        const b = (await getBanned())[String(uid)] || {};
        const reason = b.reason || "نقض قوانین";
        await sendMessage(chatId, "🚫 **شما به دلیل " + reason + " مسدود شده‌اید.**\n\n📩 می‌توانید درخواست بررسی مجدد دهید.", getBannedUserKeyboard());
        return; 
      }

      if (await isAnyAdmin(uid)) {
        const state = await getAdminState(uid);
        if (state === "waiting_for_box_name" && isMainAdmin(uid)) {
          await setAdminTemp(uid, "box_name", text);
          await setAdminState(uid, "waiting_for_box_description");
          await sendMessage(chatId, "✅ اسم ذخیره شد. **حالا توضیحات:**");
          return;
        } else if (state === "waiting_for_box_description" && isMainAdmin(uid)) {
          await setAdminTemp(uid, "box_desc", text);
          await clearAdminState(uid);
          const t = await getAdminTemp(uid);
          await sendMessage(chatId, "📦 **پیش‌نمایش:**\n\nاسم: " + t.box_name + "\nتوضیحات: " + text + "\n\nآیا مطمئنید؟", getConfirmKeyboard());
          return;
        } else if (state === "waiting_for_video" && isMainAdmin(uid)) {
          if (video) {
            const t = await getAdminTemp(uid);
            await saveBox(t.box_type || "new", t.box_name, t.box_desc, video.file_id);
            await clearAdminTemp(uid);
            await sendMessage(chatId, "✅ **باکس با ویدیو ذخیره شد!**", getAdminKeyboard());
          } else { await sendMessage(chatId, "❌ لطفاً یک ویدیو ارسال کنید."); }
          return;
        } else if (state === "waiting_for_broadcast" && isMainAdmin(uid)) {
          await setAdminTemp(uid, "broadcast_text", text);
          await clearAdminState(uid);
          await sendMessage(chatId, "📢 **پیش‌نمایش:**\n\n" + text + "\n\nآیا مطمئنید؟", getBroadcastConfirmKeyboard());
          return;
        } else if (state === "waiting_for_new_word" && isMainAdmin(uid)) {
          await setAdminTemp(uid, "temp_word", text);
          await clearAdminState(uid);
          await sendMessage(chatId, "❓ آیا کلمه `" + text + "` اضافه شود؟", getWordConfirmKeyboard("add"));
          return;
        } else if (state === "waiting_for_remove_word" && isMainAdmin(uid)) {
          await setAdminTemp(uid, "temp_word", text);
          await clearAdminState(uid);
          await sendMessage(chatId, "❓ آیا کلمه `" + text + "` حذف شود؟", getWordConfirmKeyboard("remove"));
          return;
        } else if (state === "waiting_for_ban_id") {
          if (/^\d+$/.test(text)) {
            await setAdminTemp(uid, "target_ban_id", parseInt(text));
            await clearAdminState(uid);
            await sendMessage(chatId, "⚠️ مطمئنید؟ " + text, getBanConfirmKeyboard());
          }
          return;
        } else if (state === "waiting_for_unban_id") {
          if (/^\d+$/.test(text)) {
            await setAdminTemp(uid, "target_unban_id", parseInt(text));
            await clearAdminState(uid);
            await sendMessage(chatId, "⚠️ مطمئنید؟ " + text, getUnbanConfirmKeyboard());
          }
          return;
        } else if (state === "waiting_for_new_admin_id" && isMainAdmin(uid)) {
          if (/^\d+$/.test(text)) {
            const admins = await getAdmins();
            admins[text] = { user_id: parseInt(text), added_at: new Date().toISOString() };
            await db.set("admins", admins);
            await clearAdminState(uid);
            await sendMessage(chatId, "✅ ادمین اضافه شد.", getAdminKeyboard());
          }
          return;
        } else if (state === "waiting_for_remove_admin_id" && isMainAdmin(uid)) {
          if (/^\d+$/.test(text)) {
            await clearAdminState(uid);
            await sendMessage(chatId, "⚠️ مطمئنید؟", getRemoveAdminConfirmKeyboard(text));
          }
          return;
        }
        await sendMessage(chatId, "👋 **پنل ادمین**", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
        return;
      }

      await createUserIfNotExists(uid);
      if (await checkAllChannels(uid)) { await sendUserMainMenu(chatId); }
      else { await sendMembershipRequired(chatId); }
    }

    // ========== Webhook ==========
    const url = new URL(request.url);
    if (url.pathname === "/setWebhook") {
      const webhookUrl = url.origin + "/";
      const res = await fetch(API_URL + "setWebhook?url=" + webhookUrl);
      return new Response(JSON.stringify(await res.json()), { headers: { "Content-Type": "application/json" } });
    }
    if (request.method === "POST") {
      try {
        const update = await request.json();
        if (update.callback_query) await processCallback(update.callback_query);
        else if (update.message) await processMessage(update.message);
        return new Response("ok");
      } catch (e) { return new Response("error", { status: 500 }); }
    }
    return new Response("Bot is running!");
  }
};
