"use client";

// Tela do usuário de campo: lista de cabos (com o que falta) → toca no cabo → preenche a execução.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, AvisoNoTopo, Cabecalho, Campo, SeloStatus, Selecao, classeInput, useAvisoFlutuante, type TipoAviso } from "@/components/ui";
import { baixarCabos, salvarExecucao, sincronizar, useCabosLocais, useOnline, usePendentes, type Pendente } from "@/lib/offline";
import { sair, useSessao } from "@/lib/sessao";
import { calcularStatus, formatarMetros, type Cabo, type Execucao, type Status } from "@/lib/tipos";

const ORDEM_STATUS: Record<Status, number> = { NI: 0, P: 1, T: 2 };

export default function AppCampo() {
  const { perfil, carregando } = useSessao();
  const router = useRouter();
  const cabos = useCabosLocais();
  const pend = usePendentes();
  const online = useOnline();
  const [disciplina, setDisciplina] = useState("");
  const [pavimento, setPavimento] = useState("");
  const [busca, setBusca] = useState("");
  const [caboId, setCaboId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const { aviso, mostrar, fechar } = useAvisoFlutuante();
  const rolagemDaLista = useRef(0);

  function abrir(id: number) {
    rolagemDaLista.current = window.scrollY;
    fechar();
    setCaboId(id);
    window.scrollTo(0, 0);
  }

  // Volta para a lista no mesmo ponto em que a pessoa estava
  function voltarParaLista() {
    setCaboId(null);
    requestAnimationFrame(() => window.scrollTo(0, rolagemDaLista.current));
  }

  // Depois de enviar: volta para a lista (formulário limpo) e mostra a confirmação
  function aoEnviar(tipo: TipoAviso, texto: string) {
    voltarParaLista();
    mostrar(tipo, texto);
  }

  // Envia o que ficou pendente e baixa a lista atualizada (o cache local avisa a tela).
  // manual = a pessoa pediu (menu ou faixa de pendentes): sempre dá retorno na tela.
  const atualizar = useCallback(
    async (manual = false) => {
      if (!navigator.onLine) {
        if (manual) mostrar("alerta", "Sem internet agora. Os dados serão atualizados quando a conexão voltar.");
        return;
      }
      if (manual) setAtualizando(true);
      try {
        const { enviados, restantes } = await sincronizar();
        const lista = await baixarCabos();
        if (enviados > 0) mostrar("ok", `${enviados} preenchimento(s) que estavam no celular foram enviados ✓`);
        else if (restantes > 0) mostrar("alerta", `${restantes} preenchimento(s) não foram enviados. Abra o cabo para ver o motivo.`);
        else if (manual) mostrar("ok", `Dados atualizados ✓ — ${lista.length} cabos`);
      } catch {
        if (manual) mostrar("erro", "Não foi possível atualizar. Verifique a conexão e tente de novo.");
      } finally {
        if (manual) setAtualizando(false);
      }
    },
    [mostrar],
  );

  useEffect(() => {
    if (carregando) return;
    if (!perfil) {
      router.replace("/login");
      return;
    }
    // sincroniza ao abrir (fora do render) e sempre que a internet voltar
    const inicio = setTimeout(() => atualizar(), 0);
    const aoVoltarInternet = () => atualizar();
    window.addEventListener("online", aoVoltarInternet);
    return () => {
      clearTimeout(inicio);
      window.removeEventListener("online", aoVoltarInternet);
    };
  }, [carregando, perfil, atualizar, router]);

  const pendPorCabo = useMemo(() => new Map(pend.map((p) => [p.cabo_id, p])), [pend]);
  // status considerando o que está salvo no celular e ainda não foi enviado
  const statusDe = useCallback((c: Cabo) => (pendPorCabo.has(c.id) ? calcularStatus(pendPorCabo.get(c.id)!) : c.status), [pendPorCabo]);

  const disciplinas = useMemo(() => [...new Set(cabos.map((c) => c.disciplina).filter(Boolean) as string[])].sort(), [cabos]);
  const pavimentos = useMemo(
    () => [...new Set(cabos.filter((c) => !disciplina || c.disciplina === disciplina).map((c) => c.pavimento).filter(Boolean) as string[])].sort(),
    [cabos, disciplina],
  );
  const daArea = cabos.filter((c) => (!disciplina || c.disciplina === disciplina) && (!pavimento || c.pavimento === pavimento));
  const termo = busca.trim().toLowerCase();
  const visiveis = daArea
    .filter((c) => !termo || `${c.tag} ${c.de ?? ""} ${c.para ?? ""}`.toLowerCase().includes(termo))
    .sort((a, b) => ORDEM_STATUS[statusDe(a)] - ORDEM_STATUS[statusDe(b)] || a.tag.localeCompare(b.tag));

  const cabo = caboId != null ? cabos.find((c) => c.id === caboId) : undefined;

  if (carregando || !perfil) {
    return <div className="grid flex-1 place-items-center text-suave">Carregando…</div>;
  }

  if (cabo) {
    return (
      <>
        <Preenchimento
          key={cabo.id}
          cabo={cabo}
          pendente={pendPorCabo.get(cabo.id)}
          sugestoesCabo={[...new Set(cabos.map((c) => c.cabo_estimado).filter(Boolean) as string[])].sort()}
          aoEnviar={aoEnviar}
          voltar={voltarParaLista}
        />
        <AvisoNoTopo aviso={aviso} fechar={fechar} />
      </>
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
              // camada invisível: tocar fora fecha o menu
              <button aria-hidden tabIndex={-1} onClick={() => setMenu(false)} className="fixed inset-0 z-30 cursor-default" />
            )}
            {menu && (
              <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl bg-white text-texto shadow-lg ring-1 ring-borda">
                {perfil.papel === "admin" && (
                  <Link href="/admin" className="block px-4 py-3 hover:bg-fundo">Painel admin</Link>
                )}
                <button onClick={() => { setMenu(false); atualizar(true); }} disabled={atualizando} className="block w-full px-4 py-3 text-left hover:bg-fundo disabled:opacity-60">
                  {atualizando ? "Atualizando…" : "Atualizar dados"}
                </button>
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
        <button onClick={() => atualizar(true)} disabled={atualizando} className="bg-teal-claro px-4 py-2 text-center text-sm font-medium text-teal-escuro">
          {atualizando ? "Enviando…" : `${pend.length} preenchimento(s) aguardando envio — toque para enviar`}
        </button>
      )}

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4 pb-10">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Disciplina">
            <Selecao valor={disciplina} aoMudar={(v) => { setDisciplina(v); setPavimento(""); }} opcoes={disciplinas} todos="Todas" />
          </Campo>
          <Campo rotulo="Pavimento / Área">
            <Selecao valor={pavimento} aoMudar={setPavimento} opcoes={pavimentos} todos="Todos" />
          </Campo>
        </div>

        <input
          type="search"
          placeholder="Buscar por TAG, DE ou PARA"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={`${classeInput} mt-4`}
        />

        <h2 className="mt-5 mb-3 text-lg font-bold">
          Cabos <span className="font-normal text-suave">({visiveis.length})</span>
        </h2>

        {cabos.length === 0 ? (
          <p className="rounded-xl bg-white p-6 text-center text-suave ring-1 ring-borda">
            Nenhum cabo carregado ainda. Conecte à internet ou peça ao administrador para importar a planilha.
          </p>
        ) : visiveis.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-suave ring-1 ring-borda">
            Nenhum cabo encontrado.
            <button onClick={() => setBusca("")} className="mt-2 block w-full font-semibold text-teal">
              Limpar busca
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {visiveis.map((c) => {
              const p = pendPorCabo.get(c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => abrir(c.id)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-borda transition hover:ring-teal/50 active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-lg font-bold text-grafite">{c.tag}</span>
                        <SeloStatus status={statusDe(c)} />
                      </div>
                      {/* DE → PARA em destaque: é por aqui que o pessoal de campo reconhece o cabo */}
                      <dl className="mt-2 grid grid-cols-[3.25rem_1fr] gap-y-1 text-sm">
                        <dt className="font-semibold text-suave">DE</dt>
                        <dd className="font-semibold break-words text-texto">{c.de ?? "—"}</dd>
                        <dt className="font-semibold text-suave">PARA</dt>
                        <dd className="font-semibold break-words text-texto">{c.para ?? "—"}</dd>
                      </dl>
                      {p && (
                        <p className={`mt-2 text-xs font-semibold ${p.erro ? "text-erro" : "text-st-p"}`}>
                          {p.erro ? `Não enviado: ${p.erro}` : "Salvo no celular — aguardando envio"}
                        </p>
                      )}
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-suave"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <AvisoNoTopo aviso={aviso} fechar={fechar} />
    </div>
  );
}

function Preenchimento({
  cabo,
  pendente,
  sugestoesCabo,
  aoEnviar,
  voltar,
}: {
  cabo: Cabo;
  pendente?: Pendente;
  sugestoesCabo: string[];
  aoEnviar: (tipo: TipoAviso, texto: string) => void;
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
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const alterado =
    exec.data_corte !== (base.data_corte ?? null) ||
    exec.metragem_cortada !== (base.metragem_cortada ?? null) ||
    exec.cabo_cortado !== (base.cabo_cortado ?? null) ||
    exec.data_lancamento !== (base.data_lancamento ?? null);
  // Evita perder o que foi digitado ao voltar sem salvar
  function tentarVoltar() {
    if (alterado && !salvando) setConfirmarSaida(true);
    else voltar();
  }
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
    setMsg(null);
    const r = await salvarExecucao(cabo, exec);
    setSalvando(false);
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (r.estado === "enviado") {
      aoEnviar("ok", `Enviado ✓ — ${cabo.tag} atualizado às ${hora} (status ${calcularStatus(exec)}).`);
    } else if (r.estado === "pendente") {
      aoEnviar("alerta", `${cabo.tag}: sem internet, salvo no celular. Será enviado quando a conexão voltar.`);
    } else {
      setMsg({ tipo: "erro", texto: r.mensagem ?? "Não foi possível salvar." });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho titulo="Preenchimento do cabo" voltar={tentarVoltar} />
      <main className="mx-auto w-full max-w-xl flex-1 bg-white px-4 pt-2 pb-36">
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
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
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Aviso logo acima do botão, para não ficar escondido atrás dele */}
        {msg && (
          <div role="status" aria-live="polite" className="mx-auto mb-2 max-w-xl shadow-lg">
            <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
          </div>
        )}
        <button onClick={salvar} disabled={salvando} className="mx-auto block w-full max-w-xl gradiente-marca rounded-xl py-4 text-lg font-semibold text-white shadow-md transition hover:brightness-95 disabled:opacity-60">
          {salvando ? "Enviando…" : "Salvar preenchimento"}
        </button>
      </div>
      </main>

      {confirmarSaida && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="text-lg font-bold">Sair sem salvar?</h3>
            <p className="mt-1 text-suave">O que você preencheu em {cabo.tag} ainda não foi enviado.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={voltar} className="h-12 rounded-xl font-semibold text-erro ring-1 ring-borda">Sair sem salvar</button>
              <button onClick={() => setConfirmarSaida(false)} className="gradiente-marca h-12 rounded-xl font-semibold text-white">Continuar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
