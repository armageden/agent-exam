/**
 * Custom Cloudflare Worker entry point for the Astro application.
 *
 * This file exports:
 * 1. The default fetch handler (Astro SSR + Agent routing + CORS)
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
import { getCorsHeaders, isOriginAllowed, preflightResponse } from './lib/cors';

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);

  return {
    default: {
      async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const requestOrigin = request.headers.get('Origin');

        // Build CORS headers for the current request (if origin is allowed)
        const corsHeaders = requestOrigin
          ? getCorsHeaders(env, requestOrigin)
          : {};

        // Short-circuit CORS preflight (OPTIONS) for any path
        if (request.method === 'OPTIONS') {
          return preflightResponse(env, requestOrigin);
        }

        // Route /agents/* requests to the Agents SDK (WebSocket + HTTP)
        if (url.pathname.startsWith('/agents/')) {
          const response = await routeAgentRequest(request, env);
          if (!response) {
            return withCors(
              new Response('Agent not found', { status: 404 }),
              corsHeaders
            );
          }
          return withCors(response, corsHeaders);
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

            return withCors(
              new Response(
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
              ),
              corsHeaders
            );
          } catch (error) {
            return withCors(
              new Response(
                JSON.stringify({
                  error: String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
              ),
              corsHeaders
            );
          }
        }

        // All other requests handled by Astro.
        // The @astrojs/cloudflare handle() expects a different (stricter)
        // `Request` and `Env` shape than the one at our fetch boundary.
        // Cast both — they're structurally identical at runtime.
        const response = await handle(
          manifest,
          app,
          request as unknown as Parameters<typeof handle>[2],
          env as unknown as Parameters<typeof handle>[3],
          ctx
        );

        // If the request was from an allowed origin, attach CORS headers
        // and loosen frame restrictions so the storefront can iframe /embed.
        if (isOriginAllowed(env, requestOrigin)) {
          return withCors(response, corsHeaders, { allowFrame: true });
        }

        // The /embed page is meant to be framed by the storefront.
        // Set CSP frame-ancestors + remove X-Frame-Options so the browser
        // allows the embedding. We allow the same origin set we use for CORS.
        if (url.pathname === '/embed' || url.pathname.startsWith('/embed/')) {
          return withFrameAncestors(response, env.ALLOWED_ORIGINS || '');
        }

        return response;
      },
    } satisfies ExportedHandler<Env>,
    // Durable Object class must be returned from createExports()
    ChatAgent: ChatAgent,
  };
}

/**
 * Attach CORS headers to a response and optionally allow the response to
 * be framed by any allowed origin (used for the /embed page).
 */
function withCors(
  response: Response,
  headers: Record<string, string>,
  opts: { allowFrame?: boolean } = {}
): Response {
  // Headers are immutable on a Response — clone before mutating
  const newResponse = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) {
    newResponse.headers.set(k, v);
  }
  if (opts.allowFrame) {
    // Remove restrictive framing headers so the storefront can iframe us
    newResponse.headers.delete('X-Frame-Options');
    // Content-Security-Policy: frame-ancestors is set per-route by withFrameAncestors
  }
  return newResponse;
}

/**
 * Set Content-Security-Policy: frame-ancestors <allowed-origins> on a
 * response and remove any X-Frame-Options header (which only supports
 * `DENY` / `SAMEORIGIN` and is superseded by frame-ancestors in modern
 * browsers). Used for the /embed page so the storefront can iframe it.
 */
function withFrameAncestors(response: Response, allowedOrigins: string): Response {
  const origins = allowedOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

  if (!origins) return response;

  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Content-Security-Policy', `frame-ancestors ${origins}`);
  newResponse.headers.delete('X-Frame-Options');
  return newResponse;
}
