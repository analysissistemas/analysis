// Importação e exportação da planilha de cabos (.xlsx)
import ExcelJS from "exceljs";
import type { Cabo } from "./tipos";

export type LinhaImportada = {
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
  linha: number;
};

export type ResultadoLeitura = {
  aba: string;
  linhas: LinhaImportada[];
  erros: string[];
  avisos: string[];
};

type Campo = Exclude<keyof LinhaImportada, "linha">;

// Nomes de coluna aceitos (sem acento, maiúsculo, espaços simples)
const CABECALHOS: Record<string, Campo> = {
  "TAG CABO": "tag",
  "TAG DO CABO": "tag",
  TAG: "tag",
  "CABO ESTIMATIVA": "cabo_estimado",
  "CABO ESTIMATIVO": "cabo_estimado",
  "CABO ESTIMADO": "cabo_estimado",
  "CABO PREVISTO": "cabo_estimado",
  DE: "de",
  PARA: "para",
  "METRAGEM ESTIMADA": "metragem_estimada",
  "DATA CORTE": "data_corte",
  "DATA DO CORTE": "data_corte",
  "DATA DE CORTE": "data_corte",
  "METRAGEM CORTADA": "metragem_cortada",
  "CABO CORTADO": "cabo_cortado",
  "DATA LANCAMENTO": "data_lancamento",
  "DATA DE LANCAMENTO": "data_lancamento",
  "DATA DO LANCAMENTO": "data_lancamento",
  PAVIMENTO: "pavimento",
  LOCALIZACAO: "pavimento",
  "PAVIMENTO / AREA": "pavimento",
  DISCIPLINA: "disciplina",
  PAINEL: "painel",
};

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

function valorBruto(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return valorBruto(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return (v as { text: string }).text;
    if ("error" in v) return null;
  }
  return v;
}

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numero(v: unknown): number | null | "invalido" {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\s|m$/gi, "").replace(/\./g, "").replace(",", ".");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "invalido";
}

function data(v: unknown): string | null | "invalido" {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // número de série do Excel
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const a = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${a}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "invalido";
}

// "HVAC-PNR02-01024-0000" → "HVAC-PNR02"
export function painelDoDe(de: string | null): string | null {
  if (!de) return null;
  const partes = de.split("-");
  return partes.length >= 2 && /^PN/i.test(partes[1]) ? `${partes[0]}-${partes[1]}` : null;
}

function mapearCabecalho(ws: ExcelJS.Worksheet): { linha: number; colunas: Map<number, Campo> } | null {
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const colunas = new Map<number, Campo>();
    ws.getRow(r).eachCell((cell, col) => {
      const t = texto(valorBruto(cell.value));
      if (!t) return;
      const campo = CABECALHOS[normalizar(t)];
      if (campo && ![...colunas.values()].includes(campo)) colunas.set(col, campo);
    });
    if ([...colunas.values()].includes("tag") && colunas.size >= 3) return { linha: r, colunas };
  }
  return null;
}

export async function lerPlanilha(arquivo: ArrayBuffer): Promise<ResultadoLeitura> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo);

  // Escolhe a aba que tem mais colunas reconhecidas (a de cadastro tem DE/PARA)
  let melhor: { ws: ExcelJS.Worksheet; linha: number; colunas: Map<number, Campo> } | null = null;
  for (const ws of wb.worksheets) {
    const m = mapearCabecalho(ws);
    if (m && (!melhor || m.colunas.size > melhor.colunas.size)) melhor = { ws, ...m };
  }
  if (!melhor) {
    return { aba: "", linhas: [], erros: ["Não encontrei a coluna \"TAG CABO\" em nenhuma aba da planilha."], avisos: [] };
  }

  const { ws, linha: linhaCab, colunas } = melhor;
  const erros: string[] = [];
  const avisos: string[] = [];
  const linhas: LinhaImportada[] = [];
  const vistas = new Map<string, number>();
  const tem = new Set(colunas.values());
  for (const obrig of ["de", "para", "disciplina", "pavimento"] as Campo[]) {
    if (!tem.has(obrig)) avisos.push(`Coluna ${obrig.toUpperCase()} não encontrada na aba "${ws.name}".`);
  }

  for (let r = linhaCab + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const bruto: Partial<Record<Campo, unknown>> = {};
    colunas.forEach((campo, col) => (bruto[campo] = valorBruto(row.getCell(col).value)));
    const tag = texto(bruto.tag);
    if (!tag) continue;

    const errosLinha: string[] = [];
    const num = (c: Campo) => {
      const n = numero(bruto[c]);
      if (n === "invalido") {
        errosLinha.push(`${c.replace("_", " ")} inválida (“${bruto[c]}”)`);
        return null;
      }
      return n;
    };
    const dt = (c: Campo) => {
      const d = data(bruto[c]);
      if (d === "invalido") {
        errosLinha.push(`${c.replace("_", " ")} inválida (“${bruto[c]}”)`);
        return null;
      }
      return d;
    };

    const de = texto(bruto.de);
    const item: LinhaImportada = {
      tag,
      disciplina: texto(bruto.disciplina),
      pavimento: texto(bruto.pavimento),
      painel: texto(bruto.painel) ?? painelDoDe(de),
      cabo_estimado: texto(bruto.cabo_estimado),
      de,
      para: texto(bruto.para),
      metragem_estimada: num("metragem_estimada"),
      data_corte: dt("data_corte"),
      metragem_cortada: num("metragem_cortada"),
      cabo_cortado: texto(bruto.cabo_cortado),
      data_lancamento: dt("data_lancamento"),
      linha: r,
    };

    if (vistas.has(tag)) {
      erros.push(`Linha ${r}: TAG ${tag} repetida (já aparece na linha ${vistas.get(tag)}).`);
      continue;
    }
    vistas.set(tag, r);
    if (errosLinha.length) {
      erros.push(`Linha ${r} (${tag}): ${errosLinha.join("; ")}.`);
      continue;
    }
    if (item.data_lancamento && !item.data_corte) avisos.push(`Linha ${r} (${tag}): tem data de lançamento mas não tem data de corte.`);
    if (item.data_lancamento && item.data_corte && item.data_lancamento < item.data_corte)
      avisos.push(`Linha ${r} (${tag}): lançamento antes do corte.`);
    linhas.push(item);
  }

  return { aba: ws.name, linhas, erros, avisos };
}

function dataExcel(iso: string | null): Date | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

const COR_STATUS = {
  T: { fundo: "FF0070C0", texto: "FFFFFFFF" },
  P: { fundo: "FFF4B183", texto: "FF000000" },
  NI: { fundo: "FFFFFF00", texto: "FF000000" },
} as const;

export async function exportarExcel(cabos: Cabo[], filtros: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Controle de Cabos";
  wb.created = new Date();

  const ws = wb.addWorksheet("CABOS", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "TAG CABO", key: "tag", width: 20 },
    { header: "CABO ESTIMATIVA", key: "cabo_estimado", width: 16 },
    { header: "DE", key: "de", width: 26 },
    { header: "PARA", key: "para", width: 26 },
    { header: "METRAGEM ESTIMADA", key: "metragem_estimada", width: 12 },
    { header: "DATA CORTE", key: "data_corte", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "METRAGEM CORTADA", key: "metragem_cortada", width: 12 },
    { header: "CABO CORTADO", key: "cabo_cortado", width: 16 },
    { header: "DATA LANÇAMENTO", key: "data_lancamento", width: 13, style: { numFmt: "dd/mm/yyyy" } },
    { header: "STATUS", key: "status", width: 9 },
    { header: "PAVIMENTO", key: "pavimento", width: 14 },
    { header: "DISCIPLINA", key: "disciplina", width: 16 },
    { header: "PAINEL", key: "painel", width: 14 },
  ];

  for (const c of cabos) {
    const row = ws.addRow({
      ...c,
      data_corte: dataExcel(c.data_corte),
      data_lancamento: dataExcel(c.data_lancamento),
    });
    const st = row.getCell("status");
    st.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_STATUS[c.status].fundo } };
    st.font = { bold: true, color: { argb: COR_STATUS[c.status].texto } };
    st.alignment = { horizontal: "center" };
  }

  const cab = ws.getRow(1);
  cab.height = 32;
  cab.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F1C1C" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      cell.border = { top: { style: "thin", color: { argb: "FFD6DFDD" } }, bottom: { style: "thin", color: { argb: "FFD6DFDD" } }, left: { style: "thin", color: { argb: "FFD6DFDD" } }, right: { style: "thin", color: { argb: "FFD6DFDD" } } };
    }),
  );

  // Aba de resumo
  const rs = wb.addWorksheet("RESUMO");
  rs.columns = [
    { header: "", key: "a", width: 28 },
    { header: "", key: "b", width: 14 },
    { header: "", key: "c", width: 14 },
    { header: "", key: "d", width: 14 },
    { header: "", key: "e", width: 14 },
    { header: "", key: "f", width: 16 },
    { header: "", key: "g", width: 16 },
  ];
  rs.getCell("A1").value = "Controle de Cabos — Resumo";
  rs.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF0F1C1C" } };
  rs.getCell("A2").value = `Gerado em ${new Date().toLocaleString("pt-BR")}${filtros ? ` · Filtros: ${filtros}` : ""}`;
  rs.getCell("A2").font = { italic: true, color: { argb: "FF6B7686" } };
  const tit = rs.getRow(4);
  tit.values = ["DISCIPLINA", "TOTAL", "T", "P", "NI", "M ESTIMADOS", "M CORTADOS"];
  tit.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E9A9A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  const grupos = agrupar(cabos, (c) => c.disciplina ?? "(sem disciplina)");
  let r = 5;
  for (const [nome, g] of [...grupos, ["TOTAL", resumo(cabos)] as const]) {
    rs.getRow(r).values = [nome, g.total, g.T, g.P, g.NI, g.mEstimados, g.mCortados];
    if (nome === "TOTAL") rs.getRow(r).font = { bold: true };
    r++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  baixar(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `controle-cabos-${hoje()}.xlsx`);
}

export type Resumo = { total: number; T: number; P: number; NI: number; mEstimados: number; mCortados: number };

export function resumo(cabos: Cabo[]): Resumo {
  const r: Resumo = { total: 0, T: 0, P: 0, NI: 0, mEstimados: 0, mCortados: 0 };
  for (const c of cabos) {
    r.total++;
    r[c.status]++;
    r.mEstimados += c.metragem_estimada ?? 0;
    r.mCortados += c.metragem_cortada ?? 0;
  }
  return r;
}

export function agrupar(cabos: Cabo[], chave: (c: Cabo) => string): [string, Resumo][] {
  const m = new Map<string, Cabo[]>();
  for (const c of cabos) m.set(chave(c), [...(m.get(chave(c)) ?? []), c]);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, resumo(v)]);
}

export function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

