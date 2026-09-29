export type Operacion = "venta" | "alquiler";

/** Modelo interno de un inmueble, independiente de Inmovilla. */
export interface Propiedad {
  id: string; // cod_ofer en Inmovilla
  referencia: string; // referencia visible (la que se dice por teléfono)
  operacion: Operacion;
  tipo: string; // piso, ático, chalet, estudio, dúplex, local…
  ciudad: string;
  zona: string;
  precio: number; // venta: precio total; alquiler: €/mes
  habitaciones: number;
  banos: number;
  metros: number;
  planta?: string;
  ascensor?: boolean;
  terraza?: boolean;
  garaje?: boolean;
  trastero?: boolean;
  piscina?: boolean;
  aireAcondicionado?: boolean;
  exterior?: boolean;
  gastosComunidad?: number;
  certificadoEnergetico?: string;
  descripcion?: string;
  disponible: boolean;
}

export interface PropiedadesProvider {
  nombre: string;
  /** Devuelve la cartera completa (se cachea en memoria). */
  listar(): Promise<Propiedad[]>;
  /** Detalle ampliado de un inmueble (descripción, extras). Opcional. */
  detalle?(p: Propiedad): Promise<Partial<Propiedad>>;
  /** Crea un cliente en el CRM. Devuelve su código o undefined si no aplica. */
  crearCliente?(c: { nombre: string; telefono: string; email?: string; notas?: string }): Promise<number | undefined>;
}
