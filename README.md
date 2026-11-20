# Servicio de Validaciones

Servicio en Node.js 20 + Express que recibe un nombre y un número de documento, consulta una [API pública de países](https://countries-api.davegarvey.workers.dev) para enriquecer el registro, lo guarda en MongoDB y escribe un evento de auditoría en DynamoDB Local. Responde con el `id` del registro.

## Cómo correrlo

Necesitas **Node.js 20+** y **Docker** (para MongoDB y DynamoDB Local).

```bash
git clone https://github.com/miusarname2/Prueba-tecnica---Auco
cd Prueba-tecnica---Auco

cp .env.example .env        # variables de entorno
docker compose up -d        # MongoDB + DynamoDB Local
npm install
npm start
```

El servicio queda en `http://localhost:3000`. La tabla de auditoría en DynamoDB se crea sola al arrancar.

## Tests

```bash
npm test                    # unitarios, no necesitan Docker
npm run test:integration    # integración, requiere `docker compose up -d`
```

Los tests nunca llaman a la API externa real: siempre va mockeada, así que no dependen de internet.

## Endpoints

### POST /validations

Crea una validación. Body JSON:

| Campo | Requerido | Reglas |
|-------|-----------|--------|
| `name` | Sí | 2-100 caracteres: letras (con tildes y ñ), espacios, apóstrofo, punto y guion |
| `documentNumber` | Sí | Texto alfanumérico de 5 a 20 caracteres |
| `countryCode` | No | Código ISO de 2 letras (`CO`, `AR`, `MX`...). Si no se envía, se usa `DEFAULT_COUNTRY_CODE` (por defecto `CO`) |

No se aceptan campos adicionales.

```bash
curl -X POST http://localhost:3000/validations \
  -H "Content-Type: application/json" \
  -d '{"name": "Juan Pérez", "documentNumber": "ABC12345", "countryCode": "AR"}'
# 201 {"id":"674abc..."}
```

Sin `countryCode` funciona igual y usa el país por defecto:

```bash
curl -X POST http://localhost:3000/validations \
  -H "Content-Type: application/json" \
  -d '{"name": "Juan Pérez", "documentNumber": "ABC12345"}'
```

Con datos inválidos:

```bash
curl -X POST http://localhost:3000/validations \
  -H "Content-Type: application/json" \
  -d '{"name": "J@hn!", "documentNumber": "ABC12345"}'
# 400 {"error":{"code":"VALIDATION_ERROR","message":"Invalid request body","details":[...]}}
```

### GET /validations/:id

Devuelve el registro guardado en MongoDB (no toca DynamoDB ni la API externa).

```bash
curl http://localhost:3000/validations/674abc123def456789012345
# 200 {"id":"674abc...","name":"Juan Pérez","documentNumber":"ABC12345","enrichment":{...},"createdAt":"..."}

curl http://localhost:3000/validations/no-valido
# 400 {"error":{"code":"INVALID_ID", ...}}

curl http://localhost:3000/validations/507f1f77bcf86cd799439011
# 404 {"error":{"code":"NOT_FOUND", ...}}
```

### GET /health

Responde `{"status":"ok"}` si el servicio está arriba.

En `requests.http` hay los mismos ejemplos listos para usar desde VS Code.

## Errores

Todos los errores tienen el mismo formato: `{ "error": { "code", "message", "details"? } }`.

| Código | HTTP | Cuándo |
|--------|------|--------|
| `VALIDATION_ERROR` | 400 | Body inválido o JSON malformado |
| `INVALID_ID` | 400 | El id no es un ObjectId válido |
| `NOT_FOUND` | 404 | No existe el registro o la ruta |
| `EXTERNAL_API_ERROR` | 502 | La API de países falló (error de red, 5xx o respuesta inesperada) |
| `EXTERNAL_API_TIMEOUT` | 504 | La API de países no respondió a tiempo |
| `INTERNAL_ERROR` | 500 | Cualquier otro error (el detalle solo queda en los logs) |

## Cómo funciona

Al hacer `POST /validations`:

1. Se valida la entrada con Zod.
2. Se consulta la API de países (con timeout y reintentos, ver abajo).
3. Se guarda el registro enriquecido en MongoDB, que es la fuente de verdad.
4. Se escribe el evento de auditoría en DynamoDB.
5. Se responde `201` con el `id`.

### API externa: timeout y reintentos

- Timeout de 5 s por intento (`EXTERNAL_API_TIMEOUT_MS`).
- Un reintento extra (`EXTERNAL_API_RETRIES`), con 300 ms de espera, solo si hubo error de red, timeout o respuesta 5xx. Un 4xx no se reintenta porque el resultado no va a cambiar.
- Si sigue fallando, se responde 502 (error) o 504 (timeout) y no se guarda nada en MongoDB.

### Auditoría en DynamoDB

| Evento | Cuándo se escribe |
|--------|-------------------|
| `VALIDATION_CREATED` | Se guardó la validación en MongoDB |
| `ENRICHMENT_FAILED` | Falló la API de países |
| `MONGO_WRITE_FAILED` | Falló el guardado en MongoDB |

Si DynamoDB falla **después** de guardar en MongoDB, el registro se conserva, el error queda en los logs y se responde `201`: no quise que el cliente vea un error por un problema de la auditoría. El costo es que podría quedar una validación sin evento. Los eventos de fallo también son "mejor esfuerzo": si no se pueden escribir, se loguea y se propaga el error original.

## Datos sensibles

El número de documento es un dato sensible, así que:

- En DynamoDB se guarda su hash SHA-256, no el valor original. Para buscar el historial de un documento hay que hashearlo primero (`hashDocument` en `src/utils/crypto.js`).
- Los logs HTTP de pino ocultan `req.body.documentNumber`.
- En MongoDB sí queda el valor original, porque el negocio lo necesita.

Ojo, esto es una mitigación básica y no una solución completa: como los números de documento son un espacio de valores pequeño, alguien con acceso a la tabla podría calcular los hashes de todos y comparar. En producción usaría HMAC con un secreto o cifrado con KMS, además de cifrado en reposo y autenticación en los endpoints.

## Variables de entorno

Se configuran en `.env` (copia de `.env.example`).

| Variable | Default | Para qué sirve |
|----------|---------|----------------|
| `PORT` | `3000` | Puerto del servidor |
| `MONGO_URI` | (obligatoria) | Conexión a MongoDB |
| `DYNAMODB_ENDPOINT` | (obligatoria) | Endpoint de DynamoDB Local |
| `AWS_REGION` | `us-east-1` | Región de AWS |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `local` | Cualquier valor sirve en DynamoDB Local |
| `AUDIT_TABLE_NAME` | `validations-audit` | Tabla de auditoría |
| `COUNTRIES_API_URL` | (obligatoria) | URL base de la API de países |
| `DEFAULT_COUNTRY_CODE` | `CO` | País por defecto si no llega `countryCode` |
| `EXTERNAL_API_TIMEOUT_MS` | `5000` | Timeout de la API externa |
| `EXTERNAL_API_RETRIES` | `1` | Reintentos extra ante fallos transitorios |

## Estructura

```
src/
  config/         variables de entorno validadas con Zod
  controllers/    manejo de req/res
  services/       lógica: enrichment (API externa) y validations (orquesta todo)
  repositories/   acceso a datos: MongoDB y DynamoDB
  db/             conexiones
  schemas/        validación de entrada (Zod)
  middlewares/    validación y manejo central de errores
  errors/         clase AppError
  utils/          hash del documento
  app.js          arma la app de Express
  server.js       arranque normal (npm start)
  handler.js      arranque en Lambda (serverless-http)
tests/
  unit/           sin Docker
  integration/    con MongoDB y DynamoDB Local
docs/DECISIONES.md
serverless.yml
```

## Opcional: correrlo con Serverless Framework

El mismo servicio puede correr como funciones Lambda con Serverless Framework v3. Es una opción adicional: **el camino principal sigue siendo `npm start`**.

```bash
docker compose up -d    # MongoDB y DynamoDB siguen haciendo falta
npm run offline
```

`serverless-offline` agrega el stage a la ruta, así que las URLs quedan como `http://localhost:3000/dev/validations`. Si prefieres quitar el `/dev`, usa `npx serverless offline --noPrependStageInUrl`.

`src/handler.js` envuelve la misma app de Express con `serverless-http`, y las conexiones a MongoDB y DynamoDB se crean fuera del handler para reutilizarlas entre invocaciones.

---

## Entregables adicionales de la prueba

### Por qué elegí esas llaves en DynamoDB

- **Partition key:** el hash SHA-256 del número de documento.
- **Sort key:** `<fecha ISO 8601>#<id de la validación>`.

La pregunta natural sobre una auditoría es "¿qué validaciones ha tenido este documento?". Con el documento como partition key, todos sus eventos quedan juntos y el historial completo se consulta con una sola query, sin escanear la tabla. Uso el hash y no el valor original para no dejar el documento en claro en la tabla de auditoría; el mismo documento siempre da el mismo hash, así que la agrupación funciona igual.

La fecha va primero en la sort key porque el formato ISO se ordena bien como texto: los eventos salen en orden cronológico y se pueden filtrar por rango de fechas con `BETWEEN`. El id de la validación va al final para que dos eventos del mismo documento en el mismo instante no se pisen.

### Qué mejoraría con más tiempo

- **Auditoría más confiable.** Hoy, si DynamoDB falla, la validación queda sin evento. Usaría un outbox (guardar el evento en Mongo y replicarlo después) o una cola con reintentos.
- **Mejor protección del documento.** Cambiar el SHA-256 por HMAC con secreto o por cifrado con KMS, y cifrar en reposo.
- **Seguridad en la API.** Autenticación en los endpoints y rate limiting.
- **Reintentos con backoff exponencial** en lugar de una espera fija de 300 ms.
- **CI** que corra los tests unitarios y de integración con Docker en cada push.
- **Observabilidad:** métricas y alertas sobre fallos de la API externa y de la auditoría.

Más detalle de las decisiones en [docs/DECISIONES.md](docs/DECISIONES.md).