# DSH Mobile Companion

![version](https://img.shields.io/badge/version-5.2.10-1f6feb?style=flat-square) ![license](https://img.shields.io/badge/license-BUSL--1.1-8b5cf6?style=flat-square) ![android](https://img.shields.io/badge/Android-8.0%2B-3ddc84?style=flat-square&logo=android&logoColor=white) ![node](https://img.shields.io/badge/Node-22.15%2B-339933?style=flat-square&logo=node.js&logoColor=white) ![ci](https://github.com/TintaYNodos/dsh-mobile-companion/actions/workflows/verify.yml/badge.svg?branch=main) ![tests](https://img.shields.io/badge/tests-416%20checks-2ea043?style=flat-square) ![size](https://img.shields.io/badge/APK-262%20KB-0ea5e9?style=flat-square) ![agent-ready](https://img.shields.io/badge/agent--ready-doctor.ps1%20--json-6f42c1?style=flat-square)

> 🌐 **Idiomas / Languages:** [English](README.md) · [Español (México)](README.es.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · **[Português (Brasil)](README.pt.md)** · [Français](README.fr.md) · [Deutsch](README.de.md)

> 🌐 **Aviso de Idioma:** Este documento foi traduzido para tornar o DSH Mobile Companion acessível a desenvolvedores internacionais. Correções linguísticas da comunidade, melhorias de redação e pull requests são muito bem-vindos. O documento canônico de referência está em [Espanhol (México)](README.es.md).

Acesso móvel ao DeepSeek Harness através de uma rede privada ZeroTier ou Tailscale, sem abrir portas e sem quebrar o cache de prompts (prompt caching).

O aplicativo móvel não reimplementa a interface: ele renderiza a própria Web GUI do DeepSeek Harness e adiciona uma camada de toque. O que você vê no celular é o mesmo produto em execução no seu computador.

Edição endurecida por Ismael Muñoz Reyes para Tinta y Nodos.

Versão atual: **5.2.10** (ponte e APK, `versionCode` 54).

---

## O que resolve

O DeepSeek Harness escuta em `127.0.0.1` e protege suas sessões com um cookie HMAC derivado de `.credentials.yaml`. Por isso abrir uma porta ou usar um túnel genérico não basta: sem esse cookie a interface responde 401 e, se a origem da requisição for reescrita sem cuidado, o prefixo estável exigido pelo cache de prompts se quebra.

Este projeto resolve os três problemas de uma vez:

- **Assinatura de sessão transparente.** A ponte lê o segredo local, gera o cookie HMAC-SHA256 (versão 1) e o renova antes do vencimento. O navegador móvel nunca vê o segredo.
- **Camada de toque sobre o produto real.** Metadados de viewport, uma folha de estilos e um pequeno script de cliente são injetados. A interface não é substituída: o script apenas adiciona recursos de toque (barra de comandos, teclas de código, sincronização de tema, retransmissão de aprovações e de notificações). Ele roda com a mesma origem e os mesmos privilégios da página, portanto deve ser tratado como parte da fronteira de confiança.
- **Isolamento de rede.** O socket se vincula exclusivamente à interface da VPN e só aceita clientes originados nessa mesma rede privada.

---

## Arquitetura

```text
Celular (rede ZeroTier / Tailscale)
        |
        v
bridge.mjs  —vinculação exclusiva ao IP da VPN—
   |-- /                        proxy para o DeepSeek Harness + camada de toque
   |-- /offline                 página de espera e leitor editorial offline
   |-- /dsh-companion/status    descoberta do link e verificação de integridade
   |-- /dsh-companion/sync      despejo de conversas em disco
   |-- /dsh-companion/chats     índice de conversas sincronizadas
   |-- /dsh-companion/pc-events Server-Sent Events: "um turno acabou de terminar"
   |-- /dsh-companion/pair-*    emparelhamento e aprovação de dispositivos
        |
        v
127.0.0.1:<porta do Harness>  DeepSeek Harness
```

Módulos:

```text
companion/
├── bridge.mjs                 inicialização, roteamento, políticas de socket e de acesso
├── package.json               fonte única da versão, `npm start` / `npm test`
├── offline.html               estrutura da tela de espera
├── offline.css                layout base, temas e abas
├── offline-reader.css         leitor editorial e detalhe da conversa
├── offline-core.js            estado compartilhado, status de conexão, navegação
├── offline-reader.js          leitor offline, lista, detalhe, modos de leitura
├── src/
│   ├── config.mjs             configuração e limites centralizados
│   ├── log.mjs                registrador com carimbo de data/hora
│   ├── network.mjs            descoberta de VPN, autorização, porta do Harness
│   ├── crypto.mjs             segredo, cookie HMAC v1, chave de acesso, rotação
│   ├── http.mjs               sanitização de cabeçalhos, corpo limitado, origem confiável
│   ├── routes.mjs             despacho de rotas (estado, dados, controle)
│   ├── routes-pairing.mjs     emparelhamento, aprovação, repasse ao painel
│   ├── panel.mjs              painel local de aprovação (somente loopback)
│   ├── pairing.mjs            solicitações pendentes e códigos
│   ├── pairing-views.mjs      HTML do painel
│   ├── devices.mjs            registro de dispositivos, TTL, revogação
│   ├── registry.mjs           registro JSON atômico e à prova de falhas
│   ├── proxy.mjs              proxy HTTP
│   ├── proxy-ws.mjs           túnel WebSocket
│   ├── mobile.mjs             ponto de entrada da injeção (viewport + script de cliente)
│   ├── mobile-client*.mjs     cliente injetado, dividido por responsabilidade
│   ├── mobile-styles.mjs      folha de estilos injetada
│   ├── pc-events.mjs          observador de turnos da sessão -> notificações SSE
│   ├── sync.mjs               persistência atômica de conversas
│   ├── static.mjs             recursos locais com ETag
│   ├── system-stats.mjs       telemetria de CPU, memória e temperatura
│   ├── qr.mjs / visual-lab.mjs utilitários para os harnesses de QR e visual
│   └── ratelimit.mjs          token bucket por cliente
│   ├── device-claim, panel-session, routes-data, sync-format, sync-index, sync-retention
├── tools/
├── audit-repo.mjs   auditoria do repositório (texto, sintaxe, versões, segredos)
├── build-apk.ps1   constrói e assina o APK sem Gradle
├── doctor.ps1                  diagnóstico de instalação (Node, túnel, ponte, painel)
├── RELEASING.md   checklist de publicação
├── .github/workflows/verify.yml   CI: sintaxe + auditoria em cada push
├── SECURITY.md   como relatar uma vulnerabilidade
└── CHANGELOG.md   histórico de versões
├── android_src/               cliente nativo (Java puro, sem AndroidX)
│   ├── MainActivity.java      ciclo de vida e orquestração
│   ├── CompanionWebViewClient.java, CompanionChromeClient.java
│   ├── CleartextPolicy.java   bloqueia texto claro para hosts não privados
│   ├── PcRegistryStore.java, PcEntry.java   registro multipc
│   ├── SettingsScreen.java, HubSheet.java, PcDialogs.java, QrDialogs.java
│   ├── UpdateInstaller.java, KillSwitchUi.java, BiometricGate.java
│   ├── PcEventsService.java   serviço em primeiro plano para notificações do PC
│   ├── NotificationHelper.java, NotificationChannels.java, NotificationsPc.java
│   ├── KeyStoreVault.java    criptografia com Android Keystore para chaves armazenadas
│   └── …                     descoberta, telemetria, notas locais, WOL, widget
├── test/
│   ├── verify_*.mjs           dezessete suítes de verificação (416 verificações)
│   ├── _harness.mjs           cliente compartilhado
│   └── run-all.mjs            `npm test`
└── synced_chats/              conversas persistidas (.md e .json)
```

---

## Instalação

### Método 1: configuração automatizada com seu assistente de IA (recomendado)

Se você usa um agente de IA ou assistente de programação na sua máquina (DeepSeek Harness, Cursor, Claude Code, Copilot etc.), cole o prompt abaixo no seu chat. O assistente vai clonar, configurar a inicialização em segundo plano, verificar a ponte e entregar os passos de conexão móvel.

> Guia completo: [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md)

```text
Você é um assistente de instalação. Primeiro execute o diagnóstico e cole a saída:

    powershell -ExecutionPolicy Bypass -File doctor.ps1

Se ele indicar SEM TÚNEL (nenhuma interface ZeroTier/Tailscale com IP privado), PARE: sem rede privada o telefone não alcança este computador. Explique como instalar o ZeroTier (https://my.zerotier.com + cliente no PC e no telefone, rede privada, autorizar os dois nós) ou o Tailscale (mesma conta nos dois), e execute doctor.ps1 de novo.
Se o Node for anterior a 22.15, instale Node.js 22. Se faltarem credenciais do Harness, abra o DeepSeek Harness e entre. Se a ponte estiver parada, execute install-autostart.bat.
Depois: inicie a ponte (install-autostart.bat registra o autostart E inicia; não execute run-hidden.vbs de novo), emparelhe o telefone com panel.bat (o painel mostra o mesmo código de 4 dígitos) e teste os avisos em Ajustes -> Notificações da PC -> Testar do PC.
Termine executando doctor.ps1 novamente e reportando: interface e IP do túnel, URL do telefone, versão da ponte, painel, estado do emparelhamento e resultado do teste. Nunca diga que funciona sem essas evidências. Nunca exponha a ponte à Internet, nunca imprima a chave de acesso e não execute o kill switch sem pedido.
```

### Método 2: instalação manual

#### Computador

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

Node.js 22.15 ou mais recente, sem dependências de npm.

1. Defina uma chave de acesso (fortemente recomendado; veja abaixo).
2. Instale a inicialização automática com `install-autostart.bat` (tarefa silenciosa ao fazer logon no Windows).
3. A ponte detecta a interface ZeroTier ou Tailscale e se vincula a ela. Se a detecção falhar, defina `DSH_BIND_HOST` com seu IP privado.

#### Celular

Dois métodos equivalentes:

- **Aplicativo nativo:** instale o `DSH-Companion.apk` a partir da seção *Releases*. Seletor multipc, reconexão automática, serviço de notificação em primeiro plano e bloqueio biométrico. Cerca de 262 KB sem dependências de terceiros: Java puro e reproduzível, um ícone de recurso e o tema.
- **Sem instalar nada:** abra `http://<VPN_IP>:57420` no navegador e escolha "Adicionar à tela inicial".

---

Para pará-lo ou removê-lo da inicialização: `stop.bat`, `uninstall-autostart.bat` (Windows); `uninstall-launchd.sh`, `uninstall-systemd.sh` (macOS/Linux).

## Variáveis de ambiente

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `DSH_BIND_HOST` | autodetectado | Força o IP privado de vinculação |
| `DSH_TARGET_PORT` | autodetectado | Porta do DeepSeek Harness |
| `DSH_LISTEN_PORT` | `57420` | Porta de escuta da ponte |
| `DSH_PANEL_PORT` | `57421` | Porta do painel local de aprovação |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Diretório de credenciais, chave e registro |
| `DSH_BROWSER_SECRET` | — | Segredo fornecido diretamente; dispensa a leitura do YAML |
| `DSH_ACCESS_KEY` | autogerada | Chave compartilhada; substitui a chave baseada em arquivo |
| `DSH_ACCESS_DISABLE` | — | `1` desativa a chave de acesso, **permitido somente com vinculação a loopback** |
| `DSH_COMPANION_TOKEN` | vazio | Token extra para `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | vazio | Sub-redes adicionais autorizadas, separadas por vírgula |
| `DSH_DEVICE_TTL_DAYS` | `30` | Tempo de vida da sessão do dispositivo; dispositivos expirados são rejeitados e removidos |
| `DSH_DEVICE_REFRESH_HOURS` | `24` | Com que frequência o tempo de vida é renovado pelo uso |
| `DSH_PENDING_TTL_MIN` | `15` | Minutos que uma solicitação de emparelhamento aguarda aprovação |
| `DSH_ALLOWED_HOSTS` | vazio | Nomes de host extras aceitos em `Host`/`Origin` (MagicDNS do Tailscale) |
| `DSH_ALLOW_GENERIC_VPN` | — | `1` aceita uma interface tun/tap genérica |
| `DSH_SYNC_MAX_FILES` | `200` | Número máximo de conversas mantidas |
| `DSH_SYNC_MAX_TOTAL_MB` | `200` | Tamanho máximo de `synced_chats/` em MB |
| `DSH_LOG_MAX_MB` | `5` | Tamanho máximo de `bridge.log` em MB antes de rotacionar (mínimo 1) |
| `DSH_LOG_KEEP` | `3` | Arquivos `bridge.log.N` mantidos (1–10) |
| `DSH_VPN_IP` | automático | Força o IP privado quando o nome do adaptador não é reconhecido |
| `DSH_ALLOW_PROXY_ACCESS` | — | `1` aceita cabeçalhos de proxy (apenas com uma camada de identidade à frente) |
| `DSH_PANEL_TOKEN` | automático | Bilhete de uso único para abrir o painel local |
| `DSH_VISUAL_URL` | `http://127.0.0.1:57420` | URL da sonda de capturas `visual-lab` |

### Aprovação única pelo computador

1. Abra o app no celular: ele mostra "Confirme no computador".
2. No PC, execute `panel.bat` (ou abra a URL que a ponte imprime). O painel escuta **estritamente em 127.0.0.1**.
3. O dispositivo aparece com seu código e endereço. Pressione **Autorizar**.
4. O celular se conecta e não pergunta novamente.

A sessão do dispositivo dura **30 dias e é renovada pelo uso**: cada vez que o app é aberto após 24 horas, o contador reinicia. Dispositivos expirados não são mais aceitos e são removidos do registro.

O acesso ao painel é um **tíquete de uso único** que expira e morre ao ser resgatado; em troca, o navegador recebe um cookie de sessão `HttpOnly`, `SameSite=Strict` cujo identificador existe apenas na memória. Nenhum token trafega em uma URL que você possa compartilhar e nada é gravado em um arquivo com a credencial permanente.

Os dispositivos autorizados ficam em `%USERPROFILE%\.dsh\companion-devices.json`. O painel oferece revogação individual e **Revogar todos**. No celular, o **Interruptor de segurança** revoga todos os dispositivos, fecha os túneis WebSocket **e rotaciona a chave de acesso**. Detalhes em [DISPOSITIVOS.md](DISPOSITIVOS.md).

A chave de acesso manual continua disponível como contingência para acesso por navegador padrão, armazenada em `%USERPROFILE%\.dsh\companion-access-key`. O aplicativo nativo a mantém criptografada com o Android Keystore.

**Limitação prática:** o HTTP Basic transmite a chave em Base64 sem criptografia de transporte própria. Isso só é aceitável porque ZeroTier e Tailscale criptografam todo o trânsito de ponta a ponta. Em uma rede ZeroTier compartilhada ou pública, um membro hostil da rede pode tentar interceptação na camada 2; mantenha a rede estritamente privada com autorização manual de nós.

---

## Rotas

- `GET /` — Web GUI do DeepSeek Harness, com a camada de toque aplicada quando o cliente é um celular.
- `GET /offline` — página de espera enquanto o Harness inicia, além do leitor editorial offline.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, apkVersion, apkVersionCode, requestAttempts, time }`. Chamadas anônimas recebem essa forma mínima; `apkSha256`, a lista de dispositivos, a lista de pendentes e a telemetria exigem autorização.
- `POST /dsh-companion/sync` — salva uma conversa em `synced_chats/` como Markdown e JSON.
- `POST /dsh-companion/notes` — grava uma nota enviada do telefone como Markdown em `synced_chats/notes/`; com `id`, reenviar atualiza o mesmo arquivo (idempotência).
- `GET /dsh-companion/notes` — metadados das notas recebidas (sem corpos) para a caixa de entrada do painel.
- `GET /dsh-companion/chats` — índice das conversas sincronizadas.
- `GET /dsh-companion/chat/:id` — conteúdo da conversa (JSON, ou Markdown com `?format=md`).
- `GET /dsh-companion/pc-events` — fluxo de Server-Sent Events que emite `response-finished` quando um turno termina no computador.
- `POST /dsh-companion/pc-events/test` — emite um evento sintético; usado pelo botão "Testar do PC".
- `GET /dsh-companion/pair-state` — endpoint de polling usado pela tela de espera.
- `GET /dsh-companion/pair-events` — fluxo de aprovação para a tela de espera.
- `POST /dsh-companion/open-panel` — abre a janela do painel local (somente loopback).
- `POST /dsh-companion/retry` — limpa uma rejeição e solicita acesso novamente.
- `POST /dsh-companion/kill-switch` — revoga todos os dispositivos, fecha os túneis e rotaciona a chave de acesso.
- `POST /dsh-companion/action` — retransmissão de aprovações de ferramentas. Retorna `501`: as aprovações vivem no DOM da GUI; a ponte não as falsifica.
- `GET /companion.webmanifest` — manifesto PWA.

---

## Recursos do cliente móvel

- **Barra de comandos e teclas de código.** Uma linha de atalhos do compositor e uma linha de símbolos de código que aparecem apenas enquanto o teclado está aberto, abaixo do cartão do compositor quando cabe e acima dele caso contrário. As duas linhas podem ser alternadas nas Configurações.
- **Comportamento do Enter.** Por padrão, Enter insere uma quebra de linha; "Enter envia" inverte isso. Implementado sobre o Lexical com `execCommand`, que é a única escrita que o compositor aceita.
- **Notificações do PC.** Com o serviço em primeiro plano ativado, o celular recebe uma notificação quando um turno termina no computador **mesmo com o app fechado**. A ponte observa o log da sessão e dispara no registro `turn/end`: exatamente uma notificação por turno, não importa por quanto tempo o modelo ou uma ferramenta fique em pausa.
- **Canal de notificação em primeiro plano, canal crítico e canal de aprovações.** Avisos críticos (resultado do interruptor de segurança, acesso revogado) sempre aparecem, ignorando o filtro "somente quando oculto".
- **Bloqueio biométrico**, seletor multipc com QR e entrada manual, wake-on-LAN, pílula de telemetria, notas locais (7 perfis por área, prazos e nota privada), widget do sistema.

---

## Modelo de segurança

**Acesso**

- Chave compartilhada via HTTP Basic em todas as rotas, comparação em tempo constante e limite de requisições por IP.
- Autorização estrita de clientes: loopback, a sub-rede da interface de vinculação **com sua máscara de rede real**, ou os CIDRs declarados explicitamente.
- A identidade do dispositivo é o **token do cookie de sessão**, não o IP de origem: um dispositivo que herda um endereço não herda a sessão.
- Validação de `Host` contra o endereço da ponte (DNS rebinding), rejeição de `Origin: null`, de origem vazia e de `Sec-Fetch-Site` inesperado.
- Rejeição imediata de `Content-Length` + `Transfer-Encoding` (contrabando de requisições).
- Chaves de acesso e tokens de cliente são removidos antes de passar pelo proxy para o backend.
- `DSH_ACCESS_DISABLE=1` se recusa a iniciar a menos que a ponte esteja vinculada a loopback.
- A chave de acesso é **rotacionada** pelo interruptor de segurança; tudo o que já estava emparelhado precisa ser aprovado novamente.

**Credenciais**

- O segredo da sessão é lido uma única vez, nunca é registrado e nunca é enviado ao cliente; o processo falha imediatamente se ele estiver ausente.
- Cookie HMAC-SHA256 versão 1 idêntico ao emitido pelo Harness, com 12 horas de validade e renovação antecipada.
- Em um 401 do backend, a ponte recarrega o segredo e tenta novamente uma vez, de modo que rotacionar `.credentials.yaml` não exige reinício.
- A chave de acesso nunca é impressa por inteiro no log: apenas seus últimos quatro caracteres.
- O painel não tem token permanente: tíquete de uso único mais cookie de sessão em memória.
- No Android, as chaves armazenadas são criptografadas com **AES-256-GCM no Android Keystore**, com migração automática de valores antigos em texto claro.

**Dados e armazenamento**

- As conversas são gravadas de forma atômica, com identificadores sanitizados e confinamento estrito de caminho contra travessia de diretórios.
- O conteúdo é escapado antes da serialização: nenhum HTML executável vaza para os arquivos exportados ou índices.
- Limites explícitos de tamanho de corpo, contagem de mensagens e teto de comprimento por mensagem.
- Limitação de taxa em memória com teto limitado.

**Aplicativo nativo (Android)**

- `DSH-Companion.apk` — versão **5.2.10**, `versionCode` 54, `minSdk` 26, `targetSdk` 35.
- Sem AndroidX e sem Kotlin: bytecode Java puro, cerca de 262 KB.
- **Texto claro bloqueado fora da rede privada**: o `CleartextPolicy` rejeita qualquer requisição que não seja HTTPS ou que não aponte para o bunker configurado ou para um endereço privado/loopback, e a configuração de segurança de rede proíbe texto claro para os serviços públicos com os quais o app fala (GitHub, para verificar atualizações). Isso é aplicado acima da WebView, porque a configuração de segurança de rede do Android não consegue expressar "somente faixas de IP privadas".
- Acesso a arquivos locais desativado, conteúdo misto bloqueado, pop-ups e depuração remota desativados.
- Acesso ao microfone restrito à origem exata do bunker (esquema, host e porta).
- Navegação confinada à origem do bunker; links externos são delegados ao seletor do sistema.
- Erros de TLS cancelam a navegação imediatamente.
- `ERR_ABORTED` é distinguido de quedas de transporte, o que elimina o loop infinito de recarregamento.
- `onRenderProcessGone` reconstrói a visualização em vez de deixar o Android encerrar o app.
- A reconexão é pausada em segundo plano e aplica backoff exponencial com jitter.
- As notificações de aprovação ficam ocultas na tela de bloqueio (`VISIBILITY_SECRET`) e a ação de aprovar se recusa a executar enquanto o dispositivo está bloqueado.

---

## Construir o APK

Sem Gradle nem Android Studio: o APK é montado com as ferramentas do SDK. Requisitos: JDK 17+, SDK Android com a plataforma `android-35` e build-tools, e um keystore (por padrão o de depuração).

```powershell
`powershell -ExecutionPolicy Bypass -File build-apk.ps1`
```


## Assinatura do APK
As compilações de release são assinadas com o keystore do projeto, não com o de depuração. Verifique com:

```bash
apksigner verify --print-certs DSH-Companion.apk
```

Impressão SHA-256 do certificado de release: `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23`

Os APK até 5.1.6 foram assinados com o certificado de depuração. **A assinatura mudou na 5.1.7**: se você vem de uma versão anterior a essa, desinstale uma vez; a partir da 5.1.7 as atualizações instalam por cima.

## Testes

```bash
npm test
```


Dezessete suítes, **416 verificações** (344 na CI), cobrindo descoberta, injeção móvel, `?dshc=off`, rejeição de origem cruzada, defesas contra contrabando de requisições, limites de corpo, sanitização de conteúdo, integridade do handshake WebSocket, segurança contra corrupção do registro, controle de acesso, notas locais, TTL do registro de dispositivos, fluxo do painel e o interruptor de segurança.

A suíte conversa com uma **ponte em execução** (não é um mock): inicie a ponte primeiro. A execução real do interruptor de segurança é destrutiva — revoga dispositivos e rotaciona a chave —, por isso é opcional com `DSH_TEST_DESTRUCTIVE=1`.

---

## Notas locais

As notas são guardadas **apenas no telefone** e funcionam com o PC desligado e sem Internet. Não
precisam de conta, nem de chave de API, nem de conexão: são criadas, editadas e apagadas no app e
compartilhadas com o seletor do Android. Quando a ponte está acessível, **Enviar para o PC** deixa a
nota em `synced_chats/notes/` no computador; se o PC estiver desligado, a nota continua no telefone
e pode ser enviada depois.

### Perfis por área

Cada nota escolhe um perfil: o perfil define os seus tipos e estados e o rótulo dos dois campos
próprios (projeto e personagem/módulo).

| Perfil | Campos próprios | Tipos | Estados |
| --- | --- | --- | --- |
| **Geral** | Projeto · Detalhe | Nota | — |
| **Escritor** | Obra · Personagem | Personagem, Cena, Trama, Diálogo, Correção, Pesquisa, Ideia | Ideia, Rascunho, Revisão, Fechado |
| **Programador** | Projeto · Módulo ou arquivo | Bug, Melhoria, Refatoração, Tarefa, Decisão, Ideia | Aberto, Corrigido, Verificado |
| **Docente** | Matéria · Turma ou aluno | Aula, Atividade, Prova, Rubrica, Observação, Material | Rascunho, Pronto, Aplicado, Avaliado, Arquivado |
| **Jornalista** | Caso ou tema · Fonte | Pista, Entrevista, Artigo, Pesquisa, Correção, Ideia | Aberto, Em andamento, Revisão, Publicado, Arquivado |
| **Jurídico** | Processo · Cliente | Petição, Prova, Prazo, Audiência, Contrato, Pesquisa, Nota | Aberto, Em andamento, Revisão, Protocolado, Fechado |
| **Design** | Cliente · Projeto | Briefing, Conceito, Wireframe, Mockup, Recurso, Feedback, Nota | Ideia, Rascunho, Revisão, Aprovado, Entregue |

Além do tipo e do estado, cada nota leva **etiquetas**, **prioridade** (baixa, média ou alta) e um
**prazo** opcional escolhido num seletor de data. A lista pode ser **ordenada por vencimento**
(primeiro as notas com data, da mais próxima à mais distante) e os filtros **«Com data»** e
**«Prioridade»** restringem a vista. A pesquisa ignora **acentos e maiúsculas**: `garcia` encontra
`García`.

### Privacidade

- `notes.json` é guardado **cifrado em repouso** com **AES-256-GCM** e uma chave do
  **AndroidKeyStore**; um arquivo em texto claro de uma versão anterior é migrado para cifrado na
  primeira leitura.
- A tela de Notas usa **FLAG_SECURE**: capturas de tela são bloqueadas e nenhuma miniatura de nota
  aparece no seletor de apps recentes.
- Uma nota pode ser marcada **«Solo en el teléfono»** (somente no telefone): nunca é enviada, fica
  excluída de «Enviar todas» e compartilhá-la pede confirmação.
- As notas não falam com a Internet: sem contas, sem chaves de API e sem pedidos a serviços
  externos. Só saem do telefone quando você toca em «Enviar para o PC», pela rede privada.

### Envio para o PC e caixa de entrada

**Enviar para o PC** grava a nota em `synced_chats/notes/` com front matter que inclui `id`,
`dueDate` e `updatedAt`, além do perfil, tipo, projeto, personagem/módulo, etiquetas, estado e
prioridade. O envio é **idempotente por `id`**: reenviar a mesma nota atualiza o mesmo arquivo no PC
em vez de duplicá-lo. Uma **nota só com título** é permitida (o corpo pode ficar vazio) e enviar
nunca apaga nada do telefone. As notas não estão ligadas a nenhuma conversa: o envio só deixa o
arquivo no computador.

O painel do PC tem uma caixa de entrada **«Notas recebidas»** com as **últimas 10 notas**, em
**somente leitura** (título, tipo, projeto e data). A lista completa de metadados, sem corpos, está
em `GET /dsh-companion/notes`.

### Acessibilidade

- O editor é **rolável com o teclado aberto**, para que o campo do corpo nunca fique encoberto.
- Os alvos de toque medem **≥48 dp** e os selos mantêm o contraste **AA**.
- Os chips anunciam a opção selecionada ao **TalkBack** e o **salvamento automático** usa uma região
  viva.
- Cada cartão tem uma **descrição acessível** e o título mostra **2 linhas** antes de ser cortado.

O **leitor offline de chats** continua precisando do PC: os chats sincronizados são servidos pela
ponte. O antigo modo de chat na nuvem foi retirado na 5.2.8 porque só funcionava com o PC ligado; as
notas locais o substituem sem depender do computador.

## Limitações honestas

Este design foi pensado para **uso pessoal**: um operador, seus dispositivos confiáveis e sua rede privada. Não é um serviço multilocatário.

- A ponte concede acesso total à sessão do DeepSeek Harness da conta do Windows subjacente. Não há separação de privilégios por dispositivo.
- Não há contas de usuário nem RBAC: qualquer um que tenha um dispositivo autorizado controla a sessão.
- O painel de emparelhamento registra a atividade recente para visibilidade operacional, mas não é um livro de auditoria imutável e pode ser limpo com um botão.
- Uma rede ZeroTier pública ou compartilhada anula o perímetro privado. Mantenha as redes privadas com autorização manual de nós em my.zerotier.com.
- Um administrador local no host pode inspecionar credenciais e logs de conversas. Esse é o modelo de segurança do Windows, não uma falha de arquitetura da ponte.
- As conversas sincronizadas são armazenadas em texto claro dentro de `synced_chats/`. No Windows, o modo POSIX `0600` não se traduz em ACLs estritas: a proteção efetiva é a ACL do perfil de usuário. Use BitLocker em hardware compartilhado.
- A ponte fala HTTP em texto claro dentro do túnel da VPN. Isso é adequado enquanto ZeroTier ou Tailscale criptografam o trânsito de ponta a ponta; nunca exponha a porta da ponte fora da VPN.
- A configuração de segurança de rede do Android não consegue expressar faixas de IP, então a regra de "somente privado" para texto claro é aplicada no código do app (veja `CleartextPolicy`). Um atacante que já esteja dentro da sua VPN ainda consegue ler esse tráfego: a criptografia é o túnel.
- A notificação de conclusão depende de o DeepSeek Harness gravar o registro `turn/end` no log da sessão. Se uma versão futura do Harness mudar esse formato, o aviso deixa de chegar (o botão de teste no app informa qual metade falhou).

---

## Estabilidade

**A 5.2.10 é a versão estável atual da série 5.2.** A rama `stable/5` preserva esta árvore; a 5.1.x permanece como linha anterior.

## Capturas

| Aplicativo | Painel de emparelhamento | Leitor offline |
| --- | --- | --- |
| ![Aplicativo](docs/images/app.png) | ![Painel de emparelhamento](docs/images/panel.png) | ![Leitor offline](docs/images/offline.png) |

## Aviso de projeto comunitário

> **Aviso:** O DSH Mobile Companion é um cliente móvel complementar desenvolvido pela comunidade para facilitar o acesso remoto seguro ao DeepSeek Harness através de redes privadas (ZeroTier / Tailscale). Não é um produto oficial da DeepSeek, nem é afiliado, patrocinado ou endossado pela DeepSeek. Todas as marcas registradas e logotipos mencionados pertencem aos seus respectivos proprietários.

## Uso comercial

O uso em produção em uma empresa, a integração em um produto ou serviço e a redistribuição exigem uma licença separada (Business Source License 1.1). A empresa pode abrir uma consulta pelo formulário **Commercial license**: [github.com/TintaYNodos/dsh-mobile-companion/issues/new/choose](https://github.com/TintaYNodos/dsh-mobile-companion/issues/new/choose). Detalhes em [LICENSING.md](LICENSING.md).

## Saúde, cópias de segurança e suporte remoto

- **Saúde real.** `/healthz` informa separadamente da ponte e do DeepSeek Harness e devolve HTTP 503 quando o Harness está em baixo; `degraded` indica uma peça do contrato alterada. `/dsh-companion/status` expõe o contrato verificado.
- **Cópias.** [backup.bat](backup.bat) guarda o registo de dispositivos, a chave de acesso e o token do painel com um manifesto de hashes; [restore.bat](restore.bat) verifica esse manifesto antes de escrever. Ficam em `%USERPROFILE%\.dsh\backups\`.
- **Suporte remoto (opcional).** [RustDesk](https://rustdesk.com) é apenas uma recomendação e nunca é incluído: servidor próprio ou acesso só por ZeroTier/Tailscale, palavra-passe permanente forte e 2FA, e desligar no fim.
- **Procedimento.** [OPERACION.md](OPERACION.md) cobre aprovações, reinícios, logs, saúde, cópias e atualização do APK; suporte: [SUPPORT.md](SUPPORT.md).

## Instalável por um agente (DeepSeek Harness)

O procedimento completo está empacotado como skill em [skills/mobile-companion-setup](skills/mobile-companion-setup/); cada `FAIL`/`AVISO` do `doctor.ps1` tem o seu comando em [doctor-fixes.json](doctor-fixes.json).

```powershell
New-Item -ItemType Directory -Force .dsh\skills | Out-Null
cmd /c mklink /J .dsh\skills\mobile-companion-setup skills\mobile-companion-setup
```

## Documentos do projeto

[SECURITY.md](SECURITY.md) · [AUDIT_CLOSURE.md](AUDIT_CLOSURE.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md) · [DISPOSITIVOS.md](DISPOSITIVOS.md) · [RELEASING.md](RELEASING.md) · [OPERACION.md](OPERACION.md) · [SUPPORT.md](SUPPORT.md) · [CHECKLIST-ESTABLE.md](CHECKLIST-ESTABLE.md) · [AUDITORIA-EXTERNA.md](AUDITORIA-EXTERNA.md) · [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md) · [AGENT_COMPAT.md](AGENT_COMPAT.md) · [LICENSE](LICENSE)

## iPhone / iPad

Não há aplicação iOS. Safari → *Adicionar ao ecrã principal* executa a interface completa com o PC ligado (sem avisos em segundo plano no iOS). O leitor offline continua a precisar do computador.


## Licença

Business Source License 1.1 (BUSL-1.1). Gratuito para uso individual, educacional e não comercial. Redistribuição comercial e exploração comercial são proibidas sem autorização expressa.

Autoria e titularidade de direitos: Ismael Muñoz Reyes · Tinta y Nodos. Consulte [LICENSE](LICENSE).
