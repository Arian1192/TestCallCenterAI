# Callcenter AI: MVP

Agente telefónico con IA para una inmobiliaria. Atiende llamadas, busca pisos en la cartera, da detalles, agenda visitas y registra contactos (vendedores, ofertas, consultas).

```
Cliente ─► ElevenLabs Agent (voz natural + LLM) ─► herramientas webhook ─► este servidor Node ─► Inmovilla
                                                                                  └─► agenda de visitas / contactos
```

Este MVP funciona **sin Inmovilla y sin número de teléfono**. Se prueba hablando con el agente desde el navegador, con una cartera de ejemplo. Cuando tengas el token de Inmovilla, basta con cambiar una variable.

---

## Requisitos

- **Node.js 20 o superior.** Se descarga en <https://nodejs.org>.
- **Una cuenta de ElevenLabs.** El plan gratuito sirve para probar.
- **Cloudflare Tunnel (`cloudflared`).** Sirve para que ElevenLabs pueda llegar a tu ordenador. Es gratis y no necesita cuenta.
  - Windows: `winget install --id Cloudflare.cloudflared`
  - Mac: `brew install cloudflared`

## Puesta en marcha (unos 15 minutos)

### 1. Instalar

```bash
npm install
copy .env.example .env      # en Mac/Linux: cp .env.example .env
```

Abre `.env` y rellena:

- **`TOOLS_API_KEY`:** una clave larga inventada. Puedes generarla con `node -e "console.log(require('crypto').randomUUID())"`.
- **`ELEVENLABS_API_KEY`:** la creas en ElevenLabs, en *Developers → API Keys*. Debe tener permiso sobre *ElevenAgents*.
- **`AGENCIA_NOMBRE`:** el nombre de tu inmobiliaria.

### 2. Arrancar el servidor

```bash
npm run dev
```

Para comprobar que todo responde, ejecuta en otra terminal:

```bash
npm run probar
```

Este comando simula las llamadas que hará el agente: busca pisos, consulta huecos, reserva una visita y registra un contacto.

Después abre el panel en `http://localhost:3000/admin?key=TU_TOOLS_API_KEY`.

### 3. Hacerlo accesible desde internet

En otra terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

Te dará una URL del tipo `https://algo-aleatorio.trycloudflare.com`. Cópiala en `PUBLIC_URL` dentro de `.env`.

> La URL del túnel rápido cambia cada vez que lo reinicias. Cuando cambie, vuelve a ejecutar el paso 4, que actualiza las herramientas sin duplicarlas. Si quieres una URL fija, crea un túnel con nombre en tu cuenta de Cloudflare o despliega en Railway.

### 4. Crear el agente en ElevenLabs

```bash
npm run setup:agent
```

Este comando crea las 5 herramientas y el agente "Recepción <tu agencia>", en castellano y con el prompt de `agent/prompt.md`.

### 5. Hablar con él

1. Entra en <https://elevenlabs.io/app/agents> y abre el agente.
2. En la pestaña **Voice**, elige una voz con acento de España. En la Voice Library puedes filtrar por *Spanish → Spain*.
   - Para una voz más expresiva, cambia el modelo a *Eleven v3 Conversational* o activa **Expressive mode**.
   - Si quieres fijar la voz en la configuración, copia su ID en `ELEVENLABS_VOICE_ID` y repite el paso 4.
3. Pulsa **Test AI agent** y habla. Algunas frases para probar:
   - "Hola, busco un piso para comprar en Chamberí, tengo unos cuatrocientos cincuenta mil."
   - "¿Tenéis algo de alquiler en Madrid por menos de mil quinientos al mes?"
   - "Cuéntame más de la V105."
   - "Me gustaría verlo el jueves por la tarde."
   - "Quiero vender mi piso en Tetuán."
4. Mira el panel: allí aparecen las visitas y los contactos.

---

## Herramientas del agente

| Herramienta | Endpoint | Qué hace |
|---|---|---|
| `buscar_pisos` | `POST /tools/buscar-pisos` | Filtra por operación, zona, tipo, precio, habitaciones y extras. Devuelve un máximo de 3 resultados, o alternativas si no hay coincidencias |
| `detalle_piso` | `POST /tools/detalle-piso` | Ficha hablada: baños, planta, comunidad, certificado energético y descripción |
| `huecos_visita` | `POST /tools/huecos-visita` | Huecos libres según el horario de `.env`, con fechas y horas en lenguaje natural |
| `reservar_visita` | `POST /tools/reservar-visita` | Reserva sin solapamientos y guarda en `data/visitas.json` |
| `registrar_interes` | `POST /tools/registrar-interes` | Registra vendedores, ofertas o consultas para un comercial, en `data/leads.json` |

- **Seguridad:** todas las herramientas exigen la cabecera `x-api-key`, que el script de configuración pone automáticamente.
- **Respuestas pensadas para voz:** precios y horas van en palabras ("cuatrocientos veinticinco mil euros", "las cuatro y media de la tarde"), para que la voz suene natural.

## Conectar Inmovilla

1. En Inmovilla, genera el token en **Ajustes → Opciones → Token para API Rest**.
2. En `.env`, pon:

   ```
   DATA_PROVIDER=inmovilla
   INMOVILLA_API_TOKEN=tu_token
   ```

3. Comprueba qué devuelve tu cuenta:

   ```bash
   npm run probar -- --inmovilla-raw
   ```

4. Si algún campo sale vacío o mal (precio, zona, habitaciones…), ajusta la función `mapear()` en `src/services/propiedades/inmovilla.ts`. Es el único sitio donde se traducen los campos de Inmovilla.
5. Opcional: `INMOVILLA_CREAR_CLIENTES=true` da de alta en Inmovilla a los clientes que reservan o dejan sus datos.

> El servidor guarda una copia de la cartera en memoria y la refresca cada `CACHE_REFRESH_MINUTES`. Así el agente responde al instante y no depende de que Inmovilla esté disponible en cada llamada.

## Resumen de cada llamada (opcional)

1. En ElevenLabs, ve a *Settings → Webhooks* y crea un webhook con la URL `PUBLIC_URL/webhooks/elevenlabs/post-call`.
2. Copia el secreto en `ELEVENLABS_WEBHOOK_SECRET`.
3. Actívalo como *post-call webhook* en el agente.

A partir de ahí, cada llamada aparece en el panel con su resumen y su resultado.

## Número de teléfono (cuando el MVP convenza)

1. Compra un número español en Twilio. Pide documentación de dirección en España.
2. En ElevenLabs, ve a **Phone Numbers → Import from Twilio** y asígnalo al agente.

No hay que tocar nada del servidor.

## Despliegue

- **En local con Docker:** `docker compose up -d --build`. Los datos se guardan en `./data`.
- **Railway o Render:** conecta el repositorio. El `Dockerfile` ya está listo. Define las variables de `.env` en el panel y cambia `PUBLIC_URL` a la URL de Railway. Después ejecuta `npm run setup:agent` una vez.

## Estructura del proyecto

```
src/
  index.ts                     arranque
  server.ts                    Fastify y rutas
  config.ts                    variables de entorno (validadas)
  routes/tools.ts              herramientas del agente
  routes/webhooks.ts           webhook post-llamada (firma HMAC)
  routes/admin.ts              panel /admin
  services/propiedades/        catálogo, caché, búsqueda, mock e Inmovilla
  services/agenda.ts           huecos y reservas
  lib/speech.ts                números y precios en palabras
agent/prompt.md                personalidad y reglas del agente (edítalo y repite setup:agent)
scripts/setup-agent.ts         crea o actualiza el agente en ElevenLabs
scripts/probar-herramientas.ts prueba local de las herramientas
tests/                         tests (npm test)
```

## Limitaciones del MVP (siguientes fases)

- **Agenda:** es única y usa un horario fijo. Fase 2: Google Calendar por comercial.
- **Almacenamiento:** usa ficheros JSON. En producción: SQLite o Postgres.
- **Sin avisos al comercial:** todavía no se envía email ni WhatsApp al reservar. Fase 3.
- **Sin traspaso a un humano:** se activa con Twilio, usando la herramienta del sistema *Transfer to number*.
- **Aviso legal:** el agente ya se presenta como asistente de IA (AI Act, artículo 50). Si activas la grabación, añade también el aviso de grabación.
