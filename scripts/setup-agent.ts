/**
 * Crea (o actualiza) el agente de voz y sus herramientas en ElevenLabs.
 *
 *   npm run setup:agent
 *
 * Es idempotente: guarda los IDs en agent/.state.json y, si lo vuelves a ejecutar
 * (por ejemplo porque ha cambiado la URL del túnel o el prompt), actualiza en lugar
 * de duplicar.
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const API = process.env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io/v1/convai";
const env = (k: string, def?: string) => {
  const v = process.env[k] ?? def;
  if (v === undefined || v === "") {
    console.error(`❌ Falta ${k} en .env`);
    process.exit(1);
  }
  return v;
};

const XI_KEY = env("ELEVENLABS_API_KEY");
const PUBLIC_URL = env("PUBLIC_URL").replace(/\/+$/, "");
const TOOLS_API_KEY = env("TOOLS_API_KEY");
const AGENCIA = env("AGENCIA_NOMBRE", "Inmobiliaria Demo");
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || undefined;
const LLM = env("ELEVENLABS_LLM", "gemini-2.5-flash");
const TTS_MODEL = env("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5");

const STATE_FILE = path.resolve("agent/.state.json");
type State = { agent_id?: string; tools: Record<string, string> };
const state: State = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : { tools: {} };
const guardar = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

async function xi(method: string, url: string, body?: unknown) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { "xi-api-key": XI_KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

// ─────────────── Definición de herramientas (webhooks a nuestro servidor) ───────────────

const s = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const n = (description: string) => ({ type: "number", description });

const HERRAMIENTAS = [
  {
    name: "buscar_pisos",
    path: "/tools/buscar-pisos",
    description:
      "Busca inmuebles disponibles en la cartera de la inmobiliaria. Úsala cuando el cliente busque casa para comprar o alquilar. Devuelve como máximo 3 resultados con un resumen para leer en voz alta, o alternativas si no hay coincidencias exactas.",
    body: {
      type: "object",
      description: "Filtros de búsqueda. Todos opcionales; envía solo los que el cliente haya dicho.",
      properties: {
        operacion: s("Si el cliente quiere comprar ('venta') o alquilar ('alquiler')", { enum: ["venta", "alquiler"] }),
        zona: s("Barrio, zona o ciudad que busca, por ejemplo 'Chamberí' o 'Pozuelo'"),
        tipo: s("Tipo de inmueble si lo especifica: piso, ático, chalet, estudio, dúplex, local…"),
        precio_max: n("Presupuesto máximo en euros (para alquiler, euros al mes)"),
        precio_min: n("Precio mínimo en euros, solo si lo indica"),
        habitaciones_min: n("Número mínimo de habitaciones"),
        caracteristicas: s("Extras imprescindibles separados por comas: terraza, garaje, ascensor, piscina, trastero, exterior"),
      },
      required: [],
    },
  },
  {
    name: "detalle_piso",
    path: "/tools/detalle-piso",
    description:
      "Obtiene la ficha completa de un inmueble por su referencia (baños, planta, gastos de comunidad, certificado energético, descripción). Úsala cuando el cliente se interese por un inmueble concreto.",
    body: {
      type: "object",
      description: "Referencia del inmueble",
      properties: { referencia: s("Referencia del inmueble, por ejemplo 'V101'") },
      required: ["referencia"],
    },
  },
  {
    name: "huecos_visita",
    path: "/tools/huecos-visita",
    description:
      "Consulta los huecos libres para visitar un inmueble. Devuelve una lista de huecos con un 'id' (necesario para reservar) y una descripción hablada del día y la hora.",
    body: {
      type: "object",
      description: "Preferencias del cliente (opcionales)",
      properties: {
        fecha: s("Día concreto en formato AAAA-MM-DD, solo si el cliente pide un día específico"),
        franja: s("Preferencia de franja horaria", { enum: ["mañana", "tarde"] }),
      },
      required: [],
    },
  },
  {
    name: "reservar_visita",
    path: "/tools/reservar-visita",
    description:
      "Reserva una visita a un inmueble. Úsala solo después de que el cliente haya elegido un hueco devuelto por huecos_visita y te haya dado su nombre y teléfono.",
    body: {
      type: "object",
      description: "Datos de la visita",
      properties: {
        hueco_id: s("El 'id' exacto del hueco elegido, tal cual lo devolvió huecos_visita"),
        referencia: s("Referencia del inmueble a visitar"),
        nombre: s("Nombre y apellido del cliente"),
        telefono: s("Teléfono de contacto del cliente, solo dígitos"),
        email: s("Email del cliente, solo si lo facilita"),
        notas: s("Cualquier detalle útil para el comercial (por ejemplo, necesita hipoteca, viene con pareja)"),
        conversation_id: s("Identificador de la conversación", { dynamic_variable: "system__conversation_id" }),
      },
      required: ["hueco_id", "referencia", "nombre", "telefono"],
    },
  },
  {
    name: "registrar_interes",
    path: "/tools/registrar-interes",
    description:
      "Registra los datos de un cliente para que le llame un comercial: propietarios que quieren vender o alquilar su casa, clientes sin inmueble que encaje, ofertas de precio o cualquier consulta que no puedas resolver.",
    body: {
      type: "object",
      description: "Datos del contacto",
      properties: {
        nombre: s("Nombre del cliente"),
        telefono: s("Teléfono de contacto, solo dígitos"),
        interes: s("Motivo principal", { enum: ["comprar", "alquilar", "vender", "poner en alquiler", "valoración", "oferta", "otro"] }),
        detalle: s("Resumen breve de lo que necesita (zona, presupuesto, tipo de inmueble, oferta…)"),
        referencia: s("Referencia del inmueble relacionado, si la hay"),
      },
      required: ["nombre", "telefono", "interes"],
    },
  },
];

function toolConfig(h: (typeof HERRAMIENTAS)[number]) {
  return {
    tool_config: {
      type: "webhook",
      name: h.name,
      description: h.description,
      response_timeout_secs: 15,
      api_schema: {
        url: `${PUBLIC_URL}${h.path}`,
        method: "POST",
        request_body_schema: h.body,
        request_headers: { "x-api-key": TOOLS_API_KEY },
      },
    },
  };
}

async function upsertTool(h: (typeof HERRAMIENTAS)[number]): Promise<string> {
  const body = toolConfig(h);
  const existente = state.tools[h.name];
  if (existente) {
    const r = await xi("PATCH", `/tools/${existente}`, body);
    if (r.ok) {
      console.log(`  ↻ ${h.name} actualizada`);
      return existente;
    }
    if (r.status !== 404) throw new Error(`Error actualizando ${h.name} (${r.status}): ${JSON.stringify(r.json)}`);
  }
  const r = await xi("POST", "/tools", body);
  if (!r.ok) throw new Error(`Error creando ${h.name} (${r.status}): ${JSON.stringify(r.json)}`);
  state.tools[h.name] = r.json.id;
  guardar();
  console.log(`  ＋ ${h.name} creada`);
  return r.json.id;
}

function agentBody(toolIds: string[], conBuiltIns = true) {
  const prompt = readFileSync(path.resolve("agent/prompt.md"), "utf8").replaceAll("{{AGENCIA}}", AGENCIA);
  return {
    name: `Recepción ${AGENCIA}`,
    conversation_config: {
      agent: {
        language: "es",
        first_message: `Hola, has llamado a ${AGENCIA}. Soy Lucía, la asistente virtual con inteligencia artificial. ¿En qué te puedo ayudar?`,
        prompt: {
          prompt,
          llm: LLM,
          temperature: 0.4,
          tool_ids: toolIds,
          ...(conBuiltIns
            ? {
                built_in_tools: {
                  end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } },
                },
              }
            : {}),
        },
      },
      tts: {
        model_id: TTS_MODEL,
        ...(VOICE_ID ? { voice_id: VOICE_ID } : {}),
      },
      conversation: { max_duration_seconds: 900 },
    },
  };
}

async function main() {
  console.log(`\n🔧 Configurando agente en ElevenLabs → herramientas apuntando a ${PUBLIC_URL}\n`);

  // 0. Comprobar que el servidor es accesible desde internet
  try {
    const r = await fetch(`${PUBLIC_URL}/health`, { signal: AbortSignal.timeout(8000) });
    console.log(r.ok ? "  ✓ Servidor accesible en PUBLIC_URL" : `  ⚠ /health respondió ${r.status}`);
  } catch {
    console.warn("  ⚠ No se puede acceder a PUBLIC_URL/health. ¿Está el servidor y el túnel en marcha? Sigo igualmente.");
  }

  // 1. Herramientas
  const ids: string[] = [];
  for (const h of HERRAMIENTAS) ids.push(await upsertTool(h));

  // 2. Agente
  let body = agentBody(ids);
  if (state.agent_id) {
    let r = await xi("PATCH", `/agents/${state.agent_id}`, body);
    if (!r.ok && r.status === 422) r = await xi("PATCH", `/agents/${state.agent_id}`, (body = agentBody(ids, false)));
    if (r.ok) console.log(`  ↻ Agente actualizado`);
    else if (r.status === 404) state.agent_id = undefined;
    else throw new Error(`Error actualizando agente (${r.status}): ${JSON.stringify(r.json)}`);
  }
  if (!state.agent_id) {
    let r = await xi("POST", "/agents/create", body);
    if (!r.ok && r.status === 422) {
      console.warn("  ⚠ La API no aceptó end_call integrado; lo creo sin él (actívalo en el panel: Tools → End call)");
      r = await xi("POST", "/agents/create", agentBody(ids, false));
    }
    if (!r.ok) throw new Error(`Error creando agente (${r.status}): ${JSON.stringify(r.json)}`);
    state.agent_id = r.json.agent_id;
    guardar();
    console.log(`  ＋ Agente creado`);
  }

  console.log(`\n✅ Listo. Agent ID: ${state.agent_id}`);
  console.log(`   Ábrelo en https://elevenlabs.io/app/agents → "Recepción ${AGENCIA}" y pulsa "Test AI agent" para hablar con él.`);
  if (!VOICE_ID) console.log(`   💡 Elige una voz con acento de España en la pestaña Voice (o pon ELEVENLABS_VOICE_ID en .env y repite).`);
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
