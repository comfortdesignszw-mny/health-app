// Sends one food photo to the Claude API for a calorie estimate.
// This is the only feature in the app that needs a network connection —
// everything else (logging, history, profile, BMI, plan) works fully offline.
// The user supplies their own Anthropic API key in Settings; it is stored
// only in this device's local database and sent directly from the browser
// to api.anthropic.com — it never passes through any server of ours.

const AI_PROMPT = `You are a nutrition estimator. Look at this photo of a meal or food item.
Respond with ONLY a JSON object, no markdown fences, no other text, in this exact shape:
{"name":"short food name","portion":"estimated portion size, e.g. '1 medium bowl (~350g)'","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"low"|"medium"|"high","note":"one short sentence caveat about the estimate"}
Give your best single-number estimate for a typical serving as shown, even if you are not fully certain. Use 0 for any macro you truly cannot judge.`;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function downscaleImage(file, maxDim = 1024, quality = 0.82) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  return blob || file;
}

// Two ways this can reach Claude, chosen automatically:
//  1. Default — POSTs to this same site's /api/analyse-food (a Cloudflare
//     Pages Function). The Anthropic key lives server-side; every install
//     of the app shares that one key and no key is stored on-device.
//  2. Self-host override — if the user pastes their own key into
//     Profile → AI photo analysis, that key is used directly from the
//     browser instead (handy for local testing or forks without a backend).
async function analyseFoodPhoto(file, profile) {
  if (!navigator.onLine) {
    throw new Error('offline');
  }

  const small = await downscaleImage(file);
  const base64 = await fileToBase64(small);
  const usingOwnKey = !!profile.aiApiKey;

  const res = usingOwnKey
    ? await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': profile.aiApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: profile.aiModel || 'claude-sonnet-5',
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text', text: AI_PROMPT }
            ]
          }]
        })
      })
    : await fetch('/api/analyse-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, media_type: 'image/jpeg' })
      });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('rate-limited');
    if (!usingOwnKey && (res.status === 404 || res.status === 500)) throw new Error('server-not-configured');
    throw new Error(`api-error-${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock) throw new Error('no-text-in-response');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('unparseable-response');
  }

  return {
    name: parsed.name || 'Food item',
    portion: parsed.portion || '',
    calories: Number(parsed.calories) || 0,
    protein: Number(parsed.protein_g) || 0,
    carbs: Number(parsed.carbs_g) || 0,
    fat: Number(parsed.fat_g) || 0,
    confidence: parsed.confidence || 'medium',
    note: parsed.note || '',
    remaining: usingOwnKey ? null : (typeof data.__remaining === 'number' ? data.__remaining : null)
  };
}

async function makeThumbnail(file, maxDim = 200) {
  const blob = await downscaleImage(file, maxDim, 0.7);
  return fileToBase64(blob).then(b64 => `data:image/jpeg;base64,${b64}`);
}
