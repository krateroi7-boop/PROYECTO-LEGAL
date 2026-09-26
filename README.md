# Legisdata

Plataforma web de consulta de legislación chilena estructurada. El proyecto usa Next.js, TypeScript, Tailwind CSS, PostgreSQL y Drizzle ORM.

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
- `npm test`: ejecuta las pruebas unitarias con Vitest.
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

El adaptador de staging para BCN LeyChile se encuentra en `src/ingestion/sources/bcn-leychile/`. Consume la respuesta JSON estructurada de `get_norma_json`, conserva checksum, URL, fecha de captura y versión del parser, y no publica automáticamente el texto capturado. La primera norma piloto es la Ley 19.880; la publicación queda condicionada a verificar términos de uso y revisión editorial.

Para ejecutar una captura controlada:

```bash
npm run corpus:bcn:stage
```

El comando escribe en `.staging/bcn-leychile/ley-19880/` el documento original, el snapshot normalizado y el manifiesto de procedencia. Ese directorio está excluido de Git y la captura no inserta datos en PostgreSQL ni los expone en la web.

Para validar la captura y generar el estado editorial:

```bash
npm run corpus:bcn:review
```

El resultado queda en `review.json` con estado `pending_legal_review`. La aplicación no permite publicar ni importar este snapshot mientras no exista una base legal/documental verificada y aprobación editorial explícita.

El conector de fuente también dispone de operaciones controladas:

```bash
npm run source:bcn:discover
npm run source:bcn:fetch -- --norm-id 210676
npm run source:bcn:import -- --path .staging/bcn-leychile/ley-19880
npm run source:bcn:sync
```

`source:bcn:discover` no inventa un catálogo remoto: sólo usa `BCN_DISCOVERY_FILE` cuando se configura y, de lo contrario, informa que el discovery no está disponible. `source:bcn:fetch` consulta una norma concreta desde servidor y almacena el raw fuera del código fuente. `source:bcn:import` reutiliza una captura existente, crea una versión propuesta y deja el lote en `pending_review`; nunca publica automáticamente. La publicación requiere una decisión editorial posterior.

La configuración del conector usa `BCN_API_URL`, `BCN_TIMEOUT_MS`, `BCN_RETRY_COUNT`, `BCN_RETRY_BASE_DELAY_MS`, `BCN_MIN_REQUEST_INTERVAL_MS`, `BCN_MAX_REQUESTS_PER_RUN`, `BCN_USER_AGENT`, `BCN_DISCOVERY_FILE` y `LEGISDATA_STORAGE_ROOT`. La API pública de Legisdata sigue consultando PostgreSQL; no funciona como proxy de BCN.

La búsqueda persistente usa una proyección `search_documents` con `tsvector` en PostgreSQL, ranking FTS en español e índices GIN. Sin `DATABASE_URL`, `/buscar` conserva un fallback local para desarrollo.

## Cuentas

Las cuentas usan Auth.js con proveedores OIDC configurables. Define `AUTH_SECRET` y las credenciales de GitHub o Google en `.env` antes de probar `/api/auth/signin`. Favoritos y notas privadas requieren PostgreSQL y nunca forman parte del contenido jurídico público.

La administración usa roles `user`, `reviewer` y `admin`. `/admin/importaciones` exige `reviewer` o `admin`; la autorización se ejecuta en el servidor y no sólo en la interfaz. La migración de roles está en `drizzle/0007_red_stature.sql`.

## API pública

La API v1 inicial es de sólo lectura y requiere PostgreSQL configurado. Expone normas, artículos, versiones, relaciones verificadas y búsqueda:

- `/api/v1/normas`
- `/api/v1/normas/:slug`
- `/api/v1/normas/:slug/articulos/:stableKey`
- `/api/v1/normas/:slug/versiones`
- `/api/v1/normas/:slug/versiones/:versionId`
- `/api/v1/normas/:slug/relaciones`
- `/api/v1/buscar`
- `/api/health`

Las respuestas usan DTOs validados con Zod y no serializan filas Drizzle directamente. Sin `DATABASE_URL`, los endpoints API responden `503`; el fallback local sólo se mantiene para la interfaz de desarrollo. El contrato inicial está en `openapi/v1.yaml`.

Las respuestas públicas de norma y artículo incluyen `ETag` y aceptan `If-None-Match` para devolver `304 Not Modified`. Las citas estructuradas reservan los campos necesarios para enlazar una respuesta futura con norma, versión, artículo, fragmento y documento fuente.

La validación de PostgreSQL real requiere una instancia administrada o CI con PostgreSQL. El entorno actual no dispone de Docker ni de una base activa, por lo que `db:check`, `db:migrate` y `db:import` deben ejecutarse después de configurar `DATABASE_URL` en `.env`.

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
