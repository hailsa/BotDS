import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';
if (!clientId || !clientSecret) throw new Error('Faltan SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en .env');
const state = crypto.randomBytes(20).toString('hex');
const authorize = new URL('https://accounts.spotify.com/authorize');
authorize.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
  scope: 'playlist-read-private playlist-read-collaborative', state, show_dialog: 'true' });
console.log('\nAbri esta direccion en tu navegador:\n' + authorize.toString());
console.log('\nEsperando autorizacion en el puerto 8888...');

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, redirectUri);
    if (url.pathname !== '/callback') return response.writeHead(404).end('No encontrado');
    if (url.searchParams.get('state') !== state) return response.writeHead(400).end('Estado invalido. Usa el enlace de esta sesion.');
    const code = url.searchParams.get('code');
    if (!code) return response.writeHead(400).end('No se completo la autorizacion de Spotify.');
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    const data = await tokenResponse.json();
    if (!tokenResponse.ok || !data.refresh_token) {
      console.error('Spotify rechazo la autorizacion:', tokenResponse.status, data.error || 'sin token renovable');
      return response.writeHead(502).end('Spotify rechazo la autorizacion. Revisa la configuracion de la app.');
    }
    const envPath = '.env';
    const existing = fs.readFileSync(envPath, 'utf8');
    const lines = existing.split(/\r?\n/).filter(line => !/^\s*SPOTIFY_REFRESH_TOKEN\s*=/.test(line));
    fs.writeFileSync(envPath, lines.join('\n').trimEnd() + `\nSPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`, { mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<h1>Spotify autorizado</h1><p>La autorizacion se guardo. Ya podes cerrar esta ventana.</p>');
    console.log('Autorizacion guardada en .env sin mostrar el token. Recrea el contenedor para cargarla.');
    setTimeout(() => server.close(), 1000);
  } catch (error) {
    console.error('No se pudo completar la autorizacion:', error.code || error.name);
    response.writeHead(500).end('No se pudo guardar la autorizacion. Comprueba el montaje y los permisos de .env.');
  }
});
server.listen(8888, '0.0.0.0');
