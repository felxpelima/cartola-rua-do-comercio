# HANDOFF — onde paramos (2026-06-29)

> ⚠️ Arquivo local, **gitignorado** (contém a chave VAPID secreta). Não commitar.
> ⚠️ **NADA foi commitado ainda.** Tudo está na árvore de trabalho, aguardando revisão.

## Regra de trabalho (combinada)
Pipeline em 3 estágios, nessa ordem, **sem commit/produção até aprovação**:
1. **Preview local** (`npm run preview:local`, porta 4173) — revisão visual/funcional.
2. **Preview Vercel** (`npx vercel`, sem `--prod`) — valida banco/envs/push de verdade.
3. **Produção** (`npx vercel --prod`) — só quando 100%, **você** dispara.

---

## ✅ O que já está PRONTO (no código, sem commit)

### 1. Campinho do perfil (visual) — revisado no preview
- Lista vertical → **campo de futebol realista em retrato** (gramado listrado, áreas, círculo central).
- Jogadores viram **fichas redondas** posicionadas por linha (Ataque→Goleiro); técnico num chip abaixo.
- Cada ficha: **bandeira do país** (seleção da Copa), **pontos** (capitão ×1,5), **C** de capitão / ★ reserva de luxo, **mini-scouts**, marcador de destaque (★) e substituição (⇄).
- País agora com **nome completo** ("Brasil") nos cards do banco.
- Clique na ficha abre o **modal de scouts** (inalterado) — bug do clique já corrigido.
- Arquivos: `participant.js`, `styles.css`. Cache-bust `fases-136 → 137` em todos os HTML.

### 2. Notificações (Web Push + WhatsApp/Evolution) — falta testar no navegador
**Eventos:** "rodada fechou / mito" e "novo líder geral".

- **Fase 1 (Web Push base):** `manifest.json`, `sw.js` (service worker só de push, sem cache de assets), `icon.svg`, `push.js` (opt-in "🔔 Ativar avisos" no header da home + "Enviar teste"). PWA instalável.
- **Fase 2 (motor):**
  - `lib/notify-templates.js` — mensagens puras (líder / rodada-mito).
  - `lib/notify.js` — inscrições, envio Web Push (poda inscrições mortas 404/410), **sender Evolution** (WhatsApp), detecção de evento com **dedupe** via `NotifyState` (não spamma; 1ª execução só semeia marcador).
  - `api/push.js` — `GET` devolve chave VAPID; `POST` subscribe/unsubscribe/test.
  - `api/sync-cartola.js` — dispara `notifyFromSync` após o sync (best-effort, nunca quebra o sync).
  - `prisma/schema.prisma` — modelos novos: **`PushSubscription`** e **`NotifyState`**.
- **Preview:** `scripts/preview-local.mjs` ganhou `/api/push` (em memória) + botões dev **"Simular rodada/líder"** (só no preview, via `dev:true`). Carrega `.env` (se houver) p/ testar WhatsApp localmente.

**Status:** verde no `npm run verify` (46/46 testes, 32 arquivos no check:js). Endpoints respondendo. **Falta você clicar no navegador** e ver a notificação aparecer.

---

## ▶️ PRÓXIMO PASSO IMEDIATO (depois de reiniciar)

1. Subir o preview:
   ```bash
   cd "C:/Users/Felipe/Desktop/Estudos/cartola-rua-do-comercio/cartola-rua-do-comercio"
   npm run preview:local
   ```
   (node_modules e Prisma client já estão prontos; não precisa reinstalar.)

2. Abrir **http://localhost:4173/** no desktop e:
   - **Perfil/campinho:** http://localhost:4173/participant?id=p1 → revisar visual, clicar nas fichas.
   - **Notificações:** clicar **"🔔 Ativar avisos"** → permitir → clicar **"Simular líder"** e **"Simular rodada"** → confirmar que a **notificação real do sistema** aparece com o texto certo.

3. Me dizer o que ajustar (texto/emoji das mensagens, tamanho/cor das fichas, posição do botão).

---

## 🚀 Para subir o PREVIEW na VERCEL (estágio 2 — quando o local estiver 100%)

1. **Setar envs** na Vercel (escopo **Preview**, e depois Production):
   ```
   VAPID_PUBLIC_KEY=BPBKeefN2xbQjPOFFsRTXgm-SkvrF4jpszOyjdo9F4ytEgKI6vGkMKsgQK0ERnAfKgrEWTp1rUBpqmIXbZ5YkZw
   VAPID_PRIVATE_KEY=rcFwfAN13bQ_l2vQQD-bJrzUOf5Ch1q9wURn8uCZEtQ
   VAPID_SUBJECT=mailto:SEU_EMAIL@exemplo.com
   EVOLUTION_API_URL=https://evolution.SEU_DOMINIO.com
   EVOLUTION_API_KEY=...(a AUTHENTICATION_API_KEY do seu Evolution)...
   EVOLUTION_INSTANCE=...(nome da instância conectada via QR)...
   EVOLUTION_GROUP_JID=...(id do grupo, termina em @g.us)...
   ```
   > A chave VAPID acima foi gerada nesta sessão. `VAPID_PRIVATE_KEY` é **secreta**.
   > Sem essas envs, push/WhatsApp só não disparam — o resto do site funciona igual.

2. **Criar as tabelas novas** no banco (é o seu Postgres de produção):
   ```bash
   npx prisma db push
   ```

3. **Deploy de preview:**
   ```bash
   npx vercel        # preview (NÃO usar --prod ainda)
   ```

4. Testar no celular (HTTPS) o opt-in + simular um sync e ver push + WhatsApp.

### Como achar o EVOLUTION_GROUP_JID
Com a instância conectada no EasyPanel, chamar:
```
GET {EVOLUTION_API_URL}/group/fetchAllGroups/{EVOLUTION_INSTANCE}
Header: apikey: {EVOLUTION_API_KEY}
```
Achar o grupo da liga na lista e copiar o `id` que termina em `@g.us`.

### Evolution no EasyPanel (resumo)
- Subir o template **Evolution API** (Docker) no EasyPanel.
- Definir `AUTHENTICATION_API_KEY` (= `EVOLUTION_API_KEY`).
- Criar uma instância e conectar via **QR** o número de WhatsApp que vai postar.
- Pegar o JID do grupo (acima).

---

## ⏳ Decisões em aberto
- Aprovar o **texto/emoji** das mensagens (líder e rodada). Templates atuais em `lib/notify-templates.js`.
- Bundle: subir **campinho + notificações juntos** num único preview-Vercel (recomendado) vs separado.
- WhatsApp: confirmar formato da Evolution API (assumi **v2**: `POST /message/sendText/{instance}` com body `{ number, text }`). Se sua versão for v1, ajustar `sendEvolution` em `lib/notify.js`.

## 💡 Backlog de melhorias (da análise, ainda não feito)
- Adversário + placar do jogo por jogador na ficha (dado já está no `raw`).
- Scout card completo no modal (preço/média/jogos).
- AO VIVO + auto-refresh no perfil (a home já tem).
- Escalação rodada a rodada (clicar no histórico → campo daquela rodada).
- "Deixou no banco" / "Acertou o capitão?" / "Mico da rodada".
- Skeletons de loading; card compartilhável com as fontes do site.

---

## 📂 Arquivos alterados/novos (nada commitado)
**Novos:** `api/push.js`, `lib/notify.js`, `lib/notify-templates.js`, `sw.js`, `push.js`, `manifest.json`, `icon.svg`, `HANDOFF.md` (este, gitignorado)
**Modificados:** `participant.js`, `styles.css`, `index.html`, `participant.html`, `admin.html`, `api/sync-cartola.js`, `prisma/schema.prisma`, `scripts/preview-local.mjs`, `scripts/check-js.mjs`, `tests/render-smoke.test.js`, `tests/static-contract.test.js`, `.env.example`, `.gitignore`, `package.json`, `package-lock.json` (web-push)

## 🔁 Comandos úteis
```bash
npm run preview:local   # sobe o preview (porta 4173)
npm run verify          # check:js + check:prisma + testes (deve dar 46/46)
```
