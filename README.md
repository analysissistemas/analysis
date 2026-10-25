# Controle de Cabos

App (PWA) para a equipe de campo registrar corte e lançamento de cabos, com painel do administrador para importar a planilha, acompanhar o progresso e exportar em Excel e PDF.

## Perfis

- **Campo**: vê a lista de cabos e preenche data do corte, metragem cortada, cabo cortado e data de lançamento. Funciona sem internet (salva no celular e envia quando a conexão volta).
- **Admin**: tudo do campo + painel (`/admin`): visão geral, tabela de cabos, importação de planilha, exportação Excel/PDF e gestão de usuários.

## Status (calculado no banco)

| Status | Regra |
| --- | --- |
| NI — Não iniciado | nada preenchido |
| P — Parcial | cortado (data, metragem ou cabo cortado), sem data de lançamento |
| T — Terminado | tem data de lançamento |

## Rodar

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local` precisa de `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (a service_role é usada só na rota `/api/usuarios`, no servidor).

## Banco (Supabase)

- `supabase/schema.sql`: tabelas `perfis`, `cabos`, `registros` (histórico), RLS e funções `registrar_execucao`, `importar_cabos`, `excluir_cabo`. Pode ser reaplicado (é idempotente).
- `supabase/002_cadastro_manual.sql`: `criar_cabo` (botão "Novo cabo" do admin; recusa TAG repetida) e `atualizar_cadastro` ("Editar" no detalhe do cabo).
- `supabase/003_historico.sql`: histórico completo (preenchimento, cadastro, edição, exclusão, importação), guardado mesmo após excluir o cabo. Aba **Histórico** no admin.
- Nenhum usuário escreve direto nas tabelas: toda escrita passa pelas funções, que conferem o papel.

Criar/resetar um usuário pelo terminal:

```bash
node --env-file=.env.local scripts/criar-admin.mjs email@exemplo.com "Nome" admin
```

## Importação da planilha

- Reconhece sozinho a aba e a linha de cabeçalho (`TAG CABO`, `CABO ESTIMATIVA`, `DE`, `PARA`, `METRAGEM ESTIMADA`, `DATA CORTE`, `METRAGEM CORTADA`, `CABO CORTADO`, `DATA LANÇAMENTO`, `PAVIMENTO`, `DISCIPLINA`, `PAINEL`).
- Atualiza por TAG. O que o campo já preencheu nunca é sobrescrito.
- Sem coluna PAINEL, o painel vem do DE (`HVAC-PNR02-01024-0000` → `HVAC-PNR02`).

## Teste ponta a ponta

```bash
npx tsx --env-file=.env.local scripts/teste-fluxo.mts <planilha.xlsx> <arquivo-com-logins>
```
