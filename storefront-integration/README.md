# InDecor BD Chat Widget — Storefront Integration

This folder contains everything you need to embed the InDecor BD AI
customer support chat widget into your existing storefront at
**https://farhan.pp.ua**.

The chatbot itself lives in this repository (the Astro + Cloudflare
Worker app). It exposes:

| URL | Purpose |
| --- | --- |
| `/` | The chatbot's own landing page (with embedded chat). |
| `/embed` | A clean chat-only page, designed to be iframe-embedded. |
| `/chat-widget.js` | A standalone loader script (no dependencies). |
| `/agents/...` | The Agents SDK WebSocket + HTTP endpoint. |

The Worker is already configured to:

- Allow CORS from `farhan.pp.ua`, `indecorbd.com`, and `localhost`.
- Send `Content-Security-Policy: frame-ancestors` for `/embed` so the
  storefront can iframe it.
- Route all AI inference through the `default` AI Gateway.

---

## Choose an integration option

### Option A — Script embed (easiest, recommended)

Drop one `<script>` tag into your storefront's root layout. The
loader injects a floating button into every page; when the user
clicks it, an iframe opens pointing at the chatbot's `/embed` page.

Copy the snippet from [`embed-snippet.html`](./embed-snippet.html)
into your Next.js `app/layout.tsx` (or `pages/_app.tsx`):

```tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          src="https://agent-exam.<your-subdomain>.workers.dev/chat-widget.js"
          async
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                window.InDecorChat.init({
                  apiUrl: 'https://agent-exam.<your-subdomain>.workers.dev',
                  theme: { primaryColor: '#6366f1', secondaryColor: '#8b5cf6' },
                });
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
```

**Pros:** zero dependencies, zero build step, instant to add.
**Cons:** the chat runs in a separate iframe (slightly different
styling context; CORS and `frame-ancestors` are required on the
Worker side — already done).

### Option B — Iframe embed (also no dependencies)

Same as Option A but you control the iframe directly:

```tsx
'use client';
import { useState } from 'react';

const CHATBOT_URL = 'https://agent-exam.<your-subdomain>.workers.dev';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: 'white', cursor: 'pointer',
        }}
        aria-label="Open chat"
      >
        {isOpen ? '✕' : '💬'}
      </button>
      {isOpen && (
        <iframe
          src={`${CHATBOT_URL}/embed`}
          style={{
            position: 'fixed', bottom: 96, right: 24, zIndex: 9998,
            width: 400, height: 600, maxWidth: 'calc(100vw - 48px)',
            maxHeight: 'calc(100vh - 140px)', border: 'none',
            borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,.12)',
          }}
          title="Customer Support"
        />
      )}
    </>
  );
}
```

### Option C — Full React component (most control)

If you want a deeply integrated React component that talks to the
ChatAgent Durable Object directly (no iframe), copy
[`InDecorChat.tsx`](./InDecorChat.tsx) into your project (e.g.
`components/InDecorChat.tsx`) and add it to your layout:

```tsx
import InDecorChat from '@/components/InDecorChat';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <InDecorChat apiUrl="https://agent-exam.<your-subdomain>.workers.dev" />
      </body>
    </html>
  );
}
```

Then install the runtime dependencies (already in this repo's
`package.json`):

```bash
npm install @cloudflare/ai-chat agents ai
```

**Pros:** full styling control, no iframe, no cross-origin quirks.
**Cons:** your bundle includes the chat UI; you must keep the
component in sync with the Worker.

---

## Knowledge base setup

The chatbot uses Cloudflare **AutoRAG / AI Search** (`indecor-support-rag`)
to answer product / policy questions. The instance name is configured
in `wrangler.jsonc` (`AUTORAG_NAME`). The instance must exist and
contain storefront content before the bot can answer knowledge-base
questions. The bot will gracefully fall back to general-knowledge
answers if the instance is missing or empty, but the responses won't
be grounded in your store's catalog.

> **Status (current deployment):** the `indecor-support-rag` instance
> does not yet exist. The Worker is configured to use it; you just
> need to create it. The steps below show how.

### Option 1 — Dashboard (recommended, no code)

1. Sign in to the Cloudflare dashboard.
2. Go to **AI → AI Search** (formerly AutoRAG).
3. Click **Create instance**.
4. Name it `indecor-support-rag` (must match `wrangler.jsonc`).
5. Choose a model (e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
6. Add a **data source**:
   - Type: **Website**
   - URL: `https://farhan.pp.ua/bd/*` (or specific pages)
   - Schedule: daily / weekly
7. Wait for the initial crawl to finish (minutes to hours depending on
   site size).

### Option 2 — Cloudflare API (requires AI Search:Edit token)

If you have an API token with **AI Search:Edit** scope:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai-search/instances" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "indecor-support-rag", "type": "default" }'
```

Then use the [Items API](https://developers.cloudflare.com/ai-search/api/items/)
to upload documents, or use the helper script in `scripts/scrape-storefront.ts`:

```bash
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_API_TOKEN=... \
npx tsx scripts/scrape-storefront.ts
```

This script uses **Cloudflare Browser Rendering** to crawl each seed
URL, converts the rendered HTML to markdown, and pushes it to AutoRAG.

### What gets indexed

The seed URLs (in `scripts/scrape-storefront.ts`) cover the storefront
pages the integration guide calls out:

- `https://farhan.pp.ua/bd` — landing
- `https://farhan.pp.ua/bd/store` — product catalog
- `https://farhan.pp.ua/bd/pages/contact`
- `https://farhan.pp.ua/bd/pages/about`
- `https://farhan.pp.ua/bd/pages/shipping`
- `https://farhan.pp.ua/bd/pages/returns`

Add more as the storefront grows.

---

## CORS / framing

The Worker reads `ALLOWED_ORIGINS` from `wrangler.jsonc` (already
set to include `https://farhan.pp.ua`, `https://indecorbd.com`,
and localhost). If you deploy the Worker to a custom domain, the
allowlist stays the same — only the `apiUrl` you pass to the widget
changes.

If you need to add another origin (e.g. a staging storefront), update
`ALLOWED_ORIGINS` in `wrangler.jsonc` and redeploy.

---

## Testing

After deploying the Worker (`npm run deploy` from the repo root)
and embedding the widget:

1. Open the storefront in a browser.
2. Click the floating chat button.
3. Send a test message: `What is your return policy?`
4. The chat should stream a response grounded in the indexed
   storefront content.
5. Verify in Cloudflare dashboard → **Workers → Logs** that the
   request reached the ChatAgent Durable Object.

For local development:

```bash
npm install
npm run dev               # → http://localhost:4321
# in another terminal:
npm run build && npm run preview  # → wrangler dev with the worker entry
```

The widget will talk to `http://localhost:4321/agents/...` by
default.

---

## Production checklist

- [x] Worker deployed: `npm run deploy` → `https://agent-exam.loki4444.workers.dev`
- [x] `ALLOWED_ORIGINS` includes the storefront production domain (`https://farhan.pp.ua`, `https://indecorbd.com`)
- [x] `SITE_URL` is set to the storefront
- [ ] AutoRAG has at least one source pointing at the storefront *(see "Knowledge base setup" below — requires dashboard or a token with AI Search write scope)*
- [ ] Smoke test: send a message, verify streaming + tool calls work
- [ ] Check **Cloudflare Observability** for errors / latency
- [ ] (Optional) add a custom domain to the Worker for nicer URLs

**Deployed URL (current staging):** `https://agent-exam.loki4444.workers.dev`

- `/` — chat landing page
- `/embed` — iframe target (CSP `frame-ancestors` allows the storefront)
- `/chat-widget.js` — standalone loader script
- `/agents/...` — Agents SDK endpoint (WebSocket + HTTP)
