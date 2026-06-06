/**
 * Custom Cloudflare Worker entry point for the Astro application.
 *
 * This file exports:
 * 1. The default fetch handler (Astro SSR + Agent routing)
 * 2. The ChatAgent Durable Object class
 *
 * Required by the @astrojs/cloudflare adapter's workerEntryPoint config.
 */

import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { routeAgentRequest } from 'agents';
import { ChatAgent } from './agent';
import { queryRAG } from './lib/rag';

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);

  return {
    default: {
      async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // Route /agents/* requests to the Agents SDK (WebSocket + HTTP)
        if (url.pathname.startsWith('/agents/')) {
          return routeAgentRequest(request, env);
        }

        // Diagnostic endpoint: test RAG and tool calling
        if (url.pathname === '/api/debug') {
          const query = url.searchParams.get('q') || 'pegboard accessories';
          try {
            const ragName = env.AUTORAG_NAME || 'indecor-support-rag';

            // 1) Raw AutoRAG response (no parsing)
            const rawResult = await env.AI.autorag(ragName).search({
              query,
              max_num_results: 3,
            });

            // 2) Parsed via our queryRAG helper
            const parsed = await queryRAG(env.AI, ragName, query);

            return new Response(
              JSON.stringify(
                {
                  query,
                  raw: rawResult,
                  parsed: {
                    contextLength: parsed.context.length,
                    contextPreview: parsed.context.substring(0, 500),
                    sourceCount: parsed.sources.length,
                    sources: parsed.sources,
                  },
                },
                null,
                2
              ),
              {
                headers: { 'Content-Type': 'application/json' },
              }
            );
          } catch (error) {
            return new Response(
              JSON.stringify({
                error: String(error),
                stack: error instanceof Error ? error.stack : undefined,
              }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }

        // All other requests handled by Astro
        return handle(manifest, app, request, env, ctx);
      },
    } satisfies ExportedHandler<Env>,
    // Durable Object class must be returned from createExports()
    ChatAgent: ChatAgent,
  };
}
