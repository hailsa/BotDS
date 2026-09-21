function safeSearchValue() {
  return (process.env.IMAGE_SAFESEARCH || 'strict').toLowerCase() === 'off' ? 'off' : 'strict';
}

export async function searchImages(query, limit = 4) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  const count = Math.max(1, Math.min(limit, 5));
  if (!key) {
    const bingResults = await searchBing(query, count);
    return bingResults.length ? bingResults : searchCommons(query, count);
  }
  const url = new URL('https://api.search.brave.com/res/v1/images/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('country', 'AR');
  url.searchParams.set('search_lang', 'es');
  url.searchParams.set('safesearch', safeSearchValue());
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-subscription-token': key,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Brave Images: ${data.message || data.error?.message || response.status}`);
  return (data.results || []).slice(0, count).map(item => ({
    title: item.title || query,
    image: item.properties?.url || item.thumbnail?.src,
    thumbnail: item.thumbnail?.src,
    source: item.url || item.source || item.properties?.url,
    provider: 'Brave Image Search',
  })).filter(item => item.image && item.source);
}

function decodeAttribute(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

async function searchBing(query, count) {
  const url = new URL('https://www.bing.com/images/search');
  url.searchParams.set('q', query);
  url.searchParams.set('form', 'HDRSC2');
  url.searchParams.set('first', '1');
  url.searchParams.set('adlt', (process.env.IMAGE_SAFESEARCH || 'strict').toLowerCase() === 'off' ? 'off' : 'strict');
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
      'accept-language': 'es-AR,es;q=0.9,en;q=0.7',
    },
  });
  if (!response.ok) return [];
  const html = await response.text();
  const results = [];
  for (const match of html.matchAll(/class="iusc"[^>]*\sm="([^"]+)"/g)) {
    try {
      const item = JSON.parse(decodeAttribute(match[1]));
      const original = item.murl;
      const thumbnail = decodeAttribute(item.turl || '');
      const renderable = /\.(?:png|jpe?g|gif|webp)(?:$|[?#])/i.test(original || '');
      const image = renderable ? original : thumbnail;
      if (!image || !/^https?:\/\//i.test(image) || !/^https?:\/\//i.test(item.purl || '')) continue;
      results.push({
        title: item.t || query,
        image,
        thumbnail,
        source: item.purl,
        provider: 'Bing Images',
      });
      if (results.length >= count) break;
    } catch {
      // Bing puede incluir tarjetas sin metadatos de imagen; simplemente se omiten.
    }
  }
  return results;
}

async function searchCommons(query, count) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: String(count),
    prop: 'imageinfo|info',
    iiprop: 'url',
    inprop: 'url',
    format: 'json',
    origin: '*',
  }).toString();
  const response = await fetch(url, {
    headers: { 'user-agent': 'botDS/0.1.1 (Discord music and image bot)' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Wikimedia Commons: ${response.status}`);
  return Object.values(data.query?.pages || {}).map(page => ({
    title: page.title?.replace(/^File:/, '') || query,
    image: page.imageinfo?.[0]?.url,
    thumbnail: page.imageinfo?.[0]?.thumburl,
    source: page.imageinfo?.[0]?.descriptionurl || page.fullurl,
    provider: 'Wikimedia Commons',
  })).filter(item => item.image && item.source).slice(0, count);
}
