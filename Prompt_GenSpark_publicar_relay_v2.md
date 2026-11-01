# Prompt GenSpark: publicar o relay OAuth do Jarvis TV (v2)

Copie tudo abaixo desta linha para a GenSpark e anexe os 4 arquivos: `server.js`, `package.json`, `.gitignore` e `README.md`.

---

Você é um agente de engenharia. Sua tarefa: publicar um pequeno serviço Node chamado `jarvis-oauth-relay` num repositório novo do GitHub e num serviço novo do Render, e conferir que ele responde. Não escreva nem altere o código do serviço: ele já foi escrito e testado localmente (24 testes) contra um SmartThings simulado.

## 1. Contexto

O serviço é a ponte do login OAuth do SmartThings para o app Android Jarvis Remote. Ele não guarda nada (sem banco, sem disco). O dono usa só o celular, nunca PC. O dono já tem um serviço Render chamado `smartthings-npm` (outro projeto, em produção): não toque nele e não use o repositório dele.

O app Jarvis Remote e o app Jarvis TV são construídos por outro prompt. Eles dependem de duas coisas que este trabalho entrega: a URL pública do relay e o cadastro do app OAuth (client id e secret nas variáveis do Render).

## 2. Arquivos (anexos)

Use os anexos exatamente como vieram e confira o SHA-256 de cada um antes de publicar.

| Arquivo | Bytes | SHA-256 |
|---|---|---|
| `server.js` | 13075 | `2eaed1578a585036bdd1ccabbdcc9c97345884410dc5ac25dcd3e4707cdd6f7f` |
| `package.json` | 253 | `1c50b95ef4bc27ffb7dc7b2e29159e0e8b3c2e6ca251ce82e362212fb1675c5e` |
| `.gitignore` | 19 | `a8db166167d30d2c36fa95cc3163e77a4bc33205ede3b81a368750f25ded3879` |
| `README.md` | 1896 | `95676010e43699510bb26dfe537210774cfced5634fea65d9c606b6466aae123` |

Se um anexo não chegou ou o hash não bate, pare e avise o dono. Nunca reescreva o código de memória. Se o celular do dono não conseguir anexar `.gitignore` (arquivo oculto), crie-o com exatamente duas linhas: `node_modules/` e `.env`. É a única exceção.

Versões antigas do `server.js` (as que vieram em PDF) estão obsoletas: não use.

## 3. GitHub

1. Crie o repositório `jarvis-oauth-relay` na conta do dono. Privado se o Render já tiver acesso à conta do GitHub dele; se não tiver, público (o código não contém segredos).
2. Envie na raiz os 4 arquivos. Branch `main`.

## 4. Render

Crie um Web Service novo, no workspace que o dono já usa:

- Nome: `jarvis-oauth-relay`. Runtime: Node. Plano: free. Região: Oregon.
- Repositório: o do passo 3, branch `main`, deploy automático ligado.
- Build command: `npm install`. Start command: `npm start`.
- Variáveis de ambiente:
  - `PUBLIC_URL`: a URL pública real do serviço, sem barra no final (ex.: `https://jarvis-oauth-relay.onrender.com`). Se o nome estiver ocupado e o Render acrescentar um sufixo, use a URL que ele realmente atribuiu e corrija a variável logo depois da criação. **Ela precisa estar certa antes do cadastro do dono (seção 7)**, porque o cadastro grava essa URL no SmartThings.
  - `SETUP_SECRET`: uma senha aleatória de pelo menos 24 caracteres, gerada por você. Mostre-a ao dono uma única vez no relatório final.
- Não crie `ST_CLIENT_ID` nem `ST_CLIENT_SECRET`: o dono os preenche depois (seção 7).

## 5. Verificação (só diga que passou se você executou)

O plano free hiberna: a primeira chamada pode levar cerca de 60 s. Teste na URL pública:

| Teste | Resultado esperado |
|---|---|
| `GET /health` | status 200 e corpo `{"ok":true}` |
| `GET /oauth/callback?code=teste&state=x` | status 200, página com o botão “Abrir Jarvis Remote” |
| `GET /oauth/callback?error=access_denied` | status 400, página “Autorização cancelada” |
| `GET /oauth/start?state=abcdefghijklmnop1234` | status 503, página “Relay não configurado” (esperado, ainda sem client id) |
| `POST /oauth/token` com corpo `{"code":"x"}` | status 503 e `{"error":"relay_nao_configurado"}` (esperado, ainda sem client id) |
| `POST /oauth/refresh` com corpo `{"refresh_token":"x"}` | status 503 e `{"error":"relay_nao_configurado"}` |
| `GET /setup` | status 200, formulário |

Se algum resultado for diferente, copie o status e o corpo exatos no relatório e não tente consertar adivinhando.

## 6. Regras

- Não altere `server.js` nem `package.json`. Se achar que há um erro, descreva-o no relatório.
- Não toque no serviço `smartthings-npm` nem no repositório dele.
- Use só as conexões (GitHub, Render) que o dono já autorizou. Nunca peça senha de conta ao dono nem tente burlar login.
- Nenhum segredo vai para o repositório, para o README ou para logs.
- Se faltar acesso ao GitHub ou ao Render, pare e entregue ao dono o passo a passo exato, pensado para fazer só pelo celular.
- Não diga que algo foi testado ou publicado se não foi.

## 7. Relatório final e o que o dono faz depois

Entregue: URL do repositório, URL do serviço (a real, confirmada igual ao `PUBLIC_URL`), o `SETUP_SECRET` (uma vez), a tabela de testes com os resultados reais e o que não foi feito.

Depois, diga ao dono, em passos curtos, o cadastro único. O dono faz isso sozinho, sem enviar token nem segredo a você:

1. No celular, gerar um token pessoal em `https://account.smartthings.com/tokens`, incluindo a permissão de criar aplicativos além das de dispositivos e locais. `TODO(verify)`: nome exato dessa permissão.
2. Abrir `<URL do serviço>/setup`, digitar o `SETUP_SECRET`, colar o token e tocar em Cadastrar.
3. Copiar o client id e o client secret mostrados (a tela não aparece de novo) para as variáveis `ST_CLIENT_ID` e `ST_CLIENT_SECRET` no painel do Render, e deixar o serviço reiniciar.
4. Apagar a variável `SETUP_SECRET`.
5. Guardar a URL do serviço: ela vai no prompt de construção do Jarvis (campo `RELAY_URL`) e, depois, no app Jarvis Remote, na tela Sistema.

Se o cadastro der erro, o dono deve mandar o texto da tela de erro para o Claude: o endpoint de cadastro foi escrito a partir de relatos da comunidade e não está confirmado na documentação oficial do SmartThings. O plano B é rodar a CLI do SmartThings num terminal na nuvem (por exemplo, GitHub Codespaces pelo navegador do celular).
