// Histórico: tipos e textos legíveis do que mudou em cada registro
import { supabase } from "./supabase";
import { formatarData, type Status } from "./tipos";

export type Acao = "preenchimento" | "cabo_criado" | "cadastro_editado" | "cabo_excluido" | "importacao";

export type Registro = {
  id: number;
  criado_em: string;
  acao: Acao;
  tag: string | null;
  de: string | null;
  para: string | null;
  detalhe: string | null;
  cabo_id: number | null;
  usuario_id: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  perfis: { nome: string } | null;
};

export const ACOES: Record<Acao, { rotulo: string; cor: string }> = {
  preenchimento: { rotulo: "Preenchimento", cor: "bg-teal-claro text-teal-escuro" },
  cabo_criado: { rotulo: "Cabo cadastrado", cor: "bg-verde-claro text-st-t" },
  cadastro_editado: { rotulo: "Cadastro editado", cor: "bg-st-p-fundo text-st-p" },
  cabo_excluido: { rotulo: "Cabo excluído", cor: "bg-erro-fundo text-erro" },
  importacao: { rotulo: "Planilha importada", cor: "bg-st-ni-fundo text-texto" },
};

const CAMPOS_EXECUCAO: [string, string][] = [
  ["data_corte", "Data do corte"],
  ["metragem_cortada", "Metragem cortada"],
  ["cabo_cortado", "Cabo cortado"],
  ["data_lancamento", "Data de lançamento"],
];

const CAMPOS_CADASTRO: [string, string][] = [
  ["tag", "TAG"],
  ["de", "DE"],
  ["para", "PARA"],
  ["disciplina", "Disciplina"],
  ["pavimento", "Pavimento"],
  ["painel", "Painel"],
  ["cabo_estimado", "Cabo estimado"],
  ["metragem_estimada", "Metragem estimada"],
];

function valor(campo: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (campo.startsWith("data_")) return formatarData(String(v));
  if (campo.startsWith("metragem")) return `${Number(v).toLocaleString("pt-BR")} m`;
  return String(v);
}

// Lista "Campo: antes → depois" só com o que realmente mudou
export function mudancas(r: Registro): string[] {
  const antes = r.antes ?? {};
  const depois = r.depois ?? {};
  if (r.acao === "importacao") return [r.detalhe ?? "Planilha importada"];
  if (r.acao === "cabo_criado") {
    return CAMPOS_CADASTRO.filter(([k]) => k !== "tag" && depois[k] != null && depois[k] !== "").map(([k, rot]) => `${rot}: ${valor(k, depois[k])}`);
  }
  if (r.acao === "cabo_excluido") {
    return [`Status no momento da exclusão: ${(antes.status as string) ?? "—"}`];
  }
  const campos = r.acao === "preenchimento" ? CAMPOS_EXECUCAO : CAMPOS_CADASTRO;
  const lista = campos
    .filter(([k]) => valor(k, antes[k]) !== valor(k, depois[k]))
    .map(([k, rot]) => `${rot}: ${valor(k, antes[k])} → ${valor(k, depois[k])}`);
  return lista.length ? lista : ["Salvo sem alterações"];
}

export function mudancaStatus(r: Registro): { de: Status; para: Status } | null {
  const a = r.antes?.status as Status | undefined;
  const d = r.depois?.status as Status | undefined;
  return r.acao === "preenchimento" && a && d && a !== d ? { de: a, para: d } : null;
}

export const SELECT_REGISTRO = "id, criado_em, acao, tag, de, para, detalhe, cabo_id, usuario_id, antes, depois, perfis(nome)";

export async function historicoDoCabo(caboId: number): Promise<Registro[]> {
  const { data } = await supabase.from("registros").select(SELECT_REGISTRO).eq("cabo_id", caboId).order("criado_em", { ascending: false }).limit(50);
  return (data as unknown as Registro[]) ?? [];
}

export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// "Hoje", "Ontem" ou a data, para agrupar a lista por dia
export function rotuloDia(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}
