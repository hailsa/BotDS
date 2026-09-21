import 'dotenv/config';
import { spawn } from 'node:child_process';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder,
  GatewayIntentBits, SlashCommandBuilder,
} from 'discord.js';
import {
  AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnectionStatus,
  createAudioPlayer, createAudioResource, entersState, joinVoiceChannel,
} from '@discordjs/voice';
import { playableUrl, resolveSpotifyPlaylist, resolveYouTube, shuffle, spotifyPlaylistId } from './music.js';
import { searchImages } from './images.js';

if (!process.env.DISCORD_TOKEN) throw new Error('Falta DISCORD_TOKEN en .env');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const states = new Map();
const commands = [
  new SlashCommandBuilder().setName('play').setDescription('Reproduce una cancion, enlace o playlist de YouTube')
    .addStringOption(o => o.setName('busqueda').setDescription('Nombre o enlace').setRequired(true))
    .addStringOption(o => o.setName('modo').setDescription('Orden de una playlist').addChoices(
      { name: 'Normal', value: 'normal' }, { name: 'Mix / aleatorio', value: 'mix' })),
  new SlashCommandBuilder().setName('playlist').setDescription('Agrega una playlist de YouTube o Spotify')
    .addStringOption(o => o.setName('enlace').setDescription('Enlace de la playlist').setRequired(true))
    .addStringOption(o => o.setName('modo').setDescription('Orden de reproduccion').setRequired(true).addChoices(
      { name: 'Normal', value: 'normal' }, { name: 'Mix / aleatorio', value: 'mix' })),
  new SlashCommandBuilder().setName('queue').setDescription('Muestra la cola'),
  new SlashCommandBuilder().setName('skip').setDescription('Salta la cancion'),
  new SlashCommandBuilder().setName('pause').setDescription('Pausa o reanuda la musica'),
  new SlashCommandBuilder().setName('shuffle').setDescription('Mezcla lo que queda de la cola'),
  new SlashCommandBuilder().setName('stop').setDescription('Detiene y vacia la cola'),
  new SlashCommandBuilder().setName('leave').setDescription('Desconecta el bot'),
  new SlashCommandBuilder().setName('imagen').setDescription('Busca imagenes con Brave Search')
    .addStringOption(o => o.setName('busqueda').setDescription('Que queres buscar').setRequired(true))
    .addIntegerOption(o => o.setName('cantidad').setDescription('Entre 1 y 5').setMinValue(1).setMaxValue(5)),
].map(command => command.toJSON());

function buttons(paused = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_pause').setEmoji(paused ? '▶️' : '⏸️').setLabel(paused ? 'Reanudar' : 'Pausar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setLabel('Saltar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setLabel('Mezclar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_leave').setEmoji('⏹️').setLabel('Salir').setStyle(ButtonStyle.Danger),
  );
}

function duration(seconds) {
  if (!seconds) return 'desconocida';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function panelEmbed(state) {
  const current = state.current;
  const next = state.queue[0];
  const embed = new EmbedBuilder().setColor(state.paused ? 0xF1C40F : 0x1DB954)
    .setTitle(state.paused ? '⏸️ Reproduccion pausada' : '🎵 Reproduciendo ahora')
    .setDescription(`**${current?.title || 'Preparando...'}**`)
    .addFields(
      { name: 'Origen', value: current?.source || '—', inline: true },
      { name: 'Duracion', value: duration(current?.duration), inline: true },
      { name: 'En cola', value: String(state.queue.length), inline: true },
      { name: 'Playlist', value: current?.playlist || 'No', inline: true },
      { name: 'Siguiente', value: next?.title || 'No hay mas canciones', inline: false },
    ).setFooter({ text: 'botDS v0.1.2' }).setTimestamp();
  if (current?.thumbnail) embed.setThumbnail(current.thumbnail);
  if (current?.spotifyUrl) embed.setURL(current.spotifyUrl);
  return embed;
}

async function updatePanel(state) {
  if (!state.current) return;
  const payload = { embeds: [panelEmbed(state)], components: [buttons(state.paused)] };
  try {
    if (state.panel) await state.panel.edit(payload);
    else state.panel = await state.textChannel.send(payload);
  } catch (error) { console.error('No se pudo actualizar el panel:', error.message); }
}

function sameChannel(interaction, state) {
  return interaction.member?.voice?.channelId === state?.connection?.joinConfig?.channelId;
}

function killStream(state) {
  if (state.stream && !state.stream.killed) state.stream.kill('SIGKILL');
  state.stream = null;
}

async function destroy(guildId) {
  const state = states.get(guildId);
  if (!state) return;
  clearTimeout(state.leaveTimer);
  killStream(state);
  state.player.stop(true);
  state.connection.destroy();
  if (state.panel) await state.panel.edit({ components: [] }).catch(() => {});
  states.delete(guildId);
}

async function playNext(guildId) {
  const state = states.get(guildId);
  if (!state) return;
  clearTimeout(state.leaveTimer);
  killStream(state);
  const track = state.queue.shift();
  if (!track) {
    state.current = null;
    if (state.panel) await state.panel.edit({ components: [], embeds: [new EmbedBuilder().setColor(0x777777).setTitle('✅ Cola terminada').setDescription('Me desconecto en 5 minutos si no agregan musica.')] }).catch(() => {});
    state.panel = null;
    state.leaveTimer = setTimeout(() => destroy(guildId), 5 * 60 * 1000);
    return;
  }
  state.current = track;
  state.paused = false;
  await updatePanel(state);
  try {
    const url = await playableUrl(track);
    const stream = spawn('yt-dlp', ['--format', 'bestaudio/best', '--output', '-', '--no-playlist', '--no-warnings', '--js-runtimes', 'node', url]);
    state.stream = stream;
    let stderr = '';
    stream.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    stream.on('error', error => console.error('yt-dlp:', error));
    stream.on('close', code => { if (code && states.has(guildId)) console.error(`yt-dlp termino con ${code}: ${stderr}`); });
    state.player.play(createAudioResource(stream.stdout, { inputType: StreamType.Arbitrary, metadata: track }));
  } catch (error) {
    console.error(`Fallo ${track.title}:`, error);
    await state.textChannel.send(`⚠️ No pude reproducir **${track.title}**; sigo con la proxima.`).catch(() => {});
    state.current = null;
    await playNext(guildId);
  }
}

async function createState(interaction, channel) {
  const connection = joinVoiceChannel({ channelId: channel.id, guildId: interaction.guildId, adapterCreator: interaction.guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  connection.subscribe(player);
  const state = { connection, player, queue: [], current: null, stream: null, panel: null, textChannel: interaction.channel, paused: false, leaveTimer: null, advancing: false };
  states.set(interaction.guildId, state);
  player.on(AudioPlayerStatus.Idle, async () => {
    if (state.advancing) return;
    state.advancing = true;
    state.current = null;
    try { await playNext(interaction.guildId); } finally { state.advancing = false; }
  });
  player.on('error', async error => {
    console.error('Reproductor:', error);
    if (state.advancing) return;
    state.advancing = true;
    state.current = null;
    try { await playNext(interaction.guildId); } finally { state.advancing = false; }
  });
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try { await Promise.race([entersState(connection, VoiceConnectionStatus.Signalling, 5000), entersState(connection, VoiceConnectionStatus.Connecting, 5000)]); }
    catch { await destroy(interaction.guildId); }
  });
  return state;
}

async function addCollection(interaction, collection, mode) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) throw new Error('Primero entra a un canal de voz');
  let state = states.get(interaction.guildId);
  if (state && state.connection.joinConfig.channelId !== channel.id) throw new Error('Ya estoy en otro canal de voz');
  if (!state) state = await createState(interaction, channel);
  state.textChannel = interaction.channel;
  const tracks = collection.tracks.map(track => ({ ...track, playlist: collection.name }));
  if (mode === 'mix') shuffle(tracks);
  state.queue.push(...tracks);
  const shouldStart = !state.current && state.player.state.status === AudioPlayerStatus.Idle;
  if (shouldStart) await playNext(interaction.guildId);
  return tracks.length;
}

async function requireMusicState(interaction) {
  const state = states.get(interaction.guildId);
  if (!state) throw new Error('No estoy reproduciendo musica');
  if (!sameChannel(interaction, state)) throw new Error('Tenes que estar en mi mismo canal de voz');
  return state;
}

async function handleControl(interaction, action) {
  const state = await requireMusicState(interaction);
  if (action === 'pause') {
    if (state.player.state.status === AudioPlayerStatus.Paused) {
      state.player.unpause();
      state.paused = false;
    } else {
      state.player.pause();
      state.paused = true;
    }
    await updatePanel(state);
    return state.paused ? '⏸️ Musica pausada.' : '▶️ Musica reanudada.';
  }
  if (action === 'skip') { state.player.stop(true); return '⏭️ Cancion saltada.'; }
  if (action === 'shuffle') { shuffle(state.queue); await updatePanel(state); return `🔀 Mezcle ${state.queue.length} canciones.`; }
  if (action === 'stop') { state.queue.length = 0; state.player.stop(true); return '⏹️ Reproduccion detenida y cola vaciada.'; }
  if (action === 'leave') { await destroy(interaction.guildId); return '👋 Me desconecte.'; }
}

client.once('clientReady', async ready => {
  console.log(`Conectado como ${ready.user.tag}`);
  await ready.application.commands.set(commands);
  console.log('Comandos registrados correctamente');
});

client.on('interactionCreate', async interaction => {
  if ((!interaction.isChatInputCommand() && !interaction.isButton()) || !interaction.guildId) return;
  try {
    if (interaction.isButton()) {
      const action = interaction.customId.replace('music_', '');
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply(await handleControl(interaction, action));
      return;
    }
    const name = interaction.commandName;
    if (name === 'imagen') {
      await interaction.deferReply();
      const query = interaction.options.getString('busqueda', true);
      const results = await searchImages(query, interaction.options.getInteger('cantidad') || 1);
      if (!results.length) throw new Error('No encontre imagenes');
      const embeds = results.map((result, index) => new EmbedBuilder().setColor(0xDE5833).setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setTitle(`${results.length > 1 ? `${index + 1}. ` : ''}${result.title}`.slice(0, 256)).setURL(result.source).setDescription(`Encontrado en ${result.provider}`).setImage(result.image).setFooter({ text: result.provider }));
      await interaction.editReply({ content: `🔎 **${query}**`, embeds });
      return;
    }
    if (name === 'play' || name === 'playlist') {
      await interaction.deferReply();
      const input = name === 'play' ? interaction.options.getString('busqueda', true) : interaction.options.getString('enlace', true);
      const mode = interaction.options.getString('modo') || 'normal';
      const collection = spotifyPlaylistId(input) ? await resolveSpotifyPlaylist(input) : await resolveYouTube(input);
      const count = await addCollection(interaction, collection, mode);
      await interaction.editReply(`✅ Agregue **${count}** cancion${count === 1 ? '' : 'es'}${collection.name ? ` de **${collection.name}**` : ''}${mode === 'mix' ? ' en modo mix 🔀' : ''}.`);
      return;
    }
    const state = await requireMusicState(interaction);
    if (name === 'queue') {
      const list = [state.current ? `**Ahora:** ${state.current.title}` : '**Ahora:** nada', ...state.queue.slice(0, 15).map((t, i) => `${i + 1}. ${t.title}`)];
      if (state.queue.length > 15) list.push(`…y ${state.queue.length - 15} mas.`);
      await interaction.reply(list.join('\n'));
      return;
    }
    await interaction.reply(await handleControl(interaction, name));
  } catch (error) {
    console.error(error);
    const message = `⚠️ ${error.message}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
