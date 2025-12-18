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
    id: String, creatorId: Number, title: String, image: String, language: String, links: Array, channels: Array, createdAt: { type: Date, default: Date.now }
}));

const UserProfile = mongoose.model('UserProfile', new mongoose.Schema({
    userId: Number, savedChannels: { type: Array, default: [] } 
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

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src='//libtl.com/sdk.js' data-zone='${zoneId}' data-sdk='show_${zoneId}'></script>
    <style>body{font-family:sans-serif;background:#0f172a;color:white;text-align:center;padding:20px;display:flex;justify-content:center;align-items:center;min-height:100vh;}
    .card{background:#1e293b;padding:20px;border-radius:15px;border:1px solid #334155;max-width:400px;width:100%;}img{width:100%;border-radius:10px;margin-bottom:15px;}
    .channel-box{background:rgba(59,130,246,0.1);padding:10px;margin-bottom:15px;border-radius:10px;border:1px dashed #3b82f6;}
    .ch-link{display:inline-block;background:#3b82f6;color:white;text-decoration:none;padding:6px 12px;margin:4px;border-radius:6px;font-size:13px;}
    .btn{background:#2563eb;color:white;padding:14px;width:100%;border-radius:10px;margin:10px 0;border:none;font-weight:bold;cursor:pointer;}
    .q-btn{background:#334155;border:1px solid #475569;}#st{color:#fbbf24;margin-bottom:10px;}</style></head>
    <body><div class="card"><img src="${post.image}"><h2>${post.title}</h2><p>Language: ${post.language}</p>${chSection}<div id="st">অ্যাড দেখা হয়েছে: 0/${clicks}</div>${qBtns}</div>
    <script>let c=0;function startAd(u){if(c<${clicks}){if(typeof window['show_'+'${zoneId}'] === 'function'){window['show_'+'${zoneId}']().then(()=>{c++;document.getElementById('st').innerText="অ্যাড দেখা হয়েছে: "+c+"/${clicks}";});}else{c++;}}else{location.href=u;}}</script></body></html>`;
}

app.get('/post/:id', async (req, res) => {
    const post = await Post.findOne({ id: req.params.id });
    if (!post) return res.send("পোস্টটি পাওয়া যায়নি!");
    const zoneId = await getSet('zone_id', '10341337');
    const clicks = await getSet('required_clicks', 3);
    res.send(generateHTML(post, zoneId, clicks));
});

// --- Bot Logic ---
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🎬 মুভি পোস্ট মেকার বোট!\nসব কন্ট্রোল /settings কমান্ডে পাবেন।"));

bot.onText(/\/settings/, async (msg) => {
    const chatId = msg.chat.id;
    const premium = await isPremium(chatId);
    let buttons = [[{ text: "🎬 নতুন মুভি পোস্ট তৈরি", callback_data: "start_post" }]];
    if (premium) { buttons.push([{ text: "📢 চ্যানেল বাটন সেটআপ", callback_data: "setup_channels_menu" }]); }
    buttons.push([{ text: "💎 প্রিমিয়াম প্ল্যান", callback_data: "view_premium" }]);
    if (chatId === ADMIN_ID) {
        buttons.push([{ text: "⚙️ অ্যাড সেটিংস", callback_data: "ad_settings" }], [{ text: "➕ প্রিমিয়াম মেম্বার অ্যাড", callback_data: "add_user" }]);
    }
    bot.sendMessage(chatId, "🛠 বোট মেইন মেনু", { reply_markup: { inline_keyboard: buttons } });
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    // ১. প্রিমিয়াম প্ল্যান বাটন (সবার জন্য)
    if (data === "view_premium") {
        const pkgText = "💎 **আমাদের প্রিমিয়াম প্ল্যানসমূহ:**\n\n✅ ১ মাস - ১০০ টাকা\n✅ ৩ মাস - ২৫০ টাকা\n\n📌 **সুবিধা:** আনলিমিটেড পোস্ট এবং নিজস্ব চ্যানেল বাটন।\n\nকিনতে যোগাযোগ করুন: @" + ADMIN_USERNAME;
        bot.sendMessage(chatId, pkgText, { parse_mode: 'Markdown' });
    }
    // ২. অ্যাড সেটিংস বাটন (শুধুমাত্র এডমিন)
    else if (data === "ad_settings") {
        if (chatId !== ADMIN_ID) return;
        const currentZone = await getSet('zone_id', '10341337');
        const currentClicks = await getSet('required_clicks', 3);
        bot.sendMessage(chatId, `⚙️ **বর্তমান অ্যাড সেটিংস:**\n\n🆔 Zone ID: \`${currentZone}\`\n🖱 Clicks: \`${currentClicks}\`\n\n**পরিবর্তন করতে লিখুন:**\n\`/setzone ID\`\n\`/setclicks সংখ্যা\``, { parse_mode: 'Markdown' });
    }
    // ৩. প্রিমিয়াম মেম্বার অ্যাড বাটন (শুধুমাত্র এডমিন)
    else if (data === "add_user") {
        if (chatId !== ADMIN_ID) return;
        bot.sendMessage(chatId, "👤 নতুন মেম্বার অ্যাড করতে নিচের ফরম্যাটে লিখুন:\n\n`/addpremium UserID | Days | PackageName`\n\nউদাহরণ: `/addpremium 12345 | 30 | Monthly`", { parse_mode: 'Markdown' });
    }
    // ৪. চ্যানেল সেটআপ ও পোস্ট লজিক (আগের মতোই সঠিক আছে)
    else if (data === "setup_channels_menu") {
        const profile = await UserProfile.findOne({ userId: chatId });
        let msgText = "📢 বর্তমানে সেভ করা চ্যানেলসমূহ:\n\n";
        if (!profile || profile.savedChannels.length === 0) msgText += "কোনো চ্যানেল নেই।";
        else profile.savedChannels.forEach((ch, i) => msgText += `${i+1}. ${ch.name}\n`);
        bot.sendMessage(chatId, msgText, { reply_markup: { inline_keyboard: [[{ text: "➕ নতুন চ্যানেল যোগ", callback_data: "add_new_ch" }], [{ text: "🗑 সব মুছুন", callback_data: "clear_channels" }]] } });
    }
    else if (data === "add_new_ch") { userState[chatId] = { step: 'get_ch_name' }; bot.sendMessage(chatId, "📢 চ্যানেলের নাম দিন:"); }
    else if (data === "clear_channels") { await UserProfile.findOneAndUpdate({ userId: chatId }, { savedChannels: [] }); bot.sendMessage(chatId, "✅ সব ক্লিয়ার হয়েছে।"); }
    else if (data === "start_post") {
        if (!(await isPremium(chatId))) return bot.sendMessage(chatId, "❌ আপনি প্রিমিয়াম মেম্বার নন।");
        userState[chatId] = { step: 'title', links: [] };
        bot.sendMessage(chatId, "🎬 ১. মুভির নাম (Title) লিখুন:");
    }
    else if (data === "skip_q") {
        bot.sendMessage(chatId, "সব তথ্য ঠিক থাকলে কনফার্ম করুন:", { reply_markup: { inline_keyboard: [[{ text: "✅ কনফার্ম পোস্ট", callback_data: "confirm" }]] } });
    }
    else if (data === "confirm" && userState[chatId]) {
        const s = userState[chatId];
        const profile = await UserProfile.findOne({ userId: chatId });
        const userChannels = profile ? profile.savedChannels : [];
        const id = Math.random().toString(36).substring(7);
        await new Post({ id, creatorId: chatId, title: s.title, image: s.image, language: s.language, links: s.links, channels: userChannels }).save();
        const zoneId = await getSet('zone_id', '10341337');
        const clicks = await getSet('required_clicks', 3);
        const finalHtml = generateHTML({...s, channels: userChannels}, zoneId, clicks);
        await bot.sendMessage(chatId, `✅ সফল!\n🔗 ${myAppUrl}/post/${id}`);
        await bot.sendMessage(chatId, `📄 HTML Code:\n\n\`\`\`html\n${finalHtml}\n\`\`\``, { parse_mode: 'Markdown' });
        delete userState[chatId];
    }
});

// --- Message Handler ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!userState[chatId] || !text || text.startsWith('/')) return;
    let s = userState[chatId];

    if (s.step === 'get_ch_name') { s.tempName = text; s.step = 'get_ch_link'; bot.sendMessage(chatId, `🔗 '${text}' লিঙ্ক দিন:`); }
    else if (s.step === 'get_ch_link') {
        await UserProfile.findOneAndUpdate({ userId: chatId }, { $push: { savedChannels: { name: s.tempName, link: text } } }, { upsert: true });
        bot.sendMessage(chatId, "✅ চ্যানেল সেভ হয়েছে।"); delete userState[chatId];
    }
    else if (s.step === 'title') { s.title = text; s.step = 'image'; bot.sendMessage(chatId, "🖼 ২. মুভির পোস্টার লিঙ্ক দিন:"); }
    else if (s.step === 'image') { s.image = text; s.step = 'lang'; bot.sendMessage(chatId, "🌐 ৩. মুভির ভাষা (Language) লিখুন:"); }
    else if (s.step === 'lang') { s.language = text; s.step = 'q_name'; bot.sendMessage(chatId, "📊 ৪. কোয়ালিটির নাম দিন (উদা: 720p) অথবা শেষ করতে 'skip' লিখুন:"); }
    else if (s.step === 'q_name') {
        if (text.toLowerCase() === 'skip') return bot.sendMessage(chatId, "নিচে কনফার্ম করুন:", { reply_markup: { inline_keyboard: [[{ text: "✅ পোস্ট সম্পন্ন করুন", callback_data: "confirm" }]] } });
        s.tempQ = text; s.step = 'q_link'; bot.sendMessage(chatId, `🔗 '${text}' এর ভিডিও লিঙ্ক দিন:`);
    }
    else if (s.step === 'q_link') {
        s.links.push({ quality: s.tempQ, link: text }); s.step = 'q_name';
        bot.sendMessage(chatId, "✅ যুক্ত হয়েছে। পরবর্তী কোয়ালিটি দিন অথবা শেষ করতে 'skip' লিখুন:", { reply_markup: { inline_keyboard: [[{ text: "⏩ আর নেই (Skip)", callback_data: "skip_q" }]] } });
    }
});

// Admin Commands
bot.onText(/\/addpremium (.+)\|(.+)\|(.+)/, async (msg, match) => {
    if (msg.chat.id !== ADMIN_ID) return;
    const expiry = moment().add(parseInt(match[2]), 'days').tz("Asia/Dhaka");
    await PremiumUser.findOneAndUpdate({ userId: parseInt(match[1]) }, { packageName: match[3], expiryDate: expiry.toDate() }, { upsert: true });
    bot.sendMessage(parseInt(match[1]), `🎉 প্রিমিয়াম চালু! মেয়াদ: ${expiry.format('DD-MM-YYYY hh:mm A')}`);
    bot.sendMessage(ADMIN_ID, "✅ মেম্বার অ্যাড করা হয়েছে।");
});

bot.onText(/\/setzone (.+)/, async (msg, match) => { 
    if (msg.chat.id === ADMIN_ID) {
        await saveSet('zone_id', match[1].trim());
        bot.sendMessage(ADMIN_ID, "✅ Zone ID আপডেট হয়েছে।");
    }
});

bot.onText(/\/setclicks (\d+)/, async (msg, match) => { 
    if (msg.chat.id === ADMIN_ID) {
        await saveSet('required_clicks', parseInt(match[1]));
        bot.sendMessage(ADMIN_ID, "✅ Clicks সংখ্যা আপডেট হয়েছে।");
    }
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 Server is running..."));
