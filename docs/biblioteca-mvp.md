# Biblioteca pública del MVP

La portada presenta la selección editorial de `config/public-corpus.json`, con prioridad para Código Civil, Código de Procedimiento Civil, Código Penal y Código del Trabajo. Una entrada es un objetivo de catálogo, no un permiso ni una publicación. No contiene texto jurídico generado ni recortes de fixtures. No se muestran conteos de artículos sobre entradas pendientes.

La disponibilidad se obtiene de identidades verificadas `(sourceKey, externalId)` y versiones actuales que superan la misma visibilidad pública del lector/API. Sólo esas entradas tienen enlaces `/normas/<slug>`. Los slugs existentes se conservan. No se une contenido por título o número semejante.

La búsqueda presenta el nombre común del catálogo cuando la identidad coincide. El título oficial sigue visible como identificación secundaria. Una referencia encontrada sin texto público muestra «Encontrada, pendiente de incorporación» y su fuente oficial. Con una fuente bloqueada no se invita a iniciar una captura ni se obliga a visitar `/consultar`. La ruta sigue mostrando un mensaje de disponibilidad comprensible; GET conserva su contrato sin adquisición.

Las fixtures continúan restringidas a `demo` y `test` explícitos. La ejecución normal es `production`, también para desarrollar la biblioteca real. La portada puede mostrar la selección editorial si PostgreSQL está caído o no configurado, pero nunca atribuye disponibilidad de texto en ese caso. La búsqueda informa de indisponibilidad y no ofrece fixtures de sustitución.

## Incorporar textos cuando exista respaldo válido

1. Registrar una política de fuente con evidencia aplicable a conservación y redistribución de texto completo, responsable y fecha revisada. No reutilizar los términos SPARQL como permiso XML.
2. Aplicar las migraciones existentes, disponer de PostgreSQL y originales privados persistentes y verificar login/callback del proveedor. Respaldar DB y originales juntos.
3. Inspeccionar el manifiesto finito: Código Civil `172986`, Procedimiento Civil `22740`, Penal `1984`, Trabajo `207436`, leyes `210676` y `276363`. Sus nombres y slugs son selección editorial; no certifican completitud o vigencia.
4. Ejecutar primero el preview `node --import tsx scripts/source-bcn-prewarm.ts`. Con respaldo registrado, `--execute` utiliza el pipeline existente: original, checksum, parser, cobertura, identidad, conflictos y publicación o revisión. Se detiene ante bloqueo/espera/error. No hacer sincronización masiva.
5. Revisar fecha y alcance del XML del Código Civil, incluido el hallazgo `2222-02-02`. No eliminar piezas normativas ni forzar promoción automática. Una aprobación no subsana una extracción incompleta.
6. Verificar apertura pública, estructura completa, versiones, búsqueda interna, copia y disponibilidad con BCN desconectada. Programar el mantenimiento acotado ya documentado en `mvp-ingesta-publicacion.md`.

Al publicarse una identidad autorizada, catálogo y búsqueda cambian automáticamente a lectura directa sin modificar UI o pipeline. Para otra fuente con derechos verificados, registrar su conector independiente y sus identidades oficiales en la selección editorial; la proyección de catálogo consulta la identidad fuente/ID, no nombres similares. No se implementaron otros conectores en este hito.

El estado de referencia encontrada y texto pendiente es una preparación profesional del catálogo, no equivale al corpus comercial completo. BCN sigue bloqueada: este cambio visual no concede derechos ni publica propuestas privadas.

## Verificación del hito visual

Lint y build de producción aprobados; 176 pruebas unitarias/integración, 40 E2E conectados a PostgreSQL/Auth y 29 E2E con fixtures explícitas aprobados. Se revisaron portada, búsqueda, ficha bloqueada y lector en escritorio y móvil; también se comprobó ausencia de overflow a 320 px. El lector se revisó con una publicación de demostración en una instancia separada explícitamente `demo`, sin incorporarla al catálogo normal.

La consulta pequeña en vivo de Código Civil devolvió metadatos de `172986`, mostrados con el nombre común y el título oficial secundario. Esa búsqueda no descargó XML ni habilitó su publicación. La instancia normal permanece en `production`, con PostgreSQL y BCN sin autorización de distribución.
