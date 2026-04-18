# Global Dial-In AI — Deployment Guide

## What you need before starting
- Credit card for Twilio ($20 minimum to buy a number)
- Credit card for OpenAI ($5-10 to start)
- GitHub account (free)
- Railway account (free tier works)
- Supabase account (free tier works)

---

## Step 1 — Twilio setup (~10 minutes)

### 1.1 Create account
Go to https://www.twilio.com/try-twilio
Sign up with your email. Verify your phone number.

### 1.2 Buy a phone number
1. In the Twilio console, click "Phone Numbers" → "Manage" → "Buy a number"
2. Search by country or area code
3. Make sure "Voice" capability is checked
4. Buy it (~$1.15/month for US numbers)

### 1.3 Get your credentials
From the Twilio Console dashboard, copy:
- Account SID (starts with AC...)
- Auth Token (click to reveal)
- Your phone number (e.g. +18005551234)

You will need these for your .env file.

---

## Step 2 — OpenAI setup (~5 minutes)

### 2.1 Create account
Go to https://platform.openai.com
Sign up and add a payment method.

### 2.2 Create API key
1. Click your profile → "API keys"
2. Click "Create new secret key"
3. Copy it immediately — you can't see it again

### 2.3 Add credits
Go to Billing → Add $10 to start.
At ~$0.13/call you get ~75 test calls.

---

## Step 3 — Database setup with Supabase (~10 minutes)

### 3.1 Create project
Go to https://supabase.com
Click "New project" → name it "dialin" → set a strong password → choose a region close to your users.

### 3.2 Get connection string
1. Go to Project Settings → Database
2. Copy the "Connection string" under "URI"
3. It looks like: postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres
4. Replace [YOUR-PASSWORD] with the password you set

---

## Step 4 — Deploy to Railway (~15 minutes)

### 4.1 Push code to GitHub
```bash
cd global-dialin-ai
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/global-dialin-ai.git
git push -u origin main
```

### 4.2 Create Railway project
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub account and select your repo
4. Railway will detect Node.js automatically

### 4.3 Add a Redis database
1. In your Railway project, click "+ New"
2. Select "Database" → "Add Redis"
3. Click on the Redis service → "Variables" tab
4. Copy the REDIS_URL value

### 4.4 Set environment variables
In Railway, click your app service → "Variables" tab → add each one:

```
TWILIO_ACCOUNT_SID      = ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN       = your_auth_token
TWILIO_PHONE_NUMBER     = +18005551234
OPENAI_API_KEY          = sk-proj-xxxx
DATABASE_URL            = postgresql://postgres:...@db.supabase.co:5432/postgres
REDIS_URL               = redis://...railway.internal...
PORT                    = 3000
PUBLIC_URL              = (leave blank for now — fill in after first deploy)
```

### 4.5 First deploy
Railway deploys automatically on push. Watch the build logs.
When it says "Deployed", click "Settings" → copy your public domain.
It will look like: https://global-dialin-ai-production.up.railway.app

### 4.6 Set PUBLIC_URL
Go back to Variables and set:
```
PUBLIC_URL = https://global-dialin-ai-production.up.railway.app
```
Then redeploy (Railway redeploys automatically when you save variables).

---

## Step 5 — Run database migrations

Once your app is deployed and PUBLIC_URL is set:

```bash
# Install dependencies locally first
npm install

# Copy and fill in your .env
cp .env.example .env
# Edit .env with your real values

# Run migrations against your Supabase database
npm run db:migrate
```

You should see: "✓ All tables created"

---

## Step 6 — Connect Twilio to your backend

### 6.1 Set the Voice webhook
1. Go to Twilio Console → Phone Numbers → Manage → Active numbers
2. Click your number
3. Under "Voice & Fax" → "A call comes in":
   - Change "TwiML Bin" to "Webhook"
   - Set URL to: https://YOUR-RAILWAY-DOMAIN.up.railway.app/twilio/voice
   - Method: HTTP POST
4. Under "Call Status Changes":
   - Set URL to: https://YOUR-RAILWAY-DOMAIN.up.railway.app/twilio/status
5. Click Save

### 6.2 Test the health check
Open in browser: https://YOUR-RAILWAY-DOMAIN.up.railway.app/health
You should see: {"status":"ok","time":"...","version":"1.0.0"}

---

## Step 7 — Make your first call

Call your Twilio number.
You should hear the welcome message.
Speak naturally — the AI will respond.

If you hear silence or an error:
- Check Railway logs (click your service → "Logs" tab)
- Make sure all environment variables are set correctly
- Make sure the database migration ran

---

## Troubleshooting

### "Application error" on call
Check Railway logs. Most common causes:
- Missing environment variable
- Database not migrated
- OpenAI API key invalid or out of credits

### AI doesn't respond / long silence
- Check OpenAI account has credits
- Check Redis is connected (Railway logs show "✓ Redis connected")

### Call connects but hangs up immediately
- Make sure PUBLIC_URL is set correctly (no trailing slash)
- Make sure the WebSocket URL in TwiML is wss:// not ws://

### SMS not sending
- Twilio trial accounts can only SMS verified numbers
- Upgrade to a paid Twilio account for unrestricted SMS

---

## Local development with ngrok

To test locally before deploying:

```bash
# Install ngrok: https://ngrok.com/download
# In terminal 1:
npm run dev

# In terminal 2:
ngrok http 3000

# Copy the https URL from ngrok (e.g. https://abc123.ngrok.io)
# Set PUBLIC_URL=https://abc123.ngrok.io in your .env
# Update Twilio webhook to https://abc123.ngrok.io/twilio/voice
```

---

## Costs at scale

| Volume         | Est. monthly cost |
|----------------|-------------------|
| 100 calls/day  | ~$390/month       |
| 500 calls/day  | ~$1,950/month     |
| 2000 calls/day | ~$7,800/month     |

Per call average: ~$0.13 (4.5 min avg, includes Twilio + OpenAI)

To reduce costs:
- Use gpt-4o-mini instead of gpt-4o (change OPENAI_CHAT_MODEL)
- Use tts-1 (already set — tts-1-hd costs 2x)
- Cache TTS for common phrases (greetings, menus)
