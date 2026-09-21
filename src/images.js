function safeSearchValue() {
  return (process.env.IMAGE_SAFESEARCH || 'strict').toLowerCase() === 'off' ? 'off' : 'strict';
}

export async function searchImages(query, limit = 4) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error('Falta BRAVE_SEARCH_API_KEY en el archivo .env');
  const count = Math.max(1, Math.min(limit, 5));
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
