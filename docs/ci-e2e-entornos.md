# Entornos E2E y CI · 2 de octubre de 2026

## Diagnóstico

Los tres fallos se reprodujeron sobre el build de `1effb49`, sin PostgreSQL y con dos workers. No son una regresión visual del rediseño: `discovery.spec.ts`, `/consultar`, `/buscar`, `ResolutionPanel`, `legislation-data.ts` y `search/hybrid.ts` no cambiaron entre `61728b4` y `1effb49`. En `public-reading.spec.ts` el rediseño sólo adaptó el test del historial; el test de búsqueda exacta ya existía.

| Test | Precondición real | Resolver/discovery y mocks | Entorno correcto |
|---|---|---|---|
| `explains rate-limit…` | `/consultar` debe poder consultar persistencia y montar `ResolutionPanel`, sin publicación ni resolución previa para el identificador sintético | El mock de `/api/v1/resolver` representa un 503 posterior al montaje. No sustituye la comprobación server-side de `DATABASE_URL`; sin DB nunca recibe solicitudes. Discovery sólo se simula al volver a resultados. | PostgreSQL migrado/importado; no exige usuario autenticado |
| `explains source_backoff…` | La misma precondición; después el cliente debe respetar una espera de 300 s y detener el polling de 30 s | El mismo límite del mock; se mantienen las assertions de mensaje, enlace oficial, ausencia de solicitud de revisión y una sola petición | PostgreSQL migrado/importado; no exige usuario autenticado |
| `opens an already published search result…` | La Ley 19.880 debe estar importada y publicada para resolver `Ley 19.880` como referencia exacta | `findLocalExact` se ejecuta en servidor. Los mocks de discovery/resolver no generan resultados SSR. Sin DB, el buscador fixture sólo compara texto: `19.880` coincide, `Ley 19.880` no coincide con la concatenación del fixture. | PostgreSQL migrado/importado |

El error-context de los dos primeros casos mostró el aviso real: «La consulta de fuentes externas no está disponible en esta instancia». El tercero agotó el tiempo esperando un enlace que no existía. No se modificó producción para producir estados artificiales.

## Separación de suites

- Las pruebas comunes se ejecutan en ambos modos.
- `@fixture` identifica estados que requieren la instancia sin base: indisponibilidad de resolución externa, búsqueda textual del fixture y candidatos numéricos/alias sin identidad persistida.
- `@postgres` identifica resolución bajo demanda, referencias exactas persistidas, versiones sintéticas jerárquicas y operaciones privadas con sesiones Auth.js reales.
- Los proyectos se llaman `chromium-fixture` y `chromium-postgres`. `DATABASE_URL` selecciona el proyecto y sus precondiciones; no hay un segundo interruptor que pueda contradecirlo. Las pruebas del otro entorno se excluyen por tag, no se convierten en éxitos ni en skips.
- Los casos numéricos/alias que antes cambiaban de assertions mediante un `if (DATABASE_URL)` son ahora pruebas explícitas separadas. Se preservaron todas sus comprobaciones.
- El servidor E2E se inicia y termina con Playwright en `127.0.0.1:3100`, sin reutilización de servidores. Recibe `DATABASE_URL` explícita, incluso vacía, para que `.env.local` no pueda cambiar el modo. El puerto 3000 queda disponible para el piloto.
- El contexto del test sin JavaScript también recibe `baseURL`: antes apuntaba literalmente al puerto 3000 y podía probar por error otra instancia. La validación final de ambos modos incluye esta corrección.
- Las cookies privadas siguen vinculadas a `127.0.0.1`; no requieren cambiar la aplicación. El secreto de respaldo de Playwright es sólo de pruebas y nunca configura un despliegue.

El workflow conserva Node 20 como runtime del proyecto y los dos bloques E2E con `--workers=2`. Ambos declaran ahora su entorno inequívocamente. No se modificaron timeouts, retries, lógica del visor, autenticación, políticas editoriales, conectores ni dependencias.

## Reproducción

Usar una base PostgreSQL 16 local exclusiva para pruebas. Exportar `DATABASE_URL` apuntando a ella, además de un `AUTH_SECRET` de pruebas; no usar datos del piloto o de producción. Con las dependencias y Chromium instalados:

```sh
npm run db:migrate
npm run db:import
npm run db:check
npm run lint
npm test
npm run build
```

Ejecutar A con la variable vacía sólo para ese proceso; el servidor de Playwright recibe el mismo valor:

```sh
DATABASE_URL="" AUTH_TRUST_HOST="true" PLAYWRIGHT_USE_BUILD="1" \
  npm run test:e2e -- --workers=2
```

Ejecutar B conservando la `DATABASE_URL` exportada de la base migrada/importada:

```sh
AUTH_TRUST_HOST="true" PLAYWRIGHT_USE_BUILD="1" \
  npm run test:e2e -- --workers=2
```

`npm run test:e2e -- --list` muestra el conjunto elegido sin ejecutar el navegador. Los mocks sólo interceptan solicitudes del navegador. El modo conectado realiza las consultas SSR y las operaciones Auth.js contra PostgreSQL real, sin descargar normas desde BCN.

## Auditoría de dependencias

`npm audit --json` informó **6 entradas moderadas y 1 crítica**. Algunas entradas son propagación de una misma vulnerabilidad por su cadena, no siete problemas independientes. `npm ls` confirmó las siguientes versiones instaladas:

| Paquetes afectados y cadena | Uso | Corrección y compatibilidad |
|---|---|---|
| `next@16.3.5`, dependencia directa (también peer deduplicado de `next-auth`) | Runtime; crítica | Corregida en **16.3.6**; audit propone 16.3.8. Es actualización patch, sin salto mayor SemVer. Requiere validar el framework y su configuración ESLint en un cambio separado. |
| `vitest@3.2.7 → @vitest/mocker@3.2.7` | Dev-only; dos entradas moderadas | Corregida en **4.1.11** (y rama 5 estable); audit propone 5.0.3. Pasar desde 3.x implica migración mayor. |
| `drizzle-kit@0.31.10 → @esbuild-kit/esm-loader@2.6.5 → @esbuild-kit/core-utils@3.3.2 → esbuild@0.18.20` | Dev-only; cuatro entradas moderadas | El esbuild corregido empieza en **0.25.0**. La copia directa de Drizzle Kit ya es 0.25.12, pero no reemplaza la copia vulnerable anidada. Audit propone retroceder Drizzle Kit a 0.18.1 y marca el cambio como breaking; no es una actualización segura de la cadena. Hay que evaluar una versión de Drizzle Kit que elimine/actualice ese loader, sin forzar overrides a ciegas. |

La crítica de Next afecta a `next/og` con `ImageResponse` en Node y contenido SVG controlado por un atacante. No se encontraron referencias a `next/og` ni `ImageResponse` en `src`; eso limita la exposición observada, pero no elimina el aviso sobre la versión instalada. [Advisory de Next.js](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).

El aviso de Vitest describe lectura de archivos mediante mocks de redirección en servidores de desarrollo. La suite actual usa `vitest run` con entorno Node, no un servidor de mocks expuesto. [Advisory de Vitest](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).

El aviso de esbuild afecta a su servidor de desarrollo y CORS. La dependencia vulnerable permanece en las herramientas de Drizzle Kit, no en las dependencias de runtime de la aplicación. [Advisory de esbuild](https://github.com/advisories/GHSA-67mh-4wv8-2f99).

No se ejecutó `npm audit fix`, no se actualizaron dependencias y no cambió el lockfile.

## Advertencia de Node en Actions

El runtime interno de una action JavaScript es distinto de `node-version: 20`, que selecciona Node para `npm` y la aplicación. GitHub anunció que los runners ya usan Node 24 para actions y que terminó la excepción temporal para Node 20. Conviene actualizar `actions/checkout` y `actions/setup-node` a versiones compatibles con Node 24 en un cambio dedicado y comprobar sus requisitos de runner. No se mezcla aquí ese cambio ni una migración del runtime del proyecto. [Aviso oficial de GitHub](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).

## Resultados

Validación local final sobre PostgreSQL 16 en una base nueva migrada/importada, Node 24.19.0 y Chromium, sin cambiar el Node 20 del workflow:

| Comprobación | Resultado |
|---|---|
| Reproducción inicial de los tres casos en modo sin DB | Los tres fallaron con las precondiciones descritas |
| `npm run db:migrate`, `npm run db:import`, `npm run db:check` | Aprobados |
| `npm run lint` | Aprobado, repetido tras el último ajuste del test sin JavaScript |
| `npm test` | 143 pruebas aprobadas, 26 archivos, incluidas las integraciones PostgreSQL |
| `npm run build` | Build de producción y TypeScript aprobados |
| `npx tsc --noEmit` tras el ajuste final de pruebas | Aprobado |
| Escenario A, comando exacto con dos workers | **27 aprobadas, 0 fallidas, 0 omitidas**, 32,1 s |
| Escenario B, comando exacto con dos workers | **33 aprobadas, 0 fallidas, 0 omitidas**, 39,3 s |

Las dos últimas ejecuciones incluyen la corrección de `baseURL` del test sin JavaScript. Los logs locales son `/tmp/legisdata-ci-fixture-final.log` y `/tmp/legisdata-ci-postgres-final.log`; no se versionan. La verificación remota se realiza después de publicar el commit y se informa con el enlace al run y su resultado en la entrega final.

Archivos del cambio: `.github/workflows/ci.yml`, `playwright.config.ts`, `tests/e2e/discovery.spec.ts`, `tests/e2e/public-reading.spec.ts`, `tests/e2e/reader.spec.ts` y este documento. No hay cambios en `src`, `package.json`, `package-lock.json`, esquema ni migraciones.
