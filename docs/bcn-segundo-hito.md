# BCN: descubrimiento y resolución bajo demanda

El hito añade descubrimiento selectivo sobre el primer conector XML, sin reconstruir parser, normalización, evidencia ni flujo editorial. Su activación no modifica permisos de publicación de BCN.

El [piloto funcional del 29-09-2026](piloto-bcn-2026-09-29.md) documenta las comprobaciones reales posteriores, las incidencias de disponibilidad y los ajustes del recorrido de búsqueda. La entrada humana de `/consultar` se unificó con `/buscar`; las referencias técnicas siguen abriendo la ficha correspondiente.

## Activación y reversión operativa

1. Respaldar PostgreSQL y el almacenamiento duradero de originales.
2. Aplicar `npm run db:migrate`, incluida la migración aditiva 0012. Las filas antiguas de caché y observaciones quedan con operación `resolve`.
3. Ejecutar pruebas contra una base aislada; construir y comprobar la aplicación.
4. Activar `BCN_DISCOVERY_ENABLED=true` en el entorno del piloto. Por defecto es `false`.
5. Para detener discovery, volver a `false`: búsqueda local, publicaciones, propuestas y resolución exacta permanecen disponibles. No revertir tablas ni borrar evidencia.

CLI de archivo: `npm run source:bcn:discover`. CLI remota: `npm run source:bcn:discover -- --remote --query 'Ley 19.880'`. No hay paginación automática ni sincronización masiva.

## Flujo y contratos

`LegalDiscoveryConnector.discover()` sólo devuelve candidatos de metadatos. `LegalSourceConnector` sigue recuperando un documento concreto. `/buscar` presenta publicaciones locales y solicita candidatos mediante una petición independiente. Abrir un candidato inicia resolución; listar candidatos no consulta XML. Un enlace local se añade exclusivamente mediante identidad externa verificada.

La entrada humana `q` interpreta un número aislado como número de ley; el parámetro `referencia`, API y CLI existentes conservan su contrato técnico. Las nuevas referencias de candidatos son explícitas, por ejemplo `idNorma:210676`. El alias versionado “Ley de transparencia” significa Ley 20.285 como ayuda de búsqueda propia; no cambia el título oficial.

Los campos ausentes permanecen ausentes. Los campos contradictorios no se completan por inferencia. Una URI RDF no reemplaza `bcn:leychileCode`; un candidato sin identificador válido no puede resolverse. `match` es calculado por Legisdata. Los candidatos conservan endpoint, fecha de consulta y versión del adaptador. Los enlaces de navegación se construyen por el conector y no se presentan como campos recibidos del dataset.

`available`, `empty`, `unavailable` e `in_progress` distinguen resultados de discovery. Una lista vacía no acredita inexistencia. En resolución, `resolving` entrega HTTP 202 y `Retry-After`: otra solicitud tiene la reserva. `pending_review` también usa 202, pero significa que ya existe una captura editorial. La interfaz sondea como máximo 30 segundos y ofrece reintentar.

## Transacciones y persistencia

1. Transacción breve: caché, presupuesto y reserva PostgreSQL por operación/referencia y proveedor. Se vuelve a comprobar la caché después de adquirir la reserva.
2. Sin transacción: HTTP, validación, normalización y escritura del original inmutable.
3. Transacción breve: bloquear y comprobar propietario y vencimiento, persistir idempotentemente, registrar observaciones y actualizar caché. Liberación por propietario al terminar.

La reserva dura 30 segundos, XML permite 15 segundos y SPARQL ocho. Se comparte el presupuesto del proveedor entre discovery y XML. Los errores transitorios imponen al menos 30 segundos de espera y respetan `Retry-After`. Si el proceso cae, la reserva expira. Si otro proceso la sustituye, la respuesta antigua no puede escribir datos documentales. Un original escrito antes de perder una reserva puede quedar sin referencia; no se elimina automáticamente como parte de limpieza temporal.

| Operación | Positiva | Negativa | Ventana máxima desde la comprobación para metadatos desactualizados |
| --- | --- | --- | --- |
| XML `resolve` | 6 horas | 1 minuto | Se conserva la publicación previa y su fecha de comprobación |
| Texto `discover` | 1 hora | 5 minutos | 24 horas |
| Identidad `metadata` | 24 horas | 5 minutos | 7 días |

Las claves de discovery incluyen fuente, operación, estrategia versionada y hash de consulta normalizada/filtros. No contienen consulta libre legible. No se cachea timeout como ausencia. No se conserva un resultado negativo vencido para afirmar inexistencia. Las identidades y alias demostrados por XML comparten la representación y su revalidación.

## Editorial y privacidad

La ficha pendiente expone una lista limitada de metadatos, fecha, enlace oficial y solicitud de revisión. No serializa `SourceDocument`, nodos ni original. Los controles públicos existentes siguen excluyendo versiones no publicadas o fuentes bloqueadas, incluso por UUID.

Auth.js autentica la solicitud en servidor. Hay unicidad por usuario/lote y un máximo de cinco nuevas solicitudes en una ventana móvil de 24 horas, serializado en PostgreSQL. Repetir una solicitud no consume cuota. “Mis solicitudes” deriva su estado del lote. Administración muestra número de solicitantes y fecha más antigua. Solicitar no aprueba, no habilita una fuente, no promete plazo ni genera notificaciones externas.

## Métricas y retención

`/admin/fuentes` agrega los últimos 30 días desde PostgreSQL: hit/(hit+miss) separado por operación, negativos y desactualizados aparte, solicitudes reales, duración HTTP, estados de error/304, cambios de representación y antigüedad de propuestas. Un checksum distinto no se considera automáticamente cambio jurídico.

Cada respuesta de discovery recibe un identificador opaco del servidor. Sólo una selección de un identificador incluido en ese evento cuenta como conversión; repeticiones no aumentan el numerador. No se registran consultas libres, texto, correo ni IP en estas métricas. El limitador HTTP por cliente existente permanece separado y local al proceso; no es un límite distribuido.

`npm run source:cleanup` elimina eventos exclusivamente métricos de más de 30 días, negativos vencidos sin documento, metadatos fuera de su ventana y reservas vencidas. Conserva observaciones de resolución, decisiones editoriales, originales, propuestas, publicaciones y referencias personales. Debe programarse externamente para ejecutar retención periódica; no se añade un trabajador residente.

## Evidencia previa de SPARQL

El estudio aprobado hizo 18 consultas pequeñas: 14 respuestas HTTP 200 y cuatro timeouts de ocho/diez segundos; no descargó textos jurídicos. Los éxitos tardaron aproximadamente 0,18–6,98 segundos. Esta implementación utiliza pruebas deterministas; esa muestra previa no certifica disponibilidad futura.

| Consulta/estrategia | Resultado observado |
| --- | --- |
| `bcn:hasNumber "19880"^^xsd:string` | Ley 19.880, `leychileCode=210676`; el literal sin tipo dio vacío |
| Número 20285 / 21719 | Identificadores 276363 / 1209272 |
| Título: acceso a la información pública | Incluyó Ley 20.285 y otras normas |
| Materia `http://datos.bcn.cl/recurso/tema/procedimiento-administrativo` y tipo Ley | Incluyó Ley 19.880 |
| Materia `http://datos.bcn.cl/recurso/tema/transparencia-de-la-funcion-publica` | Incluyó Ley 20.285; buscar “transparencia” sólo en título no bastó |
| Tipo y organismo | URI tipo `http://datos.bcn.cl/recurso/cl/norma/tipo#ley`, nombre y etiquetas de organismo |
| `isModifiedBy`, `hasVersion` | Relaciones y versiones antiguas; no historial completo ni prueba de vigencia |
| Número de control inexistente | Vacío después de un primer timeout |

Las consultas usan `RootNorm`, literales tipados y límites de diez recursos/100 filas ampliadas/512 KiB. No se aceptan consultas SPARQL del usuario. El código de consultas parametrizadas está en `src/sources/bcn-discovery.ts`; los ejemplos y variaciones RDF están cubiertos en `tests/unit/bcn-sparql.test.ts`.

Fuentes del estudio: [consultas SPARQL](https://datos.bcn.cl/es/documentacion/consultas-sparql), [modelo de normas](https://datos.bcn.cl/es/documentacion/normas), [dataset](https://datos.bcn.cl/es/documentacion/conjunto-de-datos), [términos específicos](https://datos.bcn.cl/es/terminos-de-uso/). La documentación declara actualización diaria, no comprobada por la muestra. Los términos del portal de datos permiten reutilización comercial y excluyen garantías de continuidad; ese alcance para metadatos **no habilita automáticamente el texto XML de LeyChile**.

No se importan relaciones como verificadas, otras fuentes, embeddings ni índices externos. Los futuros conectores deberán declarar separadamente búsqueda, documento, metadatos, versiones y relaciones, con identificadores y condiciones propios.

## Verificación de implementación (28-09-2026)

- Migración 0012 aplicada sobre PostgreSQL 16 aislado con los datos del primer hito; 131 pruebas unitarias/de integración aprobadas. Incluyen dos procesos Node independientes, recuperación de reserva vencida, rechazo del propietario antiguo, ausencia de transacción durante HTTP/escritura, TTL separados, cuota concurrente y conversión única.
- Comprobación real separada de CI: discovery remoto de `Ley 19.880` obtuvo `210676`, título, fecha y organismo; repetir la consulta devolvió `cache: hit`. No descargó XML ni creó una propuesta. El modo CLI de archivo conserva su respuesta anterior cuando no hay archivo configurado.
- Las pruebas de navegador usan respuestas remotas deterministas. La sesión autenticada se crea en PostgreSQL para comprobar Auth.js y la acción de revisión sin proveedores OIDC externos. La prueba detectó y corrigió la configuración previa del adaptador, que no apuntaba a las tablas `users`, `accounts`, `sessions` y `verification_tokens` del proyecto.
- Build de producción, TypeScript, ESLint y validación del fixture aprobados. La suite Chromium contiene 17 escenarios: 16 aprobados sin PostgreSQL y 16 con PostgreSQL, con una omisión específica por configuración; entre ambas ejecuciones quedan cubiertos los 17. Se conservaron los diez escenarios anteriores. El recorrido autenticado incluye selección, solicitud, consulta del estado y comprobación de que la norma continúa fuera de la API pública.
- Turbopack requirió limpiar su caché después de un fallo de permisos de sockets del entorno de ejecución. El build final usó el compilador predeterminado y pasó; no se cambió la configuración de la aplicación para sortear la prueba. En esta máquina la ejecución final con PostgreSQL usó un solo worker de navegador por carga de E/S; CI mantiene dos.
- El piloto permanece desactivado por defecto; la comprobación real sólo activó la variable para esos dos procesos CLI. La política de publicación XML de BCN no fue habilitada.
