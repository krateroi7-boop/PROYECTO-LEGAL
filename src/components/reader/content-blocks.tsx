import type { ContentBlock } from "@/domain/legislation/content";
import { safeContentUrl } from "@/domain/legislation/content";
/** Closed element/attribute list: source HTML is never executed. */
export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return blocks.map((block, index) => {
    if (block.kind === "text") return block.text;
    if (block.kind === "break") return <br key={index} />;
    const children = <ContentBlocks blocks={block.children} />;
    switch (block.kind) {
      case "paragraph": return <p key={index}>{children}</p>;
      case "emphasis": return <em key={index}>{children}</em>;
      case "strong": return <strong key={index}>{children}</strong>;
      case "sup": return <sup key={index}>{children}</sup>;
      case "sub": return <sub key={index}>{children}</sub>;
      case "link": return <a key={index} href={safeContentUrl(block.href ?? "")} rel="noreferrer" target="_blank">{children}</a>;
      case "list": return block.ordered ? <ol key={index}>{children}</ol> : <ul key={index}>{children}</ul>;
      case "item": return <li key={index}>{children}{"\n"}</li>;
      case "table": return <table key={index}><tbody>{children}</tbody></table>;
      case "row": return <tr key={index}>{children}</tr>;
      case "cell": return block.header ? <th key={index} colSpan={block.colspan} rowSpan={block.rowspan}>{children}{"\t"}</th> : <td key={index} colSpan={block.colspan} rowSpan={block.rowspan}>{children}{"\t"}</td>;
    }
  });
}
