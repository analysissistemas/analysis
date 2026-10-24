"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Cabecalho, Campo, SeloStatus, Selecao, classeInput } from "@/components/ui";
import { baixarCabos, salvarExecucao, sincronizar, useCabosLocais, useOnline, usePendentes, type Pendente } from "@/lib/offline";
import { sair, useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { calcularStatus, formatarData, formatarMetros, type Cabo, type Execucao, type Status } from "@/lib/tipos";

type Aba = "cabos" | "registros";

export default function AppCampo() {
  const { perfil, carregando } = useSessao();
  const router = useRouter();
  const cabos = useCabosLocais();
  const pend = usePendentes();
  const online = useOnline();
  const [aba, setAba] = useState<Aba>("cabos");
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [abertoId, aba]);

  // Envia o que ficou pendente e baixa a lista atualizada (o cache local avisa a tela)
  const atualizar = useCallback(async () => {
    if (!navigator.onLine) return;
    await sincronizar();
    try {
      await baixarCabos();
    } catch {}
  }, []);

  useEffect(() => {
    if (carregando) return;
    if (!perfil) {
      router.replace("/login");
      return;
    }
    atualizar();
    window.addEventListener("online", atualizar);
    return () => window.removeEventListener("online", atualizar);
  }, [carregando, perfil, atualizar, router]);

  if (carregando || !perfil) {
    return <div className="grid flex-1 place-items-center text-suave">Carregando…</div>;
  }

  const aberto = abertoId != null ? cabos.find((c) => c.id === abertoId) : undefined;
  if (aberto) {
    return (
      <Preenchimento
        cabo={aberto}
        pendente={pend.find((p) => p.cabo_id === aberto.id)}
        sugestoesCabo={[...new Set(cabos.map((c) => c.cabo_estimado).filter(Boolean) as string[])].sort()}
        voltar={() => setAbertoId(null)}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho
        titulo="Controle de cabos"
        subtitulo={perfil.nome}
        direita={
          <div className="relative">
            <button onClick={() => setMenu(!menu)} aria-label="Menu" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            {menu && (
              <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl bg-white text-texto shadow-lg ring-1 ring-borda">
                {perfil.papel === "admin" && (
                  <Link href="/admin" className="block px-4 py-3 hover:bg-fundo">Painel admin</Link>
                )}
                <button onClick={() => { setMenu(false); atualizar(); }} className="block w-full px-4 py-3 text-left hover:bg-fundo">Atualizar dados</button>
                <button onClick={sair} className="block w-full px-4 py-3 text-left text-erro hover:bg-fundo">Sair</button>
              </div>
            )}
          </div>
        }
      />
      {!online && (
        <div className="bg-p-fundo px-4 py-2 text-center text-sm font-medium text-p">
          Sem internet — os registros ficam salvos no celular e são enviados quando a conexão voltar.
        </div>
      )}
      {online && pend.length > 0 && (
        <button onClick={atualizar} className="bg-teal-claro px-4 py-2 text-center text-sm font-medium text-teal-escuro">
          {pend.length} registro(s) aguardando envio — toque para enviar
        </button>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-28">
        {aba === "cabos" ? <ListaCabos cabos={cabos} pend={pend} abrir={setAbertoId} /> : <Registros pend={pend} abrir={setAbertoId} usuarioId={perfil.id} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-2">
          {(["cabos", "registros"] as Aba[]).map((a) => (
            <button key={a} onClick={() => setAba(a)} className={`flex flex-col items-center gap-0.5 py-2.5 text-sm font-medium ${aba === a ? "text-teal" : "text-suave"}`}>
              {a === "cabos" ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v4M12 3v4M6 7h8v3a4 4 0 01-8 0V7zM10 14v2a3 3 0 003 3h3a3 3 0 010 6" /></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
              )}
              {a === "cabos" ? "Cabos" : "Registros"}
              <span className={`mt-0.5 h-1 w-10 rounded-full ${aba === a ? "bg-teal" : "bg-transparent"}`} />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ListaCabos({ cabos, pend, abrir }: { cabos: Cabo[]; pend: Pendente[]; abrir: (id: number) => void }) {
  const [disciplina, setDisciplina] = useState("");
  const [pavimento, setPavimento] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [busca, setBusca] = useState("");

  const disciplinas = useMemo(() => [...new Set(cabos.map((c) => c.disciplina).filter(Boolean) as string[])].sort(), [cabos]);
  const pavimentos = useMemo(() => [...new Set(cabos.map((c) => c.pavimento).filter(Boolean) as string[])].sort(), [cabos]);
  const pendPorCabo = useMemo(() => new Map(pend.map((p) => [p.cabo_id, p])), [pend]);

  const filtrados = cabos.filter((c) => {
    const st = pendPorCabo.has(c.id) ? calcularStatus(pendPorCabo.get(c.id)!) : c.status;
    return (
      (!disciplina || c.disciplina === disciplina) &&
      (!pavimento || c.pavimento === pavimento) &&
      (!status || st === status) &&
      (!busca || c.tag.toLowerCase().includes(busca.toLowerCase()))
    );
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Disciplina">
          <Selecao valor={disciplina} aoMudar={setDisciplina} opcoes={disciplinas} todos="Todas" />
        </Campo>
        <Campo rotulo="Pavimento / Área">
          <Selecao valor={pavimento} aoMudar={setPavimento} opcoes={pavimentos} todos="Todas as áreas" />
        </Campo>
      </div>
      <input
        type="search"
        placeholder="Buscar TAG do cabo"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className={`${classeInput} mt-3`}
      />
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {([["", "Todos"], ["NI", "Não iniciado"], ["P", "Parcial"], ["T", "Terminado"]] as [Status | "", string][]).map(([v, r]) => (
          <button
            key={v}
            onClick={() => setStatus(v)}
            className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition ${status === v ? "bg-teal text-white" : "bg-white text-texto ring-1 ring-borda"}`}
          >
            {r}
          </button>
        ))}
      </div>

      <h2 className="mt-5 mb-3 text-lg font-bold">
        Cabos <span className="font-normal text-suave">({filtrados.length})</span>
      </h2>

      {cabos.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-suave ring-1 ring-borda">
          Nenhum cabo carregado ainda. Conecte à internet ou peça ao administrador para importar a planilha.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtrados.map((c) => {
            const p = pendPorCabo.get(c.id);
            const st = p ? calcularStatus(p) : c.status;
            return (
              <li key={c.id}>
                <button onClick={() => abrir(c.id)} className="flex w-full items-center gap-3 rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-borda transition active:scale-[0.99]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-lg font-bold text-marinho">{c.tag}</span>
                      <SeloStatus status={st} />
                    </div>
                    <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-y-0.5 text-sm">
                      <dt className="text-suave">Painel</dt>
                      <dd className="truncate">{c.painel ?? "—"}</dd>
                      <dt className="text-suave">Disciplina</dt>
                      <dd className="truncate">{c.disciplina ?? "—"}</dd>
                      <dt className="text-suave">Localização</dt>
                      <dd className="truncate">{c.pavimento ?? "—"}</dd>
                    </dl>
                    {p && <p className="mt-2 text-xs font-medium text-p">{p.erro ? `Erro: ${p.erro}` : "Aguardando envio"}</p>}
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-suave"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Preenchimento({
  cabo,
  pendente,
  sugestoesCabo,
  voltar,
}: {
  cabo: Cabo;
  pendente?: Pendente;
  sugestoesCabo: string[];
  voltar: () => void;
}) {
  const base: Execucao = pendente ?? cabo;
  const [dataCorte, setDataCorte] = useState(base.data_corte ?? "");
  const [metragem, setMetragem] = useState(base.metragem_cortada?.toString() ?? "");
  const [caboCortado, setCaboCortado] = useState(base.cabo_cortado ?? "");
  const [dataLanc, setDataLanc] = useState(base.data_lancamento ?? "");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "alerta" | "erro"; texto: string } | null>(
    pendente?.erro ? { tipo: "erro", texto: pendente.erro } : null,
  );

  const exec: Execucao = {
    data_corte: dataCorte || null,
    metragem_cortada: metragem === "" ? null : Number(metragem.replace(",", ".")),
    cabo_cortado: caboCortado.trim() || null,
    data_lancamento: dataLanc || null,
  };
  const statusPrevisto = calcularStatus(exec);
  const excedeu = exec.metragem_cortada != null && cabo.metragem_estimada != null && exec.metragem_cortada > cabo.metragem_estimada;
  const caboDiferente = exec.cabo_cortado && cabo.cabo_estimado && exec.cabo_cortado !== cabo.cabo_estimado;

  async function salvar() {
    if (exec.data_lancamento && !exec.data_corte) {
      setMsg({ tipo: "erro", texto: "Informe a data do corte antes da data de lançamento." });
      return;
    }
    if (exec.data_lancamento && exec.data_corte && exec.data_lancamento < exec.data_corte) {
      setMsg({ tipo: "erro", texto: "A data de lançamento não pode ser antes da data do corte." });
      return;
    }
    if (exec.metragem_cortada != null && (Number.isNaN(exec.metragem_cortada) || exec.metragem_cortada < 0)) {
      setMsg({ tipo: "erro", texto: "Metragem inválida." });
      return;
    }
    setSalvando(true);
    const r = await salvarExecucao(cabo, exec);
    setSalvando(false);
    if (r.estado === "enviado") {
      setMsg({ tipo: "ok", texto: "Registro salvo." });
      setTimeout(voltar, 700);
    } else if (r.estado === "pendente") {
      setMsg({ tipo: "alerta", texto: "Sem internet: salvo no celular, será enviado quando a conexão voltar." });
      setTimeout(voltar, 1400);
    } else {
      setMsg({ tipo: "erro", texto: r.mensagem ?? "Não foi possível salvar." });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho titulo="Preenchimento do cabo" voltar={voltar} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-32">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-bold text-marinho">{cabo.tag}</h2>
          <SeloStatus status={statusPrevisto} />
        </div>

        <section className="mt-4 rounded-xl bg-[#e9edf2] p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-suave"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 016 0v3H9z" /></svg>
            Dados do cadastro
          </h3>
          <dl className="mt-3 grid grid-cols-[8.5rem_1fr] gap-y-2 text-sm">
            {[
              ["Disciplina", cabo.disciplina],
              ["Pavimento / Área", cabo.pavimento],
              ["Painel", cabo.painel],
              ["Cabo estimado", cabo.cabo_estimado],
              ["DE", cabo.de],
              ["PARA", cabo.para],
              ["Metragem estimada", formatarMetros(cabo.metragem_estimada)],
            ].map(([r, v]) => (
              <div key={r} className="contents">
                <dt className="text-suave">{r}</dt>
                <dd className="font-semibold break-all">{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-4 rounded-xl bg-white p-4 ring-1 ring-borda">
          <h3 className="flex items-center gap-2 font-bold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
            Preencher execução
          </h3>
          <p className="text-sm text-suave">Preencha apenas o que foi executado.</p>
          <div className="mt-4 space-y-4">
            <Campo rotulo="Data do corte">
              <input type="date" value={dataCorte} onChange={(e) => setDataCorte(e.target.value)} className={classeInput} />
            </Campo>
            <Campo rotulo="Metragem cortada">
              <div className="flex">
                <input
                  inputMode="decimal"
                  placeholder="Informar metragem"
                  value={metragem}
                  onChange={(e) => setMetragem(e.target.value.replace(/[^\d.,]/g, ""))}
                  className={`${classeInput} rounded-r-none`}
                />
                <span className="grid w-12 place-items-center rounded-r-lg border border-l-0 border-borda bg-fundo text-suave">m</span>
              </div>
            </Campo>
            {excedeu && <Aviso tipo="alerta">Metragem cortada maior que a estimada ({formatarMetros(cabo.metragem_estimada)}).</Aviso>}
            <Campo rotulo="Cabo cortado">
              <input list="sugestoes-cabo" placeholder="Selecionar cabo" value={caboCortado} onChange={(e) => setCaboCortado(e.target.value)} className={classeInput} />
              <datalist id="sugestoes-cabo">
                {sugestoesCabo.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Campo>
            {!caboCortado && cabo.cabo_estimado && (
              <button type="button" onClick={() => setCaboCortado(cabo.cabo_estimado!)} className="-mt-2 text-sm font-medium text-teal">
                Usar o cabo previsto ({cabo.cabo_estimado})
              </button>
            )}
            {caboDiferente && <Aviso tipo="alerta">Cabo cortado diferente do previsto ({cabo.cabo_estimado}).</Aviso>}
            <Campo rotulo="Data de lançamento">
              <input type="date" value={dataLanc} min={dataCorte || undefined} onChange={(e) => setDataLanc(e.target.value)} className={classeInput} />
            </Campo>
            <p className="text-sm text-suave">Você pode salvar com campos em branco.</p>
          </div>
        </section>
        {msg && <div className="mt-4"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-fundo via-fundo to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button onClick={salvar} disabled={salvando} className="mx-auto block h-13 w-full max-w-3xl rounded-xl bg-teal py-3.5 text-lg font-semibold text-white shadow-md transition hover:bg-teal-escuro disabled:opacity-60">
          {salvando ? "Salvando…" : "Salvar preenchimento"}
        </button>
      </div>
    </div>
  );
}

type RegistroServidor = {
  id: number;
  criado_em: string;
  depois: Execucao & { status: Status };
  cabos: { id: number; tag: string } | null;
};

function Registros({ pend, abrir, usuarioId }: { pend: Pendente[]; abrir: (id: number) => void; usuarioId: string }) {
  const [lista, setLista] = useState<RegistroServidor[] | null>(null);

  useEffect(() => {
    supabase
      .from("registros")
      .select("id, criado_em, depois, cabos(id, tag)")
      .eq("usuario_id", usuarioId)
      .order("criado_em", { ascending: false })
      .limit(50)
      .then(({ data }) => setLista((data as unknown as RegistroServidor[]) ?? []));
  }, [usuarioId, pend.length]);

  return (
    <>
      {pend.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-bold">Aguardando envio</h2>
          <ul className="mb-6 space-y-2">
            {pend.map((p) => (
              <li key={p.cabo_id}>
                <button onClick={() => abrir(p.cabo_id)} className="w-full rounded-xl bg-p-fundo p-3 text-left ring-1 ring-p/30">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-marinho">{p.tag}</span>
                    <SeloStatus status={calcularStatus(p)} curto />
                  </div>
                  <p className="mt-1 text-sm text-suave">Salvo no celular em {new Date(p.salvo_em).toLocaleString("pt-BR")}</p>
                  {p.erro && <p className="mt-1 text-sm font-medium text-erro">{p.erro}</p>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="mb-3 text-lg font-bold">Meus registros</h2>
      {lista == null ? (
        <p className="text-suave">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-suave ring-1 ring-borda">Nenhum registro enviado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((r) => (
            <li key={r.id}>
              <button onClick={() => r.cabos && abrir(r.cabos.id)} className="w-full rounded-xl bg-white p-3 text-left ring-1 ring-borda">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-marinho">{r.cabos?.tag ?? "Cabo removido"}</span>
                  <SeloStatus status={r.depois.status} curto />
                </div>
                <p className="mt-1 text-sm text-suave">
                  Corte {formatarData(r.depois.data_corte)} · {formatarMetros(r.depois.metragem_cortada)} · Lançamento {formatarData(r.depois.data_lancamento)}
                </p>
                <p className="text-xs text-suave">{new Date(r.criado_em).toLocaleString("pt-BR")}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
