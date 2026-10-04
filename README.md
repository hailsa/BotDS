# botDS v0.2.0

Bot de Discord para música, playlists e imágenes, ejecutado con Docker. Cada servidor mantiene su propia cola de música.

## Funciones

- `/play`: búsqueda por nombre, enlaces y playlists de YouTube.
- `/playlist`: playlists accesibles de Spotify y YouTube, en orden normal o aleatorio. Spotify proporciona metadatos; el audio se busca en YouTube.
- Panel de música con pausa, siguiente canción, mezcla y desconexión; `/queue`, `/skip`, `/pause`, `/shuffle`, `/stop` y `/leave`.
- `/imagen`: 20 resultados por defecto, hasta 50 con `cantidad`, sin duplicados y conservando el orden del proveedor.
- Botones Anterior/Siguiente, enlace al original y acceso a Google Imágenes. Los controles son para quien hizo la búsqueda y duran 15 minutos.
- Brave Images con clave configurada; Bing Images como alternativa. No cambia silenciosamente a Wikimedia.

## Instalación

Requisitos: Docker con Docker Compose y una aplicación de Discord con bot. Spotify y Brave son opcionales.

```bash
git clone https://github.com/hailsa/BotDS.git
cd BotDS
cp .env.example .env
chmod 600 .env
```

Completa `DISCORD_TOKEN` en `.env` e inicia:

```bash
docker compose up -d --build
docker compose logs --tail 30 botds
```

Invita el bot desde Discord Developer Portal → OAuth2 → URL Generator, con `bot` y `applications.commands`. Permisos: View Channels, Send Messages, Embed Links, Connect y Speak. Permite también el acceso del rol a los canales privados. No requiere Administrator.

## Autorizar Spotify

1. Crea una aplicación Web API en https://developer.spotify.com/dashboard.
2. Registra exactamente `http://127.0.0.1:8888/callback` como Redirect URI.
3. Completa `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` y `SPOTIFY_REDIRECT_URI` en `.env`.
4. Ejecuta el asistente desde la carpeta del proyecto:

```bash
docker compose run --rm -p 127.0.0.1:8888:8888 \
  -v "$PWD/.env:/app/.env" botds npm run auth:spotify
```

Abre el enlace que imprime, inicia sesión y acepta el acceso. El asistente guarda `SPOTIFY_REFRESH_TOKEN` en `.env` sin imprimirlo.

Si el bot está en otro equipo, conecta primero desde tu computadora con un túnel SSH:

```bash
ssh -L 8888:127.0.0.1:8888 USUARIO@SERVIDOR
```

Ejecuta el asistente en esa sesión y abre el enlace en el navegador de tu computadora. Tras autorizar, carga la configuración:

```bash
docker compose up -d --force-recreate botds
```

Las playlists disponibles dependen de los permisos y límites de Spotify y de la cuenta autorizada.

## Configuración

| Variable | Uso |
| --- | --- |
| `DISCORD_TOKEN` | Token del bot, obligatorio |
| `SPOTIFY_CLIENT_ID` | Identificador de tu aplicación Spotify |
| `SPOTIFY_CLIENT_SECRET` | Secreto de esa aplicación |
| `SPOTIFY_REFRESH_TOKEN` | Autorización guardada por el asistente |
| `SPOTIFY_REDIRECT_URI` | URI registrada en Spotify |
| `BRAVE_SEARCH_API_KEY` | Clave opcional de Brave Images; sin ella usa Bing |
| `IMAGE_SAFESEARCH` | `off` desactiva SafeSearch; `strict` lo activa |
| `MAX_PLAYLIST_TRACKS` | Límite hasta 500; por defecto 200 |

SafeSearch está desactivado en el ejemplo. Los proveedores siguen aplicando sus propios límites. Bing se consulta mediante su página web y puede cambiar de formato o bloquear solicitudes. Google Imágenes se abre en el navegador; no es el proveedor integrado.

## Desarrollo y seguridad

Node.js 22, discord.js 14, @discordjs/voice con DAVE, FFmpeg y yt-dlp con componentes EJS. Docker instala las dependencias npm desde `package-lock.json` con `npm ci`.

```bash
npm ci
npm run check
```

`.env`, datos, respaldos, logs y claves privadas están excluidos de Git y de la imagen Docker. `.env.example` contiene campos vacíos y opciones públicas. No agregues secretos a commits. Si una credencial se publica accidentalmente, revócala y reemplázala; borrarla del archivo no la elimina del historial.

## Licencia

Uso privado. No se concede una licencia adicional de redistribución en esta versión.
