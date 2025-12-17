const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const app = express();

const token = process.env.BOT_TOKEN;
const myAppUrl = process.env.APP_URL;
const bot = new TelegramBot(token, { polling: true });

// শুরুতে এনভায়রনমেন্ট ভেরিয়েবল থেকে জোন আইডি নিবে, না থাকলে ডিফল্ট একটা থাকবে
let currentZoneId = process.env.ZONE_ID || '10341337';

let posts = {};
let userState = {};

app.get('/post/:id', (req, res) => {
    const post = posts[req.params.id];
    if (!post) return res.send("পোস্টটি পাওয়া যায়নি!");

    const html = generateHTML(post.title, post.image, post.quality, post.video, currentZoneId);
    res.send(html);
});

function generateHTML(title, image, quality, video, zoneId) {
    return `
    <!DOCTYPE html>
    <html lang="bn">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <script src='//libtl.com/sdk.js' data-zone='${zoneId}' data-sdk='show_${zoneId}'></script>
        <style>
            body { font-family: Arial, sans-serif; background: #f0f2f5; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            .card { width: 90%; max-width: 400px; background: white; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; text-align: center; }
            img { width: 100%; height: auto; display: block; }
            .content { padding: 20px; }
            .badge { background: #ff9800; color: white; padding: 5px 10px; border-radius: 5px; font-size: 12px; margin-bottom: 10px; display: inline-block; }
            .btn { background: #0088cc; color: white; border: none; padding: 15px; width: 100%; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 16px; }
        </style>
    </head>
    <body>
        <div class="card">
            <img src="${image}">
            <div class="content">
                ${quality !== 'skipped' ? `<div class="badge">${quality}</div>` : ''}
                <h2 style="margin: 10px 0;">${title}</h2>
                <button class="btn" onclick="startAd()">ভিডিওটি আনলক করুন</button>
            </div>
        </div>
        <script>
            let clicks = 0;
            function startAd() {
                const zoneFunc = "show_" + "${zoneId}";
                if (clicks < 3) {
                    if (typeof window[zoneFunc] === 'function') {
                        window[zoneFunc]().then(() => { clicks++; alert("ধাপ " + clicks + "/৩ সম্পন্ন!"); }).catch(() => { clicks++; });
                    } else { clicks++; }
                } else { window.location.href = "${video}"; }
            }
        </script>
    </body>
    </html>`;
}

// জোন আইডি পরিবর্তন করার কমান্ড
bot.onText(/\/setzone (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const newZone = match[1].trim();

    if (!isNaN(newZone)) {
        currentZoneId = newZone;
        bot.sendMessage(chatId, `✅ মনিটেগ জোন আইডি আপডেট হয়েছে!\nএখন থেকে জোন আইডি: \`${currentZoneId}\` ব্যবহার করা হবে।`, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `❌ ভুল আইডি! দয়া করে শুধু সংখ্যা লিখুন। যেমন: \`/setzone 1234567\``);
    }
});

// বটের ধাপসমূহ (/post)
bot.onText(/\/post/, (msg) => {
    const chatId = msg.chat.id;
    userState[chatId] = { step: 1 };
    bot.sendMessage(chatId, "🎬 মুভির নাম (Title) লিখুন:");
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!userState[chatId] || !text || text.startsWith('/')) return;

    let state = userState[chatId];
    if (state.step === 1) {
        state.title = text; state.step = 2;
        bot.sendMessage(chatId, "🖼 মুভির লোগো বা পোস্টার লিঙ্ক (URL) দিন:");
    } else if (state.step === 2) {
        state.image = text; state.step = 3;
        bot.sendMessage(chatId, "📊 ভিডিও কোয়ালিটি লিখুন (যেমন: 1080p, 720p)। না থাকলে 'skip' লিখুন:");
    } else if (state.step === 3) {
        state.quality = text.toLowerCase() === 'skip' ? 'skipped' : text; state.step = 4;
        bot.sendMessage(chatId, "🔗 ভিডিওর আসল লিঙ্ক (Telegram/Drive Link) দিন:");
    } else if (state.step === 4) {
        state.video = text; state.step = 5;
        const opts = { reply_markup: { inline_keyboard: [[{ text: "✅ ফাইনাল করুন", callback_data: 'confirm_post' }]] } };
        bot.sendMessage(chatId, `সব তথ্য ঠিক আছে?\n\nনাম: ${state.title}\nকোয়ালিটি: ${state.quality}\nজোন আইডি: ${currentZoneId}`, opts);
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'confirm_post' && userState[chatId]) {
        const state = userState[chatId];
        const postId = Date.now().toString().slice(-6);
        posts[postId] = { title: state.title, image: state.image, quality: state.quality, video: state.video };

        const finalUrl = `${myAppUrl}/post/${postId}`;
        const rawHtml = generateHTML(state.title, state.image, state.quality, state.video, currentZoneId);

        bot.sendMessage(chatId, `🎉 অভিনন্দন! আপনার পোস্ট তৈরি হয়েছে।\n\n🔗 **লিঙ্ক:**\n${finalUrl}`);
        bot.sendMessage(chatId, `📄 **ব্লগার/HTML কোড:**\n\n\`\`\`html\n${rawHtml}\n\`\`\``, { parse_mode: 'MarkdownV2' });

        delete userState[chatId];
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running...`));
