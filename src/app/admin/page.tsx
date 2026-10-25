"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, AvisoNoTopo, Cabecalho, Campo, SeloStatus, Selecao, classeInput, useAvisoFlutuante, type TipoAviso } from "@/components/ui";
import { exportarPdf } from "@/lib/pdf";
import { ACOES, SELECT_REGISTRO, historicoDoCabo, hora, mudancaStatus, mudancas, rotuloDia, type Acao, type Registro } from "@/lib/historico";
import { agrupar, exportarExcel, exportarHistoricoExcel, lerPlanilha, painelDoDe, resumo, type ResultadoLeitura } from "@/lib/planilha";
import { baixarCabos } from "@/lib/offline";
import { sair, useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { formatarData, formatarMetros, type Cabo, type Perfil, type Status } from "@/lib/tipos";

type Aba = "painel" | "cabos" | "historico" | "importar" | "usuarios";
const ABAS: [Aba, string][] = [
  ["painel", "Visão geral"],
  ["cabos", "Cabos"],
  ["historico", "Histórico"],
  ["importar", "Importar planilha"],
  ["usuarios", "Usuários"],
];

export default function Admin() {
  const { perfil, carregando } = useSessao();
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("painel");
  const [cabos, setCabos] = useState<Cabo[]>([]);
  const [erro, setErro] = useState("");
  const { aviso, mostrar, fechar } = useAvisoFlutuante();

  const recarregar = useCallback(
    () =>
      baixarCabos().then(
        (c) => {
          setCabos(c);
          setErro("");
        },
        (e) => setErro(e instanceof Error ? e.message : "Erro ao carregar cabos"),
      ),
    [],
  );

  useEffect(() => {
    if (carregando) return;
    if (!perfil) router.replace("/login");
    else if (perfil.papel !== "admin") router.replace("/");
    else recarregar();
  }, [carregando, perfil, recarregar, router]);

  if (carregando || perfil?.papel !== "admin") {
    return <div className="grid flex-1 place-items-center text-suave">Carregando…</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho
        titulo="Controle de cabos"
        subtitulo={`Painel do administrador · ${perfil.nome}`}
        direita={
          <div className="flex items-center gap-1 text-sm">
            <Link href="/" className="rounded-lg px-3 py-2 font-medium hover:bg-white/10">Formulário</Link>
            <button onClick={sair} className="rounded-lg px-3 py-2 font-medium hover:bg-white/10">Sair</button>
          </div>
        }
      />
      <div className="sticky top-[calc(4.5rem+env(safe-area-inset-top))] z-10 border-b border-borda bg-white">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {ABAS.map(([a, r]) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${aba === a ? "border-teal text-teal" : "border-transparent text-suave hover:text-texto"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <main className={`mx-auto w-full flex-1 px-4 py-6 ${aba === "cabos" ? "max-w-[1800px]" : "max-w-6xl"}`}>
        {erro && <div className="mb-4"><Aviso tipo="erro">{erro}</Aviso></div>}
        {aba === "painel" && <Painel cabos={cabos} />}
        {aba === "cabos" && <TabelaCabos cabos={cabos} recarregar={recarregar} mostrar={mostrar} />}
        {aba === "importar" && <Importar recarregar={recarregar} irParaCabos={() => setAba("cabos")} />}
        {aba === "historico" && <Historico cabos={cabos} mostrar={mostrar} recarregar={recarregar} />}
        {aba === "usuarios" && <Usuarios meuId={perfil.id} mostrar={mostrar} />}
      </main>
      <AvisoNoTopo aviso={aviso} fechar={fechar} />
    </div>
  );
}

function Barra({ t, p, total }: { t: number; p: number; total: number }) {
  const pt = total ? (t / total) * 100 : 0;
  const pp = total ? (p / total) * 100 : 0;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-st-ni-fundo">
      <div className="bg-st-t" style={{ width: `${pt}%` }} />
      <div className="bg-st-p" style={{ width: `${pp}%` }} />
    </div>
  );
}

function Painel({ cabos }: { cabos: Cabo[] }) {
  const r = resumo(cabos);
  const pct = (n: number) => (r.total ? Math.round((n / r.total) * 100) : 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Total de cabos", r.total, "text-grafite", ""],
          ["Terminados (T)", r.T, "text-st-t", `${pct(r.T)}%`],
          ["Parciais (P)", r.P, "text-st-p", `${pct(r.P)}%`],
          ["Não iniciados (NI)", r.NI, "text-st-ni", `${pct(r.NI)}%`],
        ].map(([rot, v, cor, sub]) => (
          <div key={rot as string} className="rounded-xl bg-white p-4 ring-1 ring-borda">
            <p className="text-sm text-suave">{rot}</p>
            <p className={`mt-1 text-3xl font-bold ${cor}`}>
              {v} <span className="text-base font-medium text-suave">{sub}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-white p-4 ring-1 ring-borda">
        <p className="text-sm text-suave">Metragem cortada / estimada</p>
        <p className="mt-1 text-2xl font-bold text-grafite">
          {formatarMetros(r.mCortados)} <span className="text-base font-medium text-suave">de {formatarMetros(r.mEstimados)}</span>
        </p>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-st-ni-fundo">
          <div className="gradiente-marca" style={{ width: `${r.mEstimados ? Math.min(100, (r.mCortados / r.mEstimados) * 100) : 0}%` }} />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {[
          ["Por disciplina", agrupar(cabos, (c) => c.disciplina ?? "(sem disciplina)")],
          ["Por pavimento / área", agrupar(cabos, (c) => c.pavimento ?? "(sem pavimento)")],
        ].map(([titulo, grupos]) => (
          <section key={titulo as string} className="rounded-xl bg-white p-4 ring-1 ring-borda">
            <h2 className="font-bold">{titulo as string}</h2>
            <ul className="mt-3 space-y-3">
              {(grupos as ReturnType<typeof agrupar>).map(([nome, g]) => (
                <li key={nome}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{nome}</span>
                    <span className="text-suave">
                      {g.T}/{g.total} terminados · {g.P} parciais
                    </span>
                  </div>
                  <Barra t={g.T} p={g.P} total={g.total} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="flex flex-wrap gap-4 text-sm text-suave">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-st-t" /> T · Terminado (lançado)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-st-p" /> P · Parcial (cortado, aguardando lançamento)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-st-ni" /> NI · Não iniciado</span>
      </p>
    </div>
  );
}

type Mostrar = (tipo: TipoAviso, texto: string) => void;

function TabelaCabos({ cabos, recarregar, mostrar }: { cabos: Cabo[]; recarregar: () => Promise<void>; mostrar: Mostrar }) {
  const [disciplina, setDisciplina] = useState("");
  const [pavimento, setPavimento] = useState("");
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [exportando, setExportando] = useState<"" | "pdf" | "xlsx">("");
  const [aberto, setAberto] = useState<Cabo | null>(null);
  const [novo, setNovo] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const disciplinas = useMemo(() => [...new Set(cabos.map((c) => c.disciplina).filter(Boolean) as string[])].sort(), [cabos]);
  const pavimentos = useMemo(() => [...new Set(cabos.map((c) => c.pavimento).filter(Boolean) as string[])].sort(), [cabos]);
  const sugestoes: Sugestoes = useMemo(
    () => ({
      disciplinas,
      pavimentos,
      cabosEstimados: [...new Set(cabos.map((c) => c.cabo_estimado).filter(Boolean) as string[])].sort(),
    }),
    [cabos, disciplinas, pavimentos],
  );

  const filtrados = cabos.filter(
    (c) =>
      (!disciplina || c.disciplina === disciplina) &&
      (!pavimento || c.pavimento === pavimento) &&
      (!status || c.status === status) &&
      (!busca || `${c.tag} ${c.de} ${c.para}`.toLowerCase().includes(busca.toLowerCase())),
  );
  const descricaoFiltros = [disciplina, pavimento, status && `status ${status}`, busca && `busca "${busca}"`].filter(Boolean).join(" · ");

  async function exportar(tipo: "pdf" | "xlsx") {
    setExportando(tipo);
    try {
      if (tipo === "pdf") await exportarPdf(filtrados, descricaoFiltros);
      else await exportarExcel(filtrados, descricaoFiltros);
      mostrar("ok", `${tipo === "pdf" ? "PDF" : "Excel"} gerado ✓ — ${filtrados.length} cabos. Veja na pasta de downloads.`);
    } catch {
      mostrar("erro", `Não foi possível gerar o ${tipo === "pdf" ? "PDF" : "Excel"}. Tente de novo.`);
    } finally {
      setExportando("");
    }
  }

  async function atualizarLista() {
    setAtualizando(true);
    await recarregar();
    setAtualizando(false);
    mostrar("ok", `Lista atualizada ✓ — ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_1fr_1.5fr]">
        <Campo rotulo="Disciplina"><Selecao valor={disciplina} aoMudar={setDisciplina} opcoes={disciplinas} todos="Todas" /></Campo>
        <Campo rotulo="Pavimento / Área"><Selecao valor={pavimento} aoMudar={setPavimento} opcoes={pavimentos} todos="Todas" /></Campo>
        <Campo rotulo="Status"><Selecao valor={status} aoMudar={setStatus} opcoes={["NI", "P", "T"]} todos="Todos" /></Campo>
        <Campo rotulo="Buscar"><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="TAG, DE ou PARA" className={classeInput} /></Campo>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="mr-auto flex items-center gap-2 text-sm text-suave">
          {filtrados.length} de {cabos.length} cabos
          <button onClick={atualizarLista} disabled={atualizando} className="rounded-lg px-2 py-1 font-semibold text-teal hover:bg-teal-claro disabled:opacity-60">
            {atualizando ? "Atualizando…" : "↻ Atualizar"}
          </button>
        </p>
        <button onClick={() => setNovo(true)} className="gradiente-marca flex h-11 items-center gap-2 rounded-lg px-4 font-semibold text-white shadow-sm hover:brightness-95">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Novo cabo
        </button>
        <button onClick={() => exportar("xlsx")} disabled={!!exportando || !filtrados.length} className="flex h-11 items-center gap-2 rounded-lg bg-white px-4 font-semibold text-st-t ring-1 ring-borda hover:bg-st-t-fundo disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" /><path d="M8 13l4 5M12 13l-4 5" /></svg>
          {exportando === "xlsx" ? "Gerando…" : "Exportar Excel"}
        </button>
        <button onClick={() => exportar("pdf")} disabled={!!exportando || !filtrados.length} className="flex h-11 items-center gap-2 rounded-lg bg-teal px-4 font-semibold text-white hover:bg-teal-escuro disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" /><path d="M9 15h6M9 18h4" /></svg>
          {exportando === "pdf" ? "Gerando…" : "Exportar PDF"}
        </button>
      </div>

      {/* No celular: TAG, DE, PARA e Status. No computador: todas as colunas. Toque na linha para abrir o cabo. */}
      <div className="mt-4 max-h-[calc(100dvh-16rem)] overflow-auto rounded-xl bg-white ring-1 ring-borda">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-20 text-left text-[11px] uppercase tracking-wide text-white">
            <tr>
              <th className="sticky left-0 z-10 bg-grafite px-2.5 py-2.5 font-semibold whitespace-nowrap">TAG</th>
              <th className="bg-grafite px-2.5 py-2.5 font-semibold">DE</th>
              <th className="bg-grafite px-2.5 py-2.5 font-semibold">PARA</th>
              {["Disciplina", "Pavimento", "Cabo est.", "m est.", "Corte", "m cort.", "Cabo cortado", "Lançamento"].map((h) => (
                <th key={h} className={`hidden bg-grafite px-2.5 py-2.5 font-semibold whitespace-nowrap md:table-cell ${h.startsWith("m ") ? "text-right" : ""}`}>{h}</th>
              ))}
              <th className="sticky right-0 z-10 bg-grafite px-2.5 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const td = "border-t border-borda px-2.5 py-2 group-hover:bg-teal-claro";
              const so = `hidden md:table-cell whitespace-nowrap ${td}`;
              return (
                <tr
                  key={c.id}
                  onClick={() => setAberto(c)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAberto(c)}
                  tabIndex={0}
                  title={`Abrir ${c.tag}`}
                  className="group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  <td className={`sticky left-0 z-10 border-r bg-white font-bold whitespace-nowrap text-grafite ${td}`}>{c.tag}</td>
                  <td className={`min-w-[8.5rem] break-words text-texto md:whitespace-nowrap ${td}`}>{c.de}</td>
                  <td className={`min-w-[8.5rem] break-words text-texto md:whitespace-nowrap ${td}`}>{c.para}</td>
                  <td className={so}>{c.disciplina}</td>
                  <td className={so}>{c.pavimento}</td>
                  <td className={so}>{c.cabo_estimado}</td>
                  <td className={`${so} text-right`}>{c.metragem_estimada ?? ""}</td>
                  <td className={so}>{c.data_corte ? formatarData(c.data_corte) : ""}</td>
                  <td className={`${so} text-right ${c.metragem_cortada != null && c.metragem_estimada != null && c.metragem_cortada > c.metragem_estimada ? "font-bold text-st-p" : ""}`}>{c.metragem_cortada ?? ""}</td>
                  <td className={`${so} ${c.cabo_cortado && c.cabo_estimado && c.cabo_cortado !== c.cabo_estimado ? "font-bold text-st-p" : ""}`}>{c.cabo_cortado}</td>
                  <td className={so}>{c.data_lancamento ? formatarData(c.data_lancamento) : ""}</td>
                  <td className={`sticky right-0 z-10 border-l bg-white ${td}`}>
                    <div className="flex items-center justify-between gap-1">
                      <SeloStatus status={c.status as Status} curto />
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-suave"><path d="M9 6l6 6-6 6" /></svg>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtrados.length && <p className="p-6 text-center text-suave">Nenhum cabo encontrado.</p>}
      </div>

      {aberto && <DetalheCabo key={aberto.id} cabo={aberto} fechar={() => setAberto(null)} mostrar={mostrar} aoMudar={recarregar} sugestoes={sugestoes} />}
      {novo && <NovoCabo fechar={() => setNovo(false)} mostrar={mostrar} aoMudar={recarregar} sugestoes={sugestoes} />}
    </div>
  );
}

// Detalhe do cabo no admin: dados do cadastro, edição da execução e exclusão (com confirmação)
function DetalheCabo({
  cabo,
  fechar,
  mostrar,
  aoMudar,
  sugestoes,
}: {
  cabo: Cabo;
  fechar: () => void;
  mostrar: Mostrar;
  aoMudar: () => Promise<void>;
  sugestoes: Sugestoes;
}) {
  const [editandoCadastro, setEditandoCadastro] = useState(false);
  const [dataCorte, setDataCorte] = useState(cabo.data_corte ?? "");
  const [metragem, setMetragem] = useState(cabo.metragem_cortada?.toString() ?? "");
  const [caboCortado, setCaboCortado] = useState(cabo.cabo_cortado ?? "");
  const [dataLanc, setDataLanc] = useState(cabo.data_lancamento ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const metr = metragem === "" ? null : Number(metragem.replace(",", "."));
  const statusPrevisto: Status = dataLanc ? "T" : dataCorte || metr != null || caboCortado.trim() ? "P" : "NI";

  async function salvar() {
    setErroForm("");
    if (dataLanc && !dataCorte) return setErroForm("Informe a data do corte antes da data de lançamento.");
    if (dataLanc && dataCorte && dataLanc < dataCorte) return setErroForm("A data de lançamento não pode ser antes da data do corte.");
    if (metr != null && (Number.isNaN(metr) || metr < 0)) return setErroForm("Metragem inválida.");
    setSalvando(true);
    const { error } = await supabase.rpc("registrar_execucao", {
      p_cabo_id: cabo.id,
      p_data_corte: dataCorte || null,
      p_metragem_cortada: metr,
      p_cabo_cortado: caboCortado.trim() || null,
      p_data_lancamento: dataLanc || null,
    });
    setSalvando(false);
    if (error) return setErroForm(error.message);
    mostrar("ok", `${cabo.tag} atualizado ✓ (status ${statusPrevisto})`);
    fechar();
    aoMudar();
  }

  async function excluir() {
    setExcluindo(true);
    const { error } = await supabase.rpc("excluir_cabo", { p_cabo_id: cabo.id });
    setExcluindo(false);
    if (error) {
      mostrar("erro", `Não foi possível excluir ${cabo.tag}: ${error.message}`);
      return;
    }
    mostrar("ok", `Cabo ${cabo.tag} excluído.`);
    fechar();
    aoMudar();
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={fechar}>
      <aside
        role="dialog"
        aria-label={`Cabo ${cabo.tag}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 bg-grafite text-white">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={fechar} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{cabo.tag}</h2>
            <SeloStatus status={statusPrevisto} curto />
          </div>
          <div className="faixa-marca" />
        </header>

        <div className="flex-1 space-y-4 p-4">
          {editandoCadastro ? (
            <FormCadastro
              inicial={cabo}
              sugestoes={sugestoes}
              rotuloSalvar="Salvar cadastro"
              cancelar={() => setEditandoCadastro(false)}
              salvar={async (dados) => {
                const { error } = await supabase.rpc("atualizar_cadastro", { p_cabo_id: cabo.id, p: dados });
                if (error) return error.message;
                mostrar("ok", `Cadastro de ${dados.tag} atualizado ✓`);
                fechar();
                aoMudar();
                return null;
              }}
            />
          ) : (
          <section className="rounded-2xl bg-[#e8efed] p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">Dados do cadastro</h3>
              <button onClick={() => setEditandoCadastro(true)} className="rounded-lg px-2 py-1 text-sm font-semibold text-teal hover:bg-white">
                Editar
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
              {[
                ["DE", cabo.de],
                ["PARA", cabo.para],
                ["Disciplina", cabo.disciplina],
                ["Pavimento / Área", cabo.pavimento],
                ["Painel", cabo.painel],
                ["Cabo estimado", cabo.cabo_estimado],
                ["Metragem estimada", formatarMetros(cabo.metragem_estimada)],
              ].map(([r, v]) => (
                <div key={r} className="contents">
                  <dt className="text-suave">{r}</dt>
                  <dd className="font-semibold break-words">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
          )}

          <section className="rounded-2xl p-4 ring-1 ring-borda">
            <h3 className="font-bold">Execução</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data do corte"><input type="date" value={dataCorte} onChange={(e) => setDataCorte(e.target.value)} className={classeInput} /></Campo>
              <Campo rotulo="Metragem cortada (m)"><input inputMode="decimal" value={metragem} onChange={(e) => setMetragem(e.target.value.replace(/[^\d.,]/g, ""))} className={classeInput} /></Campo>
              <Campo rotulo="Cabo cortado"><input value={caboCortado} onChange={(e) => setCaboCortado(e.target.value)} placeholder={cabo.cabo_estimado ?? ""} className={classeInput} /></Campo>
              <Campo rotulo="Data de lançamento"><input type="date" value={dataLanc} min={dataCorte || undefined} onChange={(e) => setDataLanc(e.target.value)} className={classeInput} /></Campo>
            </div>
            {erroForm && <div className="mt-3"><Aviso tipo="erro">{erroForm}</Aviso></div>}
            <button onClick={salvar} disabled={salvando} className="gradiente-marca mt-4 h-12 w-full rounded-xl font-semibold text-white disabled:opacity-60">
              {salvando ? "Salvando…" : "Salvar alterações"}
            </button>
          </section>

          <HistoricoDoCabo caboId={cabo.id} />

          {/* Exclusão fica aqui dentro, separada e com confirmação, para não apagar sem querer */}
          <section className="rounded-2xl p-4 ring-1 ring-erro/30">
            {!confirmarExclusao ? (
              <button onClick={() => setConfirmarExclusao(true)} className="flex w-full items-center justify-center gap-2 font-semibold text-erro">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                Excluir cabo
              </button>
            ) : (
              <>
                <p className="font-bold text-erro">Excluir {cabo.tag}?</p>
                <p className="mt-1 text-sm text-suave">O cabo e todo o histórico de preenchimentos dele serão apagados. Isso não pode ser desfeito.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => setConfirmarExclusao(false)} disabled={excluindo} className="h-11 rounded-xl font-semibold ring-1 ring-borda">Cancelar</button>
                  <button onClick={excluir} disabled={excluindo} className="h-11 rounded-xl bg-erro font-semibold text-white disabled:opacity-60">
                    {excluindo ? "Excluindo…" : "Sim, excluir"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

type Sugestoes = { disciplinas: string[]; pavimentos: string[]; cabosEstimados: string[] };

type DadosCadastro = {
  tag: string;
  de: string;
  para: string;
  disciplina: string;
  pavimento: string;
  painel: string;
  cabo_estimado: string;
  metragem_estimada: string;
};

// Campos do cadastro de um cabo — usados no "Novo cabo" e no "Editar" do detalhe.
// salvar devolve uma mensagem de erro, ou null quando deu certo.
function FormCadastro({
  inicial,
  sugestoes,
  rotuloSalvar,
  salvar,
  cancelar,
  extra,
}: {
  inicial?: Partial<Cabo>;
  sugestoes: Sugestoes;
  rotuloSalvar: string;
  salvar: (dados: DadosCadastro) => Promise<string | null>;
  cancelar: () => void;
  extra?: React.ReactNode;
}) {
  const [d, setD] = useState<DadosCadastro>({
    tag: inicial?.tag ?? "",
    de: inicial?.de ?? "",
    para: inicial?.para ?? "",
    disciplina: inicial?.disciplina ?? "",
    pavimento: inicial?.pavimento ?? "",
    painel: inicial?.painel ?? "",
    cabo_estimado: inicial?.cabo_estimado ?? "",
    metragem_estimada: inicial?.metragem_estimada?.toString() ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const muda = (k: keyof DadosCadastro) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const painelSugerido = painelDoDe(d.de.trim() || null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!d.tag.trim()) return setErro("Informe a TAG do cabo.");
    const metr = d.metragem_estimada.trim().replace(",", ".");
    if (metr && (Number.isNaN(Number(metr)) || Number(metr) < 0)) return setErro("Metragem estimada inválida.");
    setSalvando(true);
    const msg = await salvar({ ...d, tag: d.tag.trim().toUpperCase(), painel: d.painel.trim() || painelSugerido || "", metragem_estimada: metr });
    setSalvando(false);
    if (msg) setErro(msg);
  }

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-2xl p-4 ring-1 ring-borda">
      <datalist id="sug-disciplina">{sugestoes.disciplinas.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="sug-pavimento">{sugestoes.pavimentos.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="sug-cabo">{sugestoes.cabosEstimados.map((o) => <option key={o} value={o} />)}</datalist>
      <Campo rotulo="TAG do cabo *">
        <input autoFocus required value={d.tag} onChange={muda("tag")} placeholder="Ex.: 1024-CA-70-HVAC" className={`${classeInput} font-semibold uppercase`} />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="DE"><input value={d.de} onChange={muda("de")} placeholder="Origem do cabo" className={classeInput} /></Campo>
        <Campo rotulo="PARA"><input value={d.para} onChange={muda("para")} placeholder="Destino do cabo" className={classeInput} /></Campo>
        <Campo rotulo="Disciplina"><input list="sug-disciplina" value={d.disciplina} onChange={muda("disciplina")} className={classeInput} /></Campo>
        <Campo rotulo="Pavimento / Área"><input list="sug-pavimento" value={d.pavimento} onChange={muda("pavimento")} className={classeInput} /></Campo>
        <Campo rotulo="Cabo estimado"><input list="sug-cabo" value={d.cabo_estimado} onChange={muda("cabo_estimado")} className={classeInput} /></Campo>
        <Campo rotulo="Metragem estimada (m)">
          <input inputMode="decimal" value={d.metragem_estimada} onChange={(e) => setD({ ...d, metragem_estimada: e.target.value.replace(/[^\d.,]/g, "") })} className={classeInput} />
        </Campo>
      </div>
      <Campo rotulo="Painel">
        <input value={d.painel} onChange={muda("painel")} placeholder={painelSugerido ? `${painelSugerido} (pelo DE)` : "Opcional"} className={classeInput} />
      </Campo>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {extra}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onClick={cancelar} disabled={salvando} className="h-12 rounded-xl font-semibold ring-1 ring-borda">Cancelar</button>
        <button disabled={salvando} className="gradiente-marca h-12 rounded-xl font-semibold text-white disabled:opacity-60">
          {salvando ? "Salvando…" : rotuloSalvar}
        </button>
      </div>
    </form>
  );
}

// Gaveta lateral para cadastrar um cabo sem planilha
function NovoCabo({ fechar, mostrar, aoMudar, sugestoes }: { fechar: () => void; mostrar: Mostrar; aoMudar: () => Promise<void>; sugestoes: Sugestoes }) {
  const [continuar, setContinuar] = useState(false);
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={fechar}>
      <aside role="dialog" aria-label="Novo cabo" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 z-10 bg-grafite text-white">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={fechar} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <h2 className="flex-1 text-lg font-bold">Novo cabo</h2>
          </div>
          <div className="faixa-marca" />
        </header>
        <div className="p-4">
          <p className="mb-3 text-sm text-suave">
            O cabo entra como <b>NI · Não iniciado</b> e aparece na hora para o pessoal de campo preencher. Para muitos cabos de uma vez, use “Importar planilha”.
          </p>
          <FormCadastro
            key={rodada}
            sugestoes={sugestoes}
            rotuloSalvar="Cadastrar cabo"
            cancelar={fechar}
            extra={
              <label className="flex items-center gap-2 text-sm text-texto">
                <input type="checkbox" checked={continuar} onChange={(e) => setContinuar(e.target.checked)} className="h-4 w-4 accent-teal" />
                Cadastrar outro em seguida
              </label>
            }
            salvar={async (dados) => {
              const { error } = await supabase.rpc("criar_cabo", { p: dados });
              if (error) return error.message;
              mostrar("ok", `Cabo ${dados.tag} cadastrado ✓`);
              aoMudar();
              if (continuar) setRodada((r) => r + 1);
              else fechar();
              return null;
            }}
          />
        </div>
      </aside>
    </div>
  );
}

type Periodo = "hoje" | "7" | "30" | "tudo" | "datas";

// Aba Histórico: quem fez o quê, em qual cabo e a que horas
function Historico({ cabos, mostrar, recarregar }: { cabos: Cabo[]; mostrar: Mostrar; recarregar: () => Promise<void> }) {
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([]);
  const [pessoa, setPessoa] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("7");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [acao, setAcao] = useState<Acao | "">("");
  const [busca, setBusca] = useState("");
  const [exportando, setExportando] = useState(false);
  const [aberto, setAberto] = useState<Cabo | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    supabase
      .from("perfis")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setPessoas(data ?? []));
  }, []);

  useEffect(() => {
    let q = supabase.from("registros").select(SELECT_REGISTRO).order("criado_em", { ascending: false }).limit(2000);
    if (pessoa) q = q.eq("usuario_id", pessoa);
    if (acao) q = q.eq("acao", acao);
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    if (periodo === "hoje") q = q.gte("criado_em", inicio.toISOString());
    if (periodo === "7" || periodo === "30") {
      inicio.setDate(inicio.getDate() - (Number(periodo) - 1));
      q = q.gte("criado_em", inicio.toISOString());
    }
    if (periodo === "datas") {
      if (dataIni) q = q.gte("criado_em", new Date(`${dataIni}T00:00:00`).toISOString());
      if (dataFim) q = q.lte("criado_em", new Date(`${dataFim}T23:59:59.999`).toISOString());
    }
    let vivo = true;
    q.then(({ data, error }) => {
      if (!vivo) return;
      if (error) mostrar("erro", `Não foi possível carregar o histórico: ${error.message}`);
      setRegistros((data as unknown as Registro[]) ?? []);
    });
    return () => {
      vivo = false;
    };
  }, [pessoa, acao, periodo, dataIni, dataFim, versao, mostrar]);

  const termo = busca.trim().toLowerCase();
  const visiveis = (registros ?? []).filter((r) => !termo || `${r.tag ?? ""} ${r.de ?? ""} ${r.para ?? ""}`.toLowerCase().includes(termo));

  // Resumo por pessoa no período (preenchimentos e cabos que mudaram de status)
  const porPessoa = new Map<string, { preench: number; outros: number }>();
  for (const r of visiveis) {
    const nome = r.perfis?.nome ?? "(usuário removido)";
    const p = porPessoa.get(nome) ?? { preench: 0, outros: 0 };
    if (r.acao === "preenchimento") p.preench++;
    else p.outros++;
    porPessoa.set(nome, p);
  }

  const grupos: [string, Registro[]][] = [];
  for (const r of visiveis) {
    const dia = rotuloDia(r.criado_em);
    const g = grupos.at(-1);
    if (g && g[0] === dia) g[1].push(r);
    else grupos.push([dia, [r]]);
  }

  const nomePeriodo = { hoje: "hoje", "7": "últimos 7 dias", "30": "últimos 30 dias", tudo: "todo o período", datas: `${dataIni ? formatarData(dataIni) : "início"} a ${dataFim ? formatarData(dataFim) : "hoje"}` }[periodo];
  const descricaoFiltros = [nomePeriodo, pessoas.find((p) => p.id === pessoa)?.nome, acao && ACOES[acao].rotulo, termo && `busca "${busca}"`].filter(Boolean).join(" · ");

  async function exportar() {
    setExportando(true);
    try {
      await exportarHistoricoExcel(visiveis, descricaoFiltros);
      mostrar("ok", `Histórico exportado ✓ — ${visiveis.length} registros. Veja na pasta de downloads.`);
    } catch {
      mostrar("erro", "Não foi possível gerar o Excel do histórico.");
    } finally {
      setExportando(false);
    }
  }

  function abrirCabo(r: Registro) {
    const c = r.cabo_id != null ? cabos.find((x) => x.id === r.cabo_id) : undefined;
    if (c) setAberto(c);
    else mostrar("alerta", `${r.tag ?? "Esse cabo"} foi excluído — só o histórico ficou guardado.`);
  }

  const sugestoes: Sugestoes = {
    disciplinas: [...new Set(cabos.map((c) => c.disciplina).filter(Boolean) as string[])].sort(),
    pavimentos: [...new Set(cabos.map((c) => c.pavimento).filter(Boolean) as string[])].sort(),
    cabosEstimados: [...new Set(cabos.map((c) => c.cabo_estimado).filter(Boolean) as string[])].sort(),
  };

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Campo rotulo="Período">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className={classeInput}>
            <option value="hoje">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="tudo">Tudo</option>
            <option value="datas">Escolher datas…</option>
          </select>
        </Campo>
        <Campo rotulo="Pessoa">
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={classeInput}>
            <option value="">Todas</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Ação">
          <select value={acao} onChange={(e) => setAcao(e.target.value as Acao | "")} className={classeInput}>
            <option value="">Todas</option>
            {(Object.keys(ACOES) as Acao[]).map((a) => <option key={a} value={a}>{ACOES[a].rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Buscar"><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="TAG, DE ou PARA" className={classeInput} /></Campo>
      </div>
      {periodo === "datas" && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:w-1/2">
          <Campo rotulo="De"><input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} className={classeInput} /></Campo>
          <Campo rotulo="Até"><input type="date" value={dataFim} min={dataIni || undefined} onChange={(e) => setDataFim(e.target.value)} className={classeInput} /></Campo>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="mr-auto flex items-center gap-2 text-sm text-suave">
          {registros == null ? "Carregando…" : `${visiveis.length} registro(s) · ${nomePeriodo}`}
          <button onClick={() => { setVersao((v) => v + 1); mostrar("ok", "Histórico atualizado ✓"); }} className="rounded-lg px-2 py-1 font-semibold text-teal hover:bg-teal-claro">
            ↻ Atualizar
          </button>
        </p>
        <button onClick={exportar} disabled={exportando || !visiveis.length} className="flex h-11 items-center gap-2 rounded-lg bg-white px-4 font-semibold text-st-t ring-1 ring-borda hover:bg-st-t-fundo disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" /><path d="M8 13l4 5M12 13l-4 5" /></svg>
          {exportando ? "Gerando…" : "Exportar Excel"}
        </button>
      </div>

      {porPessoa.size > 0 && (
        <section className="mt-4 rounded-xl bg-white p-4 ring-1 ring-borda">
          <h3 className="text-sm font-bold text-suave uppercase">Por pessoa · {nomePeriodo}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {[...porPessoa.entries()].sort((a, b) => b[1].preench - a[1].preench).map(([nome, n]) => (
              <li key={nome} className="rounded-lg bg-fundo px-3 py-2 text-sm">
                <b>{nome}</b>: {n.preench} preenchimento(s){n.outros ? ` · ${n.outros} outra(s) ação(ões)` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {registros != null && visiveis.length === 0 && (
        <p className="mt-4 rounded-xl bg-white p-6 text-center text-suave ring-1 ring-borda">Nenhum registro nesse período e filtros.</p>
      )}

      {grupos.map(([dia, lista]) => (
        <section key={dia} className="mt-5">
          <h3 className="mb-2 text-sm font-bold text-suave first-letter:uppercase">{dia}</h3>
          <ul className="space-y-2">
            {lista.map((r) => (
              <li key={r.id}><ItemHistorico r={r} aoAbrir={r.acao === "importacao" ? undefined : () => abrirCabo(r)} /></li>
            ))}
          </ul>
        </section>
      ))}

      {aberto && (
        <DetalheCabo
          key={aberto.id}
          cabo={aberto}
          fechar={() => setAberto(null)}
          mostrar={mostrar}
          aoMudar={async () => {
            await recarregar();
            setVersao((v) => v + 1);
          }}
          sugestoes={sugestoes}
        />
      )}
    </div>
  );
}

// Um item do histórico: hora · pessoa · ação, cabo e o que mudou
function ItemHistorico({ r, aoAbrir, semCabo }: { r: Registro; aoAbrir?: () => void; semCabo?: boolean }) {
  const st = mudancaStatus(r);
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-borda">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-bold text-grafite tabular-nums">{hora(r.criado_em)}</span>
        <span className="font-semibold">{r.perfis?.nome ?? "(usuário removido)"}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACOES[r.acao].cor}`}>{ACOES[r.acao].rotulo}</span>
        {st && (
          <span className="ml-auto flex items-center gap-1">
            <SeloStatus status={st.de} curto />
            <span className="text-suave">→</span>
            <SeloStatus status={st.para} curto />
          </span>
        )}
      </div>
      {!semCabo && r.tag && (
        <button onClick={aoAbrir} disabled={!aoAbrir} className="mt-1.5 block text-left">
          <span className="font-bold text-teal-escuro underline-offset-2 hover:underline">{r.tag}</span>
          <span className="block text-xs text-suave">{r.de ?? "—"} → {r.para ?? "—"}</span>
        </button>
      )}
      <ul className="mt-1.5 space-y-0.5 text-sm text-texto">
        {mudancas(r).map((m) => <li key={m}>{m}</li>)}
      </ul>
    </div>
  );
}

// Linha do tempo de um cabo (dentro do detalhe)
function HistoricoDoCabo({ caboId }: { caboId: number }) {
  const [lista, setLista] = useState<Registro[] | null>(null);
  useEffect(() => {
    historicoDoCabo(caboId).then(setLista);
  }, [caboId]);
  return (
    <section className="rounded-2xl p-4 ring-1 ring-borda">
      <h3 className="font-bold">Histórico deste cabo</h3>
      {lista == null ? (
        <p className="mt-2 text-sm text-suave">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="mt-2 text-sm text-suave">Ninguém preencheu este cabo pelo sistema ainda (dados vieram da planilha).</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lista.map((r, i) => (
            <li key={r.id}>
              {(i === 0 || rotuloDia(lista[i - 1].criado_em) !== rotuloDia(r.criado_em)) && (
                <p className="mb-1 text-xs font-semibold text-suave first-letter:uppercase">{rotuloDia(r.criado_em)}</p>
              )}
              <ItemHistorico r={r} semCabo />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Importar({ recarregar, irParaCabos }: { recarregar: () => Promise<void>; irParaCabos: () => void }) {
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setResultado(null);
    setNomeArquivo(f.name);
    setLendo(true);
    try {
      setLeitura(await lerPlanilha(await f.arrayBuffer()));
    } catch {
      setLeitura({ aba: "", linhas: [], erros: ["Não consegui ler o arquivo. Ele precisa ser .xlsx."], avisos: [] });
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    if (!leitura?.linhas.length) return;
    setEnviando(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const linhas = leitura.linhas.map(({ linha, ...resto }) => resto);
    let novos = 0;
    let atualizados = 0;
    for (let i = 0; i < linhas.length; i += 500) {
      const { data, error } = await supabase.rpc("importar_cabos", { p_linhas: linhas.slice(i, i + 500) });
      if (error) {
        setResultado({ tipo: "erro", texto: `Erro ao importar: ${error.message}` });
        setEnviando(false);
        return;
      }
      novos += data.novos;
      atualizados += data.atualizados;
    }
    await recarregar();
    setEnviando(false);
    setLeitura(null);
    setResultado({ tipo: "ok", texto: `Importação concluída: ${novos} cabos novos e ${atualizados} atualizados.` });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <section className="rounded-xl bg-white p-5 ring-1 ring-borda">
        <h2 className="text-lg font-bold">Importar planilha de cabos</h2>
        <p className="mt-1 text-sm text-suave">
          Envie o .xlsx com as colunas <b>TAG CABO, CABO ESTIMATIVA, DE, PARA, METRAGEM ESTIMADA, PAVIMENTO e DISCIPLINA</b>. Datas de corte e lançamento,
          se vierem preenchidas, também são importadas. O sistema reconhece a aba e a linha de cabeçalho sozinho.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-suave">
          <li>Cabos novos são criados; cabos já existentes (mesma TAG) têm o cadastro atualizado.</li>
          <li>O que o campo já preencheu no app <b>nunca é apagado</b> pela importação.</li>
          <li>O painel é calculado pelo DE (ex.: HVAC-PNR02-…) quando não há coluna PAINEL.</li>
        </ul>
        <label className="gradiente-marca mt-4 inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg px-5 font-semibold text-white shadow-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
          {lendo ? "Lendo…" : "Escolher planilha"}
          <input type="file" accept=".xlsx" onChange={escolher} className="hidden" />
        </label>
      </section>

      {resultado && (
        <Aviso tipo={resultado.tipo}>
          {resultado.texto}{" "}
          {resultado.tipo === "ok" && <button onClick={irParaCabos} className="underline">Ver cabos</button>}
        </Aviso>
      )}

      {leitura && (
        <section className="rounded-xl bg-white p-5 ring-1 ring-borda">
          <h3 className="font-bold">Prévia — {nomeArquivo}</h3>
          {leitura.aba && <p className="text-sm text-suave">Aba lida: “{leitura.aba}” · {leitura.linhas.length} cabos válidos</p>}
          {leitura.erros.length > 0 && (
            <div className="mt-3 rounded-lg bg-erro-fundo p-3 text-sm text-erro">
              <p className="font-semibold">{leitura.erros.length} linha(s) com erro — não serão importadas:</p>
              <ul className="mt-1 list-disc pl-5">{leitura.erros.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {leitura.avisos.length > 0 && (
            <div className="mt-3 rounded-lg bg-st-p-fundo p-3 text-sm text-st-p">
              <p className="font-semibold">Atenção ({leitura.avisos.length}):</p>
              <ul className="mt-1 list-disc pl-5">{leitura.avisos.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {leitura.linhas.length > 0 && (
            <>
              <div className="mt-3 max-h-80 overflow-auto rounded-lg ring-1 ring-borda">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-fundo text-left">
                    <tr>{["Linha", "TAG", "Disciplina", "Pavimento", "Painel", "Cabo est.", "m est.", "Corte", "Lançamento"].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {leitura.linhas.map((l) => (
                      <tr key={l.tag} className="border-t border-borda">
                        <td className="px-2 py-1 text-suave">{l.linha}</td>
                        <td className="px-2 py-1 font-semibold">{l.tag}</td>
                        <td className="px-2 py-1">{l.disciplina}</td>
                        <td className="px-2 py-1">{l.pavimento}</td>
                        <td className="px-2 py-1">{l.painel}</td>
                        <td className="px-2 py-1">{l.cabo_estimado}</td>
                        <td className="px-2 py-1">{l.metragem_estimada}</td>
                        <td className="px-2 py-1">{l.data_corte ? formatarData(l.data_corte) : ""}</td>
                        <td className="px-2 py-1">{l.data_lancamento ? formatarData(l.data_lancamento) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={confirmar} disabled={enviando} className="h-11 rounded-lg bg-teal px-5 font-semibold text-white hover:bg-teal-escuro disabled:opacity-60">
                  {enviando ? "Importando…" : `Importar ${leitura.linhas.length} cabos`}
                </button>
                <button onClick={() => setLeitura(null)} className="h-11 rounded-lg px-4 font-medium ring-1 ring-borda">Cancelar</button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

type Usuario = Perfil & { email: string };

function Usuarios({ meuId, mostrar }: { meuId: string; mostrar: Mostrar }) {
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", papel: "campo" });
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const chamar = useCallback(async (metodo: string, corpo?: unknown) => {
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/usuarios", {
      method: metodo,
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.erro ?? "Erro");
    return json;
  }, []);

  const carregar = useCallback(
    () =>
      chamar("GET").then(setLista, (e: Error) => setMsg({ tipo: "erro", texto: e.message })),
    [chamar],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      await chamar("POST", form);
      setMsg({ tipo: "ok", texto: `Usuário ${form.nome} criado. Envie o e-mail e a senha para ele entrar.` });
      setForm({ nome: "", email: "", senha: "", papel: "campo" });
      carregar();
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  async function alterar(id: string, mudancas: Record<string, unknown>) {
    setMsg(null);
    const nome = lista?.find((u) => u.id === id)?.nome ?? "Usuário";
    try {
      await chamar("PATCH", { id, ...mudancas });
      if (mudancas.senha) mostrar("ok", `Senha de ${nome} alterada ✓`);
      else if (mudancas.papel) mostrar("ok", `${nome} agora tem acesso ${mudancas.papel === "admin" ? "Admin (painel completo)" : "Campo (só o formulário)"} ✓`);
      else if (mudancas.ativo !== undefined) mostrar(mudancas.ativo ? "ok" : "alerta", mudancas.ativo ? `${nome} reativado ✓` : `${nome} bloqueado — não consegue mais entrar.`);
      carregar();
    } catch (e) {
      mostrar("erro", (e as Error).message);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={criar} className="h-fit space-y-3 rounded-xl bg-white p-5 ring-1 ring-borda">
        <h2 className="text-lg font-bold">Novo usuário</h2>
        <Campo rotulo="Nome"><input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={classeInput} /></Campo>
        <Campo rotulo="E-mail (login)"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={classeInput} /></Campo>
        <Campo rotulo="Senha inicial"><input required minLength={6} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className={classeInput} /></Campo>
        <Campo rotulo="Acesso">
          <select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })} className={classeInput}>
            <option value="campo">Campo — só o formulário</option>
            <option value="admin">Admin — painel completo</option>
          </select>
        </Campo>
        <button disabled={salvando} className="h-11 w-full rounded-lg bg-teal font-semibold text-white hover:bg-teal-escuro disabled:opacity-60">
          {salvando ? "Criando…" : "Criar usuário"}
        </button>
      </form>

      <section>
        {msg && <div className="mb-3"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-borda">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-fundo text-left text-xs uppercase text-suave">
              <tr>{["Nome", "E-mail", "Acesso", "Situação", ""].map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}</tr>
            </thead>
            <tbody>
              {lista?.map((u) => (
                <tr key={u.id} className="border-t border-borda">
                  <td className="px-3 py-2 font-semibold">{u.nome}{u.id === meuId && <span className="ml-1 text-xs text-suave">(você)</span>}</td>
                  <td className="px-3 py-2 text-suave">{u.email}</td>
                  <td className="px-3 py-2">
                    <select value={u.papel} disabled={u.id === meuId} onChange={(e) => alterar(u.id, { papel: e.target.value })} className="rounded-md border border-borda px-2 py-1">
                      <option value="campo">Campo</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button disabled={u.id === meuId} onClick={() => alterar(u.id, { ativo: !u.ativo })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.ativo ? "bg-st-t-fundo text-st-t" : "bg-st-ni-fundo text-st-ni"}`}>
                      {u.ativo ? "Ativo" : "Bloqueado"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TrocarSenha aoSalvar={(senha) => alterar(u.id, { senha })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista == null && <p className="p-4 text-suave">Carregando…</p>}
        </div>
      </section>
    </div>
  );
}

function TrocarSenha({ aoSalvar }: { aoSalvar: (senha: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  if (!aberto) return <button onClick={() => setAberto(true)} className="text-sm font-medium text-teal">Trocar senha</button>;
  return (
    <span className="inline-flex gap-1">
      <input autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha" className="w-28 rounded-md border border-borda px-2 py-1" />
      <button onClick={() => { if (senha.length >= 6) { aoSalvar(senha); setAberto(false); setSenha(""); } }} className="rounded-md bg-teal px-2 py-1 text-white">OK</button>
      <button onClick={() => setAberto(false)} className="px-1 text-suave">×</button>
    </span>
  );
}
