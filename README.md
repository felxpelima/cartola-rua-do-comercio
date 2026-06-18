# Liga Rua do Comércio

Plataforma pública + painel admin para a liga local criada no Cartola FC Copa do Mundo 2026.

## O que já faz

- Página pública com premiação, pódio, ranking geral, ranking da rodada e badges.
- Perfil público por participante com estatísticas, histórico e resumo compartilhável.
- Painel admin protegido por senha.
- Busca de times no Cartola Copa.
- Vínculo de participante com `time_id` do Cartola.
- Sincronização automática da rodada via backend.
- Fallback manual para operar mesmo se a API falhar.
- Banco relacional com participantes, rodadas, pontuações, logs de sync e payload bruto do Cartola.

## Stack

- Site estático: `index.html`, `landing.js`, `styles.css`.
- Admin: `admin.html`, `admin.js`.
- APIs Vercel Serverless: `api/`.
- Banco: Prisma Postgres.
- ORM: Prisma.

## Configuração

```bash
npm install
npx vercel link
npx vercel env pull .env
npx prisma db push
```

Variáveis:

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão Prisma Postgres. |
| `ADMIN_PASSWORD` | Senha do painel `/admin`. |
| `JWT_SECRET` | Segredo do token de login. |
| `CRON_SECRET` | Segredo opcional para disparar sync por cron externo. |

## Como operar

1. Entre em `/admin`.
2. Configure premiação e identidade.
3. Busque cada time no Cartola e adicione/vincule ao participante.
4. Clique em `Salvar e publicar`.
5. Clique em `Sincronizar rodada`.
6. Confira a página pública.

## APIs internas

| Endpoint | Método | Acesso | Função |
|---|---|---|---|
| `/api/data` | GET | Público | Retorna estado da liga. |
| `/api/data` | POST | Admin | Salva configuração/participantes. |
| `/api/login` | POST | Público | Gera token admin. |
| `/api/cartola-search` | GET | Admin | Busca times no Cartola. |
| `/api/sync-cartola` | POST | Admin | Sincroniza rodada. |
| `/api/sync-cartola?secret=...` | GET | Cron | Sincroniza via rotina externa. |

## Páginas

| Rota | Função |
|---|---|
| `/` | Classificação geral, premiação, rodada e conquistas. |
| `/participant?id=ID` | Perfil individual com estatísticas e histórico. |
| `/admin` | Painel do organizador. |

## Testes e debug local

```bash
npm run verify
npm run probe:cartola
```

O `verify` roda sintaxe JS, valida Prisma e executa os testes locais. O `probe:cartola` consulta endpoints públicos do Cartola Copa e mostra status/latência sem gravar no banco.

## Cron / placar ao vivo

A home mostra estado `AO VIVO` com pontos parciais sempre que uma sincronização recente trouxer rodada em andamento, e atualiza sozinha a cada 60s. Para isso ser automático (sem clicar em "Sincronizar"), algo precisa chamar `/api/sync-cartola` de tempos em tempos.

### Cron externo grátis (cron-job.org) — recomendado no plano Hobby

No plano grátis da Vercel o cron nativo só roda **1x por dia**. Para atualizar de poucos em poucos minutos durante os jogos, use um cron externo gratuito:

1. Crie uma conta em <https://cron-job.org> (grátis).
2. Crie um cronjob (método **GET**) apontando para:
   ```text
   https://SEU_DOMINIO.vercel.app/api/sync-cartola?secret=SEU_CRON_SECRET
   ```
3. Intervalo recomendado: **a cada 5 minutos** durante os jogos. Nas opções do cron-job.org dá para restringir aos dias/horários de jogo e economizar cota.
4. Salve. Cada execução sincroniza todos os times vinculados e grava log em `SyncRun`.

Notas:

- A env `CRON_SECRET` precisa estar configurada na Vercel — é o que autentica a chamada (também aceita o header `x-cron-secret`).
- O endpoint está com `export const config = { maxDuration: 60 }` para conseguir sincronizar todos os participantes dentro do limite de função do Hobby.
- Não exagere no intervalo: cada sync faz 1 chamada ao Cartola por participante. A cada 5 min durante os jogos é tranquilo; 1 min 24/7 desperdiça cota à toa.

### Vercel Cron (backup diário)

O `vercel.json` já agenda um sync diário (`0 23 * * *`), que funciona em qualquer plano. O Vercel Cron envia `Authorization: Bearer $CRON_SECRET` automaticamente. No plano **Pro** dá para deixá-lo frequente direto no `vercel.json` (ex.: `*/5 * * * *`) e dispensar o cron externo.

## Arquivos principais

```text
api/cartola-search.js     busca times no Cartola
api/sync-cartola.js       sincroniza rodada e grava logs
lib/cartola.js            cliente dos endpoints Cartola
lib/db.js                 leitura/escrita do banco e montagem do ranking
prisma/schema.prisma      modelos relacionais
ROADMAP.md                plano de produto e evolução
```
