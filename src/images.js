function safeSearchValue() {
  return (process.env.IMAGE_SAFESEARCH || 'strict').toLowerCase() === 'off' ? 'off' : 'strict';
}

export async function searchImages(query, limit = 4) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  const count = Math.max(1, Math.min(limit, 5));
  if (!key) return searchCommons(query, count);
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
  })).filter(item => item.image && item.source);
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
  })).filter(item => item.image && item.source).slice(0, count);
}
