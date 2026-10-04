import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { searchImages } from './images.js';

const sessions = new Map();
const lifetime = 15 * 60 * 1000;

function view(session, disabled = false) {
  const item = session.results[session.index];
  const embed = new EmbedBuilder().setColor(0xDE5833).setTitle(item.title.slice(0, 256))
    .setURL(item.source).setImage(item.image)
    .setFooter({ text: `${session.index + 1}/${session.results.length} · ${item.provider} · ${disabled ? 'Búsqueda vencida' : 'Botones disponibles durante 15 minutos'}` });
  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`image:${session.id}:prev`).setLabel('Anterior').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || session.index === 0),
    new ButtonBuilder().setCustomId(`image:${session.id}:next`).setLabel('Siguiente').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(disabled || session.index === session.results.length - 1),
    new ButtonBuilder().setCustomId(`image:${session.id}:close`).setLabel('Cerrar').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setLabel('Abrir original').setURL(item.image).setStyle(ButtonStyle.Link),
    new ButtonBuilder().setLabel('Google Imágenes').setURL(`https://www.google.com/search?tbm=isch&safe=off&q=${encodeURIComponent(session.query)}`).setStyle(ButtonStyle.Link),
  );
  return { content: `🔎 ${session.query.replace(/@/g, '@\u200b')}`, embeds: [embed], components: [controls], allowedMentions: { parse: [] } };
}

export async function startImageSearch(interaction) {
  await interaction.deferReply();
  const query = interaction.options.getString('busqueda', true).trim();
  const results = await searchImages(query, interaction.options.getInteger('cantidad') || 20);
  if (!results.length) throw new Error('No encontré imágenes para esa búsqueda. Probá agregar el nombre exacto o más detalles.');
  const session = { id: randomUUID(), owner: interaction.user.id, query, results, index: 0 };
  const message = await interaction.editReply(view(session));
  sessions.set(session.id, session);
  session.timer = setTimeout(() => {
    sessions.delete(session.id);
    message.edit(view(session, true)).catch(() => {});
  }, lifetime);
  session.timer.unref();
}

export async function handleImageButton(interaction) {
  const [, id, action] = interaction.customId.split(':');
  const session = sessions.get(id);
  if (!session) return interaction.reply({ content: 'Esta búsqueda venció. Usá /imagen para buscar otra vez.', ephemeral: true });
  if (interaction.user.id !== session.owner) return interaction.reply({ content: 'Estos botones son para quien hizo la búsqueda. Podés abrir tu propio buscador con /imagen.', ephemeral: true });
  if (action === 'close') {
    clearTimeout(session.timer);
    sessions.delete(id);
    return interaction.update(view(session, true));
  }
  session.index = Math.max(0, Math.min(session.results.length - 1, session.index + (action === 'next' ? 1 : -1)));
  await interaction.update(view(session));
}
