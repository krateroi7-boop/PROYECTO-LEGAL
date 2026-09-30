export type TextMatch = { start: number; end: number };

export function yieldReaderWork(): Promise<void> {
  const scheduler = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Offsets refer to the original UTF-16 text, including combining marks. */
export function foldText(text: string) {
  let folded = "";
  const starts: number[] = [], ends: number[] = [];
  let offset = 0;
  for (const character of text) {
    const end = offset + character.length;
    const normalized = character.charCodeAt(0) < 128 ? character.toLowerCase() : character.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (!normalized && ends.length) ends[ends.length - 1] = end;
    for (let i = 0; i < normalized.length; i++) { starts.push(offset); ends.push(end); }
    folded += normalized;
    offset = end;
  }
  return { folded, starts, ends };
}

export function findTextMatches(text: string, query: string): TextMatch[] {
  return findFoldedMatches(text, foldText(query.trim()).folded);
}

function findFoldedMatches(text: string, needle: string): TextMatch[] {
  if (!needle) return [];
  // Latin-1 and common punctuation preserve UTF-16 widths when accents are removed.
  // Avoid two offset arrays and per-character normalization for ordinary Spanish text.
  if (/^[\u0000-\u00ff\u2000-\u206f]*$/.test(text)) {
    const folded = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const matches: TextMatch[] = [];
    let index = folded.indexOf(needle);
    while (index !== -1) { matches.push({ start: index, end: index + needle.length }); index = folded.indexOf(needle, index + needle.length); }
    return matches;
  }
  const { folded, starts, ends } = foldText(text);
  const matches: TextMatch[] = [];
  let index = folded.indexOf(needle);
  while (index !== -1) {
    matches.push({ start: starts[index], end: ends[index + needle.length - 1] });
    index = folded.indexOf(needle, index + needle.length);
  }
  return matches;
}

/** Search long blocks in overlapping windows; yield between bounded work slices. */
export async function searchBlocks<T>(blocks: { value: T; text: string }[], query: string, signal: AbortSignal, onSlice?: (ms: number) => void) {
  const result: { value: T; matches: TextMatch[] }[] = [];
  const needle = foldText(query.trim()).folded;
  if (!needle) return result;
  const size = 4096, overlap = Math.max(query.length * 3, 64);
  let slice = performance.now();
  for (const block of blocks) {
    const matches: TextMatch[] = [];
    for (let start = 0; start < block.text.length; start += size) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const offset = Math.max(start, matches.at(-1)?.end ?? 0);
      const part = block.text.slice(offset, start + size + overlap);
      for (const match of findFoldedMatches(part, needle)) if (offset + match.start < start + size) matches.push({ start: offset + match.start, end: offset + match.end });
      if (performance.now() - slice > 8) {
        onSlice?.(performance.now() - slice);
        await yieldReaderWork();
        slice = performance.now();
      }
    }
    if (matches.length) result.push({ value: block.value, matches });
  }
  onSlice?.(performance.now() - slice);
  return result;
}
