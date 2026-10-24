"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Cabecalho, Campo, SeloStatus, Selecao, classeInput } from "@/components/ui";
import { exportarPdf } from "@/lib/pdf";
import { agrupar, exportarExcel, lerPlanilha, resumo, type ResultadoLeitura } from "@/lib/planilha";
import { baixarCabos } from "@/lib/offline";
import { sair, useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { formatarData, formatarMetros, type Cabo, type Perfil, type Status } from "@/lib/tipos";

type Aba = "painel" | "cabos" | "importar" | "usuarios";
const ABAS: [Aba, string][] = [
  ["painel", "Visão geral"],
  ["cabos", "Cabos"],
  ["importar", "Importar planilha"],
  ["usuarios", "Usuários"],
];

export default function Admin() {
  const { perfil, carregando } = useSessao();
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("painel");
  const [cabos, setCabos] = useState<Cabo[]>([]);
  const [erro, setErro] = useState("");

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
        {aba === "cabos" && <TabelaCabos cabos={cabos} recarregar={recarregar} />}
        {aba === "importar" && <Importar recarregar={recarregar} irParaCabos={() => setAba("cabos")} />}
        {aba === "usuarios" && <Usuarios meuId={perfil.id} />}
      </main>
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

function TabelaCabos({ cabos, recarregar }: { cabos: Cabo[]; recarregar: () => Promise<void> }) {
  const [disciplina, setDisciplina] = useState("");
  const [pavimento, setPavimento] = useState("");
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [exportando, setExportando] = useState<"" | "pdf" | "xlsx">("");
  const [excluir, setExcluir] = useState<Cabo | null>(null);

  const disciplinas = useMemo(() => [...new Set(cabos.map((c) => c.disciplina).filter(Boolean) as string[])].sort(), [cabos]);
  const pavimentos = useMemo(() => [...new Set(cabos.map((c) => c.pavimento).filter(Boolean) as string[])].sort(), [cabos]);

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
    } finally {
      setExportando("");
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    await supabase.rpc("excluir_cabo", { p_cabo_id: excluir.id });
    setExcluir(null);
    recarregar();
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
        <p className="mr-auto text-sm text-suave">{filtrados.length} de {cabos.length} cabos</p>
        <button onClick={() => exportar("xlsx")} disabled={!!exportando || !filtrados.length} className="flex h-11 items-center gap-2 rounded-lg bg-white px-4 font-semibold text-st-t ring-1 ring-borda hover:bg-st-t-fundo disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" /><path d="M8 13l4 5M12 13l-4 5" /></svg>
          {exportando === "xlsx" ? "Gerando…" : "Exportar Excel"}
        </button>
        <button onClick={() => exportar("pdf")} disabled={!!exportando || !filtrados.length} className="flex h-11 items-center gap-2 rounded-lg bg-teal px-4 font-semibold text-white hover:bg-teal-escuro disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" /><path d="M9 15h6M9 18h4" /></svg>
          {exportando === "pdf" ? "Gerando…" : "Exportar PDF"}
        </button>
      </div>

      {/* TAG fixa à esquerda e Status fixo à direita: continuam visíveis ao rolar para o lado */}
      <div className="mt-4 max-h-[calc(100dvh-16rem)] overflow-auto rounded-xl bg-white ring-1 ring-borda">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-20 text-left text-[11px] uppercase tracking-wide text-white">
            <tr>
              {["TAG", "Disciplina", "Pavimento", "Cabo est.", "DE", "PARA", "m est.", "Corte", "m cort.", "Cabo cortado", "Lançamento", "Status"].map((h, i) => (
                <th
                  key={h}
                  className={`bg-grafite px-2.5 py-2.5 font-semibold whitespace-nowrap ${i === 0 ? "sticky left-0 z-10" : ""} ${i === 11 ? "sticky right-0 z-10" : ""} ${[6, 8].includes(i) ? "text-right" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id} className="group">
                <td className="sticky left-0 z-10 border-t border-r border-borda bg-white px-2.5 py-2 font-bold whitespace-nowrap text-grafite group-hover:bg-fundo">{c.tag}</td>
                <td className="border-t border-borda px-2.5 py-2 whitespace-nowrap group-hover:bg-fundo">{c.disciplina}</td>
                <td className="border-t border-borda px-2.5 py-2 whitespace-nowrap group-hover:bg-fundo">{c.pavimento}</td>
                <td className="border-t border-borda px-2.5 py-2 whitespace-nowrap group-hover:bg-fundo">{c.cabo_estimado}</td>
                <td className="border-t border-borda px-2.5 py-2 whitespace-nowrap text-suave group-hover:bg-fundo">{c.de}</td>
                <td className="border-t border-borda px-2.5 py-2 whitespace-nowrap text-suave group-hover:bg-fundo">{c.para}</td>
                <td className="border-t border-borda px-2.5 py-2 text-right group-hover:bg-fundo">{c.metragem_estimada ?? ""}</td>
                <td className="border-t border-borda px-2.5 py-2 whitespace-nowrap group-hover:bg-fundo">{c.data_corte ? formatarData(c.data_corte) : ""}</td>
                <td className={`border-t border-borda px-2.5 py-2 text-right group-hover:bg-fundo ${c.metragem_cortada != null && c.metragem_estimada != null && c.metragem_cortada > c.metragem_estimada ? "font-bold text-st-p" : ""}`}>{c.metragem_cortada ?? ""}</td>
                <td className={`border-t border-borda px-2.5 py-2 whitespace-nowrap group-hover:bg-fundo ${c.cabo_cortado && c.cabo_estimado && c.cabo_cortado !== c.cabo_estimado ? "font-bold text-st-p" : ""}`}>{c.cabo_cortado}</td>
                <td className="border-t border-borda px-2.5 py-2 whitespace-nowrap group-hover:bg-fundo">{c.data_lancamento ? formatarData(c.data_lancamento) : ""}</td>
                <td className="sticky right-0 z-10 border-t border-l border-borda bg-white px-2.5 py-1.5 group-hover:bg-fundo">
                  <div className="flex items-center justify-between gap-2">
                    <SeloStatus status={c.status as Status} curto />
                    <button onClick={() => setExcluir(c)} aria-label={`Excluir ${c.tag}`} title="Excluir cabo" className="rounded p-1 text-suave hover:bg-erro-fundo hover:text-erro">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtrados.length && <p className="p-6 text-center text-suave">Nenhum cabo encontrado.</p>}
      </div>

      {excluir && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="text-lg font-bold">Excluir {excluir.tag}?</h3>
            <p className="mt-1 text-sm text-suave">O cabo e todo o histórico de registros dele serão apagados.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setExcluir(null)} className="h-10 rounded-lg px-4 font-medium ring-1 ring-borda">Cancelar</button>
              <button onClick={confirmarExclusao} className="h-10 rounded-lg bg-erro px-4 font-semibold text-white">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
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

function Usuarios({ meuId }: { meuId: string }) {
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
    try {
      await chamar("PATCH", { id, ...mudancas });
      if (mudancas.senha) setMsg({ tipo: "ok", texto: "Senha alterada." });
      carregar();
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
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
