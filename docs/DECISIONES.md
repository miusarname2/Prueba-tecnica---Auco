# Decisiones de Diseño

## 1. Llaves de DynamoDB para Auditoría

**Partition Key (PK):** `documentNumber` (String)
**Sort Key (SK):** `eventKey` con formato `<ISO 8601>#<validationId>`

### Justificación

- **Historial por documento:** al usar `documentNumber` como PK, todas las validaciones de un mismo documento quedan agrupadas bajo la misma partición. Esto permite consultar eficientemente el historial completo de un documento con una sola query.
- **Orden cronológico:** el SK comienza con el timestamp ISO 8601, que se ordena lexicográficamente de forma natural. Así, los eventos se ordenan cronológicamente al hacer queries con `ScanIndexForward`.
- **Sin colisiones:** al concatenar `#validationId` al timestamp, se garantiza que dos validaciones del mismo documento en el mismo instante tengan sort keys distintos (el `_id` de MongoDB es único).
- **Consultas eficientes:** se puede filtrar por rango de fechas usando `BETWEEN` sobre el SK.

## 2. Política de Fallo de Auditoría

**Decisión:** si DynamoDB falla DESPUÉS de guardar en MongoDB, el registro de Mongo se conserva y se responde `201` al cliente.

## 3. Timeout y Reintentos de la API Externa

- **Timeout:** configurable via `EXTERNAL_API_TIMEOUT_MS` (default 5000ms), implementado con `AbortController`.
- **Reintentos:** hasta `EXTERNAL_API_RETRIES` reintentos adicionales (default 1), solo ante errores de red, timeout o respuestas 5xx.
- **Sin reintentos en 4xx:** los errores del cliente no se reintentan porque probablemente son permanentes.
- **Espera entre reintentos:** 300ms fijos (suficiente para un fallo transitorio).

## 4. Protección de Datos Sensibles (PII)

**Decisión:** el `documentNumber` se hashea con **SHA-256** antes de almacenarse como clave de partición en DynamoDB y antes de registrarse en cualquier log de auditoría.

### Justificación

- **Principio de minimización de datos:** solo se conserva el hash irreversible en la tabla de auditoría. MongoDB mantiene el valor original porque es necesario para la lógica de negocio.
- **Cumplimiento regulatorio:** el hash protege el dato sensible en caso de acceso no autorizado a la tabla de auditoría (DynamoDB).
- **Redacción en logs:** se configura `pino` con la opción `redact` para sustituir `req.body.documentNumber` por `[REDACTED]` en los logs HTTP.
- **Reversibilidad controlada:** como SHA-256 es determinista, se puede verificar si un documento concreto tiene eventos haciendo `hashDocument(doc)` y consultando DynamoDB con ese hash.

## 5. Registro de Eventos de Fallo en Auditoría

**Decisión:** cuando falla el enriquecimiento (`ENRICHMENT_FAILED`) o la escritura a MongoDB (`MONGO_WRITE_FAILED`), se registra un evento de fallo en DynamoDB antes de propagar la excepción.

### Justificación

- **Trazabilidad completa:** no solo se registran los éxitos, también los intentos fallidos. Esto permite detectar patrones de error (ej.: API caída, MongoDB saturado).
- **Best-effort en fallos:** si la escritura del evento de fallo a DynamoDB también falla, se loguea el error pero no se enmascara la excepción original.
- **Campos adicionales:** los eventos de fallo incluyen `errorCode` y `errorMessage` para facilitar el diagnóstico sin necesidad de cruzar con logs de aplicación.

## 6. Mejoras Futuras

- **Cola o patrón Outbox para auditoría:** reemplazar la escritura directa a DynamoDB por un patrón Outbox (escribir evento en Mongo en la misma transacción, luego un worker lo replica a DynamoDB) para garantizar consistencia eventual sin perder eventos.
- **Backoff exponencial:** reemplazar la espera fija de 300ms por backoff exponencial con jitter para evitar thundering herd.
- **Rate limiting:** agregar rate limiting (por IP o por documento) para proteger contra abuso.
- **CI/CD:** pipeline de integración continua que ejecute tests unitarios e integración con Docker Compose.
- **Observabilidad:** métricas (Prometheus/CloudWatch), trazas distribuidas (OpenTelemetry), alertas sobre fallos de auditoría.
- **TypeScript:** migrar a TypeScript para mayor seguridad de tipos en el desarrollo.
- **Cifrado con KMS:** reemplazar el hash SHA-256 por cifrado simétrico con AWS KMS para permitir descifrado cuando sea necesario (ej.: derecho al olvido GDPR).
- **Cifrado a nivel de campo en MongoDB:** usar Client-Side Field Level Encryption (CSFLE) de MongoDB para cifrar el `documentNumber` también en la base de datos principal.
- **Política de retención de auditoría:** configurar TTL en DynamoDB para eliminar automáticamente eventos antiguos según la política de retención de datos.
- **Dead Letter Queue (DLQ):** enviar los eventos de auditoría fallidos a una cola SQS DLQ para re-procesamiento posterior, en lugar de solo loguearlo.
