const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const moment = require('moment-timezone'); 
const app = express();

// --- Configuration ---
const token = process.env.BOT_TOKEN;
const myAppUrl = process.env.APP_URL; 
const mongoUri = process.env.MONGODB_URI; 
const ADMIN_ID = parseInt(process.env.ADMIN_ID); 
const ADMIN_USERNAME = process.env.ADMIN_USERNAME; 

const bot = new TelegramBot(token, { polling: true });

// --- MongoDB Connection ---
mongoose.connect(mongoUri).then(() => console.log("✅ MongoDB Connected!"));

// --- Schemas ---
const Post = mongoose.model('Post', new mongoose.Schema({
    id: String, creatorId: Number, title: String, image: String, language: String, links: Array, channels: Array, zoneId: String, clicks: Number, createdAt: { type: Date, default: Date.now }
}));

const UserProfile = mongoose.model('UserProfile', new mongoose.Schema({
    userId: Number, savedChannels: { type: Array, default: [] }, userZoneId: { type: String, default: null } 
}));

const Setting = mongoose.model('Setting', new mongoose.Schema({
    key: String, value: mongoose.Schema.Types.Mixed
}));

const PremiumUser = mongoose.model('PremiumUser', new mongoose.Schema({
    userId: Number, packageName: String, expiryDate: Date
}));

let userState = {};

// --- Helper Functions ---
async function getSet(key, defaultValue) {
    const data = await Setting.findOne({ key });
    return data ? data.value : defaultValue;
}
async function saveSet(key, value) {
    await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
}
async function isPremium(chatId) {
    if (chatId === ADMIN_ID) return true;
    const user = await PremiumUser.findOne({ userId: chatId });
    if (!user) return false;
    if (new Date() > user.expiryDate) {
        await PremiumUser.deleteOne({ userId: chatId });
        return false;
    }
    return true;
}

// --- HTML Generator ---
function generateHTML(post, zoneId, clicks) {
    let qBtns = post.links.map(i => `<button class="btn q-btn" onclick="startAd('${i.link}')">${i.quality} - আনলক</button>`).join('');
    let chSection = (post.channels && post.channels.length > 0) ? 
        `<div class="channel-box"><h3>📢 জয়েন করুন:</h3>${post.channels.map(ch => `<a href="${ch.link}" target="_blank" class="ch-link">${ch.name}</a>`).join('')}</div>` : "";

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${post.title}</title>
    <script src='//libtl.com/sdk.js' data-zone='${zoneId}' data-sdk='show_${zoneId}'></script>
    <style>body{font-family:sans-serif;background:#0f172a;color:white;text-align:center;padding:20px;display:flex;justify-content:center;align-items:center;min-height:100vh;}
    .card{background:#1e293b;padding:20px;border-radius:15px;border:1px solid #334155;max-width:400px;width:100%;box-shadow: 0 10px 25px rgba(0,0,0,0.5);}img{width:100%;border-radius:10px;margin-bottom:15px;object-fit:cover;}
    .channel-box{background:rgba(59,130,246,0.1);padding:10px;margin-bottom:15px;border-radius:10px;border:1px dashed #3b82f6;}
    .ch-link{display:inline-block;background:#3b82f6;color:white;text-decoration:none;padding:8px 15px;margin:4px;border-radius:6px;font-size:14px;font-weight:bold;}
    .btn{background:#2563eb;color:white;padding:14px;width:100%;border-radius:10px;margin:10px 0;border:none;font-weight:bold;cursor:pointer;transition:0.3s;}
    .q-btn{background:#334155;border:1px solid #475569;}#st{color:#fbbf24;margin-bottom:10px;font-weight:bold;}</style></head>
    <body><div class="card"><img src="${post.image}"><h2>${post.title}</h2><p style="color:#94a3b8">Language: ${post.language}</p>${chSection}<div id="st">অ্যাড দেখা হয়েছে: 0/${clicks}</div>${qBtns}</div>
    <script>let c=0;function startAd(u){if(c<${clicks}){if(typeof window['show_'+'${zoneId}'] === 'function'){window['show_'+'${zoneId}']().then(()=>{c++;document.getElementById('st').innerText="অ্যাড দেখা হয়েছে: "+c+"/${clicks}";});}else{c++;document.getElementById('st').innerText="অ্যাড দেখা হয়েছে: "+c+"/${clicks}";}}else{location.href=u;}}</script></body></html>`;
}

// --- Menu Helper ---
async function showMainMenu(chatId) {
    let buttons = [
        [{ text: "🎬 মুভি পোস্ট তৈরি করুন", callback_data: "start_post" }],
        [{ text: "📢 চ্যানেল সেটিংস", callback_data: "setup_channels_menu" }, { text: "🆔 নিজস্ব জোন আইডি", callback_data: "set_user_zone" }],
        [{ text: "💎 প্রিমিয়াম প্ল্যান ও অফার", callback_data: "view_premium" }]
    ];
    
    if (chatId === ADMIN_ID) {
        buttons.push(
            [{ text: "⚙️ ডিফল্ট জোন", callback_data: "set_admin_zone" }, { text: "🖱 ডিফল্ট ক্লিক", callback_data: "set_admin_clicks" }],
            [{ text: "🎁 অফার এডিট", callback_data: "set_offer_prompt" }, { text: "➕ মেম্বার অ্যাড", callback_data: "add_user_prompt" }]
        );
    }
    
    bot.sendMessage(chatId, "🛠 **মুভি মেকার কন্ট্রোল প্যানেল**\nআপনার প্রয়োজনীয় ফিচারে ক্লিক করুন:", { 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons } 
    });
}

// --- Express Route ---
app.get('/post/:id', async (req, res) => {
    const post = await Post.findOne({ id: req.params.id });
    if (!post) return res.send("পোস্ট পাওয়া যায়নি!");
    res.send(generateHTML(post, post.zoneId, post.clicks));
});

// --- Start/Settings Command ---
bot.onText(/\/start|\/settings/, (msg) => showMainMenu(msg.chat.id));

// --- Callback Query Handler ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    const premium = await isPremium(chatId);

    // ১. প্রিমিয়াম লক সিস্টেম (শুধুমাত্র ভিউ প্রিমিয়াম বাটন বাদে সব লক)
    if (!premium && data !== "view_premium") {
        return bot.answerCallbackQuery(q.id, { 
            text: "❌ দুঃখিত! এই ফিচারটি শুধুমাত্র প্রিমিয়াম মেম্বারদের জন্য।", 
            show_alert: true 
        });
    }

    // ২. প্রিমিয়াম ইউজার এবং এডমিন এক্সেস
    if (data === "start_post") {
        userState[chatId] = { step: 'title', links: [] };
        bot.sendMessage(chatId, "🎬 মুভির নাম (Title) লিখুন:");
    }
    else if (data === "set_user_zone") {
        userState[chatId] = { step: 'get_user_zone' };
        bot.sendMessage(chatId, "📝 আপনার নিজস্ব Adsterra Zone ID টি লিখে পাঠান:");
    }
    else if (data === "setup_channels_menu") {
        const profile = await UserProfile.findOne({ userId: chatId });
        let msgText = "📢 **আপনার সেভ করা চ্যানেলসমূহ:**\n";
        if (!profile || profile.savedChannels.length === 0) msgText += "কোনো চ্যানেল নেই।";
        else profile.savedChannels.forEach((ch, i) => msgText += `${i+1}. ${ch.name}\n`);
        bot.sendMessage(chatId, msgText, { 
            reply_markup: { inline_keyboard: [[{ text: "➕ যোগ", callback_data: "add_new_ch" }], [{ text: "🗑 সব মুছুন", callback_data: "clear_channels" }]] } 
        });
    }
    else if (data === "add_new_ch") { userState[chatId] = { step: 'get_ch_name' }; bot.sendMessage(chatId, "চ্যানেলের নাম:"); }
    else if (data === "clear_channels") { await UserProfile.findOneAndUpdate({ userId: chatId }, { savedChannels: [] }); bot.sendMessage(chatId, "✅ সব চ্যানেল ডিলিট হয়েছে।"); }

    // ৩. প্রিমিয়াম অফার (সবার জন্য উন্মুক্ত)
    else if (data === "view_premium") {
        const offer = await getSet('premium_offer', "বর্তমানে কোনো অফার নেই।");
        bot.sendMessage(chatId, `💎 **প্রিমিয়াম অফার ও মেম্বারশিপ:**\n\n${offer}\n\nকিনতে যোগাযোগ: @${ADMIN_USERNAME}`, { parse_mode: 'Markdown' });
    }

    // ৪. এডমিন ফাংশনস (শুধুমাত্র এডমিন)
    else if (chatId === ADMIN_ID) {
        if (data === "set_admin_zone") { userState[chatId] = { step: 'get_admin_zone' }; bot.sendMessage(chatId, "🆔 ডিফল্ট জোন আইডি:"); }
        else if (data === "set_admin_clicks") { userState[chatId] = { step: 'get_admin_clicks' }; bot.sendMessage(chatId, "🖱 ডিফল্ট ক্লিক:"); }
        else if (data === "set_offer_prompt") { userState[chatId] = { step: 'manual_offer' }; bot.sendMessage(chatId, "📝 অফার টেক্সট:"); }
        else if (data === "add_user_prompt") { userState[chatId] = { step: 'manual_add_user' }; bot.sendMessage(chatId, "👤 লিখুন: `UserID | Days | Plan`", { parse_mode: 'Markdown' }); }
    }

    // ৫. পোস্ট কনফার্মেশন
    if (data === "skip_q") {
        bot.sendMessage(chatId, "সব ঠিক থাকলে কনফার্ম করুন:", { reply_markup: { inline_keyboard: [[{ text: "🚀 জেনারেট করুন", callback_data: "confirm_post" }]] } });
    }
    else if (data === "confirm_post" && userState[chatId]) {
        const s = userState[chatId];
        const profile = await UserProfile.findOne({ userId: chatId });
        const adminZone = await getSet('zone_id', '10341337');
        const adminClicks = await getSet('required_clicks', 3);
        const finalZone = (profile && profile.userZoneId) ? profile.userZoneId : adminZone;
        const id = Math.random().toString(36).substring(7);
        const userChannels = profile ? profile.savedChannels : [];

        await new Post({ 
            id, creatorId: chatId, title: s.title, image: s.image, language: s.language, 
            links: s.links, channels: userChannels, zoneId: finalZone, clicks: adminClicks
        }).save();

        const htmlCode = generateHTML({ ...s, channels: userChannels }, finalZone, adminClicks);
        await bot.sendMessage(chatId, `✅ সফল!\n🔗 লিঙ্ক: ${myAppUrl}/post/${id}\n🆔 জোন: ${finalZone}`);
        await bot.sendMessage(chatId, `\`\`\`html\n${htmlCode}\n\`\`\``, { parse_mode: 'MarkdownV2' });
        delete userState[chatId];
    }
});

// --- Message Handler ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    if (userState[chatId]) {
        let s = userState[chatId];
        // ধাপ অনুযায়ী ইনপুট প্রসেসিং...
        if (s.step === 'get_user_zone') { await UserProfile.findOneAndUpdate({ userId: chatId }, { userZoneId: text.trim() }, { upsert: true }); bot.sendMessage(chatId, "✅ আপনার জোন আইডি সেভ হয়েছে।"); delete userState[chatId]; }
        else if (s.step === 'get_ch_name') { s.tempName = text; s.step = 'get_ch_link'; bot.sendMessage(chatId, "চ্যানেল লিঙ্ক:"); }
        else if (s.step === 'get_ch_link') { await UserProfile.findOneAndUpdate({ userId: chatId }, { $push: { savedChannels: { name: s.tempName, link: text } } }, { upsert: true }); bot.sendMessage(chatId, "✅ চ্যানেল সেভ হয়েছে।"); delete userState[chatId]; }
        else if (s.step === 'title') { s.title = text; s.step = 'image'; bot.sendMessage(chatId, "ইমেজ লিঙ্ক:"); }
        else if (s.step === 'image') { s.image = text; s.step = 'lang'; bot.sendMessage(chatId, "ভাষা:"); }
        else if (s.step === 'lang') { s.language = text; s.step = 'q_name'; bot.sendMessage(chatId, "কোয়ালিটি:"); }
        else if (s.step === 'q_name') { s.tempQ = text; s.step = 'q_link'; bot.sendMessage(chatId, "মুভি লিঙ্ক:"); }
        else if (s.step === 'q_link') {
            s.links.push({ quality: s.tempQ, link: text }); s.step = 'q_name';
            bot.sendMessage(chatId, "আরও কোয়ালিটি দিন বা Skip করুন।", { reply_markup: { inline_keyboard: [[{ text: "⏩ Skip & Finish", callback_data: "skip_q" }]] } });
        }
        // এডমিন ধাপ...
        else if (s.step === 'manual_offer' && chatId === ADMIN_ID) { await saveSet('premium_offer', text); bot.sendMessage(chatId, "✅ অফার সেভ হয়েছে।"); delete userState[chatId]; }
        else if (s.step === 'manual_add_user' && chatId === ADMIN_ID) {
            const p = text.split('|'); if (p.length < 3) return;
            const expiry = moment().add(parseInt(p[1]), 'days').toDate();
            await PremiumUser.findOneAndUpdate({ userId: parseInt(p[0]) }, { packageName: p[2].trim(), expiryDate: expiry }, { upsert: true });
            bot.sendMessage(chatId, "✅ মেম্বার যুক্ত হয়েছে।"); delete userState[chatId];
        }
    }
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 Premium Only Bot Ready!"));
