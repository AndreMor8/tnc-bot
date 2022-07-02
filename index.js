import config from './config.json' assert { type: 'json' };
import path from 'node:path';
import cron from 'croner';
import MeowDB from 'meowdb';
import Discord from 'discord.js';
import md5 from 'md5';

process.on('unhandledRejection', (err) => {
    console.error(err);
});
const bitrates = { "NONE": 96_000, "TIER_1": 128_000, "TIER_2": 256_000, "TIER_3": 384_000 };
const usedinvites = [];
const client = new Discord.Client({
    intents: 0,
    allowedMentions: { parse: [] },
    presence: { status: "idle", activities: [{ name: "cómo ser productivo", type: "WATCHING" }] },
    rejectOnRateLimit(data) {
        if (data.method === "patch" && data.path.includes("channels")) return true;
        return false;
    }
});
const scDb = new MeowDB({
    dir: path.join(process.cwd(), "meowdb"),
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
        if (interaction.guild.id !== config.guildId) { await interaction.reply("Este bot no es para este servidor"); return await interaction.guild.leave() };
        if (interaction.isCommand()) {
            switch (interaction.commandName) {
                case "server-name": {
                    await interaction.guild.setName(interaction.options.getString('nombre'));
                    await interaction.reply(`El nombre del servidor ahora es: ${Discord.Util.escapeMarkdown(interaction.options.getString('nombre'))}`);
                    break;
                }
                case "new-channel": {
                    const guild = await interaction.guild.fetch();
                    const options = {
                        type: interaction.options.getString("type"),
                        permissionOverwrites: [{
                            id: interaction.user.id,
                            allow: ["MANAGE_CHANNELS", "MANAGE_ROLES"],
                            type: "member"
                        }],
                        reason: `Comando new-channel hecho por ${interaction.user.tag}`
                    }
                    if (options.type === "GUILD_VOICE") {
                        options.bitrate = bitrates[guild.premiumTier];
                        options.userLimit = 99;
                    }
                    const ch = await guild.channels.create(interaction.options.getString("name"), options);
                    await interaction.reply(`Canal creado -> ${ch}`);
                    break;
                }
                case "server-icon": {
                    try {
                        const link = interaction.options.getString("url");
                        if (link) {
                            const final = new URL(interaction.options.getString('url'));
                            if (!(["http:", "https:"].includes(final.protocol))) return interaction.reply({ content: "Debes introducir una URL correcta!", ephemeral: true });
                            await interaction.guild.setIcon(final.href)
                                .then(async () => await interaction.reply('He cambiado el ícono del servidor!'))
                                .catch(async (err) => await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true }));
                        } else {
                            await interaction.guild.setIcon(null)
                                .then(async () => await interaction.reply('He quitado el ícono del servidor!'))
                                .catch(async (err) => await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true }));
                        }
                    } catch (err) {
                        await interaction.reply({ content: "Debes introducir una URL correcta!", ephemeral: true });
                    }
                    break;
                }
                case "channel-name": {
                    const canal = interaction.options.getChannel('canal', false) || await interaction.guild.channels.fetch(interaction.channelId);
                    if (!config.whatChannels.includes(canal.id)) return await interaction.reply({ content: `No puedes cambiar cosas a este canal`, ephemeral: true });
                    await canal.setName(interaction.options.getString('nombre')).then(async () => await interaction.reply(`${canal.toString()}`)).catch(async (err) => {
                        if (err instanceof Discord.RateLimitError) return await interaction.reply({ content: "Puedes cambiar información del canal 2 veces cada 10 minutos. Espera un poco...", ephemeral: true });
                        return await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true });
                    });
                    break;
                }
                case "channel-description": {
                    const canal = interaction.options.getChannel('canal', false) || await interaction.guild.channels.fetch(interaction.channelId);
                    if (!config.whatChannels.includes(canal.id)) return await interaction.reply({ content: `No puedes cambiar cosas a este canal`, ephemeral: true });
                    if (canal.isVoice()) return interaction.reply({ content: "Un canal de voz no tiene descripción...", ephemeral: true });
                    await canal.setTopic(interaction.options.getString('text')).then(async () => await interaction.reply(`La descripción del canal ahora es: ${Discord.Util.escapeMarkdown(interaction.options.getString('text'))}`)).catch(async (err) => {
                        if (err instanceof Discord.RateLimitError) return await interaction.reply({ content: "Puedes cambiar información del canal 2 veces cada 10 minutos. Espera un poco...", ephemeral: true });
                        return await interaction.reply({ content: `Un error ocurrió: ${err}`, ephemeral: true });
                    });
                    break;
                }
                case "pin-message": {
                    const channel = await interaction.guild.channels.fetch(interaction.channelId);
                    if (channel.isVoice()) return await interaction.reply({ content: "No existen los mensajes fijados en canal de voz...", ephemeral: true });
                    const checking = await channel.messages.fetchPinned();
                    if (checking.size >= 50) return await interaction.reply({ content: "Ya hay 50 mensajes fijados en el canal, no puedo fijar :(\nUsa este mismo comando para desfijar un mensaje, hecho eso vuelve a intentar.", ephemeral: true });
                    const message = await channel.messages.fetch(interaction.options.getString('message-id'), { force: true }).catch(() => { });
                    if (!message) return await interaction.reply({ content: "ID de mensaje inválida!", ephemeral: true });
                    if (message.pinned) await message.unpin();
                    else await message.pin();
                    await interaction.reply(`Mensaje con ID ${interaction.options.getString('message-id')} ${message.pinned ? 'desfijado' : 'fijado'} correctamente!`);
                    break;
                }
                case "invite": {
                    if (usedinvites.includes(interaction.user.id)) return interaction.reply("No puedes crear más invitaciones! Espera mañana...");
                    usedinvites.push(interaction.user.id);
                    const invite = await interaction.guild.invites.create(interaction.channelId, { maxUses: 1, unique: true, reason: `Comando invite hecho por ${interaction.user.tag}` });
                    await interaction.reply("He generado una invitación! Revisa abajo ;)");
                    await interaction.followUp({ content: `${invite.url}`, ephemeral: true });
                    break;
                }
                case "presence": {
                    const presence = {};
                    if (interaction.options.getString("estado")) presence.status = interaction.options.getString("estado");
                    if (interaction.options.getString("nombre") || interaction.options.getString("tipo") || interaction.options.getString("url")) {
                        presence.activities = [{
                            name: interaction.options.getString("nombre"),
                            type: interaction.options.getString("tipo"),
                            url: interaction.options.getString("url")
                        }];
                    }
                    if (presence.activities?.[0].type && !presence.activities?.[0].name) return interaction.reply({ content: "La actividad debe tener un nombre!", ephemeral: true });
                    if (presence.activities?.[0].type === "STREAMING" && !presence.activities?.[0].url) return interaction.reply({ content: "Una actividad con tipo Transmitiendo debe tener un URL de Twitch.", ephemeral: true });
                    if (presence.activities?.[0].type !== "STREAMING" && presence.activities?.[0].url) return interaction.reply({ content: "Sólo una actividad con tipo Transmitiendo puede tener un URL.", ephemeral: true });
                    client.user.setPresence(presence);
                    await interaction.reply("Presencia cambiada.");
                    break;
                }
                case "stream-key": {
                    const sign = md5(`/livestream/${encodeURIComponent(interaction.options.getString("stream-name"))}-${new Date(config.stream_timestamp).getTime() / 1000}-${config.stream_secret}`);
                    const content = `Host: \`rtmps://${config.stream_host}:1935/live/stream\`

Key: \`${encodeURIComponent(interaction.options.getString("stream-name"))}?sign=${new Date(config.stream_timestamp).getTime() / 1000}-${sign}\`

m3u8 link: \`https://${config.stream_host}/${encodeURIComponent(interaction.options.getString("stream-name"))}/index.m3u8\``
                    await interaction.reply({ content, ephemeral: true });
                    break;
                }
                case "pedir-sancion": {
                    const msg = await interaction.reply({ content: `Esto hará un @everyone en <#${config.sanctionsChannel}> donde <@!${interaction.guild.ownerId}> tomará la decisión final\nAsegúrate que tu reporte sea serio y no cualquier broma.`, components: [new Discord.MessageActionRow().addComponents([new Discord.MessageButton().setCustomId("sancion_enviar").setStyle("SUCCESS").setLabel("Enviar reporte").setEmoji("✅")])], allowedMentions: { users: [interaction.guild.ownerId] }, ephemeral: true, fetchReply: true });
                    const ch = await interaction.guild.channels.fetch(interaction.channelId);
                    await ch.awaitMessageComponent({ filter: (i) => interaction.user.id === i.user.id && i.customId === "sancion_enviar" && i.message.id === msg.id, time: 10000, componentType: "BUTTON" }).then(async e => {
                        let finalsctypetext = "?";
                        if (interaction.options.getString("tipo") === "timeout") finalsctypetext = "⏲️ Aislamiento / Timeout";
                        if (interaction.options.getString("tipo") === "ban") finalsctypetext = "🔨 Ban / Expulsión";
                        const embed = new Discord.MessageEmbed()
                            .setColor("DARK_RED")
                            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.avatarURL() })
                            .setTitle("Nuevo reporte")
                            .addField("Infractor", interaction.options.getUser("infractor").toString())
                            .addField("Tipo de sanción", finalsctypetext)
                            .addField("Razón", interaction.options.getString("razon"))
                            .setFooter({ text: "Fecha", iconURL: interaction.options.getUser("infractor").avatarURL() })
                            .setTimestamp();
                        const vote_p_button = new Discord.MessageButton()
                            .setCustomId("sancion_votar_p")
                            .setLabel("De acuerdo")
                            .setStyle("SUCCESS");
                        const vote_r_button = new Discord.MessageButton()
                            .setCustomId("sancion_votar_r")
                            .setLabel("No estoy de acuerdo")
                            .setStyle("DANGER");
                        const admin_button = new Discord.MessageButton()
                            .setCustomId("sancion_admin_d")
                            .setLabel("Eliminar reporte")
                            .setStyle("SECONDARY");
                        const channel = await interaction.guild.channels.fetch(config.sanctionsChannel);
                        if (channel && channel instanceof Discord.TextChannel) {
                            const msg = await channel.send({ content: "@everyone", embeds: [embed], components: [new Discord.MessageActionRow().addComponents([vote_p_button, vote_r_button]), new Discord.MessageActionRow().addComponents([admin_button])], allowedMentions: { parse: ["everyone"] } });
                            scDb.create(msg.id, { creator: interaction.user.id, infractor: interaction.options.getUser("infractor").id, p: [], r: [] });
                            await interaction.editReply({ content: "Reporte enviado ;)", components: [new Discord.MessageActionRow().addComponents([new Discord.MessageButton().setCustomId("sancion_enviar").setStyle("SUCCESS").setLabel("Enviar reporte").setEmoji("✅").setDisabled(true)])] })
                            return await e.deferUpdate();
                        }
                    }).catch(() => interaction.editReply({ content: "💤", components: [new Discord.MessageActionRow().addComponents([new Discord.MessageButton().setCustomId("sancion_enviar").setStyle("SUCCESS").setLabel("Enviar reporte").setEmoji("✅").setDisabled(true)])] }));
                    break;
                }
            }
            if (!interaction.replied) await interaction.reply({ content: `<@!${config.ownerId}> se durmió mientras creaba ese comando, xd`, allowedMentions: { users: [config.ownerId] }, ephemeral: true }).catch(() => { });
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
                        const embed = new Discord.MessageEmbed(interaction.message.embeds[0]);
                        let rs;
                        for (const i in embed.fields) {
                            if (embed.fields[i].name === "Votos a favor") embed.fields[i].value = doc.p.map(e => `<@!${e}>`).join("\n");
                            if (embed.fields[i].name === "Votos en contra") {
                                rs = i;
                                embed.fields[i].value = doc.r.map(e => `<@!${e}>`).join("\n");
                            }
                        }
                        if (!doc.r.length && embed.fields.find(e => e.name === "Votos en contra")) embed.fields.splice(rs, 1);
                        if (!embed.fields.find(e => e.name === "Votos a favor")) embed.addField("Votos a favor", doc.p.map(e => `<@!${e}>`).join("\n"));
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
                        const embed = new Discord.MessageEmbed(interaction.message.embeds[0]);
                        let ps;
                        for (const i in embed.fields) {
                            if (embed.fields[i].name === "Votos a favor") {
                                ps = i;
                                embed.fields[i].value = doc.p.map(e => `<@!${e}>`).join("\n")
                            }
                            if (embed.fields[i].name === "Votos en contra") embed.fields[i].value = doc.r.map(e => `<@!${e}>`).join("\n");
                        }
                        if (!doc.p.length && embed.fields.find(e => e.name === "Votos a favor")) embed.fields.splice(ps, 1);
                        if (!embed.fields.find(e => e.name === "Votos en contra")) embed.addField("Votos en contra", doc.r.map(e => `<@!${e}>`).join("\n"));
                        await interaction.update({ embeds: [embed] });
                    } else return await interaction.deferUpdate();
                    break;
                }
                case "sancion_admin_d": {
                    const guild = await interaction.guild.fetch();
                    if (guild.ownerId !== interaction.user.id) return await interaction.reply({ content: "No tienes permisos para usar ese botón", ephemeral: true });
                    const doc = scDb.delete(interaction.message.id);
                    if (doc) {
                        const vote_p_button = new Discord.MessageButton()
                            .setCustomId("sancion_votar_p")
                            .setLabel("De acuerdo")
                            .setStyle("SUCCESS")
                            .setDisabled(true);
                        const vote_r_button = new Discord.MessageButton()
                            .setCustomId("sancion_votar_r")
                            .setLabel("No estoy de acuerdo")
                            .setStyle("DANGER")
                            .setDisabled(true);
                        const admin_button = new Discord.MessageButton()
                            .setCustomId("sancion_admin_d")
                            .setLabel("Eliminar reporte")
                            .setStyle("SECONDARY")
                            .setDisabled(true);
                        await interaction.update({ components: [new Discord.MessageActionRow().addComponents([vote_p_button, vote_r_button]), new Discord.MessageActionRow().addComponents([admin_button])] })
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

client.login(config.token);