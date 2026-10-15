import { StreamableFile } from "@nestjs/common";

type Cell = string | number | undefined | null;

/** Uma célula: aspas à volta quando tem separador, aspas ou mudança de linha. */
function cell(value: Cell) {
  const text = value === undefined || value === null ? "" : String(value);
  // Fórmulas (=, +, -, @) num CSV aberto no Excel executam-se: neutraliza-as.
  const safe = /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Tabela em CSV (";" e BOM UTF-8, para o Excel em português abrir bem). */
export function toCsv(header: string[], rows: Cell[][]) {
  return `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n")}`;
}

/** Devolve a tabela para descarregar como ficheiro CSV. */
export function csvResponse(table: { filename: string; header: string[]; rows: Cell[][] }) {
  const data = Buffer.from(toCsv(table.header, table.rows), "utf8");
  return new StreamableFile(data, {
    type: "text/csv; charset=utf-8",
    disposition: `attachment; filename="${encodeURIComponent(table.filename)}"`,
    length: data.length,
  });
}
