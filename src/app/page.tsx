"use client";

// Tela do usuário de campo: escolher o cabo e preencher a execução — nada além disso.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Cabecalho, Campo, SeloStatus, Selecao, classeInput } from "@/components/ui";
import { baixarCabos, salvarExecucao, sincronizar, useCabosLocais, useOnline, usePendentes, type Pendente } from "@/lib/offline";
import { sair, useSessao } from "@/lib/sessao";
import { calcularStatus, formatarMetros, type Cabo, type Execucao } from "@/lib/tipos";

export default function AppCampo() {
  const { perfil, carregando } = useSessao();
  const router = useRouter();
  const cabos = useCabosLocais();
  const pend = usePendentes();
  const online = useOnline();
  const [disciplina, setDisciplina] = useState("");
  const [pavimento, setPavimento] = useState("");
  const [caboId, setCaboId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);

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

  const disciplinas = useMemo(() => [...new Set(cabos.map((c) => c.disciplina).filter(Boolean) as string[])].sort(), [cabos]);
  const pavimentos = useMemo(
    () => [...new Set(cabos.filter((c) => !disciplina || c.disciplina === disciplina).map((c) => c.pavimento).filter(Boolean) as string[])].sort(),
    [cabos, disciplina],
  );
  const opcoesTag = cabos.filter((c) => (!disciplina || c.disciplina === disciplina) && (!pavimento || c.pavimento === pavimento));
  const pendPorCabo = new Map(pend.map((p) => [p.cabo_id, p]));
  const cabo = caboId != null ? cabos.find((c) => c.id === caboId) : undefined;

  if (carregando || !perfil) {
    return <div className="grid flex-1 place-items-center text-suave">Carregando…</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho
        titulo="Preenchimento do cabo"
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
        <div className="bg-st-p-fundo px-4 py-2 text-center text-sm font-medium text-st-p">
          Sem internet — o preenchimento fica salvo no celular e é enviado quando a conexão voltar.
        </div>
      )}
      {online && pend.length > 0 && (
        <button onClick={atualizar} className="bg-teal-claro px-4 py-2 text-center text-sm font-medium text-teal-escuro">
          {pend.length} preenchimento(s) aguardando envio — toque para enviar
        </button>
      )}

      <main className="mx-auto w-full max-w-xl flex-1 bg-white px-4 pt-4 pb-32">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Disciplina">
            <Selecao valor={disciplina} aoMudar={(v) => { setDisciplina(v); setPavimento(""); setCaboId(null); }} opcoes={disciplinas} todos="Todas" />
          </Campo>
          <Campo rotulo="Pavimento / Área">
            <Selecao valor={pavimento} aoMudar={(v) => { setPavimento(v); setCaboId(null); }} opcoes={pavimentos} todos="Todos" />
          </Campo>
        </div>
        <div className="mt-3">
          <Campo rotulo="TAG do cabo">
            <select
              value={caboId ?? ""}
              onChange={(e) => setCaboId(e.target.value ? Number(e.target.value) : null)}
              className={`${classeInput} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2214%22 height=%2214%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23142322%22 stroke-width=%222.5%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[right_0.75rem_center] bg-no-repeat pr-9 font-semibold`}
            >
              <option value="">Selecionar cabo ({opcoesTag.length})</option>
              {opcoesTag.map((c) => {
                const p = pendPorCabo.get(c.id);
                const st = p ? calcularStatus(p) : c.status;
                return (
                  <option key={c.id} value={c.id}>
                    {c.tag} · {st}
                  </option>
                );
              })}
            </select>
          </Campo>
        </div>

        {cabos.length === 0 ? (
          <p className="mt-6 rounded-xl bg-fundo p-6 text-center text-suave">
            Nenhum cabo carregado ainda. Conecte à internet ou peça ao administrador para importar a planilha.
          </p>
        ) : !cabo ? (
          <p className="mt-6 rounded-xl bg-fundo p-6 text-center text-suave">Escolha a TAG do cabo para preencher.</p>
        ) : (
          <Preenchimento
            key={`${cabo.id}-${cabo.atualizado_em}`}
            cabo={cabo}
            pendente={pendPorCabo.get(cabo.id)}
            sugestoesCabo={[...new Set(cabos.map((c) => c.cabo_estimado).filter(Boolean) as string[])].sort()}
          />
        )}
      </main>
    </div>
  );
}

function Preenchimento({ cabo, pendente, sugestoesCabo }: { cabo: Cabo; pendente?: Pendente; sugestoesCabo: string[] }) {
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
  const opcoesCabo = [...new Set([cabo.cabo_estimado, ...sugestoesCabo, base.cabo_cortado].filter(Boolean) as string[])];

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
    if (r.estado === "enviado") setMsg({ tipo: "ok", texto: "Preenchimento salvo." });
    else if (r.estado === "pendente") setMsg({ tipo: "alerta", texto: "Sem internet: salvo no celular, será enviado quando a conexão voltar." });
    else setMsg({ tipo: "erro", texto: r.mensagem ?? "Não foi possível salvar." });
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-grafite">{cabo.tag}</h2>
        <SeloStatus status={statusPrevisto} />
      </div>

      <section className="mt-4 rounded-2xl bg-[#e8efed] p-5">
        <h3 className="flex items-center gap-3 text-lg font-bold">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-suave"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 016 0v3H9z" /></svg>
          Dados do cadastro
        </h3>
        <dl className="mt-3 grid grid-cols-[minmax(7.5rem,auto)_1fr] gap-x-4 gap-y-2.5">
          {[
            ["Disciplina", cabo.disciplina],
            ["Pavimento / Área", cabo.pavimento],
            ["Cabo estimado", cabo.cabo_estimado],
            ["DE", cabo.de],
            ["PARA", cabo.para],
            ["Metragem estimada", formatarMetros(cabo.metragem_estimada)],
          ].map(([r, v]) => (
            <div key={r} className="contents">
              <dt className="text-suave">{r}</dt>
              <dd className="font-semibold break-words text-grafite">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-4 rounded-2xl border border-borda p-5">
        <h3 className="flex items-center gap-3 text-lg font-bold">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-grafite"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h4" /><path d="M14 3v5h5M19 8l-5-5" /><path d="M18.4 12.6a1.9 1.9 0 012.7 2.7L15 21.4l-3.5.9.9-3.5z" /></svg>
          Preencher execução
        </h3>
        <p className="mt-1 text-suave">Preencha apenas o que foi executado.</p>
        <div className="mt-5 space-y-5">
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
              <span className="grid w-14 place-items-center rounded-r-lg border border-l-0 border-borda bg-fundo text-suave">m</span>
            </div>
          </Campo>
          {excedeu && <Aviso tipo="alerta">Metragem cortada maior que a estimada ({formatarMetros(cabo.metragem_estimada)}).</Aviso>}
          <Campo rotulo="Cabo cortado">
            <Selecao valor={caboCortado} aoMudar={setCaboCortado} opcoes={opcoesCabo} todos="Selecionar cabo" />
          </Campo>
          {caboDiferente && <Aviso tipo="alerta">Cabo cortado diferente do previsto ({cabo.cabo_estimado}).</Aviso>}
          <Campo rotulo="Data de lançamento">
            <input type="date" value={dataLanc} min={dataCorte || undefined} onChange={(e) => setDataLanc(e.target.value)} className={classeInput} />
          </Campo>
          <p className="text-suave">Você pode salvar com campos em branco.</p>
        </div>
      </section>
      {msg && <div className="mt-4"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button onClick={salvar} disabled={salvando} className="mx-auto block w-full max-w-xl gradiente-marca rounded-xl py-4 text-lg font-semibold text-white shadow-md transition hover:brightness-95 disabled:opacity-60">
          {salvando ? "Salvando…" : "Salvar preenchimento"}
        </button>
      </div>
    </>
  );
}
