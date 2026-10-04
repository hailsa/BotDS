function safeSearchValue() {
  return (process.env.IMAGE_SAFESEARCH || 'off').toLowerCase() === 'off' ? 'off' : 'strict';
}

async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
}

function decode(value = '') {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function clean(results, count) {
  const seen = new Set();
  return results.filter(item => {
    if (!/^https?:\/\//i.test(item.image || '') || !/^https?:\/\//i.test(item.source || '')) return false;
    const key = item.image.split('#')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, count);
}

export async function searchImages(query, limit = 20) {
  const count = Math.max(1, Math.min(limit, 50));
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (key) {
    try {
      const url = new URL('https://api.search.brave.com/res/v1/images/search');
      url.search = new URLSearchParams({ q: query, count: String(count), country: 'AR', search_lang: 'es', safesearch: safeSearchValue() });
      const response = await request(url, { headers: { accept: 'application/json', 'x-subscription-token': key } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const results = clean((data.results || []).map(item => ({
        title: item.title || query, image: item.properties?.url || item.thumbnail?.src,
        thumbnail: item.thumbnail?.src, source: item.url || item.properties?.url, provider: 'Brave Images',
      })), count);
      if (results.length) return results;
    } catch (error) { console.warn('Brave Images no disponible:', error.message); }
  }
  const url = new URL('https://www.bing.com/images/search');
  url.search = new URLSearchParams({ q: query, form: 'HDRSC2', first: '1', count: String(count), adlt: safeSearchValue() });
  const response = await request(url, { headers: {
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
    'accept-language': 'es-AR,es;q=0.9,en;q=0.7',
    cookie: `SRCHHPGUSR=ADLT=${safeSearchValue() === 'off' ? 'OFF' : 'STRICT'}`,
  } });
  if (!response.ok) throw new Error(`Bing Images no disponible (HTTP ${response.status})`);
  const html = await response.text();
  const results = [];
  // Parse metadata independently of attribute order; preserve Bing's relevance ranking.
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bclass=["'][^"']*\biusc\b[^"']*["']/i.test(tag)) continue;
    const metadata = tag.match(/\bm="([^"]+)"/i)?.[1];
    if (!metadata) continue;
    try {
      const item = JSON.parse(decode(metadata));
      results.push({ title: item.t || query, image: item.murl || item.turl,
        thumbnail: item.turl, source: item.purl, provider: 'Bing Images' });
    } catch { /* Ignore malformed cards. */ }
  }
  return clean(results, count);
}
