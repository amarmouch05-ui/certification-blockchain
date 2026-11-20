import * as XLSX from "xlsx";
import { isAddress } from "viem";

export const COLUMNS = ["studentName", "studentId", "diplomaTitle", "issueDate", "recipientAddress", "grade"];
export const REQUIRED = ["studentName", "studentId", "diplomaTitle", "issueDate"];
const MAX_LEN = 200;

// Tolère « Student Name », « student_name », « STUDENTNAME »…
const canon = (s) => String(s).toLowerCase().replace(/[\s_\-]/g, "");
const HEADER_MAP = Object.fromEntries(COLUMNS.map((c) => [canon(c), c]));

function pad(n) {
  return String(n).padStart(2, "0");
}

function isRealIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function cellToString(value, column) {
  if (value === null || value === undefined) return "";
  // Excel stocke les vraies dates comme des numéros de série
  if (typeof value === "number" && column === "issueDate") {
    // Numéro de série Excel -> date ISO (époque 1899-12-30, valable pour les dates après 1900-03-01)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (value instanceof Date) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return String(value).trim();
}

/**
 * Lit un .xlsx / .csv (ArrayBuffer) et renvoie les lignes normalisées et validées.
 * @returns {{ rows: Array<{line:number, data:object, errors:string[]}>, fileErrors: string[] }}
 */
export function parseCertificateFile(arrayBuffer, fileName = "") {
  const fileErrors = [];
  let wb;
  try {
    if (/\.csv$/i.test(fileName)) {
      // raw: true => le CSV reste du texte (sinon SheetJS convertit les dates en numéros de série)
      wb = XLSX.read(new TextDecoder("utf-8").decode(arrayBuffer), { type: "string", raw: true });
    } else {
      wb = XLSX.read(arrayBuffer, { type: "array" });
    }
  } catch {
    return { rows: [], fileErrors: ["Fichier illisible : format .xlsx ou .csv attendu."] };
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], fileErrors: ["Le fichier ne contient aucune feuille."] };

  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  if (raw.length === 0) return { rows: [], fileErrors: ["Aucune ligne de données trouvée."] };

  const presentColumns = new Set(Object.keys(raw[0]).map((h) => HEADER_MAP[canon(h)]).filter(Boolean));
  const missing = REQUIRED.filter((c) => !presentColumns.has(c));
  if (missing.length) {
    return { rows: [], fileErrors: [`Colonnes obligatoires manquantes : ${missing.join(", ")}.`] };
  }

  const seen = new Map();
  const rows = raw.map((r, i) => {
    const data = Object.fromEntries(COLUMNS.map((c) => [c, ""]));
    for (const [header, value] of Object.entries(r)) {
      const col = HEADER_MAP[canon(header)];
      if (col) data[col] = cellToString(value, col);
    }

    const errors = [];
    for (const c of REQUIRED) if (!data[c]) errors.push(`${c} manquant`);
    for (const c of COLUMNS) if (data[c].length > MAX_LEN) errors.push(`${c} trop long (> ${MAX_LEN})`);
    if (data.issueDate && !isRealIsoDate(data.issueDate)) errors.push("issueDate doit être au format AAAA-MM-JJ");
    if (data.recipientAddress && !isAddress(data.recipientAddress)) errors.push("recipientAddress invalide");

    if (data.studentId && data.diplomaTitle) {
      const key = `${data.studentId}||${data.diplomaTitle}`;
      if (seen.has(key)) errors.push(`doublon de la ligne ${seen.get(key)}`);
      else seen.set(key, i + 2);
    }
    return { line: i + 2, data, errors }; // +2 : ligne d'en-tête + base 1
  });

  return { rows, fileErrors };
}
