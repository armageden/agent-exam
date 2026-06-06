/**
 * Health Check Endpoint
 *
 * GET /api/health — Returns the health status of the support agent.
 */

import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;

  const checks: Record<string, string> = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    ai: 'unknown',
    autorag: 'unknown',
    durableObjects: 'unknown',
  };

  // Check AI binding
  try {
    if (env.AI) {
      checks.ai = 'available';
    }
  } catch {
    checks.ai = 'unavailable';
  }

  // Check AutoRAG
  try {
    if (env.AI && env.AUTORAG_NAME) {
      checks.autorag = 'configured';
      checks.autoragName = env.AUTORAG_NAME;
    }
  } catch {
    checks.autorag = 'unavailable';
  }

  // Check Durable Objects
  try {
    if (env.CHAT_AGENT) {
      checks.durableObjects = 'available';
    }
  } catch {
    checks.durableObjects = 'unavailable';
  }

  const isHealthy = checks.ai === 'available' && checks.durableObjects === 'available';

  return new Response(JSON.stringify(checks, null, 2), {
    status: isHealthy ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
};
