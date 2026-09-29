import type { FastifyInstance } from "fastify";
import { DateTime } from "luxon";
import { config } from "../config.js";
import { leads, llamadas, visitas } from "../lib/store.js";
import { estadoCartera, obtenerCartera, refrescarCartera } from "../services/propiedades/catalogo.js";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fecha = (iso: string) => DateTime.fromISO(iso).setZone(config.TIMEZONE).setLocale("es").toFormat("ccc d LLL, HH:mm");

function tabla(cabeceras: string[], filas: unknown[][]): string {
  if (!filas.length) return `<p class="vacio">Nada todavía.</p>`;
  return `<div class="scroll"><table><thead><tr>${cabeceras.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${filas
    .map((f) => `<tr>${f.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

/**
 * Panel mínimo para ver qué ha hecho el agente: visitas, contactos, llamadas y cartera.
 * Acceso: http://localhost:3000/admin?key=TU_TOOLS_API_KEY
 */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    const key = (req.query as Record<string, string>)?.key;
    if (key !== config.TOOLS_API_KEY) return reply.code(401).type("text/plain").send("Añade ?key=TOOLS_API_KEY a la URL");
  });

  app.post("/refrescar", async () => {
    await refrescarCartera();
    return estadoCartera();
  });

  app.get("/", async (_req, reply) => {
    const [vs, ls, cs, cartera] = await Promise.all([visitas.all(), leads.all(), llamadas.all(), obtenerCartera()]);
    const est = estadoCartera();
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Callcenter AI · Panel</title><meta http-equiv="refresh" content="30">
<style>
:root{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#6b6b66;--card:#fff;--line:#e4e4df;--acc:#2f6f4f}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecece8;--muted:#9b9b95;--card:#1f1f1d;--line:#34342f;--acc:#6fbf94}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px}
.sub{color:var(--muted);margin:0 0 16px}.vacio{color:var(--muted)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.kpi b{display:block;font-size:22px;color:var(--acc)}
.scroll{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.03em}
tr:last-child td{border-bottom:0}
</style></head><body><main>
<h1>Callcenter AI</h1>
<p class="sub">Proveedor de datos: <b>${esc(est.proveedor)}</b> · Última carga: ${est.ultimaCarga ? esc(fecha(est.ultimaCarga.toISOString())) : "—"} · Se actualiza cada 30 s</p>
<div class="kpis">
<div class="kpi"><b>${vs.length}</b>visitas</div>
<div class="kpi"><b>${ls.length}</b>contactos</div>
<div class="kpi"><b>${cs.length}</b>llamadas</div>
<div class="kpi"><b>${cartera.filter((p) => p.disponible).length}</b>inmuebles disponibles</div>
</div>
<h2>Visitas reservadas</h2>
${tabla(["Cuándo", "Ref.", "Cliente", "Teléfono", "Notas"], [...vs].sort((a, b) => a.inicio.localeCompare(b.inicio)).map((v) => [fecha(v.inicio), v.referencia, v.nombre, v.telefono, v.notas ?? ""]))}
<h2>Contactos registrados</h2>
${tabla(["Fecha", "Nombre", "Teléfono", "Interés", "Detalle"], [...ls].reverse().map((l) => [fecha(l.creadoEn), l.nombre, l.telefono, l.interes, l.detalle ?? ""]))}
<h2>Llamadas (webhook post-llamada)</h2>
${tabla(["Fecha", "Duración", "Resultado", "Resumen"], [...cs].reverse().map((c) => [fecha(c.recibidaEn), c.duracionSeg ? `${Math.round(c.duracionSeg)} s` : "", c.exito ?? "", c.resumen ?? ""]))}
<h2>Cartera</h2>
${tabla(["Ref.", "Operación", "Tipo", "Zona", "Precio", "Hab.", "m²", "Disp."], cartera.map((p) => [p.referencia, p.operacion, p.tipo, `${p.zona}, ${p.ciudad}`, p.precio.toLocaleString("es-ES") + " €", p.habitaciones, p.metros, p.disponible ? "sí" : "no"]))}
</main></body></html>`;
    return reply.type("text/html; charset=utf-8").send(html);
  });
}
