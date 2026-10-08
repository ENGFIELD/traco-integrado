# Traço Integrado — regras para o Claude (vale em qualquer sessão, local ou na nuvem)

App de qualidade da obra Belavista Ipanema (FVS, rastreabilidade de concreto,
controle tecnológico, aço, cronograma). Vite + Firebase (compat 10.13),
projeto Firebase `traco-integrado-sig`. O dono não é programador: responda e
comente o código em **português do Brasil**, em linguagem simples.

## Regras que não podem ser quebradas
1. **Nunca apagar dados.** Mudança de estrutura no Firestore é sempre aditiva
   (campos novos com valor padrão). Migração = script idempotente que roda
   primeiro com `--dry-run`.
2. **Nunca publicar em produção sem o dono pedir** ("publica" / "pode publicar").
   - Na nuvem: abra um pull request; o GitHub gera sozinho um **link de teste**
     (canal de prévia do Firebase). Produção é só pelo workflow
     **"Publicar em produção"** (Actions → Run workflow), que faz backup antes.
   - No computador: teste nos emuladores (`npm run emuladores`, app em
     http://localhost:5000), depois backup
     (`node scripts/backup-firestore.js --key "chaves-firebase/traco-integrado-sig.json.json"`),
     tag `producao-AAAA-MM-DD-vX.Y` e `firebase deploy --only hosting`.
3. **Nunca versionar chaves nem backups** (`chaves-firebase/`, `backups/firestore_*.json`
   já estão no `.gitignore`). Na nuvem a chave existe só como segredo do GitHub
   (`FIREBASE_SERVICE_ACCOUNT`).

## Como o código está organizado
- `src/main.js` — app principal (um IIFE grande; funções em pt-BR).
- `src/modulos/*` — aço, cronograma, CT (planilha), rastreabilidade (editor do mapa).
- `firestore.rules` — regras em produção. Conta só de visualização:
  `jessica.araujo@sig.eng.br` (mesma lista em `src/main.js`, `CONTAS_SOMENTE_LEITURA`).
- Toda gravação no CT precisa de `atualizadoEm` (a sincronização é incremental).
- Ao mudar a versão: rótulo `build …` no `index.html` e `VERSAO` em `public/sw.js`
  (e o teste `tests/sw.test.mjs`).

## Testes
`npm test` roda os testes que não precisam de emulador (planilha do CT,
aço × cronograma, service worker). `npm run build` precisa passar.
