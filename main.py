import requests
import time
import json
import os
from datetime import datetime, timedelta

# ========== تنظیمات ==========
TOKEN = "13152928:XUXyBQ9XN5UJdCCg9Xcn7Qhnfsz0eTD1MXw"
BASE_URL = f"https://tapi.bale.ai/bot{TOKEN}/"
ADMIN_ID = 402413224

# کانال‌های عضویت اجباری
CHANNELS = [
    {"username": "efootball_1", "name": "کانال اول"},
    {"username": "shopping_efootball_1", "name": "کانال دوم"},
    {"username": "News_Salavati", "name": "کانال سوم"}
]

# فایل‌های دیتابیس
DB_USERS_FILE = "ravesh_users.json"
DB_SETTINGS_FILE = "ravesh_settings.json"
DB_BANNED_FILE = "ravesh_banned.json"
DB_ADMINS_FILE = "ravesh_admins.json"

# ========== توابع دیتابیس ==========
def load_db(filename):
    if os.path.exists(filename):
        try:
            with open(filename, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_db(filename, data):
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        return True
    except:
        return False

# ========== توابع ارسال پیام ==========
def send_message(chat_id, text, reply_markup=None):
    url = BASE_URL + "sendMessage"
    data = {"chat_id": chat_id, "text": text}
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    try:
        response = requests.post(url, json=data, timeout=10)
        return response.json()
    except Exception as e:
        print(f"❌ خطا در ارسال: {e}")
        return None

def get_updates(offset=None):
    url = BASE_URL + "getUpdates"
    params = {"timeout": 30}
    if offset:
        params["offset"] = offset
    try:
        response = requests.get(url, params=params, timeout=35)
        return response.json().get("result", [])
    except Exception as e:
        print(f"❌ خطا در دریافت: {e}")
        return []

# ========== چک عضویت ==========
def check_channel_membership(user_id, channel_username):
    channel_ids = {
        "efootball_1": 4671301600,
        "shopping_efootball_1": 5230550803,
        "News_Salavati": 4528794092
    }
    try:
        url = BASE_URL + "getChatMember"
        data = {"chat_id": f"@{channel_username}", "user_id": user_id}
        response = requests.post(url, json=data, timeout=10)
        result = response.json()
        
        if result.get("ok") is False and result.get("error_code") == 404:
            if channel_username in channel_ids:
                data2 = {"chat_id": channel_ids[channel_username], "user_id": user_id}
                response2 = requests.post(url, json=data2, timeout=10)
                result = response2.json()
        
        if result.get("ok"):
            status = result.get("result", {}).get("status", "")
            if status in ["member", "administrator", "creator"]:
                return True
            return False
        else:
            return False 
    except Exception as e:
        return False

def check_all_channels(user_id):
    for channel in CHANNELS:
        if not check_channel_membership(user_id, channel["username"]):
            return False
    return True

# ========== توابع کاربران ==========
def get_user(user_id):
    db = load_db(DB_USERS_FILE)
    return db.get(str(user_id))

def create_user_if_not_exists(user_id):
    db = load_db(DB_USERS_FILE)
    user_id_str = str(user_id)
    
    if user_id_str not in db:
        db[user_id_str] = {
            "user_id": user_id,
            "join_date": datetime.now().isoformat(),
            "verified": False,
            "support_requests": 0
        }
        save_db(DB_USERS_FILE, db)
        print(f"👤 کاربر جدید: {user_id} | کل: {len(db)}")
        
        if len(db) > 0 and len(db) % 30 == 0:
            msg = f"🎉 **تبریک!**\n\nتعداد کاربران ربات به **{len(db)}** نفر رسید!"
            send_message(ADMIN_ID, msg)
        return db[user_id_str]
    return db[user_id_str]

def set_user_verified(user_id, verified=True):
    db = load_db(DB_USERS_FILE)
    user_id_str = str(user_id)
    if user_id_str in db:
        db[user_id_str]["verified"] = verified
        save_db(DB_USERS_FILE, db)

def get_all_users():
    db = load_db(DB_USERS_FILE)
    return list(db.values())

def get_users_count():
    db = load_db(DB_USERS_FILE)
    return len(db)

# ========== توابع مسدودیت ==========
def get_banned_list():
    return load_db(DB_BANNED_FILE)

def is_banned(user_id):
    banned = get_banned_list()
    return str(user_id) in banned

def ban_user(user_id, banned_by):
    banned = get_banned_list()
    user_id_str = str(user_id)
    banned[user_id_str] = {
        "user_id": user_id,
        "banned_by": banned_by,
        "banned_at": datetime.now().isoformat(),
        "review_requests": 0,
        "last_request": None
    }
    save_db(DB_BANNED_FILE, banned)

def unban_user(user_id):
    banned = get_banned_list()
    user_id_str = str(user_id)
    if user_id_str in banned:
        del banned[user_id_str]
        save_db(DB_BANNED_FILE, banned)
        return True
    return False

def can_request_review(user_id):
    banned = get_banned_list()
    user_id_str = str(user_id)
    if user_id_str not in banned:
        return False
    last_request = banned[user_id_str].get("last_request")
    if not last_request:
        return True
    try:
        last_time = datetime.fromisoformat(last_request)
        if datetime.now() - last_time >= timedelta(hours=24):
            return True
        return False
    except:
        return True

def register_review_request(user_id):
    banned = get_banned_list()
    user_id_str = str(user_id)
    if user_id_str in banned:
        banned[user_id_str]["review_requests"] = banned[user_id_str].get("review_requests", 0) + 1
        banned[user_id_str]["last_request"] = datetime.now().isoformat()
        save_db(DB_BANNED_FILE, banned)

# ========== توابع ادمین ==========
def get_admins_list():
    return load_db(DB_ADMINS_FILE)

def is_main_admin(user_id):
    return user_id == ADMIN_ID

def is_extra_admin(user_id):
    admins = get_admins_list()
    return str(user_id) in admins

def is_any_admin(user_id):
    return is_main_admin(user_id) or is_extra_admin(user_id)

def add_extra_admin(user_id):
    admins = get_admins_list()
    admins[str(user_id)] = {"user_id": user_id, "added_at": datetime.now().isoformat()}
    save_db(DB_ADMINS_FILE, admins)

def remove_extra_admin(user_id):
    admins = get_admins_list()
    if str(user_id) in admins:
        del admins[str(user_id)]
        save_db(DB_ADMINS_FILE, admins)
        return True
    return False

# ========== تنظیمات باکس ==========
def get_box_settings():
    settings = load_db(DB_SETTINGS_FILE)
    return settings.get("box", {"name": "روش باکس", "description": "در انتظار تنظیم ادمین"})

def save_box_settings(name, description):
    settings = load_db(DB_SETTINGS_FILE)
    settings["box"] = {"name": name, "description": description, "updated_at": datetime.now().isoformat()}
    save_db(DB_SETTINGS_FILE, settings)

# ========== کیبوردها ==========
def get_channels_keyboard():
    return {
        "inline_keyboard": [
            [{"text": "📢 کانال اول", "url": "https://ble.ir/efootball_1"}],
            [{"text": "📢 کانال دوم", "url": "https://ble.ir/shopping_efootball_1"}],
            [{"text": "📢 کانال سوم", "url": "https://ble.ir/News_Salavati"}],
            [{"text": "✓ بررسی عضویت", "callback_data": "check_membership"}]
        ]
    }

def get_user_main_keyboard():
    return {
        "keyboard": [[{"text": "👤 پروفایل من"}]],
        "resize_keyboard": True,
        "is_persistent": True
    }

def get_get_method_keyboard():
    return {"inline_keyboard": [[{"text": "🎁 دریافت روش", "callback_data": "get_method"}]]}

def get_profile_copy_keyboard(user_id):
    return {"inline_keyboard": [[{"text": "📋 کپی آیدی عددی", "callback_data": f"copy_id_{user_id}"}]]}

def get_admin_keyboard():
    return {
        "inline_keyboard": [
            [{"text": "📥 بروزرسانی روش باکس ها", "callback_data": "admin_update_box"}],
            [{"text": "📢 اطلاع رسانی به همه کاربر ها", "callback_data": "admin_broadcast"}],
            [{"text": "📊 آمار ربات", "callback_data": "admin_stats"}],
            [{"text": "🚫 لیست مسدودی", "callback_data": "admin_ban_list"}],
            [{"text": "📋 لیست مسدودها", "callback_data": "admin_banned_users"}],
            [{"text": "👑 افزودن ادمین", "callback_data": "admin_add_admin"}],
            [{"text": "📋 لیست ادمین‌ها", "callback_data": "admin_admins_list"}]
        ]
    }

def get_extra_admin_keyboard():
    return {
        "inline_keyboard": [
            [{"text": "🚫 لیست مسدودی", "callback_data": "admin_ban_list"}],
            [{"text": "📋 لیست مسدودها", "callback_data": "admin_banned_users"}]
        ]
    }

def get_ban_actions_keyboard():
    return {
        "inline_keyboard": [
            [{"text": "🔒 مسدود کردن کاربر", "callback_data": "ban_user_start"}],
            [{"text": "🔓 رفع مسدودیت کاربر", "callback_data": "unban_user_start"}]
        ]
    }

def get_confirm_keyboard():
    return {"inline_keyboard": [[{"text": "✅ تایید", "callback_data": "confirm_yes"}], [{"text": "❌ لغو و ویرایش", "callback_data": "confirm_no"}]]}

def get_ban_confirm_keyboard():
    return {"inline_keyboard": [[{"text": "✅ تایید", "callback_data": "ban_confirm_yes"}], [{"text": "❌ لغو", "callback_data": "ban_confirm_no"}]]}

def get_unban_confirm_keyboard():
    return {"inline_keyboard": [[{"text": "✅ تایید", "callback_data": "unban_confirm_yes"}], [{"text": "❌ لغو", "callback_data": "unban_confirm_no"}]]}

def get_broadcast_confirm_keyboard():
    return {"inline_keyboard": [[{"text": "✅ تایید", "callback_data": "broadcast_yes"}], [{"text": "❌ لغو", "callback_data": "broadcast_no"}]]}

def get_banned_user_keyboard():
    return {"inline_keyboard": [[{"text": "📩 درخواست بررسی مجدد از ادمین", "callback_data": "user_review_request"}]]}

def get_review_action_keyboard(user_id):
    return {"inline_keyboard": [[{"text": "✅ بررسی شد و رفع بن شود", "callback_data": f"review_approve_{user_id}"}], [{"text": "❌ بررسی شد اما رفع بن نشود", "callback_data": f"review_reject_{user_id}"}]]}

def get_remove_admin_confirm_keyboard(target_id):
    return {"inline_keyboard": [[{"text": "✅ تایید حذف", "callback_data": f"remove_admin_yes_{target_id}"}], [{"text": "❌ لغو", "callback_data": "remove_admin_no"}]]}

# ========== توابع ارسال پیام‌های خاص ==========
def send_membership_required(chat_id):
    text = "🔐 **برای استفاده از ربات، لطفاً در کانال‌های زیر عضو شوید:**\n\nپس از عضویت، روی دکمه «✓ بررسی عضویت» کلیک کنید."
    send_message(chat_id, text, get_channels_keyboard())

def send_get_method_message(chat_id):
    box = get_box_settings()
    name = box.get("name", "روش باکس")
    text = f"🎁 **برای دریافت {name} کلیک کنید**\n\n👇 روی دکمه زیر بزنید:"
    send_message(chat_id, text, get_get_method_keyboard())

def send_user_main_menu(chat_id):
    send_message(chat_id, "👋 **منوی اصلی**\n\nاز دکمه‌های زیر استفاده کنید:", get_user_main_keyboard())
    time.sleep(0.3)
    send_get_method_message(chat_id)

def send_banned_message(chat_id):
    text = "🚫 **کاربر گرامی،**\n\nبا نظر ادمین به دلیل پیام‌های نامربوطه شما، دیگر استفاده از ربات برای شما امکان‌پذیر نیست!\n\nدر صورت اعتراض، می‌توانید درخواست بررسی مجدد ارسال کنید."
    send_message(chat_id, text, get_banned_user_keyboard())

def send_profile_message(chat_id, user_id):
    user = get_user(user_id)
    banned = is_banned(user_id)
    status = "🚫 مسدود" if banned else "✅ آزاد"
    support_requests = user.get("support_requests", 0) if user else 0
    text = "👤 **پروفایل من**\n\n"
    text += "📊 وضعیت اکانت: " + status + "\n"
    text += "📩 تعداد درخواست پشتیبانی: " + str(support_requests) + "\n"
    text += "🆔 آیدی عددی: `" + str(user_id) + "`"
    send_message(chat_id, text, get_profile_copy_keyboard(user_id))

# ========== State ادمین ==========
def get_admin_temp(user_id):
    settings = load_db(DB_SETTINGS_FILE)
    return settings.get(f"admin_temp_{user_id}", {})

def set_admin_temp(user_id, key, value):
    settings = load_db(DB_SETTINGS_FILE)
    temp_key = f"admin_temp_{user_id}"
    if temp_key not in settings:
        settings[temp_key] = {}
    settings[temp_key][key] = value
    save_db(DB_SETTINGS_FILE, settings)

def clear_admin_temp(user_id):
    settings = load_db(DB_SETTINGS_FILE)
    temp_key = f"admin_temp_{user_id}"
    if temp_key in settings:
        del settings[temp_key]
        save_db(DB_SETTINGS_FILE, settings)

def set_admin_state(user_id, state):
    settings = load_db(DB_SETTINGS_FILE)
    if "admin_states" not in settings:
        settings["admin_states"] = {}
    settings["admin_states"][str(user_id)] = state
    save_db(DB_SETTINGS_FILE, settings)

def get_admin_state(user_id):
    settings = load_db(DB_SETTINGS_FILE)
    return settings.get("admin_states", {}).get(str(user_id))

def clear_admin_state(user_id):
    settings = load_db(DB_SETTINGS_FILE)
    if "admin_states" in settings:
        settings["admin_states"].pop(str(user_id), None)
        save_db(DB_SETTINGS_FILE, settings)
        
        # ========== پردازش دکمه‌های شیشه‌ای ==========
def process_callback(callback):
    try:
        chat_id = str(callback["message"]["chat"]["id"])
        user_id = callback["from"]["id"]
        data = callback["data"]
        
        print(f"📩 Callback: {data} از {user_id}")
        
        if data == "check_membership":
            if check_all_channels(user_id):
                set_user_verified(user_id, True)
                send_message(chat_id, "✅ **عضویت شما تایید شد**")
                time.sleep(0.5)
                send_user_main_menu(chat_id)
            else:
                send_message(chat_id, "❌ **شما در همه کانال‌ها عضو نشده‌اید!**\n\nلطفاً ابتدا عضو شوید و دوباره بررسی کنید.", get_channels_keyboard())
        
        elif data == "get_method":
            box = get_box_settings()
            name = box.get("name", "روش باکس")
            description = box.get("description", "توضیحات تنظیم نشده")
            send_message(chat_id, name + "\n\n" + description)
        
        elif data.startswith("copy_id_"):
            target_user_id = data.replace("copy_id_", "")
            send_message(chat_id, "`" + str(target_user_id) + "`")
        
        # ===== درخواست بررسی مجدد =====
        elif data == "user_review_request":
            if not can_request_review(user_id):
                send_message(chat_id, "⏳ **شما هر ۲۴ ساعت فقط یکبار می‌توانید درخواست بررسی مجدد بدهید.**\n\nلطفاً بعداً دوباره تلاش کنید.")
                return
            
            register_review_request(user_id)
            send_message(chat_id, "✅ **درخواست شما برای ادمین ارسال شد.**\n\n⏰ پس از ۱۲ الی ۲۴ ساعت بررسی و پاسخ داده می‌شود.")
            
            banned = get_banned_list()
            review_count = banned.get(str(user_id), {}).get("review_requests", 0)
            
            request_text = "📩 **درخواست بررسی مجدد از طرف کاربر**\n\n"
            request_text += "🆔 آیدی عددی: `" + str(user_id) + "`\n"
            request_text += "📊 تعداد درخواست‌های قبلی: " + str(review_count) + "\n\n"
            request_text += "کاربر درخواست بررسی مجدد و رفع بن شدن را دارد!"
            
            send_message(ADMIN_ID, request_text, get_review_action_keyboard(user_id))
            
            admins = get_admins_list()
            for admin_id_str in admins.keys():
                try:
                    send_message(int(admin_id_str), request_text, get_review_action_keyboard(user_id))
                except:
                    pass
        
        # ===== پنل ادمین: لیست مسدودی =====
        elif data == "admin_ban_list":
            if not is_any_admin(user_id):
                return
            send_message(chat_id, "🚫 **لیست مسدودی**\n\nیکی از گزینه‌ها را انتخاب کنید:", get_ban_actions_keyboard())
        
        elif data == "ban_user_start":
            if not is_any_admin(user_id):
                return
            set_admin_state(user_id, "waiting_for_ban_id")
            send_message(chat_id, "🆔 **آیدی عددی کاربر مورد نظر را ارسال کنید:**")
        
        elif data == "unban_user_start":
            if not is_any_admin(user_id):
                return
            set_admin_state(user_id, "waiting_for_unban_id")
            send_message(chat_id, "🆔 **آیدی عددی کاربر مورد نظر را ارسال کنید:**")
        
        elif data == "ban_confirm_yes":
            if not is_any_admin(user_id):
                return
            temp = get_admin_temp(user_id)
            target_id = temp.get("target_ban_id")
            if target_id:
                ban_user(target_id, user_id)
                send_banned_message(target_id)
                send_message(chat_id, "✅ **کاربر با موفقیت مسدود شد!**\n\n🆔 آیدی: `" + str(target_id) + "`", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
                clear_admin_temp(user_id)
        
        elif data == "ban_confirm_no":
            if not is_any_admin(user_id):
                return
            clear_admin_temp(user_id)
            send_message(chat_id, "❌ مسدود کردن لغو شد.", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
        
        elif data == "unban_confirm_yes":
            if not is_any_admin(user_id):
                return
            temp = get_admin_temp(user_id)
            target_id = temp.get("target_unban_id")
            if target_id:
                if unban_user(target_id):
                    send_message(target_id, "✅ **شما رفع مسدودیت شدید و می‌توانید از ربات استفاده کنید.**")
                    send_message(chat_id, "✅ **کاربر رفع مسدودیت شد!**\n\n🆔 آیدی: `" + str(target_id) + "`", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
                else:
                    send_message(chat_id, "❌ این کاربر در لیست مسدودها نیست!", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
                clear_admin_temp(user_id)
        
        elif data == "unban_confirm_no":
            if not is_any_admin(user_id):
                return
            clear_admin_temp(user_id)
            send_message(chat_id, "❌ رفع مسدودیت لغو شد.", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
        
        # ===== تصمیم ادمین در مورد درخواست بررسی =====
        elif data.startswith("review_approve_"):
            if not is_any_admin(user_id):
                return
            target_id = int(data.replace("review_approve_", ""))
            if unban_user(target_id):
                send_message(target_id, "✅ **درخواست شما پذیرفته شد و اکنون می‌توانید از ربات استفاده کنید.**")
                send_message(chat_id, "✅ کاربر `" + str(target_id) + "` رفع بن شد.", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
            else:
                send_message(chat_id, "❌ کاربر در لیست مسدودها نیست!", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
        
        elif data.startswith("review_reject_"):
            if not is_any_admin(user_id):
                return
            target_id = int(data.replace("review_reject_", ""))
            send_message(target_id, "❌ **درخواست شما پس از بررسی مجدد رد شد.**")
            send_message(chat_id, "❌ درخواست کاربر `" + str(target_id) + "` رد شد.", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
        
        # ===== پنل ادمین: لیست مسدودها =====
        elif data == "admin_banned_users":
            if not is_any_admin(user_id):
                return
            banned = get_banned_list()
            if not banned:
                send_message(chat_id, "✅ **هیچ کاربر مسدودی وجود ندارد.**", get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
                return
            text = "📋 **لیست مسدودها:**\n\n"
            for i, (uid, info) in enumerate(banned.items(), 1):
                requests_count = info.get("review_requests", 0)
                text += str(i) + ". 🆔 `" + uid + "` - 📩 درخواست بررسی: " + str(requests_count) + "\n"
            send_message(chat_id, text, get_admin_keyboard() if is_main_admin(user_id) else get_extra_admin_keyboard())
        
        # ===== بروزرسانی باکس =====
        elif data == "admin_update_box":
            if not is_main_admin(user_id):
                return
            set_admin_state(user_id, "waiting_for_box_name")
            send_message(chat_id, "📝 **اسم باکس رو وارد کنید:**")
        
        # ===== اطلاع‌رسانی =====
        elif data == "admin_broadcast":
            if not is_main_admin(user_id):
                return
            set_admin_state(user_id, "waiting_for_broadcast")
            send_message(chat_id, "📢 **پیام اطلاع‌رسانی رو بفرستید:**")
        
        # ===== آمار =====
        elif data == "admin_stats":
            if not is_main_admin(user_id):
                return
            total = get_users_count()
            users = get_all_users()
            verified_count = sum(1 for u in users if u.get("verified", False))
            banned_count = len(get_banned_list())
            text = "📊 **آمار ربات**\n\n"
            text += "👥 کل کاربران: " + str(total) + " نفر\n"
            text += "✅ کاربران تایید شده: " + str(verified_count) + " نفر\n"
            text += "⏳ کاربران تایید نشده: " + str(total - verified_count) + " نفر\n"
            text += "🚫 کاربران مسدود: " + str(banned_count) + " نفر\n\n"
            text += "📅 آخرین بروزرسانی: " + datetime.now().strftime('%Y-%m-%d %H:%M')
            send_message(chat_id, text, get_admin_keyboard())
        
        # ===== افزودن ادمین =====
        elif data == "admin_add_admin":
            if not is_main_admin(user_id):
                return
            set_admin_state(user_id, "waiting_for_new_admin_id")
            send_message(chat_id, "👑 **آیدی عددی ادمین جدید را ارسال کنید:**")
        
        # ===== لیست ادمین‌ها =====
        elif data == "admin_admins_list":
            if not is_main_admin(user_id):
                return
            admins = get_admins_list()
            if not admins:
                send_message(chat_id, "📋 **لیست ادمین‌ها خالی است.**", get_admin_keyboard())
                return
            text = "👑 **لیست ادمین‌های اضافی:**\n\n"
            for i, (uid, info) in enumerate(admins.items(), 1):
                added_at = info.get("added_at", "")[:16]
                text += str(i) + ". 🆔 `" + uid + "` - 📅 " + added_at + "\n"
            text += "\n🆔 **برای حذف ادمین، آیدی عددی او را ارسال کنید:**"
            set_admin_state(user_id, "waiting_for_remove_admin_id")
            send_message(chat_id, text)
        
        # ===== حذف ادمین =====
        elif data.startswith("remove_admin_yes_"):
            if not is_main_admin(user_id):
                return
            target_id = int(data.replace("remove_admin_yes_", ""))
            if remove_extra_admin(target_id):
                send_message(chat_id, "✅ **ادمین حذف شد!**\n\n🆔 آیدی: `" + str(target_id) + "`", get_admin_keyboard())
                try:
                    send_message(target_id, "⚠️ **شما از ادمینی ربات برکنار شدید.**", get_user_main_keyboard())
                except:
                    pass
            else:
                send_message(chat_id, "❌ این کاربر ادمین نیست!", get_admin_keyboard())
        
        elif data == "remove_admin_no":
            if not is_main_admin(user_id):
                return
            clear_admin_temp(user_id)
            send_message(chat_id, "❌ حذف ادمین لغو شد.", get_admin_keyboard())
        
        # ===== تایید بروزرسانی باکس =====
        elif data == "confirm_yes":
            if not is_main_admin(user_id):
                return
            temp = get_admin_temp(user_id)
            box_name = temp.get("box_name", "")
            box_description = temp.get("box_description", "")
            if box_name and box_description:
                save_box_settings(box_name, box_description)
                text = "✅ **باکس بروزرسانی شد!**\n\n📦 اسم: " + box_name + "\n📝 توضیحات: " + box_description
                send_message(chat_id, text, get_admin_keyboard())
                clear_admin_temp(user_id)
            else:
                send_message(chat_id, "❌ خطا! اطلاعات ناقص است.", get_admin_keyboard())
        
        elif data == "confirm_no":
            if not is_main_admin(user_id):
                return
            clear_admin_temp(user_id)
            set_admin_state(user_id, "waiting_for_box_name")
            send_message(chat_id, "🔄 **دوباره اسم باکس رو وارد کنید:**")
        
        # ===== تایید اطلاع‌رسانی =====
        elif data == "broadcast_yes":
            if not is_main_admin(user_id):
                return
            temp = get_admin_temp(user_id)
            broadcast_text = temp.get("broadcast_text", "")
            if broadcast_text:
                users = get_all_users()
                sent_count = 0
                send_message(chat_id, "⏳ در حال ارسال به " + str(len(users)) + " کاربر...")
                for u in users:
                    try:
                        send_message(u["user_id"], "📢 **اطلاعیه:**\n\n" + broadcast_text)
                        sent_count += 1
                        time.sleep(0.05)
                    except:
                        pass
                send_message(chat_id, "✅ **ارسال شد به " + str(sent_count) + " نفر**", get_admin_keyboard())
                clear_admin_temp(user_id)
            else:
                send_message(chat_id, "❌ خطا! متنی وجود ندارد.", get_admin_keyboard())
        
        elif data == "broadcast_no":
            if not is_main_admin(user_id):
                return
            clear_admin_temp(user_id)
            send_message(chat_id, "❌ اطلاع‌رسانی لغو شد.", get_admin_keyboard())
            
    except Exception as e:
        print(f"❌ خطا در process_callback: {e}")

# ========== پردازش پیام‌های متنی ==========
def process_message(msg):
    try:
        chat_id = str(msg["chat"]["id"])
        user_id = msg["from"]["id"]
        text = msg.get("text", "")
        
        print(f"📩 پیام از {user_id}: {text[:50] if text else '(غیرمتنی)'}")
        
        # ===== دکمه پروفایل (حتی برای مسدودها کار میکنه) =====
        if text == "👤 پروفایل من":
            create_user_if_not_exists(user_id)
            send_profile_message(chat_id, user_id)
            return
        
        # ===== چک مسدود بودن =====
        if is_banned(user_id):
            send_banned_message(chat_id)
            return
        
        # ===== اگه ادمین بود =====
        if is_any_admin(user_id):
            admin_state = get_admin_state(user_id)
            
            if admin_state == "waiting_for_box_name" and is_main_admin(user_id):
                set_admin_temp(user_id, "box_name", text)
                set_admin_state(user_id, "waiting_for_box_description")
                send_message(chat_id, "✅ اسم باکس ذخیره شد: `" + text + "`\n\n📝 **حالا توضیحات رو وارد کنید:**")
                return
            
            elif admin_state == "waiting_for_box_description" and is_main_admin(user_id):
                set_admin_temp(user_id, "box_description", text)
                clear_admin_state(user_id)
                temp = get_admin_temp(user_id)
                box_name = temp.get("box_name", "")
                preview = "📦 **پیش‌نمایش:**\n\n**اسم:** " + box_name + "\n**توضیحات:** " + text + "\n\nآیا مطمئنید؟"
                send_message(chat_id, preview, get_confirm_keyboard())
                return
            
            elif admin_state == "waiting_for_broadcast" and is_main_admin(user_id):
                set_admin_temp(user_id, "broadcast_text", text)
                clear_admin_state(user_id)
                preview = "📢 **پیش‌نمایش اطلاع‌رسانی:**\n\n" + text + "\n\nآیا مطمئنید؟"
                send_message(chat_id, preview, get_broadcast_confirm_keyboard())
                return
            
            elif admin_state == "waiting_for_ban_id":
                if text.isdigit():
                    target_id = int(text)
                    set_admin_temp(user_id, "target_ban_id", target_id)
                    clear_admin_state(user_id)
                    send_message(chat_id, "⚠️ **آیا از مسدود کردن کاربر مطمئنید؟**\n\n🆔 آیدی: `" + str(target_id) + "`", get_ban_confirm_keyboard())
                else:
                    send_message(chat_id, "❌ لطفاً یک آیدی عددی معتبر ارسال کنید:")
                return
            
            elif admin_state == "waiting_for_unban_id":
                if text.isdigit():
                    target_id = int(text)
                    set_admin_temp(user_id, "target_unban_id", target_id)
                    clear_admin_state(user_id)
                    send_message(chat_id, "⚠️ **آیا از رفع مسدودیت مطمئنید؟**\n\n🆔 آیدی: `" + str(target_id) + "`", get_unban_confirm_keyboard())
                else:
                    send_message(chat_id, "❌ لطفاً یک آیدی عددی معتبر ارسال کنید:")
                return
            
            elif admin_state == "waiting_for_new_admin_id" and is_main_admin(user_id):
                if text.isdigit():
                    new_admin_id = int(text)
                    add_extra_admin(new_admin_id)
                    clear_admin_state(user_id)
                    send_message(chat_id, "✅ **ادمین جدید اضافه شد!**\n\n🆔 آیدی: `" + str(new_admin_id) + "`", get_admin_keyboard())
                    try:
                        send_message(new_admin_id, "👑 **شما به عنوان ادمین ربات منصوب شدید!**\n\n⚠️ شما فقط به بخش «لیست مسدودی» دسترسی دارید.", get_extra_admin_keyboard())
                    except:
                        pass
                else:
                    send_message(chat_id, "❌ لطفاً یک آیدی عددی معتبر ارسال کنید:")
                return
            
            elif admin_state == "waiting_for_remove_admin_id" and is_main_admin(user_id):
                if text.isdigit():
                    target_id = int(text)
                    clear_admin_state(user_id)
                    send_message(chat_id, "⚠️ **آیا از حذف ادمین مطمئنید؟**\n\n🆔 آیدی: `" + str(target_id) + "`", get_remove_admin_confirm_keyboard(target_id))
                else:
                    send_message(chat_id, "❌ لطفاً یک آیدی عددی معتبر ارسال کنید:")
                return
            
            if is_main_admin(user_id):
                send_message(chat_id, "👋 **به پنل ادمین خوش اومدی!**\n\n🆔 آیدی شما: `" + str(user_id) + "`", get_admin_keyboard())
            else:
                send_message(chat_id, "👋 **به پنل ادمین خوش اومدی!**\n\n🆔 آیدی شما: `" + str(user_id) + "`\n\n⚠️ دسترسی شما فقط به بخش مسدودی‌ها می‌باشد.", get_extra_admin_keyboard())
            return
        
        # ===== برای کاربران عادی =====
        create_user_if_not_exists(user_id)
        
        # چک عضویت
        if check_all_channels(user_id):
            set_user_verified(user_id, True)
            send_user_main_menu(chat_id)
        else:
            set_user_verified(user_id, False)
            send_membership_required(chat_id)
            
    except Exception as e:
        print(f"❌ خطا در process_message: {e}")

# ========== حلقه اصلی ==========
print("🤖 ربات Ravesh روشن شد!")
print("👑 ادمین اصلی: " + str(ADMIN_ID))
print("📢 کانال‌ها: " + str(len(CHANNELS)))
print("👥 کاربران: " + str(get_users_count()))
print("🚫 مسدودها: " + str(len(get_banned_list())))

last_update_id = 0

while True:
    try:
        updates = get_updates(last_update_id + 1 if last_update_id else None)
        
        for update in updates:
            last_update_id = update["update_id"]
            
            if "message" in update:
                process_message(update["message"])
            elif "callback_query" in update:
                process_callback(update["callback_query"])
        
        time.sleep(0.5)
    
    except Exception as e:
        print("❌ خطای کلی: " + str(e))
        time.sleep(5)
