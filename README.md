# Servicio de Validaciones

Servicio backend en Node.js 20 con Express que permite crear validaciones de identidad, enriquecer los datos con información geográfica desde [REST Countries](https://restcountries.com), almacenarlos en MongoDB y registrar eventos de auditoría en DynamoDB Local.

## Requisitos

- **Node.js 20** o superior
- **Docker** y **Docker Compose** (para MongoDB y DynamoDB Local)

## Inicio Rápido

```bash
# 1. Clonar el repositorio
git clone https://github.com/miusarname2/Prueba-tecnica---Auco
cd validations-service

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Levantar las bases de datos
docker compose up -d

# 4. Instalar dependencias
npm install

# 5. Iniciar el servidor
npm start
```

El servidor estará disponible en `http://localhost:3000`.

## Tests

```bash
# Tests unitarios (sin Docker)
npm test

# Tests de integración (requiere docker compose up -d)
npm run test:integration
```

## Endpoints

### `GET /health`

Verifica que el servicio está activo.

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

### `POST /validations`

Crea una nueva validación con enriquecimiento de datos.

**Caso exitoso:**

```bash
curl -X POST http://localhost:3000/validations \
  -H "Content-Type: application/json" \
  -d '{"name": "Juan Pérez", "documentNumber": "ABC12345"}'
# → 201 {"id":"674abc..."}
```

**Error de validación (nombre con símbolos):**

```bash
curl -X POST http://localhost:3000/validations \
  -H "Content-Type: application/json" \
  -d '{"name": "J@hn!", "documentNumber": "ABC12345"}'
# → 400 {"error":{"code":"VALIDATION_ERROR","message":"Invalid request body","details":[...]}}
```

**Error de validación (campo extra):**

```bash
curl -X POST http://localhost:3000/validations \
  -H "Content-Type: application/json" \
  -d '{"name": "Juan Pérez", "documentNumber": "ABC12345", "extra": "no"}'
# → 400 {"error":{"code":"VALIDATION_ERROR","message":"Invalid request body","details":[...]}}
```

### `GET /validations/:id`

Recupera una validación por su ID.

**Caso exitoso:**

```bash
curl http://localhost:3000/validations/674abc123def456789012345
# → 200 {"id":"674abc...","name":"Juan Pérez","documentNumber":"ABC12345","enrichment":{...},"createdAt":"..."}
```

**ID inválido:**

```bash
curl http://localhost:3000/validations/no-valido
# → 400 {"error":{"code":"INVALID_ID","message":"The provided id is not a valid identifier"}}
```

**No encontrado:**

```bash
curl http://localhost:3000/validations/507f1f77bcf86cd799439011
# → 404 {"error":{"code":"NOT_FOUND","message":"Validation not found"}}
```

## Códigos de Error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `VALIDATION_ERROR` | 400 | Cuerpo de la petición inválido o JSON malformado |
| `INVALID_ID` | 400 | El ID proporcionado no es un ObjectId válido |
| `NOT_FOUND` | 404 | Recurso no encontrado |
| `EXTERNAL_API_ERROR` | 502 | Error en la API externa de enriquecimiento |
| `EXTERNAL_API_TIMEOUT` | 504 | Timeout en la API externa de enriquecimiento |
| `INTERNAL_ERROR` | 500 | Error interno inesperado |

## Flujo del Servicio

```
┌──────────┐    POST /validations     ┌──────────┐
│  Cliente  │ ──────────────────────▶ │  Express  │
└──────────┘                          └────┬─────┘
                                           │
                                    1. Validar (zod)
                                           │
                                    2. Enriquecer
                                           │
                               ┌───────────▼───────────┐
                               │  REST Countries API    │
                               │  GET /alpha/{code}     │
                               └───────────┬───────────┘
                                           │
                                    3. Guardar
                                           │
                               ┌───────────▼───────────┐
                               │       MongoDB          │
                               │  (fuente de verdad)    │
                               └───────────┬───────────┘
                                           │
                               4. Auditar (best-effort)
                                           │
                               ┌───────────▼───────────┐
                               │   DynamoDB Local       │
                               │  (evento de auditoría) │
                               └───────────┬───────────┘
                                           │
                                    5. Responder 201
```

## Serverless Framework (Fase 2)

El servicio puede ejecutarse también como función Lambda usando Serverless Framework v3.

> **El camino principal sigue siendo `npm start`.** La opción serverless es un despliegue alternativo.

### Ejecución local con Serverless Offline

```bash
# Requiere docker compose up -d para MongoDB y DynamoDB
npm run offline
```

Esto levanta un API Gateway emulado en `http://localhost:3000` usando `serverless-offline`.


### Estructura

- `src/handler.js` — Exporta un handler Lambda que envuelve la misma app Express con `serverless-http`.
- Las conexiones a MongoDB y DynamoDB se cachean **fuera** del handler para reutilizarse entre invocaciones (warm starts).
- `serverless.yml` — Dos funciones HTTP: `POST /validations` y `GET /validations/{id}`.

## Privacidad y Seguridad

> ⚠️ El `documentNumber` es un dato sensible (número de identificación personal).

En este entorno de desarrollo se usa en texto plano. En **producción** se debería:

- **Cifrar o hashear** el `documentNumber` antes de usarlo como clave en DynamoDB y antes de escribirlo en logs.
- **Enmascarar** datos sensibles en las respuestas de logs (`pino` soporta `redact`).
- Agregar **autenticación y autorización** a los endpoints.
- Usar **cifrado en reposo** para MongoDB y DynamoDB.
