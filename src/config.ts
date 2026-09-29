import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),

  // Clave que ElevenLabs envía en la cabecera x-api-key al llamar a /tools/*
  TOOLS_API_KEY: z.string().min(16, "TOOLS_API_KEY debe tener al menos 16 caracteres"),

  // Proveedor de datos de pisos: "mock" (datos de ejemplo) o "inmovilla" (API real)
  DATA_PROVIDER: z.enum(["mock", "inmovilla"]).default("mock"),
  INMOVILLA_API_TOKEN: z.string().optional(),
  INMOVILLA_BASE_URL: z.string().default("https://procesos.inmovilla.com/api/v1"),
  INMOVILLA_CREAR_CLIENTES: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  CACHE_REFRESH_MINUTES: z.coerce.number().default(10),

  // Agenda de visitas
  TIMEZONE: z.string().default("Europe/Madrid"),
  VISITA_DURACION_MIN: z.coerce.number().default(45),
  // Franjas por día de la semana (1=lunes … 7=domingo). Formato "HH:MM-HH:MM,HH:MM-HH:MM"
  HORARIO_LABORABLE: z.string().default("10:00-14:00,16:30-20:00"),
  HORARIO_SABADO: z.string().default("10:00-13:30"),
  DIAS_ANTELACION: z.coerce.number().default(7),

  // Webhook post-llamada de ElevenLabs (secreto HMAC). Opcional en el MVP.
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),

  DATA_DIR: z.string().default("./data"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Configuración inválida en .env:");
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const config = parsed.data;

if (config.DATA_PROVIDER === "inmovilla" && !config.INMOVILLA_API_TOKEN) {
  console.error("❌ DATA_PROVIDER=inmovilla requiere INMOVILLA_API_TOKEN");
  process.exit(1);
}
