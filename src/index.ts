import { config } from "./config.js";
import { crearServidor } from "./server.js";
import { iniciarRefrescoPeriodico, refrescarCartera } from "./services/propiedades/catalogo.js";

const app = await crearServidor();
await refrescarCartera();
iniciarRefrescoPeriodico();
await app.listen({ port: config.PORT, host: config.HOST });
console.log(`\n✅ Servidor listo en http://localhost:${config.PORT}`);
console.log(`   Panel: http://localhost:${config.PORT}/admin?key=<TOOLS_API_KEY>`);
console.log(`   Siguiente paso: exponerlo con Cloudflare Tunnel y ejecutar "npm run setup:agent"\n`);
