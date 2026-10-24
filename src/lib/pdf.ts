// Relatório em PDF: cabeçalho com logo, resumo de progresso e tabela de cabos
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { agrupar, hoje, resumo } from "./planilha";
import { STATUS_INFO, formatarData, type Cabo } from "./tipos";

const MARINHO: [number, number, number] = [15, 28, 28];
const TEAL: [number, number, number] = [46, 154, 154];
const VERDE: [number, number, number] = [125, 172, 91];
const SUAVE: [number, number, number] = [102, 116, 111];
const COR_STATUS: Record<Cabo["status"], [number, number, number]> = {
  T: [79, 154, 60],
  P: [212, 138, 18],
  NI: [138, 146, 157],
};

async function carregarLogo(): Promise<string | null> {
  try {
    const blob = await (await fetch("/logo-marca.png")).blob();
    return await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = () => ok(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const m = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

export async function exportarPdf(cabos: Cabo[], filtros: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const logo = await carregarLogo();

  // Faixa do cabeçalho
  doc.setFillColor(...MARINHO);
  doc.rect(0, 0, larg, 24, "F");
  if (logo) doc.addImage(logo, "PNG", 10, 4, 16, 16);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Controle de cabos", logo ? 30 : 10, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Relatório de execução · ${new Date().toLocaleString("pt-BR")}`, logo ? 30 : 10, 18);
  // faixa com o degradê da logo (verde → teal)
  for (let i = 0; i < 40; i++) {
    const t = i / 39;
    doc.setFillColor(...(VERDE.map((v, k) => Math.round(v + (TEAL[k] - v) * t)) as [number, number, number]));
    doc.rect((larg / 40) * i, 24, larg / 40 + 0.2, 1.2, "F");
  }

  let y = 32;
  doc.setTextColor(...SUAVE);
  doc.setFontSize(9);
  doc.text(filtros ? `Filtros: ${filtros}` : "Todos os cabos", 10, y);
  y += 5;

  // Cartões de resumo
  const r = resumo(cabos);
  const cartoes: [string, string, [number, number, number]][] = [
    ["Total de cabos", String(r.total), MARINHO],
    ["Terminados (T)", `${r.T} · ${pct(r.T, r.total)}`, COR_STATUS.T],
    ["Parciais (P)", `${r.P} · ${pct(r.P, r.total)}`, COR_STATUS.P],
    ["Não iniciados (NI)", `${r.NI} · ${pct(r.NI, r.total)}`, COR_STATUS.NI],
    ["Metragem cortada / estimada", `${m(r.mCortados)} / ${m(r.mEstimados)}`, TEAL],
  ];
  const w = (larg - 20 - 4 * 4) / 5;
  cartoes.forEach(([rot, val, cor], i) => {
    const x = 10 + i * (w + 4);
    doc.setDrawColor(217, 222, 229);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, 17, 2, 2, "FD");
    doc.setFillColor(...cor);
    doc.rect(x, y + 2, 1.2, 13, "F");
    doc.setTextColor(...SUAVE);
    doc.setFontSize(8);
    doc.text(rot, x + 4, y + 6);
    doc.setTextColor(...MARINHO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(val, x + 4, y + 13);
    doc.setFont("helvetica", "normal");
  });
  y += 23;

  // Resumo por disciplina
  autoTable(doc, {
    startY: y,
    head: [["Disciplina", "Total", "T", "P", "NI", "% concluído", "m estimados", "m cortados"]],
    body: agrupar(cabos, (c) => c.disciplina ?? "(sem disciplina)").map(([n, g]) => [
      n, g.total, g.T, g.P, g.NI, pct(g.T, g.total), m(g.mEstimados), m(g.mCortados),
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: [214, 223, 221] },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold" },
    margin: { left: 10, right: 10 },
  });

  // Tabela de cabos
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
    head: [["TAG", "Disciplina", "Pavimento", "Cabo est.", "DE", "PARA", "m est.", "Corte", "m cort.", "Cabo cortado", "Lançamento", "Status"]],
    body: cabos.map((c) => [
      c.tag,
      c.disciplina ?? "",
      c.pavimento ?? "",
      c.cabo_estimado ?? "",
      c.de ?? "",
      c.para ?? "",
      c.metragem_estimada ?? "",
      c.data_corte ? formatarData(c.data_corte) : "",
      c.metragem_cortada ?? "",
      c.cabo_cortado ?? "",
      c.data_lancamento ? formatarData(c.data_lancamento) : "",
      c.status,
    ]),
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: MARINHO, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [243, 246, 245] },
    columnStyles: { 0: { fontStyle: "bold" }, 11: { halign: "center", fontStyle: "bold" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 11) {
        const st = d.cell.raw as Cabo["status"];
        d.cell.styles.textColor = COR_STATUS[st] ?? MARINHO;
      }
    },
    margin: { left: 10, right: 10, bottom: 14 },
  });

  // Rodapé com legenda e paginação
  const total = doc.getNumberOfPages();
  const alt = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...SUAVE);
    doc.text(`T = ${STATUS_INFO.T.rotulo} · P = ${STATUS_INFO.P.rotulo} (cortado, aguardando lançamento) · NI = ${STATUS_INFO.NI.rotulo}`, 10, alt - 6);
    doc.text(`Página ${p} de ${total}`, larg - 10, alt - 6, { align: "right" });
  }

  doc.save(`controle-cabos-${hoje()}.pdf`);
}
