# jarvis-oauth-relay

Ponte do login OAuth do SmartThings para o app Android **Jarvis Remote**. Não guarda nada: sem banco, sem disco, sem log de token. Node 18+, sem dependências.

## Endpoints

| Método e caminho | Para que serve |
|---|---|
| `GET /health` | Teste e aquecimento. Responde `{"ok":true}`. |
| `GET /oauth/start?state=...` | O app abre este endereço no navegador. O relay redireciona (302) para a autorização do SmartThings com `client_id`, `scope`, `redirect_uri` e `state`. O `state` tem de ter 16 a 128 caracteres de `A-Z a-z 0-9 . _ ~ -`. |
| `GET /oauth/callback` | Destino do SmartThings. Devolve uma página que abre `jarvisremote://smartthings?code=...&state=...`, com botão de reserva. |
| `POST /oauth/token` | Corpo JSON `{"code":"..."}`. Troca o código por tokens e devolve a resposta do SmartThings sem alterar. |
| `POST /oauth/refresh` | Corpo JSON `{"refresh_token":"..."}`. Renova e devolve a resposta do SmartThings sem alterar. |
| `GET /setup` e `POST /setup/register` | Cadastro único do app OAuth no SmartThings. Só funciona enquanto existir `SETUP_SECRET`. |

Sem `ST_CLIENT_ID` e `ST_CLIENT_SECRET`, `/oauth/start`, `/oauth/token` e `/oauth/refresh` respondem 503 (`relay_nao_configurado` no JSON).

## Variáveis de ambiente

| Variável | Valor |
|---|---|
| `PUBLIC_URL` | URL pública do serviço, sem barra no final. Tem de ser igual à usada no cadastro. |
| `ST_CLIENT_ID` | Preenchida depois do cadastro em `/setup`. |
| `ST_CLIENT_SECRET` | Idem. Nunca vai para o repositório nem para o APK. |
| `SETUP_SECRET` | Senha para abrir `/setup`. Apague depois de cadastrar. |
| `ST_API_BASE` | Opcional. Padrão `https://api.smartthings.com`. |
| `ST_AUTHORIZE_PATH` | Opcional. Padrão `/oauth/authorize`. |

## Rodar

```
npm install
npm start
```

Limites: 30 requisições por minuto por IP; 10 tentativas de cadastro a cada 15 minutos.
