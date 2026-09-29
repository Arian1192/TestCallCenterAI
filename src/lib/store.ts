import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Almacenamiento mínimo en ficheros JSON dentro de DATA_DIR.
 * Suficiente para el MVP (una sola instancia). En producción → SQLite/Postgres.
 */
class JsonCollection<T extends { id: string }> {
  private cache: T[] | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private file: string) {}

  private get filePath() {
    return path.resolve(config.DATA_DIR, this.file);
  }

  async all(): Promise<T[]> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.filePath, "utf8")) as T[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  /** Inserta de forma serializada (evita escrituras concurrentes). */
  insert(item: T): Promise<T> {
    const op = this.queue.then(async () => {
      const items = await this.all();
      items.push(item);
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(items, null, 2), "utf8");
      return item;
    });
    this.queue = op.catch(() => undefined);
    return op;
  }

  /** Ejecuta una comprobación + inserción de forma atómica respecto a otras operaciones. */
  transaction<R>(fn: (items: T[], insert: (item: T) => Promise<T>) => Promise<R>): Promise<R> {
    const op = this.queue.then(async () => {
      const items = await this.all();
      const insert = async (item: T) => {
        items.push(item);
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(items, null, 2), "utf8");
        return item;
      };
      return fn(items, insert);
    });
    this.queue = op.catch(() => undefined);
    return op;
  }
}

export interface Visita {
  id: string;
  creadaEn: string;
  inicio: string; // ISO con zona horaria
  fin: string;
  referencia: string;
  descripcionPiso: string;
  nombre: string;
  telefono: string;
  email?: string;
  notas?: string;
  conversationId?: string;
}

export interface Lead {
  id: string;
  creadoEn: string;
  nombre: string;
  telefono: string;
  interes: string;
  detalle?: string;
  referencia?: string;
  inmovillaCodCli?: number;
}

export interface Llamada {
  id: string; // conversation_id
  recibidaEn: string;
  agentId?: string;
  duracionSeg?: number;
  resumen?: string;
  exito?: string;
  datosRecogidos?: unknown;
  transcripcion?: { rol: string; texto: string }[];
}

export const visitas = new JsonCollection<Visita>("visitas.json");
export const leads = new JsonCollection<Lead>("leads.json");
export const llamadas = new JsonCollection<Llamada>("llamadas.json");
