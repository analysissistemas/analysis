export type Status = "NI" | "P" | "T";

export type Cabo = {
  id: number;
  tag: string;
  disciplina: string | null;
  pavimento: string | null;
  painel: string | null;
  cabo_estimado: string | null;
  de: string | null;
  para: string | null;
  metragem_estimada: number | null;
  data_corte: string | null;
  metragem_cortada: number | null;
  cabo_cortado: string | null;
  data_lancamento: string | null;
  status: Status;
  atualizado_em: string;
};

export type Execucao = {
  data_corte: string | null;
  metragem_cortada: number | null;
  cabo_cortado: string | null;
  data_lancamento: string | null;
};

export type Perfil = {
  id: string;
  nome: string;
  papel: "admin" | "campo";
  ativo: boolean;
};

export const STATUS_INFO: Record<Status, { rotulo: string; cor: string; fundo: string }> = {
  NI: { rotulo: "Não iniciado", cor: "text-ni", fundo: "bg-ni-fundo" },
  P: { rotulo: "Parcial", cor: "text-p", fundo: "bg-p-fundo" },
  T: { rotulo: "Terminado / Executado", cor: "text-t", fundo: "bg-t-fundo" },
};

// Mesma regra da coluna gerada no banco — usada para mostrar o status antes de sincronizar
export function calcularStatus(e: Execucao): Status {
  if (e.data_lancamento) return "T";
  if (e.data_corte || e.metragem_cortada != null || e.cabo_cortado) return "P";
  return "NI";
}

export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function formatarMetros(n: number | null): string {
  return n == null ? "—" : `${n.toLocaleString("pt-BR")} m`;
}
