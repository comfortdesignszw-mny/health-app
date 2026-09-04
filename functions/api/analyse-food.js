// Cloudflare Pages Function — runs on Cloudflare's servers, not in the browser.
// Deployed at /api/analyse-food. Holds the Anthropic key as a secret so it
// never ships to any installed copy of the app.
//
// Required (set in Cloudflare Pages → Settings → Environment variables):
//   ANTHROPIC_API_KEY   — your Anthropic API key, added as "Secret" (encrypted)
// Optional:
//   ANTHROPIC_MODEL          — defaults to claude-sonnet-5
//   DAILY_LIMIT_PER_IP       — defaults to 2 requests/IP/day
//   APP_SHARED_SECRET        — if set, requests must send it in X-App-Secret.
//                              This only deters casual scraping of the public
//                              endpoint URL — anyone reading the app's own
//                              client code can still find it, so don't rely
//                              on it as real access control.
// Optional binding:
//   RATE_LIMIT_KV       — a KV namespace bound under this name. Without it,
//                         no rate limiting is applied (fine for personal use,
//                         risky for a public deployment).

const AI_PROMPT = `You are a nutrition estimator. Look at this photo of a meal or food item.
Respond with ONLY a JSON object, no markdown fences, no other text, in this exact shape:
{"name":"short food name","portion":"estimated portion size, e.g. '1 medium bowl (~350g)'","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"low"|"medium"|"high","note":"one short sentence caveat about the estimate"}
Give your best single-number estimate for a typical serving as shown, even if you are not fully certain. Use 0 for any macro you truly cannot judge.`;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export async function onRequestPost({ request, env }) {
  if (env.APP_SHARED_SECRET) {
    if (request.headers.get('X-App-Secret') !== env.APP_SHARED_SECRET) {
      return json({ error: 'forbidden' }, 403);
    }
  }

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'server_not_configured', detail: 'ANTHROPIC_API_KEY is not set' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request', detail: 'expected JSON body' }, 400);
  }

  const { image, media_type } = body;
  if (!image) return json({ error: 'bad_request', detail: 'missing "image" (base64)' }, 400);

  // ---- Simple per-IP daily rate limit (only active if RATE_LIMIT_KV is bound) ----
  let remaining = null;
  if (env.RATE_LIMIT_KV) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const dayKey = `rl:${ip}:${new Date().toISOString().slice(0, 10)}`;
    const limit = Number(env.DAILY_LIMIT_PER_IP) || 2;
    const current = Number(await env.RATE_LIMIT_KV.get(dayKey)) || 0;
    if (current >= limit) {
      return json({ error: 'rate_limited', limit, remaining: 0, detail: `Limit of ${limit} photo analyses/day reached for this network. Try again tomorrow or enter calories manually.` }, 429);
    }
    await env.RATE_LIMIT_KV.put(dayKey, String(current + 1), { expirationTtl: 60 * 60 * 26 });
    remaining = limit - (current + 1);
  }

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image } },
            { type: 'text', text: AI_PROMPT }
          ]
        }]
      })
    });
  } catch (err) {
    return json({ error: 'upstream_unreachable', detail: String(err) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: 'upstream_error', status: upstream.status, detail: detail.slice(0, 300) }, upstream.status);
  }

  const data = await upstream.json();
  if (remaining !== null) data.__remaining = remaining;
  return json(data, 200);
}

export async function onRequestGet() {
  return json({ error: 'method_not_allowed', detail: 'POST only' }, 405);
}
