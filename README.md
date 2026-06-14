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

## Cron

Use um agendador externo chamando:

```text
https://SEU_DOMINIO/api/sync-cartola?secret=SEU_CRON_SECRET
```

Também é possível enviar o segredo pelo header `x-cron-secret`.

## Arquivos principais

```text
api/cartola-search.js     busca times no Cartola
api/sync-cartola.js       sincroniza rodada e grava logs
lib/cartola.js            cliente dos endpoints Cartola
lib/db.js                 leitura/escrita do banco e montagem do ranking
prisma/schema.prisma      modelos relacionais
ROADMAP.md                plano de produto e evolução
```
