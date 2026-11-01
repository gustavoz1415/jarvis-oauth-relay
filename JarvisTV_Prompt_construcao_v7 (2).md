# JarvisTV — Prompt de construção (v7, para GenSpark)

v7 · somente Gemini · app próprio no celular com pareamento por PIN · 5 chaves de contas diferentes · login SmartThings via relay OAuth já publicado

`RELAY_URL` = `https://jarvis-oauth-relay.onrender.com` (valor inicial; o dono troca se o Render atribuiu outra URL).

## 1. Missão e critério de sucesso

Você é um agente de engenharia que vai construir, compilar e entregar dois APKs: o **Jarvis TV** (assistente de voz pessoal em português do Brasil para Android TV, rodando numa TV Box TX9) e o **Jarvis Remote** (app do celular que configura o Jarvis TV). A inteligência na nuvem é somente Gemini. O que é simples roda local-first, para sobreviver sem internet ou sem cota. O dono usa controle remoto e celular, nunca PC.

O projeto está pronto quando:

- Eu falo “Jarvis” e ele responde por voz: comando local em até 3 s, resposta da nuvem em até 6 s (Wi-Fi normal).
- Sem internet, ou com as 5 chaves sem cota, ele continua respondendo hora, data, timers e troca de personalidade, e diz claramente que está sem nuvem.
- Liga, desliga e controla a TV (e outros dispositivos) por voz via SmartThings.
- Pelo app do celular eu pareio com a TV usando um PIN que aparece na tela, e configuro chaves, personalidades e limites sem digitar nada no controle remoto.
- Os dois APKs instalam copiando o arquivo, sem PC.

## 2. Regras de execução (para o agente)

- Trabalhe por entregas (seção 17). Ao fim de cada entrega: compile os dois módulos (`./gradlew :tv:assembleDebug :remote:assembleDebug`), corrija os erros até passar, entregue os APKs e pare. Não comece a próxima entrega sozinho.
- Nunca diga que compilou ou testou se não fez. Se o ambiente não compilar Android (SDK, NDK, Gradle), entregue o projeto completo e um relatório do que não foi verificado.
- Código completo: sem “// resto aqui”, sem pseudocódigo, sem arquivo vazio. Cada arquivo com caminho completo.
- Não invente API, assinatura ou versão. Na dúvida, use a estável mais recente que você conhece, marque `// TODO(verify): ...` e liste todos no relatório.
- IDs de modelo, preços e limites da API nunca são hardcoded além dos valores iniciais desta spec: vêm de `models.list` e da configuração (seção 9).
- Antes de cada entrega, escreva em 5 linhas: arquivos, dependências e riscos.
- Identificadores de código em inglês; textos de interface, falas e mensagens em PT-BR.
- Relatório final de cada entrega: o que foi feito, o que foi compilado, lista de `TODO(verify)`, limitações conhecidas.
- Não implemente Claude, OpenAI nem qualquer outro provedor. Só Gemini.
- **O relay OAuth não faz parte deste projeto.** Ele já está escrito e publicado à parte (repositório `jarvis-oauth-relay`). Você não o escreve nem o altera: só usa o contrato da seção 10. O servidor MCP `smartthings-npm` também não é tocado.

## 3. Ambiente real (restrições de projeto)

- **TV Box:** TX9 com chip Allwinner (modelo exato desconhecido: detectar `Build.HARDWARE` e `ro.board.platform`), 2 GB de RAM, 16 GB de armazenamento. Projete para o pior caso.
- **Não assuma 64 bits.** Muita TV Box roda Android 32 bits. Detecte `Build.SUPPORTED_ABIS`, mostre na tela Sistema e compile as libs nativas para `arm64-v8a` e `armeabi-v7a`. Descubra e informe a versão do Android; minSdk 26 como referência.
- **Sem touch na TV.** Tudo por D-pad: foco visível, texto grande (10-foot UI), Compose for TV (`androidx.tv`). O app do celular, ao contrário, é touch-first.
- **Microfone:** Fifine USB. Escolher via `AudioManager.getDevices(TYPE_USB_DEVICE)` + `setPreferredDevice`, com teste de nível na tela Escuta.
- **Relógio:** box barata erra a hora sem NTP. Se data/hora parecerem inválidas, avisar por voz e na tela. Fuso `America/Sao_Paulo`.
- **RAM:** app da TV abaixo de ~300 MB em uso normal. Monitorar `ActivityManager.MemoryInfo`; abaixo de ~250 MB livres, desligar módulos opcionais (LLM local, Whisper local) e avisar.
- **Rede:** TV e celular precisam estar na mesma rede Wi-Fi/LAN. Nenhuma etapa de instalação ou configuração pode exigir PC.

## 4. Arquitetura

Projeto Gradle (Kotlin DSL) com 3 módulos:

```
JarvisTV/
├── shared/   contrato da API TV↔celular (DTOs kotlinx.serialization, versão da API)
├── tv/       app.jarvis.tv
│   ├── MainActivity (launcher Leanback, home de status)
│   ├── service/  JarvisService (foreground, microphone) · OverlayController · RemoteKeyService (Accessibility)
│   ├── audio/    MicCapture · Vad · Stt (Cloud, LocalWhisper) · Tts (Android, Piper, GeminiTts) · WakeWord · AudioDucking
│   ├── core/     StateMachine · RequestRouter · IntentEngine · PrivacyGuard · ResponseCache · Persona · ConfigManager
│   ├── ai/       LlmProvider (interface) · GeminiProvider · KeyManager · UsageTracker · LiveSession
│   ├── home/     SmartThingsClient (OAuth + MCP + REST) · OAuthTokenStore · RelayClient · DeviceAliases · WeatherClient
│   ├── remote/   RemoteServer (HTTPS) · Pairing · NsdAdvertiser · PairedDevices
│   ├── data/     Room: AppDatabase · DAOs · migrations
│   ├── ui/       telas TV em Compose: Home · Settings · Personas · ApiDashboard · LogViewer · Onboarding · PairPhone
│   └── debug/    AdbReceiver
└── remote/   app.jarvis.remote (celular)
    ├── discovery/ NsdDiscovery · ManualIp
    ├── pairing/   PairingFlow · TokenStore (Keystore)
    ├── api/       TvClient (OkHttp, fingerprint pinning) · EventStream (SSE) · RelayClient · SmartThingsOAuthFlow
    └── ui/        telas em Compose (toque)
```

O módulo `shared` é a única fonte do contrato da API: TV e celular nunca definem DTOs separados. O contrato do relay (seção 10) também fica em `shared`, para a TV e o celular usarem as mesmas classes.

## 5. Stack

- Kotlin + Jetpack Compose (for TV no app da TV; Material 3 no celular). Sem Python, Chaquopy, Kivy ou Termux.
- Persistência: Room (SQLite). Configurações na tabela `settings` via `ConfigManager` com `Flow`: mudou a config, os módulos reagem sem reiniciar.
- Segredos (chaves Gemini, AccessKey, tokens do SmartThings, tokens de pareamento): criptografados com Android Keystore (AES-GCM). `security-crypto` / `EncryptedSharedPreferences` está descontinuado: não usar. Segredo nunca aparece em log, backup ou tela.
- Áudio on-device: sherpa-onnx (AAR/JNI) para Whisper tiny/base, vozes Piper PT-BR, Silero VAD e keyword spotting. Fallback de TTS: `android.speech.tts.TextToSpeech`.
- Wake word: Porcupine (keyword embutida “Jarvis”; exige AccessKey gratuita da Picovoice) como padrão; fallback: keyword spotting do sherpa-onnx. Não usar openWakeWord.
- LLM local: módulo opcional, desligado por padrão (llama.cpp via JNI, GGUF Q4_K_M pequeno, ex.: Qwen2.5 0.5B Instruct; n_ctx 1024–2048). Com Allwinner e 2 GB, o “cérebro local” padrão é o motor de intents por regras (seção 8).
- Rede: OkHttp + kotlinx.serialization. A IA fica atrás de `LlmProvider` (hoje só `GeminiProvider`), para migrar de API sem refatorar.
- Servidor da TV para o celular: HTTPS leve (NanoHTTPD com `SSLServerSocketFactory`, ou Ktor CIO; escolha o de menor RAM). `TODO(verify)`.

## 6. Estados e modos de conversa

- Máquina de estados: `IDLE → LISTENING → THINKING → SPEAKING → IDLE`, mais `ERROR`. O overlay, a home e o app do celular espelham o estado.
- **Modo Comando (padrão):** fala → VAD → STT → roteador → TTS.
- **Modo Conversa contínua (estilo Gemini Live):** sessão da Live API aberta até silêncio de N segundos, frase de encerramento (“obrigado, Jarvis”) ou a tecla configurada. Se a conexão cair, degradar sozinho para Modo Comando e depois para offline.
- **Half-duplex por padrão:** o microfone fica mudo enquanto o Jarvis fala (TV e mic ficam perto: eco). Interromper = apertar a tecla configurada. Barge-in só é habilitado se o teste de eco na tela Escuta passar.
- Áudio: `AudioSource.VOICE_COMMUNICATION` + `AcousticEchoCanceler` / `NoiseSuppressor` quando disponíveis; pausar a wake word enquanto o TTS fala.
- Ducking: pedir `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` ao ouvir e ao falar. Opcional: abaixar ou mutar a TV controlada via SmartThings e restaurar depois.
- Bipes curtos gerados localmente ao detectar a wake word e ao começar a ouvir.

## 7. Gatilhos de ativação

- **A) Wake word “Jarvis”** em serviço em primeiro plano com `foregroundServiceType="microphone"` (cumprir as exigências de permissão do Android 14+ quando aplicável).
- **B) Tecla configurável do controle** via `AccessibilityService` (`onKeyEvent` + `FLAG_REQUEST_FILTER_KEY_EVENTS`). Não interceptar OK/`DPAD_CENTER` por padrão: isso quebra a navegação da TV inteira. Padrão: nenhuma tecla. Tela “Aprender tecla”: o usuário aperta o botão desejado (`KEYCODE_VOICE_ASSIST`, botões coloridos etc.) e só essa tecla é consumida. O onboarding explica como ligar a acessibilidade manualmente.
- **C) Overlay de status** (`TYPE_APPLICATION_OVERLAY`, `SYSTEM_ALERT_WINDOW`): ícone pequeno de estado (ocioso / ouvindo / pensando / falando / erro), com posição (4 cantos) e opacidade configuráveis. Informativo. Documentar que apps em tela cheia podem escondê-lo.
- **D) Botão “Falar agora”** na home da TV e no app do celular.

## 8. Roteador (`RequestRouter`)

1. **IntentEngine local** (regras, sem LLM): hora, data, timer/alarme, volume do Jarvis, modo silencioso, trocar personalidade, parear celular, comandos de casa (seção 10), clima (cache de 30–60 min). Resposta imediata, custo zero, log INFO.
2. **PrivacyGuard** (fail-closed): se a fala bater na lista de privacidade, responde só localmente ou recusa educadamente. Nunca vai para a nuvem.
3. **Cache:** só perguntas atemporais, com texto normalizado (minúsculas, sem acento nem pontuação) e TTL por tipo. Nunca cachear hora, clima, placar, notícia, estado de dispositivo.
4. **LLM local** (se habilitado e com RAM): usa a persona ativa; confiança baixa, resposta vazia ou falha → próxima etapa. Se usar o marcador `[PRECISO_PESQUISAR]`, comparar sem case e com trim; preferir saída estruturada.
5. **Limites:** se o limite configurado (seção 14) estourou ou todas as chaves estão em cooldown → responde “não posso consultar a nuvem agora, {{chamado}}” ou tenta o local.
6. **Gemini** (seção 9): mesma persona, rodízio de chaves, grounding quando preciso. Registra o uso.
7. Salva no cache (se cacheável), fala a resposta, registra o log.

## 9. Provedor de IA: somente Gemini

Cadeia fixa: Gemini (5 chaves em rodízio) → offline degradado. Não existe “pergunte ao Claude” nem outro provedor.

### Modelos e API

- Valores iniciais: modelo padrão `gemini-3.8-flash`; fallback `gemini-3.5-flash-lite`. Ambos constam na documentação do Google consultada em 01/11/2026.
- O dropdown é preenchido em runtime via `models.list`; não hardcode lista. Se um ID inicial não existir em `models.list`, escolha automaticamente o flash / flash-lite mais recente disponível e avise no log. Modelos 1.5 e 2.0 foram aposentados e os 2.5 (pro, flash e flash-lite) já foram desligados (data oficial 16/10/2026; alguns retornaram 404 antes disso): nunca usar. `TODO(verify)`.
- `temperature`, `top_p` e `top_k` estão descontinuados nos modelos novos. Não enviar por padrão nem mostrar na UI, a menos que o modelo escolhido aceite.
- Persona via `systemInstruction`. Para fatos atuais (placar, notícia, preço) usar a ferramenta de grounding com Google Search, com contador próprio (cota separada).
- STT na nuvem: modelo dedicado de transcrição da família Gemini (conferir o ID em `models.list`); fallback: modelo flash-lite com prompt de transcrição fiel em PT-BR. `TODO(verify)`.
- Modo Conversa: Live API (WebSocket, áudio ↔ áudio). **Não hardcode o ID:** modelos Live têm datas de aposentadoria próximas (o `gemini-live-2.5-flash-native-audio` sai em 13/12/2026). Descubra o ID vigente em `models.list` e na documentação (um agregador cita `gemini-3.8-live` como sucessor; não confirmado); se não houver modelo Live disponível, desligue o Modo Conversa e avise. TTS na nuvem opcional: modelo TTS da família Gemini (conferir ID e endpoint). `TODO(verify)`.
- A Interactions API é recomendada para recursos novos; mantenha o cliente atrás de `LlmProvider` para migrar sem refatorar.

### Chaves e rodízio (`KeyManager`): 5 chaves de e-mails diferentes

- 5 slots de chave Gemini (configurável até 10). Cada slot tem: rótulo (ex.: o e-mail da conta), chave, `project_group` (projeto do Google Cloud) e ligado/desligado.
- A cota do Gemini é **por projeto, não por chave**. Cada uma das 5 chaves deve ser criada numa conta Google diferente, no AI Studio, em projeto próprio. Chaves do mesmo projeto compartilham cota e são tratadas como um grupo único. O app do celular avisa quando dois slots parecem ser do mesmo projeto.
- Rodízio: distribuir as chamadas entre os grupos (round-robin, preferindo o grupo com menos uso na janela atual) para espalhar o limite por minuto. Pular grupos em cooldown.
- Em 429 / `RESOURCE_EXHAUSTED`: colocar a chave (ou o grupo) em cooldown (60 s para limite por minuto; até o reset para cota diária) e passar para a próxima chave na mesma requisição, sem o usuário perceber. Reset da cota diária: assumir meia-noite no fuso do Pacífico dos EUA e mostrar “volta às HH:mm (Brasília)”. `TODO(verify)`.
- Todas esgotadas → modo offline degradado, com aviso falado: “estou sem acesso à nuvem agora, {{chamado}}”. Intents locais seguem funcionando.
- Teste de chave: ao salvar, o app chama `models.list` com ela e mostra válida / inválida / sem cota (pelo celular e pela tela IA da TV).
- O Gemini não devolve headers `X-RateLimit-*`. Contar localmente: tokens vêm de `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`); requisições por minuto/dia vêm do contador próprio, comparado com limites que o usuário digita (os reais aparecem no AI Studio e mudam por tier). O erro 429 é a fonte da verdade.

## 10. Casa e utilidades

### SmartThings (TV e dispositivos)

Interface `SmartThingsClient` com três backends, escolha nas configurações: **OAuth direto** (padrão, abaixo), **MCP** (reserva) e **REST com token pessoal** (reserva).

### SmartThings via OAuth (padrão): botão “Conectar SmartThings”

É o “plugin”: o Jarvis Remote abre a autorização do SmartThings, o dono toca em Autorizar e o Jarvis passa a controlar os dispositivos sem nenhum token digitado.

**O relay já existe e você não o escreve.** Ele guarda o `client_id` e o `client_secret` (só nas variáveis do Render, nunca no APK, nunca no repositório do app). Por isso o app **não conhece o `client_id`**: ele abre o relay, e o relay manda o navegador para o SmartThings.

**Configuração do relay nos apps:** campo `RELAY_URL` em `BuildConfig` do Remote e da TV (valor inicial no topo deste documento), editável na tela Sistema do Remote e repassado à TV junto com os tokens. Sem barra no final.

### Contrato do relay (fixo; viver em `shared`)

| Chamada | Corpo | Resposta |
|---|---|---|
| `GET {RELAY_URL}/health` | — | 200 `{"ok":true}`. Usar como aquecimento. |
| `GET {RELAY_URL}/oauth/start?state=<state>` | — | 302 para a autorização do SmartThings. 400 se o `state` for inválido, 503 se o relay não estiver configurado. |
| `GET {RELAY_URL}/oauth/callback?code=..&state=..` | — | 200, página HTML que abre `jarvisremote://smartthings?code=..&state=..`. (Quem chama é o SmartThings/navegador, não o app.) |
| `POST {RELAY_URL}/oauth/token` | JSON `{"code":"..."}` | A resposta do SmartThings repassada sem alterar (200 com tokens, ou 400 `{"error":"invalid_grant"}` etc.). 503 `{"error":"relay_nao_configurado"}`. |
| `POST {RELAY_URL}/oauth/refresh` | JSON `{"refresh_token":"..."}` | Idem. |

Regras de `state`: gerado no Remote com `SecureRandom`, 32 caracteres de `A-Z a-z 0-9` (o relay só aceita 16 a 128 caracteres de `A-Z a-z 0-9 . _ ~ -`). Guardado em memória até o retorno, vale 10 minutos, comparado em tempo constante e descartado depois de usado.

O corpo de sucesso do SmartThings deve ser lido de forma tolerante (`access_token`, `refresh_token`, `expires_in`, `scope`, demais campos ignorados). `TODO(verify)`: campos exatos.

### Fluxo

1. No Jarvis Remote, tela “Conectar SmartThings” → botão “Conectar”. Ao abrir a tela, o app faz `GET /health` de aquecimento (o relay no plano free hiberna). Se demorar, mostra “acordando o servidor, até 1 minuto” (timeout de 60 s na primeira chamada).
2. O app gera o `state` e abre no navegador (Custom Tabs ou `ACTION_VIEW`) `{RELAY_URL}/oauth/start?state=<state>`. O relay redireciona para `https://api.smartthings.com/oauth/authorize` com `client_id`, `scope`, `response_type=code`, `redirect_uri` e `state`. `TODO(verify)`: caminho exato da autorização (o relay usa `/oauth/authorize` por padrão).
3. O dono entra na conta, escolhe a localização e autoriza. O SmartThings redireciona para `{RELAY_URL}/oauth/callback?code=…&state=…`.
4. O relay devolve uma página que abre `jarvisremote://smartthings?code=…&state=…` (redirecionamento automático, botão “Abrir Jarvis Remote” e intent de fallback). O manifest do Remote registra esse esquema: `intent-filter` com `ACTION_VIEW`, categorias `DEFAULT` e `BROWSABLE`, `scheme=jarvisremote`, `host=smartthings`; a activity que o recebe usa `launchMode="singleTask"`.
5. O app confere o `state` e chama `POST /oauth/token` no relay com `{"code": …}`.
6. O relay troca o código por tokens usando o `client_secret` e devolve a resposta. Ele não guarda nada.
7. O Remote envia os tokens para a TV pelo canal pareado (`PUT /v1/smartthings/oauth`, só escrita) e **não guarda** os tokens depois de enviar. A TV guarda cifrado (Keystore, tabela `secrets`) e, daí em diante, fala direto com `api.smartthings.com/v1`, sem passar pelo MCP.
8. A TV consulta `GET /v1/locations` e grava o nome da localização escolhida (e `expires_at` calculado a partir de `expires_in`) para o Remote mostrar “Conectado a {{localização}}”.

### Renovação

O token de acesso dura 24 h e o de renovação expira em 29 dias sem uso; cada renovação devolve um novo, e a TV grava sempre o mais recente (gravar o novo **antes** de usar o novo token; nunca perder o par). A TV renova sozinha chamando `POST {RELAY_URL}/oauth/refresh` com `{"refresh_token": …}` direto do aparelho (a TV tem internet; não passa pelo celular): uma vez por dia, ao abrir o app e antes de um comando se faltar menos de 1 h. Antes de renovar, fazer `GET /health` de aquecimento, com timeout de 60 s. Se vier `invalid_grant`, ela fala “preciso que você autorize o SmartThings de novo pelo celular” e o Remote mostra o aviso. Falha de rede ou relay dormindo não apaga os tokens: tenta de novo depois.

### Cadastro único do app OAuth (fora deste projeto)

O SmartThings só documenta esse tipo de app (OAuth-In, `API_ONLY`) pela CLI, que exige PC. Por isso o relay tem `/setup` e `/setup/register`, que fazem o cadastro por HTTP com um token pessoal colado na hora e não guardado, num prompt separado de publicação. Escopos: `r:devices:*`, `w:devices:*`, `x:devices:*`, `r:locations:*`. Plano B, uma única vez: rodar a CLI num terminal na nuvem (ex.: GitHub Codespaces, pelo navegador do celular). O app mostra “relay ainda não configurado” se `/oauth/start` responder 503.

### MCP (reserva)

Conector próprio do dono, hospedado no Render (plano gratuito). URL inicial editável: `https://smartthings-npm.onrender.com/mcp`.

Estado informado por uma leitura anterior da conta Render (01/11/2026, sem alterar nada; **não reverificado ao escrever esta versão**): o serviço `smartthings-npm` (Node, plano free, região Oregon) estava ativo, com último deploy “live” e endpoint `/mcp`, respondendo a `initialize`, `notifications/initialized` e `tools/list`. Não verificado: chamadas reais de `tools/call` (nomes e parâmetros) e se o token do SmartThings guardado no servidor ainda é válido. Por isso a tela Casa precisa de um “Testar conexão” (abaixo).

Cliente MCP mínimo (JSON-RPC sobre HTTP):

- Fluxo: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`. Enviar `protocolVersion` `2025-11-25` no `initialize` e aceitar a versão negociada na resposta. Não depender de `server/discover`. Aceitar resposta JSON ou SSE e guardar o header de sessão, se o servidor devolver. `TODO(verify)`.
- Ferramentas conhecidas: `listar_dispositivos`, `listar_comodos`, `ligar_dispositivo`, `desligar_dispositivo`, `enviar_comando`, `status_dispositivo`. Descobrir nomes de parâmetros via `tools/list` em runtime, nunca assumir. `TODO(verify)`.
- **Testar conexão** (botão no celular e na tela Casa da TV), com cada etapa reportada separadamente: servidor acordou → `initialize` ok → `tools/list` ok → `status_dispositivo` da TV ok. Mostrar em qual etapa falhou e a causa em português. Para o backend OAuth, o teste é: tokens presentes → renovação possível → `GET /v1/devices/{id}/status` da TV ok.

### REST direto (`api.smartthings.com/v1`) com token pessoal

Alternativa sem o servidor. Avisar na UI que tokens pessoais do SmartThings podem expirar (em torno de 24 h) e mostrar o erro de forma clara. `TODO(verify)`.

### Boas práticas obrigatórias, vindas de problemas reais desse conector

- Servidor gratuito hiberna (vale para o MCP e para o relay). Fazer um GET de aquecimento na URL base ao abrir o app e ao detectar um comando de casa (qualquer resposta HTTP = acordado); timeout de 60 s na primeira chamada e falar “um instante, estou acordando o servidor”. No backend OAuth, comandos de casa falam direto com `api.smartthings.com` e **não** dependem do relay, exceto na renovação.
- Falas distintas e claras, nunca erro genérico, para: servidor dormindo, token do SmartThings expirado (“o token do SmartThings expirou, precisa renovar”), dispositivo desligado/offline, e dispositivo não encontrado.
- Apelidos falados (`DeviceAliases`): tabela “nome falado → deviceId”, editável no app do celular, com sinônimos. Valor inicial: apelido “TV” (sinônimos “televisão”, “tv da sala”) → `c84df61d-24ca-713a-ceef-01a55f51b0fa`.
- Comandos: ligar, desligar, volume (subir, descer, definir), mudo, trocar entrada ou canal quando o dispositivo suportar, e consultar estado. Confirmar por voz de forma curta (“TV desligada”).
- Ações com efeito difícil de desfazer (desligar tudo) pedem confirmação falada.

### Clima

Cidade padrão Juatuba (MG), configurável. API gratuita Open-Meteo (geocoding + forecast), sem chave; não hardcode coordenadas, resolva pelo geocoding. `TODO(verify)`.

### Hora e data

Sempre do relógio do aparelho com fuso `America/Sao_Paulo`; nunca do cache nem do modelo.

## 11. App do celular (Jarvis Remote) e pareamento por PIN

Substitui totalmente o antigo painel web com QR code. Não existe página HTML servida pela TV. O celular tem um app de verdade, que conversa com a TV por uma API local protegida.

### Fluxo para o dono

1. Na TV: Configurações → Celular → “Parear novo celular” (ou por voz: “Jarvis, parear celular”). A TV mostra um PIN de 6 dígitos, o nome da TV e o IP:porta. Sem QR code.
2. No celular: abrir o Jarvis Remote. Ele procura a TV na rede (mDNS/NSD, serviço `_jarvistv._tcp`) e lista “Jarvis TV”. Se não achar, campo para digitar o IP manualmente.
3. Digitar o PIN. Pareou: a TV mostra “Celular pareado: {{nome}}” e o app abre na tela Início.
4. Depois do pareamento o app reconecta sozinho, sem PIN. A TV lista os celulares pareados e permite “Esquecer celular”.

### Segurança do pareamento

- Servidor HTTPS na TV com certificado autoassinado gerado no Android Keystore (EC P-256, chave não exportável). O celular guarda o fingerprint SHA-256 do certificado e faz pinning (TrustManager próprio **só** para a TV; as chamadas ao relay e ao SmartThings usam a confiança padrão do sistema). Se o fingerprint mudar, o app alerta e exige novo pareamento.
- O PIN é gerado com `SecureRandom`, vale 5 minutos, é de uso único e nunca trafega. O modo pareamento só abre pela TV (tela ou voz) e fecha sozinho.
- Prova do PIN: o celular e a TV trocam nonces e cada lado envia `HMAC-SHA256(chave = PIN, dados = papel ‖ nonceCelular ‖ nonceTV ‖ fingerprint do certificado)`. Os dois lados verificam a prova do outro. Isso amarra o PIN ao certificado visto e impede que um intermediário que não sabe o PIN se passe pela TV.
- Terminado o pareamento, a TV emite um token aleatório de 256 bits. A TV guarda só o hash do token (SHA-256) e o nome do aparelho; o celular guarda o token no Keystore. Toda requisição leva `Authorization: Bearer <token>`.
- 5 PINs errados bloqueiam o pareamento por 5 minutos e invalidam o PIN atual. O servidor só aceita IPs de rede local/privada e limita a taxa de requisições.
- Use só primitivas padrão (TLS, HMAC-SHA256, `SecureRandom`). Não invente criptografia. Risco residual a documentar: com PIN de 6 dígitos, quem estiver na mesma Wi-Fi e capturar o pareamento pode tentar adivinhar o PIN offline; aceitável em rede doméstica. Se existir biblioteca confiável de PAKE (ex.: SPAKE2), prefira-a. `TODO(verify)`.
- Segredos são só de escrita: o celular envia a chave, a TV guarda cifrada, e a API nunca devolve o valor salvo, só rótulo e os 4 últimos caracteres. O celular não guarda a chave depois de enviá-la.

### API local (versionada, `/v1`)

Contrato no módulo `shared`. TV e celular checam a versão da API ao conectar e avisam se estiverem incompatíveis.

- `GET /state` e `GET /events` (SSE): estado ao vivo (ocioso / ouvindo / pensando / falando), última pergunta e resposta, internet, chaves ativas, RAM.
- `GET/PUT /config`: configurações. `ConfigManager` aplica sem reiniciar. Inclui `RELAY_URL` e a AccessKey da Picovoice (só escrita).
- `PUT /gemini-keys/{slot}` (só escrita), `GET /gemini-keys` (rótulo, projeto, últimos 4, ativa / cooldown até HH:mm), `POST /gemini-keys/{slot}/test`.
- CRUD de personalidades, apelidos de dispositivos, lista de privacidade, limites.
- `GET /usage`, `GET /logs`, `POST /say` (falar um texto), `POST /listen` (“Falar agora”), `POST /smartthings/test`, `GET/POST /backup` (JSON sem segredos).
- `GET /paired-devices`, `DELETE /paired-devices/{id}`.
- SmartThings OAuth: `PUT /v1/smartthings/oauth` (só escrita: recebe `access_token`, `refresh_token`, `expires_in`), `GET /v1/smartthings/oauth` (conectado, localização, expiração) e `DELETE /v1/smartthings/oauth`.

### Telas do Jarvis Remote

Pareamento · Início (estado ao vivo + “Falar agora”) · Chaves Gemini (5 slots, teste de cada chave, aviso de projeto repetido) · Personalidades (CRUD) · Casa (apelidos, “Testar conexão”, URL do conector) · Privacidade · Limites e gastos · Logs (filtrar, copiar, exportar) · Sistema e backup (inclui `RELAY_URL`).

**Conectar SmartThings** (tela nova do Remote): inicia o OAuth da seção 10, mostra “Conectado a {{localização}}” ou “Não conectado”, a validade do token e o botão “Desconectar”.

- Tema escuro, toque, texto legível. Salvar na tela = a TV passa a usar na hora.
- Se a TV estiver fora de alcance: mostrar “TV não encontrada”, oferecer IP manual e guardar rascunho local (sem segredos).
- Mesma rede Wi-Fi é obrigatória. Roteadores com “isolamento de clientes” bloqueiam mDNS: o fallback é o IP manual. Documentar.
- Instalação do celular: APK baixado e aberto com a opção “instalar apps desconhecidos” liberada. Incluir o passo a passo no README.

## 12. Personalidades (estilo Gems)

Perfis com: nome; system prompt (variáveis `{{nome_usuario}}`, `{{hora_atual}}`, `{{data_atual}}`, `{{idioma}}`, `{{cidade}}`); tom (formal ↔ casual); verbosidade (conciso ↔ detalhado); idioma (PT-BR / EN / ES / auto); como chamar o usuário (`{{chamado}}`); assinatura opcional; voz preferida do perfil.

- CRUD completo: criar, duplicar, renomear, excluir, ativar. Presets: “JARVIS clássico” (formal, sarcástico, PT-BR), “Neutro” e “Custom”.
- Troca por voz (“Jarvis, mude para o perfil X”) resolvida no IntentEngine, com fuzzy match no nome.
- Prompt final = persona + regras de fala (respostas curtas, sem markdown, sem emoji, números por extenso quando ajudar o TTS) + contexto dinâmico. A mesma persona vale para o local e para o Gemini.

## 13. Interface da TV e configurações

**Home:** estado atual, última pergunta e resposta, botão “Falar agora”, indicadores (internet, chaves ativas, RAM, celular pareado, SmartThings conectado) e atalhos. Tudo navegável por D-pad.

Configurações (abas por D-pad, tudo ligado ao `ConfigManager`; o que for longo de digitar aponta para o app do celular):

- **Voz (TTS):** motor (Piper / Android / Gemini TTS), voz, velocidade, volume, modo silencioso (só texto).
- **Escuta (STT):** motor (nuvem / Whisper local), modelo, microfone USB, teste de nível, teste de eco, sensibilidade, VAD, duração máxima.
- **Wake word:** motor, sensibilidade, AccessKey (digitada pelo celular).
- **Conversa:** Modo Comando ou Modo Conversa contínua, silêncio de encerramento, tecla de interromper.
- **IA:** ordem dos modelos, status das 5 chaves (ativa / cooldown até HH:mm), modelo, nível de raciocínio, tokens máximos, grounding.
- **Casa:** backend SmartThings (OAuth / MCP / REST), status da conexão OAuth, URL do MCP, apelidos, Testar conexão, ducking da TV.
- **Celular:** parear novo celular (PIN), lista de celulares pareados, esquecer, porta.
- **Modelo local (opcional):** GGUF, n_ctx, threads.
- **Personalidade, Privacidade** (lista que nunca vai para a nuvem + aviso de que no Modo Conversa o áudio vai para o Google), **Cache, Interface** (idioma, tema, posição e opacidade do overlay), **Logs, API/Gastos.**
- **Sistema:** versão, ABI, chip, Android, RAM, backup/restore, reiniciar, limpar dados.

## 14. Uso, limites e custos

- Tabela `api_usage`: ts, rótulo da chave (nunca o valor), modelo, tokens de entrada/saída, buscas de grounding, custo estimado, latência, origem (fallback / conversa / teste), status HTTP.
- Tabela de preços editável, por modelo (USD por 1M tokens), sem preço hardcoded. Sem billing ativo (tier gratuito): custo = 0 e a UI mostra tokens e requisições.
- Limites configuráveis: requisições por minuto e por dia, tokens por dia, gasto diário/semanal/mensal, por grupo de projeto e no total. 80% → notificação; 100% → bloqueia a nuvem (hard) ou só avisa (soft).
- Tela de gastos (TV e celular): resumo (hoje / semana / mês / projeção), barras dos últimos 30 dias desenhadas com Canvas do Compose (sem lib pesada), tabela das últimas N chamadas, status por chave, cache hits, exportar CSV, resetar contadores.
- Texto fixo: “Valores são estimativas baseadas em tokens contados localmente.” Billing real via GCP está fora de escopo.

## 15. Logs

Room (`logs`) + arquivo rotativo (5 MB × 3). Níveis DEBUG → FATAL; módulos: stt, tts, wake, brain, ai, home, ui, audio, remote, system. Tela com filtros (nível, módulo, data), busca, copiar, exportar TXT/JSON e limpar; o celular também lê e exporta.

`Thread.setDefaultUncaughtExceptionHandler` grava antes de morrer e notifica “Jarvis teve um erro — ver logs”. Mesmo erro 3× em 10 min → agrupa e notifica uma vez. Chaves, tokens (inclusive o `code` e o `state` do OAuth), PIN e AccessKey nunca aparecem em log.

## 16. Banco (Room)

`settings(key, value, updated_at)` · `cache(hash, question, answer, source, ttl_expires_at, created_at)` · `api_keys(id, slot, label, project_group, encrypted_value, cooldown_until, enabled)` · `secrets(key, encrypted_value, updated_at)` (AccessKey da Picovoice, tokens do SmartThings; valores cifrados com Keystore; metadados não secretos como localização e `expires_at` ficam em `settings`) · `api_usage(...)` · `logs(...)` · `personalities(...)` · `privacy_blocklist(word)` · `device_aliases(spoken_name, synonyms, device_id, backend)` · `paired_devices(id, name, token_hash, created_at, last_seen_at)` · `timers(...)`. Migrations versionadas.

## 17. Entregas (pare ao fim de cada uma)

**Entrega 1: Base, voz na nuvem e pareamento.** Projeto Gradle com os 3 módulos, manifests, Leanback launcher, serviço em primeiro plano, overlay de estado, Room + ConfigManager, logs + crash handler, tela Sistema, onboarding de permissões, mic USB + VAD, STT na nuvem, TTS do Android, `GeminiProvider` com `KeyManager` (5 slots, rodízio, cooldown) e `UsageTracker`, tecla configurável, wake word, Modo Comando, intents de hora/data, `AdbReceiver`. Servidor HTTPS da TV + NSD + pareamento por PIN + Jarvis Remote básico (parear, Início ao vivo, Chaves Gemini com teste, personalidade ativa). Dois APKs testáveis.

**Entrega 2: Produto.** IntentEngine completo, SmartThings via OAuth (Conectar SmartThings no celular usando o relay da seção 10; MCP e REST como reserva) com aliases, aquecimento e “Testar conexão”, clima, cache, personalidades (CRUD), configurações completas, dashboard, visualizador de logs, offline degradado, Modo Conversa (Live API), Piper e Whisper local (sherpa-onnx), ducking. Jarvis Remote com todas as telas da seção 11. Pré-requisito do teste de ponta a ponta do OAuth (fluxo L): relay publicado e com `ST_CLIENT_ID`/`ST_CLIENT_SECRET` preenchidos. Sem isso, entregue o código, teste o que for possível com o MCP e diga no relatório que o fluxo L não foi verificado.

**Entrega 3: Opcional e polimento.** LLM local (llama.cpp, JNI, ABIs corretas, só se a RAM permitir), backup/restore completo, refinamentos de UI, README final.

## 18. Entregáveis e aceite

Por entrega: árvore de diretórios; todos os arquivos completos (incluindo `build.gradle.kts` e `AndroidManifest.xml` de cada módulo); `JarvisTV-<versão>.apk` e `JarvisRemote-<versão>.apk`, cada um com uma cópia `.zip` (o dono renomeia ao baixar); instruções de instalação sem PC (gerenciador de arquivos da TV ou ADB por Wi-Fi para a TV; download direto para o celular); checklist de teste; relatório (seção 2).

Auxílio de teste (só build debug): `adb shell am broadcast -a app.jarvis.tv.SAY --es text "que horas são"` injeta uma fala em texto no roteador.

README final: instalação na TX9 e no celular, permissões (overlay, microfone, acessibilidade, notificações), microfone USB, pareamento por PIN, como criar as 5 chaves em 5 contas, personalidades, SmartThings (incluindo o relay e o `RELAY_URL`), dashboard e limites, exportar logs.

## 19. Fluxos de aceite

- **A)** “que horas são?” → intent local → TTS → INFO → custo zero.
- **B)** “quem ganhou o Brasileirão ano passado?” → sem resposta local → checa limites → Gemini com grounding → registra uso → TTS (não vai para o cache).
- **C)** “Jarvis, mude para o perfil formal” → intent local → próxima resposta já no novo tom.
- **D)** Limite diário atingido → recusa a nuvem e fala “não posso consultar a nuvem agora, senhor”.
- **E)** Chave 1 dá 429 → rodízio para a chave 2 na mesma requisição → log WARN → resposta normal.
- **F)** As 5 chaves esgotadas → offline degradado: intents locais seguem; o resto avisa que está sem nuvem.
- **G)** Termo da lista de privacidade → nunca sai do aparelho.
- **H)** “desliga a TV” → aquecimento do servidor se preciso → SmartThings → “TV desligada”. Com o servidor dormindo, fala que está acordando. Token expirado e TV offline geram falas diferentes.
- **I)** Pareamento: a TV mostra o PIN, o celular encontra a TV, o PIN certo pareia, o app mostra o estado ao vivo; PIN errado 5× bloqueia por 5 minutos.
- **J)** Dono abre o Jarvis Remote, cola uma chave nova no slot 3, o teste confirma “válida”, e a TV passa a usá-la sem reiniciar.
- **K)** Celular fora da rede da TV → “TV não encontrada”, sem travar nem perder rascunho.
- **L)** Dono toca em “Conectar SmartThings” no Remote, autoriza no SmartThings, o app volta sozinho com “Conectado a {{localização}}”, e “desliga a TV” funciona sem servidor MCP e sem token digitado. Depois de 24 h o token é renovado sem o dono perceber.
- **M)** Relay dormindo ou sem configuração: o Remote mostra “acordando o servidor” (até 1 minuto) ou “relay ainda não configurado”, sem travar; comandos de casa já conectados continuam funcionando, pois não dependem do relay.

## 20. Limitações a documentar

Overlay some sob apps em tela cheia · acessibilidade precisa ser ligada manualmente · Android 32 bits e RAM de 2 GB limitam o modo local · eco entre TV e microfone (por isso half-duplex) · conector MCP no plano gratuito hiberna · tokens pessoais do SmartThings podem expirar · se a TV ficar mais de 29 dias sem usar o SmartThings, o token de renovação expira e é preciso autorizar de novo pelo celular · o relay OAuth no plano gratuito hiberna (só atrasa a conexão e a renovação) · celular e TV precisam estar na mesma Wi-Fi e roteadores com isolamento de clientes bloqueiam a descoberta automática · PIN de 6 dígitos tem risco residual de adivinhação offline em rede comprometida · cota do Gemini é por projeto: só 5 contas/projetos diferentes dão 5 cotas · modelos Gemini (inclusive o Live) têm datas de aposentadoria: os IDs vêm de `models.list`.
