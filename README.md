# Gemini + Telegram Bot (Cloud Run)

A small Node.js webhook bot using the Gemini API. Keep all tokens in Cloud Run secrets/environment settings; never commit real keys to GitHub.

## Required values

- `TELEGRAM_BOT_TOKEN`: token from Telegram BotFather
- `GEMINI_API_KEY`: key from Google AI Studio
- `TELEGRAM_WEBHOOK_SECRET`: random secret (letters/numbers/underscore/hyphen; 20–40 chars recommended)
- `GEMINI_MODEL`: optional; defaults to `gemini-3.8-flash`

## Deploy from GitHub to Cloud Run

1. Create a GitHub repository and upload these files to its root.
2. In Google Cloud Console, select/create a project and enable billing as prompted.
3. Open Cloud Run and choose to deploy a service from a source repository (the exact menu label may vary).
4. Connect the GitHub repository and deploy the source.
5. In the service's Variables & Secrets section, add the three required values above. Prefer Secret Manager for tokens.
6. Deploy/redeploy and copy the service URL, e.g. `https://YOUR-SERVICE-....run.app`.

## Register the Telegram webhook

Use Google Cloud Shell (or another terminal with `curl`) after deployment. Replace all placeholders locally; do not share a command containing your bot token.

```bash
export BOT_TOKEN='PASTE_BOTFATHER_TOKEN_HERE'
export SERVICE_URL='PASTE_CLOUD_RUN_SERVICE_URL_HERE'
export WEBHOOK_SECRET='PASTE_THE_SAME_TELEGRAM_WEBHOOK_SECRET_SET_IN_CLOUD_RUN'

curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${SERVICE_URL}/telegram/webhook\",\"secret_token\":\"${WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\"]}"
```

A successful result includes `"ok":true`. Then open your Telegram bot and send `/start`, followed by a question.

## Troubleshooting

- `401 Unauthorized`: `WEBHOOK_SECRET` used in `setWebhook` does not exactly match `TELEGRAM_WEBHOOK_SECRET` in Cloud Run.
- No response: check Cloud Run logs, verify all environment variables, and call `getWebhookInfo` using the Telegram Bot API.
- Gemini API errors: check that the API key is valid, the selected model is available to your project, and API quota/billing limits are not exceeded.
- Do not add tokens to source files, screenshots, public issues, or commits.

## Important

Cloud Run and Gemini API may incur charges depending on account eligibility, region, usage, and current pricing. Configure a budget alert. This starter bot responds to text messages and does not store conversation history.
