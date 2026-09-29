import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { numeroEnPalabras } from "../lib/speech.js";
import { visitas, type Visita } from "../lib/store.js";

/**
 * Agenda de visitas del MVP: calcula huecos libres a partir de un horario fijo y de
 * las visitas ya reservadas (data/visitas.json). En la fase 2 se sustituye por
 * Google Calendar manteniendo la misma interfaz.
 */

type Franja = { desde: string; hasta: string };

function parseFranjas(txt: string): Franja[] {
  return txt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [desde, hasta] = s.split("-").map((x) => x.trim());
      return { desde, hasta };
    });
}

function franjasDelDia(d: DateTime): Franja[] {
  if (d.weekday >= 1 && d.weekday <= 5) return parseFranjas(config.HORARIO_LABORABLE);
  if (d.weekday === 6) return parseFranjas(config.HORARIO_SABADO);
  return [];
}

function ahora() {
  return DateTime.now().setZone(config.TIMEZONE);
}

/** 16:30 → "las cuatro y media de la tarde"; 12:45 → "la una menos cuarto de la tarde" */
export function horaHablada(t: DateTime): string {
  let h = t.hour;
  let m = t.minute;
  let sufijoMin = "";
  if (m === 15) sufijoMin = " y cuarto";
  else if (m === 30) sufijoMin = " y media";
  else if (m === 45) {
    sufijoMin = " menos cuarto";
    h += 1;
  } else if (m > 0) sufijoMin = ` y ${numeroEnPalabras(m)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const franja = h < 12 ? "de la mañana" : h < 14 ? "del mediodía" : h < 21 ? "de la tarde" : "de la noche";
  const nombre = h12 === 1 ? "la una" : `las ${numeroEnPalabras(h12)}`;
  return `${nombre}${sufijoMin} ${franja}`;
}

/** "mañana jueves 1 de octubre a las diez y media de la mañana" / "hoy a las cinco de la tarde" */
export function etiquetaHablada(inicio: DateTime): string {
  const hoy = ahora().startOf("day");
  const dia = inicio.startOf("day");
  const diff = Math.round(dia.diff(hoy, "days").days);
  const hora = horaHablada(inicio);
  const fecha = inicio.setLocale("es").toFormat("cccc d 'de' LLLL");
  if (diff === 0) return `hoy a ${hora}`;
  if (diff === 1) return `mañana ${fecha} a ${hora}`;
  return `el ${fecha} a ${hora}`;
}

export interface Hueco {
  id: string; // ISO de inicio, se usa para reservar
  cuando: string; // etiqueta hablada
}

export async function huecosLibres(opts: { fecha?: string; franja?: "mañana" | "tarde" } = {}): Promise<{
  hoy: string;
  huecos: Hueco[];
}> {
  const reservadas = await visitas.all();
  const ocupados = new Set(reservadas.map((v) => DateTime.fromISO(v.inicio).toMillis()));
  const duracion = config.VISITA_DURACION_MIN;
  // Margen mínimo de 2 horas desde ahora para que dé tiempo a organizar la visita
  const minimo = ahora().plus({ hours: 2 });

  let dias: DateTime[];
  if (opts.fecha) {
    const d = DateTime.fromISO(opts.fecha, { zone: config.TIMEZONE });
    dias = d.isValid ? [d.startOf("day")] : [];
  } else {
    dias = Array.from({ length: config.DIAS_ANTELACION }, (_, i) => ahora().startOf("day").plus({ days: i }));
  }

  const huecos: Hueco[] = [];
  for (const dia of dias) {
    for (const f of franjasDelDia(dia)) {
      const [hD, mD] = f.desde.split(":").map(Number);
      const [hH, mH] = f.hasta.split(":").map(Number);
      let t = dia.set({ hour: hD, minute: mD });
      const fin = dia.set({ hour: hH, minute: mH });
      while (t.plus({ minutes: duracion }) <= fin) {
        const esTarde = t.hour >= 15;
        const encajaFranja = !opts.franja || (opts.franja === "tarde" ? esTarde : !esTarde);
        if (t >= minimo && encajaFranja && !ocupados.has(t.toMillis())) {
          huecos.push({ id: t.toISO()!, cuando: etiquetaHablada(t) });
        }
        t = t.plus({ minutes: duracion });
      }
    }
  }

  // Para no abrumar por teléfono: como mucho 2 huecos por día y 6 en total
  const porDia = new Map<string, number>();
  const seleccion = huecos.filter((h) => {
    const k = h.id.slice(0, 10);
    const n = porDia.get(k) ?? 0;
    if (n >= 2) return false;
    porDia.set(k, n + 1);
    return true;
  });

  return {
    hoy: ahora().setLocale("es").toFormat("cccc d 'de' LLLL 'de' yyyy, HH:mm"),
    huecos: seleccion.slice(0, 6),
  };
}

export class HuecoNoDisponibleError extends Error {}

export async function reservar(datos: Omit<Visita, "id" | "creadaEn" | "fin">): Promise<Visita> {
  const inicio = DateTime.fromISO(datos.inicio, { zone: config.TIMEZONE });
  if (!inicio.isValid) throw new HuecoNoDisponibleError("Fecha de visita no válida");
  if (inicio < ahora()) throw new HuecoNoDisponibleError("Esa hora ya ha pasado");
  const dentroDeHorario = franjasDelDia(inicio).some((f) => {
    const [hD, mD] = f.desde.split(":").map(Number);
    const [hH, mH] = f.hasta.split(":").map(Number);
    const desde = inicio.set({ hour: hD, minute: mD, second: 0, millisecond: 0 });
    const hasta = inicio.set({ hour: hH, minute: mH, second: 0, millisecond: 0 });
    return inicio >= desde && inicio.plus({ minutes: config.VISITA_DURACION_MIN }) <= hasta;
  });
  if (!dentroDeHorario) throw new HuecoNoDisponibleError("Fuera del horario de visitas");

  return visitas.transaction(async (items, insert) => {
    const choca = items.some((v) => {
      const a = DateTime.fromISO(v.inicio);
      const b = DateTime.fromISO(v.fin);
      return inicio < b && inicio.plus({ minutes: config.VISITA_DURACION_MIN }) > a;
    });
    if (choca) throw new HuecoNoDisponibleError("Ese hueco acaba de ocuparse");
    return insert({
      ...datos,
      id: randomUUID(),
      creadaEn: new Date().toISOString(),
      inicio: inicio.toISO()!,
      fin: inicio.plus({ minutes: config.VISITA_DURACION_MIN }).toISO()!,
    });
  });
}
