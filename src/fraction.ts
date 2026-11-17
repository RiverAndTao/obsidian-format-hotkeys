/** 把选区里的 a/b 转成 LaTeX \frac{a}{b} */

const SLASH = /[/／]/;

function hasSlash(text: string): boolean {
    return SLASH.test(text);
}

function isOpenGroup(ch: string): boolean {
    return ch === "(" || ch === "（" || ch === "{" || ch === "[";
}

function isCloseGroup(ch: string): boolean {
    return ch === ")" || ch === "）" || ch === "}" || ch === "]";
}

function isOpenParen(ch: string): boolean {
    return ch === "(" || ch === "（";
}

function isCloseParen(ch: string): boolean {
    return ch === ")" || ch === "）";
}

function groupDelta(ch: string): number {
    if (isOpenGroup(ch)) return 1;
    if (isCloseGroup(ch)) return -1;
    return 0;
}

function isMathExpr(text: string): boolean {
    const core = text.trim();
    if (!core) return false;
    if (/[\u4e00-\u9fff，。；：！？、]/.test(core)) return false;
    if (/[A-Za-z]{2,}\s+[A-Za-z]/.test(core)) return false;
    if (/[a-z][a-z0-9+.-]*:\/\//i.test(core)) return false;
    return /^[A-Za-z0-9\\_^{}()（）[\]+\-*/.=<>|,'\s／]+$/.test(core);
}

function urlSpan(text: string, slash: number): { start: number; end: number } | null {
    let start = slash;
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    let end = slash;
    while (end < text.length && !/\s/.test(text[end])) end++;
    if (/[a-z][a-z0-9+.-]*:\/\//i.test(text.slice(start, end))) {
        return { start, end };
    }
    return null;
}

function dateSpan(text: string, start: number, end: number): { start: number; end: number } | null {
    let s = start;
    let e = end;
    while (s > 0 && /[\d/]/.test(text[s - 1])) s--;
    while (e < text.length && /[\d/]/.test(text[e])) e++;
    const chunk = text.slice(s, e);
    if (/^\d{4}\/\d{1,2}(\/\d{1,2})?$/.test(chunk) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(chunk)) {
        return { start: s, end: e };
    }
    return null;
}

function stripOuterParens(text: string): string {
    let core = text.trim();
    while (isOpenParen(core[0] ?? "") && isCloseParen(core[core.length - 1] ?? "")) {
        let depth = 0;
        let wrapsAll = true;
        for (let i = 0; i < core.length; i++) {
            if (isOpenParen(core[i])) depth++;
            else if (isCloseParen(core[i])) {
                depth--;
                if (depth === 0 && i < core.length - 1) {
                    wrapsAll = false;
                    break;
                }
            }
        }
        if (!wrapsAll || depth !== 0) break;
        core = core.slice(1, -1).trim();
    }
    return core;
}

function hasBinaryPlusMinus(expr: string): boolean {
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
        depth += groupDelta(expr[i]);
        if (depth < 0) depth = 0;
        if (depth !== 0 || (expr[i] !== "+" && expr[i] !== "-")) continue;
        const prev = expr.slice(0, i).trimEnd().slice(-1);
        if (prev && !/[(\[{\uFF08+\-*/=,／]/.test(prev)) return true;
    }
    return false;
}

function splitTopLevelSlashes(text: string): string[] | null {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    let found = false;
    for (let i = 0; i < text.length; i++) {
        depth += groupDelta(text[i]);
        if (depth < 0) depth = 0;
        if (depth !== 0 || (text[i] !== "/" && text[i] !== "／")) continue;
        if (urlSpan(text, i)) return null;
        parts.push(text.slice(start, i));
        start = i + 1;
        found = true;
    }
    if (!found) return null;
    parts.push(text.slice(start));
    if (parts.some((part) => part.trim() === "")) return null;
    return parts;
}

function tryPureMathFraction(text: string, asSelection: boolean): string | null {
    const lead = text.match(/^[ \t]*/)?.[0] ?? "";
    const trail = text.match(/[ \t]*$/)?.[0] ?? "";
    if (lead.length + trail.length >= text.length) return null;
    const core = text.slice(lead.length, text.length - trail.length);
    if (core.includes("\n") || !isMathExpr(core) || dateSpan(core, 0, core.length)) return null;

    const parts = splitTopLevelSlashes(core);
    if (!parts) return null;
    if (parts.length > 2 && parts.some(hasBinaryPlusMinus)) return null;
    if (
        parts.length === 2 &&
        !asSelection &&
        (hasBinaryPlusMinus(parts[0]) || hasBinaryPlusMinus(parts[1]))
    ) {
        return null;
    }

    let acc = stripOuterParens(parts[0].trim());
    for (let i = 1; i < parts.length; i++) {
        const den = stripOuterParens(parts[i].trim());
        if (!acc || !den) return null;
        acc = `\\frac{${convertInner(acc)}}{${convertInner(den)}}`;
    }
    return lead + acc + trail;
}

function matchingBack(text: string, closeIndex: number, openCh: (ch: string) => boolean, closeCh: (ch: string) => boolean): number {
    let depth = 0;
    for (let i = closeIndex; i >= 0; i--) {
        if (closeCh(text[i])) depth++;
        else if (openCh(text[i])) {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function matchingForward(text: string, openIndex: number, openCh: (ch: string) => boolean, closeCh: (ch: string) => boolean): number {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
        if (openCh(text[i])) depth++;
        else if (closeCh(text[i])) {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function isUnaryMinus(text: string, index: number): boolean {
    if (text[index] !== "-") return false;
    if (index === 0) return true;
    const prev = text[index - 1];
    return /[\s(\[{\uFF08+\-*/=,／]/.test(prev);
}

function readAtomBackward(text: string, slash: number): { start: number; raw: string } | null {
    let i = slash - 1;
    while (i >= 0 && (text[i] === " " || text[i] === "\t")) i--;
    if (i < 0) return null;
    const rawEnd = i + 1;
    let start: number;

    if (isCloseParen(text[i])) {
        const open = matchingBack(text, i, isOpenParen, isCloseParen);
        if (open < 0) return null;
        start = open;
        let j = open - 1;
        while (j >= 0 && /[A-Za-z0-9\\]/.test(text[j])) j--;
        start = j + 1;
    } else {
        let consumed = false;
        while (i >= 0) {
            const ch = text[i];
            if (/[A-Za-z0-9\\.*']/.test(ch)) {
                i--;
                consumed = true;
                continue;
            }
            if (ch === "}") {
                const open = matchingBack(text, i, (c) => c === "{", (c) => c === "}");
                if (open <= 0 || (text[open - 1] !== "_" && text[open - 1] !== "^")) break;
                i = open - 2;
                consumed = true;
                continue;
            }
            if ((ch === "_" || ch === "^") && consumed) {
                i--;
                continue;
            }
            break;
        }
        if (!consumed) return null;
        start = i + 1;
    }

    if (start > 0 && isUnaryMinus(text, start - 1)) start--;
    const raw = text.slice(start, rawEnd);
    if (!raw.trim()) return null;
    return { start, raw };
}

function readAtomForward(text: string, start: number): { end: number; raw: string } | null {
    let i = start;
    while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
    if (i >= text.length) return null;
    const rawStart = i;
    if (text[i] === "-") {
        const rest = readAtomBody(text, i + 1);
        if (!rest) return null;
        return { end: rest.end, raw: text.slice(rawStart, rest.end) };
    }
    return readAtomBody(text, i);
}

function readAtomBody(text: string, index: number): { end: number; raw: string } | null {
    if (index >= text.length) return null;
    if (isOpenParen(text[index])) {
        const close = matchingForward(text, index, isOpenParen, isCloseParen);
        if (close < 0) return null;
        return { end: close + 1, raw: text.slice(index, close + 1) };
    }

    let i = index;
    let consumed = false;
    while (i < text.length) {
        const ch = text[i];
        if (/[A-Za-z0-9\\.*']/.test(ch)) {
            i++;
            consumed = true;
            continue;
        }
        if ((ch === "_" || ch === "^") && i + 1 < text.length) {
            if (text[i + 1] === "{") {
                const close = matchingForward(text, i + 1, (c) => c === "{", (c) => c === "}");
                if (close < 0) break;
                i = close + 1;
                consumed = true;
                continue;
            }
            if (/[A-Za-z0-9\\.]/.test(text[i + 1])) {
                i += 2;
                consumed = true;
                continue;
            }
        }
        break;
    }
    if (!consumed) return null;
    return { end: i, raw: text.slice(index, i) };
}

function indexOfSlash(text: string): number {
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "/" || text[i] === "／") return i;
    }
    return -1;
}

function keepSlash(text: string, slash: number): string {
    return convertByAtoms(text.slice(0, slash)) + text[slash] + convertByAtoms(text.slice(slash + 1));
}

function convertByAtoms(text: string): string {
    const slash = indexOfSlash(text);
    if (slash < 0) return text;
    const url = urlSpan(text, slash);
    if (url) {
        return (
            convertByAtoms(text.slice(0, url.start)) +
            text.slice(url.start, url.end) +
            convertByAtoms(text.slice(url.end))
        );
    }

    const left = readAtomBackward(text, slash);
    const right = readAtomForward(text, slash + 1);
    if (!left || !right) return keepSlash(text, slash);
    const date = dateSpan(text, left.start, right.end);
    if (date) {
        return convertByAtoms(text.slice(0, date.start)) + text.slice(date.start, date.end) + convertByAtoms(text.slice(date.end));
    }

    const num = stripOuterParens(left.raw.trim());
    const den = stripOuterParens(right.raw.trim());
    if (!num || !den) return keepSlash(text, slash);

    const frac = `\\frac{${convertInner(num)}}{${convertInner(den)}}`;
    return convertByAtoms(text.slice(0, left.start)) + frac + convertByAtoms(text.slice(right.end));
}

function convertInner(text: string): string {
    if (!hasSlash(text)) return text;
    const pure = tryPureMathFraction(text, false);
    if (pure !== null) return pure;
    return convertByAtoms(text);
}

/** 将文本中的分数写成 \frac{分子}{分母}。整段选区若本身就是一个分数，按整段转换。 */
export function convertTextToLatexFraction(text: string): string {
    if (!hasSlash(text)) return text;
    const pure = tryPureMathFraction(text, true);
    if (pure !== null) return pure;
    return convertByAtoms(text);
}
