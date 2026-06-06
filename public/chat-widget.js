/**
 * Standalone Chat Widget for farhan.pp.ua
 * 
 * This script creates an embeddable chat widget that connects to the
 * Cloudflare Workers-based AI customer support agent.
 * 
 * Usage:
 * <script src="https://your-worker-url.chat-widget.js"></script>
 * <script>
 *   window.InDecorChat.init({
 *     apiUrl: 'https://your-worker-url.workers.dev'
 *   });
 * </script>
 */

(function() {
  'use strict';

  // Configuration
  const defaultConfig = {
    apiUrl: '',
    theme: {
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      backgroundColor: '#ffffff',
      textColor: '#18181b'
    },
    position: 'bottom-right',
    zIndex: 9999
  };

  let config = { ...defaultConfig };
  let isOpen = false;
  let sessionId = getSessionId();
  let ws = null;
  let messages = [];
  let isStreaming = false;

  /**
   * Get or create a stable session ID
   */
  function getSessionId() {
    const KEY = 'indecor-chat-session';
    let sessionId = '';
    
    try {
      sessionId = localStorage.getItem(KEY) || '';
    } catch (e) {
      // localStorage unavailable
    }
    
    if (!sessionId) {
      sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      try {
        localStorage.setItem(KEY, sessionId);
      } catch (e) {
        // localStorage unavailable
      }
    }
    
    return sessionId;
  }

  /**
   * Initialize WebSocket connection
   */
  function connectWebSocket() {
    if (!config.apiUrl) {
      console.error('[InDecorChat] API URL not configured');
      return;
    }

    const wsUrl = config.apiUrl.replace('http', 'ws') + '/agents/' + sessionId;
    
    try {
      ws = new WebSocket(wsUrl);
      
      ws.onopen = function() {
        console.log('[InDecorChat] Connected');
        renderMessages();
      };
      
      ws.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data);
        } catch (e) {
          console.error('[InDecorChat] Parse error:', e);
        }
      };
      
      ws.onclose = function() {
        console.log('[InDecorChat] Disconnected');
        setTimeout(connectWebSocket, 3000); // Reconnect
      };
      
      ws.onerror = function(error) {
        console.error('[InDecorChat] WebSocket error:', error);
      };
    } catch (e) {
      console.error('[InDecorChat] Connection error:', e);
    }
  }

  /**
   * Handle incoming server messages
   */
  function handleServerMessage(data) {
    // Simple message handling - adapt based on your actual protocol
    if (data.type === 'message') {
      messages.push({
        role: 'assistant',
        text: data.content
      });
      renderMessages();
    } else if (data.type === 'stream-start') {
      isStreaming = true;
      messages.push({
        role: 'assistant',
        text: '',
        streaming: true
      });
      renderMessages();
    } else if (data.type === 'stream-chunk') {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.streaming) {
        lastMsg.text += data.content;
        renderMessages();
      }
    } else if (data.type === 'stream-end') {
      isStreaming = false;
      const lastMsg = messages[messages.length - 1];
      if (lastMsg) {
        lastMsg.streaming = false;
      }
      renderMessages();
    }
  }

  /**
   * Send a message
   */
  function sendMessage(text) {
    if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Add user message to local state
    messages.push({
      role: 'user',
      text: text.trim()
    });
    renderMessages();

    // Send via WebSocket
    ws.send(JSON.stringify({
      type: 'message',
      content: text.trim()
    }));

    // Clear input
    const input = document.getElementById('indecor-chat-input');
    if (input) {
      input.value = '';
    }
  }

  /**
   * Render messages to DOM
   */
  function renderMessages() {
    const container = document.getElementById('indecor-chat-messages');
    if (!container) return;

    container.innerHTML = '';

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="indecor-chat-welcome">
          <div style="font-size: 40px; margin-bottom: 8px;">🏠</div>
          <h3 style="font-size: 18px; font-weight: 700; color: #18181b; margin: 0 0 8px;">Welcome to InDecor BD!</h3>
          <p style="font-size: 14px; color: #71717a; margin: 0 0 20px; line-height: 1.5;">How can we help you today?</p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
            ${['What products do you offer?', 'Delivery options?', 'Return policy', 'Help me choose'].map(suggestion => `
              <button class="indecor-chat-suggestion" onclick="window.InDecorChat.send('${suggestion.replace(/'/g, "\\'")}')">
                ${suggestion}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      messages.forEach(msg => {
        const msgEl = document.createElement('div');
        msgEl.className = `indecor-chat-message indecor-chat-message--${msg.role}`;
        msgEl.innerHTML = `
          ${msg.role === 'assistant' ? `
            <div class="indecor-chat-avatar" style="width: 28px; height: 28px; border-radius: 50%; background: #ede9fe; color: #7c3aed; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
          ` : ''}
          <div class="indecor-chat-content" style="display: flex; flex-direction: column; gap: 4px;">
            <div class="indecor-chat-text" style="padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-break: break-word; ${msg.role === 'user' ? 'background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;' : 'background: #f4f4f5; color: #18181b;'}">
              ${formatText(msg.text)}
            </div>
          </div>
        `;
        container.appendChild(msgEl);
      });

      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
    }
  }

  /**
   * Simple text formatter
   */
  function formatText(text) {
    if (!text) return '';
    
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Code
    text = text.replace(/`(.*?)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 4px; font-size: 13px;">$1</code>');
    // Line breaks
    text = text.replace(/\n/g, '<br/>');
    
    return text;
  }

  /**
   * Toggle chat visibility
   */
  function toggleChat() {
    isOpen = !isOpen;
    const chatWindow = document.getElementById('indecor-chat-window');
    const chatFab = document.getElementById('indecor-chat-fab');
    
    if (!chatWindow || !chatFab) return;
    
    if (isOpen) {
      chatWindow.classList.add('indecor-chat-window--open');
      chatFab.setAttribute('aria-label', 'Close chat');
      setTimeout(() => {
        const input = document.getElementById('indecor-chat-input');
        if (input) input.focus();
      }, 300);
    } else {
      chatWindow.classList.remove('indecor-chat-window--open');
      chatFab.setAttribute('aria-label', 'Open chat');
    }
  }

  /**
   * Create the chat widget DOM
   */
  function createWidget() {
    // Remove existing if any
    const existing = document.getElementById('indecor-chatbot-container');
    if (existing) existing.remove();

    // Create container
    const container = document.createElement('div');
    container.id = 'indecor-chatbot-container';
    container.style.all = 'initial';
    document.body.appendChild(container);

    // Inject styles
    const style = document.createElement('style');
    style.textContent = getStyles();
    container.appendChild(style);

    // Create FAB button
    const fab = document.createElement('button');
    fab.id = 'indecor-chat-fab';
    fab.className = 'indecor-chat-fab';
    fab.setAttribute('aria-label', 'Open chat');
    fab.onclick = toggleChat;
    fab.innerHTML = `
      <svg class="indecor-chat-icon-open" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="indecor-chat-icon-close" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    `;
    container.appendChild(fab);

    // Create chat window
    const chatWindow = document.createElement('div');
    chatWindow.id = 'indecor-chat-window';
    chatWindow.className = 'indecor-chat-window';
    chatWindow.innerHTML = `
      <div class="indecor-chat-header">
        <div class="indecor-chat-header-info">
          <div class="indecor-chat-header-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <div class="indecor-chat-header-title">InDecor BD Support</div>
            <div class="indecor-chat-header-status">
              <span class="indecor-status-dot indecor-status-dot--online"></span> Online
            </div>
          </div>
        </div>
        <div class="indecor-chat-header-actions">
          <button class="indecor-chat-header-btn" onclick="window.InDecorChat.clear()" title="Clear chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <button class="indecor-chat-header-btn" onclick="window.InDecorChat.toggle()" title="Close chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="indecor-chat-messages" id="indecor-chat-messages">
        <!-- Messages will be rendered here -->
      </div>
      
      <form class="indecor-chat-input" id="indecor-chat-form">
        <input
          id="indecor-chat-input"
          type="text"
          placeholder="Type your message..."
          autocomplete="off"
        />
        <button type="submit" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </form>
      
      <div class="indecor-chat-footer">
        Powered by InDecor BD AI Support
      </div>
    `;
    container.appendChild(chatWindow);

    // Form submit handler
    const form = document.getElementById('indecor-chat-form');
    form.onsubmit = function(e) {
      e.preventDefault();
      const input = document.getElementById('indecor-chat-input');
      if (input && input.value.trim()) {
        sendMessage(input.value.trim());
      }
    };

    // Initial render
    renderMessages();
  }

  /**
   * Get CSS styles
   */
  function getStyles() {
    return `
      .indecor-chat-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: ${config.zIndex};
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        background: linear-gradient(135deg, ${config.theme.primaryColor}, ${config.theme.secondaryColor});
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .indecor-chat-fab:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 28px rgba(99, 102, 241, 0.5);
      }
      
      .indecor-chat-icon-close {
        display: none;
      }
      
      .indecor-chat-window {
        position: fixed;
        bottom: 96px;
        right: 24px;
        z-index: ${config.zIndex - 1};
        width: 400px;
        max-width: calc(100vw - 48px);
        height: 600px;
        max-height: calc(100vh - 140px);
        background: ${config.theme.backgroundColor};
        border-radius: 16px;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
        transform: translateY(20px) scale(0.95);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .indecor-chat-window--open {
        opacity: 1;
        pointer-events: all;
        transform: translateY(0) scale(1);
      }
      
      .indecor-chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: linear-gradient(135deg, ${config.theme.primaryColor}, ${config.theme.secondaryColor});
        color: white;
        flex-shrink: 0;
      }
      
      .indecor-chat-header-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .indecor-chat-header-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .indecor-chat-header-title {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.2;
      }
      
      .indecor-chat-header-status {
        font-size: 12px;
        opacity: 0.85;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      
      .indecor-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
        background: #4ade80;
      }
      
      .indecor-chat-header-actions {
        display: flex;
        gap: 4px;
      }
      
      .indecor-chat-header-btn {
        background: rgba(255, 255, 255, 0.15);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      
      .indecor-chat-header-btn:hover {
        background: rgba(255, 255, 255, 0.25);
      }
      
      .indecor-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .indecor-chat-messages::-webkit-scrollbar {
        width: 6px;
      }
      
      .indecor-chat-messages::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .indecor-chat-messages::-webkit-scrollbar-thumb {
        background: #d4d4d8;
        border-radius: 3px;
      }
      
      .indecor-chat-message {
        display: flex;
        gap: 8px;
        max-width: 88%;
        animation: messageIn 0.3s ease-out;
      }
      
      @keyframes messageIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .indecor-chat-message--user {
        align-self: flex-end;
        flex-direction: row-reverse;
      }
      
      .indecor-chat-message--assistant {
        align-self: flex-start;
      }
      
      .indecor-chat-welcome {
        text-align: center;
        padding: 24px 16px;
      }
      
      .indecor-chat-suggestion {
        background: #f4f4f5;
        border: 1px solid #e4e4e7;
        border-radius: 20px;
        padding: 8px 16px;
        font-size: 13px;
        color: #3f3f46;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .indecor-chat-suggestion:hover {
        background: #ede9fe;
        border-color: #c4b5fd;
        color: #6d28d9;
      }
      
      .indecor-chat-input {
        display: flex;
        padding: 12px 16px;
        gap: 8px;
        border-top: 1px solid #e4e4e7;
        flex-shrink: 0;
        background: #fafafa;
      }
      
      .indecor-chat-input input {
        flex: 1;
        border: 1px solid #e4e4e7;
        border-radius: 24px;
        padding: 10px 18px;
        font-size: 14px;
        outline: none;
        background: white;
        color: ${config.theme.textColor};
        transition: border-color 0.2s;
      }
      
      .indecor-chat-input input:focus {
        border-color: ${config.theme.secondaryColor};
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
      }
      
      .indecor-chat-input button {
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 50%;
        background: linear-gradient(135deg, ${config.theme.primaryColor}, ${config.theme.secondaryColor});
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        flex-shrink: 0;
      }
      
      .indecor-chat-input button:hover:not(:disabled) {
        transform: scale(1.05);
        box-shadow: 0 2px 12px rgba(99, 102, 241, 0.4);
      }
      
      .indecor-chat-footer {
        text-align: center;
        padding: 8px;
        font-size: 11px;
        color: #a1a1aa;
        border-top: 1px solid #f4f4f5;
        flex-shrink: 0;
      }
      
      @media (max-width: 480px) {
        .indecor-chat-window {
          bottom: 0;
          right: 0;
          width: 100vw;
          max-width: 100vw;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
        }
        
        .indecor-chat-fab {
          bottom: 16px;
          right: 16px;
        }
      }
    `;
  }

  /**
   * Public API
   */
  window.InDecorChat = {
    init: function(userConfig) {
      config = { ...defaultConfig, ...userConfig, theme: { ...defaultConfig.theme, ...(userConfig?.theme || {}) } };
      
      if (!config.apiUrl) {
        console.error('[InDecorChat] Please provide an apiUrl in the configuration');
        return;
      }
      
      createWidget();
      connectWebSocket();
      
      console.log('[InDecorChat] Initialized with API URL:', config.apiUrl);
    },
    
    toggle: toggleChat,
    send: sendMessage,
    
    clear: function() {
      messages = [];
      renderMessages();
    },
    
    open: function() {
      if (!isOpen) toggleChat();
    },
    
    close: function() {
      if (isOpen) toggleChat();
    }
  };

})();
