You are a senior Cloudflare Agents SDK engineer and Astro full-stack developer.

Your task is to design and build a production-grade AI customer support agent for:

<https://indecorbd.com/bd>

You MUST use:

Astro framework
Cloudflare Workers
Cloudflare AI (Workers AI)
Cloudflare AutoRAG
Cloudflare Agents SDK
Cloudflare Browser Rendering
Cloudflare Observability
Cloudflare Logpush
Cloudflare AI Gateway
Cloudflare Radar (optional insights)
Cloudflare Containers (for sandbox/testing)
Cloudflare Workers Bindings
Cloudflare GraphQL Analytics
Cloudflare DNS Analytics
Cloudflare Audit Logs
Cloudflare Digital Experience Monitoring

You MUST use MCP servers for:

Astro documentation → <https://mcp.docs.astro.build/mcp>
Cloudflare documentation → <https://docs.mcp.cloudflare.com/mcp>
Cloudflare bindings → <https://bindings.mcp.cloudflare.com/mcp>
Cloudflare AutoRAG → <https://autorag.mcp.cloudflare.com/mcp>
Cloudflare AI Gateway → <https://ai-gateway.mcp.cloudflare.com/mcp>
Cloudflare Observability → <https://observability.mcp.cloudflare.com/mcp>
Cloudflare Browser → <https://browser.mcp.cloudflare.com/mcp>
Cloudflare Containers → <https://containers.mcp.cloudflare.com/mcp>
Cloudflare GraphQL → <https://graphql.mcp.cloudflare.com/mcp>
Cloudflare Agents SDK → <https://agents.cloudflare.com/mcp>

---

GOAL:

Build an intelligent customer support chat agent that can:

• Answer customer questions about products
• Answer delivery questions
• Answer pricing questions
• Answer order status questions
• Answer policy questions
• Help customers choose products
• Escalate to human when needed

The agent must:

Use AutoRAG trained on indecorbd.com content

Use Browser MCP to fetch and index:

<https://indecorbd.com/bd>
<https://indecorbd.com>

Convert pages to markdown

Store in AutoRAG

Use Workers AI model for chat

Use AI Gateway for logging and analytics

---

ARCHITECTURE REQUIREMENTS:

Frontend:

Astro website

Chat widget component

Streaming responses

Beautiful modern UI

Backend:

Cloudflare Worker

Agents SDK agent

RAG pipeline

AutoRAG retrieval

AI inference via Workers AI

Session memory

Data:

AutoRAG knowledge base

Conversation history storage

Observability:

Log all chats

Track latency

Track errors

Track usage

---

DELIVER:

1. Full architecture diagram (text)

2. Astro frontend code

3. Cloudflare Worker agent code

4. AutoRAG setup code

5. Browser MCP scraping code

6. Workers AI integration code

7. AI Gateway integration code

8. Deployment steps

9. Production best practices

10. Security best practices

---

IMPORTANT:

Always refer to:

Astro MCP docs for Astro code

Cloudflare MCP docs for Cloudflare code

Use latest Cloudflare Agents SDK patterns

Use best practices

Use production-ready code

---

FINAL OUTPUT:

Complete working implementation ready for deployment.
