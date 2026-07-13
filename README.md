# VoiceNotes

Record your voice, get clean structured notes. Two screens, zero onboarding.
Tap a giant record button, talk, then turn the recording into an **Outline** or a
**Summary** using one of six templates. Export to PDF, copy, or share.

- **Frontend:** React + Vite + TypeScript, packaged for iOS + Android with Capacitor 6
- **Transcription:** Gemini 2.5 Flash-Lite (native audio input) via a Cloudflare Worker
- **Structuring:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), structured JSON
- **Storage:** IndexedDB (`idb-keyval`) — audio + transcripts + results stay on-device
- **PDF:** `pdfmake` with template-specific color accents
- **Payments:** Stripe Checkout (web URL opened in the WebView)
- **Proxy:** single Cloudflare Worker (`workers/index.ts`) fronts every API key

---

## Architecture

```
src/
  screens/     Home.tsx (record + list)   Detail.tsx (playback + AI + export)   Info.tsx
  components/  RecordButton, Waveform, PlaybackWaveform, TemplateChips, ResultView, Paywall
  hooks/       useRecorder.ts   (MediaRecorder + AnalyserNode + interruption safety)
  lib/         api, audio, auth, storage, pdf, export, plans, types, util
  templates/   templates.ts (six templates, color + icon + prompt focus)
workers/
  index.ts     /transcribe /generate /validate-subscription /checkout /auth/signup
```

The client never holds an API key. It sends audio (base64) and transcripts to the
Worker, which enforces quota, calls Gemini/Claude, caches transcripts, and returns
results plus the updated minute balance.

---

## Local development

### 1. Install

```bash
npm install
cp .env.example .env      # fill in VITE_PROXY_URL for the web app
```

### 2. Run the web app

```bash
npm run dev                # http://localhost:5173
```

Recording uses `getUserMedia` + `MediaRecorder`, so grant the mic permission when
prompted. On `http://localhost` this works without HTTPS.

### 3. Run the Worker locally

```bash
# create the KV namespace once and paste the id into wrangler.toml
npx wrangler kv:namespace create VN_STORE

# set the secrets
npx wrangler secret put GEMINI_KEY
npx wrangler secret put CLAUDE_KEY
npx wrangler secret put STRIPE_KEY
npx wrangler secret put JWT_SECRET
npx wrangler secret put STRIPE_PRICE_ID

npm run worker:dev         # local proxy; point VITE_PROXY_URL at it
```

Deploy the proxy:

```bash
npm run worker:deploy
```

---

## iOS build

```bash
npm run build
npx cap add ios            # first time only
npm run cap:ios            # sync + open Xcode
```

In Xcode:
1. Set your Team + a unique bundle id (`com.app.voicenotes`).
2. Add **Privacy - Microphone Usage Description** (`NSMicrophoneUsageDescription`)
   to `ios/App/App/Info.plist`, e.g. "VoiceNotes needs the mic to record your notes."
3. Run on a device (mic isn't available in the simulator).

## Android build

```bash
npm run build
npx cap add android        # first time only
npm run cap:android        # sync + open Android Studio
```

`RECORD_AUDIO` permission is required — Capacitor's `getUserMedia` prompts at
runtime; ensure `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`
is present in `android/app/src/main/AndroidManifest.xml`.

### Capacitor plugins used
`@capacitor/share`, `@capacitor/filesystem`, `@capacitor/device`,
`@capacitor/keyboard`, `@capacitor/app` (interruption/backgrounding safety).
Run `npx cap sync` after installing plugins.

---

## Monetization

| Plan | Price | Minutes / month |
|------|-------|-----------------|
| Free | $0    | 120             |
| Pro  | $9.99 | 1,500           |

- The record button **always works.** The paywall appears only on
  **Outline / Summarize** when the balance hits 0.
- Quota is tracked **server-side** in KV, keyed by device id (free) or email (pro).
- Purchase flow: Paywall modal → email → Stripe Checkout URL → WebView.
- Plans are versioned in `src/lib/plans.ts`. **Never edit `v1`** — add `v2` for
  future pricing so existing users are grandfathered.

---

## TikTok / marketing ideas

- **"POV: you rambled for 3 minutes and got a perfect meeting agenda."** Screen-record
  the record → Summarize flow, cut to the clean PDF. The satisfying waveform is the hook.
- **Standup template challenge:** founders/devs record their standup on camera, show the
  auto yesterday/today/blockers split. Tag #devtok #buildinpublic.
- **Student note-taking:** record a lecture snippet, show the outline appear. #studytok.
- **ASMR waveform** loop — the pulsing record button + live bars as a calming 8s loop with
  "your thoughts, organized" text overlay.
- **Before/after** split screen: messy voice memo transcript vs. the structured VoiceNotes
  output side by side.
- **Journaling niche:** Voice Journal template → "themes + mood + open loops" reveal,
  lean into the mental-health / self-reflection audience.
- Duet/stitch prompts: "reply with your worst meeting, I'll VoiceNotes it."

## Success metrics

- **Activation:** % of installs that complete a first recording (target > 60%, zero onboarding should help).
- **Aha rate:** % of recordings that get an Outline or Summary (target > 45%).
- **D1 / D7 retention:** target 35% / 18%.
- **Free → Pro conversion:** target 3–5% of monthly actives who hit the 120-min cap.
- **Minutes used / active user / week** (engagement depth) and **export rate**
  (PDF/Copy/Share taps per generated result — proof the output is useful).
- **Cost per note:** Gemini + Claude spend / notes generated, must stay well under ARPU.
- **Crash-free sessions** > 99.5% (recordings must never be lost).

---

## Notes

- Audio never leaves the device until you tap Outline/Summarize (which sends it to the
  proxy for transcription). Transcripts and results are cached locally; revisiting a
  recording makes **no** new API calls.
- Interruptions (incoming call, backgrounding) finalize the recording automatically via
  `@capacitor/app` state + `visibilitychange`, and the blob is written to IndexedDB the
  instant recording stops.
```
