import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { status: "unhealthy", database: "unconfigured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json(
      { status: "ok", database: "ok" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unhealthy", database: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
