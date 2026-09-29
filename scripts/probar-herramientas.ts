/**
 * Prueba rápida de las herramientas contra el servidor en marcha (npm run dev).
 *   npm run probar                  → simula las llamadas que haría el agente
 *   npm run probar -- --inmovilla-raw → muestra la respuesta cruda de Inmovilla (para ajustar el mapeo)
 */
import "dotenv/config";

const base = process.env.PROBAR_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const key = process.env.TOOLS_API_KEY ?? "";

async function tool(nombre: string, body: unknown) {
  const res = await fetch(`${base}/tools/${nombre}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log(`\n▶ ${nombre} ${JSON.stringify(body)}\n`, JSON.stringify(json, null, 2));
  return json as any;
}

async function main() {
  if (process.argv.includes("--inmovilla-raw")) {
    const { InmovillaProvider } = await import("../src/services/propiedades/inmovilla.js");
    const p = new InmovillaProvider();
    const lista = await p.listarRaw();
    console.log(`Listado: ${lista.length} elementos. Primer elemento:\n`, JSON.stringify(lista[0], null, 2));
    const cod = lista[0]?.cod_ofer;
    if (cod) console.log(`\nDetalle de ${cod}:\n`, JSON.stringify(await p.detalleRaw(String(cod)), null, 2));
    return;
  }

  await tool("buscar-pisos", { operacion: "venta", zona: "Chamberí", precio_max: 450000, habitaciones_min: 2 });
  await tool("buscar-pisos", { operacion: "alquiler", zona: "Madrid", precio_max: 1500 });
  await tool("detalle-piso", { referencia: "V101" });
  const h = await tool("huecos-visita", { franja: "tarde" });
  if (h.huecos?.[0]) {
    await tool("reservar-visita", {
      hueco_id: h.huecos[0].id,
      referencia: "V101",
      nombre: "Cliente de Prueba",
      telefono: "600000000",
      notas: "Reserva creada por npm run probar",
    });
  }
  await tool("registrar-interes", { nombre: "Cliente de Prueba", telefono: "600000000", interes: "vender", detalle: "Quiere valorar un piso en Tetuán" });
  console.log(`\n✅ Listo. Mira el panel: ${base}/admin?key=${key}`);
}

main().catch((e) => {
  console.error("❌", e.message, `\n¿Está el servidor arrancado en ${base}? (npm run dev)`);
  process.exit(1);
});
