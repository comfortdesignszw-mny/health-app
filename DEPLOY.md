# Deploying Comfort Health and Fitness App on Cloudflare Pages

This deploys the app as a static site plus one small serverless function
(`functions/api/analyse-food.js`) that holds your Anthropic API key on the
server. Every installed copy of the PWA calls your own domain — no key is
ever shipped to a device.

## 1. Push this folder to a Git repo (GitHub/GitLab)

Cloudflare Pages builds from a repo. Commit everything in this folder,
including the `functions/` directory — Pages auto-detects it.

## 2. Create the Pages project

- Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
  **Connect to Git**
- Build command: *(none — it's static)*
- Build output directory: `/` (project root)

## 3. Add your API key as a secret

Project → **Settings** → **Environment variables** → add:

| Name                | Value                          | Type   |
|---------------------|--------------------------------|--------|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com | **Secret** (encrypted) |

Optional variables:

| Name                 | Purpose                                   | Default          |
|----------------------|--------------------------------------------|------------------|
| `ANTHROPIC_MODEL`    | override the model used for analysis       | `claude-sonnet-5`|
| `DAILY_LIMIT_PER_IP` | max photo analyses per IP per day          | `2`              |
| `APP_SHARED_SECRET`  | lightweight deterrent against endpoint scraping (see note in the function file — it's visible in your own client code, so treat it as a speed bump, not real auth) | off |

## 4. (Recommended) Add rate limiting

The app defaults to **2 free AI photo analyses per IP per day** to keep
shared-key usage low — but that cap only takes effect once you bind a KV
namespace. Without it, the endpoint has no cap and a single popular link or
a bot could run up your Anthropic bill. To enable it:

- **Workers & Pages** → your project → **Settings** → **Functions** →
  **KV namespace bindings** → create/bind a namespace named `RATE_LIMIT_KV`
- Redeploy. The function then enforces `DAILY_LIMIT_PER_IP` automatically.

## 5. Deploy

Push to your connected branch — Cloudflare builds and deploys automatically.
Your app (and the API) will be live at `https://<project>.pages.dev`, or
your custom domain if you attach one.

## Notes

- The service worker (`sw.js`) intentionally never caches `/api/*` requests
  — those always need a live round trip.
- To monitor spend, watch usage in the Anthropic console rather than relying
  solely on the per-IP cap; a shared VPN or campus network can share one IP.
- If you'd rather not run a shared key at all, each user can instead paste
  their own Anthropic key into Profile → AI photo analysis, which calls
  Claude directly from their own device (no server needed, but everyone
  needs their own key).
