# Legisdata

Plataforma web de consulta de legislación chilena estructurada. El proyecto usa Next.js, TypeScript, Tailwind CSS, PostgreSQL y Drizzle ORM.

La arquitectura prioriza conectores independientes, consultas bajo demanda y almacenamiento selectivo. No requiere descargar previamente todo el corpus. El primer conector resuelve referencias exactas BCN mediante XML; la búsqueda por palabras sigue limitada al corpus publicado en Legisdata. Véase [arquitectura, capacidades y próximos hitos](docs/conectores.md).

## Desarrollo local

```bash
npm install
npm run dev
```

Sin `DATABASE_URL`, la aplicación usa el corpus curado local para desarrollo de frontend. Para levantar PostgreSQL con Docker:

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:check
npm run db:migrate
npm run db:import
npm run dev
```

Si PostgreSQL está instalado localmente y el clúster está detenido, un administrador del sistema puede iniciarlo antes de configurar `.env`:

```bash
sudo systemctl start postgresql
cp .env.example .env
npm run db:check
npm run db:migrate
npm run db:import
npm run test:integration
```

El endpoint `GET /api/health` comprueba la configuración y conectividad de PostgreSQL. Devuelve `200` sólo cuando la base responde y `503` si está sin configurar o no disponible.

La importación valida el fixture, calcula un checksum y publica el lote dentro de una transacción. Repetir el mismo fixture no duplica el lote publicado; una captura nueva del mismo `slug` crea una nueva versión y cierra la anterior.

## Scripts

- `npm run lint`: ejecuta ESLint.
- `npm test`: ejecuta las pruebas unitarias y, con `DATABASE_URL`, las de integración con Vitest.
- `npm run test:integration`: ejecuta las pruebas PostgreSQL cuando `DATABASE_URL` está configurado.
- `npm run test:e2e`: ejecuta las pruebas E2E públicas con Playwright.
- `npm run test:watch`: ejecuta Vitest en modo observación.
- `npm run build`: genera el build de producción.
- `npm run fixture:validate`: valida el fixture local con Zod.
- `npm run db:check`: comprueba la conexión definida en `DATABASE_URL`.
- `npm run db:generate`: genera una migración Drizzle.
- `npm run db:migrate`: aplica migraciones pendientes.
- `npm run db:import`: importa `fixtures/legislation/sample.json`.

## Estructura

- `src/app/`: rutas públicas y administrativas.
- `src/db/schema/`: tablas PostgreSQL y enums.
- `src/db/repositories/`: consultas tipadas.
- `src/domain/`: reglas de legislación, versionado y relaciones.
- `src/ingestion/`: importadores reproducibles.
- `src/search/`: contratos y normalización de búsqueda persistente.
- `src/api/contracts/`: contratos Zod de la API pública.
- `src/app/api/v1/`: endpoints públicos de sólo lectura.
- `openapi/v1.yaml`: contrato inicial documentado de la API.
- `src/auth/` y `src/db/schema/users.ts`: autenticación OIDC y datos personales aislados.
- `fixtures/legislation/`: corpus curado de referencia.
- `drizzle/`: migraciones generadas.

El fixture incluido es demostrativo. Antes de producción debe reemplazarse o ampliarse con datos provenientes de fuentes oficiales/autorizadas y su procedencia documentada.

## Consulta bajo demanda y revisión

Después de migrar PostgreSQL, abra `/consultar` o ejecute:

```bash
npm run source:bcn:resolve -- --reference "Ley 19.880"
npm run source:bcn:resolve -- --reference 210676
```

Web, API y CLI comparten el resolvedor XML. Una primera captura válida conserva el original en `.storage`, crea una propuesta editorial y responde `pending_review`, sin entregar texto pendiente al público. Las consultas siguientes usan caché persistente durante seis horas; al expirar se revalida con ETag/Last-Modified cuando están disponibles. Un cambio no sustituye la versión publicada hasta completar la revisión.

Configure `LEGISDATA_STORAGE_ROOT` como almacenamiento persistente y respáldelo junto con PostgreSQL. `/admin/importaciones` permite revisar contenido, diferencias y originales; `/admin/fuentes` registra la revisión de condiciones de uso. Aprobar contenido y habilitar una fuente son decisiones independientes. Sólo administradores pueden habilitar fuentes y publicar. BCN permanece bloqueada por defecto; no se ha registrado autorización de uso. La comprobación final del 27-09-2026 recuperó la Ley 19.880 por XML y creó una propuesta; hubo respuestas HTTP 401 en comprobaciones anteriores, por lo que esta prueba no garantiza disponibilidad permanente.

El adaptador JSON de `get_norma_json` se conserva como herramienta **experimental**, separada de la consulta XML. Requiere metadatos explícitos y revisión del documento completo; no implementa búsqueda remota. Para una captura controlada:

```bash
npm run corpus:bcn:stage
```

El comando imprime las rutas del original, snapshot y manifiesto en `.staging/bcn-leychile/{id}/{checksum}/{parser}/`. Ese directorio está excluido de Git. Utilice el directorio exacto devuelto en los comandos siguientes.

Para validar la captura y generar el estado editorial:

```bash
npm run corpus:bcn:review -- --path <directorio-de-captura>
```

El resultado queda en `review.json` con estado `pending_legal_review`. Importar una propuesta interna no la publica: su publicación requiere base documental de uso y aprobación editorial.

El conector de fuente también dispone de operaciones controladas:

```bash
npm run source:bcn:discover
npm run source:bcn:fetch -- --norm-id 210676
npm run source:bcn:import -- --path <directorio-de-captura>
npm run source:bcn:sync
```

`source:bcn:discover` no inventa un catálogo remoto: sólo usa `BCN_DISCOVERY_FILE` cuando se configura y, de lo contrario, informa que el discovery no está disponible. `source:bcn:fetch` consulta una norma concreta desde servidor y almacena el raw fuera del código fuente. `source:bcn:import` reutiliza una captura existente, crea una versión propuesta y deja el lote en `pending_review`; nunca publica automáticamente. La publicación requiere una decisión editorial posterior.

El conector JSON experimental usa `BCN_API_URL`, `BCN_TIMEOUT_MS`, `BCN_RETRY_COUNT`, `BCN_RETRY_BASE_DELAY_MS`, `BCN_MIN_REQUEST_INTERVAL_MS`, `BCN_MAX_REQUESTS_PER_RUN` y `BCN_DISCOVERY_FILE`. XML utiliza un endpoint HTTPS fijo, timeout de 15 segundos, máximo de 10 MiB y presupuesto compartido por fuente. Ambos admiten `BCN_USER_AGENT` y `LEGISDATA_STORAGE_ROOT`. La lectura pública sirve versiones publicadas desde PostgreSQL; el endpoint de resolución puede consultar BCN y crear propuestas.

La búsqueda persistente usa una proyección `search_documents` con `tsvector` en PostgreSQL, ranking FTS en español e índices GIN. Sin `DATABASE_URL`, `/buscar` conserva un fallback local para desarrollo.

## Cuentas

Las cuentas usan Auth.js con proveedores OIDC configurables. Define `AUTH_SECRET` y las credenciales de GitHub o Google en `.env` antes de probar `/api/auth/signin`. Favoritos y notas privadas requieren PostgreSQL y nunca forman parte del contenido jurídico público.

La administración usa roles `user`, `reviewer` y `admin`. `/admin/importaciones` exige `reviewer` o `admin`; la autorización se ejecuta en el servidor y no sólo en la interfaz. La migración de roles está en `drizzle/0007_red_stature.sql`.

## API pública

La API v1 de lectura requiere PostgreSQL configurado. Expone normas, artículos, versiones, relaciones verificadas y búsqueda:

- `/api/v1/normas`
- `/api/v1/normas/:slug`
- `/api/v1/normas/:slug/articulos/:stableKey`
- `/api/v1/normas/:slug/versiones`
- `/api/v1/normas/:slug/versiones/:versionId`
- `/api/v1/normas/:slug/relaciones`
- `/api/v1/buscar`
- `/api/v1/resolver?referencia=Ley%2019.880` (consulta fuente y puede persistir una propuesta)
- `/api/v1/fuentes` (capacidades declaradas, disponible sin PostgreSQL)
- `/api/health`

Las respuestas usan DTOs validados con Zod y no serializan filas Drizzle directamente. Sin `DATABASE_URL`, los endpoints API responden `503`; el fallback local sólo se mantiene para la interfaz de desarrollo. El contrato inicial está en `openapi/v1.yaml`.

Las respuestas públicas de norma y artículo incluyen `ETag` y aceptan `If-None-Match` para devolver `304 Not Modified`. Las citas estructuradas reservan los campos necesarios para enlazar una respuesta futura con norma, versión, artículo, fragmento y documento fuente.

Las pruebas de integración usan PostgreSQL real. Ejecute migraciones e importe el fixture en una base aislada antes de correrlas; no use una base de producción.

### Opciones para PostgreSQL

PostgreSQL es la persistencia objetivo y es necesario para validar migraciones, versionado, FTS, cuentas, favoritos, anotaciones y la API pública. No es necesario para trabajar en la UI, porque el fallback local sigue disponible.

Orden recomendado:

1. **PostgreSQL local instalado:** el entorno actual ya contiene PostgreSQL 16 y el clúster `16/main`. Un administrador debe iniciarlo:

   ```bash
   sudo systemctl start postgresql
   sudo -u postgres psql -c "CREATE USER legisdata WITH PASSWORD 'legisdata';"
   sudo -u postgres psql -c "CREATE DATABASE legisdata OWNER legisdata;"
   ```

   Después, configurar `DATABASE_URL=postgres://legisdata:legisdata@localhost:5432/legisdata` en `.env` y ejecutar `npm run db:check`, `npm run db:migrate`, `npm run db:import` y `npm run test:integration`.

2. **CI con PostgreSQL efímero:** `.github/workflows/ci.yml` ya ejecuta PostgreSQL 16 y toda la cadena de migración, importación, integración y build. Es la alternativa reproducible si no se dispone de permisos administrativos locales.

3. **PostgreSQL administrado temporal:** útil para probar desde varios equipos o un despliegue real. Debe ser una base aislada, con credenciales sólo en `.env`, SSL cuando corresponda y sin usar datos de producción para las pruebas.

Docker sigue siendo una opción cómoda, pero no es un requisito técnico del proyecto.

`npm run db:import` cierra la conexión al finalizar, tanto cuando publica un lote como cuando lo omite por idempotencia.

Para una prueba local sin permisos de administrador se puede usar una instancia temporal de PostgreSQL con los binarios instalados:

```bash
rm -rf /tmp/legisdata-pg16
mkdir -p /tmp/legisdata-pg16
/usr/lib/postgresql/16/bin/initdb -D /tmp/legisdata-pg16 --username=postgres --auth=trust --no-locale --encoding=UTF8
/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/legisdata-pg16 -o "-p 55432 -k /tmp" -l /tmp/legisdata-pg16.log start
/usr/lib/postgresql/16/bin/createdb -h /tmp -p 55432 -U postgres legisdata
DATABASE_URL=postgres://postgres@localhost:55432/legisdata npm run db:check
DATABASE_URL=postgres://postgres@localhost:55432/legisdata npm run db:migrate
DATABASE_URL=postgres://postgres@localhost:55432/legisdata npm run db:import
DATABASE_URL=postgres://postgres@localhost:55432/legisdata npm run test:integration
```

Esta base es sólo de desarrollo y debe detenerse con `/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/legisdata-pg16 stop`.
