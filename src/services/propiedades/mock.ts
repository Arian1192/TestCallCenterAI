import type { Propiedad, PropiedadesProvider } from "./types.js";

/**
 * Cartera de ejemplo (datos ficticios) para probar el agente sin conectar Inmovilla.
 * Puedes editarla libremente para que se parezca a tu cartera real.
 */
export const CARTERA_DEMO: Propiedad[] = [
  { id: "1001", referencia: "V101", operacion: "venta", tipo: "piso", ciudad: "Madrid", zona: "Chamberí", precio: 425000, habitaciones: 3, banos: 2, metros: 105, planta: "tercera", ascensor: true, terraza: true, exterior: true, aireAcondicionado: true, gastosComunidad: 120, certificadoEnergetico: "D", disponible: true, descripcion: "Piso reformado y luminoso, a cinco minutos del metro Iglesia. Cocina independiente equipada y terraza de ocho metros." },
  { id: "1002", referencia: "V102", operacion: "venta", tipo: "ático", ciudad: "Madrid", zona: "Salamanca", precio: 890000, habitaciones: 3, banos: 3, metros: 140, planta: "sexta", ascensor: true, terraza: true, garaje: true, exterior: true, aireAcondicionado: true, gastosComunidad: 280, certificadoEnergetico: "C", disponible: true, descripcion: "Ático con terraza de cuarenta metros y vistas despejadas. Plaza de garaje incluida en el precio." },
  { id: "1003", referencia: "V103", operacion: "venta", tipo: "piso", ciudad: "Madrid", zona: "Carabanchel", precio: 199000, habitaciones: 2, banos: 1, metros: 68, planta: "segunda", ascensor: false, exterior: true, gastosComunidad: 45, certificadoEnergetico: "E", disponible: true, descripcion: "Piso exterior para reformar a tu gusto, junto al metro Oporto. Ideal primera vivienda o inversión." },
  { id: "1004", referencia: "V104", operacion: "venta", tipo: "chalet", ciudad: "Pozuelo de Alarcón", zona: "Somosaguas", precio: 1350000, habitaciones: 5, banos: 4, metros: 380, ascensor: false, terraza: true, garaje: true, piscina: true, aireAcondicionado: true, certificadoEnergetico: "B", disponible: true, descripcion: "Chalet independiente en parcela de mil doscientos metros con piscina y jardín consolidado." },
  { id: "1005", referencia: "V105", operacion: "venta", tipo: "piso", ciudad: "Madrid", zona: "Arganzuela", precio: 365000, habitaciones: 2, banos: 2, metros: 82, planta: "cuarta", ascensor: true, garaje: true, trastero: true, piscina: true, aireAcondicionado: true, gastosComunidad: 150, certificadoEnergetico: "B", disponible: true, descripcion: "Obra de 2019 en urbanización con piscina y zonas comunes, cerca de Madrid Río. Garaje y trastero incluidos." },
  { id: "1006", referencia: "V106", operacion: "venta", tipo: "estudio", ciudad: "Madrid", zona: "Centro", precio: 215000, habitaciones: 0, banos: 1, metros: 38, planta: "primera", ascensor: true, exterior: false, aireAcondicionado: true, gastosComunidad: 60, certificadoEnergetico: "D", disponible: true, descripcion: "Estudio reformado en Lavapiés, perfecto para inversión en alquiler." },
  { id: "1007", referencia: "V107", operacion: "venta", tipo: "piso", ciudad: "Madrid", zona: "Chamberí", precio: 610000, habitaciones: 4, banos: 2, metros: 135, planta: "segunda", ascensor: true, exterior: true, gastosComunidad: 190, certificadoEnergetico: "E", disponible: true, descripcion: "Piso señorial con techos altos y suelos de madera en calle Santa Engracia." },
  { id: "1008", referencia: "V108", operacion: "venta", tipo: "dúplex", ciudad: "Las Rozas", zona: "El Burgo", precio: 520000, habitaciones: 4, banos: 3, metros: 160, ascensor: true, terraza: true, garaje: true, piscina: true, aireAcondicionado: true, gastosComunidad: 170, certificadoEnergetico: "C", disponible: true, descripcion: "Dúplex en urbanización cerrada con piscina, a diez minutos del centro comercial." },
  { id: "2001", referencia: "A201", operacion: "alquiler", tipo: "piso", ciudad: "Madrid", zona: "Chamberí", precio: 1650, habitaciones: 2, banos: 1, metros: 75, planta: "quinta", ascensor: true, exterior: true, aireAcondicionado: true, certificadoEnergetico: "D", disponible: true, descripcion: "Piso amueblado y exterior, listo para entrar a vivir. Se pide un mes de fianza y aval." },
  { id: "2002", referencia: "A202", operacion: "alquiler", tipo: "estudio", ciudad: "Madrid", zona: "Centro", precio: 950, habitaciones: 0, banos: 1, metros: 35, planta: "tercera", ascensor: true, aireAcondicionado: true, certificadoEnergetico: "E", disponible: true, descripcion: "Estudio amueblado junto a la Plaza Mayor." },
  { id: "2003", referencia: "A203", operacion: "alquiler", tipo: "piso", ciudad: "Madrid", zona: "Arganzuela", precio: 1400, habitaciones: 3, banos: 2, metros: 90, planta: "primera", ascensor: true, garaje: true, piscina: true, certificadoEnergetico: "C", disponible: true, descripcion: "Piso sin amueblar con plaza de garaje, en urbanización con piscina." },
  { id: "2004", referencia: "A204", operacion: "alquiler", tipo: "piso", ciudad: "Madrid", zona: "Carabanchel", precio: 1050, habitaciones: 2, banos: 1, metros: 65, planta: "cuarta", ascensor: true, terraza: true, certificadoEnergetico: "E", disponible: true, descripcion: "Piso con terraza, bien comunicado con metro y autobús." },
  { id: "2005", referencia: "A205", operacion: "alquiler", tipo: "chalet", ciudad: "Pozuelo de Alarcón", zona: "Húmera", precio: 4200, habitaciones: 4, banos: 3, metros: 280, terraza: true, garaje: true, piscina: true, aireAcondicionado: true, certificadoEnergetico: "C", disponible: true, descripcion: "Chalet adosado con jardín privado, cerca de colegios internacionales." },
  { id: "2006", referencia: "A206", operacion: "alquiler", tipo: "piso", ciudad: "Madrid", zona: "Salamanca", precio: 2600, habitaciones: 3, banos: 2, metros: 115, planta: "segunda", ascensor: true, exterior: true, aireAcondicionado: true, certificadoEnergetico: "D", disponible: false, descripcion: "Piso reservado." },
];

export class MockProvider implements PropiedadesProvider {
  nombre = "mock";
  async listar(): Promise<Propiedad[]> {
    return CARTERA_DEMO;
  }
  async crearCliente(): Promise<number | undefined> {
    return undefined;
  }
}
