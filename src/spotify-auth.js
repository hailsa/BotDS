import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';
if (!clientId || !clientSecret) throw new Error('Faltan SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en .env');

const state = crypto.randomBytes(20).toString('hex');
const authorize = new URL('https://accounts.spotify.com/authorize');
authorize.search = new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: redirectUri,
  scope: 'playlist-read-private playlist-read-collaborative',
  state,
  show_dialog: 'true',
}).toString();

console.log('\nAbri esta direccion en tu navegador:\n');
console.log(authorize.toString());
console.log('\nEsperando autorizacion en 127.0.0.1:8888...\n');

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, redirectUri);
  if (url.pathname !== '/callback') return;
  if (url.searchParams.get('state') !== state) {
    response.writeHead(400).end('Estado invalido.');
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    response.writeHead(400).end(`Spotify no autorizo: ${url.searchParams.get('error') || 'sin codigo'}`);
    return;
  }
  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  const data = await tokenResponse.json();
  if (!tokenResponse.ok) {
    response.writeHead(500).end('Spotify rechazo el intercambio. Revisa la terminal.');
    console.error(data);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<h1>Spotify autorizado</h1><p>Ya podes cerrar esta ventana.</p>');
  console.log('\nAutorizacion correcta. Agrega esta linea al archivo .env y no la compartas:\n');
  console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}`);
  setTimeout(() => server.close(), 1000);
});

server.listen(8888, '0.0.0.0');
