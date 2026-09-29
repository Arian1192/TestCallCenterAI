/**
 * Utilidades para que las respuestas de las herramientas se puedan leer en voz alta
 * con naturalidad (números en palabras, frases cortas, sin símbolos).
 */

const UNIDADES = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
  "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

/** 0..999. `apocopar` convierte "uno" final en "un" (un millón, veintiún mil). */
function menorDeMil(n: number, apocopar: boolean): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    let txt: string;
    if (resto < 30) {
      txt = UNIDADES[resto];
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      txt = u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
    }
    if (apocopar) {
      if (txt.endsWith("veintiuno")) txt = txt.replace(/veintiuno$/, "veintiún");
      else if (txt.endsWith("uno")) txt = txt.replace(/uno$/, "un");
    }
    partes.push(txt);
  }
  return partes.join(" ");
}

/** Convierte un entero (hasta 999.999.999) a palabras en castellano. */
export function numeroEnPalabras(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "un millón" : `${menorDeMil(millones, true)} millones`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${menorDeMil(miles, true)} mil`);
  }
  if (resto > 0) partes.push(menorDeMil(resto, false));
  return partes.join(" ");
}

/** "doscientos cincuenta mil euros", "un millón de euros", "mil cien euros al mes" */
export function precioEnPalabras(euros: number, alquiler = false): string {
  const n = Math.round(euros);
  let txt = numeroEnPalabras(n);
  // "un millón de euros" / "dos millones de euros" (solo si es millones exactos)
  if (n >= 1_000_000 && n % 1_000_000 === 0) txt += " de";
  txt += " euros";
  if (alquiler) txt += " al mes";
  return txt;
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : pluralForm ?? singular + "s"}`;
}

/** Quita tildes y pasa a minúsculas para comparar textos ("Chamberí" == "chamberi"). */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Lista legible: "a, b y c" */
export function enumerar(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
