/** 右键复制的三种块引用。 */

export type BlockLinkMode = "link" | "embed" | "alias";

export type BlockKind =
    | "paragraph"
    | "heading"
    | "list"
    | "quote"
    | "code"
    | "math"
    | "table"
    | "hr"
    | "html"
    | "id";

export interface BlockTarget {
    kind: BlockKind;
    start: number;
    end: number;
    /** 这一块已经有的块 ID；没有则为 null */
    id: string | null;
    /**
     * 还没有块 ID 时写到哪里。
     * inline：加在该行行尾；after：在该行下一行单独放 `^id`
     */
    write: { mode: "inline" | "after"; line: number } | null;
}

export type ResolveResult =
    | { ok: true; target: BlockTarget }
    | { ok: false; reason: "empty" | "yaml" };

export interface PosLike {
    start: { line: number; col: number };
    end: { line: number; col: number };
}

export interface CacheLike {
    sections?: Array<{ type: string; position: PosLike }>;
    listItems?: Array<{ position: PosLike }>;
}

const BLOCK_ID_ONLY_RE = /^\^([A-Za-z0-9-]+)$/;
const BLOCK_ID_END_RE = /(?:^|\s)\^([A-Za-z0-9-]+)$/;
const HEADING_RE = /^#{1,6}(?:\s|$)/;
const LIST_RE = /^(\s*)(?:[-+*]|\d+[.)])\s+/;
const QUOTE_RE = /^\s*>/;
const FENCE_RE = /^\s*(```|~~~)/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const MATH_DELIM_RE = /^\s*\$\$\s*$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function blockIdAtEnd(line: string): string | null {
    const trimmed = line.replace(/\s+$/, "");
    const only = trimmed.match(BLOCK_ID_ONLY_RE);
    if (only) return only[1];
    const inline = trimmed.match(BLOCK_ID_END_RE);
    return inline ? inline[1] : null;
}

export function isOnlyBlockId(line: string): boolean {
    return BLOCK_ID_ONLY_RE.test(line.trim());
}

export function lineWithBlockId(line: string, id: string): string {
    return `${line.replace(/\s+$/, "")} ^${id}`;
}

export function formatBlockLink(
    note: string,
    blockId: string,
    mode: BlockLinkMode,
    alias = ""
): string {
    const target = `${escapeWikiPath(note)}#^${blockId}`;
    if (mode === "embed") return `![[${target}]]`;
    if (mode === "alias") return `[[${target}|${escapeWikiAlias(alias)}]]`;
    return `[[${target}]]`;
}

export function collectBlockIds(lines: string[]): Set<string> {
    const ids = new Set<string>();
    for (const line of lines) {
        const id = blockIdAtEnd(line);
        if (id) ids.add(id);
    }
    return ids;
}

export function createBlockId(used: Set<string>): string {
    for (let attempt = 0; attempt < 40; attempt++) {
        let id = ID_ALPHABET[Math.floor(Math.random() * 26)];
        for (let i = 1; i < 6; i++) {
            id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
        }
        if (!used.has(id)) return id;
    }
    let extra = `b${Date.now().toString(36)}`;
    while (used.has(extra)) extra += "x";
    return extra;
}

export function resolveBlock(lines: string[], line: number, cache: CacheLike | null): ResolveResult {
    if (line < 0 || line >= lines.length) return { ok: false, reason: "empty" };

    if (inClosedFrontmatter(lines, line)) return { ok: false, reason: "yaml" };
    if (cache && sectionContains(cache, line, (type) => type === "yaml" || type === "frontmatter")) {
        return { ok: false, reason: "yaml" };
    }

    const text = lines[line] ?? "";
    // 围栏代码和公式里单独一行的 ^id 是正文，不是块锚点。
    const insideLiteralBlock =
        fenceRangeContaining(lines, line) !== null || mathRangeContaining(lines, line) !== null;
    if (!insideLiteralBlock && isOnlyBlockId(text)) {
        return {
            ok: true,
            target: {
                kind: "id",
                start: line,
                end: line,
                id: blockIdAtEnd(text),
                write: null,
            },
        };
    }

    if (text.trim() === "") {
        const around = blockAroundBlankLine(lines, line, cache);
        if (!around) return { ok: false, reason: "empty" };
        return { ok: true, target: around };
    }

    const fromCache = cache ? locateFromCache(lines, line, cache) : null;
    if (fromCache) return { ok: true, target: fromCache };

    const manual = locateManual(lines, line);
    if (!manual) return { ok: false, reason: "empty" };
    return { ok: true, target: manual };
}

function escapeWikiPath(note: string): string {
    return note.replace(/\|/g, "\\|").replace(/\]/g, "\\]");
}

function escapeWikiAlias(alias: string): string {
    return alias.replace(/\|/g, "\\|").replace(/\]/g, "\\]");
}

function contentEndLine(pos: PosLike): number {
    let end = pos.end.line;
    if (pos.end.col === 0 && end > pos.start.line) end -= 1;
    return end;
}

function containsLine(pos: PosLike, line: number): boolean {
    const end = contentEndLine(pos);
    return line >= pos.start.line && line <= Math.max(pos.start.line, end);
}

function spanWeight(pos: PosLike): number {
    const end = Math.max(pos.start.line, contentEndLine(pos));
    return (end - pos.start.line) * 10000 + Math.max(0, pos.end.col);
}

function sectionContains(cache: CacheLike, line: number, accept: (type: string) => boolean): boolean {
    return (cache.sections ?? []).some(
        (section) => accept(section.type) && containsLine(section.position, line)
    );
}

function inClosedFrontmatter(lines: string[], line: number): boolean {
    if ((lines[0] ?? "").trim() !== "---") return false;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") return line <= i;
    }
    return false;
}

function idOnNextLine(lines: string[], end: number): string | null {
    const next = lines[end + 1];
    if (next == null || !isOnlyBlockId(next)) return null;
    return blockIdAtEnd(next);
}

function writeFor(kind: BlockKind, start: number, end: number): BlockTarget["write"] {
    if (kind === "id") return null;
    if (kind === "list") return { mode: "inline", line: start };
    if (kind === "paragraph" || kind === "heading") return { mode: "inline", line: end };
    return { mode: "after", line: end };
}

function finalize(lines: string[], kind: BlockKind, start: number, end: number): BlockTarget {
    let contentEnd = Math.max(start, end);
    if (contentEnd > start && isOnlyBlockId(lines[contentEnd] ?? "")) contentEnd -= 1;

    const id = findExistingId(lines, kind, start, contentEnd);

    return {
        kind,
        start,
        end: contentEnd,
        id,
        write: id ? null : writeFor(kind, start, contentEnd),
    };
}

function findExistingId(lines: string[], kind: BlockKind, start: number, contentEnd: number): string | null {
    // 围栏和公式内部出现的 ^id 只是正文，块 ID 只能写在块后面单独一行。
    if (kind === "code" || kind === "math") return idOnNextLine(lines, contentEnd);

    if (kind === "list") {
        const marker = (lines[start] ?? "").match(LIST_RE);
        const base = marker ? marker[1].length : 0;
        for (let i = start; i <= contentEnd; i++) {
            if (i !== start) {
                const nested = (lines[i] ?? "").match(LIST_RE);
                if (nested && nested[1].length > base) break;
            }
            const id = blockIdAtEnd(lines[i] ?? "");
            if (id) return id;
        }
        // 单行列表项允许把 ^id 放在下一行；多行时下一行可能属于子项。
        if (contentEnd === start) return idOnNextLine(lines, contentEnd);
        return null;
    }

    for (let i = contentEnd; i >= start; i--) {
        const id = blockIdAtEnd(lines[i] ?? "");
        if (id) return id;
    }
    return idOnNextLine(lines, contentEnd);
}

function kindFromSection(type: string): BlockKind {
    switch (type) {
        case "heading":
            return "heading";
        case "list":
            return "list";
        case "blockquote":
        case "callout":
            return "quote";
        case "code":
            return "code";
        case "math":
            return "math";
        case "table":
            return "table";
        case "thematicBreak":
            return "hr";
        default:
            return type === "paragraph" ? "paragraph" : "html";
    }
}

function locateFromCache(lines: string[], line: number, cache: CacheLike): BlockTarget | null {
    const items = (cache.listItems ?? []).filter((item) => containsLine(item.position, line));
    if (items.length > 0) {
        items.sort((a, b) => spanWeight(a.position) - spanWeight(b.position));
        const item = items[0];
        const start = item.position.start.line;
        const end = Math.max(start, contentEndLine(item.position));
        return finalize(lines, "list", start, end);
    }

    const sections = (cache.sections ?? []).filter(
        (section) =>
            section.type !== "yaml" &&
            section.type !== "frontmatter" &&
            containsLine(section.position, line)
    );
    if (sections.length === 0) return null;
    sections.sort((a, b) => spanWeight(a.position) - spanWeight(b.position));
    const section = sections[0];
    const start = section.position.start.line;
    const end = Math.max(start, contentEndLine(section.position));
    return finalize(lines, kindFromSection(section.type), start, end);
}

function blockAroundBlankLine(lines: string[], line: number, cache: CacheLike | null): BlockTarget | null {
    const fence = fenceRangeContaining(lines, line);
    if (fence) return finalize(lines, "code", fence.start, fence.end);
    const math = mathRangeContaining(lines, line);
    if (math) return finalize(lines, "math", math.start, math.end);
    if (!cache) return null;
    const fromCache = locateFromCache(lines, line, cache);
    if (!fromCache || fromCache.kind === "paragraph" || fromCache.kind === "heading") return null;
    return fromCache;
}

interface LineRange {
    start: number;
    end: number;
}

function fenceRanges(lines: string[]): LineRange[] {
    const ranges: LineRange[] = [];
    let open = -1;
    let marker = "";
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(FENCE_RE);
        if (!match) continue;
        if (open < 0) {
            open = i;
            marker = match[1];
            continue;
        }
        if (match[1] === marker) {
            ranges.push({ start: open, end: i });
            open = -1;
            marker = "";
        }
    }
    if (open >= 0) ranges.push({ start: open, end: lines.length - 1 });
    return ranges;
}

function fenceRangeContaining(lines: string[], line: number): LineRange | null {
    return fenceRanges(lines).find((range) => line >= range.start && line <= range.end) ?? null;
}

function inFence(lines: string[], line: number): boolean {
    return fenceRangeContaining(lines, line) !== null;
}

function mathRanges(lines: string[]): LineRange[] {
    const ranges: LineRange[] = [];
    let open = -1;
    for (let i = 0; i < lines.length; i++) {
        if (inFence(lines, i) || !MATH_DELIM_RE.test(lines[i])) continue;
        if (open < 0) {
            open = i;
            continue;
        }
        ranges.push({ start: open, end: i });
        open = -1;
    }
    if (open >= 0) ranges.push({ start: open, end: lines.length - 1 });
    return ranges;
}

function mathRangeContaining(lines: string[], line: number): LineRange | null {
    return mathRanges(lines).find((range) => line >= range.start && line <= range.end) ?? null;
}

function isSingleLineMath(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith("$$") && trimmed.endsWith("$$") && !MATH_DELIM_RE.test(line) && trimmed.length > 4;
}

function isTableLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return false;
    if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return true;
    const pipes = trimmed.match(/\|/g)?.length ?? 0;
    return trimmed.startsWith("|") && trimmed.endsWith("|") && pipes >= 2;
}

function leadingSpaces(line: string): number {
    return line.match(/^\s*/)?.[0].length ?? 0;
}

function isPlainLine(line: string): boolean {
    if (line.trim() === "" || isOnlyBlockId(line)) return false;
    if (HEADING_RE.test(line.trim())) return false;
    if (LIST_RE.test(line) || QUOTE_RE.test(line) || FENCE_RE.test(line)) return false;
    if (HR_RE.test(line) || isTableLine(line) || MATH_DELIM_RE.test(line)) return false;
    if (isSingleLineMath(line)) return false;
    return true;
}

function listItemRange(lines: string[], line: number): LineRange {
    let start = line;
    if (!LIST_RE.test(lines[line] ?? "")) {
        const indent = leadingSpaces(lines[line] ?? "");
        for (let i = line - 1; i >= 0; i--) {
            if ((lines[i] ?? "").trim() === "") break;
            const marker = (lines[i] ?? "").match(LIST_RE);
            if (marker && marker[1].length < indent) {
                start = i;
                break;
            }
        }
    }

    const marker = (lines[start] ?? "").match(LIST_RE);
    const base = marker ? marker[1].length : 0;
    let end = start;
    for (let i = start + 1; i < lines.length; i++) {
        const current = lines[i] ?? "";
        if (current.trim() === "") break;
        const next = current.match(LIST_RE);
        if (next && next[1].length <= base) break;
        if (!next && leadingSpaces(current) <= base) break;
        end = i;
    }
    return { start, end };
}

function isListContext(lines: string[], line: number): boolean {
    if (LIST_RE.test(lines[line] ?? "")) return true;
    if ((lines[line] ?? "").trim() === "" || leadingSpaces(lines[line] ?? "") === 0) return false;
    const indent = leadingSpaces(lines[line] ?? "");
    for (let i = line - 1; i >= 0; i--) {
        const current = lines[i] ?? "";
        if (current.trim() === "") return false;
        const marker = current.match(LIST_RE);
        if (marker && marker[1].length < indent) return true;
        if (!marker && leadingSpaces(current) === 0) return false;
    }
    return false;
}

function expandWhile(lines: string[], line: number, accept: (index: number) => boolean): LineRange {
    let start = line;
    let end = line;
    while (start > 0 && accept(start - 1)) start--;
    while (end + 1 < lines.length && accept(end + 1)) end++;
    return { start, end };
}

function locateManual(lines: string[], line: number): BlockTarget | null {
    const text = lines[line] ?? "";
    if (text.trim() === "") return null;

    const fence = fenceRangeContaining(lines, line);
    if (fence) return finalize(lines, "code", fence.start, fence.end);

    if (isSingleLineMath(text)) return finalize(lines, "math", line, line);

    const math = mathRangeContaining(lines, line);
    if (math) return finalize(lines, "math", math.start, math.end);

    if (isTableLine(text)) {
        const range = expandWhile(lines, line, (index) => isTableLine(lines[index] ?? ""));
        return finalize(lines, "table", range.start, range.end);
    }

    if (HEADING_RE.test(text.trim())) return finalize(lines, "heading", line, line);
    if (HR_RE.test(text)) return finalize(lines, "hr", line, line);

    if (QUOTE_RE.test(text)) {
        const range = expandWhile(lines, line, (index) => QUOTE_RE.test(lines[index] ?? ""));
        return finalize(lines, "quote", range.start, range.end);
    }

    if (isListContext(lines, line)) {
        const range = listItemRange(lines, line);
        return finalize(lines, "list", range.start, range.end);
    }

    const range = expandWhile(lines, line, (index) => isPlainLine(lines[index] ?? ""));
    return finalize(lines, "paragraph", range.start, range.end);
}
