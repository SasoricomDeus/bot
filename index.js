require('./keep_alive.js');
const { pedidos, config, cargos, servidores } = require('./auto-save.js');
const { 
  PLACAR_CONFIG, 
  configurarTipoPlacar, 
  adicionarRecrutamento, 
  atualizarMensagemPlacar,
  iniciarVerificacaoResets 
} = require('./placar-manager.js');




const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  ChannelType,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionsBitField,
} = require("discord.js");
const fs = require("fs");
const { salvarNoGitHub } = require('./salvar.js');
// ======= CONFIGURAÇÕES DE AUTORIZAÇÃO =======
const DONO_BOT_ID = "1069959184520597546"; // Seu ID do Discord
const ADMINS_AUTORIZADOS = [DONO_BOT_ID]; // IDs dos administradores autorizados

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN);

// ======= CONFIGURAÇÕES DE CORES =======
const CORES = {
  PRINCIPAL: 0x5865f2, // Discord Blurple
  SUCESSO: 0x57f287, // Verde
  ERRO: 0xed4245, // Vermelho
  AVISO: 0xfee75c, // Amarelo
  INFO: 0x5dade2, // Azul claro
  NEUTRO: 0x99aab5, // Cinza
};

// ======= Arquivos de persistência por servidor =======
const cargosFile = "./cargos.json";
let cargosData = cargos.carregar();

const pedidosFile = "./pedidos.json";
let pedidosData = pedidos.carregar();

const configFile = "./config.json";
let configData = config.carregar();

const servidoresFile = "./servidores.json";
let servidoresData = servidores.carregar();
// Garantir estrutura correta
if (!servidoresData.autorizados) servidoresData.autorizados = {};
if (!servidoresData.pendentes) servidoresData.pendentes = {};

// ======= Funções de autorização =======
function isServerAuthorized(guildId) {
  return !!servidoresData.autorizados[guildId];
}

function isServerPending(guildId) {
  return !!servidoresData.pendentes[guildId];
}

function authorizeServer(guildId, guildData) {
  servidoresData.autorizados[guildId] = {
    ...guildData,
    authorizedAt: Date.now()
  };
  delete servidoresData.pendentes[guildId];
  servidores.salvar(servidoresData, `Servidor autorizado: ${guildData.name}`);
}

function denyServer(guildId) {
  delete servidoresData.pendentes[guildId];
  servidores.salvar(servidoresData, `Servidor negado: ${guildId}`);
}

function addPendingServer(guildId, guildData) {
  servidoresData.pendentes[guildId] = {
    ...guildData,
    requestedAt: Date.now()
  };
  servidores.salvar(servidoresData, `Nova solicitação de servidor: ${guildData.name}`);
}

function isAuthorizedUser(userId) {
  return ADMINS_AUTORIZADOS.includes(userId);
}

async function sendAuthorizationRequest(guild) {
  try {
    const dono = await client.users.fetch(DONO_BOT_ID);
    const owner = await guild.fetchOwner();
    
    const guildData = {
      name: guild.name,
      id: guild.id,
      ownerId: owner.id,
      ownerTag: owner.user.tag,
      memberCount: guild.memberCount,
      createdAt: guild.createdAt.toISOString()
    };
    
    addPendingServer(guild.id, guildData);
    
    const embed = new EmbedBuilder()
      .setColor(CORES.AVISO)
      .setTitle("🔐 Nova Solicitação de Autorização")
      .setDescription("Um novo servidor está solicitando autorização para usar o bot.")
      .addFields(
        { name: "🏠 Nome do Servidor", value: guild.name, inline: true },
        { name: "🆔 ID do Servidor", value: guild.id, inline: true },
        { name: "👑 Dono do Servidor", value: `${owner.user.tag} (${owner.id})`, inline: false },
        { name: "👥 Membros", value: guild.memberCount.toString(), inline: true },
        { name: "📅 Servidor Criado", value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>`, inline: true }
      )
      .setThumbnail(guild.iconURL() || null)
      .setFooter({ text: "Sistema de Autorização de Servidores" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`authorize_server_${guild.id}`)
        .setLabel("Aprovar Servidor")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`deny_server_${guild.id}`)
        .setLabel("Negar Servidor")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌")
    );

    await dono.send({ embeds: [embed], components: [row] });
    console.log(`📨 Solicitação de autorização enviada para ${guild.name} (${guild.id})`);
  } catch (error) {
    console.log(`❌ Erro ao enviar solicitação de autorização para ${guild.name}:`, error);
  }
}

// ======= Funções auxiliares para dados por servidor =======
function getServerConfig(guildId) {
  if (!configData[guildId]) {
    configData[guildId] = {};
  }
  return configData[guildId];
}

function getServerCargos(guildId) {
  if (!cargosData[guildId]) {
    cargosData[guildId] = {};
  }
  return cargosData[guildId];
}

function getServerPedidos(guildId) {
  if (!pedidosData[guildId]) {
    pedidosData[guildId] = {};
  }
  return pedidosData[guildId];
}

// ======= IDs de canais configurados por servidor =======
function getPedirTagId(guildId) {
  return getServerConfig(guildId).pedirTagId;
}

function getAprovarTagId(guildId) {
  return getServerConfig(guildId).aprovarTagId;
}

function getResultadosId(guildId) {
  return getServerConfig(guildId).resultadosId;
}

// ======= Utilidades =======
function getTopFormattedRoleId(member) {
  const serverCargos = getServerCargos(member.guild.id);
  const formattedRoles = member.roles.cache.filter((r) => r.id in serverCargos);
  if (formattedRoles.size === 0) return null;

  const topRole = formattedRoles
    .sort((a, b) => b.position - a.position)
    .first();
  return topRole.id;
}

function buildNick({ formato, nomeBase, idPedido }) {
  if (formato) {
    if (idPedido) return `${formato} ${nomeBase} (${idPedido})`;
    return `${formato} ${nomeBase}`;
  } else {
    if (idPedido) return `${nomeBase} (${idPedido})`;
    return null;
  }
}

function truncateToDiscordLimit(nick) {
  const MAX = 32;
  if (!nick) return nick;
  if (nick.length <= MAX) return nick;

  const idTailMatch = nick.match(/\s\(\d+\)$/);
  const tail = idTailMatch ? idTailMatch[0] : "";
  const base = tail ? nick.slice(0, nick.length - tail.length) : nick;

  const remaining = MAX - tail.length;
  if (remaining <= 0) return nick.slice(0, MAX);

  return base.slice(0, remaining).trim() + tail;
}

async function atualizarNickname(member) {
  try {
    const guildId = member.guild.id;
    const userId = member.id;
    const serverPedidos = getServerPedidos(guildId);
    const serverCargos = getServerCargos(guildId);

    const pedido = serverPedidos[userId];
    const nomeBase = pedido && pedido.nome ? pedido.nome : member.user.username;
    const idPedido = pedido && pedido.id ? pedido.id : null;

    const roleId = getTopFormattedRoleId(member);
    const formato = roleId ? serverCargos[roleId] : null;

    const novo = buildNick({ formato, nomeBase, idPedido });
    if (!novo) return;

    const novoTruncado = truncateToDiscordLimit(novo);
    if (member.nickname === novoTruncado) return;

    await member.setNickname(novoTruncado).catch(() => {
      console.log(
        `❌ Não consegui alterar o nick de ${member.user.tag} no servidor ${member.guild.name}`,
      );
    });
  } catch (e) {
    console.log("Erro ao atualizar nickname:", e);
  }
}

// ======= READY: registra comandos globais =======
client.once("ready", async () => {
  console.log(`✅ Bot ${client.user.tag} está online!`);
  console.log(`📊 Conectado em ${client.guilds.cache.size} servidor(es)`);

  // Registrar comandos globalmente
  await client.application.commands.set([
    new SlashCommandBuilder()
      .setName("configurar-canais")
      .setDescription("🔧 Configura os canais do sistema de recrutamento")
      .addChannelOption((opt) =>
        opt
          .setName("pedir-tag")
          .setDescription("Canal onde os usuários solicitam tags")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName("aprovar-tag")
          .setDescription("Canal para aprovação de tags")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName("resultados")
          .setDescription("Canal para resultados do recrutamento")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
      .addChannelOption((opt) =>
        opt
          .setName("placar")
          .setDescription("Canal para o placar de recrutamentos")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("tipo-placar")
          .setDescription("Tipo do placar de recrutamentos")
          .addChoices(
            { name: "Semanal (reset toda segunda-feira)", value: "semanal" },
            { name: "Mensal (reset todo dia 1º)", value: "mensal" }
          )
          .setRequired(false),
      ),

    new SlashCommandBuilder()
      .setName("criar-canais")
      .setDescription("🏗️ Cria automaticamente os canais do sistema"),

    new SlashCommandBuilder()
      .setName("status-sistema")
      .setDescription("📊 Mostra o status atual do sistema"),

    new SlashCommandBuilder()
      .setName("adicionar-cargo")
      .setDescription("🔧 Adiciona formatação para um cargo")
      .addRoleOption((opt) =>
        opt
          .setName("cargo")
          .setDescription("Cargo a configurar")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("formato")
          .setDescription("Formatação (ex: [CEL | ROTA])")
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("editar-cargo")
      .setDescription("✏️ Edita a formatação de um cargo existente")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a editar").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("formato")
          .setDescription("Nova formatação")
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("listar-cargos")
      .setDescription("📋 Lista todos os cargos configurados"),

    new SlashCommandBuilder()
      .setName("remover-cargo")
      .setDescription("🗑️ Remove a configuração de um cargo")
      .addRoleOption((opt) =>
        opt
          .setName("cargo")
          .setDescription("Cargo a remover")
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("listar-servidores")
      .setDescription("🌐 Lista servidores autorizados e pendentes (apenas para admins do bot)"),

    new SlashCommandBuilder()
      .setName("autorizar-servidor")
      .setDescription("✅ Autoriza um servidor manualmente (apenas para admins do bot)")
      .addStringOption((opt) =>
        opt
          .setName("servidor-id")
          .setDescription("ID do servidor para autorizar")
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("config-placar")
      .setDescription("🏆 Configura o tipo do placar de recrutamentos")
      .addStringOption((opt) =>
        opt
          .setName("tipo")
          .setDescription("Tipo do placar")
          .addChoices(
            { name: "Semanal (reset toda segunda-feira)", value: "semanal" },
            { name: "Mensal (reset todo dia 1º)", value: "mensal" }
          )
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("config-placar")
      .setDescription("📊 Configura o tipo de placar de recrutamentos")
      .addStringOption((opt) =>
        opt
          .setName("tipo")
          .setDescription("Tipo do placar")
          .setRequired(true)
          .addChoices(
            { name: "Semanal (reset toda segunda-feira)", value: "semanal" },
            { name: "Mensal (reset todo dia 1º)", value: "mensal" }
          )
      ),
  ]);

  console.log("✅ Comandos registrados globalmente!");
  
  // Iniciar sistema de placar
  iniciarVerificacaoResets(client);
  console.log("🏆 Sistema de placar inicializado!");

  // Inicia sistema de reset automático do placar
  iniciarVerificacaoResets(client);

  // Configurar canais para servidores já configurados
  for (const guild of client.guilds.cache.values()) {
    const guildId = guild.id;
    
    // Verificar se o servidor está autorizado
    if (!isServerAuthorized(guildId)) {
      console.log(`⚠️ Servidor ${guild.name} não está autorizado - enviando solicitação`);
      if (!isServerPending(guildId)) {
        await sendAuthorizationRequest(guild);
      }
      continue;
    }
    
    if (
      getPedirTagId(guildId) &&
      getAprovarTagId(guildId) &&
      getResultadosId(guildId)
    ) {
      console.log(`✅ Configurando sistema para ${guild.name}`);
      await configurarCanalPedirTag(guild);
    } else {
      console.log(`⚠️ Servidor ${guild.name} não configurado`);
    }
  }
});

// ======= Configurar Canal Pedir Tag =======
async function configurarCanalPedirTag(guild) {
  const pedirTagId = getPedirTagId(guild.id);
  if (!pedirTagId) return;

  const pedirTag = guild.channels.cache.get(pedirTagId);
  if (!pedirTag) return;

  // Limpa mensagens antigas do bot
  try {
    const messages = await pedirTag.messages.fetch({ limit: 10 });
    const botMessages = messages.filter((m) => m.author.id === client.user.id);
    if (botMessages.size > 0) {
      await pedirTag.bulkDelete(botMessages);
    }
  } catch (error) {
    console.log(`Não foi possível limpar mensagens antigas em ${guild.name}`);
  }

  const embed = new EmbedBuilder()
    .setColor(CORES.PRINCIPAL)
    .setTitle("🏷️ Sistema de Solicitação de TAG")
    .setDescription(
      "**Bem-vindo ao sistema de recrutamento!**\n\n" +
        "Para solicitar sua tag personalizada, clique no botão abaixo e preencha suas informações.\n\n" +
        "📝 **Informações necessárias:**\n" +
        "• Nome completo\n" +
        "• Número de identificação\n\n" +
        "⏱️ **Tempo de resposta:** Até 24 horas",
    )
    .setThumbnail(guild.iconURL() || null)
    .setFooter({
      text: `${guild.name} • Sistema de Recrutamento`,
      iconURL: guild.iconURL() || undefined,
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("abrir_modal_tag")
      .setLabel("📩 Solicitar TAG")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🏷️"),
  );

  await pedirTag.send({
    content: "## 🎯 **SOLICITAÇÃO DE TAG DE RECRUTAMENTO**",
    embeds: [embed],
    components: [row],
  });
}

// ======= Evento quando o bot entra em um novo servidor =======
client.on(Events.GuildCreate, async (guild) => {
  console.log(`🆕 Bot adicionado ao servidor: ${guild.name} (${guild.id})`);
  console.log(`👥 Membros: ${guild.memberCount}`);

  // Verificar se o servidor já está autorizado
  if (isServerAuthorized(guild.id)) {
    console.log(`✅ Servidor ${guild.name} já está autorizado`);
    // Inicializar dados do servidor
    getServerConfig(guild.id);
    getServerCargos(guild.id);
    getServerPedidos(guild.id);
    
    // Salvar dados iniciais
    await config.salvar(configData, `Novo servidor autorizado: ${guild.name}`);
    await cargos.salvar(cargosData, `Inicialização de cargos para novo servidor: ${guild.name}`);
    await pedidos.salvar(pedidosData, `Inicialização de pedidos para novo servidor: ${guild.name}`);
    return;
  }
  
  // Verificar se já está pendente
  if (isServerPending(guild.id)) {
    console.log(`⏳ Servidor ${guild.name} já está pendente de autorização`);
    return;
  }
  
  // Enviar solicitação de autorização
  console.log(`🔐 Enviando solicitação de autorização para ${guild.name}`);
  await sendAuthorizationRequest(guild);
});

// ======= Evento quando o bot sai de um servidor =======
client.on(Events.GuildDelete, async (guild) => {
  console.log(`👋 Bot removido do servidor: ${guild.name} (${guild.id})`);

  // Opcional: manter dados para caso o bot retorne
  // Para limpar dados completamente, descomente as linhas abaixo:
  /*
  delete configData[guild.id];
  delete cargosData[guild.id];
  delete pedidosData[guild.id];
  saveJSON(configFile, configData);
  saveJSON(cargosFile, cargosData);
  saveJSON(pedidosFile, pedidosData);
  */
});

// ======= Slash commands =======
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId } = interaction;
  
  // Verificar se o servidor está autorizado
  if (!isServerAuthorized(guildId)) {
    const unauthorizedEmbed = new EmbedBuilder()
      .setColor(CORES.AVISO)
      .setTitle("⚠️ Servidor Não Autorizado")
      .setDescription(
        "Este servidor ainda não foi autorizado a usar o bot.\n\n" +
        "O dono do bot foi notificado e analisará a solicitação em breve."
      )
      .setFooter({ text: "Sistema de Autorização de Servidores" });
    
    return interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
  }

  // Comandos especiais para admins do bot
  if (commandName === "listar-servidores" || commandName === "autorizar-servidor") {
    if (!isAuthorizedUser(interaction.user.id)) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Acesso Negado")
        .setDescription("Apenas administradores do bot podem usar este comando.");
      
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    if (commandName === "listar-servidores") {
      const autorizados = Object.keys(servidoresData.autorizados);
      const pendentes = Object.keys(servidoresData.pendentes);
      
      const embed = new EmbedBuilder()
        .setColor(CORES.INFO)
        .setTitle("🌐 Status dos Servidores")
        .setDescription("Lista de servidores autorizados e pendentes")
        .addFields(
          {
            name: "✅ Servidores Autorizados",
            value: autorizados.length > 0 
              ? autorizados.map(id => {
                  const guild = client.guilds.cache.get(id);
                  return guild ? `• ${guild.name} (${id})` : `• Servidor Desconhecido (${id})`;
                }).join('\n')
              : "Nenhum servidor autorizado",
            inline: false
          },
          {
            name: "⏳ Servidores Pendentes",
            value: pendentes.length > 0
              ? pendentes.map(id => {
                  const guildData = servidoresData.pendentes[id];
                  return `• ${guildData.name} (${id})`;
                }).join('\n')
              : "Nenhum servidor pendente",
            inline: false
          }
        )
        .setFooter({ text: `Total: ${autorizados.length} autorizados, ${pendentes.length} pendentes` });
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (commandName === "autorizar-servidor") {
      const serverId = interaction.options.getString("servidor-id");
      const guild = client.guilds.cache.get(serverId);
      
      if (!guild) {
        const errorEmbed = new EmbedBuilder()
          .setColor(CORES.ERRO)
          .setTitle("❌ Servidor não Encontrado")
          .setDescription("O servidor não foi encontrado ou o bot não está nele.");
        
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
      
      if (isServerAuthorized(serverId)) {
        const warningEmbed = new EmbedBuilder()
          .setColor(CORES.AVISO)
          .setTitle("⚠️ Servidor já Autorizado")
          .setDescription(`O servidor **${guild.name}** já está autorizado.`);
        
        return interaction.reply({ embeds: [warningEmbed], ephemeral: true });
      }
      
      // Autorizar servidor
      const owner = await guild.fetchOwner();
      const guildData = {
        name: guild.name,
        id: guild.id,
        ownerId: owner.id,
        ownerTag: owner.user.tag,
        memberCount: guild.memberCount,
        createdAt: guild.createdAt.toISOString()
      };
      
      authorizeServer(serverId, guildData);
      
      // Inicializar dados do servidor
      getServerConfig(serverId);
      getServerCargos(serverId);
      getServerPedidos(serverId);
      
      // Salvar dados iniciais
      await config.salvar(configData, `Servidor autorizado manualmente: ${guild.name}`);
      await cargos.salvar(cargosData, `Inicialização de cargos para servidor: ${guild.name}`);
      await pedidos.salvar(pedidosData, `Inicialização de pedidos para servidor: ${guild.name}`);
      
      const successEmbed = new EmbedBuilder()
        .setColor(CORES.SUCESSO)
        .setTitle("✅ Servidor Autorizado")
        .setDescription(`O servidor **${guild.name}** foi autorizado manualmente!`)
        .addFields(
          { name: "🏠 Servidor", value: guild.name, inline: true },
          { name: "🆔 ID", value: guild.id, inline: true },
          { name: "👥 Membros", value: guild.memberCount.toString(), inline: true }
        );
      
      return interaction.reply({ embeds: [successEmbed], ephemeral: true });
    }
    
    return;
  }
  
  // Verificação de permissão para comandos normais
  const isAdmin = interaction.member.permissions.has(
    PermissionsBitField.Flags.Administrator,
  );
  if (!isAdmin) {
    const errorEmbed = new EmbedBuilder()
      .setColor(CORES.ERRO)
      .setTitle("❌ Acesso Negado")
      .setDescription("Você não possui permissão para usar este comando.")
      .setFooter({ text: "Permissão necessária: Administrador" });

    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }

  if (commandName === "config-placar") {
    const tipo = interaction.options.getString("tipo");
    
    const resultado = await configurarTipoPlacar(guildId, tipo);
    
    if (!resultado.sucesso) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Erro na Configuração")
        .setDescription(resultado.erro);
      
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    const tipoTexto = tipo === PLACAR_CONFIG.SEMANAL ? 'Semanal' : 'Mensal';
    const resetTexto = tipo === PLACAR_CONFIG.SEMANAL ? 
      'toda segunda-feira às 00h' : 
      'todo dia 1º do mês às 00h';
    
    const successEmbed = new EmbedBuilder()
      .setColor(CORES.SUCESSO)
      .setTitle("📊 Placar Configurado")
      .setDescription(`O placar foi configurado como **${tipoTexto}**`)
      .addFields(
        { name: "🔄 Reset Automático", value: resetTexto, inline: true },
        { name: "📍 Canal", value: "O canal #placar será criado automaticamente", inline: true }
      )
      .setFooter({ text: "O placar será atualizado automaticamente a cada recrutamento" });
    
    await interaction.reply({ embeds: [successEmbed] });
    
    // Atualiza o placar imediatamente
    await atualizarMensagemPlacar(interaction.guild);
  }

  if (commandName === "configurar-canais") {
    const pedirTag = interaction.options.getChannel("pedir-tag");
    const aprovarTag = interaction.options.getChannel("aprovar-tag");
    const resultados = interaction.options.getChannel("resultados");
    const placar = interaction.options.getChannel("placar");
    const tipoPlacar = interaction.options.getString("tipo-placar");

    const serverConfig = getServerConfig(guildId);
    serverConfig.pedirTagId = pedirTag.id;
    serverConfig.aprovarTagId = aprovarTag.id;
    serverConfig.resultadosId = resultados.id;
    
    // Configurar placar se fornecido
    if (placar) {
      serverConfig.placarId = placar.id;
      
      // Configurar tipo do placar se fornecido
      if (tipoPlacar) {
        const resultado = await configurarTipoPlacar(guildId, tipoPlacar);
        if (!resultado.sucesso) {
          const errorEmbed = new EmbedBuilder()
            .setColor(CORES.ERRO)
            .setTitle("❌ Erro na Configuração do Placar")
            .setDescription(resultado.erro);
          
          return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      }
    }
    
    await config.salvar(configData, `Configuração atualizada para servidor ${interaction.guild.name}`);

    let successDescription = "Os canais do sistema foram configurados com sucesso!";
    if (placar) {
      successDescription += `\n\n🏆 **Placar configurado**: ${tipoPlacar ? `Tipo ${tipoPlacar}` : 'Padrão semanal'}`;
    }
    
    const successEmbed = new EmbedBuilder()
      .setColor(CORES.SUCESSO)
      .setTitle("✅ Canais Configurados")
      .setDescription(successDescription)
      .addFields(
        {
          name: "📩 Canal de Solicitações",
          value: `${pedirTag}`,
          inline: true,
        },
        { name: "⚖️ Canal de Aprovação", value: `${aprovarTag}`, inline: true },
        {
          name: "📊 Canal de Resultados",
          value: `${resultados}`,
          inline: true,
        },
      )
      .setFooter({ text: "Sistema pronto para uso!" });
    
    // Adicionar campo do placar se configurado
    if (placar) {
      successEmbed.addFields({
        name: "🏆 Canal do Placar",
        value: `${placar} (${tipoPlacar || 'semanal'})`,
        inline: true,
      });
    }

    await interaction.reply({ embeds: [successEmbed] });

    // Configurar mensagem no canal de solicitações
    await configurarCanalPedirTag(interaction.guild);
    
    // Configurar placar se fornecido
    if (placar) {
      await atualizarMensagemPlacar(interaction.guild);
    }
  }

  if (commandName === "criar-canais") {
    const guild = interaction.guild;

    await interaction.deferReply();

    try {
      // Criar canais
      const pedirTag = await guild.channels.create({
        name: "pedir-tag",
        type: ChannelType.GuildText,
        topic: "📋 Canal para solicitação de tags de recrutamento",
      });

      const aprovarTag = await guild.channels.create({
        name: "aprovar-tag",
        type: ChannelType.GuildText,
        topic: "⚖️ Canal para aprovação de tags de recrutamento",
      });

      const resultados = await guild.channels.create({
        name: "resultados-rec",
        type: ChannelType.GuildText,
        topic: "📊 Resultados dos processos de recrutamento",
      });

      const placar = await guild.channels.create({
        name: "placar",
        type: ChannelType.GuildText,
        topic: "🏆 Placar de recrutamentos - Atualizado automaticamente",
      });

      // Salvar configuração
      const serverConfig = getServerConfig(guildId);
      serverConfig.pedirTagId = pedirTag.id;
      serverConfig.aprovarTagId = aprovarTag.id;
      serverConfig.resultadosId = resultados.id;
      serverConfig.placarId = placar.id;
      await config.salvar(configData, `Canais criados automaticamente para servidor ${guild.name}`);
      
      // Configurar placar como semanal por padrão
      await configurarTipoPlacar(guildId, 'semanal');

      const successEmbed = new EmbedBuilder()
        .setColor(CORES.SUCESSO)
        .setTitle("🏗️ Canais Criados")
        .setDescription(
          "Todos os canais foram criados e configurados automaticamente!\n\n🏆 **Placar configurado como semanal** (use `/config-placar` para alterar)",
        )
        .addFields(
          {
            name: "📩 Canal de Solicitações",
            value: `${pedirTag}`,
            inline: true,
          },
          {
            name: "⚖️ Canal de Aprovação",
            value: `${aprovarTag}`,
            inline: true,
          },
          {
            name: "📊 Canal de Resultados",
            value: `${resultados}`,
            inline: true,
          },
          {
            name: "🏆 Canal do Placar",
            value: `${placar} (semanal)`,
            inline: true,
          },
        )
        .setFooter({ text: "Sistema pronto para uso!" });

      await interaction.editReply({ embeds: [successEmbed] });

      // Configurar mensagem no canal de solicitações
      await configurarCanalPedirTag(guild);
      
      // Configurar placar
      await atualizarMensagemPlacar(guild);
    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Erro ao Criar Canais")
        .setDescription(
          "Ocorreu um erro ao criar os canais. Verifique as permissões do bot.",
        )
        .addFields({ name: "Erro", value: error.message });

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  if (commandName === "status-sistema") {
    const guild = interaction.guild;
    const pedirTagId = getPedirTagId(guildId);
    const aprovarTagId = getAprovarTagId(guildId);
    const resultadosId = getResultadosId(guildId);
    const serverCargos = getServerCargos(guildId);
    const serverPedidos = getServerPedidos(guildId);
    const placarId = serverConfig.placarId;

    const pedirTag = pedirTagId ? guild.channels.cache.get(pedirTagId) : null;
    const aprovarTag = aprovarTagId
      ? guild.channels.cache.get(aprovarTagId)
      : null;
    const resultados = resultadosId
      ? guild.channels.cache.get(resultadosId)
      : null;
    const placar = placarId ? guild.channels.cache.get(placarId) : null;

    const statusEmbed = new EmbedBuilder()
      .setColor(
        pedirTag && aprovarTag && resultados ? CORES.SUCESSO : CORES.AVISO,
      )
      .setTitle("📊 Status do Sistema")
      .setDescription("Estado atual da configuração do sistema de recrutamento")
      .addFields(
        {
          name: "📩 Canal de Solicitações",
          value: pedirTag ? `✅ ${pedirTag}` : "❌ Não configurado",
          inline: true,
        },
        {
          name: "⚖️ Canal de Aprovação",
          value: aprovarTag ? `✅ ${aprovarTag}` : "❌ Não configurado",
          inline: true,
        },
        {
          name: "📊 Canal de Resultados",
          value: resultados ? `✅ ${resultados}` : "❌ Não configurado",
          inline: true,
        },
        {
          name: "🏆 Canal do Placar",
          value: placar ? `✅ ${placar}` : "❌ Não configurado",
          inline: true,
        },
        {
          name: "🏷️ Cargos Configurados",
          value: `${Object.keys(serverCargos).length} cargo(s)`,
          inline: true,
        },
        {
          name: "📋 Pedidos Pendentes",
          value: `${Object.values(serverPedidos).filter((p) => p.status === "pendente").length} pedido(s)`,
          inline: true,
        },
      )
      .setFooter({
        text:
          pedirTag && aprovarTag && resultados
            ? "Sistema funcionando normalmente"
            : "Use /configurar-canais ou /criar-canais para configurar",
      });

    await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
  }

  if (commandName === "config-placar") {
    const tipo = interaction.options.getString("tipo");
    
    const resultado = await configurarTipoPlacar(guildId, tipo);
    
    if (!resultado.sucesso) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Erro na Configuração")
        .setDescription(resultado.erro);
      
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    const tipoTexto = tipo === 'semanal' ? 'Semanal (reset toda segunda-feira)' : 'Mensal (reset todo dia 1º)';
    
    const successEmbed = new EmbedBuilder()
      .setColor(CORES.SUCESSO)
      .setTitle("🏆 Placar Configurado")
      .setDescription(`O placar foi configurado como **${tipoTexto}**!`)
      .addFields(
        {
          name: "📊 Tipo Selecionado",
          value: tipoTexto,
          inline: true,
        },
        {
          name: "🔄 Próximo Reset",
          value: tipo === 'semanal' 
            ? "Próxima segunda-feira às 00:00" 
            : "Dia 1º do próximo mês às 00:00",
          inline: true,
        }
      )
      .setFooter({ text: "O placar será atualizado automaticamente a cada recrutamento" });
    
    await interaction.reply({ embeds: [successEmbed] });
    
    // Atualizar mensagem do placar
    await atualizarMensagemPlacar(interaction.guild);
  }

  if (commandName === "adicionar-cargo") {
    const role = interaction.options.getRole("cargo");
    const formato = interaction.options.getString("formato");
    const serverCargos = getServerCargos(guildId);

    if (serverCargos[role.id]) {
      const warningEmbed = new EmbedBuilder()
        .setColor(CORES.AVISO)
        .setTitle("⚠️ Cargo já Configurado")
        .setDescription(
          `O cargo **${role.name}** já possui configuração.\n\nUse \`/editar-cargo\` para alterar.`,
        )
        .addFields({
          name: "Formato Atual",
          value: `\`${serverCargos[role.id]}\``,
        });

      return interaction.reply({ embeds: [warningEmbed], ephemeral: true });
    }

    serverCargos[role.id] = formato;
    await cargos.salvar(cargosData, `Novo cargo adicionado: ${role.name} - ${formato}`);

    const successEmbed = new EmbedBuilder()
      .setColor(CORES.SUCESSO)
      .setTitle("✅ Cargo Configurado")
      .setDescription(`O cargo **${role.name}** foi configurado com sucesso!`)
      .addFields(
        { name: "📝 Formato Aplicado", value: `\`${formato}\``, inline: true },
        {
          name: "🎨 Posição do Cargo",
          value: `#${role.position}`,
          inline: true,
        },
      )
      .setFooter({
        text: "O formato será aplicado automaticamente aos membros",
      });

    await interaction.reply({ embeds: [successEmbed] });
  }

  if (commandName === "editar-cargo") {
    const role = interaction.options.getRole("cargo");
    const formato = interaction.options.getString("formato");
    const serverCargos = getServerCargos(guildId);

    if (!serverCargos[role.id]) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Cargo não Encontrado")
        .setDescription(
          `O cargo **${role.name}** ainda não foi configurado.\n\nUse \`/adicionar-cargo\` primeiro.`,
        );

      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const formatoAntigo = serverCargos[role.id];
    serverCargos[role.id] = formato;
    await cargos.salvar(cargosData, `Cargo editado: ${role.name} - ${formatoAntigo} → ${formato}`);

    const successEmbed = new EmbedBuilder()
      .setColor(CORES.INFO)
      .setTitle("✏️ Cargo Atualizado")
      .setDescription(`O cargo **${role.name}** foi atualizado com sucesso!`)
      .addFields(
        {
          name: "📝 Formato Anterior",
          value: `\`${formatoAntigo}\``,
          inline: true,
        },
        { name: "🆕 Formato Novo", value: `\`${formato}\``, inline: true },
      )
      .setFooter({ text: "Atualizando nomes dos membros..." });

    await interaction.reply({ embeds: [successEmbed] });

    // Atualizar todos os membros com esse cargo
    const membros = await interaction.guild.members.fetch();
    let atualizados = 0;
    for (const [, m] of membros) {
      if (m.roles.cache.has(role.id)) {
        await atualizarNickname(m);
        atualizados++;
      }
    }

    // Atualizar a mensagem com estatísticas
    successEmbed.addFields({
      name: "📊 Membros Atualizados",
      value: `${atualizados} membros tiveram seus nomes atualizados`,
      inline: false,
    });

    await interaction.editReply({ embeds: [successEmbed] });
  }

  if (commandName === "listar-cargos") {
    const guild = interaction.guild;
    const serverCargos = getServerCargos(guildId);

    if (Object.keys(serverCargos).length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(CORES.NEUTRO)
        .setTitle("📋 Lista de Cargos")
        .setDescription(
          "Nenhum cargo configurado ainda.\n\nUse `/adicionar-cargo` para começar.",
        );

      return interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(CORES.PRINCIPAL)
      .setTitle("📋 Cargos Configurados")
      .setDescription("Lista de todos os cargos com formatação:")
      .setFooter({
        text: `Total: ${Object.keys(serverCargos).length} cargo(s)`,
      });

    for (const [roleId, formato] of Object.entries(serverCargos)) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        embed.addFields({
          name: `🏷️ ${role.name}`,
          value: `**Formato:** \`${formato}\`\n**Posição:** #${role.position}`,
          inline: true,
        });
      }
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === "remover-cargo") {
    const role = interaction.options.getRole("cargo");
    const serverCargos = getServerCargos(guildId);

    if (!serverCargos[role.id]) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Cargo não Encontrado")
        .setDescription(`O cargo **${role.name}** não está configurado.`);

      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const formatoRemovido = serverCargos[role.id];
    delete serverCargos[role.id];
    await cargos.salvar(cargosData, `Cargo removido: ${role.name} - ${formatoRemovido}`);

    const successEmbed = new EmbedBuilder()
      .setColor(CORES.SUCESSO)
      .setTitle("🗑️ Cargo Removido")
      .setDescription(`A configuração do cargo **${role.name}** foi removida.`)
      .addFields({
        name: "📝 Formato Removido",
        value: `\`${formatoRemovido}\``,
      })
      .setFooter({ text: "Os membros manterão seus nomes atuais" });

    await interaction.reply({ embeds: [successEmbed] });
  }
});

// ======= Modal para solicitar tag =======
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  // Verificar botões de autorização de servidor
  if (interaction.customId.startsWith("authorize_server_") || interaction.customId.startsWith("deny_server_")) {
    // Verificar se o usuário tem permissão
    if (!isAuthorizedUser(interaction.user.id)) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Acesso Negado")
        .setDescription("Você não possui permissão para autorizar servidores.");
      
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    const [action, , guildId] = interaction.customId.split("_");
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Servidor não Encontrado")
        .setDescription("O servidor não foi encontrado ou o bot foi removido dele.");
      
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    if (action === "authorize") {
      const guildData = servidoresData.pendentes[guildId];
      if (!guildData) {
        const errorEmbed = new EmbedBuilder()
          .setColor(CORES.ERRO)
          .setTitle("❌ Solicitação não Encontrada")
          .setDescription("A solicitação para este servidor não foi encontrada.");
        
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
      
      // Autorizar servidor
      authorizeServer(guildId, guildData);
      
      // Inicializar dados do servidor
      getServerConfig(guildId);
      getServerCargos(guildId);
      getServerPedidos(guildId);
      
      // Salvar dados iniciais
      await config.salvar(configData, `Servidor autorizado: ${guild.name}`);
      await cargos.salvar(cargosData, `Inicialização de cargos: ${guild.name}`);
      await pedidos.salvar(pedidosData, `Inicialização de pedidos: ${guild.name}`);
      
      const successEmbed = new EmbedBuilder()
        .setColor(CORES.SUCESSO)
        .setTitle("✅ Servidor Autorizado")
        .setDescription(`O servidor **${guild.name}** foi autorizado com sucesso!`)
        .addFields(
          { name: "🏠 Servidor", value: guild.name, inline: true },
          { name: "🆔 ID", value: guild.id, inline: true },
          { name: "👥 Membros", value: guild.memberCount.toString(), inline: true }
        )
        .setThumbnail(guild.iconURL() || null)
        .setFooter({ text: "O bot agora está ativo neste servidor" });
      
      await interaction.reply({ embeds: [successEmbed] });
      
      // Configurar sistema no servidor se possível
      try {
        await configurarCanalPedirTag(guild);
      } catch (error) {
        console.log(`Não foi possível configurar automaticamente o servidor ${guild.name}`);
      }
      
      console.log(`✅ Servidor ${guild.name} (${guild.id}) foi autorizado por ${interaction.user.tag}`);
      
    } else if (action === "deny") {
      // Negar servidor
      denyServer(guildId);
      
      const denyEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Servidor Negado")
        .setDescription(`A solicitação do servidor **${guild.name}** foi negada.`)
        .addFields(
          { name: "🏠 Servidor", value: guild.name, inline: true },
          { name: "🆔 ID", value: guild.id, inline: true }
        )
        .setFooter({ text: "O bot permanecerá inativo neste servidor" });
      
      await interaction.reply({ embeds: [denyEmbed] });
      
      console.log(`❌ Servidor ${guild.name} (${guild.id}) foi negado por ${interaction.user.tag}`);
    }
    
    return;
  }
  
  if (interaction.customId !== "abrir_modal_tag") return;

  const guildId = interaction.guildId;
  
  // Verificar se o servidor está autorizado
  if (!isServerAuthorized(guildId)) {
    const unauthorizedEmbed = new EmbedBuilder()
      .setColor(CORES.AVISO)
      .setTitle("⚠️ Servidor Não Autorizado")
      .setDescription(
        "Este servidor ainda não foi autorizado a usar o bot.\n\n" +
        "O dono do bot foi notificado e analisará a solicitação em breve."
      )
      .setFooter({ text: "Sistema de Autorização de Servidores" });
    
    return interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
  }
  
  const serverPedidos = getServerPedidos(guildId);

  // Verificar se o sistema está configurado
  if (
    !getPedirTagId(guildId) ||
    !getAprovarTagId(guildId) ||
    !getResultadosId(guildId)
  ) {
    const errorEmbed = new EmbedBuilder()
      .setColor(CORES.ERRO)
      .setTitle("❌ Sistema não Configurado")
      .setDescription(
        "O sistema de recrutamento não está configurado.\n\nContate um administrador.",
      );

    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }

  // Verificar se o usuário já tem pedido pendente
  if (serverPedidos[interaction.user.id]) {
    const warningEmbed = new EmbedBuilder()
      .setColor(CORES.AVISO)
      .setTitle("⚠️ Solicitação já Enviada")
      .setDescription(
        "Você já possui uma solicitação em andamento.\n\nAguarde a análise da equipe de recrutamento.",
      )
      .setFooter({ text: "Tempo médio de resposta: 24 horas" });

    return interaction.reply({ embeds: [warningEmbed], ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId("modal_pedir_tag")
    .setTitle("🏷️ Solicitação de TAG");

  const nomeInput = new TextInputBuilder()
    .setCustomId("nome_tag")
    .setLabel("👤 Nome Completo")
    .setPlaceholder("Digite seu nome completo aqui...")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const idInput = new TextInputBuilder()
    .setCustomId("id_tag")
    .setLabel("🆔 Número de Identificação")
    .setPlaceholder("Digite seu ID/número aqui...")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nomeInput),
    new ActionRowBuilder().addComponents(idInput),
  );

  await interaction.showModal(modal);
});

// ======= Processar modal =======
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== "modal_pedir_tag") return;
  
  // Verificar se o servidor está autorizado
  if (!isServerAuthorized(interaction.guildId)) {
    const unauthorizedEmbed = new EmbedBuilder()
      .setColor(CORES.AVISO)
      .setTitle("⚠️ Servidor Não Autorizado")
      .setDescription("Este servidor não está autorizado a usar o bot.");
    
    return interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
  }

  const nome = interaction.fields.getTextInputValue("nome_tag").trim();
  const id = interaction.fields.getTextInputValue("id_tag").trim();
  const user = interaction.user;
  const guildId = interaction.guildId;
  const serverPedidos = getServerPedidos(guildId);

  // Validações básicas
  if (!nome || nome.length < 2) {
    const errorEmbed = new EmbedBuilder()
      .setColor(CORES.ERRO)
      .setTitle("❌ Nome Inválido")
      .setDescription("O nome deve ter pelo menos 2 caracteres.");

    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }

  if (!id || id.length < 1) {
    const errorEmbed = new EmbedBuilder()
      .setColor(CORES.ERRO)
      .setTitle("❌ ID Inválido")
      .setDescription("O ID não pode estar vazio.");

    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }

  // Salvar pedido
  serverPedidos[user.id] = {
    nome,
    id,
    timestamp: Date.now(),
    status: "pendente",
  };
  await pedidos.salvar(pedidosData, `Novo pedido: ${nome} - ID: ${id}`);

  // Enviar para aprovação
  const aprovarTagId = getAprovarTagId(guildId);
  const aprovarChannel = await interaction.guild.channels.fetch(aprovarTagId);

  const approvalEmbed = new EmbedBuilder()
    .setColor(CORES.INFO)
    .setTitle("📥 Nova Solicitação de TAG")
    .setDescription("Uma nova solicitação de tag foi enviada para análise.")
    .addFields(
      { name: "👤 Usuário", value: `${user} (${user.tag})`, inline: false },
      { name: "📝 Nome Informado", value: `\`${nome}\``, inline: true },
      { name: "🆔 ID Informado", value: `\`${id}\``, inline: true },
      {
        name: "📅 Data/Hora",
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      },
    )
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: `ID do Usuário: ${user.id}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aprovar_${user.id}`)
      .setLabel("Aprovar")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`reprovar_${user.id}`)
      .setLabel("Reprovar")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );

  await aprovarChannel.send({ embeds: [approvalEmbed], components: [row] });

  // Resposta para o usuário
  const confirmEmbed = new EmbedBuilder()
    .setColor(CORES.SUCESSO)
    .setTitle("✅ Solicitação Enviada")
    .setDescription("Sua solicitação de TAG foi enviada com sucesso!")
    .addFields(
      { name: "📝 Nome", value: nome, inline: true },
      { name: "🆔 ID", value: id, inline: true },
      {
        name: "⏱️ Próximos Passos",
        value: "Aguarde a análise da equipe\n**Tempo estimado:** até 24 horas",
        inline: false,
      },
    )
    .setFooter({ text: "Você será notificado quando houver uma resposta" });

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

  // Aplicar nick temporário se não houver cargo formatado
  await atualizarNickname(interaction.member);
});

// ======= Botões de aprovação/reprovação =======
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const [acao, userId] = interaction.customId.split("_");
  if (!["aprovar", "reprovar"].includes(acao)) return;
  
  // Verificar se o servidor está autorizado
  if (!isServerAuthorized(interaction.guildId)) {
    const unauthorizedEmbed = new EmbedBuilder()
      .setColor(CORES.AVISO)
      .setTitle("⚠️ Servidor Não Autorizado")
      .setDescription("Este servidor não está autorizado a usar o bot.");
    
    return interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
  }

  const guild = interaction.guild;
  const guildId = guild.id;
  const serverPedidos = getServerPedidos(guildId);
  const serverCargos = getServerCargos(guildId);
  const membro = await guild.members.fetch(userId).catch(() => null);

  if (!membro) {
    const errorEmbed = new EmbedBuilder()
      .setColor(CORES.ERRO)
      .setTitle("❌ Membro não Encontrado")
      .setDescription("O membro não foi encontrado no servidor.");

    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }

  if (!serverPedidos[userId]) {
    const errorEmbed = new EmbedBuilder()
      .setColor(CORES.ERRO)
      .setTitle("❌ Solicitação não Encontrada")
      .setDescription("Não foi encontrada uma solicitação para este usuário.");

    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }

  if (acao === "aprovar") {
    // Mostrar menu de cargos
    const options = Object.keys(serverCargos)
      .map((cargoId) => {
        const role = guild.roles.cache.get(cargoId);
        if (!role) return null;
        return {
          label: role.name,
          value: cargoId,
          description: `Formato: ${serverCargos[cargoId]}`,
          emoji: "🏷️",
        };
      })
      .filter(Boolean);

    if (options.length === 0) {
      const errorEmbed = new EmbedBuilder()
        .setColor(CORES.ERRO)
        .setTitle("❌ Nenhum Cargo Configurado")
        .setDescription(
          "Nenhum cargo foi configurado ainda.\n\nUse `/adicionar-cargo` primeiro.",
        );

      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`cargo_${userId}_${interaction.user.id}`)
      .setPlaceholder("🎯 Selecione o cargo para aprovar")
      .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(menu);

    const selectEmbed = new EmbedBuilder()
      .setColor(CORES.PRINCIPAL)
      .setTitle("🎯 Selecionar Cargo")
      .setDescription(
        `Selecione o cargo apropriado para **${membro.displayName}**`,
      )
      .addFields({
        name: "👤 Candidato",
        value: `${membro} (${membro.user.tag})`,
        inline: true,
      });

    return interaction.reply({
      embeds: [selectEmbed],
      components: [row],
      ephemeral: true,
    });
  }

  if (acao === "reprovar") {
    const modal = new ModalBuilder()
      .setCustomId(`reprovar_modal_${userId}_${interaction.user.id}`)
      .setTitle("❌ Motivo da Reprovação");

    const motivoInput = new TextInputBuilder()
      .setCustomId("motivo_reprovacao")
      .setLabel("📝 Motivo da Reprovação")
      .setPlaceholder("Digite o motivo da reprovação...")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));
    await interaction.showModal(modal);
  }
});

// ======= Modal de reprovação =======
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("reprovar_modal_")) return;
  
  // Verificar se o servidor está autorizado
  if (!isServerAuthorized(interaction.guildId)) {
    return interaction.reply({
      content: "❌ Servidor não autorizado.",
      ephemeral: true,
    });
  }

  const [, , userId, responsavelId] = interaction.customId.split("_");
  const motivo = interaction.fields.getTextInputValue("motivo_reprovacao");

  const guild = interaction.guild;
  const guildId = guild.id;
  const serverPedidos = getServerPedidos(guildId);
  const membro = await guild.members.fetch(userId).catch(() => null);
  const responsavel = await guild.members
    .fetch(responsavelId)
    .catch(() => null);

  if (!membro || !responsavel) {
    return interaction.reply({
      content: "❌ Erro ao processar reprovação.",
      ephemeral: true,
    });
  }

  // Atualizar status do pedido
  if (serverPedidos[userId]) {
    serverPedidos[userId].status = "reprovado";
    serverPedidos[userId].motivo = motivo;
    serverPedidos[userId].responsavel = responsavelId;
    await pedidos.salvar(pedidosData, `Pedido reprovado: ${serverPedidos[userId].nome} - ID: ${serverPedidos[userId].id}`);
  }

  // Registrar no canal de resultados
  const resultadosId = getResultadosId(guildId);
  const resultados = await guild.channels.fetch(resultadosId);
  const resultadoEmbed = new EmbedBuilder()
    .setColor(CORES.ERRO)
    .setTitle("❌ Candidato Reprovado")
    .addFields(
      {
        name: "👤 Candidato",
        value: `${membro} (${membro.user.tag})`,
        inline: false,
      },
      { name: "👮‍♂️ Responsável", value: `${responsavel}`, inline: true },
      {
        name: "📅 Data/Hora",
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: true,
      },
      { name: "📝 Motivo", value: motivo, inline: false },
    )
    .setThumbnail(membro.user.displayAvatarURL())
    .setFooter({ text: "Sistema de Recrutamento" });

  await resultados.send({ embeds: [resultadoEmbed] });

  const confirmEmbed = new EmbedBuilder()
    .setColor(CORES.SUCESSO)
    .setTitle("✅ Reprovação Registrada")
    .setDescription(
      `A reprovação de **${membro.displayName}** foi registrada com sucesso.`,
    )
    .addFields({ name: "📝 Motivo", value: motivo });

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

  // Tentar enviar DM para o usuário
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(CORES.ERRO)
      .setTitle("❌ Solicitação de TAG - Reprovada")
      .setDescription(
        `Sua solicitação de TAG no servidor **${guild.name}** foi reprovada.`,
      )
      .addFields(
        { name: "📝 Motivo", value: motivo, inline: false },
        {
          name: "🔄 Próximos Passos",
          value:
            "Você pode fazer uma nova solicitação após corrigir os pontos mencionados.",
          inline: false,
        },
      )
      .setFooter({ text: guild.name, iconURL: guild.iconURL() });

    await membro.user.send({ embeds: [dmEmbed] });
  } catch {
    console.log(
      `Não foi possível enviar DM para ${membro.user.tag} no servidor ${guild.name}`,
    );
  }
});

// ======= Menu de seleção de cargo (aprovação) =======
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  const [acao, userId, responsavelId] = interaction.customId.split("_");
  if (acao !== "cargo") return;
  
  // Verificar se o servidor está autorizado
  if (!isServerAuthorized(interaction.guildId)) {
    return interaction.reply({
      content: "❌ Servidor não autorizado.",
      ephemeral: true,
    });
  }

  const guild = interaction.guild;
  const guildId = guild.id;
  const serverPedidos = getServerPedidos(guildId);
  const serverCargos = getServerCargos(guildId);
  const membro = await guild.members.fetch(userId).catch(() => null);
  const responsavel = await guild.members
    .fetch(responsavelId)
    .catch(() => null);

  if (!membro || !responsavel) {
    return interaction.reply({
      content: "❌ Erro ao processar aprovação.",
      ephemeral: true,
    });
  }

  const cargoId = interaction.values[0];
  const role = guild.roles.cache.get(cargoId);

  if (!role) {
    return interaction.reply({
      content: "❌ Cargo inválido.",
      ephemeral: true,
    });
  }

  try {
    // Conceder cargo
    await membro.roles.add(cargoId);

    // Atualizar nickname
    await atualizarNickname(membro);

    // Atualizar status do pedido
    if (serverPedidos[userId]) {
      serverPedidos[userId].status = "aprovado";
      serverPedidos[userId].cargo = cargoId;
      serverPedidos[userId].responsavel = responsavelId;
      await pedidos.salvar(pedidosData, `Pedido aprovado: ${serverPedidos[userId].nome} - ID: ${serverPedidos[userId].id}`);
      
      // Adicionar ao placar de recrutamentos
      const nomeRecrutado = serverPedidos[userId].nome;
      const countRecrutamentos = await adicionarRecrutamento(guildId, responsavelId, nomeRecrutado);
      console.log(`📊 Recrutamento adicionado ao placar: ${nomeRecrutado} por ${responsavel.displayName} (total: ${countRecrutamentos})`);
      
      // Atualizar placar
      await atualizarMensagemPlacar(guild);
    }

    // Registrar no canal de resultados
    const resultadosId = getResultadosId(guildId);
    const resultados = await guild.channels.fetch(resultadosId);
    
    // Adicionar ao placar de recrutamentos
    const { adicionarRecrutamento } = require('./placar-manager.js');
    const countRecrutamentos = await adicionarRecrutamento(guildId, responsavelId, membro.displayName);
    console.log(`🏆 Recrutamento adicionado ao placar: ${membro.displayName} por ${responsavel.displayName} (total: ${countRecrutamentos})`);
    
    const resultadoEmbed = new EmbedBuilder()
      .setColor(CORES.SUCESSO)
      .setTitle("✅ Candidato Aprovado")
      .addFields(
        {
          name: "👤 Novo Membro",
          value: `${membro} (${membro.user.tag})`,
          inline: false,
        },
        { name: "🏷️ Cargo Concedido", value: `${role}`, inline: true },
        { name: "👮‍♂️ Responsável", value: `${responsavel}`, inline: true },
        {
          name: "📅 Data/Hora",
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true,
        },
        {
          name: "📝 Formato Aplicado",
          value: `\`${serverCargos[cargoId]}\``,
          inline: false,
        },
        {
          name: "🏆 Recrutamentos do Responsável",
          value: `${countRecrutamentos} recrutamento${countRecrutamentos !== 1 ? 's' : ''}`,
          inline: true,
        },
      )
      .setThumbnail(membro.user.displayAvatarURL())
      .setFooter({ text: "Sistema de Recrutamento • Bem-vindo!" });

    await resultados.send({ embeds: [resultadoEmbed] });
    
    // Atualizar placar
    await atualizarMensagemPlacar(guild);

    const confirmEmbed = new EmbedBuilder()
      .setColor(CORES.SUCESSO)
      .setTitle("✅ Aprovação Concluída")
      .setDescription(`**${membro.displayName}** foi aprovado com sucesso!`)
      .addFields(
        { name: "🏷️ Cargo Adicionado", value: `${role}`, inline: true },
        {
          name: "📝 Nick Atualizado",
          value: membro.nickname || "Nome padrão",
          inline: true,
        },
      );

    await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

    // Tentar enviar DM de boas-vindas
    try {
      const welcomeEmbed = new EmbedBuilder()
        .setColor(CORES.SUCESSO)
        .setTitle("🎉 Parabéns! Você foi Aprovado!")
        .setDescription(
          `Sua solicitação de TAG no servidor **${guild.name}** foi aprovada!`,
        )
        .addFields(
          { name: "🏷️ Cargo Recebido", value: `${role.name}`, inline: true },
          {
            name: "📝 Seu Novo Nick",
            value: membro.nickname || membro.user.username,
            inline: true,
          },
          {
            name: "🎯 Próximos Passos",
            value:
              "Agora você faz parte oficial da nossa equipe!\nVerifique os canais disponíveis e participe das atividades.",
            inline: false,
          },
        )
        .setThumbnail(guild.iconURL())
        .setFooter({ text: `Bem-vindo ao ${guild.name}!` });

      await membro.user.send({ embeds: [welcomeEmbed] });
    } catch {
      console.log(
        `Não foi possível enviar DM de boas-vindas para ${membro.user.tag} no servidor ${guild.name}`,
      );
    }
  } catch (error) {
    console.log("Erro na aprovação:", error);

    const errorEmbed = new EmbedBuilder()
      .setColor(CORES.ERRO)
      .setTitle("❌ Erro na Aprovação")
      .setDescription(
        "Ocorreu um erro ao processar a aprovação. Verifique as permissões do bot.",
      );

    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
});

// ======= Atualização automática de nicks =======
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    // Verificar se o servidor está autorizado
    if (!isServerAuthorized(newMember.guild.id)) {
      return;
    }
    
    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());

    // Verificar se houve mudança de cargos
    let changed = false;
    if (oldRoles.size !== newRoles.size) changed = true;

    if (!changed) {
      for (const id of oldRoles) {
        if (!newRoles.has(id)) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        for (const id of newRoles) {
          if (!oldRoles.has(id)) {
            changed = true;
            break;
          }
        }
      }
    }

    if (changed) {
      await atualizarNickname(newMember);
    }
  } catch (error) {
    console.log("Erro em GuildMemberUpdate:", error);
  }
});

// ======= Login =======
client.login(TOKEN);
