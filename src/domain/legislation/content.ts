import { z } from "zod";
export type ContentBlock = { kind: "text"; text: string } | { kind: "break" } | {
  kind: "paragraph" | "emphasis" | "strong" | "sup" | "sub" | "link" | "list" | "item" | "table" | "row" | "cell";
  children: ContentBlock[]; href?: string; ordered?: boolean; header?: boolean; colspan?: number; rowspan?: number;
};
export function safeContentUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export const contentBlockSchema: z.ZodType<ContentBlock> = z.lazy(() => z.union([
  z.object({ kind: z.literal("text"), text: z.string() }), z.object({ kind: z.literal("break") }),
  z.object({ kind: z.enum(["paragraph", "emphasis", "strong", "sup", "sub", "link", "list", "item", "table", "row", "cell"]), children: z.array(contentBlockSchema), href: z.string().refine((url) => Boolean(safeContentUrl(url))).optional(), ordered: z.boolean().optional(), header: z.boolean().optional(), colspan: z.number().int().min(1).max(100).optional(), rowspan: z.number().int().min(1).max(100).optional() }),
]));
export function contentText(blocks: ContentBlock[]): string {
  return blocks.map((block) => {
    if (block.kind === "text") return block.text;
    if (block.kind === "break") return "\n";
    const inner = contentText(block.children);
    if (block.kind === "cell") return `${inner}\t`;
    if (["paragraph", "list", "item", "table", "row"].includes(block.kind)) return `\n${inner}\n`;
    return inner;
  }).join("").replace(/\r\n?/g, "\n");
}
export type ContentElement = { name: string; attributes: Record<string, string>; content: (ContentElement | string)[] };
/** Unknown elements are reported even when they contain no text (e.g. formula images). */
export function parseContent(content: (ContentElement | string)[], unsupported: Set<string>): ContentBlock[] {
  return content.flatMap((part): ContentBlock[] => {
    if (typeof part === "string") return [{ kind: "text", text: part.replace(/\r\n?/g, "\n") }];
    const tag = part.name.toLowerCase();
    const representedAttributes = tag === "a" ? ["href"] : ["td", "th"].includes(tag) ? ["colspan", "rowspan"] : [];
    for (const attribute of Object.keys(part.attributes)) if (!attribute.startsWith("xmlns") && !representedAttributes.includes(attribute)) unsupported.add(`unsupported-content-attribute:${part.name}.${attribute}`);
    if (part.name === "ArchivoBinario") {
      unsupported.add("ArchivoBinario");
      const name = part.content.find((entry) => typeof entry !== "string" && entry.name === "Nombre");
      const label = name && typeof name !== "string" ? name.content.filter((entry) => typeof entry === "string").join("").trim() : "";
      return [{ kind: "text", text: `[Archivo adjunto${label ? `: ${label}` : ""}]` }];
    }
    if (tag === "br") return [{ kind: "break" }];
    const mapping = { p: "paragraph", div: "paragraph", em: "emphasis", i: "emphasis", strong: "strong", b: "strong", sup: "sup", sub: "sub", a: "link", ol: "list", ul: "list", li: "item", table: "table", tr: "row", td: "cell", th: "cell" } as const;
    const children = parseContent(part.content, unsupported);
    const significant = children.filter((child) => child.kind !== "text" || child.text.trim());
    const only = (kinds: string[]) => significant.every((child) => kinds.includes(child.kind));
    if ((["ol", "ul"].includes(tag) && !only(["item"])) || (["table", "tbody", "thead", "tfoot"].includes(tag) && !only(["row"])) || (tag === "tr" && !only(["cell"]))) unsupported.add("invalid-content-nesting");
    if (["p", "a", "em", "i", "b", "strong", "sup", "sub"].includes(tag) && !only(["text", "break", "emphasis", "strong", "sup", "sub", "link"])) unsupported.add("invalid-inline-nesting");
    if (["tbody", "thead", "tfoot", "span"].includes(tag)) return children;
    if (!(tag in mapping)) { unsupported.add(part.name); return children; }
    const kind = mapping[tag as keyof typeof mapping];
    const block: ContentBlock = { kind, children };
    if (kind === "link") {
      const href = safeContentUrl(part.attributes.href ?? "");
      if (!href) unsupported.add("unsafe-or-relative-link"); else block.href = href;
    }
    if (kind === "list") block.ordered = tag === "ol";
    if (kind === "cell") {
      block.header = tag === "th";
      for (const attribute of ["colspan", "rowspan"] as const) if (part.attributes[attribute]) {
        const value = Number(part.attributes[attribute]);
        if (Number.isInteger(value) && value >= 1 && value <= 100) block[attribute] = value; else unsupported.add(`invalid-${attribute}`);
      }
    }
    return [block];
  });
}
