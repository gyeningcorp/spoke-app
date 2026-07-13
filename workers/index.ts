// Cloudflare Worker proxy for VoiceNotes.
//
// Routes:
//   POST /transcribe            -> quota check -> Gemini 2.5 Flash-Lite (native audio) -> cache -> decrement -> return transcript + minutes
//   POST /generate              -> Claude (claude-haiku-4-5-20251001) structured JSON outline/summary
//   POST /validate-subscription -> Stripe check -> return tier + quota
//   POST /checkout              -> create a Stripe Checkout session URL
//   POST /auth/signup           -> email+password or Google id -> create user -> return JWT
//
// All provider API keys live only in Worker secrets. The client sends X-Device-Id
// (free tier) and optionally Authorization: Bearer <jwt> (pro).
//
// Storage: a single KV namespace (VN_STORE) holds:
//   quota:<identity>       -> JSON { minutesRemaining, tier, planVersion, periodStart }
//   transcript:<hash>      -> JSON Transcript (cache; identical audio isn't re-billed)
//   user:<email>           -> JSON { email, passwordHash, tier, stripeCustomer, planVersion }
//   stripecustomer:<email> -> Stripe customer id

import { PLANS, CURRENT_PLAN_VERSION } from '../src/lib/plans';

export interface Env {
  VN_STORE: KVNamespace;
  GEMINI_KEY: string;
  CLAUDE_KEY: string;
  STRIPE_KEY: string;
  JWT_SECRET: string;
  STRIPE_PRICE_ID: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ---------- identity + quota ----------

interface QuotaRecord {
  minutesRemaining: number;
  tier: 'free' | 'pro';
  planVersion: string;
  periodStart: number; // epoch ms of the current billing period
}

/** Prefer JWT email identity, fall back to device id. */
async function identityFor(req: Request, env: Env): Promise<{ id: string; email: string | null }> {
  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const payload = await verifyJwt(auth.slice(7), env.JWT_SECRET);
    if (payload?.email) return { id: `email:${payload.email}`, email: payload.email };
  }
  const device = req.headers.get('X-Device-Id') || 'anon';
  return { id: `device:${device}`, email: null };
}

function planVersionFor(v: string) {
  return PLANS[v] ?? PLANS[CURRENT_PLAN_VERSION];
}

function monthStart(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

async function getQuota(id: string, env: Env): Promise<QuotaRecord> {
  const raw = await env.VN_STORE.get(`quota:${id}`);
  const period = monthStart();
  if (raw) {
    const rec = JSON.parse(raw) as QuotaRecord;
    // Reset monthly allotment at the start of a new period.
    if (rec.periodStart !== period) {
      const plan = planVersionFor(rec.planVersion);
      rec.minutesRemaining = rec.tier === 'pro' ? plan.pro_minutes : plan.free_minutes;
      rec.periodStart = period;
      await env.VN_STORE.put(`quota:${id}`, JSON.stringify(rec));
    }
    return rec;
  }
  const plan = planVersionFor(CURRENT_PLAN_VERSION);
  const fresh: QuotaRecord = {
    minutesRemaining: plan.free_minutes,
    tier: 'free',
    planVersion: CURRENT_PLAN_VERSION,
    periodStart: period,
  };
  await env.VN_STORE.put(`quota:${id}`, JSON.stringify(fresh));
  return fresh;
}

async function setQuota(id: string, rec: QuotaRecord, env: Env): Promise<void> {
  await env.VN_STORE.put(`quota:${id}`, JSON.stringify(rec));
}

// ---------- hashing / crypto ----------

async function sha256Hex(input: ArrayBuffer | string): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 ? 4 - (str.length % 4) : 0;
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc(header)}.${enc({ ...payload, iat: Math.floor(Date.now() / 1000) })}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlDecode(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  } catch {
    return null;
  }
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${password}`);
}

// ---------- Gemini transcription ----------

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}
interface Transcript {
  text: string;
  segments: TranscriptSegment[];
}

async function geminiTranscribe(audioBase64: string, mimeType: string, env: Env): Promise<Transcript> {
  const model = 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_KEY}`;

  const prompt =
    'Transcribe this audio verbatim. Return ONLY JSON in the shape ' +
    '{"text": string, "segments": [{"start": number, "end": number, "text": string}]} ' +
    'where start/end are seconds. No markdown, no commentary.';

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: audioBase64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  }
  const data: any = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseTranscript(text);
}

function parseTranscript(raw: string): Transcript {
  const cleaned = stripFences(raw);
  try {
    const obj = JSON.parse(cleaned);
    if (typeof obj.text === 'string') {
      return {
        text: obj.text,
        segments: Array.isArray(obj.segments) ? obj.segments : [],
      };
    }
  } catch {
    /* fall through */
  }
  return { text: cleaned.trim(), segments: [] };
}

// ---------- Claude generation ----------

const TEMPLATE_FOCUS: Record<string, string> = {
  general: 'Organize into topics, key points, and next steps.',
  interview: 'Capture questions asked, the answers given, and follow-up questions to ask.',
  meeting: 'Capture attendees, agenda items, decisions made, and action items with owners.',
  journal: 'Identify recurring themes, the overall mood, and open loops or unresolved thoughts.',
  standup: 'Structure strictly as: yesterday, today, and blockers.',
  idea: 'Extract raw ideas, interesting phrases verbatim, and connections to explore.',
};

function stripFences(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  return t;
}

async function claudeGenerate(
  transcript: string,
  template: string,
  action: 'outline' | 'summary',
  meta: { date: string; duration: string },
  env: Env,
): Promise<any> {
  const focus = TEMPLATE_FOCUS[template] ?? TEMPLATE_FOCUS.general;
  const verb =
    action === 'outline'
      ? 'Create a structured OUTLINE of the transcript.'
      : 'Write a concise SUMMARY of the transcript.';

  const system =
    'You convert raw voice transcripts into structured notes. ' +
    'You MUST return ONLY valid JSON. No markdown fences, no preamble, no trailing text. ' +
    'Schema: {"title": string, "date": string, "duration": string, ' +
    '"sections": [{"heading": string, "bullets": [string]}], ' +
    '"action_items": [{"task": string, "owner": string | null}]}.';

  const user =
    `${verb}\nTemplate: ${template}. ${focus}\n` +
    `Use date "${meta.date}" and duration "${meta.duration}" in the JSON. ` +
    `Derive a short title from the content.\n\nTRANSCRIPT:\n${transcript}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  }
  const data: any = await res.json();
  const text: string = data?.content?.[0]?.text ?? '';

  // Parse defensively: strip fences, fall back to raw text.
  const cleaned = stripFences(text);
  try {
    const obj = JSON.parse(cleaned);
    return {
      title: obj.title ?? 'Voice Note',
      date: obj.date ?? meta.date,
      duration: obj.duration ?? meta.duration,
      sections: Array.isArray(obj.sections) ? obj.sections : [],
      action_items: Array.isArray(obj.action_items) ? obj.action_items : [],
    };
  } catch {
    return {
      title: 'Voice Note',
      date: meta.date,
      duration: meta.duration,
      sections: [],
      action_items: [],
      raw: cleaned,
    };
  }
}

// ---------- Stripe ----------

function stripeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function stripeCall(path: string, body: string, env: Env): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ---------- route handlers ----------

async function handleTranscribe(req: Request, env: Env): Promise<Response> {
  const { id } = await identityFor(req, env);
  const { audioBase64, mimeType, durationSec } = (await req.json()) as {
    audioBase64: string;
    mimeType: string;
    durationSec: number;
  };
  if (!audioBase64) return json({ error: 'Missing audio' }, 400);

  const quota = await getQuota(id, env);
  const minutesNeeded = Math.max(1, Math.ceil((durationSec || 0) / 60));

  // Cache by audio content hash so re-transcribing identical audio is free.
  const hash = await sha256Hex(audioBase64.slice(0, 4096) + ':' + audioBase64.length);
  const cachedRaw = await env.VN_STORE.get(`transcript:${hash}`);
  if (cachedRaw) {
    return json({ transcript: JSON.parse(cachedRaw), minutesRemaining: quota.minutesRemaining });
  }

  // Enforce quota BEFORE spending money.
  if (quota.minutesRemaining <= 0) {
    return json({ error: 'quota_exceeded', minutesRemaining: 0 }, 402);
  }

  const transcript = await geminiTranscribe(audioBase64, mimeType || 'audio/webm', env);

  // Cache + decrement.
  await env.VN_STORE.put(`transcript:${hash}`, JSON.stringify(transcript), {
    expirationTtl: 60 * 60 * 24 * 30,
  });
  quota.minutesRemaining = Math.max(0, quota.minutesRemaining - minutesNeeded);
  await setQuota(id, quota, env);

  return json({ transcript, minutesRemaining: quota.minutesRemaining });
}

async function handleGenerate(req: Request, env: Env): Promise<Response> {
  const { transcript, template, action, meta } = (await req.json()) as {
    transcript: string;
    template: string;
    action: 'outline' | 'summary';
    meta: { date: string; duration: string };
  };
  if (!transcript) return json({ error: 'Missing transcript' }, 400);
  const result = await claudeGenerate(
    transcript,
    template || 'general',
    action || 'summary',
    meta || { date: '', duration: '' },
    env,
  );
  return json(result);
}

async function handleValidate(req: Request, env: Env): Promise<Response> {
  const { id, email } = await identityFor(req, env);
  const quota = await getQuota(id, env);

  // If we know the user's email, reconcile tier with Stripe subscription status.
  if (email) {
    try {
      const customerId = await env.VN_STORE.get(`stripecustomer:${email}`);
      if (customerId) {
        const subs = await stripeCall(
          `subscriptions?customer=${encodeURIComponent(customerId)}&status=active&limit=1`,
          '',
          env,
        ).catch(() => null);
        const active = subs?.data?.length > 0;
        const newTier: 'free' | 'pro' = active ? 'pro' : 'free';
        if (newTier !== quota.tier) {
          quota.tier = newTier;
          const plan = planVersionFor(quota.planVersion);
          // Upgrade grants the pro allotment immediately; downgrade caps at free.
          quota.minutesRemaining = newTier === 'pro' ? plan.pro_minutes : Math.min(quota.minutesRemaining, plan.free_minutes);
          await setQuota(id, quota, env);
        }
      }
    } catch {
      /* best effort */
    }
  }

  return json({ tier: quota.tier, minutesRemaining: quota.minutesRemaining });
}

async function handleCheckout(req: Request, env: Env): Promise<Response> {
  const { email } = (await req.json()) as { email: string };
  if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);

  // Reuse or create a Stripe customer for this email.
  let customerId = await env.VN_STORE.get(`stripecustomer:${email}`);
  if (!customerId) {
    const customer = await stripeCall('customers', stripeForm({ email }), env);
    customerId = customer.id;
    await env.VN_STORE.put(`stripecustomer:${email}`, customerId!);
  }

  const session = await stripeCall(
    'checkout/sessions',
    stripeForm({
      mode: 'subscription',
      customer: customerId!,
      'line_items[0][price]': env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      success_url: 'https://voicenotes.app/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://voicenotes.app/cancel',
      'metadata[email]': email,
    }),
    env,
  );

  return json({ url: session.url });
}

async function handleSignup(req: Request, env: Env): Promise<Response> {
  const { email, password, googleId } = (await req.json()) as {
    email: string;
    password?: string;
    googleId?: string;
  };
  if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);
  if (!password && !googleId) return json({ error: 'Password or Google id required' }, 400);

  const existingRaw = await env.VN_STORE.get(`user:${email}`);
  let user: any;
  if (existingRaw) {
    user = JSON.parse(existingRaw);
    // If a password was provided, verify against the stored hash.
    if (password) {
      const check = await hashPassword(password, user.salt);
      if (check !== user.passwordHash) return json({ error: 'Invalid credentials' }, 401);
    }
  } else {
    const salt = crypto.randomUUID();
    user = {
      email,
      salt,
      passwordHash: password ? await hashPassword(password, salt) : null,
      googleId: googleId ?? null,
      tier: 'free',
      planVersion: CURRENT_PLAN_VERSION,
    };
    await env.VN_STORE.put(`user:${email}`, JSON.stringify(user));
  }

  const jwt = await signJwt({ email, tier: user.tier }, env.JWT_SECRET);
  return json({ jwt, tier: user.tier });
}

// ---------- entry ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'POST /transcribe':
          return await handleTranscribe(req, env);
        case 'POST /generate':
          return await handleGenerate(req, env);
        case 'POST /validate-subscription':
          return await handleValidate(req, env);
        case 'POST /checkout':
          return await handleCheckout(req, env);
        case 'POST /auth/signup':
          return await handleSignup(req, env);
        default:
          return json({ error: 'Not found' }, 404);
      }
    } catch (err: any) {
      return json({ error: err?.message || 'Internal error' }, 500);
    }
  },
};
