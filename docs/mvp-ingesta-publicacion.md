# MVP: corpus público e incorporación autenticada

Implementación sobre `66c449b`, en cuatro bloques. No se habilita BCN mediante migraciones ni variables de entorno. No se han añadido conectores, billing, IA, motores de búsqueda externos o sincronización masiva.

## Frontera de acceso

- Las normas publicadas con procedencia autorizada siguen siendo públicas.
- `GET /api/v1/resolver` sólo consulta estado persistido. `not_requested` no acredita inexistencia. No escribe correlación, no recupera leases vencidos y no contacta con BCN.
- `POST` requiere cuenta Auth.js, JSON y origen coincidente. El actor siempre se obtiene de la sesión. Una publicación local se reutiliza incluso si su comprobación está vencida.
- La ficha ofrece «Incorporar y leer». Sólo esa acción hace POST. El progreso se consulta con GET durante 30 segundos; reintentar es una nueva acción explícita.
- `canRequestIngestion` admite un proveedor de entitlement sin utilizar roles editoriales como plan comercial. No se implementa billing.
- Cuotas iniciales: 10 adquisiciones/día UTC y 2/minuto; configurables mediante `LEGISDATA_INGESTION_DAILY_LIMIT` y `LEGISDATA_INGESTION_MINUTE_LIMIT`. Se registran en `audit_logs` bajo bloqueo por cuenta en la misma transacción que adquiere el lease. Hits, seguidores y sondeos no consumen cuota. Un intento iniciado que falla sí la consume.
- `LEGISDATA_DATA_MODE` es `production` por defecto. `demo` y `test` permiten fixtures explícitos. Sin DB, producción falla por indisponibilidad; nunca sirve demostraciones. Un UUID publicado sin fuente sigue oculto también en modo test.

## Representación y publicación

Migraciones `0013` y `0014`: campos opcionales de bloques/metadatos en nodos y modo/alcance de política de fuente. Los nodos anteriores conservan su lectura por `text`. Toda autorización previa queda manual.

El parser `bcn-leychile-xml-v3` conserva jerarquía, IDs originales, contenido mixto, listas, tablas y atributos estructurales. React renderiza un vocabulario cerrado sin HTML arbitrario. No descarga imágenes ni adjuntos. Imágenes, adjuntos y elementos no representados bloquean la declaración de completitud.

`import_validations` registra identidad, cobertura independiente del árbol XML, orden, padres, ciclos, contenido y fechas. XML bien formado incompatible conserva evidencia privada y lote `validation_failed`, sin versión propuesta. Los administradores pueden descargar el original y ver el informe aunque no haya norma asociada. No se puede publicar una representación incompleta simplemente aprobando el lote.

Los UUID de nodos y padres se asignan antes de insertar; lotes de 400 eliminan las actualizaciones individuales de padres. El índice usa metadatos por norma y contenido por nodo, con fragmentos máximos de 16.000 unidades UTF-16 en la proyección (sin pérdida de texto). La búsqueda pública usa sólo versiones actuales publicadas y agrupa por norma; la búsqueda por artículo agrupa por nodo. No garantiza frases que atraviesan fragmentos/artículos. Portada y resultados consultan resúmenes, sin cargar nodos completos. Las lecturas históricas usan el snapshot de metadatos de su propia representación.

`publication.ts` comparte la transacción final entre publicación humana y automática: versión actual, metadatos, índice, decisión y auditoría cambian juntos. El original se verifica fuera de esa transacción. Se revalidan checksum esperado, estado, fuente y conflictos dentro. Una promoción automática usa actor de sistema y `auto_publish_validated`; nunca inventa aprobación humana.

La automatización exige política válida, modo `auto_publish_validated`, alcance `preserve-and-redistribute-commercial-fulltext`, parser XML v3 y validación sin incidencias. Fechas futuras/regresivas, estructuras desaparecidas, propuestas humanas pendientes o rechazo impiden promoción automática. Cambiar sólo a `manual_review` conserva publicaciones. Revocar `publicationAllowed` retira lectura pública. Una caída de BCN no la retira.

Los slugs existentes se conservan. Las incorporaciones nuevas del manifiesto usan slugs humanos; otras usan título más fuente/ID. La identidad siempre es `(sourceKey, externalId)` y los alias sólo se reutilizan tras prueba documental. No se asocian fixtures ni documentos legacy por semejanza de slug/título/número.

## Operación

1. Aplicar migraciones en un entorno con backup: `npm run db:migrate`.
2. Configurar PostgreSQL, almacenamiento privado persistente `LEGISDATA_STORAGE_ROOT` y un proveedor Auth.js real. El directorio debe ser compartido si hay varias instancias.
3. Mantener la política BCN bloqueada mientras falte evidencia aplicable al XML y redistribución comercial. SPARQL no basta.
4. Inspeccionar `node --import tsx scripts/source-bcn-prewarm.ts`. Sólo `--execute` solicita las seis identidades de `config/public-corpus.json`, mediante el mismo servicio y política. Se detiene ante bloqueo, espera o indisponibilidad. Repetir es idempotente; no añade nuevas identidades al manifiesto.
5. Programar `node --import tsx scripts/source-bcn-revalidate.ts --execute` cada 15 minutos en el scheduler elegido. Sin `--execute` muestra selección sin red. Máximo 20 publicaciones vencidas; lease de ejecución de cinco minutos, presupuesto de trabajo de cuatro minutos, sin solapamiento ni discovery. Termina ante presupuesto ocupado/Retry-After. No se instaló un scheduler en este equipo.
6. `source-bcn-resolve.ts` sigue siendo una captura administrativa explícita y puede conservar evidencia privada con fuente bloqueada. El endpoint público no obtiene este privilegio.
7. Conservar backups conjuntos de PostgreSQL y originales. Probar restauración en otra base/directorio, verificar checksums y lectura antes de lanzar. No copiar la base del piloto como corpus comercial.

Las observaciones de captura y decisiones editoriales se conservan. Los eventos exclusivamente métricos se eliminan a los 30 días. No se agregan textos, consultas libres, IP o correo a métricas.

## Evidencia de Código Civil — 2026-10-03

Una única solicitud XML administrativa a `idNorma:172986`, sin reintentos, en base aislada. Política BCN ausente/bloqueada; no se publicó.

- SHA-256: `979bb1e1d0fdbe0668a86da0f2d7198d11aead9cf9528daf18fcd84afb29a969`.
- Captura: `2026-10-03T13:51:34.788Z`; 2.913.503 bytes; HTTP medido: 1.441 ms.
- 3.153 partes XML y 3.153 nodos representados; 3.153 bloques `Texto` y 3.153 representados; ningún elemento de contenido no soportado detectado.
- 2.841 artículos/disposiciones transitorias; 1.158.452 caracteres de texto; profundidad máxima 6.
- Comparación independiente con Python/ElementTree sobre todas las partes: checksum, IDs y texto de los 3.153 nodos coincidentes; cero discrepancias. Esquema declarado `1.0`.
- Primera clave: `bcn-172986-encabezado`; última: `bcn-172986-promulgacion`.
- Publicación declarada: `2000-05-30`; **versión declarada: `2222-02-02`**. Se conserva literalmente; no se interpreta como vigencia ni como fecha actual. Este hallazgo motivó la regla `future-source-version-date`, que exige revisión y bloquea promoción automática.
- El documento reúne Código Civil y otras leyes refundidas. Se conserva entero; no se recorta a la sección Civil ni se confunde con el decreto `1054426`.

La cobertura técnica no demuestra exhaustividad jurídica del servicio, vigencia, fidelidad tipográfica ni permiso de distribución. Falta aceptación editorial del alcance y de la fecha atípica, y medir lectura pública del documento real bajo una política autorizada. No se habilitó una fuente ficticia para eludir esa condición.

## Corpus y respaldo de selección

Las seis entradas del manifiesto identifican recursos; la validación XML y publicación se deciden separadamente. Para las identidades restantes se verificaron referencias oficiales: [Código de Procedimiento Civil](https://www.bcn.cl/leychile/Navegar/imprimir?idNorma=22740&idParte=8767942&idVersion=2008-08-08), [Código Penal](https://www.bcn.cl/leychile/Navegar?idNorma=1984&idParte=9672736), [Código del Trabajo](https://www.bcn.cl/leychile/Navegar?idNorma=207436&idVersion=2026-07-23). Son evidencias de identidad, no de una versión actual exhaustiva. Las identidades de leyes 19.880 y 20.285 provienen del piloto documentado.

## Activación pendiente

El lanzamiento comercial requiere evidencia de uso BCN, revisión de la fecha y alcance del Código Civil, publicación de los seis documentos completos, login/callback real y medición del lector real. La restauración conjunta fue comprobada en una segunda base temporal: checksum coincidente, 3.153 nodos conservados, versión pendiente y cero políticas BCN. Debe repetirse con los volúmenes y backups del despliegue elegido. Los comandos preparados no sustituyen estas verificaciones y no habilitan permisos automáticamente.

## Verificación de la implementación

- 172 pruebas unitarias y de integración, en 30 archivos, aprobadas con PostgreSQL aislado y un solo worker. Incluyen 100 solicitudes entre dos procesos con una adquisición, cuotas compartidas, rechazo de propietario antiguo, HTTP/almacenamiento fuera de transacciones, rollback de publicación, 304 y privacidad por fuente.
- Build de producción aprobado con `next build --webpack`, incluida comprobación TypeScript. El intento con Turbopack encontró una restricción de apertura de puertos del entorno; no se cambiaron dependencias ni el comando configurado del proyecto.
- 37 E2E aprobados sobre ese build con PostgreSQL y 27 con fixtures explícitos sin DB. La incorporación web usa respuestas controladas; la captura y publicación completas se verifican por integración con XML sintético. No equivalen a un login real del proveedor ni a publicación del Código Civil real.
- El caso de contenido mixto detectó y corrigió una búsqueda que asumía un único nodo de texto DOM. Ahora encuentra y resalta frases que atraviesan énfasis, y la copia conserva separaciones visibles. Los recorridos anteriores del lector siguen pasando.
- ESLint y `git diff --check` aprobados. Previews de precarga y mantenimiento comprobados sin red.
- Smoke del build en modo `production` sin DB: portada HTTP 500, listado de normas y estado del resolvedor HTTP 503; ninguna respuesta expone enlaces a fixtures.
- Migraciones aplicadas únicamente al PostgreSQL temporal. La base del piloto no se migró ni se convirtió en corpus comercial. Originales, backups, capturas y resultados locales permanecen fuera de Git.

Estos resultados verifican la implementación y sus contratos sintéticos. No acreditan todavía el presupuesto de rendimiento del lector sobre el Código Civil real ni la aceptación comercial del hito 4.
