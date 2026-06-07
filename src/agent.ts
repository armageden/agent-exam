/**
 * InDecor BD Customer Support Chat Agent
 *
 * Built with Cloudflare Agents SDK (AIChatAgent) + Workers AI + AutoRAG.
 * Messages are automatically persisted to SQLite, streams resume on disconnect.
 */

import { AIChatAgent } from '@cloudflare/ai-chat';
import { createWorkersAI } from 'workers-ai-provider';
import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { queryRAG } from './lib/rag';
import { buildSystemPrompt } from './lib/system-prompt';
import { logger } from './lib/logger';

// Re-export so it can be used in worker.ts
export { ChatAgent };

/**
 * Wraps the Workers AI binding to ensure `tool_choice` is always
 * included in the inputs when tools are present.
 *
 * workers-ai-provider@3.1.2 has a bug where `buildRunInputs()` drops
 * `tool_choice` from the args object. Without it, many models fall back
 * to producing tool-call JSON as plain text instead of using the
 * structured tool_calls response field.
 */
function withToolChoice(binding: Ai): Ai {
  return new Proxy(binding, {
    get(target, prop, receiver) {
      if (prop === 'run') {
        return (model: string, inputs: Record<string, unknown>, options?: unknown) => {
          if (inputs && typeof inputs === 'object' && inputs.tools && !inputs.tool_choice) {
            inputs.tool_choice = 'auto';
          }
          return (target.run as Function).call(target, model, inputs, options);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

class ChatAgent extends AIChatAgent<Env> {
  /**
   * Called when a new chat message is received.
   * Implements the RAG pipeline: retrieve context → generate response.
   */
  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env>['onChatMessage']>[0],
    options?: Parameters<AIChatAgent<Env>['onChatMessage']>[1]
  ) {
    const startTime = Date.now();

    // Get the last user message for RAG query
    const lastUserMessage = [...this.messages]
      .reverse()
      .find((m) => m.role === 'user');

    const userQuery =
      lastUserMessage?.parts
        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ') || '';

    // Log incoming message
    logger.chatMessage({
      sessionId: this.name,
      query: userQuery,
    });

    // Step 1: Retrieve context from AutoRAG
    let ragContext = '';
    try {
      const ragResult = await queryRAG(
        this.env.AI,
        this.env.AUTORAG_NAME || 'indecor-support-rag',
        userQuery
      );
      ragContext = ragResult.context;
    } catch (error) {
      logger.error({
        sessionId: this.name,
        error: `RAG retrieval failed: ${error}`,
      });
    }

    // Step 2: Build system prompt with RAG context
    const systemPrompt = buildSystemPrompt(ragContext);

    // Step 3: Create Workers AI provider with tool_choice fix
    const workersai = createWorkersAI({ binding: withToolChoice(this.env.AI) });

    // Step 4: Stream the AI response with tools
    const result = streamText({
      model: workersai('@cf/zai-org/glm-4.7-flash'),
      system: systemPrompt,
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
      toolChoice: 'auto',
      tools: {
        // Tool: Search the knowledge base for specific information
        searchKnowledgeBase: tool({
          description:
            'Search the InDecor BD knowledge base for product information, policies, pricing, or other store details. Use this tool when the user asks about specific products, prices, policies, delivery, or store information.',
          inputSchema: z.object({
            query: z.string().describe('The search query about InDecor BD products or policies'),
          }),
          execute: async ({ query }) => {
            console.log('[TOOL] searchKnowledgeBase called with query:', query);
            const result = await queryRAG(
              this.env.AI,
              this.env.AUTORAG_NAME || 'indecor-support-rag',
              query
            );
            console.log('[TOOL] searchKnowledgeBase result:', JSON.stringify({
              found: result.sources.length > 0,
              sourceCount: result.sources.length,
              contextLen: result.context.length,
              contextPreview: result.context.substring(0, 200),
            }));
            return {
              found: result.sources.length > 0,
              context: result.context.substring(0, 2000),
              sourceCount: result.sources.length,
              sourceLinks: result.sources
                .filter((s) => s.filename && s.filename.startsWith('https://'))
                .map((s) => s.filename),
            };
          },
        }),

        // Tool: Escalate to human agent
        escalateToHuman: tool({
          description:
            'Escalate the conversation to a human support agent. Only use this tool when the customer explicitly asks to speak with a human agent or when you truly cannot resolve their issue after trying other tools.',
          inputSchema: z.object({
            reason: z.string().describe('A brief explanation of why escalation is needed'),
            priority: z.enum(['low', 'medium', 'high']).describe('Priority level: low, medium, or high'),
          }),
          execute: async ({ reason, priority }) => {
            console.log('[TOOL] escalateToHuman called:', { reason, priority });
            logger.escalation({
              sessionId: this.name,
              query: userQuery,
              metadata: { reason, priority },
            });
            return {
              escalated: true,
              message: `Your request has been escalated to our support team (Priority: ${priority}). A human agent will assist you shortly. You can also reach us directly through the contact information on the storefront at farhan.pp.ua.`,
              contactOptions: {
                website: 'https://farhan.pp.ua',
              },
            };
          },
        }),

        // Tool: Get product recommendations
        getProductRecommendations: tool({
          description:
            'Get product recommendations based on customer preferences. Use this tool when the user wants product suggestions, is looking for a specific type of product, or mentions a budget.',
          inputSchema: z.object({
            query: z
              .string()
              .describe('A natural language description of what the customer is looking for, including any mentioned room type, style, budget, or category. Example: "pegboard for bedroom budget 1000 BDT"'),
          }),
          execute: async ({ query }) => {
            console.log('[TOOL] getProductRecommendations called with query:', query);
            const result = await queryRAG(
              this.env.AI,
              this.env.AUTORAG_NAME || 'indecor-support-rag',
              `product recommendations ${query}`
            );
            console.log('[TOOL] getProductRecommendations result:', JSON.stringify({
              sourceCount: result.sources.length,
              contextLen: result.context.length,
              contextPreview: result.context.substring(0, 200),
            }));

            return {
              recommendations: result.context.substring(0, 2000),
              sourceCount: result.sources.length,
              productLinks: result.sources
                .filter((s) => s.filename && s.filename.startsWith('https://'))
                .map((s) => s.filename),
            };
          },
        }),
      },
      stopWhen: stepCountIs(5), // Allow multi-step tool calls
      onFinish: async (result) => {
        const latencyMs = Date.now() - startTime;
        logger.chatResponse({
          sessionId: this.name,
          query: userQuery,
          responseLength: result.text?.length || 0,
          latencyMs,
          model: '@cf/zai-org/glm-4.7-flash',
        });
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
