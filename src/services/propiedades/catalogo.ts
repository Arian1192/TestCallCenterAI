import { config } from "../../config.js";
import { enumerar, normalizar, plural, precioEnPalabras } from "../../lib/speech.js";
import { InmovillaProvider } from "./inmovilla.js";
import { MockProvider } from "./mock.js";
import type { Operacion, Propiedad, PropiedadesProvider } from "./types.js";

export const provider: PropiedadesProvider =
  config.DATA_PROVIDER === "inmovilla" ? new InmovillaProvider() : new MockProvider();

/**
 * Caché en memoria de la cartera. Se refresca cada CACHE_REFRESH_MINUTES para que
 * las búsquedas respondan en milisegundos durante la llamada (clave para que la voz
 * no se quede en silencio) y no dependamos de la disponibilidad de Inmovilla.
 */
let cartera: Propiedad[] = [];
let ultimaCarga: Date | null = null;
let cargando: Promise<void> | null = null;

export async function refrescarCartera(): Promise<void> {
  if (cargando) return cargando;
  cargando = (async () => {
    try {
      const nuevas = await provider.listar();
      cartera = nuevas;
      ultimaCarga = new Date();
      console.log(`📦 Cartera cargada (${provider.nombre}): ${nuevas.length} inmuebles`);
    } catch (err) {
      console.error("⚠️ Error refrescando cartera, se mantiene la anterior:", (err as Error).message);
    } finally {
      cargando = null;
    }
  })();
  return cargando;
}

export function iniciarRefrescoPeriodico() {
  const ms = config.CACHE_REFRESH_MINUTES * 60_000;
  const t = setInterval(() => void refrescarCartera(), ms);
  t.unref();
}

export function estadoCartera() {
  return { proveedor: provider.nombre, inmuebles: cartera.length, ultimaCarga };
}

export async function obtenerCartera(): Promise<Propiedad[]> {
  if (!ultimaCarga) await refrescarCartera();
  return cartera;
}

// ───────────────────────────── Búsqueda ─────────────────────────────

export interface FiltrosBusqueda {
  operacion?: Operacion;
  zona?: string;
  tipo?: string;
  precio_max?: number;
  precio_min?: number;
  habitaciones_min?: number;
  caracteristicas?: string[]; // terraza, garaje, ascensor, piscina, trastero, exterior…
}

const CARACTERISTICAS: Record<string, keyof Propiedad> = {
  terraza: "terraza",
  garaje: "garaje",
  parking: "garaje",
  ascensor: "ascensor",
  piscina: "piscina",
  trastero: "trastero",
  exterior: "exterior",
  aire: "aireAcondicionado",
  "aire acondicionado": "aireAcondicionado",
};

function coincideZona(p: Propiedad, zona: string): boolean {
  const z = normalizar(zona);
  return [p.zona, p.ciudad].some((campo) => {
    const c = normalizar(campo);
    return c.includes(z) || z.includes(c);
  });
}

function coincideTipo(p: Propiedad, tipo: string): boolean {
  const t = normalizar(tipo);
  const pt = normalizar(p.tipo);
  if (["piso", "pisos", "vivienda", "casa", "apartamento"].includes(t)) {
    return !["local", "oficina", "nave", "garaje", "terreno"].includes(pt);
  }
  return pt.includes(t) || t.includes(pt);
}

export function filtrar(lista: Propiedad[], f: FiltrosBusqueda): Propiedad[] {
  return lista.filter((p) => {
    if (!p.disponible) return false;
    if (f.operacion && p.operacion !== f.operacion) return false;
    if (f.zona && !coincideZona(p, f.zona)) return false;
    if (f.tipo && !coincideTipo(p, f.tipo)) return false;
    if (f.precio_max && p.precio > f.precio_max) return false;
    if (f.precio_min && p.precio < f.precio_min) return false;
    if (f.habitaciones_min && p.habitaciones < f.habitaciones_min) return false;
    for (const c of f.caracteristicas ?? []) {
      const campo = CARACTERISTICAS[normalizar(c)];
      if (campo && !p[campo]) return false;
    }
    return true;
  });
}

/** Resumen de una línea, pensado para leerse en voz alta. */
export function resumenHablado(p: Propiedad): string {
  const hab = p.habitaciones === 0 ? "" : ` de ${plural(p.habitaciones, "habitación", "habitaciones")}`;
  const extras = [
    p.terraza && "terraza",
    p.garaje && "garaje",
    p.piscina && "piscina",
    p.ascensor && "ascensor",
  ].filter(Boolean) as string[];
  const conExtras = extras.length ? `, con ${enumerar(extras.slice(0, 3))}` : "";
  const donde = p.zona && p.zona !== p.ciudad ? `${p.zona}, ${p.ciudad}` : p.ciudad;
  return `Referencia ${p.referencia}: ${p.tipo}${hab} en ${donde}, ${p.metros} metros${conExtras}, por ${precioEnPalabras(p.precio, p.operacion === "alquiler")}.`;
}

export function fichaHablada(p: Propiedad): string {
  const partes = [resumenHablado(p)];
  const tiene: string[] = [];
  if (p.banos) tiene.push(plural(p.banos, "baño"));
  if (p.trastero) tiene.push("trastero");
  if (p.aireAcondicionado) tiene.push("aire acondicionado");
  if (tiene.length) partes.push(`Tiene ${enumerar(tiene)}.`);
  if (p.planta) partes.push(`Está en ${/^\d+$/.test(p.planta) ? `la planta ${p.planta}` : `la ${p.planta} planta`}.`);
  if (p.exterior !== undefined) partes.push(p.exterior ? "Es exterior." : "Es interior.");
  if (p.ascensor === false) partes.push("No tiene ascensor.");
  if (p.gastosComunidad) partes.push(`Gastos de comunidad: ${precioEnPalabras(p.gastosComunidad)} al mes.`);
  if (p.certificadoEnergetico) partes.push(`Certificado energético ${p.certificadoEnergetico}.`);
  if (p.descripcion) partes.push(p.descripcion);
  return partes.join(" ");
}

export async function buscarPorReferencia(ref: string): Promise<Propiedad | undefined> {
  const lista = await obtenerCartera();
  const r = normalizar(ref).replace(/[\s\-_.]/g, "");
  return lista.find(
    (p) => normalizar(p.referencia).replace(/[\s\-_.]/g, "") === r || p.id === ref.trim(),
  );
}

export async function buscar(f: FiltrosBusqueda) {
  const lista = await obtenerCartera();
  let resultados = filtrar(lista, f);

  // Orden: primero los más ajustados al presupuesto (más caros dentro del límite),
  // si no hay presupuesto, de más barato a más caro.
  resultados = [...resultados].sort((a, b) => (f.precio_max ? b.precio - a.precio : a.precio - b.precio));

  if (resultados.length > 0) {
    return {
      total: resultados.length,
      pisos: resultados.slice(0, 3).map((p) => ({ referencia: p.referencia, resumen: resumenHablado(p) })),
      mensaje:
        resultados.length > 3
          ? `Hay ${resultados.length} inmuebles que encajan. Estos son los tres más adecuados.`
          : `Hay ${plural(resultados.length, "inmueble")} que ${resultados.length === 1 ? "encaja" : "encajan"}.`,
    };
  }

  // Sin resultados: proponemos alternativas relajando filtros (sin zona / +15% de presupuesto)
  const alternativas: Propiedad[] = [];
  const relajados: FiltrosBusqueda[] = [
    { ...f, precio_max: f.precio_max ? Math.round(f.precio_max * 1.15) : undefined },
    { ...f, zona: undefined },
    { ...f, habitaciones_min: f.habitaciones_min ? f.habitaciones_min - 1 : undefined },
  ];
  for (const r of relajados) {
    for (const p of filtrar(lista, r)) if (!alternativas.includes(p)) alternativas.push(p);
    if (alternativas.length >= 3) break;
  }
  return {
    total: 0,
    pisos: [],
    alternativas: alternativas.slice(0, 3).map((p) => ({ referencia: p.referencia, resumen: resumenHablado(p) })),
    mensaje: alternativas.length
      ? "No hay nada que cumpla exactamente todos los requisitos, pero hay alternativas cercanas."
      : "Ahora mismo no hay inmuebles con esas características. Ofrece registrar su interés para avisarle cuando entre algo.",
  };
}
