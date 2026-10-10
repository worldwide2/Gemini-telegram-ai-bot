# Gemini Telegram AI Bot (updated)

Features:
- Bengali/English text answers
- Short-term per-chat conversation context
- `/clear` to reset chat context
- Image generation with `/image your prompt`

Required Render environment variables:
- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `TELEGRAM_WEBHOOK_SECRET`

Optional:
- `GEMINI_MODEL` defaults to `gemini-3.8-flash`
- `GEMINI_IMAGE_MODEL` defaults to `gemini-3.1-flash-image`

After replacing `index.js` in GitHub, Render should redeploy automatically. Keep the current webhook secret unchanged unless you set Telegram's webhook again with the matching secret. Never publish tokens or secrets.

Try `/start`, ask a follow-up question, use `/clear`, or send `/image a cute cat reading a book in a cozy library`.

Image generation requires that the image model is available to your Gemini API key and quota. Chat history is stored in memory and resets on service restart/redeploy.
