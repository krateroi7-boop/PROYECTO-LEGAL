import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./reader.css";

/** Companion pages inherit the reader preference without changing the rest of the site. */
export async function ReaderFrame({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("reader-theme")?.value ?? "system";
  return <div className="legal-reader" data-theme={["light", "dark", "system"].includes(theme) ? theme : "system"}>{children}</div>;
}
