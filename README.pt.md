# DSH Mobile Companion

> 🌐 **Idiomas / Languages:** [English](README.md) · [Español (México)](README.es.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · **[Português (Brasil)](README.pt.md)** · [Français](README.fr.md) · [Deutsch](README.de.md)

> 🌐 **Aviso de Idioma:** Este documento foi traduzido para tornar o DSH Mobile Companion acessível a desenvolvedores de todo o mundo. Correções linguísticas e Pull Requests da comunidade são muito bem-vindos. O documento canônico de referência original é em [Espanhol (México)](README.es.md).

Acesso móvel ao DeepSeek Harness através de uma rede privada ZeroTier ou Tailscale, sem abrir portas e sem quebrar o prompt caching.

O aplicativo móvel não reimplementa a interface: exibe a própria Web GUI do DeepSeek Harness e aplica um ajuste tátil. O que você vê no celular é o mesmo produto em execução no computador.

Edição endurecida por Ismael Muñoz Reyes para Tinta y Nodos.

---

## O que resolve

O DeepSeek Harness escuta em `127.0.0.1` e protege suas sessões com um cookie HMAC derivado de `.credentials.yaml`. Por isso não basta abrir a porta nem usar um túnel genérico: sem esse cookie a interface responde 401 e, se a origem da requisição for reescrita de forma descuidada, perde-se o prefixo estável que sustenta o prompt caching.

Este projeto resolve as três coisas ao mesmo tempo:

- **Assinatura de sessão transparente.** A ponte lê o segredo local, gera o cookie HMAC-SHA256 (versão 1) e o renova antes de expirar. O navegador móvel nunca vê o segredo.
- **Ajuste tátil no produto real.** Metadados de viewport e uma folha de estilos mínima são injetados. A interface não é substituída nem é injetado JavaScript no documento.
- **Isolamento de rede.** O socket se vincula exclusivamente à interface da VPN e aceita apenas clientes dessa mesma rede privada.

---

## Arquitetura

```text
Celular (rede ZeroTier / Tailscale)
        |
        v
bridge.mjs  —vinculação exclusiva ao IP da VPN—
   |-- /                      proxy para DeepSeek Harness + ajuste móvel
   |-- /offline               página de espera quando o Harness ainda não responde
   |-- /dsh-companion/status  descoberta e integridade do link
   |-- /dsh-companion/sync    gravação de conversas em disco
        |
        v
127.0.0.1:52710  DeepSeek Harness
```

Módulos:

```text
companion/
├── bridge.mjs              inicialização, roteamento, políticas de socket e acesso
├── offline.html            tela de espera com a estética do produto
├── manifest.webmanifest    instalação como aplicativo web
├── icon.svg
├── android_src/
│   └── MainActivity.java   cliente nativo: WebView blindada, pílula de status, reconexão
├── test/
│   ├── verify_bridge.mjs      rotas, injeção, origem, framing, limites
│   ├── verify_sync_ws.mjs     neutralização de conteúdo e handshake WebSocket
│   └── verify_access_key.mjs  controle de acesso com chave compartilhada
├── src/
│   ├── config.mjs          configuração e limites centralizados
│   ├── log.mjs             logs com registro de data/hora (timestamp)
│   ├── network.mjs         descoberta de VPN, autorização, porta do Harness
│   ├── crypto.mjs          segredo, cookie HMAC v1, chave de acesso, comparação constante
│   ├── http.mjs            sanitização de cabeçalhos, corpo limitado, origem confiável
│   ├── proxy.mjs           proxy HTTP e túnel WebSocket
│   ├── mobile.mjs          injeção de viewport e ajustes táteis
│   ├── sync.mjs            persistência atômica de conversas
│   ├── static.mjs          recursos estáticos locais com ETag
│   └── ratelimit.mjs       token bucket por cliente
└── synced_chats/           conversas exportadas (.md e .json)
```

---

## Instalação

### Computador

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

1. Defina uma chave de acesso (altamente recomendado, veja abaixo).
2. Instale a inicialização automática com `install-autostart.bat` (registra uma tarefa silenciosa ao iniciar o Windows).
3. A ponte detecta automaticamente a interface do ZeroTier ou Tailscale e se vincula a ela. Se a detecção falhar, defina `DSH_BIND_HOST` com o IP privado.

### Celular

Duas formas equivalentes:

- **Aplicativo nativo:** instale o `DSH-Companion.apk` a partir da seção de *Releases*. Oferece reconexão automática, seletor de bunker e tela cheia. Pesa menos de 160 KB e não inclui bibliotecas de terceiros: código Java puro e reproduzível, ícone e tema.
- **Sem instalar nada:** abra `http://<IP_VPN>:57420` no navegador e use "Adicionar à tela inicial".

`/m` responde com um redirecionamento permanente para `/`: o modo satélite anterior foi descontinuado em favor da interface real.

---

## Variáveis de Ambiente

| Variável | Valor Padrão | Uso |
| --- | --- | --- |
| `DSH_BIND_HOST` | autodetectado | Força o IP privado de vinculação |
| `DSH_TARGET_PORT` | `52710` | Porta do DeepSeek Harness |
| `DSH_LISTEN_PORT` | `57420` | Porta da ponte |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Diretório de credenciais e chave |
| `DSH_BROWSER_SECRET` | — | Segredo direto, evita ler o YAML |
| `DSH_ACCESS_KEY` | autogerada | Chave compartilhada; sobrescreve a do arquivo |
| `DSH_ACCESS_DISABLE` | — | `1` desativa a chave (apenas com loopback) |
| `DSH_COMPANION_TOKEN` | vazio | Token adicional para `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | vazio | Sub-redes adicionais autorizadas, separadas por vírgula |

### Aprovação pelo computador, uma única vez

Nenhuma chave precisa ser digitada.

1. Abra o app no celular. Ele exibe "Confirme no computador".
2. No computador, abra `http://<IP_VPN>:57420/pair`.
3. O dispositivo aparece listado com seu endereço IP. Clique em **Autorizar**.
4. O celular conecta automaticamente e não pergunta novamente.

A sessão dura **30 dias e se renova com o uso**: cada vez que você abre o app após 24 horas, o contador volta para 30. Se usado pelo menos uma vez por mês, nunca expira.

O painel escuta **apenas em 127.0.0.1** e exige sua própria credencial, portanto não é acessível a partir da VPN nem de outra máquina. Ele exibe os dispositivos autorizados com um botão para revogar cada um.

Os dispositivos são armazenados em `%USERPROFILE%\.dsh\companion-devices.json`. Há um botão **Revogar todos** no painel. Detalhes em [DISPOSITIVOS.md](DISPOSITIVOS.md).

A chave manual continua existindo como contingência para acesso via navegador em `%USERPROFILE%\.dsh\companion-access-key`. O aplicativo nativo não precisa dela.

**Limitação prática:** O HTTP Basic envia a chave em Base64, sem criptografia própria. Isso é aceitável apenas porque o ZeroTier e o Tailscale criptografam o transporte de ponta a ponta. Em uma rede ZeroTier compartilhada ou pública, um membro hostil pode tentar interceptação em camada 2; a defesa adequada é manter a rede estritamente privada com autorização manual.

---

## Rotas

- `GET /` — Web GUI do DeepSeek Harness, com ajuste móvel aplicado quando o cliente é um celular.
- `GET /offline` — página de espera enquanto o Harness é iniciado, com Leitor Editorial Offline de sessões pré-carregadas.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, time }`.
- `POST /dsh-companion/sync` — salva uma conversa em `synced_chats/` nos formatos Markdown e JSON.
- `GET /dsh-companion/chats` — lista cronológica de sessões sincronizadas para leitura offline.
- `GET /dsh-companion/chat/:id` — entrega o conteúdo de uma sessão (JSON estruturado ou Markdown com `?format=md`).
- `POST /dsh-companion/action` — resolução remota de autorizações de ferramentas e permissões de sandbox em segundo plano.
- `GET /companion.webmanifest` — manifesto de instalação PWA.

---

## Modelo de Segurança

**Acesso**

- Chave compartilhada obrigatória via HTTP Basic em todas as rotas, incluindo descoberta; validada em tempo constante e com limite de tentativas por IP.
- Autorização estrita de cliente: loopback local, a sub-rede da interface de vinculação **com sua máscara real**, ou CIDRs explicitamente declarados.
- O cabeçalho `Host` deve coincidir com o da ponte: neutraliza ataques de DNS rebinding.
- Rejeição de `Origin: null`, origem vazia e valores de `Sec-Fetch-Site` diferentes de `same-origin`/`none`.
- Rejeição imediata de requisições contendo `Content-Length` e `Transfer-Encoding` simultâneos (proteção contra request smuggling).
- A chave de acesso e o token do cliente nunca são repassados ao backend: são removidos antes do proxy.
- Túnel WebSocket sujeito aos mesmos critérios de validação de origem, sanitização de CRLF e encerramento seguro.

**Credenciais**

- O segredo da sessão é lido uma única vez, nunca é registrado em log e nunca trafega para o cliente. Validado na inicialização: se ausente, o processo encerra imediatamente em vez de deixar requisições pendentes.
- Cookie HMAC-SHA256 versão 1, idêntico ao emitido pelo DeepSeek Harness, com 12 horas de validade e renovação antecipada.
- Se o backend responder 401, a ponte recarrega o segredo e tenta novamente uma vez: sobrevive à rotação de `.credentials.yaml` sem necessidade de reinicialização.

**Dados e armazenamento**

- Conversas sincronizadas são gravadas de forma atômica, com nomes derivados de identificadores controlados e verificação rigorosa de confinamento de caminho contra directory traversal.
- Todo o conteúdo é escapado antes da serialização: nenhum HTML executável é propagado para arquivos ou índices.
- Limites explícitos para tamanho de payload, contagem de mensagens e comprimento por mensagem.
- O rate limiting possui teto de memória: não pode ser inflado com chaves únicas.

**Aplicativo nativo (Android)**

- `DSH-Companion.apk` — versão 4.4.1, `versionCode` 22, `minSdk` 26, `targetSdk` 35.
- Pesa menos de 240 KB, sem AndroidX nem Kotlin: o `classes.dex` é código Java puro e reproduzível.
- **Suporte Multi-PC Dinâmico:** Adicione e alterne entre computadores ilimitados com seletor inteligente e remoção segura.
- **Ações em notificações em segundo plano:** Permite autorizar ou negar ferramentas e solicitações de permissão `danger-full-access` diretamente da barra de notificações do Android sem abrir a janela do app.
- **Leitor editorial offline:** Permite ler sessões sincronizadas no celular com tipografia literária otimizada para capítulos e narrativa, mesmo com o computador desligado.
- **Design sóbrio de engenharia:** Interface livre de emojis infantis, com hierarquia visual de console e paleta escura oficial DeepSeek / GitHub Dark.
- Acesso a arquivos locais desabilitado, conteúdo misto bloqueado, popups e depuração remota desativados.
- Permissão de microfone concedida estritamente à origem exata do bunker (esquema, host e porta); qualquer outra origem é negada.
- Navegação restrita à origem do bunker; links externos são abertos através do seletor nativo do sistema operacional.
- Erros de TLS cancelados sem exceção.
- Abortos de navegação (`ERR_ABORTED`) não são confundidos com quedas de rede: previne loops infinitos de recarregamento.
- As tentativas de reconexão são pausadas em segundo plano e limitadas com backoff exponencial e jitter.

---

## Testes

```bash
node test/verify_bridge.mjs
node test/verify_sync_ws.mjs
node test/verify_access_key.mjs   # requer DSH_ACCESS_KEY definida na inicialização
```

Cobrem descoberta, injeção móvel, conformidade com `?dshc=off`, rejeição de cross-origin, defesas contra request smuggling, limites de payload, neutralização de conteúdo, handshake WebSocket e controle de acesso.

---

## Limitações Transparentes

Esta arquitetura foi projetada para **uso pessoal**: uma pessoa, seus dispositivos de confiança e sua rede privada. Não é um serviço multiusuário.

- A ponte concede acesso completo à sessão do DeepSeek Harness da conta do Windows em execução. Não há isolamento por usuário ou por dispositivo.
- Dois celulares do mesmo usuário compartilham a mesma sessão subjacente, embora cada dispositivo seja autorizado e revogado separadamente pelo painel.
- Não existem contas ou funções (roles): quem possui um dispositivo autorizado tem o controle da sessão.
- O painel de autorização registra a atividade recente, mas não é um log de auditoria permanente: pode ser limpo com um botão.
- Uma rede ZeroTier pública ou compartilhada anula o perímetro de segurança de rede. Mantenha-a privada com autorização manual em my.zerotier.com.
- Um administrador local no computador host pode ler credenciais e conversas. Esse é o modelo de segurança do Windows, não uma falha da ponte.
- As conversas sincronizadas são salvas em texto simples em `synced_chats/`. No Windows, o modo `0600` não impõe uma ACL restrita: a proteção real é a ACL do perfil de usuário. Criptografe o disco com BitLocker se o computador for compartilhado.
- O tráfego trafega como HTTP sobre a VPN. Isso é seguro porque o ZeroTier e o Tailscale criptografam o transporte de ponta a ponta; nunca exponha a ponte fora da VPN.
- A autorização de rede baseia-se no endereço IP de origem. Ela não resiste a um invasor que já controle uma máquina nessa mesma rede privada: para esse cenário existe a `DSH_ACCESS_KEY`.

---

## Aviso de Projeto Comunitário

> **Aviso:** O DSH Mobile Companion é um cliente móvel complementar de código aberto desenvolvido pela comunidade para facilitar o acesso remoto seguro ao DeepSeek Harness através de redes privadas (ZeroTier / Tailscale). Não é um produto oficial da DeepSeek, nem é afiliado, patrocinado ou endossado pela DeepSeek. Todas as marcas registradas e logotipos de referência pertencem aos seus respectivos proprietários.

## Licença

BSL 1.1 / PolyForm Noncommercial 1.0.0. Gratuito para uso individual, educacional e não comercial. Redistribuição e exploração comercial são estritamente proibidas sem autorização expressa.
Autoria e titularidade de direitos: Ismael Muñoz Reyes · Tinta y Nodos. Consulte [LICENSE](LICENSE).
