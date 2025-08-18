# ROTA-BOT - Configuração no Render

## Variáveis de Ambiente Necessárias

Para que o bot funcione corretamente no Render e faça commits automáticos no GitHub, você precisa configurar as seguintes variáveis de ambiente:

### 1. DISCORD_TOKEN
- **Valor**: Token do seu bot Discord
- **Como obter**: Discord Developer Portal > Applications > Seu Bot > Bot > Token

### 2. GITHUB_TOKEN
- **Valor**: Personal Access Token do GitHub
- **Como obter**:
  1. Vá para GitHub.com > Settings > Developer settings > Personal access tokens > Tokens (classic)
  2. Clique em "Generate new token (classic)"
  3. Dê um nome descritivo (ex: "ROTA-BOT-Render")
  4. Selecione os escopos: `repo` (acesso completo aos repositórios)
  5. Clique em "Generate token"
  6. **IMPORTANTE**: Copie o token imediatamente, você não conseguirá vê-lo novamente!

### 3. REPO_URL (Opcional)
- **Valor**: `SasoriAutoPecas/bot-rota.git`
- **Descrição**: URL do repositório (já está configurado como padrão)

## Como Configurar no Render

1. Acesse seu dashboard no Render
2. Vá para o seu serviço do bot
3. Clique em "Environment"
4. Adicione as variáveis:
   - `DISCORD_TOKEN` = seu_token_discord
   - `GITHUB_TOKEN` = seu_token_github
   - `REPO_URL` = SasoriAutoPecas/bot-rota.git (opcional)

## Funcionalidades de Auto-Commit

O bot agora fará commits automáticos sempre que:
- Um pedido for aprovado/reprovado
- Configurações forem alteradas
- Cargos forem modificados
- Servidores forem adicionados/removidos

### Mensagens de Commit Automáticas:
- `"Pedido aprovado: [nome] - ID: [id]"`
- `"Pedido reprovado: [nome] - ID: [id]"`
- `"Configuração atualizada para servidor [id]"`
- `"Novos cargos adicionados"`
- `"Servidor autorizado: [nome]"`

## Logs
O bot mostrará logs no console do Render:
- ✅ Alterações salvas no GitHub
- 📁 Arquivo atualizado
- 📝 Nenhuma alteração para commitar
- ❌ Erros (se houver)

## Troubleshooting

### ⚠️ Warning do Discord.js
Se você está vendo o warning:
```
(node:93) Warning: Supplying "ephemeral" for interaction response options is deprecated. Utilize flags instead.
```

**Solução**: No arquivo `index.js`, substitua todas as ocorrências de:
- `ephemeral: true` por `flags: 64`

Exemplo:
```javascript
// ❌ Forma antiga (causa warning)
await interaction.reply({ content: "Mensagem", ephemeral: true });

// ✅ Forma nova (correta)
await interaction.reply({ content: "Mensagem", flags: 64 });
```

### Testando os Commits Automáticos
Para testar se o sistema está funcionando, execute:
```bash
node test-commit.js
```
Este comando criará um arquivo de teste e tentará fazer commit. Verifique o GitHub para confirmar.

### Erro: "GITHUB_TOKEN não configurado"
- Verifique se a variável está definida no Render
- Certifique-se de que o token tem permissões de `repo`

### Erro: "Permission denied"
- Verifique se o token GitHub tem as permissões corretas
- Certifique-se de que o repositório existe e você tem acesso

### Erro: "Git user not configured"
- O bot configura automaticamente, mas se der erro, verifique os logs

### Commits não estão sendo realizados
1. Verifique se o GITHUB_TOKEN está configurado corretamente
2. Execute o teste: `node test-commit.js`
3. Se o teste falhar, execute: `node test-commit.js` novamente
4. Verifique os logs detalhados no console
5. Certifique-se de que o repositório existe e você tem permissões de escrita
6. Verifique se o token tem escopo `repo` completo

### Logs Detalhados
O sistema agora fornece logs muito detalhados:
- 📖 Carregando arquivos
- 💾 Salvando dados
- 📦 Inicializando Git
- 🔗 Configurando remote
- 📁 Verificando arquivos
- 🚀 Fazendo push
- ✅ Sucesso / ❌ Erro