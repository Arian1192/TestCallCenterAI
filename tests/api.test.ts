import { beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const H = { "x-api-key": "test-key-1234567890" };

beforeAll(async () => {
  const { crearServidor } = await import("../src/server.js");
  app = await crearServidor();
});

const post = (url: string, body: unknown, headers = H) => app.inject({ method: "POST", url, payload: body as object, headers });

describe("herramientas", () => {
  it("rechaza sin clave", async () => {
    const r = await post("/tools/buscar-pisos", {}, {} as typeof H);
    expect(r.statusCode).toBe(401);
  });

  it("busca pisos en venta en Chamberí", async () => {
    const r = await post("/tools/buscar-pisos", { operacion: "comprar", zona: "chamberi", precio_max: "450000" });
    const j = r.json();
    expect(j.total).toBe(1);
    expect(j.pisos[0].referencia).toBe("V101");
    expect(j.pisos[0].resumen).toContain("cuatrocientos veinticinco mil euros");
  });

  it("propone alternativas si no hay coincidencias", async () => {
    const j = (await post("/tools/buscar-pisos", { operacion: "venta", zona: "Chamberí", precio_max: 380000 })).json();
    expect(j.total).toBe(0);
    expect(j.alternativas.length).toBeGreaterThan(0);
  });

  it("no ofrece inmuebles no disponibles", async () => {
    const j = (await post("/tools/buscar-pisos", { operacion: "alquiler", zona: "Salamanca" })).json();
    expect(j.total).toBe(0);
  });

  it("detalle por referencia tolerante a formato", async () => {
    const j = (await post("/tools/detalle-piso", { referencia: "v-101" })).json();
    expect(j.encontrado).toBe(true);
    expect(j.mensaje).toContain("Gastos de comunidad");
  });

  it("errores de validación devuelven mensaje útil", async () => {
    const j = (await post("/tools/detalle-piso", {})).json();
    expect(j.error).toBe(true);
    expect(j.mensaje).toContain("referencia");
  });

  it("huecos + reserva + doble reserva", async () => {
    const h = (await post("/tools/huecos-visita", {})).json();
    expect(h.huecos.length).toBeGreaterThan(0);
    const hueco = h.huecos[0].id;
    const r1 = (await post("/tools/reservar-visita", { hueco_id: hueco, referencia: "V101", nombre: "Ana Pérez", telefono: "600111222" })).json();
    expect(r1.reservada).toBe(true);
    const r2 = (await post("/tools/reservar-visita", { hueco_id: hueco, referencia: "V103", nombre: "Luis", telefono: "600333444" })).json();
    expect(r2.reservada).toBe(false);
    const h2 = (await post("/tools/huecos-visita", {})).json();
    expect(h2.huecos.map((x: { id: string }) => x.id)).not.toContain(hueco);
  });

  it("registra interés", async () => {
    const j = (await post("/tools/registrar-interes", { nombre: "Marta", telefono: "611222333", interes: "vender", detalle: "Piso en Tetuán" })).json();
    expect(j.registrado).toBe(true);
  });
});

describe("webhook post-llamada", () => {
  const cuerpo = JSON.stringify({
    type: "post_call_transcription",
    data: { conversation_id: "conv_1", agent_id: "ag", analysis: { transcript_summary: "Cliente reserva visita", call_successful: "success" }, transcript: [{ role: "agent", message: "Hola" }] },
  });
  const firmar = (t: number) => `t=${t},v0=${createHmac("sha256", "whsec_test").update(`${t}.${cuerpo}`).digest("hex")}`;

  it("acepta firma válida", async () => {
    const r = await app.inject({ method: "POST", url: "/webhooks/elevenlabs/post-call", payload: cuerpo, headers: { "content-type": "application/json", "elevenlabs-signature": firmar(Math.floor(Date.now() / 1000)) } });
    expect(r.statusCode).toBe(200);
  });

  it("rechaza firma inválida", async () => {
    const r = await app.inject({ method: "POST", url: "/webhooks/elevenlabs/post-call", payload: cuerpo, headers: { "content-type": "application/json", "elevenlabs-signature": "t=1,v0=abc" } });
    expect(r.statusCode).toBe(401);
  });

  it("panel admin muestra la llamada", async () => {
    await new Promise((r) => setTimeout(r, 50));
    const r = await app.inject({ method: "GET", url: "/admin?key=test-key-1234567890" });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("Cliente reserva visita");
    expect(r.body).toContain("Ana Pérez");
  });
});
