import { fixturesAllowed } from "@/lib/data-mode";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { normVersions } from "@/db/schema/legislation";

// Match sourcePolicyKey in ingestion/editorial/source-policy.ts, including
// captures made before explicit connector keys were introduced.
export function publicSourceCondition(sourceDocumentId: AnyPgColumn): SQL {
  return sql`(${sourceDocumentId} is not null and exists (
    select 1 from source_documents visibility_source
    left join source_policies visibility_policy on visibility_policy.source_key =
      coalesce(visibility_source.source_key,
        case when visibility_source.source_name = 'BCN LeyChile' then 'bcn-leychile' end)
    where visibility_source.id = ${sourceDocumentId}
      and (
        (${fixturesAllowed()} and visibility_source.source_key is null and visibility_source.source_name <> 'BCN LeyChile' and visibility_source.parser = 'local-fixture-v1')
        or (
          visibility_source.parser <> 'local-fixture-v1'
          and visibility_source.parser not like 'bcn-leychile-json-%'
          and visibility_policy.publication_allowed = true
          and visibility_policy.evidence_url ~ '^https?://[^[:space:]/?#]+([/?#].*)?$'
          and visibility_policy.reviewed_at is not null
          and visibility_policy.reviewed_at <= now()
          and nullif(btrim(visibility_policy.reviewed_by), '') is not null
        )
      )
  ))`;
}

export function publicVersionCondition(version: {
  publicationStatus: AnyPgColumn;
  sourceDocumentId: AnyPgColumn;
} = normVersions): SQL {
  return and(eq(version.publicationStatus, "published"), publicSourceCondition(version.sourceDocumentId))!;
}
