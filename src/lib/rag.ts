/**
 * RAG (Retrieval-Augmented Generation) pipeline using Cloudflare AutoRAG / AI Search.
 *
 * AutoRAG is configured in the Cloudflare dashboard and bound via the AI binding.
 * It automatically indexes website content and provides semantic search.
 */

import { logger } from './logger';

export interface RAGSearchResult {
  context: string;
  sources: Array<{
    filename?: string;
    score?: number;
    content?: string;
  }>;
}

/**
 * Strip noisy markdown/HTML artifacts from RAG content so the LLM
 * gets clean, readable text about products and policies.
 */
function cleanContent(raw: string): string {
  let text = raw;

  // Remove JSON-LD schema blocks (```json ... ```)
  text = text.replace(/```json\s*\{[\s\S]*?```/g, '');

  // Remove markdown image syntax ![alt](url)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  // Remove CDN / cdn-cgi image paths that leak through
  text = text.replace(/\(\/cdn-cgi\/[^)]*\)/g, '');

  // Convert markdown links [text](/bd/...) → text (https://indecorbd.com/bd/...)
  text = text.replace(/\[([^\]]+)\]\((\/bd\/[^)]+)\)/g, '$1 (https://indecorbd.com$2)');

  // Convert other relative markdown links [text](/...) → text (https://indecorbd.com/...)
  text = text.replace(/\[([^\]]+)\]\((\/[^)]+)\)/g, '$1 (https://indecorbd.com$2)');

  // Convert absolute markdown links [text](https://...) → text (url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)');

  // Remove thumbnail label noise
  text = text.replace(/\*\s*\[?Thumbnail\]?/gi, '');

  // Collapse multiple whitespace / newlines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Query AutoRAG for relevant context based on a user message.
 */
export async function queryRAG(
  ai: Ai,
  ragName: string,
  query: string
): Promise<RAGSearchResult> {
  const startTime = Date.now();

  try {
    // Use AutoRAG's search method to find relevant documents
    const results = await ai.autorag(ragName).search({
      query,
      max_num_results: 5,
    });

    const latencyMs = Date.now() - startTime;

    // Build context string from search results
    // AutoRAG returns content as an array of {type: 'text', text: string} blocks
    const contextParts: string[] = [];
    const sources: RAGSearchResult['sources'] = [];

    if (results?.data) {
      for (const result of results.data) {
        if (result.content && Array.isArray(result.content)) {
          // Extract text from content blocks
          const textContent = result.content
            .filter((c: { type: string; text: string }) => c.type === 'text' && c.text)
            .map((c: { type: string; text: string }) => c.text)
            .join('\n');

          if (textContent) {
            const cleaned = cleanContent(textContent);
            if (cleaned) {
              // Prepend source URL so the model can link to it
              const sourceUrl = result.filename || '';
              const labelledBlock = sourceUrl
                ? `[Source: ${sourceUrl}]\n${cleaned}`
                : cleaned;
              contextParts.push(labelledBlock);
              sources.push({
                filename: result.filename,
                score: result.score,
                content: cleaned.substring(0, 200),
              });
            }
          }
        } else if (typeof result.content === 'string' && result.content) {
          // Fallback: handle content as a plain string (just in case)
          const cleaned = cleanContent(result.content);
          if (cleaned) {
            contextParts.push(cleaned);
            sources.push({
              filename: result.filename,
              score: result.score,
              content: cleaned.substring(0, 200),
            });
          }
        }
      }
    }

    logger.ragQuery({
      query,
      ragResultCount: sources.length,
      latencyMs,
      metadata: { ragName },
    });

    return {
      context: contextParts.join('\n\n---\n\n'),
      sources,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      query,
      latencyMs,
      error: `RAG query failed: ${errorMessage}`,
      metadata: { ragName },
    });

    // Return empty context on error — the agent will still respond using general knowledge
    return { context: '', sources: [] };
  }
}

/**
 * Use AutoRAG's aiSearch for a combined search + AI answer.
 * This provides a direct answer with citations.
 */
export async function aiSearch(
  ai: Ai,
  ragName: string,
  query: string
): Promise<{ answer: string; sources: Array<{ filename?: string; score?: number }> }> {
  const startTime = Date.now();

  try {
    const result = await ai.autorag(ragName).aiSearch({
      query,
    });

    const latencyMs = Date.now() - startTime;

    logger.ragQuery({
      query,
      latencyMs,
      metadata: { ragName, method: 'aiSearch' },
    });

    return {
      answer: result?.response || '',
      sources: result?.data?.map((d: { filename?: string; score?: number }) => ({
        filename: d.filename,
        score: d.score,
      })) || [],
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      query,
      latencyMs,
      error: `AI Search failed: ${errorMessage}`,
      metadata: { ragName },
    });

    return { answer: '', sources: [] };
  }
}
