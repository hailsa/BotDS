# botDS

`botDS` es un bot privado de Discord para reproducir musica, manejar playlists y buscar imagenes desde el chat. Esta es la version **v0.1.2**.

## Funciones

- Reproduce canciones por nombre o enlace con `/play`.
- Importa playlists completas de YouTube y Spotify.
- Ofrece orden normal o modo `mix` aleatorio.
- Convierte las canciones de Spotify en busquedas de audio reproducible; no descarga audio desde Spotify.
- Muestra un panel grafico con caratula, cancion actual, playlist, siguiente tema y cantidad pendiente.
- Incluye botones para pausar/reanudar, saltar, mezclar y desconectar.
- Mantiene comandos `/queue`, `/skip`, `/pause`, `/shuffle`, `/stop` y `/leave`.
- Busca hasta cinco imagenes mediante Brave Image Search con `/imagen`; sin clave usa Bing Images y, como ultimo respaldo, Wikimedia Commons.
- Se ejecuta aislado en Docker y se reinicia automaticamente.

## Tecnologias

- Node.js 22
- discord.js 14
- @discordjs/voice 0.19 con cifrado DAVE
- FFmpeg
- yt-dlp
- Spotify Web API (Authorization Code + refresh token)
- Brave Image Search API
- Docker Compose

## Instalacion

1. Copia `.env.example` como `.env` y completa `DISCORD_TOKEN`.
2. Para Spotify, crea una app Web API en el panel de desarrolladores y registra `http://127.0.0.1:8888/callback`.
3. Completa `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET`.
4. Ejecuta temporalmente `npm run auth:spotify`, autoriza la cuenta y guarda el `SPOTIFY_REFRESH_TOKEN` obtenido.
5. Inicia el bot:

```bash
docker compose up -d --build
```

## Configuracion

| Variable | Uso |
| --- | --- |
| `DISCORD_TOKEN` | Token privado del bot |
| `SPOTIFY_CLIENT_ID` | Identificador de la app de Spotify |
| `SPOTIFY_CLIENT_SECRET` | Secreto de la app de Spotify |
| `SPOTIFY_REFRESH_TOKEN` | Autorizacion renovable de la cuenta |
| `SPOTIFY_REDIRECT_URI` | Debe coincidir exactamente con Spotify |
| `BRAVE_SEARCH_API_KEY` | Clave privada opcional de Brave; sin ella se usa Wikimedia Commons |
| `IMAGE_SAFESEARCH` | `strict`, `moderate` u `off` |
| `MAX_PLAYLIST_TRACKS` | Maximo de canciones importadas (hasta 500) |

## Privacidad y limites

- Nunca publiques `.env`; esta excluido por `.gitignore` y `.dockerignore`.
- El bot respeta los permisos, cuotas y resultados entregados por Spotify, YouTube y Brave.
- Desactivar SafeSearch no garantiza resultados sin restricciones: siguen aplicando las reglas y limitaciones del proveedor.
- Los tokens renovables de Spotify pueden expirar y requerir una nueva autorizacion.

## Licencia

Uso privado. Agrega una licencia explicita antes de distribuir o aceptar contribuciones.
