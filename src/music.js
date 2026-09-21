import { spawn } from 'node:child_process';

const MAX_TRACKS = Math.max(1, Math.min(Number(process.env.MAX_PLAYLIST_TRACKS) || 200, 500));

export function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

export function runYtDlp(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error('La consulta de audio supero el tiempo limite'));
    }, timeoutMs);
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 25_000_000) {
        child.kill('SIGKILL');
        finish(reject, new Error('La respuesta de la playlist es demasiado grande'));
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => finish(reject, error));
    child.on('close', code => code === 0
      ? finish(resolve, stdout)
      : finish(reject, new Error(stderr.trim() || `yt-dlp termino con codigo ${code}`)));
  });
}

export async function resolveYouTube(input) {
  const isUrl = /^https?:\/\//i.test(input);
  const output = await runYtDlp([
    '--dump-single-json', '--flat-playlist', '--no-warnings', '--js-runtimes', 'node',
    isUrl ? input : `ytsearch1:${input}`,
  ]);
  const data = JSON.parse(output);
  if (Array.isArray(data.entries) && data.entries.length > 1) {
    return {
      name: data.title || 'Playlist de YouTube',
      source: 'YouTube',
      tracks: data.entries.slice(0, MAX_TRACKS).filter(Boolean).map(item => {
        const candidate = item.webpage_url || item.url;
        const url = /^https?:\/\//i.test(candidate || '')
          ? candidate
          : `https://www.youtube.com/watch?v=${item.id || candidate}`;
        return ({
        title: item.title || 'Cancion de YouTube',
        url,
        duration: Number(item.duration) || 0,
        thumbnail: item.thumbnail || item.thumbnails?.at(-1)?.url,
        source: 'YouTube',
      }); }),
    };
  }
  const item = data.entries?.[0] || data;
  if (!item?.webpage_url && !item?.url && !item?.id) throw new Error('No se encontro audio');
  return {
    name: null,
    source: 'YouTube',
    tracks: [{
      title: item.title || input,
      url: item.webpage_url || item.url || `https://www.youtube.com/watch?v=${item.id}`,
      duration: Number(item.duration) || 0,
      thumbnail: item.thumbnail || item.thumbnails?.at(-1)?.url,
      source: 'YouTube',
    }],
  };
}

let spotifyToken = null;
let spotifyExpiresAt = 0;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyExpiresAt - 60_000) return spotifyToken;
  const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refreshToken } = process.env;
  if (!clientId || !secret || !refreshToken) {
    throw new Error('Spotify no esta autorizado. Completa las variables SPOTIFY_* del archivo .env');
  }
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Spotify: ${data.error_description || data.error || response.status}`);
  spotifyToken = data.access_token;
  spotifyExpiresAt = Date.now() + data.expires_in * 1000;
  return spotifyToken;
}

export function spotifyPlaylistId(input) {
  const match = input.match(/(?:playlist\/|spotify:playlist:)([A-Za-z0-9]+)/);
  return match?.[1] || null;
}

export async function resolveSpotifyPlaylist(input) {
  const playlistId = spotifyPlaylistId(input);
  if (!playlistId) throw new Error('El enlace de Spotify no parece ser una playlist');
  const token = await getSpotifyToken();
  const headers = { authorization: `Bearer ${token}` };
  const infoResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name,external_urls`, { headers });
  const info = await infoResponse.json();
  if (!infoResponse.ok) throw new Error(`Spotify: ${info.error?.message || infoResponse.status}`);

  const tracks = [];
  let next = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50&market=AR`;
  while (next && tracks.length < MAX_TRACKS) {
    const response = await fetch(next, { headers });
    const page = await response.json();
    if (!response.ok) throw new Error(`Spotify: ${page.error?.message || response.status}`);
    for (const row of page.items || []) {
      const track = row.item || row.track;
      if (!track || track.type !== 'track' || track.is_local) continue;
      const artists = (track.artists || []).map(artist => artist.name).join(', ');
      tracks.push({
        title: `${track.name} — ${artists}`,
        query: `${track.name} ${artists} official audio`,
        url: null,
        duration: Math.round((track.duration_ms || 0) / 1000),
        thumbnail: track.album?.images?.[0]?.url,
        source: 'Spotify',
        spotifyUrl: track.external_urls?.spotify,
      });
      if (tracks.length >= MAX_TRACKS) break;
    }
    next = page.next;
  }
  if (!tracks.length) throw new Error('La playlist de Spotify no contiene canciones accesibles');
  return { name: info.name || 'Playlist de Spotify', source: 'Spotify', tracks };
}

export async function playableUrl(track) {
  if (track.url) return track.url;
  const result = await resolveYouTube(track.query || track.title);
  const found = result.tracks[0];
  track.url = found.url;
  track.thumbnail ||= found.thumbnail;
  return track.url;
}
