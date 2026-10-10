import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 8080);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY || !TELEGRAM_WEBHOOK_SECRET) {
  console.error("Missing required environment variables. Set TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, and TELEGRAM_WEBHOOK_SECRET.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

app.get("/", (_req, res) => {
  res.status(200).send("Gemini Telegram Bot is running.");
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram API ${method} failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function answerMessage(message) {
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  if (!chatId || !text) return;
  if (text.startsWith("/start")) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "হ্যালো! আমি Gemini AI বট। আমাকে যেকোনো প্রশ্ন করতে পারো।"
    });
    return;
  }

  await telegram("sendChatAction", { chat_id: chatId, action: "typing" });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: text,
    config: {
      systemInstruction: "তুমি একটি সহায়ক, ভদ্র এবং নির্ভুল AI সহকারী। ব্যবহারকারী যে ভাষায় লেখে, সম্ভব হলে সেই ভাষায় উত্তর দাও।",
      maxOutputTokens: 1200
    }
  });

  const answer = (response.text || "").trim() || "দুঃখিত, এবার উত্তর তৈরি করতে পারিনি। আবার চেষ্টা করো।";
  // Telegram sendMessage text limit is 4096 characters; split long responses safely.
  const chunks = answer.match(/[\s\S]{1,4000}/g) || ["দুঃখিত, কোনো উত্তর পাওয়া যায়নি।"];
  for (const chunk of chunks) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: chunk
    });
  }
}

app.post("/telegram/webhook", (req, res) => {
  const suppliedSecret = req.get("x-telegram-bot-api-secret-token");
  if (suppliedSecret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  // Acknowledge Telegram immediately; handle the AI reply in the background.
  res.status(200).json({ ok: true });
  const message = req.body?.message;
  if (message) {
    answerMessage(message).catch((error) => {
      console.error("Failed to answer Telegram message:", error.message);
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on ${PORT}`);
});
