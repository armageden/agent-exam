/**
 * InDecor BD Chat Widget — Next.js / React drop-in component.
 *
 * Copy this file into your Next.js project (e.g. `components/InDecorChat.tsx`)
 * and import it from your root layout:
 *
 *   import InDecorChat from '@/components/InDecorChat';
 *   ...
 *   <body>
 *     {children}
 *     <InDecorChat apiUrl="https://agent-exam.<your-sub>.workers.dev" />
 *   </body>
 *
 * Requirements (already in this repo's package.json):
 *   npm install @cloudflare/ai-chat agents ai
 *
 * The component renders a floating button and chat panel that connect to
 * the ChatAgent Durable Object via WebSocket. The Worker at `apiUrl`
 * already has CORS configured for the storefront origin.
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';

type Theme = {
  primaryColor?: string;
  secondaryColor?: string;
};

type Props = {
  /** Base URL of the chatbot Cloudflare Worker (no trailing slash). */
  apiUrl: string;
  /** Optional theme override. */
  theme?: Theme;
  /** Where to anchor the floating button. Default: 'bottom-right'. */
  position?: 'bottom-right' | 'bottom-left';
  /** Z-index for the floating button. Default: 9999. */
  zIndex?: number;
  /** Optional title shown in the chat header. */
  title?: string;
};

export default function InDecorChat({
  apiUrl,
  theme,
  position = 'bottom-right',
  zIndex = 9999,
  title = 'InDecor BD Support',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve the WebSocket host from the Worker URL. Agents SDK derives
  // the WS URL from the agent host.
  const host = apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const agent = useAgent({
    agent: 'ChatAgent',
    name: getSessionId(),
    host,
    onError: () => setConnectionError(true),
    onOpen: () => setConnectionError(false),
  });

  const { messages, sendMessage, clearHistory, status } = useAgentChat({
    agent,
    resume: true,
    onError: () => setConnectionError(true),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim()) return;
    sendMessage({ text: input.value.trim() });
    input.value = '';
  };

  const isStreaming = status === 'streaming';

  const primary = theme?.primaryColor ?? '#6366f1';
  const secondary = theme?.secondaryColor ?? '#8b5cf6';

  return (
    <>
      <style>{`
        .indecor-fab-${position.replace('-', '-')} {
          position: fixed;
          ${position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
          bottom: 24px;
          z-index: ${zIndex};
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, ${primary}, ${secondary});
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
        }
        .indecor-panel {
          position: fixed;
          ${position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
          bottom: 96px;
          z-index: ${zIndex - 1};
          width: 400px;
          max-width: calc(100vw - 48px);
          height: 600px;
          max-height: calc(100vh - 140px);
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04);
          display: ${isOpen ? 'flex' : 'none'};
          flex-direction: column;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        @media (max-width: 480px) {
          .indecor-panel {
            bottom: 0; ${position === 'bottom-left' ? 'left: 0;' : 'right: 0;'}
            width: 100vw; max-width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0;
          }
        }
        .indecor-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; color: white;
          background: linear-gradient(135deg, ${primary}, ${secondary});
        }
        .indecor-header-title { font-size: 15px; font-weight: 600; }
        .indecor-header-status { font-size: 12px; opacity: .85; margin-top: 2px; }
        .indecor-close {
          background: rgba(255,255,255,.15); border: none; color: white;
          width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
        }
        .indecor-messages {
          flex: 1; overflow-y: auto; padding: 16px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .indecor-msg { display: flex; max-width: 88%; }
        .indecor-msg--user { align-self: flex-end; }
        .indecor-msg--assistant { align-self: flex-start; }
        .indecor-msg-bubble {
          padding: 10px 14px; border-radius: 16px;
          font-size: 14px; line-height: 1.5; word-break: break-word;
        }
        .indecor-msg--user .indecor-msg-bubble {
          background: linear-gradient(135deg, ${primary}, ${secondary}); color: white;
        }
        .indecor-msg--assistant .indecor-msg-bubble {
          background: #f4f4f5; color: #18181b;
        }
        .indecor-input {
          display: flex; padding: 12px 16px; gap: 8px;
          border-top: 1px solid #e4e4e7; background: #fafafa;
        }
        .indecor-input input {
          flex: 1; border: 1px solid #e4e4e7; border-radius: 24px;
          padding: 10px 18px; font-size: 14px; outline: none; background: white;
        }
        .indecor-input input:focus { border-color: ${secondary}; }
        .indecor-input button {
          width: 40px; height: 40px; border: none; border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${secondary});
          color: white; cursor: pointer;
        }
      `}</style>

      <button
        className={`indecor-fab-${position.replace('-', '-')}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      <div className="indecor-panel" role="dialog" aria-label={title}>
        <div className="indecor-header">
          <div>
            <div className="indecor-header-title">{title}</div>
            <div className="indecor-header-status">
              {isStreaming ? '● Typing…' : '● Online'}
            </div>
          </div>
          <button className="indecor-close" onClick={() => setIsOpen(false)}>✕</button>
        </div>

        <div className="indecor-messages">
          {connectionError && (
            <div style={{ padding: 12, background: '#fef2f2', color: '#991b1b', borderRadius: 10, fontSize: 13 }}>
              <strong>Connection failed.</strong> Make sure the chatbot Worker is deployed and CORS is configured.
            </div>
          )}

          {!connectionError && messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#71717a', fontSize: 14 }}>
              👋 Hi! Ask about products, delivery, or policies.
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`indecor-msg indecor-msg--${msg.role}`}
            >
              <div className="indecor-msg-bubble">
                {msg.parts
                  .filter((p) => p.type === 'text')
                  .map((p, i) => (
                    <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{(p as any).text}</div>
                  ))}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        <form className="indecor-input" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            name="message"
            type="text"
            placeholder="Type your message..."
            autoComplete="off"
            disabled={isStreaming}
          />
          <button type="submit" disabled={isStreaming} aria-label="Send">→</button>
        </form>
      </div>
    </>
  );
}

function getSessionId(): string {
  const KEY = 'indecor-chat-session';
  let sessionId = '';
  try {
    sessionId = localStorage.getItem(KEY) || '';
  } catch {
    /* localStorage unavailable */
  }
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      localStorage.setItem(KEY, sessionId);
    } catch {
      /* localStorage unavailable */
    }
  }
  return sessionId;
}
