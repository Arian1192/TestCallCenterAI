import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { config } from "../config.js";
import { leads } from "../lib/store.js";
import { HuecoNoDisponibleError, etiquetaHablada, huecosLibres, reservar } from "../services/agenda.js";
import {
  buscar,
  buscarPorReferencia,
  fichaHablada,
  provider,
  resumenHablado,
} from "../services/propiedades/catalogo.js";

/**
 * Endpoints que el agente de ElevenLabs llama como "herramientas webhook".
 * Todas las respuestas son JSON cortos con un campo `mensaje` pensado para que el
 * agente lo diga (o lo parafrasee) en voz alta.
 */

// El LLM a veces manda números como texto ("400000") o vacíos → los normalizamos.
const numOpt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(String(v).replace(/[^\d.]/g, ""))),
  z.number().positive().optional(),
);
const strOpt = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().optional());

const BuscarSchema = z.object({
  operacion: z.preprocess(
    (v) => (typeof v === "string" ? (/alquil|rent/i.test(v) ? "alquiler" : /compr|vent/i.test(v) ? "venta" : undefined) : undefined),
    z.enum(["venta", "alquiler"]).optional(),
  ),
  zona: strOpt,
  tipo: strOpt,
  precio_max: numOpt,
  precio_min: numOpt,
  habitaciones_min: numOpt,
  caracteristicas: z.preprocess(
    (v) => (typeof v === "string" ? v.split(/,| y /).map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string()).optional(),
  ),
});

const RefSchema = z.object({ referencia: z.string().min(1) });

const HuecosSchema = z.object({
  fecha: strOpt, // YYYY-MM-DD
  franja: z.preprocess(
    (v) => (typeof v === "string" ? (/tard/i.test(v) ? "tarde" : /ma[ñn]/i.test(v) ? "mañana" : undefined) : undefined),
    z.enum(["mañana", "tarde"]).optional(),
  ),
});

const ReservarSchema = z.object({
  hueco_id: z.string().min(10),
  referencia: z.string().min(1),
  nombre: z.string().min(2),
  telefono: z.string().min(6),
  email: strOpt,
  notas: strOpt,
  conversation_id: strOpt,
});

const LeadSchema = z.object({
  nombre: z.string().min(2),
  telefono: z.string().min(6),
  interes: z.string().min(2), // comprar, alquilar, vender, valoración, otro
  detalle: strOpt,
  referencia: strOpt,
});

export async function toolsRoutes(app: FastifyInstance) {
  // Autenticación: ElevenLabs envía la cabecera x-api-key configurada en la herramienta
  app.addHook("onRequest", async (req, reply) => {
    if (req.headers["x-api-key"] !== config.TOOLS_API_KEY) {
      return reply.code(401).send({ error: "No autorizado" });
    }
  });

  app.post("/buscar-pisos", async (req) => {
    const f = BuscarSchema.parse(req.body ?? {});
    req.log.info({ filtros: f }, "buscar_pisos");
    return buscar(f);
  });

  app.post("/detalle-piso", async (req, reply) => {
    const { referencia } = RefSchema.parse(req.body ?? {});
    const p = await buscarPorReferencia(referencia);
    if (!p) {
      return reply.send({
        encontrado: false,
        mensaje: `No encuentro la referencia ${referencia}. Pide al cliente que la repita o busca por zona y precio.`,
      });
    }
    let ficha = p;
    if (provider.detalle) ficha = { ...p, ...(await provider.detalle(p)) };
    return {
      encontrado: true,
      disponible: ficha.disponible,
      referencia: ficha.referencia,
      mensaje: ficha.disponible ? fichaHablada(ficha) : `El inmueble ${ficha.referencia} ya no está disponible.`,
    };
  });

  app.post("/huecos-visita", async (req) => {
    const opts = HuecosSchema.parse(req.body ?? {});
    const { hoy, huecos } = await huecosLibres(opts);
    return {
      hoy,
      huecos,
      mensaje: huecos.length
        ? `Huecos disponibles: ${huecos.map((h) => h.cuando).join("; ")}. Ofrece dos o tres opciones, no todas.`
        : "No hay huecos libres con esas condiciones. Ofrece otro día o franja.",
    };
  });

  app.post("/reservar-visita", async (req, reply) => {
    const d = ReservarSchema.parse(req.body ?? {});
    const piso = await buscarPorReferencia(d.referencia);
    if (!piso || !piso.disponible) {
      return reply.send({ reservada: false, mensaje: `La referencia ${d.referencia} no está disponible para visitas.` });
    }
    try {
      const v = await reservar({
        inicio: d.hueco_id,
        referencia: piso.referencia,
        descripcionPiso: resumenHablado(piso),
        nombre: d.nombre,
        telefono: d.telefono,
        email: d.email,
        notas: d.notas,
        conversationId: d.conversation_id,
      });
      req.log.info({ visita: v.id, ref: v.referencia, inicio: v.inicio }, "visita reservada");
      // Alta del cliente en el CRM (si está activado). Nunca bloquea la llamada.
      provider
        .crearCliente?.({ nombre: d.nombre, telefono: d.telefono, email: d.email, notas: `Visita ${piso.referencia} ${v.inicio}` })
        .catch((err) => req.log.warn({ err: (err as Error).message }, "no se pudo crear cliente en CRM"));
      return {
        reservada: true,
        visita_id: v.id,
        mensaje: `Visita confirmada para ${etiquetaHablada(DateTime.fromISO(v.inicio).setZone(config.TIMEZONE))} en el inmueble ${piso.referencia}. Un comercial le llamará o escribirá para confirmar la dirección exacta.`,
      };
    } catch (err) {
      if (err instanceof HuecoNoDisponibleError) {
        const { huecos } = await huecosLibres();
        return {
          reservada: false,
          mensaje: `No se ha podido reservar: ${err.message}. Otras opciones: ${huecos.slice(0, 3).map((h) => h.cuando).join("; ")}.`,
          huecos: huecos.slice(0, 3),
        };
      }
      throw err;
    }
  });

  app.post("/registrar-interes", async (req) => {
    const d = LeadSchema.parse(req.body ?? {});
    let codCli: number | undefined;
    try {
      codCli = await provider.crearCliente?.({ nombre: d.nombre, telefono: d.telefono, notas: `${d.interes}: ${d.detalle ?? ""}` });
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, "no se pudo crear cliente en CRM");
    }
    await leads.insert({
      id: randomUUID(),
      creadoEn: new Date().toISOString(),
      ...d,
      inmovillaCodCli: codCli,
    });
    return {
      registrado: true,
      mensaje: "Datos registrados. Un comercial contactará con el cliente en menos de 24 horas laborables.",
    };
  });

  // Errores de validación → respuesta útil para el LLM (en lugar de un 500 opaco)
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError) {
      const faltan = err.issues.map((i) => i.path.join(".")).join(", ");
      return reply.code(200).send({ error: true, mensaje: `Faltan o son incorrectos estos datos: ${faltan}. Pídeselos al cliente.` });
    }
    req.log.error(err);
    return reply.code(200).send({ error: true, mensaje: "Ha habido un problema técnico. Ofrece que un comercial le llame." });
  });
}
