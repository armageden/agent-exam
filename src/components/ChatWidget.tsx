/**
 * Chat Widget React Component for InDecor BD Customer Support.
 *
 * Uses the Cloudflare Agents SDK `useAgentChat` hook for real-time
 * WebSocket-based chat with automatic message persistence and streaming.
 */

import { useState, useRef, useEffect } from 'react';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';

import './ChatWidget.css';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Connect to the ChatAgent Durable Object via WebSocket
  const agent = useAgent({
    agent: 'ChatAgent',
    // Use a stable session name so messages persist across page loads
    name: getSessionId(),
    onError: () => setConnectionError(true),
    onOpen: () => setConnectionError(false),
  });

  const { messages, sendMessage, clearHistory, status } = useAgentChat({
    agent,
    // Resume streams automatically on reconnect
    resume: true,
    onError: () => setConnectionError(true),
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
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

  return (
    <>
      {/* Floating Chat Button */}
      <button
        className="chat-fab"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat Window */}
      <div className={`chat-window ${isOpen ? 'chat-window--open' : ''}`}>
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header__info">
            <div className="chat-header__avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <div className="chat-header__title">InDecor BD Support</div>
              <div className="chat-header__status">
                {isStreaming ? (
                  <><span className="status-dot status-dot--active" /> Typing...</>
                ) : (
                  <><span className="status-dot status-dot--online" /> Online</>
                )}
              </div>
            </div>
          </div>
          <div className="chat-header__actions">
            <button
              className="chat-header__btn"
              onClick={() => clearHistory()}
              title="Clear chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <button
              className="chat-header__btn"
              onClick={() => setIsOpen(false)}
              title="Close chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {connectionError && (
            <div className="chat-error">
              <p><strong>Connection failed.</strong> The agent isn't reachable.</p>
              <p>Make sure you're running: <code>npx astro build && npx wrangler dev</code></p>
            </div>
          )}

          {!connectionError && messages.length === 0 && (
            <div className="chat-welcome">
              <div className="chat-welcome__icon">🏠</div>
              <h3>Welcome to InDecor BD!</h3>
              <p>How can we help you today? Ask about our products, delivery, pricing, or anything else.</p>
              <div className="chat-welcome__suggestions">
                {[
                  'What products do you offer?',
                  'What are your delivery options?',
                  'Tell me about your return policy',
                  'Help me choose a product',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    className="chat-suggestion"
                    onClick={() => sendMessage({ text: suggestion })}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message chat-message--${msg.role}`}
            >
              {msg.role === 'assistant' && (
                <div className="chat-message__avatar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
              )}
              <div className="chat-message__content">
                {msg.parts.map((part, i) => {
                  if (part.type === 'text') {
                    return (
                      <div key={i} className="chat-message__text">
                        <FormattedText text={part.text} />
                      </div>
                    );
                  }
                  if (part.type.startsWith('tool-')) {
                    const toolPart = part as any;
                    return (
                      <div key={i} className="chat-message__tool">
                        <span className="tool-indicator">
                          {toolPart.state === 'result'
                            ? '✓'
                            : '⟳'}{' '}
                          {getToolLabel(toolPart.toolName ?? toolPart.toolCallId ?? 'tool')}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

          {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="chat-message chat-message--assistant">
              <div className="chat-message__avatar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="chat-message__content">
                <div className="chat-message__typing">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            name="message"
            type="text"
            placeholder="Type your message..."
            autoComplete="off"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming}
            aria-label="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>

        {/* Footer */}
        <div className="chat-footer">
          Powered by InDecor BD AI Support
        </div>
      </div>
    </>
  );
}

/**
 * Simple markdown-like text formatter.
 */
function FormattedText({ text }: { text: string }) {
  if (!text) return null;

  // Split by line breaks and render paragraphs
  const paragraphs = text.split('\n\n');

  return (
    <>
      {paragraphs.map((p, i) => {
        // Bold: **text**
        const formatted = p
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code>$1</code>')
          .replace(/\n/g, '<br/>');

        return (
          <p
            key={i}
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        );
      })}
    </>
  );
}

/**
 * Get a human-readable label for tool invocations.
 */
function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchKnowledgeBase: 'Searching knowledge base...',
    escalateToHuman: 'Escalating to support team...',
    getProductRecommendations: 'Finding recommendations...',
  };
  return labels[toolName] || 'Processing...';
}

/**
 * Get or create a stable session ID for the chat.
 */
function getSessionId(): string {
  const KEY = 'indecor-chat-session';
  let sessionId = '';

  try {
    sessionId = localStorage.getItem(KEY) || '';
  } catch {
    // localStorage unavailable
  }

  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    try {
      localStorage.setItem(KEY, sessionId);
    } catch {
      // localStorage unavailable
    }
  }

  return sessionId;
}

export default ChatWidget;
