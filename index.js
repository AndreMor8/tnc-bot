import 'dotenv/config.js';
import path from 'node:path';
import cron from 'croner';
import MeowDB from 'meowdb';
import Discord from 'discord.js';
import md5 from 'md5';

process.on('unhandledRejection', (err) => {
    console.error(err);
});
const bitrates = { 0: 96_000, 1: 128_000, 2: 256_000, 3: 384_000 };
const usedinvites = [];
const client = new Discord.Client({
    intents: 0,
    allowedMentions: { parse: [] },
    presence: { status: "invisible" },
    rest: {
        rejectOnRateLimit(data) {
            if (data.method === "PATCH" && data.route.includes("channels")) return true;
            return false;
        }
    }
});
const scDb = new MeowDB({
    dir: process.env.DATABASE || path.join(process.cwd(), "meowdb"),
    name: "sanciones"
});

cron('0 0 * * *', () => {
    usedinvites.splice(0, usedinvites.length);
});

client.on("ready", () => {
    console.log("Listo para trabajar!");
});

client.on("interactionCreate", async (interaction) => {
    try {
        const guild = await interaction.guild.fetch();
        if (!(process.env.guildsId.split(",").includes(interaction.guildId))) { await interaction.reply("Este bot no es para este servidor"); return await guild.leave() };
        if (interaction.isCommand()) {
            switch (interaction.commandName) {
                case "server-name": {
                    await guild.setName(interaction.options.getString('nombre'));
                    await interaction.reply(`El nombre del servidor ahora es: ${Discord.escapeMarkdown(interaction.options.getString('nombre'))}`);
                    break;
                }
                case "new-channel": {
                    const options = {
                        name: interaction.options.getString("name"),
                        type: parseInt(interaction.options.getString("type")),
                        permissionOverwrites: [{
                            id: interaction.user.id,
                            allow: ["ManageChannels", "ManageRoles"],
                            type: 1
                        }],
                        reason: `Comando new-channel hecho por ${interaction.user.tag}`
                    }
                    if (options.type === 2) {
                        options.bitrate = bitrates[guild.premiumTier];
                        options.userLimit = 99;
                    }
                    const ch = await guild.channels.create(options);
                    await interaction.reply(`Canal creado -> ${ch}`);
                    break;
                }
                case "server-icon": {
                    try {
                        const link = interaction.options.getString("url");
                        if (link) {
                            const final = new URL(interaction.options.getString('url'));
                            if (!(["http:", "https:"].includes(final.protocol))) return interaction.reply({ content: "Debes introducir una URL correcta!", ephemeral: true });
                            await guild.setIcon(final.href)
                                .then(async () => await interaction.reply('He cambiado el ícono del servidor!'))
                                .catch(async (err) => await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true }));
                        } else {
                            await guild.setIcon(null)
                                .then(async () => await interaction.reply('He quitado el ícono del servidor!'))
                                .catch(async (err) => await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true }));
                        }
                    } catch (err) {
                        await interaction.reply({ content: "Debes introducir una URL correcta!", ephemeral: true });
                    }
                    break;
                }
                case "channel-name": {
                    const canal = interaction.options.getChannel('canal', false) || await guild.channels.fetch(interaction.channelId);
                    if (!process.env.whatChannels.split(",").includes(canal.id)) return await interaction.reply({ content: `No puedes cambiar cosas a este canal`, ephemeral: true });
                    await canal.setName(interaction.options.getString('nombre')).then(async () => await interaction.reply(`${canal.toString()}`)).catch(async (err) => {
                        if (err instanceof Discord.RateLimitError) return await interaction.reply({ content: "Puedes cambiar información del canal 2 veces cada 10 minutos. Espera un poco...", ephemeral: true });
                        return await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true });
                    });
                    break;
                }
                case "channel-description": {
                    const canal = interaction.options.getChannel('canal', false) || await guild.channels.fetch(interaction.channelId);
                    if (!process.env.whatChannels.split(",").includes(canal.id)) return await interaction.reply({ content: `No puedes cambiar cosas a este canal`, ephemeral: true });
                    if (canal.isVoiceBased()) return interaction.reply({ content: "Un canal de voz no tiene descripción...", ephemeral: true });
                    await canal.setTopic(interaction.options.getString('text') || null).then(async () => await interaction.reply(interaction.options.getString('text') ? `La descripción del canal ahora es: ${Discord.escapeMarkdown(interaction.options.getString('text'))}` : "La descripción del canal ha sido eliminada")).catch(async (err) => {
                        if (err instanceof Discord.RateLimitError) return await interaction.reply({ content: "Puedes cambiar información del canal 2 veces cada 10 minutos. Espera un poco...", ephemeral: true });
                        return await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true });
                    });
                    break;
                }
                case "pin-message": {
                    const channel = await guild.channels.fetch(interaction.channelId);
                    if (channel.isVoiceBased()) return await interaction.reply({ content: "No existen los mensajes fijados en canal de voz...", ephemeral: true });
                    const checking = await channel.messages.fetchPinned();
                    const message = await channel.messages.fetch(interaction.options.getString('message-id'), { force: true }).catch(() => { });
                    if (!message) return await interaction.reply({ content: "ID de mensaje inválida!", ephemeral: true });
                    if ((checking.size >= 50) && (!message.pinned)) return await interaction.reply({ content: "Ya hay 50 mensajes fijados en el canal, no puedo fijar :(\nUsa este mismo comando para desfijar un mensaje, hecho eso vuelve a intentar.", ephemeral: true });
                    if (message.pinned) await message.unpin();
                    else await message.pin();
                    await interaction.reply(`Mensaje con ID ${interaction.options.getString('message-id')} ${message.pinned ? 'desfijado' : 'fijado'} correctamente!`);
                    break;
                }
                case "invite": {
                    if (usedinvites.includes(interaction.user.id)) return interaction.reply("No puedes crear más invitaciones! Espera mañana...");
                    usedinvites.push(interaction.user.id);
                    const invite = await guild.invites.create(interaction.channelId, { maxUses: 1, unique: true, reason: `Comando invite hecho por ${interaction.user.tag}` });
                    await interaction.reply("He generado una invitación! Revisa abajo ;)");
                    await interaction.followUp({ content: `${invite.url}`, ephemeral: true });
                    break;
                }
                case "presence": {
                    const presence = { activities: [] };
                    if (interaction.options.getString("estado")) presence.status = interaction.options.getString("estado");
                    if (interaction.options.getString("nombre") || interaction.options.getString("tipo") || interaction.options.getString("url")) {
                        presence.activities.push({
                            name: interaction.options.getString("nombre"),
                            type: parseInt(interaction.options.getString("tipo")),
                            url: interaction.options.getString("url")
                        });
                    }
                    const hasType = typeof presence.activities?.[0]?.type === "number";
                    if (presence.activities?.[0]?.name && (!hasType)) return interaction.reply({ content: "Es necesario poner un tipo de actividad al poner nombre", ephemeral: true });
                    if (hasType && (!presence.activities?.[0]?.name)) return interaction.reply({ content: "La actividad debe tener un nombre!", ephemeral: true });
                    if ((presence.activities?.[0]?.type === 1) && (!presence.activities?.[0]?.url)) return interaction.reply({ content: "Una actividad con tipo Transmitiendo debe tener un URL de Twitch.", ephemeral: true });
                    if ((presence.activities?.[0]?.type !== 1) && (presence.activities?.[0]?.url)) return interaction.reply({ content: "Sólo una actividad con tipo Transmitiendo puede tener un URL.", ephemeral: true });
                    client.user.setPresence(presence);
                    await interaction.reply("Presencia cambiada.");
                    break;
                }
                case "stream-key": {
                    const sign = md5(`/live/${encodeURIComponent(interaction.options.getString("stream-name"))}-${new Date(process.env.stream_timestamp).getTime() / 1000}-${process.env.stream_secret}`);
                    const content = `Host: \`rtmp://${process.env.stream_host}/live\`

Key: \`${encodeURIComponent(interaction.options.getString("stream-name"))}?sign=${new Date(process.env.stream_timestamp).getTime() / 1000}-${sign}\`

m3u8 link: \`https://${process.env.stream_host}/live/${encodeURIComponent(interaction.options.getString("stream-name"))}/index.m3u8\``
                    await interaction.reply({ content, ephemeral: true });
                    break;
                }
                case "pedir-sancion": {
                    const msg = await interaction.reply({ content: `Esto hará un @everyone en <#${JSON.parse(process.env.sanctionsChannel)[interaction.guildId]}> donde <@!${guild.ownerId}> tomará la decisión final\nAsegúrate que tu reporte sea serio y no cualquier broma.`, components: [new Discord.ActionRowBuilder().addComponents([new Discord.ButtonBuilder().setCustomId("sancion_enviar").setStyle("Success").setLabel("Enviar reporte").setEmoji("✅")])], allowedMentions: { users: [guild.ownerId] }, ephemeral: true, fetchReply: true });
                    const ch = await guild.channels.fetch(interaction.channelId);
                    await ch.awaitMessageComponent({ filter: (i) => interaction.user.id === i.user.id && i.customId === "sancion_enviar" && i.message.id === msg.id, time: 10000, componentType: 2 }).then(async e => {
                        let finalsctypetext = "?";
                        if (interaction.options.getString("tipo") === "timeout") finalsctypetext = "⏲️ Aislamiento / Timeout";
                        if (interaction.options.getString("tipo") === "ban") finalsctypetext = "🔨 Ban / Expulsión";
                        const embed = new Discord.EmbedBuilder()
                            .setColor("DARK_RED")
                            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.avatarURL() })
                            .setTitle("Nuevo reporte")
                            .addFields([
                                { name: "Infractor", value: interaction.options.getUser("infractor").toString() },
                                { name: "Tipo de sanción", value: finalsctypetext },
                                { name: "Razón", value: interaction.options.getString("razon") }
                            ])
                            .setFooter({ text: "Fecha", iconURL: interaction.options.getUser("infractor").avatarURL() })
                            .setTimestamp();
                        const vote_p_button = new Discord.ButtonBuilder()
                            .setCustomId("sancion_votar_p")
                            .setLabel("De acuerdo")
                            .setStyle("Success");
                        const vote_r_button = new Discord.ButtonBuilder()
                            .setCustomId("sancion_votar_r")
                            .setLabel("No estoy de acuerdo")
                            .setStyle("Danger");
                        const admin_button = new Discord.ButtonBuilder()
                            .setCustomId("sancion_admin_d")
                            .setLabel("Eliminar reporte")
                            .setStyle("Secondary");
                        const channel = await guild.channels.fetch(JSON.parse(process.env.sanctionsChannel)[interaction.guildId]);
                        if (channel && channel instanceof Discord.TextChannel) {
                            const msg = await channel.send({ content: "@everyone", embeds: [embed], components: [new Discord.ActionRowBuilder().addComponents([vote_p_button, vote_r_button]), new Discord.ActionRowBuilder().addComponents([admin_button])], allowedMentions: { parse: ["everyone"] } });
                            scDb.create(msg.id, { creator: interaction.user.id, infractor: interaction.options.getUser("infractor").id, p: [], r: [] });
                            await interaction.editReply({ content: "Reporte enviado ;)", components: [new Discord.ActionRowBuilder().addComponents([new Discord.ButtonBuilder().setCustomId("sancion_enviar").setStyle("Success").setLabel("Enviar reporte").setEmoji("✅").setDisabled(true)])] })
                            return await e.deferUpdate();
                        }
                    }).catch(() => interaction.editReply({ content: "💤", components: [new Discord.ActionRowBuilder().addComponents([new Discord.ButtonBuilder().setCustomId("sancion_enviar").setStyle("Success").setLabel("Enviar reporte").setEmoji("✅").setDisabled(true)])] }));
                    break;
                }
            }
            if (!interaction.replied) await interaction.reply({ content: `<@!${process.env.ownerId}> se durmió mientras creaba ese comando, xd`, allowedMentions: { users: [process.env.ownerId] }, ephemeral: true }).catch(() => { });
        }
        if (interaction.isButton()) {
            switch (interaction.customId) {
                case "sancion_votar_p": {
                    const doc = scDb.get(interaction.message.id);
                    if (doc) {
                        if (doc.p.includes(interaction.user.id)) return await interaction.reply({ content: "No puedes votar +2 veces", ephemeral: true });
                        if (doc.r.includes(interaction.user.id)) doc.r.splice(doc.r.indexOf(interaction.user.id), 1);
                        doc.p.push(interaction.user.id);
                        doc.save();
                        const embed = Discord.EmbedBuilder.from(interaction.message.embeds[0]);
                        let rs;
                        for (const i in embed.data.fields) {
                            if (embed.data.fields[i].name === "Votos a favor") embed.data.fields[i].value = doc.p.map(e => `<@!${e}>`).join("\n");
                            if (embed.data.fields[i].name === "Votos en contra") {
                                rs = i;
                                embed.data.fields[i].value = doc.r.map(e => `<@!${e}>`).join("\n");
                            }
                        }
                        if (!doc.r.length && embed.data.fields.find(e => e.name === "Votos en contra")) embed.data.fields.splice(rs, 1);
                        if (!embed.data.fields.find(e => e.name === "Votos a favor")) embed.addFields([{ name: "Votos a favor", value: doc.p.map(e => `<@!${e}>`).join("\n") }]);
                        await interaction.update({ embeds: [embed] });
                    } else return await interaction.deferUpdate();
                    break;
                }
                case "sancion_votar_r": {
                    const doc = scDb.get(interaction.message.id);
                    if (doc) {
                        if (doc.r.includes(interaction.user.id)) return await interaction.reply({ content: "No puedes votar +2 veces", ephemeral: true });
                        if (doc.p.includes(interaction.user.id)) doc.p.splice(doc.p.indexOf(interaction.user.id), 1);
                        doc.r.push(interaction.user.id);
                        doc.save();
                        const embed = Discord.EmbedBuilder.from(interaction.message.embeds[0]);
                        let ps;
                        for (const i in embed.data.fields) {
                            if (embed.data.fields[i].name === "Votos a favor") {
                                ps = i;
                                embed.data.fields[i].value = doc.p.map(e => `<@!${e}>`).join("\n")
                            }
                            if (embed.data.fields[i].name === "Votos en contra") embed.data.fields[i].value = doc.r.map(e => `<@!${e}>`).join("\n");
                        }
                        if (!doc.p.length && embed.data.fields.find(e => e.name === "Votos a favor")) embed.data.fields.splice(ps, 1);
                        if (!embed.data.fields.find(e => e.name === "Votos en contra")) embed.addFields([{ name: "Votos en contra", value: doc.r.map(e => `<@!${e}>`).join("\n") }]);
                        await interaction.update({ embeds: [embed] });
                    } else return await interaction.deferUpdate();
                    break;
                }
                case "sancion_admin_d": {
                    if (guild.ownerId !== interaction.user.id) return await interaction.reply({ content: "No tienes permisos para usar ese botón", ephemeral: true });
                    const doc = scDb.delete(interaction.message.id);
                    if (doc) {
                        const vote_p_button = new Discord.ButtonBuilder()
                            .setCustomId("sancion_votar_p")
                            .setLabel("De acuerdo")
                            .setStyle("Success")
                            .setDisabled(true);
                        const vote_r_button = new Discord.ButtonBuilder()
                            .setCustomId("sancion_votar_r")
                            .setLabel("No estoy de acuerdo")
                            .setStyle("Danger")
                            .setDisabled(true);
                        const admin_button = new Discord.ButtonBuilder()
                            .setCustomId("sancion_admin_d")
                            .setLabel("Eliminar reporte")
                            .setStyle("Secondary")
                            .setDisabled(true);
                        await interaction.update({ components: [new Discord.ActionRowBuilder().addComponents([vote_p_button, vote_r_button]), new Discord.ActionRowBuilder().addComponents([admin_button])] })
                    } else return await interaction.deferUpdate();
                    break;
                }
            }
        }
    } catch (err) {
        console.error(err);
        if (interaction.replied) await interaction.followUp({ content: `Un error ocurrió: ${err}`, ephemeral: true });
        else await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true });
    }
});

client.login();