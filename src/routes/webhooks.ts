import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { llamadas } from "../lib/store.js";

/**
 * Verifica la cabecera `ElevenLabs-Signature: t=<timestamp>,v0=<hmac_sha256_hex>`
 * donde el HMAC se calcula sobre `${t}.${cuerpo_crudo}` con el secreto del webhook.
 */
export function verificarFirma(cabecera: string | undefined, cuerpo: string, secreto: string, toleranciaSeg = 30 * 60): boolean {
  if (!cabecera) return false;
  const partes = Object.fromEntries(
    cabecera.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(partes.t);
  const firma = partes.v0;
  if (!t || !firma) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranciaSeg) return false;
  const esperada = createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex");
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function webhookRoutes(app: FastifyInstance) {
  // Necesitamos el cuerpo crudo para verificar la firma
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));

  app.post("/elevenlabs/post-call", async (req, reply) => {
    const raw = req.body as string;
    if (config.ELEVENLABS_WEBHOOK_SECRET) {
      const ok = verificarFirma(req.headers["elevenlabs-signature"] as string | undefined, raw, config.ELEVENLABS_WEBHOOK_SECRET);
      if (!ok) return reply.code(401).send({ error: "Firma inválida" });
    } else {
      req.log.warn("ELEVENLABS_WEBHOOK_SECRET no configurado: webhook aceptado sin verificar firma");
    }

    let evento: any;
    try {
      evento = JSON.parse(raw);
    } catch {
      return reply.code(400).send({ error: "JSON inválido" });
    }

    // Respondemos 200 enseguida y procesamos después (ElevenLabs reintenta si fallamos)
    reply.code(200).send({ ok: true });

    if (evento?.type !== "post_call_transcription") return;
    const d = evento.data ?? {};
    try {
      await llamadas.insert({
        id: d.conversation_id ?? String(Date.now()),
        recibidaEn: new Date().toISOString(),
        agentId: d.agent_id,
        duracionSeg: d.metadata?.call_duration_secs,
        resumen: d.analysis?.transcript_summary,
        exito: d.analysis?.call_successful,
        datosRecogidos: d.analysis?.data_collection_results,
        transcripcion: (d.transcript ?? []).map((t: any) => ({ rol: t.role, texto: t.message ?? "" })),
      });
      req.log.info({ conversation: d.conversation_id }, "llamada registrada");
      // Fase 3: aquí se añadiría la nota al cliente en Inmovilla y el aviso al comercial.
    } catch (err) {
      req.log.error(err, "error guardando llamada");
    }
  });
}
