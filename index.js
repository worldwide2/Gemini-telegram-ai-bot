import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json({ limit: "2mb" }));
const PORT = Number(process.env.PORT || 8080);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY || !TELEGRAM_WEBHOOK_SECRET) {
  console.error("Missing required environment variables. Set TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, and TELEGRAM_WEBHOOK_SECRET.");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
// In-memory history: it resets when Render restarts/redeploys the service.
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 12;

app.get("/", (_req, res) => res.status(200).send("Gemini Telegram AI Bot is running."));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`Telegram API ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}
async function sendText(chatId, text) {
  const chunks = String(text || "দুঃখিত, কোনো উত্তর পাওয়া যায়নি।").match(/[\s\S]{1,4000}/g) || ["দুঃখিত, কোনো উত্তর পাওয়া যায়নি।"];
  for (const chunk of chunks) await telegram("sendMessage", { chat_id: chatId, text: chunk });
}
async function sendPhoto(chatId, base64Data, mimeType = "image/png", caption = "") {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([Buffer.from(base64Data, "base64")], { type: mimeType }), "gemini-image.png");
  if (caption) form.append("caption", caption.slice(0, 1000));
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`Telegram API sendPhoto failed: ${JSON.stringify(data)}`);
  return data.result;
}
function isImageRequest(text) {
  return /^\/image(?:@\w+)?(?:\s|$)/i.test(text) ||
    /(ছবি|ইমেজ|পিকচার).{0,25}(বানাও|তৈরি|জেনারেট|আঁকো|করো)|(?:বানাও|তৈরি করো|জেনারেট করো).{0,25}(ছবি|ইমেজ|পিকচার)|\b(generate|create|make|draw)\s+(an?\s+)?(image|picture|photo|illustration)\b/i.test(text);
}
function getImagePrompt(text) {
  const match = text.match(/^\/image(?:@\w+)?\s*/i);
  if (match) return text.slice(match[0].length).trim();
  return text.trim();
}
async function generateImage(chatId, prompt) {
  if (!prompt) {
    await sendText(chatId, "কী ধরনের ছবি বানাতে হবে লিখো। উদাহরণ: /image a cute cat sitting under the moon");
    return;
  }
  await telegram("sendChatAction", { chat_id: chatId, action: "upload_photo" });
  await sendText(chatId, "🎨 ছবি তৈরি করছি। এতে কিছুটা সময় লাগতে পারে…");
  const result = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: prompt,
    config: { responseModalities: ["TEXT", "IMAGE"] }
  });
  const parts = result?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(part => part.inlineData?.data);
  const textPart = parts.find(part => part.text)?.text;
  if (!imagePart) {
    await sendText(chatId, textPart || "দুঃখিত, এইবার ছবি তৈরি হয়নি। Render Logs দেখো—মডেল/API অ্যাক্সেসে সমস্যা থাকতে পারে।");
    return;
  }
  await sendPhoto(chatId, imagePart.inlineData.data, imagePart.inlineData.mimeType || "image/png", textPart || "তোমার তৈরি করা ছবি 🎨");
}
async function answerMessage(message) {
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return;
  if (text === "/start" || text.startsWith("/start ")) {
    await sendText(chatId, "হ্যালো! আমি Gemini AI বট। বাংলায় বা ইংরেজিতে প্রশ্ন করো।\n\n🧠 আগের কয়েকটি মেসেজের প্রসঙ্গ ধরে উত্তর দিতে পারি।\n🎨 ছবি বানাতে লিখো: /image a futuristic city at sunset\n🧹 নতুন কথোপকথন শুরু করতে লিখো: /clear");
    return;
  }
  if (text === "/clear") {
    conversations.delete(String(chatId));
    await sendText(chatId, "ঠিক আছে! আগের কথোপকথনের স্মৃতি মুছে নতুন করে শুরু করছি।");
    return;
  }
  if (isImageRequest(text)) {
    await generateImage(chatId, getImagePrompt(text));
    return;
  }
  await telegram("sendChatAction", { chat_id: chatId, action: "typing" });
  const key = String(chatId);
  const history = conversations.get(key) || [];
  const contents = [...history, { role: "user", parts: [{ text }] }];
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: "তুমি একটি সহায়ক, ভদ্র ও নির্ভুল AI সহকারী। ব্যবহারকারী যে ভাষায় লেখে, সেই ভাষায় উত্তর দাও। সংক্ষিপ্ত, স্পষ্ট ও স্বাভাবিকভাবে কথা বলো। আগের কথোপকথনের প্রসঙ্গ ব্যবহার করো।",
      maxOutputTokens: 800
    }
  });
  const answer = (response.text || "").trim() || "দুঃখিত, এবার উত্তর তৈরি করতে পারিনি। আবার চেষ্টা করো।";
  conversations.set(key, [...contents, { role: "model", parts: [{ text: answer }] }].slice(-MAX_HISTORY_MESSAGES));
  await sendText(chatId, answer);
}
app.post("/telegram/webhook", (req, res) => {
  if (req.get("x-telegram-bot-api-secret-token") !== TELEGRAM_WEBHOOK_SECRET) return res.status(401).send("Unauthorized");
  res.status(200).json({ ok: true });
  const message = req.body?.message;
  if (message) answerMessage(message).catch(async error => {
    console.error("Failed to answer Telegram message:", error?.stack || error?.message || error);
    try { await sendText(message?.chat?.id, "দুঃখিত, একটি সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করো।"); }
    catch (sendError) { console.error("Could not send error message:", sendError?.message || sendError); }
  });
});
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on ${PORT}`));
