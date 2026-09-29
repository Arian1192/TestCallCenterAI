import { describe, expect, it } from "vitest";
import { numeroEnPalabras, precioEnPalabras } from "../src/lib/speech.js";

describe("números en palabras", () => {
  it.each([
    [0, "cero"], [1, "uno"], [16, "dieciséis"], [21, "veintiuno"], [45, "cuarenta y cinco"],
    [100, "cien"], [101, "ciento uno"], [199, "ciento noventa y nueve"], [500, "quinientos"],
    [1000, "mil"], [1650, "mil seiscientos cincuenta"], [21000, "veintiún mil"], [31000, "treinta y un mil"],
    [199000, "ciento noventa y nueve mil"], [250000, "doscientos cincuenta mil"], [425000, "cuatrocientos veinticinco mil"],
    [1000000, "un millón"], [1350000, "un millón trescientos cincuenta mil"], [2000000, "dos millones"],
    [101000, "ciento un mil"],
  ])("%i → %s", (n, txt) => expect(numeroEnPalabras(n)).toBe(txt));

  it("precios", () => {
    expect(precioEnPalabras(1_000_000)).toBe("un millón de euros");
    expect(precioEnPalabras(950, true)).toBe("novecientos cincuenta euros al mes");
  });
});

import { DateTime } from "luxon";
import { horaHablada } from "../src/services/agenda.js";
describe("horas habladas", () => {
  const h = (hh: number, mm: number) => horaHablada(DateTime.fromObject({ hour: hh, minute: mm }));
  it("formatos", () => {
    expect(h(10, 0)).toBe("las diez de la mañana");
    expect(h(10, 45)).toBe("las once menos cuarto de la mañana");
    expect(h(16, 30)).toBe("las cuatro y media de la tarde");
    expect(h(13, 15)).toBe("la una y cuarto del mediodía");
    expect(h(12, 45)).toBe("la una menos cuarto del mediodía");
    expect(h(19, 20)).toBe("las siete y veinte de la tarde");
  });
});
