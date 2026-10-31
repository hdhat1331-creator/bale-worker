export default {
  async fetch(request, env) {
    // ========== تنظیمات ==========
    const TOKEN = "13152928:XUXyBQ9XN5UJdCCg9Xcn7Qhnfsz0eTD1MXw";
    const ADMIN_ID = 402413224;
    const API_URL = "https://tapi.bale.ai/bot" + TOKEN + "/";
    const CHANNELS = [
      { id: 4671301600, username: "efootball_1" },
      { id: 5230550803, username: "shopping_efootball_1" },
      { id: 4528794092, username: "News_Salavati" }
    ];

    const KV = env.KV;

    // ========== توابع دیتابیس ==========
    async function dbGet(key, def = {}) {
      const val = await KV.get(key);
      if (!val) return def;
      try { return JSON.parse(val); } catch { return def; }
    }
    async function dbSet(key, val) {
      await KV.put(key, JSON.stringify(val));
    }

    // ========== ارسال پیام ==========
    async function sendMessage(chatId, text, replyMarkup = null) {
      const payload = { chat_id: chatId, text: text };
      if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
      try {
        return await fetch(API_URL + "sendMessage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (e) { return null; }
    }

    // ========== چک عضویت ==========
    async function checkChannel(userId, channel) {
      try {
        let res = await fetch(API_URL + "getChatMember", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: channel.id, user_id: userId })
        });
        let data = await res.json();
        if (data.ok && data.result && ["member", "administrator", "creator"].includes(data.result.status)) return true;
        
        res = await fetch(API_URL + "getChatMember", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: "@" + channel.username, user_id: userId })
        });
        data = await res.json();
        return data.ok && data.result && ["member", "administrator", "creator"].includes(data.result.status);
      } catch (e) { return false; }
    }

    async function checkAllChannels(userId) {
      for (const ch of CHANNELS) {
        if (!(await checkChannel(userId, ch))) return false;
      }
      return true;
    }

    // ========== کاربران ==========
    async function getUsers() { return await dbGet("users", {}); }
    async function saveUsers(d) { await dbSet("users", d); }

    async function createUserIfNotExists(userId) {
      const users = await getUsers();
      const uid = String(userId);
      if (!users[uid]) {
        users[uid] = { user_id: userId, join_date: new Date().toISOString(), verified: false };
        await saveUsers(users);
        const count = Object.keys(users).length;
        if (count > 0 && count % 30 === 0) {
          await sendMessage(ADMIN_ID, "🎉 **تبریک!**\n\nتعداد کاربران ربات به **" + count + "** نفر رسید!");
        }
      }
      return users[uid];
    }

    // ========== مسدودیت ==========
    async function getBanned() { return await dbGet("banned", {}); }
    async function saveBanned(d) { await dbSet("banned", d); }

    async function isBanned(userId) {
      const banned = await getBanned();
      return !!banned[String(userId)];
    }

    async function banUser(userId, bannedBy) {
      const banned = await getBanned();
      banned[String(userId)] = {
        user_id: userId, banned_by: bannedBy,
        banned_at: new Date().toISOString(),
        review_requests: 0, last_request: null
      };
      await saveBanned(banned);
    }

    async function unbanUser(userId) {
      const banned = await getBanned();
      if (banned[String(userId)]) {
        delete banned[String(userId)];
        await saveBanned(banned);
        return true;
      }
      return false;
    }

    async function canRequestReview(userId) {
      const banned = await getBanned();
      const b = banned[String(userId)];
      if (!b) return false;
      if (!b.last_request) return true;
      return (Date.now() - new Date(b.last_request).getTime()) >= 24 * 60 * 60 * 1000;
    }

    async function registerReviewRequest(userId) {
      const banned = await getBanned();
      const uid = String(userId);
      if (banned[uid]) {
        banned[uid].review_requests = (banned[uid].review_requests || 0) + 1;
        banned[uid].last_request = new Date().toISOString();
        await saveBanned(banned);
      }
    }

    // ========== ادمین‌ها ==========
    async function getAdmins() { return await dbGet("admins", {}); }
    async function saveAdmins(d) { await dbSet("admins", d); }

    const isMainAdmin = (uid) => Number(uid) === ADMIN_ID;
    async function isExtraAdmin(uid) {
      const a = await getAdmins();
      return !!a[String(uid)];
    }
    async function isAnyAdmin(uid) {
      return isMainAdmin(uid) || (await isExtraAdmin(uid));
    }

    // ========== باکس ==========
    async function getBox() {
      return await dbGet("box", { name: "روش باکس", description: "در انتظار تنظیم ادمین" });
    }
    async function saveBox(name, description) {
      await dbSet("box", { name, description, updated_at: new Date().toISOString() });
    }

    // ========== State ادمین ==========
    async function getAdminState(uid) {
      const s = await dbGet("admin_states", {});
      return s[String(uid)];
    }
    async function setAdminState(uid, state) {
      const s = await dbGet("admin_states", {});
      s[String(uid)] = state;
      await dbSet("admin_states", s);
    }
    async function clearAdminState(uid) {
      const s = await dbGet("admin_states", {});
      delete s[String(uid)];
      await dbSet("admin_states", s);
    }

    async function getAdminTemp(uid) {
      const s = await dbGet("admin_temps", {});
      return s[String(uid)] || {};
    }
    async function setAdminTemp(uid, key, value) {
      const s = await dbGet("admin_temps", {});
      if (!s[String(uid)]) s[String(uid)] = {};
      s[String(uid)][key] = value;
      await dbSet("admin_temps", s);
    }
    async function clearAdminTemp(uid) {
      const s = await dbGet("admin_temps", {});
      delete s[String(uid)];
      await dbSet("admin_temps", s);
        }

      // ========== کیبوردها ==========
    const getChannelsKeyboard = () => ({
      inline_keyboard: [
        [{ text: "📢 کانال اول", url: "https://ble.ir/efootball_1" }],
        [{ text: "📢 کانال دوم", url: "https://ble.ir/shopping_efootball_1" }],
        [{ text: "📢 کانال سوم", url: "https://ble.ir/News_Salavati" }],
        [{ text: "✓ بررسی عضویت", callback_data: "check_membership" }]
      ]
    });

    const getUserMainKeyboard = () => ({
      keyboard: [[{ text: "👤 پروفایل من" }]],
      resize_keyboard: true,
      is_persistent: true
    });

    const getMethodKeyboard = () => ({
      inline_keyboard: [[{ text: "🎁 دریافت روش", callback_data: "get_method" }]]
    });

    const getProfileCopyKeyboard = (uid) => ({
      inline_keyboard: [[{ text: "📋 کپی آیدی عددی", callback_data: "copy_id_" + uid }]]
    });

    const getAdminKeyboard = () => ({
      inline_keyboard: [
        [{ text: "📥 بروزرسانی روش باکس ها", callback_data: "admin_update_box" }],
        [{ text: "📢 اطلاع رسانی به همه کاربر ها", callback_data: "admin_broadcast" }],
        [{ text: "📊 آمار ربات", callback_data: "admin_stats" }],
        [{ text: "🚫 لیست مسدودی", callback_data: "admin_ban_list" }],
        [{ text: "📋 لیست مسدودها", callback_data: "admin_banned_users" }],
        [{ text: "👑 افزودن ادمین", callback_data: "admin_add_admin" }],
        [{ text: "📋 لیست ادمین‌ها", callback_data: "admin_admins_list" }]
      ]
    });

    const getExtraAdminKeyboard = () => ({
      inline_keyboard: [
        [{ text: "🚫 لیست مسدودی", callback_data: "admin_ban_list" }],
        [{ text: "📋 لیست مسدودها", callback_data: "admin_banned_users" }]
      ]
    });

    const getBanActionsKeyboard = () => ({
      inline_keyboard: [
        [{ text: "🔒 مسدود کردن کاربر", callback_data: "ban_user_start" }],
        [{ text: "🔓 رفع مسدودیت کاربر", callback_data: "unban_user_start" }]
      ]
    });

    const getConfirmKeyboard = () => ({
      inline_keyboard: [[{ text: "✅ تایید", callback_data: "confirm_yes" }], [{ text: "❌ لغو و ویرایش", callback_data: "confirm_no" }]]
    });

    const getBanConfirmKeyboard = () => ({
      inline_keyboard: [[{ text: "✅ تایید", callback_data: "ban_confirm_yes" }], [{ text: "❌ لغو", callback_data: "ban_confirm_no" }]]
    });

    const getUnbanConfirmKeyboard = () => ({
      inline_keyboard: [[{ text: "✅ تایید", callback_data: "unban_confirm_yes" }], [{ text: "❌ لغو", callback_data: "unban_confirm_no" }]]
    });

    const getBroadcastConfirmKeyboard = () => ({
      inline_keyboard: [[{ text: "✅ تایید", callback_data: "broadcast_yes" }], [{ text: "❌ لغو", callback_data: "broadcast_no" }]]
    });

    const getBannedUserKeyboard = () => ({
      inline_keyboard: [[{ text: "📩 درخواست بررسی مجدد از ادمین", callback_data: "user_review_request" }]]
    });

    const getReviewActionKeyboard = (uid) => ({
      inline_keyboard: [
        [{ text: "✅ بررسی شد و رفع بن شود", callback_data: "review_approve_" + uid }],
        [{ text: "❌ بررسی شد اما رفع بن نشود", callback_data: "review_reject_" + uid }]
      ]
    });

    const getRemoveAdminConfirmKeyboard = (uid) => ({
      inline_keyboard: [[{ text: "✅ تایید حذف", callback_data: "remove_admin_yes_" + uid }], [{ text: "❌ لغو", callback_data: "remove_admin_no" }]]
    });

    // ========== پیام‌های خاص ==========
    const sendMembershipRequired = (c) => sendMessage(c, "🔐 **برای استفاده از ربات، لطفاً در کانال‌های زیر عضو شوید:**\n\nپس از عضویت، روی دکمه «✓ بررسی عضویت» کلیک کنید.", getChannelsKeyboard());

    const sendMethod = async (c) => {
      const box = await getBox();
      await sendMessage(c, "🎁 **برای دریافت " + box.name + " کلیک کنید**\n\n👇 روی دکمه زیر بزنید:", getMethodKeyboard());
    };

    const sendUserMainMenu = async (c) => {
      await sendMessage(c, "👋 **منوی اصلی**\n\nاز دکمه‌های زیر استفاده کنید:", getUserMainKeyboard());
      await new Promise(r => setTimeout(r, 300));
      await sendMethod(c);
    };

    const sendBannedMessage = (c) => sendMessage(c, "🚫 **کاربر گرامی،**\n\nبا نظر ادمین به دلیل پیام‌های نامربوطه شما، دیگر استفاده از ربات برای شما امکان‌پذیر نیست!\n\nدر صورت اعتراض، می‌توانید درخواست بررسی مجدد ارسال کنید.", getBannedUserKeyboard());

    const sendProfile = async (c, uid) => {
      const banned = await isBanned(uid);
      const status = banned ? "🚫 مسدود" : "✅ آزاد";
      const text = "👤 **پروفایل من**\n\n📊 وضعیت اکانت: " + status + "\n📩 تعداد درخواست پشتیبانی: 0\n🆔 آیدی عددی: `" + uid + "`";
      await sendMessage(c, text, getProfileCopyKeyboard(uid));
    };

    // ========== پردازش Callback ==========
    async function processCallback(cb) {
      const chatId = cb.message.chat.id;
      const uid = cb.from.id;
      const data = cb.data;

      if (data === "check_membership") {
        if (await checkAllChannels(uid)) {
          await sendMessage(chatId, "✅ **عضویت شما تایید شد**");
          await new Promise(r => setTimeout(r, 500));
          await sendUserMainMenu(chatId);
        } else {
          await sendMessage(chatId, "❌ **شما در همه کانال‌ها عضو نشده‌اید!**\n\nلطفاً ابتدا عضو شوید و دوباره بررسی کنید.", getChannelsKeyboard());
        }
      }
      else if (data === "get_method") {
        const box = await getBox();
        await sendMessage(chatId, "🎁 **" + box.name + "**\n\n" + box.description);
      }
      else if (data.startsWith("copy_id_")) {
        await sendMessage(chatId, "`" + data.replace("copy_id_", "") + "`");
      }
      else if (data === "user_review_request") {
        if (!(await canRequestReview(uid))) {
          await sendMessage(chatId, "⏳ **شما هر ۲۴ ساعت فقط یکبار می‌توانید درخواست بررسی مجدد بدهید.**");
          return;
        }
        await registerReviewRequest(uid);
        await sendMessage(chatId, "✅ **درخواست شما برای ادمین ارسال شد.**\n\n⏰ پس از ۱۲ الی ۲۴ ساعت بررسی می‌شود.");
        const banned = await getBanned();
        const rc = banned[String(uid)]?.review_requests || 0;
        const req = "📩 **درخواست بررسی مجدد**\n\n🆔 آیدی: `" + uid + "`\n📊 درخواست‌های قبلی: " + rc;
        await sendMessage(ADMIN_ID, req, getReviewActionKeyboard(uid));
        const admins = await getAdmins();
        for (const aid of Object.keys(admins)) {
          try { await sendMessage(Number(aid), req, getReviewActionKeyboard(uid)); } catch (e) {}
        }
      }
      else if (data === "admin_ban_list") {
        if (!(await isAnyAdmin(uid))) return;
        await sendMessage(chatId, "🚫 **لیست مسدودی**", getBanActionsKeyboard());
      }
      else if (data === "ban_user_start") {
        if (!(await isAnyAdmin(uid))) return;
        await setAdminState(uid, "waiting_for_ban_id");
        await sendMessage(chatId, "🆔 **آیدی عددی کاربر را ارسال کنید:**");
      }
      else if (data === "unban_user_start") {
        if (!(await isAnyAdmin(uid))) return;
        await setAdminState(uid, "waiting_for_unban_id");
        await sendMessage(chatId, "🆔 **آیدی عددی کاربر را ارسال کنید:**");
      }
      else if (data === "ban_confirm_yes") {
        if (!(await isAnyAdmin(uid))) return;
        const t = await getAdminTemp(uid);
        if (t.target_ban_id) {
          await banUser(t.target_ban_id, uid);
          await sendBannedMessage(t.target_ban_id);
          await sendMessage(chatId, "✅ **کاربر مسدود شد!**", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
          await clearAdminTemp(uid);
        }
      }
      else if (data === "ban_confirm_no") {
        if (!(await isAnyAdmin(uid))) return;
        await clearAdminTemp(uid);
        await sendMessage(chatId, "❌ مسدود کردن لغو شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
      }
      else if (data === "unban_confirm_yes") {
        if (!(await isAnyAdmin(uid))) return;
        const t = await getAdminTemp(uid);
        if (t.target_unban_id) {
          if (await unbanUser(t.target_unban_id)) {
            await sendMessage(t.target_unban_id, "✅ **شما رفع مسدودیت شدید.**");
            await sendMessage(chatId, "✅ **کاربر رفع مسدودیت شد!**", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
          } else {
            await sendMessage(chatId, "❌ کاربر در لیست نیست!", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
          }
          await clearAdminTemp(uid);
        }
      }
      else if (data === "unban_confirm_no") {
        if (!(await isAnyAdmin(uid))) return;
        await clearAdminTemp(uid);
        await sendMessage(chatId, "❌ رفع مسدودیت لغو شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
      }
      else if (data.startsWith("review_approve_")) {
        if (!(await isAnyAdmin(uid))) return;
        const target = Number(data.replace("review_approve_", ""));
        if (await unbanUser(target)) {
          await sendMessage(target, "✅ **درخواست شما پذیرفته شد.**");
          await sendMessage(chatId, "✅ کاربر " + target + " رفع بن شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
        }
      }
      else if (data.startsWith("review_reject_")) {
        if (!(await isAnyAdmin(uid))) return;
        const target = Number(data.replace("review_reject_", ""));
        await sendMessage(target, "❌ **درخواست شما رد شد.**");
        await sendMessage(chatId, "❌ درخواست " + target + " رد شد.", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
      }
      else if (data === "admin_banned_users") {
        if (!(await isAnyAdmin(uid))) return;
        const banned = await getBanned();
        const keys = Object.keys(banned);
        if (keys.length === 0) {
          await sendMessage(chatId, "✅ **هیچ کاربر مسدودی وجود ندارد.**", isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
          return;
        }
        let txt = "📋 **لیست مسدودها:**\n\n";
        keys.forEach((k, i) => {
          txt += (i + 1) + ". 🆔 `" + k + "` - 📩 درخواست: " + (banned[k].review_requests || 0) + "\n";
        });
        await sendMessage(chatId, txt, isMainAdmin(uid) ? getAdminKeyboard() : getExtraAdminKeyboard());
      }
      else if (data === "admin_update_box") {
        if (!isMainAdmin(uid)) return;
        await setAdminState(uid, "waiting_for_box_name");
        await sendMessage(chatId, "📝 **اسم باکس رو وارد کنید:**");
      }
      else if (data === "admin_broadcast") {
        if (!isMainAdmin(uid)) return;
        await setAdminState(uid, "waiting_for_broadcast");
        await sendMessage(chatId, "📢 **پیام اطلاع‌رسانی رو بفرستید:**");
      }
      else if (data === "admin_stats") {
        if (!isMainAdmin(uid)) return;
        const users = await getUsers();
        const banned = await getBanned();
        const verified = Object.values(users).filter(u => u.verified).length;
        let txt = "📊 **آمار ربات**\n\n";
        txt += "👥 کل: " + Object.keys(users).length + "\n";
        txt += "✅ تایید شده: " + verified + "\n";
        txt += "⏳ تایید نشده: " + (Object.keys(users).length - verified) + "\n";
        txt += "🚫 مسدود: " + Object.keys(banned).length + "\n\n";
        txt += "📅 " + new Date().toISOString().slice(0, 16).replace("T", " ");
        await sendMessage(chatId, txt, getAdminKeyboard());
      }
      else if (data === "admin_add_admin") {
        if (!isMainAdmin(uid)) return;
        await setAdminState(uid, "waiting_for_new_admin_id");
        await sendMessage(chatId, "👑 **آیدی ادمین جدید را ارسال کنید:**");
      }
      else if (data === "admin_admins_list") {
        if (!isMainAdmin(uid)) return;
        const admins = await getAdmins();
        const keys = Object.keys(admins);
        if (keys.length === 0) {
          await sendMessage(chatId, "📋 **لیست ادمین‌ها خالی است.**", getAdminKeyboard());
          return;
        }
        let txt = "👑 **لیست ادمین‌ها:**\n\n";
        keys.forEach((k, i) => {
          txt += (i + 1) + ". 🆔 `" + k + "`\n";
        });
        txt += "\n🆔 **برای حذف، آیدی را ارسال کنید:**";
        await setAdminState(uid, "waiting_for_remove_admin_id");
        await sendMessage(chatId, txt);
      }
      else if (data.startsWith("remove_admin_yes_")) {
        if (!isMainAdmin(uid)) return;
        const target = Number(data.replace("remove_admin_yes_", ""));
        const admins = await getAdmins();
        if (admins[String(target)]) {
          delete admins[String(target)];
          await saveAdmins(admins);
          await sendMessage(chatId, "✅ **ادمین حذف شد!**", getAdminKeyboard());
          try { await sendMessage(target, "⚠️ **شما از ادمینی ربات برکنار شدید.**", getUserMainKeyboard()); } catch (e) {}
        }
      }
      else if (data === "remove_admin_no") {
        if (!isMainAdmin(uid)) return;
        await clearAdminTemp(uid);
        await sendMessage(chatId, "❌ حذف ادمین لغو شد.", getAdminKeyboard());
      }
      else if (data === "confirm_yes") {
        if (!isMainAdmin(uid)) return;
        const t = await getAdminTemp(uid);
        if (t.box_name && t.box_description) {
          await saveBox(t.box_name, t.box_description);
          await sendMessage(chatId, "✅ **باکس بروزرسانی شد!**", getAdminKeyboard());
          await clearAdminTemp(uid);
        }
      }
      else if (data === "confirm_no") {
        if (!isMainAdmin(uid)) return;
        await clearAdminTemp(uid);
        await setAdminState(uid, "waiting_for_box_name");
        await sendMessage(chatId, "🔄 **دوباره اسم باکس رو وارد کنید:**");
      }
      else if (data === "broadcast_yes") {
        if (!isMainAdmin(uid)) return;
        const t = await getAdminTemp(uid);
        if (t.broadcast_text) {
          const users = await getUsers();
          let count = 0;
          for (const k of Object.keys(users)) {
            try { await sendMessage(users[k].user_id, "📢 **اطلاعیه:**\n\n" + t.broadcast_text); count++; } catch (e) {}
            await new Promise(r => setTimeout(r, 50));
          }
          await sendMessage(chatId, "✅ **ارسال شد به " + count + " نفر**", getAdminKeyboard());
          await clearAdminTemp(uid);
        }
      }
      else if (data === "broadcast_no") {
        if (!isMainAdmin(uid)) return;
        await clearAdminTemp(uid);
        await sendMessage(chatId, "❌ اطلاع‌رسانی لغو شد.", getAdminKeyboard());
      }
    }

    // ========== پردازش پیام‌های متنی ==========
    async function processMessage(msg) {
      const chatId = msg.chat.id;
      const uid = msg.from.id;
      const text = msg.text || "";

      // پروفایل
      if (text === "👤 پروفایل من") {
        await createUserIfNotExists(uid);
        await sendProfile(chatId, uid);
        return;
      }

      // بن
      if (await isBanned(uid)) {
        await sendBannedMessage(chatId);
        return;
      }

      // ادمین
      if (await isAnyAdmin(uid)) {
        const state = await getAdminState(uid);

        if (state === "waiting_for_box_name" && isMainAdmin(uid)) {
          await setAdminTemp(uid, "box_name", text);
          await setAdminState(uid, "waiting_for_box_description");
          await sendMessage(chatId, "✅ ذخیره شد. حالا توضیحات رو وارد کنید:");
          return;
        }
        if (state === "waiting_for_box_description" && isMainAdmin(uid)) {
          await setAdminTemp(uid, "box_description", text);
          await clearAdminState(uid);
          const t = await getAdminTemp(uid);
          await sendMessage(chatId, "📦 پیش‌نمایش:\n\nاسم: " + t.box_name + "\nتوضیحات: " + text + "\n\nآیا مطمئنید؟", getConfirmKeyboard());
          return;
        }
        if (state === "waiting_for_broadcast" && isMainAdmin(uid)) {
          await setAdminTemp(uid, "broadcast_text", text);
          await clearAdminState(uid);
          await sendMessage(chatId, "📢 پیش‌نمایش اطلاع‌رسانی:\n\n" + text + "\n\nآیا مطمئنید؟", getBroadcastConfirmKeyboard());
          return;
        }
        if (state === "waiting_for_ban_id") {
          if (/^\d+$/.test(text)) {
            await setAdminTemp(uid, "target_ban_id", Number(text));
            await clearAdminState(uid);
            await sendMessage(chatId, "⚠️ آیا از مسدود کردن کاربر مطمئنید؟\n\n🆔 " + text, getBanConfirmKeyboard());
          } else {
            await sendMessage(chatId, "❌ آیدی عددی معتبر ارسال کنید:");
          }
          return;
        }
        if (state === "waiting_for_unban_id") {
          if (/^\d+$/.test(text)) {
            await setAdminTemp(uid, "target_unban_id", Number(text));
            await clearAdminState(uid);
            await sendMessage(chatId, "⚠️ آیا از رفع مسدودیت مطمئنید؟\n\n🆔 " + text, getUnbanConfirmKeyboard());
          } else {
            await sendMessage(chatId, "❌ آیدی عددی معتبر ارسال کنید:");
          }
          return;
        }
        if (state === "waiting_for_new_admin_id" && isMainAdmin(uid)) {
          if (/^\d+$/.test(text)) {
            const admins = await getAdmins();
            admins[text] = { user_id: Number(text), added_at: new Date().toISOString() };
            await saveAdmins(admins);
            await clearAdminState(uid);
            await sendMessage(chatId, "✅ ادمین اضافه شد!", getAdminKeyboard());
            try { await sendMessage(Number(text), "👑 شما ادمین شدید!", getExtraAdminKeyboard()); } catch (e) {}
          } else {
            await sendMessage(chatId, "❌ آیدی عددی معتبر ارسال کنید:");
          }
          return;
        }
        if (state === "waiting_for_remove_admin_id" && isMainAdmin(uid)) {
          if (/^\d+$/.test(text)) {
            await clearAdminState(uid);
            await sendMessage(chatId, "⚠️ آیا از حذف ادمین مطمئنید؟\n\n🆔 " + text, getRemoveAdminConfirmKeyboard(text));
          } else {
            await sendMessage(chatId, "❌ آیدی عددی معتبر ارسال کنید:");
          }
          return;
        }

        // پنل ادمین
        if (isMainAdmin(uid)) {
          await sendMessage(chatId, "👋 به پنل ادمین خوش اومدی!", getAdminKeyboard());
        } else {
          await sendMessage(chatId, "👋 به پنل ادمین خوش اومدی!", getExtraAdminKeyboard());
        }
        return;
      }

      // کاربر عادی
      await createUserIfNotExists(uid);
      if (await checkAllChannels(uid)) {
        await sendUserMainMenu(chatId);
      } else {
        await sendMembershipRequired(chatId);
      }
    }

    // ========== Webhook ==========
    const url = new URL(request.url);

    if (url.pathname === "/setWebhook") {
      const webhookUrl = url.origin + "/";
      const res = await fetch(API_URL + "setWebhook?url=" + webhookUrl);
      return new Response(JSON.stringify(await res.json()), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (request.method === "POST") {
      try {
        const update = await request.json();
        if (update.callback_query) {
          await processCallback(update.callback_query);
        } else if (update.message) {
          await processMessage(update.message);
        }
        return new Response("ok");
      } catch (e) {
        return new Response("error", { status: 500 });
      }
    }

    return new Response("Bot is running!");
  }
};
