/**
 * Standalone Chat Widget for farhan.pp.ua
 *
 * A tiny, dependency-free loader that injects a floating chat button into
 * the page. When clicked, it opens an iframe pointing at
 * `${apiUrl}/embed` — that page hosts the real React-based chat widget
 * served from the same Cloudflare Worker.
 *
 * This script is the simplest possible integration:
 *
 *   <script src="https://agent-exam.<sub>.workers.dev/chat-widget.js" async></script>
 *   <script>
 *     window.InDecorChat.init({
 *       apiUrl: 'https://agent-exam.<sub>.workers.dev',
 *       theme: { primaryColor: '#6366f1', secondaryColor: '#8b5cf6' },
 *     });
 *   </script>
 *
 * No build step, no React, no WebSocket code in the parent page — the
 * iframe handles all of that. The Worker already sends the right
 * `Content-Security-Policy: frame-ancestors ...` header on /embed, so
 * the storefront can frame it.
 */
(function () {
  'use strict';

  // Prevent double-init
  if (window.InDecorChat && window.InDecorChat.__loaded) return;

  var defaultConfig = {
    apiUrl: '',
    // Theme is forwarded to the iframe via postMessage so the embedded
    // page can re-skin itself per-storefront if needed.
    theme: {
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      backgroundColor: '#ffffff',
      textColor: '#18181b',
    },
    position: 'bottom-right', // 'bottom-right' | 'bottom-left'
    zIndex: 9999,
    // Welcome message shown in the parent-page button aria-label
    title: 'Chat with InDecor BD Support',
  };

  var config = Object.assign({}, defaultConfig);
  var isOpen = false;
  var fabEl = null;
  var panelEl = null;
  var iframeEl = null;

  /**
   * Public API: initialize the widget.
   * @param {Object} opts
   * @param {string} opts.apiUrl - Base URL of the chatbot Worker (no trailing slash)
   */
  function init(opts) {
    if (opts && typeof opts === 'object') {
      config = Object.assign({}, defaultConfig, opts);
      if (opts.theme) config.theme = Object.assign({}, defaultConfig.theme, opts.theme);
    }
    if (!config.apiUrl) {
      console.error('[InDecorChat] apiUrl is required');
      return;
    }
    injectStyles();
    renderFab();
    window.InDecorChat.__loaded = true;
  }

  /**
   * Public API: open / close / destroy.
   */
  function open() {
    if (isOpen) return;
    if (!panelEl) renderPanel();
    panelEl.style.display = 'block';
    requestAnimationFrame(function () {
      panelEl.classList.add('indecor-chat-panel--open');
    });
    fabEl.setAttribute('aria-expanded', 'true');
    isOpen = true;
    try {
      iframeEl.contentWindow.postMessage(
        { type: 'indecor-chat:open', theme: config.theme },
        new URL(config.apiUrl).origin
      );
    } catch (e) {
      /* cross-origin — the iframe handles its own open state */
    }
  }

  function close() {
    if (!isOpen || !panelEl) return;
    panelEl.classList.remove('indecor-chat-panel--open');
    setTimeout(function () {
      if (panelEl) panelEl.style.display = 'none';
    }, 250);
    fabEl.setAttribute('aria-expanded', 'false');
    isOpen = false;
  }

  function toggle() {
    isOpen ? close() : open();
  }

  function destroy() {
    if (fabEl && fabEl.parentNode) fabEl.parentNode.removeChild(fabEl);
    if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
    fabEl = panelEl = iframeEl = null;
    isOpen = false;
    window.InDecorChat.__loaded = false;
  }

  function renderFab() {
    fabEl = document.createElement('button');
    fabEl.className = 'indecor-chat-fab';
    fabEl.type = 'button';
    fabEl.setAttribute('aria-label', config.title);
    fabEl.setAttribute('aria-expanded', 'false');
    fabEl.style.zIndex = String(config.zIndex);
    if (config.position === 'bottom-left') {
      fabEl.classList.add('indecor-chat-fab--left');
    }
    fabEl.innerHTML =
      '<svg class="indecor-chat-fab__icon-open" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '<svg class="indecor-chat-fab__icon-close" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    fabEl.addEventListener('click', toggle);
    document.body.appendChild(fabEl);
  }

  function renderPanel() {
    panelEl = document.createElement('div');
    panelEl.className = 'indecor-chat-panel';
    panelEl.style.zIndex = String(config.zIndex - 1);
    if (config.position === 'bottom-left') {
      panelEl.classList.add('indecor-chat-panel--left');
    }
    panelEl.setAttribute('role', 'dialog');
    panelEl.setAttribute('aria-label', config.title);

    iframeEl = document.createElement('iframe');
    iframeEl.className = 'indecor-chat-panel__iframe';
    iframeEl.src = config.apiUrl.replace(/\/$/, '') + '/embed';
    iframeEl.title = config.title;
    iframeEl.allow = 'clipboard-write';
    iframeEl.loading = 'lazy';
    panelEl.appendChild(iframeEl);

    document.body.appendChild(panelEl);
  }

  function injectStyles() {
    if (document.getElementById('indecor-chat-styles')) return;
    var style = document.createElement('style');
    style.id = 'indecor-chat-styles';
    style.textContent =
      '.indecor-chat-fab{' +
        'position:fixed;bottom:24px;right:24px;' +
        'width:56px;height:56px;border-radius:50%;border:none;' +
        'background:linear-gradient(135deg,' + config.theme.primaryColor + ',' + config.theme.secondaryColor + ');' +
        'color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 4px 20px rgba(99,102,241,.4);' +
        'transition:transform .2s ease,box-shadow .2s ease;' +
      '}' +
      '.indecor-chat-fab--left{right:auto;left:24px;}' +
      '.indecor-chat-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(99,102,241,.5);}' +
      '.indecor-chat-fab:active{transform:scale(.95);}' +
      '.indecor-chat-fab__icon-close{display:none;}' +
      '.indecor-chat-fab[aria-expanded="true"] .indecor-chat-fab__icon-open{display:none;}' +
      '.indecor-chat-fab[aria-expanded="true"] .indecor-chat-fab__icon-close{display:block;}' +
      '.indecor-chat-panel{' +
        'position:fixed;bottom:96px;right:24px;display:none;' +
        'width:400px;max-width:calc(100vw - 48px);height:600px;max-height:calc(100vh - 140px);' +
        'background:' + config.theme.backgroundColor + ';' +
        'border-radius:16px;overflow:hidden;' +
        'box-shadow:0 8px 40px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04);' +
        'opacity:0;transform:translateY(20px) scale(.95);' +
        'transition:opacity .25s ease,transform .25s ease;' +
      '}' +
      '.indecor-chat-panel--left{right:auto;left:24px;}' +
      '.indecor-chat-panel--open{opacity:1;transform:translateY(0) scale(1);}' +
      '.indecor-chat-panel__iframe{width:100%;height:100%;border:0;display:block;}' +
      '@media (max-width:480px){' +
        '.indecor-chat-panel{bottom:0;right:0;left:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0;}' +
        '.indecor-chat-fab{bottom:16px;right:16px;}' +
        '.indecor-chat-fab--left{left:16px;}' +
      '}';
    document.head.appendChild(style);
  }

  // Listen for close messages from inside the iframe (e.g. user clicks
  // a "minimize" button inside the embedded widget).
  window.addEventListener('message', function (event) {
    var allowedOrigin = (function () {
      try { return new URL(config.apiUrl).origin; } catch (e) { return ''; }
    })();
    if (!allowedOrigin || event.origin !== allowedOrigin) return;
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'indecor-chat:close') close();
  });

  // Public API
  window.InDecorChat = window.InDecorChat || {};
  window.InDecorChat.init = init;
  window.InDecorChat.open = open;
  window.InDecorChat.close = close;
  window.InDecorChat.toggle = toggle;
  window.InDecorChat.destroy = destroy;
})();
