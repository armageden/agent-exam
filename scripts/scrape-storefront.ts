/**
 * Crawl the farhan.pp.ua storefront and upload its content to AI Search
 * (formerly AutoRAG). Uses direct HTTP + JSON-LD extraction instead of
 * Browser Rendering (the API token in .env doesn't have that scope).
 *
 * Pipeline:
 *   1. Fetch the sitemap.xml and discover all product URLs
 *   2. For each product URL, fetch the static HTML
 *   3. Extract JSON-LD Product data, meta tags, and main product text
 *   4. Format as clean markdown with canonical product links
 *   5. Upload as Items to the AI Search instance via the new REST API
 *
 * Usage:
 *   npx tsx scripts/scrape-storefront.ts
 *
 * Required env (loaded automatically from .env at repo root if present):
 *   CLOUDFLARE_API_TOKEN  – API token with AI Search:Edit
 *   CLOUDFLARE_ACCOUNT_ID – defaults to 774089bee1853783dfb4c10042e6cff0
 * Optional:
 *   STOREFRONT_URL        – defaults to https://farhan.pp.ua
 *   AI_SEARCH_INSTANCE    – defaults to curly-queen-fe96
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal .env loader so `npx tsx scripts/scrape-storefront.ts` works
// without exporting env vars inline. Inline env vars still take precedence.
function loadDotenv(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadDotenv(resolve(process.cwd(), '.env'));


interface ProductDoc {
  handle: string;
  url: string;
  title: string;
  description: string;
  price: string | null;
  status: string | null;
  jsonLd: unknown[];
  bodyText: string;
  markdown: string;
}

interface StaticDoc {
  url: string;
  title: string;
  markdown: string;
}

const STOREFRONT_BASE = (
  process.env.STOREFRONT_URL || 'https://farhan.pp.ua'
).replace(/\/+$/, '');
const STOREFRONT_COUNTRY = '/bd';
const AI_SEARCH_INSTANCE = process.env.AI_SEARCH_INSTANCE || 'curly-queen-fe96';
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || '774089bee1853783dfb4c10042e6cff0';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!API_TOKEN) {
  console.error(
    'Missing CLOUDFLARE_API_TOKEN. Add it to .env at the repo root, ' +
      'or export it inline:\n' +
      '  CLOUDFLARE_API_TOKEN=... npx tsx scripts/scrape-storefront.ts'
  );
  process.exit(1);
}

const NS = 'default';
const HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (compatible; InDecor-AI-Search-Ingestor/1.0; +https://farhan.pp.ua)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function decode(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) out.push(item);
      } else {
        out.push(parsed);
      }
    } catch {
      // tolerate broken JSON-LD blocks; skip
    }
  }
  return out;
}

function extractMeta(html: string, attr: 'name' | 'property', key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${escaped}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re);
  return m ? decode(m[1]).trim() : null;
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decode(m[1]).trim() : '';
}

function extractCanonical(html: string): string | null {
  const m = html.match(
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
  );
  return m ? m[1] : null;
}

function pickProductJsonLd(blocks: unknown[]): Record<string, unknown> | null {
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const obj = block as Record<string, unknown>;
    const t = obj['@type'];
    if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) {
      return obj;
    }
  }
  return null;
}

function getString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

function getNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : null;
}

function extractPrice(product: Record<string, unknown>): string | null {
  const offers = product.offers;
  if (offers && typeof offers === 'object') {
    const o = offers as Record<string, unknown>;
    const p =
      getNumber(o, 'price') ??
      getNumber(o, 'lowPrice') ??
      getNumber((o.offers as Record<string, unknown>) || {}, 'price');
    if (p !== null) {
      const currency = getString(o, 'priceCurrency') || 'BDT';
      return `${currency} ${p}`;
    }
  }
  return null;
}

function extractBodyText(html: string): string {
  const m = html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
  if (!m) return '';
  const body = m[1];
  // Strip script/style blocks
  const stripped = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  // Convert tags to text
  const text = stripped
    .replace(/<\/(?:p|div|li|h[1-6]|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return decode(text);
}

function buildProductMarkdown(p: ProductDoc): string {
  const lines: string[] = [];
  lines.push(`# ${p.title}`);
  lines.push('');
  lines.push(`Source: ${p.url}`);
  if (p.status) lines.push(`Status: ${p.status}`);
  if (p.price) lines.push(`Price: ${p.price}`);
  lines.push(`Handle: ${p.handle}`);
  lines.push('');
  if (p.description) {
    lines.push('## Description');
    lines.push(p.description);
    lines.push('');
  }
  if (p.bodyText) {
    const trimmed = p.bodyText.slice(0, 1500);
    lines.push('## Page Content');
    lines.push(trimmed);
    lines.push('');
  }
  lines.push(`View product: ${p.url}`);
  return lines.join('\n');
}

function buildStaticMarkdown(d: StaticDoc): string {
  return [
    `# ${d.title || d.url}`,
    '',
    `Source: ${d.url}`,
    '',
    '## Content',
    d.markdown.slice(0, 4000),
    '',
  ].join('\n');
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: HTTP_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function fetchSitemap(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    try {
      const xml = await fetchHtml(url);
      const re = /<loc>([^<]+)<\/loc>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        out.push(m[1].trim());
      }
    } catch (err) {
      console.warn(`  ! sitemap fetch failed for ${url}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return Array.from(new Set(out));
}

async function discoverProductUrls(): Promise<string[]> {
  console.log('→ Discovering product URLs from sitemap + storefront…');
  const sitemapUrls = await fetchSitemap([
    `${STOREFRONT_BASE}/sitemap.xml`,
    `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/sitemap.xml`,
  ]);
  const fromSitemap = sitemapUrls.filter((u) => /\/bd\/products\//.test(u));
  if (fromSitemap.length > 0) {
    console.log(`  found ${fromSitemap.length} product URLs in sitemap`);
    return fromSitemap;
  }
  console.log('  sitemap has no products — falling back to /bd/store page scrape');
  const storeHtml = await fetchHtml(`${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/store`);
  const re = /href=["'](\/bd\/products\/[a-z0-9][a-z0-9-]*)(?:\?[^"']*)?["']/gi;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(storeHtml)) !== null) {
    found.add(`${STOREFRONT_BASE}${m[1]}`);
  }
  console.log(`  found ${found.size} product URLs on /bd/store`);
  return Array.from(found);
}

async function ingestProduct(url: string): Promise<ProductDoc | null> {
  const handle = url.split('/').pop() || url;
  const html = await fetchHtml(url);
  const jsonLdBlocks = extractJsonLd(html);
  const product = pickProductJsonLd(jsonLdBlocks);
  if (!product) {
    console.warn(`  ! no JSON-LD Product on ${url} — skipping`);
    return null;
  }
  const title =
    getString(product, 'name') ||
    extractTitle(html) ||
    handle;
  const description =
    getString(product, 'description') ||
    extractMeta(html, 'name', 'description') ||
    '';
  const price = extractPrice(product);
  const status =
    getString(product, 'availability') ||
    getString(product, 'productStatus') ||
    null;
  const canonical = extractCanonical(html) || url;
  const bodyText = extractBodyText(html);
  return {
    handle,
    url: canonical,
    title,
    description,
    price,
    status,
    jsonLd: jsonLdBlocks,
    bodyText,
    markdown: '',
  };
}

async function ingestStaticPage(url: string): Promise<StaticDoc | null> {
  try {
    const html = await fetchHtml(url);
    const title = extractTitle(html) || url;
    const bodyText = extractBodyText(html);
    if (!bodyText || bodyText.length < 50) return null;
    return { url, title, markdown: bodyText };
  } catch (err) {
    console.warn(`  ! static page failed: ${url}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function uploadItem(
  key: string,
  content: string,
  metadata: Record<string, string>
): Promise<{ id: string; status: string }> {
  // POST /accounts/{id}/ai-search/namespaces/{ns}/instances/{name}/items
  // The REST API takes multipart/form-data with a `file` field (max 4MB).
  // Reference: https://developers.cloudflare.com/ai-search/api/items/rest-api/
  const path = `/accounts/${ACCOUNT_ID}/ai-search/namespaces/${NS}/instances/${AI_SEARCH_INSTANCE}/items`;
  const url = `https://api.cloudflare.com/client/v4${path}`;

  const form = new FormData();
  const file = new File([content], key, { type: 'text/markdown' });
  form.append('file', file);
  form.append(
    'metadata',
    JSON.stringify({
      ...metadata,
      source: 'farhan.pp.ua',
      ingested_at: new Date().toISOString(),
    })
  );

  // Retry on transient 5xx (524 = Cloudflare API gateway timeout when
  // AI Search backend is busy). Exponential backoff: 1s, 2s, 4s.
  const maxAttempts = 4;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_TOKEN}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { result?: { id?: string; status?: string } };
        return { id: data.result?.id ?? '', status: data.result?.status ?? 'queued' };
      }
      // 4xx is not retriable; 5xx is.
      if (res.status >= 500 && attempt < maxAttempts) {
        const backoff = 1000 * 2 ** (attempt - 1);
        console.warn(`    ↻ ${res.status} on ${key} — retrying in ${backoff}ms (attempt ${attempt}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      const text = await res.text();
      throw new Error(`AI Search upload failed (${res.status}): ${text.slice(0, 200)}`);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts && (lastErr.name === 'TimeoutError' || lastErr.name === 'AbortError')) {
        const backoff = 1000 * 2 ** (attempt - 1);
        console.warn(`    ↻ timeout on ${key} — retrying in ${backoff}ms (attempt ${attempt}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error(`AI Search upload failed after ${maxAttempts} attempts`);
}

async function main() {
  console.log(`Target: ${STOREFRONT_BASE}${STOREFRONT_COUNTRY}`);
  console.log(`AI Search instance: ${AI_SEARCH_INSTANCE}\n`);

  // 1. Products
  const productUrls = await discoverProductUrls();
  const products: ProductDoc[] = [];
  for (const url of productUrls) {
    try {
      console.log(`  → product: ${url}`);
      const doc = await ingestProduct(url);
      if (doc) {
        doc.markdown = buildProductMarkdown(doc);
        products.push(doc);
      }
    } catch (err) {
      console.error(`    ! ${err instanceof Error ? err.message : err}`);
    }
  }

  // 2. Static policy/info pages
  const staticPaths = [
    `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/pages/contact`,
    `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/pages/about`,
    `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/pages/shipping`,
    `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/pages/returns`,
    `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/privacy-policy`,
    `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/return-refund-policy`,
    `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/store`,
  ];
  const statics: StaticDoc[] = [];
  console.log('\n→ Ingesting static info pages…');
  for (const url of staticPaths) {
    const doc = await ingestStaticPage(url);
    if (doc) {
      doc.markdown = buildStaticMarkdown(doc);
      statics.push(doc);
    }
  }

  console.log(`\nPrepared ${products.length} product items, ${statics.length} static items`);

  if (products.length === 0 && statics.length === 0) {
    console.error('No content extracted — aborting.');
    process.exit(1);
  }

  // 3. Upload as Items
  console.log('\n→ Uploading to AI Search…');
  let ok = 0;
  let fail = 0;

  // 3a. Catalog summary first — single Item that lists every product so
  // count/list-all questions always return the full catalog (AI Search
  // top-k retrieval can otherwise miss products in the long tail).
  const summaryMarkdown = buildCatalogSummary(products);
  if (products.length > 0) {
    try {
      const result = await uploadItem('catalog-summary.md', summaryMarkdown, {
        type: 'catalog-summary',
        title: 'Full product catalog',
        url: `${STOREFRONT_BASE}${STOREFRONT_COUNTRY}/store`,
        product_count: String(products.length),
      });
      console.log(`  ✓ catalog-summary → ${result.status} (${products.length} products listed)`);
      ok++;
    } catch (err) {
      console.error(`  ✗ catalog-summary: ${err instanceof Error ? err.message : err}`);
      fail++;
    }
  }

  for (const p of products) {
    try {
      const result = await uploadItem(`product-${p.handle}.md`, p.markdown, {
        type: 'product',
        handle: p.handle,
        title: p.title,
        url: p.url,
        ...(p.price ? { price: p.price } : {}),
      });
      console.log(`  ✓ product/${p.handle} → ${result.status}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ product/${p.handle}: ${err instanceof Error ? err.message : err}`);
      fail++;
    }
  }
  for (const s of statics) {
    try {
      const handle = new URL(s.url).pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'page';
      const result = await uploadItem(`page-${handle}.md`, s.markdown, {
        type: 'page',
        title: s.title,
        url: s.url,
      });
      console.log(`  ✓ page/${handle} → ${result.status}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ page ${s.url}: ${err instanceof Error ? err.message : err}`);
      fail++;
    }
  }

  console.log(`\nUpload summary: ${ok} ok, ${fail} failed`);
}

function buildCatalogSummary(products: ProductDoc[]): string {
  const lines: string[] = [];
  lines.push('# Product Catalog — Complete List');
  lines.push('');
  lines.push(
    `This is the authoritative full product list for the storefront at ${STOREFRONT_BASE}${STOREFRONT_COUNTRY}.`
  );
  lines.push(`Total products: **${products.length}**.`);
  lines.push('');
  lines.push('When a customer asks "how many products do you have?" or "list your products" or "what do you sell?", use THIS list and the count above — do not invent categories or skip products.');
  lines.push('');
  lines.push('## Products');
  lines.push('');
  products.forEach((p, i) => {
    lines.push(`${i + 1}. **${p.title}**`);
    if (p.price) lines.push(`   - Price: ${p.price}`);
    if (p.status) lines.push(`   - Status: ${p.status}`);
    lines.push(`   - Link: ${p.url}`);
    if (p.description) {
      const trimmed = p.description.length > 300 ? `${p.description.slice(0, 300)}…` : p.description;
      lines.push(`   - Description: ${trimmed}`);
    }
    lines.push('');
  });
  lines.push('## Notes for the assistant');
  lines.push('');
  lines.push('- Every product link above uses the canonical storefront URL pattern: `https://farhan.pp.ua/bd/products/{handle}`.');
  lines.push('- Do not mention any other domain (e.g. indecorbd.com).');
  lines.push('- If a customer asks for a product not in this list, say "I don\'t have that in our current catalog" and direct them to the store.');
  lines.push('- For real-time stock, direct the customer to the product page link above.');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
