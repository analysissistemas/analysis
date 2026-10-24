// Guarda a lista de cabos e os preenchimentos feitos sem internet no próprio celular.
// Quando a conexão volta, os pendentes são enviados para o Supabase.
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { Cabo, Execucao } from "./tipos";

const CHAVE_CABOS = "cabos:lista";
const CHAVE_PENDENTES = "cabos:pendentes";

export type Pendente = Execucao & {
  cabo_id: number;
  tag: string;
  salvo_em: string;
  erro?: string;
};

// Guarda o último valor lido por chave para devolver a mesma referência enquanto não mudar
const memoria = new Map<string, { bruto: string | null; valor: unknown }>();

function ler<T>(chave: string, padrao: T): T {
  let bruto: string | null = null;
  try {
    bruto = localStorage.getItem(chave);
  } catch {}
  const m = memoria.get(chave);
  if (m && m.bruto === bruto) return m.valor as T;
  let valor: T = padrao;
  try {
    if (bruto) valor = JSON.parse(bruto) as T;
  } catch {}
  memoria.set(chave, { bruto, valor });
  return valor;
}

const VAZIO: never[] = [];

function assinar(aoMudar: () => void) {
  window.addEventListener("cabos:mudou", aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener("cabos:mudou", aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

export function useCabosLocais(): Cabo[] {
  return useSyncExternalStore(assinar, () => ler<Cabo[]>(CHAVE_CABOS, VAZIO), () => VAZIO);
}

export function usePendentes(): Pendente[] {
  return useSyncExternalStore(assinar, () => ler<Pendente[]>(CHAVE_PENDENTES, VAZIO), () => VAZIO);
}

function assinarConexao(aoMudar: () => void) {
  window.addEventListener("online", aoMudar);
  window.addEventListener("offline", aoMudar);
  return () => {
    window.removeEventListener("online", aoMudar);
    window.removeEventListener("offline", aoMudar);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(assinarConexao, () => navigator.onLine, () => true);
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* armazenamento indisponível — segue só online */
  }
  window.dispatchEvent(new Event("cabos:mudou"));
}

export function cabosEmCache(): Cabo[] {
  return ler<Cabo[]>(CHAVE_CABOS, VAZIO);
}

export function salvarCabosEmCache(cabos: Cabo[]) {
  gravar(CHAVE_CABOS, cabos);
}

export function pendentes(): Pendente[] {
  return ler<Pendente[]>(CHAVE_PENDENTES, VAZIO);
}

// Um pendente por cabo: o preenchimento mais recente substitui o anterior
export function adicionarPendente(p: Pendente) {
  const lista = pendentes().filter((x) => x.cabo_id !== p.cabo_id);
  gravar(CHAVE_PENDENTES, [...lista, p]);
}

export function removerPendente(caboId: number) {
  gravar(CHAVE_PENDENTES, pendentes().filter((x) => x.cabo_id !== caboId));
}

export async function baixarCabos(): Promise<Cabo[]> {
  const todos: Cabo[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase
      .from("cabos")
      .select("*")
      .order("tag")
      .range(de, de + passo - 1);
    if (error) throw error;
    todos.push(...(data as Cabo[]));
    if (!data || data.length < passo) break;
  }
  salvarCabosEmCache(todos);
  return todos;
}

function ehErroDeRede(msg: string) {
  return /fetch|network|Failed|Load failed|timeout/i.test(msg) || !navigator.onLine;
}

export async function enviarExecucao(p: Pendente): Promise<{ ok: true; cabo: Cabo } | { ok: false; rede: boolean; mensagem: string }> {
  try {
    const { data, error } = await supabase.rpc("registrar_execucao", {
      p_cabo_id: p.cabo_id,
      p_data_corte: p.data_corte,
      p_metragem_cortada: p.metragem_cortada,
      p_cabo_cortado: p.cabo_cortado,
      p_data_lancamento: p.data_lancamento,
    });
    if (error) return { ok: false, rede: ehErroDeRede(error.message), mensagem: error.message };
    return { ok: true, cabo: data as Cabo };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    return { ok: false, rede: true, mensagem };
  }
}

function atualizarCaboNoCache(cabo: Cabo) {
  salvarCabosEmCache(cabosEmCache().map((c) => (c.id === cabo.id ? cabo : c)));
}

let sincronizando = false;

export async function sincronizar(): Promise<{ enviados: number; restantes: number }> {
  if (sincronizando || !navigator.onLine) return { enviados: 0, restantes: pendentes().length };
  sincronizando = true;
  let enviados = 0;
  try {
    for (const p of pendentes()) {
      const r = await enviarExecucao(p);
      if (r.ok) {
        removerPendente(p.cabo_id);
        atualizarCaboNoCache(r.cabo);
        enviados++;
      } else if (r.rede) {
        break;
      } else {
        // Erro de validação: mantém para o usuário corrigir
        adicionarPendente({ ...p, erro: r.mensagem });
      }
    }
  } finally {
    sincronizando = false;
  }
  return { enviados, restantes: pendentes().length };
}

export async function salvarExecucao(cabo: Cabo, e: Execucao): Promise<{ estado: "enviado" | "pendente" | "erro"; mensagem?: string }> {
  const p: Pendente = { ...e, cabo_id: cabo.id, tag: cabo.tag, salvo_em: new Date().toISOString() };
  const r = await enviarExecucao(p);
  if (r.ok) {
    removerPendente(cabo.id);
    atualizarCaboNoCache(r.cabo);
    return { estado: "enviado" };
  }
  if (r.rede) {
    adicionarPendente(p);
    return { estado: "pendente" };
  }
  return { estado: "erro", mensagem: r.mensagem };
}
