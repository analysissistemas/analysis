// Teste ponta a ponta: lê a planilha, importa como admin, registra como campo, confere status e permissões.
// uso: npx tsx --env-file=.env.local scripts/teste-fluxo.mts <planilha.xlsx> <arquivo-logins>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { lerPlanilha } from "../src/lib/planilha.ts";

const [arquivo, logins] = process.argv.slice(2);
const credenciais = Object.fromEntries(
  readFileSync(logins, "utf8").trim().split("\n").map((l) => {
    const [, papel, email, senha] = l.match(/^(\w+): (\S+)\s+senha: (\S+)/)!;
    return [papel, { email, password: senha }];
  }),
);
const cliente = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const ok = (cond: unknown, msg: string) => console.log(`${cond ? "✔" : "✘"} ${msg}`);

const buf = readFileSync(arquivo);
const leitura = await lerPlanilha(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log(`Aba: ${leitura.aba} · ${leitura.linhas.length} linhas · ${leitura.erros.length} erros · ${leitura.avisos.length} avisos`);
leitura.erros.forEach((e) => console.log("  erro:", e));
leitura.avisos.forEach((e) => console.log("  aviso:", e));
console.table(leitura.linhas.map(({ tag, disciplina, pavimento, painel, metragem_estimada, data_corte, data_lancamento }) => ({ tag, disciplina, pavimento, painel, metragem_estimada, data_corte, data_lancamento })));

// Admin importa
const adm = cliente();
await adm.auth.signInWithPassword(credenciais.admin);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { data: imp, error: eImp } = await adm.rpc("importar_cabos", { p_linhas: leitura.linhas.map(({ linha, ...r }) => r) });
ok(!eImp, `admin importa: ${JSON.stringify(imp ?? eImp?.message)}`);

// Campo não pode importar
const campo = cliente();
await campo.auth.signInWithPassword(credenciais.campo);
const { error: eNeg } = await campo.rpc("importar_cabos", { p_linhas: [] });
ok(eNeg, `campo bloqueado na importação (${eNeg?.message})`);

// Campo não pode escrever direto na tabela
const { error: eUpd } = await campo.from("cabos").update({ tag: "X" }).neq("id", 0);
ok(eUpd, `campo bloqueado em update direto (${eUpd?.message})`);

// Anônimo não lê nada
const { data: anon } = await cliente().from("cabos").select("id");
ok((anon ?? []).length === 0, "anônimo não vê cabos");

// Campo registra: corte → P, lançamento → T
const { data: lista } = await campo.from("cabos").select("*").eq("status", "NI").limit(1);
const alvo = lista![0];
let r = await campo.rpc("registrar_execucao", { p_cabo_id: alvo.id, p_data_corte: "2026-10-20", p_metragem_cortada: 26, p_cabo_cortado: alvo.cabo_estimado, p_data_lancamento: null });
ok(r.data?.status === "P", `${alvo.tag}: só corte → status ${r.data?.status}`);
r = await campo.rpc("registrar_execucao", { p_cabo_id: alvo.id, p_data_corte: "2026-10-20", p_metragem_cortada: 26, p_cabo_cortado: alvo.cabo_estimado, p_data_lancamento: "2026-10-18" });
ok(r.error, `lançamento antes do corte recusado (${r.error?.message})`);
r = await campo.rpc("registrar_execucao", { p_cabo_id: alvo.id, p_data_corte: "2026-10-20", p_metragem_cortada: 26, p_cabo_cortado: alvo.cabo_estimado, p_data_lancamento: "2026-10-22" });
ok(r.data?.status === "T", `${alvo.tag}: com lançamento → status ${r.data?.status}`);

const { data: hist } = await campo.from("registros").select("id").eq("cabo_id", alvo.id);
ok(hist?.length === 2, `histórico gravado (${hist?.length} registros)`);

// Reimportar não apaga o que o campo preencheu
await adm.rpc("importar_cabos", { p_linhas: leitura.linhas.filter((l) => l.tag === alvo.tag).map(({ linha, ...r }) => r) });
const { data: depois } = await adm.from("cabos").select("status, data_corte, data_lancamento").eq("id", alvo.id).single();
ok(depois?.status === "T" && depois.data_corte === "2026-10-20", `reimportação preserva execução (${JSON.stringify(depois)})`);

// Volta o cabo de teste ao estado original da planilha
const orig = leitura.linhas.find((l) => l.tag === alvo.tag)!;
await adm.rpc("registrar_execucao", { p_cabo_id: alvo.id, p_data_corte: orig.data_corte, p_metragem_cortada: orig.metragem_cortada, p_cabo_cortado: orig.cabo_cortado, p_data_lancamento: orig.data_lancamento });
console.log(`(cabo ${alvo.tag} restaurado ao estado da planilha)`);
