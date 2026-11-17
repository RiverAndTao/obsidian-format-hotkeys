import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** JSP / JSPX。源码模式自己切词，阅读视图走同一套 Prism 语法。 */
const JSP_LANGS = new Set(["jsp", "jspx"]);

const JAVA_KEYWORDS = new Set(
    (
        "abstract assert break case catch class const continue default do else enum extends final finally " +
        "for goto if implements import instanceof interface native new package private protected public " +
        "return static strictfp super switch synchronized this throw throws transient try volatile while " +
        "true false null var yield record sealed permits"
    ).split(/\s+/)
);

const JAVA_TYPES = new Set("void boolean byte char short int long float double".split(/\s+/));

/** JSP 隐式对象。按类型色显示，和方法调用分开。 */
const IMPLICIT = new Set(
    "request response session out pageContext application config page exception".split(/\s+/)
);

const EL_KEYWORDS = new Set(
    "empty not and or eq ne lt gt le ge div mod true false null instanceof new".split(/\s+/)
);

const NUMBER_BODY =
    /(?:0[xX][0-9a-fA-F]+[lL]?|0[bB][01]+[lL]?|(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?|\d+(?:[eE][+-]?\d+)?[lLfFdD]?)/;
const NUMBER_RE = new RegExp("^" + NUMBER_BODY.source);

const ENTITY_BODY = /&(?:#\d+|#x[\da-fA-F]+|[A-Za-z][A-Za-z0-9]+);/;
const ENTITY_RE = new RegExp("^" + ENTITY_BODY.source);

type TokenClass =
    | "fh-jsp-comment"
    | "fh-jsp-string"
    | "fh-jsp-number"
    | "fh-jsp-keyword"
    | "fh-jsp-type"
    | "fh-jsp-func"
    | "fh-jsp-var"
    | "fh-jsp-tag"
    | "fh-jsp-attr"
    | "fh-jsp-delim"
    | "fh-jsp-el"
    | "fh-jsp-plain";

interface Piece {
    from: number;
    to: number;
    cls: TokenClass;
}

type TagPhase = "name" | "after" | "eq";

type Frame =
    | { kind: "html" }
    | { kind: "tag"; phase: TagPhase }
    | { kind: "dir"; phase: TagPhase }
    | { kind: "html-comment" }
    | { kind: "jsp-comment" }
    | { kind: "cdata" }
    | { kind: "pi" }
    | { kind: "java"; block: boolean; quote: '"' | "'" | null }
    | { kind: "el"; depth: number; quote: '"' | "'" | null }
    | { kind: "attr-string"; quote: '"' | "'" };

interface JspState {
    stack: Frame[];
}

type Push = (from: number, to: number, cls: TokenClass) => void;

const decoCache = new Map<string, Decoration>();
const jspLine = Decoration.line({ class: "fh-jsp" });

function tokenMark(cls: string): Decoration {
    let deco = decoCache.get(cls);
    if (!deco) {
        deco = Decoration.mark({ class: cls });
        decoCache.set(cls, deco);
    }
    return deco;
}

function languageId(info: string): string {
    let lang = info.trim().toLowerCase();
    const braced = lang.match(/^\{[.#]?([^}\s]+)/);
    if (braced) {
        lang = braced[1];
    } else {
        lang = lang.split(/[\s:]/)[0] ?? "";
    }
    return lang.replace(/^\.+/, "");
}

function isJspLang(info: string): boolean {
    return JSP_LANGS.has(languageId(info));
}

function fenceAt(text: string): { char: "`" | "~"; lang: string } | null {
    const match = /^(?: {0,3}|\t)(```+|~~~+)(.*)$/.exec(text);
    if (!match) {
        return null;
    }
    const marker = match[1];
    const char = marker[0] === "~" ? "~" : "`";
    return { char, lang: match[2].trim() };
}

function freshState(): JspState {
    return { stack: [{ kind: "html" }] };
}

function javaFrame(): Frame {
    return { kind: "java", block: false, quote: null };
}

function popFrame(stack: Frame[]): void {
    if (stack.length > 1) {
        stack.pop();
    }
}

function isCall(text: string, i: number): boolean {
    let j = i;
    while (text[j] === " " || text[j] === "\t") {
        j++;
    }
    return text[j] === "(";
}

function isTagOpen(text: string, i: number): boolean {
    if (text[i] !== "<") {
        return false;
    }
    const next = text[i + 1];
    if (next === "/") {
        return /[A-Za-z]/.test(text[i + 2] ?? "");
    }
    return /[A-Za-z]/.test(next ?? "");
}

function htmlBoundary(text: string, i: number): boolean {
    if (text.startsWith("<%", i) || text.startsWith("<!--", i) || text.startsWith("<![CDATA[", i) || text.startsWith("<?", i)) {
        return true;
    }
    if (/^<!DOCTYPE/i.test(text.slice(i, i + 10))) {
        return true;
    }
    if ((text.startsWith("${", i) || text.startsWith("#{", i)) && text[i - 1] !== "\\") {
        return true;
    }
    if (isTagOpen(text, i)) {
        return true;
    }
    return text[i] === "&" && ENTITY_RE.test(text.slice(i));
}

function consumeHtmlToken(text: string, i: number, stack: Frame[], push: Push): number {
    if (text.startsWith("<%--", i)) {
        push(i, i + 4, "fh-jsp-comment");
        stack.push({ kind: "jsp-comment" });
        return i + 4;
    }
    if (text.startsWith("<%@", i)) {
        push(i, i + 3, "fh-jsp-delim");
        stack.push({ kind: "dir", phase: "name" });
        return i + 3;
    }
    if (text.startsWith("<%!", i)) {
        push(i, i + 3, "fh-jsp-delim");
        stack.push(javaFrame());
        return i + 3;
    }
    if (text.startsWith("<%=", i)) {
        push(i, i + 3, "fh-jsp-delim");
        stack.push(javaFrame());
        return i + 3;
    }
    if (text.startsWith("<%", i)) {
        push(i, i + 2, "fh-jsp-delim");
        stack.push(javaFrame());
        return i + 2;
    }
    if (text.startsWith("<!--", i)) {
        push(i, i + 4, "fh-jsp-comment");
        stack.push({ kind: "html-comment" });
        return i + 4;
    }
    if (text.startsWith("<![CDATA[", i)) {
        push(i, i + 9, "fh-jsp-delim");
        stack.push({ kind: "cdata" });
        return i + 9;
    }
    if (/^<!DOCTYPE/i.test(text.slice(i))) {
        const end = text.indexOf(">", i);
        if (end < 0) {
            push(i, text.length, "fh-jsp-delim");
            return text.length;
        }
        push(i, end + 1, "fh-jsp-delim");
        return end + 1;
    }
    if (text.startsWith("<?", i)) {
        push(i, i + 2, "fh-jsp-delim");
        stack.push({ kind: "pi" });
        return i + 2;
    }
    if ((text.startsWith("${", i) || text.startsWith("#{", i)) && text[i - 1] !== "\\") {
        push(i, i + 2, "fh-jsp-delim");
        stack.push({ kind: "el", depth: 1, quote: null });
        return i + 2;
    }
    if (isTagOpen(text, i)) {
        const len = text[i + 1] === "/" ? 2 : 1;
        push(i, i + len, "fh-jsp-delim");
        stack.push({ kind: "tag", phase: "name" });
        return i + len;
    }
    if (text[i] === "&") {
        const ent = ENTITY_RE.exec(text.slice(i));
        if (ent) {
            push(i, i + ent[0].length, "fh-jsp-string");
            return i + ent[0].length;
        }
    }
    return i;
}

function scanHtml(text: string, i: number, stack: Frame[], push: Push): number {
    if (htmlBoundary(text, i)) {
        const next = consumeHtmlToken(text, i, stack, push);
        if (next > i) {
            return next;
        }
    }
    let j = i + 1;
    while (j < text.length && !htmlBoundary(text, j)) {
        j++;
    }
    push(i, j, "fh-jsp-plain");
    return j;
}

function consumeUntil(text: string, i: number, marker: string, cls: TokenClass, stack: Frame[], push: Push): number {
    const at = text.indexOf(marker, i);
    if (at < 0) {
        if (i < text.length) {
            push(i, text.length, cls);
        }
        return text.length;
    }
    push(i, at + marker.length, cls);
    popFrame(stack);
    return at + marker.length;
}

function scanPi(text: string, i: number, stack: Frame[], push: Push): number {
    const at = text.indexOf("?>", i);
    if (at < 0) {
        if (i < text.length) {
            push(i, text.length, "fh-jsp-tag");
        }
        return text.length;
    }
    if (at > i) {
        push(i, at, "fh-jsp-tag");
    }
    push(at, at + 2, "fh-jsp-delim");
    popFrame(stack);
    return at + 2;
}

function scanTag(text: string, i: number, frame: Extract<Frame, { kind: "tag" | "dir" }>, stack: Frame[], push: Push): number {
    const isDir = frame.kind === "dir";
    if (isDir && text.startsWith("%>", i)) {
        push(i, i + 2, "fh-jsp-delim");
        popFrame(stack);
        return i + 2;
    }
    if (!isDir && text.startsWith("/>", i)) {
        push(i, i + 2, "fh-jsp-delim");
        popFrame(stack);
        return i + 2;
    }
    if (!isDir && text[i] === ">") {
        push(i, i + 1, "fh-jsp-delim");
        popFrame(stack);
        return i + 1;
    }
    if (frame.phase === "name") {
        if (text[i] === " " || text[i] === "\t") {
            let j = i + 1;
            while (text[j] === " " || text[j] === "\t") {
                j++;
            }
            push(i, j, "fh-jsp-plain");
            return j;
        }
        const name = /^[A-Za-z_][\w:.-]*/.exec(text.slice(i));
        if (name && name[0].length > 0) {
            push(i, i + name[0].length, isDir ? "fh-jsp-keyword" : "fh-jsp-tag");
            frame.phase = "after";
            return i + name[0].length;
        }
        frame.phase = "after";
    }
    if (text[i] === " " || text[i] === "\t") {
        let j = i + 1;
        while (text[j] === " " || text[j] === "\t") {
            j++;
        }
        push(i, j, "fh-jsp-plain");
        return j;
    }
    if (text[i] === '"' || text[i] === "'") {
        push(i, i + 1, "fh-jsp-string");
        frame.phase = "after";
        stack.push({ kind: "attr-string", quote: text[i] === "'" ? "'" : '"' });
        return i + 1;
    }
    if (text[i] === "=") {
        push(i, i + 1, "fh-jsp-plain");
        frame.phase = "eq";
        return i + 1;
    }
    let j = i;
    while (j < text.length) {
        const ch = text[j];
        if (ch === " " || ch === "\t" || ch === "=" || ch === "<" || ch === ">" || ch === '"' || ch === "'" || ch === "/") {
            break;
        }
        if (ch === "%" && text[j + 1] === ">") {
            break;
        }
        j++;
    }
    if (j > i) {
        const cls = frame.phase === "eq" ? "fh-jsp-string" : "fh-jsp-attr";
        push(i, j, cls);
        frame.phase = "after";
        return j;
    }
    push(i, i + 1, "fh-jsp-plain");
    return i + 1;
}

function scanAttrString(text: string, i: number, frame: Extract<Frame, { kind: "attr-string" }>, stack: Frame[], push: Push): number {
    if (text.startsWith("\\${", i) || text.startsWith("\\#{", i)) {
        push(i, Math.min(text.length, i + 3), "fh-jsp-string");
        return Math.min(text.length, i + 3);
    }
    if ((text.startsWith("${", i) || text.startsWith("#{", i)) && text[i - 1] !== "\\") {
        push(i, i + 2, "fh-jsp-delim");
        stack.push({ kind: "el", depth: 1, quote: null });
        return i + 2;
    }
    if (text[i] === "\\") {
        push(i, Math.min(text.length, i + 2), "fh-jsp-string");
        return Math.min(text.length, i + 2);
    }
    if (text[i] === frame.quote) {
        push(i, i + 1, "fh-jsp-string");
        popFrame(stack);
        return i + 1;
    }
    let j = i + 1;
    while (j < text.length) {
        if (text[j] === frame.quote || text[j] === "\\") {
            break;
        }
        if ((text[j] === "$" || text[j] === "#") && text[j + 1] === "{" && text[j - 1] !== "\\") {
            break;
        }
        j++;
    }
    push(i, j, "fh-jsp-string");
    return j;
}

function scanEl(text: string, i: number, frame: Extract<Frame, { kind: "el" }>, stack: Frame[], push: Push): number {
    if (frame.quote) {
        if (text[i] === "\\") {
            push(i, Math.min(text.length, i + 2), "fh-jsp-string");
            return Math.min(text.length, i + 2);
        }
        if (text[i] === frame.quote) {
            push(i, i + 1, "fh-jsp-string");
            frame.quote = null;
            return i + 1;
        }
        let j = i + 1;
        while (j < text.length && text[j] !== frame.quote && text[j] !== "\\") {
            j++;
        }
        push(i, j, "fh-jsp-string");
        return j;
    }
    if (text[i] === '"' || text[i] === "'") {
        frame.quote = text[i] === "'" ? "'" : '"';
        push(i, i + 1, "fh-jsp-string");
        return i + 1;
    }
    if (text.startsWith("${", i) || text.startsWith("#{", i)) {
        push(i, i + 2, "fh-jsp-delim");
        frame.depth++;
        return i + 2;
    }
    if (text[i] === "{") {
        push(i, i + 1, "fh-jsp-plain");
        frame.depth++;
        return i + 1;
    }
    if (text[i] === "}") {
        frame.depth--;
        if (frame.depth <= 0) {
            push(i, i + 1, "fh-jsp-delim");
            popFrame(stack);
        } else {
            push(i, i + 1, "fh-jsp-plain");
        }
        return i + 1;
    }
    const ident = /^[A-Za-z_][\w]*/.exec(text.slice(i));
    if (ident && ident[0].length > 0) {
        const word = ident[0];
        let cls: TokenClass = "fh-jsp-el";
        if (EL_KEYWORDS.has(word)) {
            cls = "fh-jsp-keyword";
        } else if (isCall(text, i + word.length)) {
            cls = "fh-jsp-func";
        }
        push(i, i + word.length, cls);
        return i + word.length;
    }
    const num = NUMBER_RE.exec(text.slice(i));
    if (num) {
        push(i, i + num[0].length, "fh-jsp-number");
        return i + num[0].length;
    }
    if (text[i] === " " || text[i] === "\t") {
        let j = i + 1;
        while (text[j] === " " || text[j] === "\t") {
            j++;
        }
        push(i, j, "fh-jsp-plain");
        return j;
    }
    push(i, i + 1, "fh-jsp-plain");
    return i + 1;
}

function closeScriptlet(text: string, i: number, stack: Frame[], push: Push): number {
    push(i, i + 2, "fh-jsp-delim");
    popFrame(stack);
    return i + 2;
}

function scanJava(text: string, i: number, frame: Extract<Frame, { kind: "java" }>, stack: Frame[], push: Push): number {
    if (frame.block) {
        const commentEnd = text.indexOf("*/", i);
        const scriptEnd = text.indexOf("%>", i);
        if (scriptEnd >= 0 && (commentEnd < 0 || scriptEnd < commentEnd)) {
            if (scriptEnd > i) {
                push(i, scriptEnd, "fh-jsp-comment");
            }
            return closeScriptlet(text, scriptEnd, stack, push);
        }
        if (commentEnd < 0) {
            if (i < text.length) {
                push(i, text.length, "fh-jsp-comment");
            }
            return text.length;
        }
        push(i, commentEnd + 2, "fh-jsp-comment");
        frame.block = false;
        return commentEnd + 2;
    }

    if (frame.quote) {
        if (text.startsWith("%\\>", i)) {
            push(i, Math.min(text.length, i + 3), "fh-jsp-string");
            return Math.min(text.length, i + 3);
        }
        if (text.startsWith("%>", i)) {
            return closeScriptlet(text, i, stack, push);
        }
        if (text[i] === "\\") {
            push(i, Math.min(text.length, i + 2), "fh-jsp-string");
            return Math.min(text.length, i + 2);
        }
        if (text[i] === frame.quote) {
            push(i, i + 1, "fh-jsp-string");
            frame.quote = null;
            return i + 1;
        }
        let j = i + 1;
        while (j < text.length && text[j] !== frame.quote && text[j] !== "\\" && !text.startsWith("%>", j)) {
            j++;
        }
        push(i, j, "fh-jsp-string");
        return j;
    }

    if (text.startsWith("%\\>", i)) {
        push(i, Math.min(text.length, i + 3), "fh-jsp-plain");
        return Math.min(text.length, i + 3);
    }
    if (text.startsWith("%>", i)) {
        return closeScriptlet(text, i, stack, push);
    }
    if (text[i] === " " || text[i] === "\t") {
        let j = i + 1;
        while (text[j] === " " || text[j] === "\t") {
            j++;
        }
        push(i, j, "fh-jsp-plain");
        return j;
    }
    if (text.startsWith("//", i)) {
        const scriptEnd = text.indexOf("%>", i);
        if (scriptEnd >= 0) {
            push(i, scriptEnd, "fh-jsp-comment");
            return closeScriptlet(text, scriptEnd, stack, push);
        }
        push(i, text.length, "fh-jsp-comment");
        return text.length;
    }
    if (text.startsWith("/*", i)) {
        frame.block = true;
        push(i, i + 2, "fh-jsp-comment");
        return i + 2;
    }
    if (text[i] === '"' || text[i] === "'") {
        frame.quote = text[i] === "'" ? "'" : '"';
        push(i, i + 1, "fh-jsp-string");
        return i + 1;
    }
    if (text.startsWith("non-sealed", i) && !/[\w$]/.test(text[i + 10] ?? "")) {
        push(i, i + 10, "fh-jsp-keyword");
        return i + 10;
    }
    if (text[i] === "@") {
        const note = /^@[A-Za-z_][\w]*/.exec(text.slice(i));
        if (note) {
            push(i, i + note[0].length, "fh-jsp-delim");
            return i + note[0].length;
        }
    }
    const ident = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
    if (ident && ident[0].length > 0) {
        const word = ident[0];
        let cls: TokenClass = "fh-jsp-var";
        if (JAVA_TYPES.has(word) || IMPLICIT.has(word) || /^[A-Z]/.test(word)) {
            cls = "fh-jsp-type";
        } else if (JAVA_KEYWORDS.has(word)) {
            cls = "fh-jsp-keyword";
        } else if (isCall(text, i + word.length)) {
            cls = "fh-jsp-func";
        }
        push(i, i + word.length, cls);
        return i + word.length;
    }
    const num = NUMBER_RE.exec(text.slice(i));
    if (num && !/[A-Za-z_$]/.test(text[i - 1] ?? "")) {
        push(i, i + num[0].length, "fh-jsp-number");
        return i + num[0].length;
    }
    push(i, i + 1, "fh-jsp-plain");
    return i + 1;
}

/** 切一行。state 跨行保持，用来接住没写完的脚本、注释和标签。 */
export function scanJspLine(text: string, state: JspState): { pieces: Piece[]; state: JspState } {
    const stack = state.stack.map((frame) => ({ ...frame }));
    if (stack.length === 0) {
        stack.push({ kind: "html" });
    }
    const pieces: Piece[] = [];
    const push: Push = (from, to, cls) => {
        if (to <= from) {
            return;
        }
        const prev = pieces[pieces.length - 1];
        if (prev && prev.cls === cls && prev.to === from) {
            prev.to = to;
            return;
        }
        pieces.push({ from, to, cls });
    };

    let i = 0;
    const n = text.length;
    let guard = 0;
    while (i < n && guard <= n + 8) {
        guard++;
        const before = i;
        const frame = stack[stack.length - 1];
        if (frame.kind === "html") {
            i = scanHtml(text, i, stack, push);
        } else if (frame.kind === "tag" || frame.kind === "dir") {
            i = scanTag(text, i, frame, stack, push);
        } else if (frame.kind === "html-comment") {
            i = consumeUntil(text, i, "-->", "fh-jsp-comment", stack, push);
        } else if (frame.kind === "jsp-comment") {
            i = consumeUntil(text, i, "--%>", "fh-jsp-comment", stack, push);
        } else if (frame.kind === "cdata") {
            i = consumeUntil(text, i, "]]>", "fh-jsp-string", stack, push);
        } else if (frame.kind === "pi") {
            i = scanPi(text, i, stack, push);
        } else if (frame.kind === "java") {
            i = scanJava(text, i, frame, stack, push);
        } else if (frame.kind === "el") {
            i = scanEl(text, i, frame, stack, push);
        } else if (frame.kind === "attr-string") {
            i = scanAttrString(text, i, frame, stack, push);
        }
        if (i <= before) {
            push(before, Math.min(n, before + 1), "fh-jsp-plain");
            i = before + 1;
        }
    }
    return { pieces, state: { stack } };
}

export interface JspDebugPiece {
    cls: string;
    text: string;
}

/** 测试用：不识别围栏，整段按 JSP 切词。 */
export function debugJspLines(source: string): JspDebugPiece[][] {
    let state = freshState();
    return source.split("\n").map((line) => {
        const scanned = scanJspLine(line, state);
        state = scanned.state;
        return scanned.pieces.map((piece) => ({
            cls: piece.cls.replace(/^fh-jsp-/, ""),
            text: line.slice(piece.from, piece.to),
        }));
    });
}

function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    let fence: { char: "`" | "~"; lang: string } | null = null;
    let state = freshState();

    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const found = fenceAt(line.text);
        if (fence) {
            if (found && found.char === fence.char && found.lang === "") {
                fence = null;
                state = freshState();
                continue;
            }
            if (!isJspLang(fence.lang)) {
                continue;
            }
            builder.add(line.from, line.from, jspLine);
            const scanned = scanJspLine(line.text, state);
            state = scanned.state;
            for (const piece of scanned.pieces) {
                builder.add(line.from + piece.from, line.from + piece.to, tokenMark(piece.cls));
            }
            continue;
        }
        if (found) {
            fence = found;
            state = freshState();
        }
    }

    return builder.finish();
}

const jspHighlightPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: (value) => value.decorations,
    }
);

/** 源码模式：JSP 模板、脚本和 EL 分开上色。 */
export function createJspHighlightExtension(): Extension {
    return jspHighlightPlugin;
}

interface PrismLike {
    languages: Record<string, unknown>;
}

function wordPattern(words: Set<string>): RegExp {
    const body = [...words].sort((a, b) => b.length - a.length).join("|");
    return new RegExp(`\\b(?:${body})\\b`);
}

function minimalJavaGrammar(): Record<string, unknown> {
    return {
        comment: [
            { pattern: /\/\*[\s\S]*?(?:\*\/|$)/, greedy: true },
            { pattern: /(^|[^\\])\/\/.*/, lookbehind: true, greedy: true },
        ],
        string: {
            pattern: /"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])'/,
            greedy: true,
        },
        keyword: wordPattern(JAVA_KEYWORDS),
        number: NUMBER_BODY,
        function: /\b[A-Za-z_]\w*(?=\s*\()/,
        "class-name": /\b[A-Z][\w]*/,
    };
}

/** 阅读视图：注册 jsp / jspx。有 Java 语法时嵌进去。 */
export function registerJspPrismLanguages(prism: PrismLike): void {
    const java = prism.languages.java;
    const javaGrammar = java && typeof java === "object" ? java : minimalJavaGrammar();
    const grammar: Record<string, unknown> = {
        comment: [
            { pattern: /<%--[\s\S]*?--%>/, greedy: true },
            { pattern: /<!--[\s\S]*?-->/, greedy: true },
        ],
        directive: {
            pattern: /<%@[\s\S]*?%>/,
            greedy: true,
            inside: {
                punctuation: /<%@|%>/,
                string: { pattern: /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/, greedy: true },
                keyword:
                    /\b(?:page|include|taglib|tag|attribute|variable|tagdir|uri|prefix|language|contentType|pageEncoding|import|session|buffer|autoFlush|isThreadSafe|info|errorPage|isErrorPage|extends)\b/,
                "attr-name": /[^\s=<>"'/]+(?=\s*=)/,
            },
        },
        expression: {
            pattern: /<%=[\s\S]*?%>/,
            greedy: true,
            inside: {
                punctuation: /<%=|%>/,
                rest: javaGrammar,
            },
        },
        declaration: {
            pattern: /<%![\s\S]*?%>/,
            greedy: true,
            inside: {
                punctuation: /<%!|%>/,
                rest: javaGrammar,
            },
        },
        scriptlet: {
            pattern: /<%(?![@=!%-])[\s\S]*?%>/,
            greedy: true,
            inside: {
                punctuation: /<%|%>/,
                rest: javaGrammar,
            },
        },
        el: {
            pattern: /[$]\{[\s\S]*?\}|#\{[\s\S]*?\}/,
            greedy: true,
            inside: {
                string: { pattern: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, greedy: true },
                keyword: wordPattern(EL_KEYWORDS),
                punctuation: /[()[\].]/,
            },
        },
        cdata: {
            pattern: /<!\[CDATA\[[\s\S]*?\]\]>/,
            greedy: true,
            alias: "string",
        },
        tag: {
            pattern: /<\/?[A-Za-z][\w:.-]*\b/,
            inside: {
                punctuation: /^<\/?/,
                tag: /[\w:.-]+/,
            },
        },
        "attr-value": {
            pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/,
            inside: {
                punctuation: /^=/,
                string: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/,
            },
        },
        "attr-name": /[^\s>"'=/]+(?=\s*=)/,
        entity: {
            pattern: ENTITY_BODY,
            alias: "string",
        },
        punctuation: /[<>/]/,
    };

    for (const lang of JSP_LANGS) {
        prism.languages[lang] = grammar;
    }
}
