# Cartola Rua do Comércio 🏆

Landing pública (classificação + premiação do bolão) e painel admin protegido, focado na Copa do Mundo 2026.

- **`/`** — página pública que você manda pros membros (só leitura, atualiza sozinha).
- **`/admin`** — painel onde você lança pontos e configura a premiação (protegido por senha).

Stack: site estático + funções serverless (`/api`) na **Vercel**, banco no **Prisma Postgres** (provisionado pela Vercel Marketplace), acesso via **Prisma ORM**. A premiação é calculada sozinha: `valor por pessoa × nº de participantes`, dividido pelas porcentagens de 1º/2º/3º.

---

## Passo a passo (uns 10 minutos)

### 1. Subir o projeto na Vercel
Suba esta pasta como um projeto (via GitHub ou `vercel` CLI). Sem framework/build pra configurar — a Vercel detecta o `/api` como funções e serve o resto como estático.

### 2. Criar o banco (Prisma Postgres)
No projeto Vercel: aba **Storage → Connect Database → escolha Prisma (Prisma Postgres)** e conecte ao projeto.
A integração cria o banco e injeta a variável **`DATABASE_URL`** automaticamente — não precisa copiar nada.

### 3. Criar a tabela
Na sua máquina, dentro da pasta do projeto:
```bash
npm install
npx vercel link            # vincula à pasta ao projeto na Vercel
npx vercel env pull .env   # baixa o DATABASE_URL pra cá
npx prisma db push         # cria a tabela no banco
```

### 4. Variáveis de ambiente (Vercel → Settings → Environment Variables)
| Variável | O que é |
|---|---|
| `DATABASE_URL` | já veio do passo 2 (integração Prisma) |
| `ADMIN_PASSWORD` | a senha que você digita no `/admin` |
| `JWT_SECRET` | texto longo e aleatório (ex.: `openssl rand -base64 32`) |

Depois de adicionar as duas, **faça um redeploy**.

### 5. Domínio próprio
**Vercel → Settings → Domains → Add**, aponte seu domínio e siga o DNS. Pronto, é só mandar o link no grupo.

---

## Como usar
1. Acesse `/admin`, entre com a `ADMIN_PASSWORD`.
2. Configure valor por pessoa e as porcentagens (somando 100%).
3. Adicione os participantes e lance os pontos (cartoletas) de cada um.
4. Clique **Salvar e publicar** — a classificação e os prêmios aparecem na página pública na hora, já reordenados por pontos.

Não precisa popular nada antes: enquanto a tabela estiver vazia, o site mostra a configuração padrão; o primeiro "Salvar" já cria o registro.

## Observações
- O `JWT_SECRET` e a conexão do banco ficam **só no servidor** (variáveis da Vercel). O navegador nunca os vê, e o público só lê via `/api/data`.
- O login é uma senha única + token de 7 dias — simples e suficiente pra um grupo. Dá pra evoluir pra Supabase Auth/multiusuário depois, se quiser.
- **Troubleshooting:** se o deploy reclamar de "Query engine binary" / engine não encontrada, é só rodar `prisma generate` no build (adicione `"buildCommand": "prisma generate"` no `vercel.json`) — o `postinstall` já cobre o caso normal.

## Estrutura
```
index.html / landing.js    → página pública
admin.html / admin.js       → painel do organizador
styles.css                  → tema visual (compartilhado)
api/data.js                 → GET público + POST protegido
api/login.js                → valida a senha e devolve o token (JWT)
lib/db.js                   → lê/grava o estado (Prisma)
lib/prisma.js               → cliente Prisma (singleton)
lib/auth.js                 → JWT
prisma/schema.prisma        → modelo do banco
```
