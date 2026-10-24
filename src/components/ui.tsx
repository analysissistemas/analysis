"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { STATUS_INFO, type Status } from "@/lib/tipos";

export type TipoAviso = "ok" | "alerta" | "erro";
export type AvisoFlutuante = { tipo: TipoAviso; texto: string };

// Aviso flutuante no topo da tela — retorno padrão de qualquer ação (salvar, excluir, atualizar…)
export function useAvisoFlutuante() {
  const [aviso, setAviso] = useState<AvisoFlutuante | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrar = useCallback((tipo: TipoAviso, texto: string) => {
    if (timer.current) clearTimeout(timer.current);
    setAviso({ tipo, texto });
    // erros ficam até a pessoa fechar; o resto some sozinho
    if (tipo !== "erro") timer.current = setTimeout(() => setAviso(null), 5000);
  }, []);
  const fechar = useCallback(() => setAviso(null), []);
  return { aviso, mostrar, fechar };
}

export function AvisoNoTopo({ aviso, fechar }: { aviso: AvisoFlutuante | null; fechar: () => void }) {
  if (!aviso) return null;
  const c = { ok: "bg-st-t-fundo text-st-t ring-st-t/30", alerta: "bg-st-p-fundo text-st-p ring-st-p/30", erro: "bg-erro-fundo text-erro ring-erro/30" }[aviso.tipo];
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(5.75rem+env(safe-area-inset-top))] z-40 flex justify-center px-4">
      <div className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 ${c}`}>
        <span className="flex-1">{aviso.texto}</span>
        <button onClick={fechar} aria-label="Fechar aviso" className="-my-1 -mr-1 rounded px-1.5 text-lg leading-none opacity-70 hover:opacity-100">
          ×
        </button>
      </div>
    </div>
  );
}

export function Cabecalho({
  titulo,
  subtitulo,
  voltar,
  direita,
}: {
  titulo: string;
  subtitulo?: string;
  voltar?: () => void;
  direita?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 bg-grafite text-white">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        {voltar ? (
          <button onClick={voltar} aria-label="Voltar" className="-ml-1 grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        ) : (
          <Image src="/logo-marca.png" alt="" width={36} height={36} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold leading-tight">{titulo}</h1>
          {subtitulo && <p className="truncate text-sm text-white/70">{subtitulo}</p>}
        </div>
        {direita}
      </div>
      </div>
      <div className="faixa-marca" />
    </header>
  );
}

export function SeloStatus({ status, curto }: { status: Status; curto?: boolean }) {
  const s = STATUS_INFO[status];
  const ponto = { NI: "bg-st-ni", P: "bg-st-p", T: "bg-st-t" }[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${s.fundo} ${s.cor}`}>
      <span className={`h-2 w-2 rounded-full ${ponto}`} />
      {status}
      {!curto && <span className="font-medium">· {s.rotulo}</span>}
    </span>
  );
}

export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-texto">{rotulo}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const classeInput =
  "h-12 w-full rounded-lg border border-borda bg-white px-3 text-base outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:bg-fundo";

export function Selecao({
  valor,
  aoMudar,
  opcoes,
  todos,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: string[];
  todos: string;
}) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={`${classeInput} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2214%22 height=%2214%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23142322%22 stroke-width=%222.5%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[right_0.75rem_center] bg-no-repeat pr-9`}>
      <option value="">{todos}</option>
      {opcoes.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Aviso({ tipo, children }: { tipo: "ok" | "alerta" | "erro"; children: React.ReactNode }) {
  const c = { ok: "bg-st-t-fundo text-st-t", alerta: "bg-st-p-fundo text-st-p", erro: "bg-erro-fundo text-erro" }[tipo];
  return <div className={`rounded-lg px-3 py-2 text-sm font-medium ${c}`}>{children}</div>;
}
