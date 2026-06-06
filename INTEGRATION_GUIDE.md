# Chatbot Integration Guide for farhan.pp.ua Storefront

## Overview

This guide explains how to integrate the AI customer support chatbot from this repository into your existing storefront at `https://farhan.pp.ua`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    farhan.pp.ua (Next.js)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Storefront Pages                     │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │           Chat Widget (Embedded)                │  │  │
│  │  │  - Floating button                              │  │  │
│  │  │  - Chat interface                               │  │  │
│  │  │  - WebSocket connection                         │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket / HTTP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Workers (Chatbot Backend)           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              ChatAgent (Durable Object)               │  │
│  │  - Session management                                 │  │
│  │  - Message persistence (SQLite)                       │  │
│  │  - Streaming responses                                │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                                │
│                              ▼                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Workers AI + AutoRAG                     │  │
│  │  - RAG retrieval from knowledge base                  │  │
│  │  - AI inference (@cf/zai-org/glm-4.7-flash)           │  │
│  │  - Tool calling (search, recommend, escalate)         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Steps

### Step 1: Configure Environment Variables

Before deploying, configure the following in your Cloudflare dashboard or `wrangler.jsonc`:

```json
{
  "vars": {
    "AUTORAG_NAME": "indecor-support-rag",
    "AI_GATEWAY_SLUG": "default",
    "SITE_URL": "https://farhan.pp.ua"
  }
}
```

### Step 2: Build and Deploy to Cloudflare

```bash
# Install dependencies
npm install

# Build the Astro app
npm run build

# Deploy to Cloudflare Workers
npm run deploy
```

This will deploy the chatbot to a Cloudflare Worker URL (e.g., `https://agent-exam.<your-subdomain>.workers.dev`).

### Step 3: Get Your Deployed URL

After deployment, note your Worker URL. You'll need this for embedding.

---

## Integration Options

### Option A: Simple Script Embed (Recommended - Easiest)

Add this code to your Next.js storefront's layout file (`layout.tsx` or `_app.tsx`):

```jsx
// In your Next.js app/layout.tsx or pages/_app.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        
        {/* Chat Widget */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const CHATBOT_URL = 'https://agent-exam.<your-subdomain>.workers.dev';
                
                // Load chat widget script
                const script = document.createElement('script');
                script.src = CHATBOT_URL + '/chat-widget.js';
                script.onload = function() {
                  window.InDecorChat.init({
                    apiUrl: CHATBOT_URL,
                    theme: {
                      primaryColor: '#6366f1',
                      secondaryColor: '#8b5cf6'
                    }
                  });
                };
                document.body.appendChild(script);
              })();
            `
          }}
        />
      </body>
    </html>
  );
}
```

**Replace `https://agent-exam.<your-subdomain>.workers.dev` with your actual deployed Worker URL.**

### Option B: Iframe Embed (Simplest - No Dependencies)

Add this component anywhere in your Next.js app:

```jsx
// components/ChatWidget.jsx
'use client';

import { useState } from 'react';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const CHATBOT_URL = 'https://agent-exam.<your-subdomain>.workers.dev';

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: 'white',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat Iframe */}
      {isOpen && (
        <iframe
          src={CHATBOT_URL}
          style={{
            position: 'fixed',
            bottom: '96px',
            right: '24px',
            width: '400px',
            height: '600px',
            border: 'none',
            borderRadius: '16px',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)',
            zIndex: 9998
          }}
          title="Customer Support"
        />
      )}
    </>
  );
}
```

Then use it in your layout:

```jsx
// app/layout.tsx
import { ChatWidget } from './components/ChatWidget';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
```

### Option C: Full React Component Integration

For maximum control, copy the React chat component from this repo:

1. Copy `src/components/ChatWidget.tsx` → your project's `components/ChatWidget.tsx`
2. Copy `src/components/ChatWidget.css` → your project's `styles/ChatWidget.css`
3. Install dependencies:
   ```bash
   npm install @cloudflare/ai-chat agents ai
   ```
4. Update the API endpoint in `ChatWidget.tsx` to point to your deployed Worker

---

## Knowledge Base Setup

To make the chatbot aware of your store's products and policies:

### 1. Scrape Your Storefront Content

Use the Cloudflare Browser MCP to index your store:

```bash
# This would be done via MCP tools
# Index these URLs:
- https://farhan.pp.ua/bd
- https://farhan.pp.ua/bd/store
- https://farhan.pp.ua/bd/pages/contact
- https://farhan.pp.ua/bd/pages/about
- https://farhan.pp.ua/bd/pages/shipping
- https://farhan.pp.ua/bd/pages/returns
```

### 2. Upload to AutoRAG

```typescript
// Example: Upload documents to AutoRAG
const documents = [
  {
    title: "Product Catalog",
    content: "...",
    url: "https://farhan.pp.ua/bd/store"
  },
  {
    title: "Shipping Policy",
    content: "...",
    url: "https://farhan.pp.ua/bd/pages/shipping"
  }
];

await env.AI.autorag('indecor-support-rag').upsert({
  documents
});
```

---

## Testing

### Test the Chatbot Locally

```bash
# Start development server
npm run dev

# Open browser to http://localhost:4321
# Click the chat widget and test conversations
```

### Test RAG Retrieval

Visit: `http://localhost:4321/api/debug?q=pegboard%20accessories`

This will show you what the RAG system returns for a given query.

---

## Production Best Practices

### 1. CORS Configuration

Ensure your Worker allows requests from your storefront domain:

```typescript
// In worker.ts
if (url.pathname.startsWith('/agents/')) {
  const response = await routeAgentRequest(request, env);
  response.headers.set('Access-Control-Allow-Origin', 'https://farhan.pp.ua');
  return response;
}
```

### 2. Rate Limiting

Implement rate limiting to prevent abuse:

```typescript
// Use Cloudflare's built-in rate limiting
// Or implement in your agent
```

### 3. Analytics

Track chat usage with Cloudflare Observability:

- Monitor latency
- Track error rates
- Analyze common queries

### 4. Security

- Validate all user inputs
- Sanitize RAG results before displaying
- Implement authentication if needed
- Use HTTPS only

---

## Troubleshooting

### Chat Widget Not Appearing

1. Check browser console for errors
2. Verify the Worker URL is correct
3. Ensure CORS is configured properly

### RAG Not Returning Results

1. Verify AutoRAG name matches: `indecor-support-rag`
2. Check that documents are uploaded to AutoRAG
3. Test via `/api/debug` endpoint

### Connection Errors

1. Ensure WebSocket connections are allowed
2. Check firewall rules
3. Verify Cloudflare Workers plan supports Durable Objects

---

## Support

For issues or questions:
- Check Cloudflare Workers logs in the dashboard
- Review the agent logs via Cloudflare Observability
- Test RAG retrieval via the debug endpoint

---

## Next Steps

1. ✅ Deploy the chatbot to Cloudflare Workers
2. ✅ Set up AutoRAG with your store's content
3. ✅ Embed the chat widget in your storefront
4. ✅ Test end-to-end functionality
5. ✅ Monitor and optimize based on usage
