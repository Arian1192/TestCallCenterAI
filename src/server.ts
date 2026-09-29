import Fastify from "fastify";
import { config } from "./config.js";
import { adminRoutes } from "./routes/admin.js";
import { toolsRoutes } from "./routes/tools.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { estadoCartera } from "./services/propiedades/catalogo.js";

export async function crearServidor() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // No volcar datos personales en los logs
      redact: ["req.headers['x-api-key']", "req.headers.authorization", "body.telefono", "body.email"],
    },
  });

  app.get("/health", async () => ({ ok: true, cartera: estadoCartera() }));
  app.get("/", async () => ({ servicio: "callcenter-ai", panel: "/admin?key=TOOLS_API_KEY" }));

  await app.register(toolsRoutes, { prefix: "/tools" });
  await app.register(webhookRoutes, { prefix: "/webhooks" });
  await app.register(adminRoutes, { prefix: "/admin" });
  return app;
}

