/**
 * AI Gateway integration helpers.
 *
 * Cloudflare AI Gateway provides:
 * - Request/response logging for all AI calls
 * - Analytics (latency, tokens, cost)
 * - Rate limiting
 * - Caching
 * - Fallback models
 *
 * When using Workers AI via the `AI` binding, AI Gateway can be enabled
 * by configuring it in the Cloudflare dashboard and specifying the gateway
 * in the AI binding config.
 *
 * For the Workers AI Provider (AI SDK), the gateway is configured through
 * the binding itself.
 *
 * Setup steps:
 * 1. Go to Cloudflare Dashboard → AI → AI Gateway
 * 2. Create a gateway named "default"
 * 3. The AI binding automatically routes through the gateway when configured:
 *
 *    In wrangler.jsonc:
 *    "ai": {
 *      "binding": "AI",
 *      "gateway": {
 *        "id": "default",
 *        "skipCache": false,
 *        "cacheTtl": 300
 *      }
 *    }
 *
 * Features enabled via AI Gateway:
 * - All AI requests are logged automatically
 * - Latency and token usage are tracked
 * - Responses can be cached for identical queries
 * - Rate limiting can prevent abuse
 * - Fallback models can be configured for resilience
 */

export interface AIGatewayConfig {
  gatewayId: string;
  skipCache?: boolean;
  cacheTtl?: number;
}

/**
 * Get the AI Gateway configuration.
 */
export function getGatewayConfig(env: Env): AIGatewayConfig {
  return {
    gatewayId: env.AI_GATEWAY_SLUG || 'default',
    skipCache: false,
    cacheTtl: 300, // Cache AI responses for 5 minutes
  };
}

/**
 * Build AI Gateway headers for direct API calls (if using REST API instead of binding).
 * Not needed when using the AI binding + gateway config, included for reference.
 */
export function getGatewayHeaders(accountId: string, gatewayId: string): Record<string, string> {
  return {
    'cf-aig-authorization': `Bearer ${accountId}`,
    'cf-aig-metadata': JSON.stringify({
      'application': 'indecor-support',
    }),
  };
}

/**
 * AI Gateway REST endpoint (for reference).
 * When using the AI binding with gateway config, this is handled automatically.
 */
export function getGatewayEndpoint(accountId: string, gatewayId: string): string {
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}`;
}
