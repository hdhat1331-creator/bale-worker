// حافظه موقت ضداسپم در سطح Worker؛ از نوشتن مکرر در KV برای هر پیام جلوگیری می‌کند.
// این داده فقط برای کنترل نرخ پیام در همان isolate است و اطلاعات دائمی کاربران نیست.
const SPAM_MEMORY = new Map();
const BANNED_NOTICE_MEMORY = new Map();

export default {
  async fetch(request, env, ctx) {
    const TOKEN = "13152928:4wWYDRGTUOw0v4bi-Tex603G-F-AhtVx4qI";
    const ADMIN_ID = 402413224;
    const API_URL = "https://tapi.bale.ai/bot" + TOKEN + "/";
    const CHANNELS = [
      { id: 4671301600, username: "efootball_1" },
      { id: 5230550803, username: "shopping_efootball_1" },
      { id: 4528794092, username: "News_Salavati" }
    ];

    const KV = env.KV;
    const db = {
      get: async (k, def = {}) => {
        try {
          const raw = await KV.get(k);
          return raw === null ? def : JSON.parse(raw);
        } catch (e) {
          console.error("KV GET failed:", k, e && e.name, e && e.message);
          throw e;
        }
      },
      set: async (k, v) => {
        try {
          await KV.put(k, JSON.stringify(v));
        } catch (e) {
          console.error("KV PUT failed:", k, e && e.name, e && e.message);
          throw e;
        }
      },
      delete: async (k) => {
        try { await KV.delete(k); }
        catch (e) {
          console.error("KV DELETE failed:", k, e && e.name, e && e.message);
          throw e;
        }
      }
    };

    // درخواست‌های API با محدودیت زمان و ثبت خطا؛ خروجی همچنان Response است
    // تا بخش‌های قبلی ربات بدون تغییر در نحوه خواندن پاسخ کار کنند.
    async function apiRequest(method, payload, timeoutMs = 8000) {
      try {
        const response = await fetch(API_URL + method, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (!response.ok) {
          console.error("Bale API HTTP error:", method, response.status);
        } else {
          try {
            const data = await response.clone().json();
            if (data && data.ok === false) {
              console.error("Bale API returned an error:", method, data.description || data);
            }
          } catch (e) {}
        }
        return response;
      } catch (e) {
        console.error("Bale API request failed:", method, e && e.message ? e.message : e);
        return null;
      }
    }

    async function readApiResponse(response) {
      if (!response) return null;
      try { return await response.clone().json(); } catch (e) { return null; }
    }

    async function answerCallbackQuery(callbackId, text = null) {
      if (!callbackId) return;
      const payload = { callback_query_id: callbackId };
      if (text) payload.text = text;
      await apiRequest("answerCallbackQuery", payload, 5000);
    }

    async function sendMessage(chatId, text, replyMarkup = null) {
      const payload = { chat_id: chatId, text: text };
      // در بدنه JSON، reply_markup باید شیء باشد، نه رشته JSON.
      if (replyMarkup) payload.reply_markup = replyMarkup;
      return await apiRequest("sendMessage", payload);
    }

    function makeBroadcastJobId() {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      return Date.now().toString(36) + "-" +
        Array.from(bytes).map(n => n.toString(16).padStart(2, "0")).join("");
    }

    // هر بار فقط ۳۵ کاربر؛ ادامه ارسال با دکمه‌ای که برای ادمین نمایش داده می‌شود.
    async function processBroadcastBatch(job) {
      const BATCH_SIZE = 35;
      const users = Array.isArray(job.user_ids) ? job.user_ids : [];
      const statusText = (finished = false) => {
        const heading = finished ? "✅ اطلاع‌رسانی تمام شد!" : "⏸ ارسال این مرحله تمام شد.";
        const done = Number(job.sent || 0) + Number(job.failed || 0);
        return heading + "\n\n👥 تعداد کاربران: " + job.total +
          "\n📤 ارسال شده: " + job.sent +
          "\n⚠️ ناموفق: " + job.failed +
          "\n📊 پیشرفت: " + done + " از " + job.total;
      };

      if (job.status === "completed") {
        await sendMessage(job.admin_id, "✅ این اطلاع‌رسانی قبلاً به پایان رسیده است.");
        return;
      }
      if (job.processing) {
        const lockTime = job.processing_at ? new Date(job.processing_at).getTime() : 0;
        const lockIsStale = !lockTime || (Date.now() - lockTime > 90000);
        if (!lockIsStale) {
          await sendMessage(job.admin_id, "⏳ این مرحله از ارسال در حال اجراست؛ کمی صبر کنید.");
          return;
        }
        console.warn("Recovering stale broadcast lock:", job.id);
        job.processing = false;
      }

      job.processing = true;
      job.processing_at = new Date().toISOString();
      job.status = "running";
      job.updated_at = new Date().toISOString();
      await db.set("broadcast_job_" + job.id, job);

      // هنگام اجرا دکمه ادامه برداشته می‌شود تا ارسال هم‌زمان شروع نشود.
      if (job.message_id) {
        try { await editMessage(job.admin_id, job.message_id, "⏳ در حال ارسال این مرحله...\n\n" + statusText(false), { inline_keyboard: [] }); } catch (e) {}
      }

      const start = Math.max(0, Number(job.next_index) || 0);
      const end = Math.min(start + BATCH_SIZE, users.length);

      for (let i = start; i < end; i++) {
        let delivered = false;
        try {
          const response = await sendMessage(users[i], "📢 **اطلاعیه:**\n\n" + job.message);
          if (response) {
            const result = await response.json();
            delivered = !!(result && result.ok === true);
          }
        } catch (e) {
          delivered = false;
        }

        if (delivered) job.sent = (Number(job.sent) || 0) + 1;
        else job.failed = (Number(job.failed) || 0) + 1;

        job.next_index = i + 1;
        job.updated_at = new Date().toISOString();

        // برای کاهش مصرف KV، پیشرفت اطلاع‌رسانی هر ۱۰ کاربر یک‌بار ذخیره می‌شود.
        // وضعیت نهایی هر مرحله نیز پایین‌تر ذخیره خواهد شد.
        const CHECKPOINT_INTERVAL = 10;
        if (job.next_index % CHECKPOINT_INTERVAL === 0) {
          try { await db.set("broadcast_job_" + job.id, job); }
          catch (e) { console.error("Broadcast checkpoint save failed:", job.id, e && e.message); }
        }

        await new Promise(resolve => setTimeout(resolve, 120));
      }

      job.processing = false;
      job.processing_at = null;
      job.updated_at = new Date().toISOString();

      const finished = job.next_index >= users.length;
      if (finished) {
        job.status = "completed";
        job.completed_at = new Date().toISOString();
      } else {
        job.status = "paused";
      }

      await db.set("broadcast_job_" + job.id, job);

      if (job.message_id) {
        const keyboard = finished ? { inline_keyboard: [] } : {
          inline_keyboard: [[{ text: "▶️ ادامه ارسال", callback_data: "broadcast_continue_" + job.id }]]
        };
        try { await editMessage(job.admin_id, job.message_id, statusText(finished), keyboard); } catch (e) {}
      } else {
        await sendMessage(job.admin_id, statusText(finished), finished ? null : {
          inline_keyboard: [[{ text: "▶️ ادامه ارسال", callback_data: "broadcast_continue_" + job.id }]]
        });
      }
    }

    async function sendVideo(chatId, videoId, caption = null) {
      const payload = { chat_id: chatId, video: videoId };
      if (caption) payload.caption = caption;
      return await apiRequest("sendVideo", payload, 15000);
    }

    async function editMessage(chatId, msgId, text, replyMarkup = null) {
      const payload = { chat_id: chatId, message_id: msgId, text: text };
      if (replyMarkup) payload.reply_markup = replyMarkup;
      return await apiRequest("editMessageText", payload);
    }

    async function deleteMessage(chatId, msgId) {
      return await apiRequest("deleteMessage", { chat_id: chatId, message_id: msgId });
    }

    async function checkChannel(userId, ch) {
      const memberStatus = data =>
        !!(data && data.ok && data.result &&
          ["member", "administrator", "creator"].includes(data.result.status));

      let response = await apiRequest("getChatMember", { chat_id: ch.id, user_id: userId }, 6000);
      let data = await readApiResponse(response);
      if (memberStatus(data)) return true;

      response = await apiRequest("getChatMember", { chat_id: "@" + ch.username, user_id: userId }, 6000);
      data = await readApiResponse(response);
      return memberStatus(data);
    }

    async function checkAllChannels(userId) {
      const results = await Promise.all(CHANNELS.map(ch => checkChannel(userId, ch)));
      return results.every(Boolean);
    }

    // هر کاربر کلید مستقل دارد؛ کلید قدیمی users برای سازگاری حفظ می‌شود.
    async function getUser(uid) {
      const id = String(uid);
      const current = await KV.get("user:" + id);
      if (current !== null) return JSON.parse(current);
      const legacyUsers = await db.get("users", {});
      return legacyUsers[id];
    }

    async function saveUser(uid, data) {
      await db.set("user:" + String(uid), data);
    }

    async function getAllUsers() {
      const users = await db.get("users", {});
      let cursor;
      do {
        const page = await KV.list({ prefix: "user:", cursor, limit: 1000 });
        const records = await Promise.all((page.keys || []).map(async key => {
          const raw = await KV.get(key.name);
          return { key, raw };
        }));
        for (const record of records) {
          if (record.raw !== null) {
            try { users[record.key.name.slice(5)] = JSON.parse(record.raw); }
            catch (e) { console.error("Invalid user record:", record.key.name, e && e.message); }
          }
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return users;
    }

    async function createUserIfNotExists(uid) {
      const s = String(uid);
      let user = await getUser(uid);
      if (!user) {
        user = { user_id: uid, join_date: new Date().toISOString(), verified: false, warnings: 0, spam_history: [], violation_history: [] };
        await saveUser(uid, user);
        const users = await getAllUsers();
        if (Object.keys(users).length % 30 === 0) {
          await sendMessage(ADMIN_ID, "🎉 تبریک! تعداد کاربران به " + Object.keys(users).length + " نفر رسید.");
        }
      }
      return user;
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
    function isMainAdmin(uid) { return Number(uid) === ADMIN_ID; }
    async function isAnyAdmin(uid) { return isMainAdmin(uid) || !!(await getAdmins())[String(uid)]; }
    async function getBox() { return await db.get("box", { old: { name: "باکس قدیمی", desc: "تنظیم نشده", video: null }, new: { name: "باکس جدید", desc: "تنظیم نشده", video: null } }); }
    async function saveBox(type, name, desc, video) { const b = await getBox(); b[type] = { name, desc, video, updated_at: new Date().toISOString() }; await db.set("box", b); }
    async function getWords() { return await db.get("words", []); }
    async function saveWords(w) { await db.set("words", w); }
    async function getRestricted(text) { const w = await getWords(); for (const word of w) { if (text.includes(word)) return word; } return null; }
    // وضعیت و داده موقت هر ادمین نیز جدا ذخیره می‌شود؛ داده‌های قدیمی قابل خواندن می‌مانند.
    async function getAdminState(uid) {
      const key = "state:" + String(uid), raw = await KV.get(key);
      if (raw !== null) return JSON.parse(raw);
      return (await db.get("states", {}))[String(uid)];
    }
    async function setAdminState(uid, state) { await db.set("state:" + String(uid), state); }
    async function clearAdminState(uid) { await db.set("state:" + String(uid), null); }
    async function getAdminTemp(uid) {
      const key = "temp:" + String(uid), raw = await KV.get(key);
      if (raw !== null) return JSON.parse(raw) || {};
      return (await db.get("temps", {}))[String(uid)] || {};
    }
    async function setAdminTemp(uid, k, v) {
      const t = await getAdminTemp(uid);
      if (typeof k === "object" && k !== null) Object.assign(t, k);
      else t[k] = v;
      await db.set("temp:" + String(uid), t);
    }
    async function clearAdminTemp(uid) { await db.set("temp:" + String(uid), {}); }

    async function saveReviewMsg(targetUid, adminUid, msgId) {
      const rm = await db.get("review_msgs", {});
      if (!rm[targetUid]) rm[targetUid] = [];
      rm[targetUid].push({ admin: adminUid, msg: msgId });
      await db.set("review_msgs", rm);
    }

    async function deleteReviewMsgs(targetUid) {
      const rm = await db.get("review_msgs", {});
      if (rm[targetUid]) {
        for (const item of rm[targetUid]) await deleteMessage(item.admin, item.msg);
        delete rm[targetUid];
        await db.set("review_msgs", rm);
      }
    }

    async function checkSpamAndWarnings(uid, text, isCallback = false) {
      if (await isAnyAdmin(uid)) return false;
      const u = (await getUser(uid)) || (await createUserIfNotExists(uid));
      const now = Date.now();
      const spamKey = String(uid);
      const spamData = SPAM_MEMORY.get(spamKey) || [];
      // هر پیام و هر کلیک یک رویداد مستقل است؛ حتی کلیک‌های پشت‌سرهم شمرده می‌شوند.
      // شمارنده فقط در حافظه Worker است و برای هر رویداد KV نوشته نمی‌شود.
      let history = spamData.filter(t => now - t < 60000);
      history.push(now);
      SPAM_MEMORY.set(spamKey, history);
      if (SPAM_MEMORY.size > 5000) {
        const oldestKey = SPAM_MEMORY.keys().next().value;
        if (oldestKey !== undefined) SPAM_MEMORY.delete(oldestKey);
      }
      if (history.length > 10) {
        await banUser(uid, "system", "اسپم (بیش از ۱۰ پیام/کلیک در ۱ دقیقه)");
        await saveUser(uid, u);
        await sendMessage(uid, "🚫 شما به دلیل اسپم مسدود شدید!\n\n📩 درخواست بررسی مجدد دهید.", { inline_keyboard: [[{ text: "📩 درخواست بررسی مجدد", callback_data: "user_review_request" }]] });
        return true;
      }
      let userChanged = false;
      if (!isCallback && text) {
        const restricted = await getRestricted(text);
        if (restricted) {
          u.warnings = (u.warnings || 0) + 1;
          let vh = u.violation_history || [];
          vh.push({ type: "کلمه نامناسب", word: restricted, message: text, time: new Date().toISOString() });
          u.violation_history = vh;
          userChanged = true;
          if (u.warnings >= 8) {
            await banUser(uid, "system", "استفاده مکرر از کلمات نامناسب (تعداد: " + u.warnings + ")");
            await saveUser(uid, u);
            await sendMessage(uid, "🚫 شما به دلیل کلمات نامناسب مسدود شدید!\n\n📩 درخواست بررسی مجدد دهید.", { inline_keyboard: [[{ text: "📩 درخواست بررسی مجدد", callback_data: "user_review_request" }]] });
            return true;
          }
        }
      }
      if (userChanged) await saveUser(uid, u);
      return false;
    }

    // ========== کیبوردها ==========
    const getChannelsKeyboard = () => ({ inline_keyboard: [[{ text: "📢 کانال اول", url: "https://ble.ir/efootball_1" }], [{ text: "📢 کانال دوم", url: "https://ble.ir/shopping_efootball_1" }], [{ text: "📢 کانال سوم", url: "https://ble.ir/News_Salavati" }], [{ text: "✓ بررسی عضویت", callback_data: "check_membership" }]] });
    const getUserMainKeyboard = () => ({ keyboard: [[{ text: "👤 پروفایل من" }, { text: "🎁 شرکت در قرعه کشی" }]], resize_keyboard: true, is_persistent: true });
    const getGetMethodKeyboard = () => ({ inline_keyboard: [[{ text: "✨ دریافت آخرین روش آپلود شده", callback_data: "get_new_method" }], [{ text: "📥 دریافت روش باکس قبل", callback_data: "get_old_method" }]] });
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
        [{ text: "🚫 محدود کردن کلمه", callback_data: "admin_restrict_word" }],
        [{ text: "🎁 جایزه | مناسبت 🌟", callback_data: "lottery_menu" }],
        [{ text: "✉️ ارسال شخصی از طرف ربات", callback_data: "personal_send_start" }]
      ]
    });
    const getExtraAdminKeyboard = () => ({ inline_keyboard: [[{ text: "🚫 لیست مسدودی", callback_data: "admin_ban_list" }], [{ text: "📋 لیست مسدودها", callback_data: "admin_banned_users" }]] });
    const getBanActionsKeyboard = () => ({ inline_keyboard: [[{ text: "🔒 مسدود کردن کاربر", callback_data: "ban_user_start" }], [{ text: "🔓 رفع مسدودیت کاربر", callback_data: "unban_user_start" }]] });
    const getConfirmKeyboard = () => ({ inline_keyboard: [[{ text: "✅ تایید", callback_data: "confirm_yes" }], [{ text: "❌ لغو و ویرایش", callback_data: "confirm_no" }]] });
    const getBanConfirmKeyboard = () => ({ inline_keyboard: [[{ text: "✅ تایید", callback_data: "ban_confirm_yes" }], [{ text: "❌ لغو", callback_data: "ban_confirm_no" }]] });
    const getUnbanConfirmKeyboard = () => ({ inline_keyboard: [[{ text: "✅ تایید", callback_data: "unban_confirm_yes" }], [{ text: "❌ لغو", callback_data: "unban_confirm_no" }]] });
    const getBroadcastConfirmKeyboard = () => ({ inline_keyboard: [[{ text: "✅ تایید", callback_data: "broadcast_yes" }], [{ text: "❌ لغو", callback_data: "broadcast_no" }]] });
    const getBannedUserKeyboard = () => ({ inline_keyboard: [[{ text: "📩 درخواست بررسی مجدد از ادمین", callback_data: "user_review_request" }]] });
    const getReviewActionKeyboard = (uid) => ({ inline_keyboard: [[{ text: "✅ بررسی شد و رفع بن شود", callback_data: "review_approve_" + uid }], [{ text: "❌ بررسی شد اما رفع بن نشود", callback_data: "review_reject_" + uid }], [{ text: "🔍 بررسی اختلاف ایجاد شده", callback_data: "review_check_" + uid }], [{ text: "⏳ مسدودیت موقت", callback_data: "review_temp_ban_" + uid }]] });
    const getTempBanDurationsKeyboard = (uid) => ({ inline_keyboard: [[{ text: "۱ ساعت", callback_data: "tban_" + uid + "_1" }], [{ text: "۲ ساعت", callback_data: "tban_" + uid + "_2" }], [{ text: "۴ ساعت", callback_data: "tban_" + uid + "_4" }], [{ text: "۸ ساعت", callback_data: "tban_" + uid + "_8" }], [{ text: "۱۶ ساعت", callback_data: "tban_" + uid + "_16" }], [{ text: "۲۴ ساعت", callback_data: "tban_" + uid + "_24" }], [{ text: "۴۸ ساعت", callback_data: "tban_" + uid + "_48" }], [{ text: "۷۲ ساعت", callback_data: "tban_" + uid + "_72" }], [{ text: "۱ هفته", callback_data: "tban_" + uid + "_168" }], [{ text: "🔙 بازگشت", callback_data: "review_back_" + uid }]] });
    const getUpdateBoxTypeKeyboard = () => ({ inline_keyboard: [[{ text: "🆕 باکس جدید", callback_data: "box_new" }], [{ text: "📜 باکس قدیمی‌تر", callback_data: "box_old" }]] });
    const getVideoChoiceKeyboard = () => ({ inline_keyboard: [[{ text: "🎥 بله (بارگذاری ویدیو)", callback_data: "video_yes" }], [{ text: "💾 خیر (ذخیره بدون ویدیو)", callback_data: "video_no" }]] });
    const getRemoveAdminConfirmKeyboard = (uid) => ({ inline_keyboard: [[{ text: "✅ تایید حذف", callback_data: "remove_admin_yes_" + uid }], [{ text: "❌ لغو", callback_data: "remove_admin_no" }]] });
    const getRestrictWordKeyboard = () => ({ inline_keyboard: [[{ text: "➕ اضافه کردن کلمه", callback_data: "add_word" }], [{ text: "➖ حذف کردن کلمه", callback_data: "remove_word" }], [{ text: "🔙 بازگشت", callback_data: "back_to_admin" }]] });
    const getWordConfirmKeyboard = (action) => ({ inline_keyboard: [[{ text: "✅ بله", callback_data: "word_confirm_yes_" + action }], [{ text: "❌ لغو", callback_data: "word_confirm_no" }]] });

    // ========== ابزار تاریخ شمسی و قرعه‌کشی ==========
    const faDigits = s => String(s).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    const monthNames = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
    function jalaliToGregorian(jy, jm, jd) {
      jy = Number(jy); jm = Number(jm); jd = Number(jd);
      if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd) ||
          jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) {
        throw new Error("Invalid Jalali date");
      }
      const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
        year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC"
      });
      const start = Date.UTC(jy + 621, 0, 1);
      const end = Date.UTC(jy + 623, 0, 1);
      for (let stamp = start; stamp < end; stamp += 86400000) {
        const parts = formatter.formatToParts(new Date(stamp));
        const found = {};
        for (const part of parts) {
          if (part.type === "year" || part.type === "month" || part.type === "day") found[part.type] = Number(part.value);
        }
        if (found.year === jy && found.month === jm && found.day === jd) {
          const date = new Date(stamp);
          return { gy: date.getUTCFullYear(), gm: date.getUTCMonth() + 1, gd: date.getUTCDate() };
        }
      }
      throw new Error("Invalid Jalali date");
    }
    function tehranTimestamp(j) {
      const g = jalaliToGregorian(j.year, j.month, j.day);
      return Date.UTC(g.gy, g.gm - 1, g.gd, Number(j.hour) - 3, Number(j.minute) - 30);
    }
    function formatJalali(j) {
      return `${j.day} ${monthNames[j.month-1]} ${j.year} ساعت ${String(j.hour).padStart(2,"0")}:${String(j.minute).padStart(2,"0")}`;
    }
    function parseMonth(v) {
      const n = Number(faDigits(v));
      if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
      return monthNames.findIndex(m => m === String(v).trim()) + 1;
    }
    function validateJalali(j) {
      if (!Number.isInteger(j.year) || j.year < 1300 || j.year > 1500 ||
          !Number.isInteger(j.month) || j.month < 1 || j.month > 12 ||
          !Number.isInteger(j.day) || j.day < 1 || j.day > 31 ||
          !Number.isInteger(j.hour) || j.hour < 0 || j.hour > 23 ||
          !Number.isInteger(j.minute) || j.minute < 0 || j.minute > 59) return false;
      try { jalaliToGregorian(j.year, j.month, j.day); return true; } catch (e) { return false; }
    }
    const lotteryMenuKeyboard = () => ({ inline_keyboard: [[{text:"➕ ایجاد / فعال‌سازی قرعه‌کشی",callback_data:"lottery_create"}],[{text:"👥 لیست شرکت‌کننده‌ها",callback_data:"lottery_participants"}],[{text:"🔙 بازگشت",callback_data:"back_to_admin"}]] });
    const yesNoKeyboard = (yes,no) => ({inline_keyboard:[[ {text:"✅ آره",callback_data:yes} ],[{text:"❌ لغو",callback_data:no}]] });
    const lotteryFieldKeyboard = (kind,field) => ({inline_keyboard:[[ {text:"✏️ ویرایش این بخش",callback_data:`lottery_edit_${kind}_${field}`} ],[{text:"✅ تأیید",callback_data:`lottery_field_ok_${kind}_${field}`}]] });
    const lotteryPreviewKeyboard = (kind) => ({inline_keyboard:[[ {text:"✅ تأیید و ادامه",callback_data:`lottery_preview_ok_${kind}`} ],[{text:"❌ لغو",callback_data:"lottery_cancel"}]] });
    const personalConfirmKeyboard = () => ({inline_keyboard:[[ {text:"✅ ارسال پیام",callback_data:"personal_send_yes"} ],[{text:"❌ لغو",callback_data:"personal_send_no"}]] });
    function datePrompt(field) {
      const prompts = {year:"سال شمسی را وارد کنید (مثلاً ۱۴۰۵):",month:"ماه را وارد کنید (عدد یا نام ماه، مثلاً آبان):",day:"روز ماه را وارد کنید:",hour:"ساعت را وارد کنید (۰ تا ۲۳):",minute:"دقیقه را وارد کنید (۰ تا ۵۹):"};
      return "🗓 " + prompts[field];
    }
    async function beginLotteryDate(uid, kind, field="year") {
      await setAdminTemp(uid,{ lottery_date_kind: kind, lottery_date_field: field });
      await setAdminState(uid,"lottery_date_input");
      await sendMessage(uid,datePrompt(field));
    }
    async function showLotteryFieldPreview(uid,kind,field) {
      const t=await getAdminTemp(uid), d=t[kind+"_date"]||{};
      const labels={year:"سال",month:"ماه",day:"روز",hour:"ساعت",minute:"دقیقه"};
      await sendMessage(uid,`🔎 مقدار ${labels[field]}: ${d[field]}\n\nتأیید می‌کنی؟`,lotteryFieldKeyboard(kind,field));
    }
    async function showLotteryDatePreview(uid,kind) {
      const t=await getAdminTemp(uid), d=t[kind+"_date"];
      await sendMessage(uid,`📅 پیش‌نمایش تاریخ ${kind==="start"?"شروع":"پایان"}:\n${formatJalali(d)}\n\nدرسته؟`,lotteryPreviewKeyboard(kind));
    }
    async function showFinalLotteryPreview(uid) {
      const t=await getAdminTemp(uid);
      await sendMessage(uid,`🎁 پیش‌نمایش نهایی قرعه‌کشی\n\n🏷 نام: ${t.lottery_name}\n🌟 مناسبت: ${t.lottery_occasion}\n🟢 شروع: ${formatJalali(t.start_date)}\n🔴 پایان: ${formatJalali(t.end_date)}\n\nتأیید و فعال‌سازی شود؟`,{inline_keyboard:[[ {text:"✅ تأیید و بروزرسانی قرعه‌کشی",callback_data:"lottery_final_yes"} ],[{text:"❌ لغو",callback_data:"lottery_cancel"}]]});
    }
    async function getLottery() {
      const lottery = await db.get("lottery", null);
      if (lottery && lottery.start_date && lottery.end_date) {
        try {
          const correctedStart = tehranTimestamp(lottery.start_date);
          const correctedEnd = tehranTimestamp(lottery.end_date);
          if (lottery.start_ts !== correctedStart || lottery.end_ts !== correctedEnd) {
            lottery.start_ts = correctedStart;
            lottery.end_ts = correctedEnd;
            await db.set("lottery", lottery);
          }
        } catch (e) { console.error("Lottery date repair failed:", e); }
      }
      return lottery;
    }
    async function sendLotteryStatus(chatId) {
      const l=await getLottery();
      if(!l || !l.enabled) { await sendMessage(chatId,"فعلا هیچ قرعه کشی وجود ندارد"); return; }
      const now=Date.now(), start=l.start_ts, end=l.end_ts;
      const base=`🎁 ${l.name}\n🌟 مناسبت: ${l.occasion}\n🟢 شروع: ${l.start_text}\n🔴 پایان: ${l.end_text}\n`;
      if(now<start) {
        const mins=Math.ceil((start-now)/60000), days=Math.floor(mins/1440), hours=Math.floor((mins%1440)/60), m=mins%60;
        await sendMessage(chatId,base+`\n⏳ زمان باقی‌مانده تا شروع: ${days?days+" روز و ":""}${hours} ساعت و ${m} دقیقه`);
      } else if(now>=end) {
        await sendMessage(chatId,base+"\n⛔ مهلت ثبت‌نام این قرعه‌کشی به پایان رسیده است.");
      } else {
        const p=await db.get("lottery_participants",{});
        if(p[String(chatId)] && p[String(chatId)].lottery_id===l.id) {
          await sendMessage(chatId,"✅ شما قبلاً در این قرعه‌کشی ثبت‌نام کرده‌اید.\n"+base+"\n🔴 مهلت پایان: "+l.end_text);
        } else {
          const from = (await getUser(chatId)) || {};
          p[String(chatId)]={user_id:Number(chatId),username:from.username||null,lottery_id:l.id,joined_at:new Date().toISOString()};
          await db.set("lottery_participants",p);
          await sendMessage(chatId,"🎉 ثبت‌نام شما با موفقیت انجام شد!\n"+base+"\n🔴 مهلت پایان: "+l.end_text);
        }
      }
    }
    async function sendParticipants(chatId) {
      const l=await getLottery();
      if(!l) { await sendMessage(chatId,"هنوز قرعه‌کشی‌ای ثبت نشده است."); return; }
      const p=await db.get("lottery_participants",{});
      const list=Object.values(p).filter(x=>x.lottery_id===l.id);
      if(!list.length) {
        await sendMessage(chatId,`👥 شرکت‌کنندگان قرعه‌کشی «${l.name}»\n📊 تعداد: 0\n\nهنوز کسی ثبت‌نام نکرده است.`);
        return;
      }
      const lines=list.map((x,i)=>`${i+1} : ${x.user_id}${x.username?" | @"+String(x.username).replace(/^@/,""):""}`);
      const fullText=`👥 شرکت‌کنندگان قرعه‌کشی «${l.name}»\n📊 تعداد: ${list.length}\n\n${lines.join("\n")}`;
      if(fullText.length<=4000) await sendMessage(chatId,fullText);
      else {
        let part="", partNumber=1;
        for(const line of lines) {
          if((part+"\n"+line).length>3800) {
            await sendMessage(chatId,`👥 شرکت‌کنندگان «${l.name}» (بخش ${partNumber++})\n\n${part}`);
            part=line;
          } else part=part ? part+"\n"+line : line;
        }
        if(part) await sendMessage(chatId,`👥 شرکت‌کنندگان «${l.name}» (بخش ${partNumber})\n\n${part}`);
      }
    }

    const sendMembershipRequired = (c) => sendMessage(c, "🔐 **برای استفاده از ربات، لطفاً در کانال‌های زیر عضو شوید:**\n\nپس از عضویت، روی دکمه «✓ بررسی عضویت» کلیک کنید.", getChannelsKeyboard());
    const sendGetMethodMessage = async (c) => {
      const box = await getBox();
      const text = "🎁 **لطفاً یک گزینه را انتخاب کنید:**\n\n📅 **آخرین باکس بروزرسانی شده:** `" + box.new.name + "`\n\n👇 روی دکمه زیر بزنید:";
      await sendMessage(c, text, getGetMethodKeyboard());
    };
    const sendUserMainMenu = async (c) => {
      await sendMessage(c, "👋 **منوی اصلی**\n\nاز دکمه‌های زیر استفاده کنید:", getUserMainKeyboard());
      await sendGetMethodMessage(c);
    };
    const sendBannedMessage = (c) => sendMessage(c, "🚫 **کاربر گرامی،**\n\nبا نظر ادمین یا سیستم، استفاده از ربات برای شما امکان‌پذیر نیست!\n\nدر صورت اعتراض، می‌توانید درخواست بررسی مجدد ارسال کنید.", getBannedUserKeyboard());
    async function handleBannedActivity(uid, chatId) {
      const key = String(uid);
      const count = (BANNED_NOTICE_MEMORY.get(key) || 0) + 1;
      if (count >= 21) {
        BANNED_NOTICE_MEMORY.delete(key);
        await sendBannedMessage(chatId);
      } else {
        BANNED_NOTICE_MEMORY.set(key, count);
      }
      if (BANNED_NOTICE_MEMORY.size > 5000) {
        const oldest = BANNED_NOTICE_MEMORY.keys().next().value;
        if (oldest !== undefined) BANNED_NOTICE_MEMORY.delete(oldest);
      }
    }
    const sendProfileMessage = async (c, uid) => {
      const banned = await isBanned(uid);
      const status = banned ? "🚫 مسدود" : "✅ آزاد";
      const text = "👤 **پروفایل من**\n\n📊 وضعیت اکانت: " + status + "\n📩 تعداد درخواست پشتیبانی: 0\n🆔 آیدی عددی: `" + uid + "`";
      await sendMessage(c, text, getProfileCopyKeyboard(uid));
    };

    // ========== پردازش دکمه‌های شیشه‌ای ==========
    async function processCallback(cb, ctx) {
      // ربات فقط در گفت‌وگوی خصوصی اجازه پردازش دکمه‌ها را دارد.
      if (!cb.message || !cb.message.chat || cb.message.chat.type !== "private") return;

      // توقف چرخش دکمه‌های شیشه‌ای در بله
      await answerCallbackQuery(cb.id);

      const chatId=cb.message.chat.id, uid=cb.from.id, data=cb.data, msgId=cb.message.message_id;
      if(await isBanned(uid) && data!=="user_review_request") {
        await handleBannedActivity(uid, chatId);
        return;
      }
      if(data!=="user_review_request" && await checkSpamAndWarnings(uid,"",true)) return;
      if(data==="check_membership") {
        if(await checkAllChannels(uid)) { await sendMessage(chatId,"✅ **عضویت شما تایید شد**"); await new Promise(r=>setTimeout(r,500)); await sendUserMainMenu(chatId); }
        else await sendMessage(chatId,"❌ **شما در همه کانال‌ها عضو نشده‌اید!**",getChannelsKeyboard());
        return;
      }
      if(data.startsWith("copy_id_")) { await sendMessage(chatId,"`"+data.replace("copy_id_","")+"`"); return; }
      if(data==="user_review_request") {
        const banned=await getBanned(), item=banned[String(uid)];
        if(!item) { await sendMessage(chatId,"❌ شما مسدود نیستید."); return; }
        if(item.last_request&&(new Date()-new Date(item.last_request))<86400000) { await sendMessage(chatId,"⏳ **شما هر ۲۴ ساعت فقط یکبار می‌توانید درخواست بدهید.**"); return; }
        item.review_requests=(item.review_requests||0)+1; item.last_request=new Date().toISOString(); await db.set("banned",banned);
        await sendMessage(chatId,"✅ **درخواست شما ارسال شد.**");
        const req="📩 **درخواست بررسی**\n🆔 `"+uid+"`\n📊 تعداد: "+item.review_requests;
        const adminMsg=await sendMessage(ADMIN_ID,req,getReviewActionKeyboard(uid));
        const adminData=await readApiResponse(adminMsg);
        if(adminData && adminData.ok && adminData.result && adminData.result.message_id) {
          await saveReviewMsg(uid,ADMIN_ID,adminData.result.message_id);
        }
        const admins=await getAdmins();
        for(const k of Object.keys(admins)) {
          try {
            const m=await sendMessage(parseInt(k),req,getReviewActionKeyboard(uid));
            const mData=await readApiResponse(m);
            if(mData && mData.ok && mData.result && mData.result.message_id) {
              await saveReviewMsg(uid,parseInt(k),mData.result.message_id);
            }
          } catch(e) { console.error("Review notification failed:", k, e); }
        }
        return;
      }
      const admin = await isAnyAdmin(uid);
      if(!admin && !(await checkAllChannels(uid))) {
        await sendMessage(chatId,"🔐 **ابتدا در کانال‌ها عضو شوید.**",getChannelsKeyboard());
        return;
      }

      if(admin) {
        if (data.startsWith("broadcast_continue_") && isMainAdmin(uid)) {
          const jobId = data.slice("broadcast_continue_".length);
          const job = await db.get("broadcast_job_" + jobId, null);
          if (!job) { await sendMessage(chatId, "❌ اطلاعات این اطلاع‌رسانی پیدا نشد."); return; }
          if (job.status === "completed") { await sendMessage(chatId, "✅ این اطلاع‌رسانی قبلاً به پایان رسیده است."); return; }
          if (Number(job.admin_id) !== Number(chatId)) { await sendMessage(chatId, "⛔ دسترسی به این عملیات ندارید."); return; }
          await processBroadcastBatch(job);
          return;
        }
        else if(data==="admin_ban_list") await sendMessage(chatId,"🚫 **لیست مسدودی**",getBanActionsKeyboard());
        else if(data==="ban_user_start") { await setAdminState(uid,"waiting_for_ban_id"); await sendMessage(chatId,"🆔 **آیدی عددی را ارسال کنید:**"); }
        else if(data==="unban_user_start") { await setAdminState(uid,"waiting_for_unban_id"); await sendMessage(chatId,"🆔 **آیدی عددی را ارسال کنید:**"); }
        else if(data==="ban_confirm_yes") { const t=await getAdminTemp(uid); if(t.target_ban_id) { await banUser(t.target_ban_id,uid,"دستی توسط ادمین"); await sendBannedMessage(t.target_ban_id); await sendMessage(chatId,"✅ کاربر مسدود شد!",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); await clearAdminTemp(uid); } }
        else if(data==="ban_confirm_no") { await clearAdminTemp(uid); await sendMessage(chatId,"❌ لغو شد.",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); }
        else if(data==="unban_confirm_yes") { const t=await getAdminTemp(uid); if(t.target_unban_id) { if(await unbanUser(t.target_unban_id)) { await sendMessage(t.target_unban_id,"✅ **شما رفع مسدودیت شدید.**"); await sendMessage(chatId,"✅ کاربر رفع مسدودیت شد.",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); } else await sendMessage(chatId,"❌ کاربر در لیست نیست!",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); await clearAdminTemp(uid); } }
        else if(data==="unban_confirm_no") { await clearAdminTemp(uid); await sendMessage(chatId,"❌ لغو شد.",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); }
        else if(data.startsWith("review_check_")) {
          const target=data.replace("review_check_",""), u=await getUser(target), b=(await getBanned())[target]||{}, vh=u?(u.violation_history||[]):[];
          let txt="🔍 **گزارش تخلفات کاربر `"+target+"`:**\n\n🚫 دلیل بن: "+(b.reason||"نامشخص")+"\n⚠️ تعداد اخطار: "+(u?(u.warnings||0):0)+"\n\n📝 **لیست تخلفات:**\n";
          if(vh.length) vh.forEach((v,i)=>{txt+=(i+1)+". پیام: «"+v.message+"» (کلمه: "+v.word+")\n";}); else txt+="تاریخچه‌ای یافت نشد.\n";
          await sendMessage(chatId,txt,getReviewActionKeyboard(target));
        }
        else if(data.startsWith("review_temp_ban_")) { const target=data.replace("review_temp_ban_",""); await sendMessage(chatId,"⏳ **مدت مسدودیت موقت را انتخاب کنید:**",getTempBanDurationsKeyboard(target)); }
        else if(data.startsWith("tban_")) { const parts=data.split("_"),target=parseInt(parts[1]),hours=parseInt(parts[2]); await banUser(target,uid,"مسدودیت موقت ("+hours+" ساعت)",hours); await sendMessage(chatId,"✅ کاربر `"+target+"` به مدت "+hours+" ساعت مسدود شد.",getAdminKeyboard()); await sendMessage(target,"🚫 **شما به مدت "+hours+" ساعت مسدود شدید.**",getBannedUserKeyboard()); await deleteReviewMsgs(target); }
        else if(data.startsWith("review_back_")) { const target=data.replace("review_back_",""); await sendMessage(chatId,"بازگشت به منوی بررسی:",getReviewActionKeyboard(target)); }
        else if(data.startsWith("review_approve_")) { const target=parseInt(data.replace("review_approve_","")); await unbanUser(target); await sendMessage(target,"✅ **درخواست شما پذیرفته شد.**"); await sendMessage(chatId,"✅ کاربر "+target+" رفع بن شد.",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); await deleteReviewMsgs(target); }
        else if(data.startsWith("review_reject_")) { const target=parseInt(data.replace("review_reject_","")); await sendMessage(target,"❌ **درخواست شما رد شد.**"); await sendMessage(chatId,"❌ درخواست "+target+" رد شد.",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); await deleteReviewMsgs(target); }
        else if(data==="admin_banned_users") {
          const banned=await getBanned(),keys=Object.keys(banned);
          if(!keys.length) { await sendMessage(chatId,"✅ هیچ کاربر مسدودی نیست.",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); return; }
          let txt="📋 **لیست مسدودها:**\n\n"; keys.forEach((k,i)=>{txt+=(i+1)+". 🆔 `"+k+"` - 📩 "+(banned[k].review_requests||0)+"\n";});
          await sendMessage(chatId,txt,isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard());
        }
        else if(data==="admin_update_box"&&isMainAdmin(uid)) await sendMessage(chatId,"📦 **کدوم باکس رو می‌خوای آپلود کنی؟**",getUpdateBoxTypeKeyboard());
        else if((data==="box_new"||data==="box_old")&&isMainAdmin(uid)) { await setAdminTemp(uid,"box_type",data==="box_new"?"new":"old"); await setAdminState(uid,"waiting_for_box_name"); await sendMessage(chatId,"📝 **اسم باکس رو وارد کنید:**"); }
        else if(data==="video_yes"&&isMainAdmin(uid)) { await setAdminState(uid,"waiting_for_video"); await sendMessage(chatId,"🎥 **ویدیو رو ارسال کنید:**"); }
        else if(data==="video_no"&&isMainAdmin(uid)) { const t=await getAdminTemp(uid); await saveBox(t.box_type||"new",t.box_name,t.box_desc,null); await clearAdminTemp(uid); await sendMessage(chatId,"✅ **باکس بدون ویدیو ذخیره شد!**",getAdminKeyboard()); }
        else if(data==="confirm_yes"&&isMainAdmin(uid)) await sendMessage(chatId,"🎥 **آیا ویدیویی برای این باکس داری؟**",getVideoChoiceKeyboard());
        else if(data==="confirm_no"&&isMainAdmin(uid)) { await clearAdminTemp(uid); await setAdminState(uid,"waiting_for_box_name"); await sendMessage(chatId,"🔄 **دوباره اسم باکس رو وارد کنید:**"); }
        else if(data==="admin_broadcast"&&isMainAdmin(uid)) { await setAdminState(uid,"waiting_for_broadcast"); await sendMessage(chatId,"📢 **پیام رو بفرستید:**"); }
        else if(data==="broadcast_yes"&&isMainAdmin(uid)) {
          const t = await getAdminTemp(uid);
          if (t.broadcast_text) {
            const users = await getAllUsers();
            const userIds = [...new Set(Object.values(users)
              .map(user => user && user.user_id != null ? String(user.user_id) : "")
              .filter(id => /^\d+$/.test(id) && Number(id) > 0))];

            const job = {
              id: makeBroadcastJobId(),
              admin_id: chatId,
              message_id: null,
              message: t.broadcast_text,
              user_ids: userIds,
              total: userIds.length,
              sent: 0,
              failed: 0,
              next_index: 0,
              processing: false,
              processing_at: null,
              status: "running",
              created_at: new Date().toISOString()
            };

            const progress = await sendMessage(chatId,
              "⏳ اطلاع‌رسانی آماده شروع است...\n\n👥 تعداد کاربران: " + job.total +
              "\n📤 ارسال شده: 0\n⚠️ ناموفق: 0"
            );

            try {
              if (progress) {
                const payload = await progress.json();
                if (payload && payload.ok === true && payload.result) job.message_id = payload.result.message_id;
              }
            } catch (e) {}

            await db.set("broadcast_job_" + job.id, job);
            await clearAdminTemp(uid);
            await processBroadcastBatch(job);
          }
        }
        else if(data==="broadcast_no"&&isMainAdmin(uid)) { await clearAdminTemp(uid); await sendMessage(chatId,"❌ لغو شد.",getAdminKeyboard()); }
        else if(data==="admin_stats"&&isMainAdmin(uid)) { const users=await getAllUsers(),banned=await getBanned(),total=Object.keys(users).length,verified=Object.values(users).filter(u=>u.verified===true).length; await sendMessage(chatId,"📊 **آمار ربات**\n\n👥 کل: "+total+"\n✅ تایید شده: "+verified+"\n⏳ تایید نشده: "+(total-verified)+"\n🚫 مسدود: "+Object.keys(banned).length,getAdminKeyboard()); }
        else if(data==="admin_restrict_word"&&isMainAdmin(uid)) { const words=await getWords(); await sendMessage(chatId,"🚫 **کلمات نامناسب:**\n\n"+(words.length?words.join("\n"):"لیست خالی است."),getRestrictWordKeyboard()); }
        else if(data==="add_word"&&isMainAdmin(uid)) { await setAdminState(uid,"waiting_for_new_word"); await sendMessage(chatId,"📝 **کلمه جدید را ارسال کنید:**"); }
        else if(data==="remove_word"&&isMainAdmin(uid)) { await setAdminState(uid,"waiting_for_remove_word"); await sendMessage(chatId,"📝 **کلمه برای حذف را ارسال کنید:**"); }
        else if(data.startsWith("word_confirm_yes_")&&isMainAdmin(uid)) { const action=data.replace("word_confirm_yes_",""),t=await getAdminTemp(uid),word=t.temp_word; let words=await getWords(); if(action==="add"&&!words.includes(word)) { words.push(word); await saveWords(words); await sendMessage(chatId,"✅ کلمه اضافه شد.",getAdminKeyboard()); } else if(action==="remove"&&words.includes(word)) { words=words.filter(w=>w!==word); await saveWords(words); await sendMessage(chatId,"✅ کلمه حذف شد.",getAdminKeyboard()); } await clearAdminTemp(uid); }
        else if(data==="word_confirm_no"&&isMainAdmin(uid)) { await clearAdminTemp(uid); await sendMessage(chatId,"❌ لغو شد.",getAdminKeyboard()); }
        else if(data==="admin_add_admin"&&isMainAdmin(uid)) { await setAdminState(uid,"waiting_for_new_admin_id"); await sendMessage(chatId,"👑 **آیدی ادمین جدید را ارسال کنید:**"); }
        else if(data==="admin_admins_list"&&isMainAdmin(uid)) { const admins=await getAdmins(),keys=Object.keys(admins); let txt="👑 **لیست ادمین‌ها:**\n\n"+(keys.length?keys.join("\n"):"خالی")+"\n\n🆔 **برای حذف، آیدی را ارسال کنید:**"; await setAdminState(uid,"waiting_for_remove_admin_id"); await sendMessage(chatId,txt); }
        else if(data.startsWith("remove_admin_yes_")&&isMainAdmin(uid)) { const target=data.replace("remove_admin_yes_",""),admins=await getAdmins(); if(admins[target]) { delete admins[target]; await db.set("admins",admins); await sendMessage(chatId,"✅ ادمین حذف شد.",getAdminKeyboard()); } await clearAdminTemp(uid); }
        else if(data==="back_to_admin") await sendMessage(chatId,"👋 پنل ادمین",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard());

        // امکانات قرعه‌کشی و پیام شخصی فقط برای ادمین اصلی
        else if(data==="lottery_menu"&&isMainAdmin(uid)) await sendMessage(chatId,"🎁 مدیریت قرعه‌کشی",lotteryMenuKeyboard());
        else if(data==="lottery_create"&&isMainAdmin(uid)) await sendMessage(chatId,"آیا می‌خواهید قرعه‌کشی جدید را فعال و تنظیم کنید؟",yesNoKeyboard("lottery_create_yes","lottery_cancel"));
        else if(data==="lottery_create_yes"&&isMainAdmin(uid)) { await clearAdminTemp(uid); await beginLotteryDate(uid,"start"); }
        else if(data.startsWith("lottery_edit_")&&isMainAdmin(uid)) { const p=data.split("_"),kind=p[2],field=p[3]; await beginLotteryDate(uid,kind,field); }
        else if(data.startsWith("lottery_field_ok_")&&isMainAdmin(uid)) {
          const p=data.split("_"),kind=p[3],field=p[4],t=await getAdminTemp(uid),d=t[kind+"_date"]||{};
          const next={year:"month",month:"day",day:"hour",hour:"minute",minute:null}[field];
          if(next) await beginLotteryDate(uid,kind,next);
          else { await clearAdminState(uid); await showLotteryDatePreview(uid,kind); }
        }
        else if(data.startsWith("lottery_preview_ok_")&&isMainAdmin(uid)) {
          const kind=data.replace("lottery_preview_ok_","");
          if(kind==="start") { await setAdminState(uid,"lottery_name_input"); await sendMessage(chatId,"🏷 نام قرعه‌کشی را وارد کنید:"); }
          else await showFinalLotteryPreview(uid);
        }
        else if(data==="lottery_final_yes"&&isMainAdmin(uid)) {
          const t=await getAdminTemp(uid),start=tehranTimestamp(t.start_date),end=tehranTimestamp(t.end_date);
          if(end<=start) { await sendMessage(chatId,"❌ تاریخ پایان باید بعد از تاریخ شروع باشد."); await beginLotteryDate(uid,"end"); return; }
          const lottery={id:String(Date.now()),enabled:true,name:t.lottery_name,occasion:t.lottery_occasion,start_date:t.start_date,end_date:t.end_date,start_ts:start,end_ts:end,start_text:formatJalali(t.start_date),end_text:formatJalali(t.end_date),created_at:new Date().toISOString()};
          await db.set("lottery",lottery); await db.set("lottery_participants",{});
          await clearAdminTemp(uid); await clearAdminState(uid);
          await sendMessage(chatId,"✅ قرعه‌کشی با موفقیت بروزرسانی و فعال شد.",lotteryMenuKeyboard());
        }
        else if(data==="lottery_participants"&&isMainAdmin(uid)) await sendParticipants(chatId);
        else if(data==="lottery_cancel"&&isMainAdmin(uid)) { await clearAdminState(uid); await clearAdminTemp(uid); await sendMessage(chatId,"❌ عملیات قرعه‌کشی لغو شد.",lotteryMenuKeyboard()); }
        else if(data==="personal_send_start"&&isMainAdmin(uid)) { await clearAdminTemp(uid); await setAdminState(uid,"personal_target_input"); await sendMessage(chatId,"🆔 آیدی عددی کاربر مقصد را ارسال کنید:"); }
        else if(data==="personal_send_yes"&&isMainAdmin(uid)) {
          const t=await getAdminTemp(uid); const res=await sendMessage(t.personal_target,t.personal_text);
          let ok=false; try { const d=await res.json(); ok=!!d.ok; } catch(e) {}
          await sendMessage(chatId,ok?"✅ پیام با موفقیت ارسال شد.":"❌ ارسال پیام ناموفق بود؛ ممکن است کاربر ربات را شروع نکرده باشد.",getAdminKeyboard());
          await clearAdminTemp(uid); await clearAdminState(uid);
        }
        else if(data==="personal_send_no"&&isMainAdmin(uid)) { await clearAdminTemp(uid); await clearAdminState(uid); await sendMessage(chatId,"❌ ارسال پیام لغو شد.",getAdminKeyboard()); }
      } else {
        if(data==="get_old_method") { const box=(await getBox()).old,txt="🎁 **"+box.name+"**\n\n"+box.desc; if(box.video) await sendVideo(chatId,box.video,txt); else await sendMessage(chatId,txt); }
        else if(data==="get_new_method") { const box=(await getBox()).new,txt="🎁 **"+box.name+"**\n\n"+box.desc; if(box.video) await sendVideo(chatId,box.video,txt); else await sendMessage(chatId,txt); }
      }
    }

    // ========== پردازش پیام‌های متنی ==========
    async function processMessage(msg) {
      // پیام‌های گروه، سوپرگروه و کانال کاملاً نادیده گرفته می‌شوند.
      if (!msg.chat || msg.chat.type !== "private" || !msg.from) return;

      const chatId=msg.chat.id,uid=msg.from.id,text=msg.text||"",video=msg.video;

      // فرمان اضطراری بازگشت برای ادمین اصلی؛ در هر مرحله‌ای از عملیات،
      // وضعیت و اطلاعات موقت قبلی پاک می‌شود و پنل مدیریت نمایش داده می‌شود.
      // این بررسی باید قبل از ضداسپم و بررسی state باشد تا /start گیر نکند.
      if (isMainAdmin(uid) && /^\/start(?:@\w+)?(?:\s|$)/i.test(text.trim())) {
        await clearAdminState(uid);
        await clearAdminTemp(uid);
        await sendMessage(chatId, "👋 **پنل مدیریت**", getAdminKeyboard());
        return;
      }

      if(await isBanned(uid)) {
        await handleBannedActivity(uid, chatId);
        return;
      }
      if(await checkSpamAndWarnings(uid,text)) return;
      if(text==="👤 پروفایل من") { await createUserIfNotExists(uid); await sendProfileMessage(chatId,uid); return; }
      if(text==="🎁 شرکت در قرعه کشی") { if(!(await checkAllChannels(uid))&&!(await isAnyAdmin(uid))) { await sendMembershipRequired(chatId); return; } const userData=await createUserIfNotExists(uid); if(msg.from.username && userData.username!==msg.from.username) { userData.username=msg.from.username; await saveUser(uid,userData); } await sendLotteryStatus(chatId); return; }

      if(await isAnyAdmin(uid)) {
        const state=await getAdminState(uid);
        if(state==="waiting_for_box_name"&&isMainAdmin(uid)) { await setAdminTemp(uid,"box_name",text); await setAdminState(uid,"waiting_for_box_description"); await sendMessage(chatId,"✅ اسم ذخیره شد. **حالا توضیحات:**"); return; }
        else if(state==="waiting_for_box_description"&&isMainAdmin(uid)) { await setAdminTemp(uid,"box_desc",text); await clearAdminState(uid); const t=await getAdminTemp(uid); await sendMessage(chatId,"📦 **پیش‌نمایش:**\n\nاسم: "+t.box_name+"\nتوضیحات: "+text+"\n\nآیا مطمئنید؟",getConfirmKeyboard()); return; }
        else if(state==="waiting_for_video"&&isMainAdmin(uid)) { if(video) { const t=await getAdminTemp(uid); await saveBox(t.box_type||"new",t.box_name,t.box_desc,video.file_id); await clearAdminTemp(uid); await sendMessage(chatId,"✅ **باکس با ویدیو ذخیره شد!**",getAdminKeyboard()); } else await sendMessage(chatId,"❌ لطفاً یک ویدیو ارسال کنید."); return; }
        else if(state==="waiting_for_broadcast"&&isMainAdmin(uid)) { await setAdminTemp(uid,"broadcast_text",text); await clearAdminState(uid); await sendMessage(chatId,"📢 **پیش‌نمایش:**\n\n"+text+"\n\nآیا مطمئنید؟",getBroadcastConfirmKeyboard()); return; }
        else if(state==="waiting_for_new_word"&&isMainAdmin(uid)) { await setAdminTemp(uid,"temp_word",text); await clearAdminState(uid); await sendMessage(chatId,"❓ آیا کلمه `"+text+"` اضافه شود؟",getWordConfirmKeyboard("add")); return; }
        else if(state==="waiting_for_remove_word"&&isMainAdmin(uid)) { await setAdminTemp(uid,"temp_word",text); await clearAdminState(uid); await sendMessage(chatId,"❓ آیا کلمه `"+text+"` حذف شود؟",getWordConfirmKeyboard("remove")); return; }
        else if(state==="waiting_for_ban_id"||state==="waiting_for_unban_id") { if(/^\d+$/.test(text)) { const key=state==="waiting_for_ban_id"?"target_ban_id":"target_unban_id"; await setAdminTemp(uid,key,parseInt(text)); await clearAdminState(uid); await sendMessage(chatId,"⚠️ مطمئنید؟ "+text,state==="waiting_for_ban_id"?getBanConfirmKeyboard():getUnbanConfirmKeyboard()); } else await sendMessage(chatId,"❌ فقط آیدی عددی معتبر ارسال کنید."); return; }
        else if(state==="waiting_for_new_admin_id"&&isMainAdmin(uid)) { if(/^\d+$/.test(text)) { const admins=await getAdmins(); admins[text]={user_id:parseInt(text),added_at:new Date().toISOString()}; await db.set("admins",admins); await clearAdminState(uid); await sendMessage(chatId,"✅ ادمین اضافه شد.",getAdminKeyboard()); } return; }
        else if(state==="waiting_for_remove_admin_id"&&isMainAdmin(uid)) { if(/^\d+$/.test(text)) { await clearAdminState(uid); await sendMessage(chatId,"⚠️ مطمئنید؟",getRemoveAdminConfirmKeyboard(text)); } return; }
        else if(state==="lottery_date_input"&&isMainAdmin(uid)) {
          const t=await getAdminTemp(uid),kind=t.lottery_date_kind,field=t.lottery_date_field;
          let value=faDigits(text.trim());
          if(field==="month") value=parseMonth(value); else value=Number(value);
          if(!Number.isInteger(value)) { await sendMessage(chatId,"❌ مقدار نامعتبر است.\n"+datePrompt(field)); return; }
          let d=t[kind+"_date"]||{};
          d[field]=value; await setAdminTemp(uid,kind+"_date",d);
          const limits={year:[1300,1500],month:[1,12],day:[1,31],hour:[0,23],minute:[0,59]};
          if(value<limits[field][0]||value>limits[field][1]) { await sendMessage(chatId,"❌ مقدار خارج از محدوده است.\n"+datePrompt(field)); return; }
          if(field==="minute"&&!validateJalali(d)) { await sendMessage(chatId,"❌ تاریخ واردشده معتبر نیست؛ لطفاً روز/ماه/سال را بررسی کنید."); await beginLotteryDate(uid,kind,"day"); return; }
          await showLotteryFieldPreview(uid,kind,field); return;
        }
        else if(state==="lottery_name_input"&&isMainAdmin(uid)) { await setAdminTemp(uid,"lottery_name",text.trim()); await setAdminState(uid,"lottery_occasion_input"); await sendMessage(chatId,"🌟 مناسبت قرعه‌کشی را وارد کنید:"); return; }
        else if(state==="lottery_occasion_input"&&isMainAdmin(uid)) { await setAdminTemp(uid,"lottery_occasion",text.trim()); await beginLotteryDate(uid,"end"); return; }
        else if(state==="personal_target_input"&&isMainAdmin(uid)) { if(!/^\d+$/.test(text.trim())) { await sendMessage(chatId,"❌ آیدی باید فقط عدد باشد. دوباره ارسال کنید:"); return; } await setAdminTemp(uid,"personal_target",Number(text.trim())); await setAdminState(uid,"personal_text_input"); await sendMessage(chatId,"✉️ متن پیامی که باید برای کاربر ارسال شود را بفرستید:"); return; }
        else if(state==="personal_text_input"&&isMainAdmin(uid)) { await setAdminTemp(uid,"personal_text",text); await clearAdminState(uid); const t=await getAdminTemp(uid); await sendMessage(chatId,"👤 مقصد: "+t.personal_target+"\n\n✉️ پیش‌نمایش پیام:\n\n"+text+"\n\nارسال شود؟",personalConfirmKeyboard()); return; }
        await sendMessage(chatId,"👋 **پنل ادمین**",isMainAdmin(uid)?getAdminKeyboard():getExtraAdminKeyboard()); return;
      }

      await createUserIfNotExists(uid);
      if(await checkAllChannels(uid)) await sendUserMainMenu(chatId);
      else await sendMembershipRequired(chatId);
    }

    // ========== Webhook ==========
    const url=new URL(request.url);
    if(url.pathname==="/setWebhook") {
      const webhookUrl=url.origin+"/";
      try {
        const res=await fetch(API_URL+"setWebhook?url="+encodeURIComponent(webhookUrl), {
          method: "GET",
          signal: AbortSignal.timeout(10000)
        });
        const data=await res.json();
        if(!res.ok || !data || data.ok===false) console.error("setWebhook failed:", data);
        return new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}});
      } catch(e) {
        console.error("setWebhook request failed:", e);
        return new Response(JSON.stringify({ok:false,description:"Webhook setup request failed"}), {
          status: 502,
          headers: {"Content-Type":"application/json"}
        });
      }
    }
    if(request.method==="POST") {
      let update;
      try {
        update=await request.json();
      } catch(e) {
        console.error("Invalid webhook JSON:", e);
        // پاسخ 200 مانع ارسال دوباره آپدیت خراب از سمت وبهوک می‌شود.
        return new Response("ok");
      }

      const processUpdate = async () => {
        try {
          if(update.callback_query) await processCallback(update.callback_query, ctx);
          else if(update.message) await processMessage(update.message);
        } catch(e) {
          console.error("Update processing failed:", e && e.name, e && e.message, e && e.stack);
        }
      };

      if(ctx && typeof ctx.waitUntil==="function") {
        ctx.waitUntil(processUpdate());
        return new Response("ok");
      }

      await processUpdate();
      return new Response("ok");
    }
    return new Response("Bot is running!");
  }
};
