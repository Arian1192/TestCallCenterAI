import { config } from "../../config.js";
import type { Operacion, Propiedad, PropiedadesProvider } from "./types.js";

/**
 * Cliente de la API REST v1 de Inmovilla.
 *   Base:  https://procesos.inmovilla.com/api/v1
 *   Auth:  cabecera "Token" (Inmovilla → Ajustes → Opciones → Token para API Rest)
 *
 * ⚠️ POR VALIDAR con tu token real: los nombres exactos de los campos que devuelve
 * la API. El mapeo de abajo es defensivo (prueba varios nombres posibles) y está
 * aislado en `mapear()` para ajustarlo en un solo sitio. Ejecuta
 * `npm run probar -- --inmovilla-raw` para ver la respuesta cruda de tu cuenta.
 */

type Raw = Record<string, any>;

/** keyacci → operación. Ajustar si tu cuenta usa otros códigos. */
const OPERACIONES: Record<string, Operacion> = {
  "1": "venta",
  "2": "alquiler",
  "3": "venta", // traspaso → lo tratamos como venta
  "4": "alquiler", // alquiler con opción a compra
};

function pick(o: Raw, ...keys: string[]): any {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
const num = (v: any): number => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const bool = (v: any): boolean | undefined =>
  v === undefined ? undefined : v === true || v === 1 || v === "1" || v === "S" || v === "si";

function descripcionEs(o: Raw): string | undefined {
  const d = pick(o, "descripciones", "descripcion", "descrip");
  if (!d) return undefined;
  if (typeof d === "string") return d;
  // Puede venir como { "1": { titulo, descrip } } (1 = español) o como array
  const lista: Raw[] = Array.isArray(d) ? d : Object.values(d);
  const es = lista.find((x) => String(x?.idioma ?? x?.id_idioma ?? "1") === "1") ?? lista[0];
  return es ? pick(es, "descrip", "descripcion", "texto", "titulo") : undefined;
}

export function mapear(o: Raw): Propiedad | null {
  const id = String(pick(o, "cod_ofer", "codigo", "id") ?? "");
  if (!id) return null;
  const operacion = OPERACIONES[String(pick(o, "keyacci", "accion") ?? "1")] ?? "venta";
  const precio =
    operacion === "alquiler"
      ? num(pick(o, "precioalq", "precio_alquiler", "precioinmo", "precio"))
      : num(pick(o, "precioinmo", "precio", "precio_venta"));
  return {
    id,
    referencia: String(pick(o, "ref", "referencia") ?? id),
    operacion,
    tipo: String(pick(o, "nbtipo", "tipo_ofer", "tipo", "tipoinmueble") ?? "inmueble").toLowerCase(),
    ciudad: String(pick(o, "ciudad", "nbciudad", "poblacion", "localidad") ?? ""),
    zona: String(pick(o, "zona", "nbzona", "barrio") ?? ""),
    precio,
    habitaciones: num(pick(o, "habitaciones", "total_hab")) + num(pick(o, "habdobles")),
    banos: num(pick(o, "banyos", "banos")),
    metros: num(pick(o, "m_cons", "m_utiles", "metros", "superficie")),
    planta: pick(o, "planta") !== undefined ? String(pick(o, "planta")) : undefined,
    ascensor: bool(pick(o, "ascensor")),
    terraza: bool(pick(o, "terraza")),
    garaje: bool(pick(o, "garaje", "plaza_gara", "parking")),
    trastero: bool(pick(o, "trastero")),
    piscina: bool(pick(o, "piscina_com", "piscina_prop", "piscina")),
    aireAcondicionado: bool(pick(o, "aire_con", "aireacondicionado")),
    exterior: bool(pick(o, "exterior")),
    gastosComunidad: num(pick(o, "gastos_com", "gastoscomunidad")) || undefined,
    certificadoEnergetico: pick(o, "energialetra", "certificado_energetico"),
    descripcion: descripcionEs(o),
    disponible: !bool(pick(o, "nodisponible")) && !bool(pick(o, "prospecto")),
  };
}

export class InmovillaProvider implements PropiedadesProvider {
  nombre = "inmovilla";
  /** Caché de detalles por cod_ofer, invalidada si cambia la fecha de actualización. */
  private detalles = new Map<string, { fechaact: string; raw: Raw }>();

  private async get(pathAndQuery: string): Promise<any> {
    const res = await fetch(`${config.INMOVILLA_BASE_URL}/${pathAndQuery}`, {
      headers: { Token: config.INMOVILLA_API_TOKEN!, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Inmovilla ${res.status} en ${pathAndQuery}: ${await res.text()}`);
    return res.json();
  }

  async listarRaw(): Promise<Raw[]> {
    const data = await this.get("propiedades/?listado");
    return Array.isArray(data) ? data : (data?.propiedades ?? data?.datos ?? Object.values(data ?? {}));
  }

  async detalleRaw(codOfer: string): Promise<Raw> {
    const data = await this.get(`propiedades/?cod_ofer=${encodeURIComponent(codOfer)}`);
    return Array.isArray(data) ? data[0] : data;
  }

  async listar(): Promise<Propiedad[]> {
    const lista = await this.listarRaw();
    const resultado: Propiedad[] = [];
    // El listado puede venir resumido: pedimos el detalle de cada inmueble
    // (solo de los nuevos o modificados) con poca concurrencia para no saturar la API.
    const pendientes = lista.filter((o) => !bool(pick(o, "nodisponible")) && !bool(pick(o, "prospecto")));
    const CONCURRENCIA = 3;
    for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
      const lote = pendientes.slice(i, i + CONCURRENCIA);
      await Promise.all(
        lote.map(async (o) => {
          const cod = String(pick(o, "cod_ofer") ?? "");
          const fechaact = String(pick(o, "fechaact", "fecha_act", "fechamod") ?? "");
          let raw = o;
          if (cod) {
            const cached = this.detalles.get(cod);
            if (cached && cached.fechaact === fechaact) raw = cached.raw;
            else {
              try {
                raw = { ...o, ...(await this.detalleRaw(cod)) };
                this.detalles.set(cod, { fechaact, raw });
              } catch (err) {
                console.warn(`No se pudo obtener detalle de ${cod}:`, (err as Error).message);
              }
            }
          }
          const p = mapear(raw);
          if (p) resultado.push(p);
        }),
      );
    }
    return resultado;
  }

  async crearCliente(c: { nombre: string; telefono: string; email?: string; notas?: string }) {
    if (!config.INMOVILLA_CREAR_CLIENTES) return undefined;
    const [nombre, ...apellidos] = c.nombre.trim().split(/\s+/);
    const telefono = Number(c.telefono.replace(/\D/g, "").replace(/^34(?=\d{9}$)/, ""));
    const res = await fetch(`${config.INMOVILLA_BASE_URL}/clientes/`, {
      method: "POST",
      headers: { Token: config.INMOVILLA_API_TOKEN!, "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        apellidos: apellidos.join(" ") || undefined,
        telefono1: Number.isFinite(telefono) && telefono > 0 ? telefono : undefined,
        email: c.email,
        observaciones: c.notas,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Inmovilla ${res.status} creando cliente: ${await res.text()}`);
    const data = (await res.json()) as { cod_cli?: number };
    return data.cod_cli;
  }
}
