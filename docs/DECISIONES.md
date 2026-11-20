# Decisiones de diseño

## Llaves de DynamoDB

- **Partition key:** el documento (`documentNumber`, hasheado, ver más abajo).
- **Sort key:** `<fecha ISO>#<id de la validación>`.

Elegí el documento como partition key porque la pregunta natural sobre una auditoría es "¿qué validaciones ha tenido este documento?", y así se responde con una sola query. La fecha va primero en la sort key porque el formato ISO se ordena bien como texto, y eso me da el historial en orden cronológico (y rangos de fechas con `BETWEEN`). Le agregué el id de la validación al final para que dos eventos del mismo documento en el mismo instante no se pisen.

## Si DynamoDB falla después de guardar en Mongo

Dejo el registro en Mongo, registro el error en logs y respondo 201. Mongo es la fuente de verdad y no quería que el cliente viera un error por un problema de la auditoría. El costo es que podría quedar una validación sin evento. Con más tiempo lo resolvería con una cola o un outbox.

## Timeout y reintentos con la API externa

Timeout de 5 s (configurable) y un reintento de 300 ms, solo ante errores de red, timeout o 5xx. En 4xx no reintento porque el resultado no va a cambiar. Si la API sigue fallando, respondo 502 (error de la API) o 504 (timeout) y no guardo nada.

## País opcional

Además de nombre y documento acepté un `countryCode` opcional (por defecto `CO`), para que el enriquecimiento no sea siempre idéntico. Se valida como código de 2 letras y se pasa a mayúsculas.

## Datos sensibles

El documento es un dato sensible, así que en DynamoDB y en los logs no lo guardo en claro: uso SHA-256 en la tabla de auditoría y `redact` de pino en los logs. Es una mitigación básica, no una solución completa: como los documentos tienen un espacio de valores pequeño, alguien con acceso a la tabla podría probarlos todos. En producción usaría HMAC con un secreto o KMS. En Mongo el documento sigue en claro porque el negocio lo necesita.

## Qué mejoraría con más tiempo

- Outbox o cola para la auditoría, para no perder eventos si Dynamo falla.
- Backoff exponencial en los reintentos.
- Cifrar el documento (KMS) en vez de solo hashearlo.
- Rate limiting y CI que corra los tests con Docker.
- Métricas y alertas sobre fallos de auditoría.