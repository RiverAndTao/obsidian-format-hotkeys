import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** c / cpp 家族。阅读视图用同一套 Prism 语法。 */
const CPP_LANGS = new Set(["c", "cpp", "c++", "cc", "cxx", "h", "hpp", "hh", "hxx"]);

/** 控制流、声明说明符。蓝色，和类型、变量分开。 */
const KEYWORDS = new Set(
    (
        "alignas alignof and and_eq asm bitand bitor break case catch class co_await co_return co_yield " +
        "compl concept const const_cast constexpr consteval constinit continue decltype default delete do " +
        "dynamic_cast else enum explicit export extern for friend goto if import inline module mutable " +
        "namespace new noexcept not not_eq nullptr operator or or_eq private protected public register " +
        "reinterpret_cast requires return sizeof static static_assert static_cast struct switch template " +
        "this thread_local throw try typedef typeid typename union using virtual volatile while xor xor_eq " +
        "true false"
    ).split(/\s+/)
);

/** 内置类型。青色，不跟 if/for 混成同一个蓝。 */
const TYPES = new Set(
    "void bool char wchar_t char8_t char16_t char32_t short int long float double signed unsigned auto _Bool".split(
        /\s+/
    )
);

/** class / struct / enum / union 后面的名字按类型上色。 */
const TYPE_INTRODUCERS = new Set(["class", "struct", "enum", "union"]);

const NUMBER_RE =
    /^(?:0[xX][0-9a-fA-F]+(?:'[0-9a-fA-F]+)*|0[bB][01]+(?:'[01]+)*|(?:\d+(?:'\d+)*)\.(?:\d+(?:'\d+)*)?(?:[eE][+-]?\d+)?|\.\d+(?:'\d+)*(?:[eE][+-]?\d+)?|\d+(?:'\d+)*(?:[eE][+-]?\d+)?)(?:[uU][lL]{1,2}|[lL]{1,2}[uU]?|[uUlLzZfF])?/;

const OP_RE =
    /^(?:<<=|>>=|\+\+|--|->|::|<<|>>|<=|>=|==|!=|&&|\|\||\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[+\-*/%&|^~!=<>?:.,;()[\]{}#])/;

type TokenClass =
    | "fh-cpp-comment"
    | "fh-cpp-string"
    | "fh-cpp-number"
    | "fh-cpp-keyword"
    | "fh-cpp-type"
    | "fh-cpp-func"
    | "fh-cpp-var"
    | "fh-cpp-preproc"
    | "fh-cpp-plain";

interface Piece {
    from: number;
    to: number;
    cls: TokenClass;
}

interface ScanState {
    blockComment: boolean;
    rawDelim: string | null;
}

const decoCache = new Map<string, Decoration>();
const cppLine = Decoration.line({ class: "fh-cpp" });

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

function isCppLang(info: string): boolean {
    return CPP_LANGS.has(languageId(info));
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

function skipSpace(text: string, i: number): number {
    while (i < text.length && (text[i] === " " || text[i] === "\t")) {
        i++;
    }
    return i;
}

function readIdent(text: string, i: number): number {
    if (!/[A-Za-z_]/.test(text[i] ?? "")) {
        return 0;
    }
    let j = i + 1;
    while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) {
        j++;
    }
    return j - i;
}

function isCall(text: string, i: number): boolean {
    const j = skipSpace(text, i);
    return text[j] === "(";
}

function matchString(text: string, i: number): { end: number; rawDelim: string | null } | null {
    const slice = text.slice(i);
    const prefixed = /^(?:u8|u|U|L)/.exec(slice);
    const prefixLen = prefixed ? prefixed[0].length : 0;
    const rest = slice.slice(prefixLen);
    if (rest.startsWith('R"')) {
        const delimMatch = /^R"([^()\\\s]{0,16})\(/.exec(rest);
        if (!delimMatch) {
            return null;
        }
        const delim = delimMatch[1];
        const contentStart = i + prefixLen + delimMatch[0].length;
        const endMark = `)${delim}"`;
        const close = text.indexOf(endMark, contentStart);
        if (close < 0) {
            return { end: text.length, rawDelim: delim };
        }
        return { end: close + endMark.length, rawDelim: null };
    }
    if (rest.startsWith('"') || rest.startsWith("'")) {
        const quote = rest[0];
        let j = i + prefixLen + 1;
        while (j < text.length) {
            if (text[j] === "\\") {
                j += 2;
                continue;
            }
            if (text[j] === quote) {
                return { end: j + 1, rawDelim: null };
            }
            j++;
        }
        return { end: text.length, rawDelim: null };
    }
    return null;
}

/**
 * 按 Visual Studio 的词类切一行。
 * 关键字蓝、内置类型青、函数黄、其余标识符浅蓝。
 */
export function scanCppLine(text: string, state: ScanState): { pieces: Piece[]; state: ScanState } {
    const pieces: Piece[] = [];
    const next: ScanState = { blockComment: state.blockComment, rawDelim: state.rawDelim };
    let i = 0;
    let expectType = false;

    const push = (from: number, to: number, cls: TokenClass): void => {
        if (to > from) {
            pieces.push({ from, to, cls });
        }
    };

    if (next.rawDelim !== null) {
        const endMark = `)${next.rawDelim}"`;
        const close = text.indexOf(endMark);
        if (close < 0) {
            push(0, text.length, "fh-cpp-string");
            return { pieces, state: next };
        }
        push(0, close + endMark.length, "fh-cpp-string");
        i = close + endMark.length;
        next.rawDelim = null;
    }

    if (next.blockComment) {
        const close = text.indexOf("*/", i);
        if (close < 0) {
            push(i, text.length, "fh-cpp-comment");
            return { pieces, state: next };
        }
        push(i, close + 2, "fh-cpp-comment");
        i = close + 2;
        next.blockComment = false;
    }

    if (text.slice(0, i).trim() === "") {
        const hash = skipSpace(text, i);
        if (text[hash] === "#") {
            let j = skipSpace(text, hash + 1);
            const len = readIdent(text, j);
            const name = len ? text.slice(j, j + len) : "";
            const end = len ? j + len : hash + 1;
            push(hash, end, "fh-cpp-preproc");
            i = end;
            if (name === "include" || name === "include_next") {
                const angle = skipSpace(text, i);
                if (text[angle] === "<") {
                    const close = text.indexOf(">", angle + 1);
                    const to = close < 0 ? text.length : close + 1;
                    push(angle, to, "fh-cpp-string");
                    i = to;
                }
            }
        }
    }

    while (i < text.length) {
        const ch = text[i];
        if (ch === " " || ch === "\t") {
            i++;
            continue;
        }

        if (ch === "/" && text[i + 1] === "/") {
            push(i, text.length, "fh-cpp-comment");
            break;
        }
        if (ch === "/" && text[i + 1] === "*") {
            const close = text.indexOf("*/", i + 2);
            if (close < 0) {
                push(i, text.length, "fh-cpp-comment");
                next.blockComment = true;
                break;
            }
            push(i, close + 2, "fh-cpp-comment");
            i = close + 2;
            continue;
        }

        const str = matchString(text, i);
        if (str && str.end > i) {
            push(i, str.end, "fh-cpp-string");
            next.rawDelim = str.rawDelim;
            i = str.end;
            expectType = false;
            if (str.rawDelim !== null) {
                break;
            }
            continue;
        }

        if (ch === "." && /\d/.test(text[i + 1] ?? "")) {
            const num = NUMBER_RE.exec(text.slice(i));
            if (num) {
                push(i, i + num[0].length, "fh-cpp-number");
                i += num[0].length;
                expectType = false;
                continue;
            }
        }
        if (/\d/.test(ch)) {
            const num = NUMBER_RE.exec(text.slice(i));
            if (num) {
                push(i, i + num[0].length, "fh-cpp-number");
                i += num[0].length;
                expectType = false;
                continue;
            }
        }

        const identLen = readIdent(text, i);
        if (identLen) {
            const word = text.slice(i, i + identLen);
            let cls: TokenClass;
            if (TYPES.has(word)) {
                cls = "fh-cpp-type";
                expectType = false;
            } else if (KEYWORDS.has(word)) {
                cls = "fh-cpp-keyword";
                expectType = TYPE_INTRODUCERS.has(word);
            } else if (expectType) {
                cls = "fh-cpp-type";
                expectType = false;
            } else if (isCall(text, i + identLen)) {
                cls = "fh-cpp-func";
            } else {
                cls = "fh-cpp-var";
            }
            push(i, i + identLen, cls);
            i += identLen;
            continue;
        }

        const op = OP_RE.exec(text.slice(i));
        if (op) {
            push(i, i + op[0].length, "fh-cpp-plain");
            i += op[0].length;
            expectType = false;
            continue;
        }

        push(i, i + 1, "fh-cpp-plain");
        i++;
        expectType = false;
    }

    return { pieces, state: next };
}

function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    let fence: { char: "`" | "~"; lang: string } | null = null;
    let scan: ScanState = { blockComment: false, rawDelim: null };

    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const found = fenceAt(line.text);
        if (fence) {
            if (found && found.char === fence.char && found.lang === "") {
                fence = null;
                scan = { blockComment: false, rawDelim: null };
                continue;
            }
            if (!isCppLang(fence.lang)) {
                continue;
            }
            builder.add(line.from, line.from, cppLine);
            const scanned = scanCppLine(line.text, scan);
            scan = scanned.state;
            for (const piece of scanned.pieces) {
                builder.add(line.from + piece.from, line.from + piece.to, tokenMark(piece.cls));
            }
            continue;
        }
        if (found) {
            fence = found;
            scan = { blockComment: false, rawDelim: null };
        }
    }

    return builder.finish();
}

const cppHighlightPlugin = ViewPlugin.fromClass(
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

/** 源码模式：自己切词，避免 Obsidian 把关键字和变量涂成同一个蓝。 */
export function createCppHighlightExtension(): Extension {
    return cppHighlightPlugin;
}

interface PrismLike {
    languages: Record<string, unknown>;
}

function wordPattern(words: Set<string>): RegExp {
    const body = [...words].sort((a, b) => b.length - a.length).join("|");
    return new RegExp(`\\b(?:${body})\\b`);
}

/** 阅读视图：覆盖 Prism 的 cpp，把类型、关键字、函数、变量分开。 */
export function registerCppPrismLanguages(prism: PrismLike): void {
    const grammar = {
        comment: [
            { pattern: /\/\*[\s\S]*?(?:\*\/|$)/, greedy: true },
            { pattern: /(^|[^\\])\/\/.*/, lookbehind: true, greedy: true },
        ],
        string: {
            pattern:
                /(?:u8|u|U|L)?(?:R"(?:[^()\\\r\n]{0,16})\([\s\S]*?\)\1"|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*')/,
            greedy: true,
        },
        macro: {
            pattern: /(^[ \t]*)#[ \t]*[a-zA-Z_]\w*/m,
            lookbehind: true,
            alias: "property",
        },
        number:
            /\b(?:0x[\da-f]+|0b[01]+|(?:\d+\.\d*|\.\d+)(?:e[+-]?\d+)?|\d+(?:e[+-]?\d+)?)(?:u|l|ll|z|f)?\b/i,
        keyword: wordPattern(KEYWORDS),
        "class-name": {
            pattern: /(\b(?:class|struct|enum|union)\s+)\w+\b/,
            lookbehind: true,
        },
        type: {
            pattern: wordPattern(TYPES),
            alias: "class-name",
        },
        function: /\b[A-Za-z_]\w*(?=\s*\()/,
        variable: /\b[A-Za-z_]\w*\b/,
    };

    for (const lang of CPP_LANGS) {
        prism.languages[lang] = grammar;
    }
}
