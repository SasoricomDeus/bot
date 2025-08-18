// Utilitários para gerenciar interações do Discord e evitar timeouts

const TIMEOUT_LIMITE = 2500; // 2.5 segundos para responder ao Discord

// 🚀 Resposta rápida para evitar timeout do Discord
async function respostaRapida(interaction, opcoes) {
  try {
    if (interaction.replied || interaction.deferred) {
      console.log("⚠️ Interação já foi respondida ou deferida");
      return false;
    }

    // Se a operação pode demorar, defere a resposta
    if (opcoes.defer) {
      await interaction.deferReply({ flags: opcoes.ephemeral ? 64 : 0 });
      console.log("⏳ Resposta deferida");
      return true;
    }

    // Resposta imediata
    await interaction.reply({
      content: opcoes.content,
      embeds: opcoes.embeds,
      components: opcoes.components,
      flags: opcoes.ephemeral ? 64 : 0
    });
    
    console.log("✅ Resposta enviada rapidamente");
    return true;
    
  } catch (err) {
    console.error("❌ Erro ao responder interação:", err.message);
    
    // Tenta resposta de emergência
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Erro interno. Tente novamente.",
          flags: 64
        });
      }
    } catch (emergencyErr) {
      console.error("❌ Erro na resposta de emergência:", emergencyErr.message);
    }
    
    return false;
  }
}

// 📝 Atualiza resposta após operação demorada
async function atualizarResposta(interaction, opcoes) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      console.log("⚠️ Interação não foi deferida nem respondida");
      return false;
    }

    if (interaction.deferred) {
      await interaction.editReply({
        content: opcoes.content,
        embeds: opcoes.embeds,
        components: opcoes.components
      });
    } else {
      await interaction.followUp({
        content: opcoes.content,
        embeds: opcoes.embeds,
        components: opcoes.components,
        flags: opcoes.ephemeral ? 64 : 0
      });
    }
    
    console.log("✅ Resposta atualizada");
    return true;
    
  } catch (err) {
    console.error("❌ Erro ao atualizar resposta:", err.message);
    return false;
  }
}

// ⏱️ Executa operação com timeout
async function operacaoComTimeout(operacao, timeout = TIMEOUT_LIMITE) {
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: operação demorou mais que ${timeout}ms`));
    }, timeout);

    try {
      const resultado = await operacao();
      clearTimeout(timer);
      resolve(resultado);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

// 🔄 Padrão para operações que podem demorar
async function operacaoSegura(interaction, operacaoRapida, operacaoLenta, opcoes = {}) {
  try {
    // 1. Resposta rápida ou defer
    const respondeu = await respostaRapida(interaction, {
      content: opcoes.mensagemInicial || "⏳ Processando...",
      defer: opcoes.defer || false,
      ephemeral: opcoes.ephemeral || false
    });

    if (!respondeu) {
      console.log("❌ Falha ao responder rapidamente");
      return false;
    }

    // 2. Executa operação rápida (salvar localmente)
    let resultadoRapido = null;
    if (operacaoRapida) {
      try {
        resultadoRapido = await operacaoComTimeout(operacaoRapida, 1000);
        console.log("✅ Operação rápida concluída");
      } catch (err) {
        console.error("❌ Erro na operação rápida:", err.message);
      }
    }

    // 3. Atualiza com resultado da operação rápida
    if (opcoes.mensagemSucesso) {
      await atualizarResposta(interaction, {
        content: opcoes.mensagemSucesso,
        embeds: opcoes.embedsSucesso,
        components: opcoes.componentsSucesso,
        ephemeral: opcoes.ephemeral
      });
    }

    // 4. Executa operação lenta em background (commit)
    if (operacaoLenta) {
      setImmediate(async () => {
        try {
          await operacaoLenta(resultadoRapido);
          console.log("✅ Operação lenta concluída em background");
        } catch (err) {
          console.error("❌ Erro na operação lenta:", err.message);
        }
      });
    }

    return true;

  } catch (err) {
    console.error("❌ Erro na operação segura:", err.message);
    
    // Tenta resposta de erro
    try {
      await atualizarResposta(interaction, {
        content: opcoes.mensagemErro || "❌ Erro interno. Tente novamente.",
        ephemeral: true
      });
    } catch (updateErr) {
      console.error("❌ Erro ao enviar mensagem de erro:", updateErr.message);
    }
    
    return false;
  }
}

// 🧹 Limpa locks do Git antes de operações críticas
async function limparLocksGit() {
  try {
    const { limparLock } = require('./salvar.js');
    limparLock();
    console.log("🧹 Locks do Git limpos");
  } catch (err) {
    console.error("⚠️ Erro ao limpar locks:", err.message);
  }
}

module.exports = {
  respostaRapida,
  atualizarResposta,
  operacaoComTimeout,
  operacaoSegura,
  limparLocksGit,
  TIMEOUT_LIMITE
};
