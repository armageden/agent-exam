/**
 * Observability logger for the customer support agent.
 * Logs structured data for Cloudflare Workers Observability.
 *
 * All logs are automatically captured by Cloudflare Observability
 * when `observability.enabled = true` in wrangler.jsonc.
 */

export interface ChatLogEntry {
  type: 'chat_message' | 'chat_response' | 'rag_query' | 'error' | 'escalation';
  sessionId?: string;
  userId?: string;
  query?: string;
  responseLength?: number;
  ragResultCount?: number;
  latencyMs?: number;
  model?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class Logger {
  private serviceName: string;

  constructor(serviceName = 'indecor-support-agent') {
    this.serviceName = serviceName;
  }

  /**
   * Log a chat interaction
   */
  chatMessage(entry: Omit<ChatLogEntry, 'type'>): void {
    this.log({ ...entry, type: 'chat_message' });
  }

  /**
   * Log a chat response
   */
  chatResponse(entry: Omit<ChatLogEntry, 'type'>): void {
    this.log({ ...entry, type: 'chat_response' });
  }

  /**
   * Log a RAG query
   */
  ragQuery(entry: Omit<ChatLogEntry, 'type'>): void {
    this.log({ ...entry, type: 'rag_query' });
  }

  /**
   * Log an error
   */
  error(entry: Omit<ChatLogEntry, 'type'>): void {
    this.log({ ...entry, type: 'error' });
  }

  /**
   * Log an escalation to human agent
   */
  escalation(entry: Omit<ChatLogEntry, 'type'>): void {
    this.log({ ...entry, type: 'escalation' });
  }

  /**
   * Core structured log method.
   * Uses console.log with JSON — Cloudflare Observability automatically indexes these.
   */
  private log(entry: ChatLogEntry): void {
    const logPayload = {
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Cloudflare Workers Observability captures console output as structured logs
    console.log(JSON.stringify(logPayload));
  }
}

export const logger = new Logger();
