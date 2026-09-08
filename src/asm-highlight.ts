import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";
import { MarkdownView, type App } from "obsidian";

const ASM_LANGS = new Set(["arm", "armasm", "asm", "gas", "nasm", "objdump", "x86asm"]);

const INSTRUCTIONS = new Set(
    [
        "push", "pop", "mov", "movb", "movw", "movl", "movq", "movzbl", "movzwl", "movsbl", "movswl",
        "lea", "leal", "leaq",
        "add", "addl", "addq", "adc", "sub", "subl", "subq", "sbb", "inc", "dec", "neg", "not",
        "mul", "imul", "div", "idiv",
        "and", "or", "xor", "shl", "shr", "sal", "sar", "rol", "ror",
        "cmp", "test", "nop",
        "jmp", "je", "jne", "jz", "jnz", "ja", "jae", "jb", "jbe", "jl", "jle", "jg", "jge", "js", "jns", "call", "ret", "leave",
        "pushl", "popl", "int", "syscall",
        "ldr", "ldrb", "ldrh", "ldp", "str", "strb", "strh", "stp",
        "b", "bl", "bx", "blx", "beq", "bne", "blt", "bgt", "ble", "bge",
        "svc", "mrs", "msr", "cbz", "cbnz",
    ]
);

const REGISTERS = new Set(
    [
        "eax", "ebx", "ecx", "edx", "esi", "edi", "ebp", "esp", "eip",
        "rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp", "rip",
        "ax", "bx", "cx", "dx", "si", "di", "bp", "sp", "ip",
        "al", "ah", "bl", "bh", "cl", "ch", "dl", "dh",
        "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15",
        "cs", "ds", "es", "fs", "gs", "ss",
        "sp", "lr", "pc", "ip", "fp", "sl",
    ]
);

for (let i = 0; i <= 31; i++) {
    REGISTERS.add(`r${i}`);
    REGISTERS.add(`w${i}`);
    REGISTERS.add(`x${i}`);
}

const decoCache = new Map<string, Decoration>();

function tokenMark(type: string): Decoration {
    let deco = decoCache.get(type);
    if (!deco) {
        deco = Decoration.mark({ class: `cm-${type}` });
        decoCache.set(type, deco);
    }
    return deco;
}

function isAsmLang(info: string): boolean {
    const lang = info.trim().toLowerCase().split(/[\s:{]/)[0] ?? "";
    return ASM_LANGS.has(lang);
}

function fenceLang(text: string): string | null {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("```")) {
        return null;
    }
    return trimmed.slice(3).trim();
}

function tokenizeLine(from: number, text: string, builder: RangeSetBuilder<Decoration>): void {
    let i = 0;
    const n = text.length;

    const add = (start: number, end: number, type: string): void => {
        if (end > start) {
            builder.add(from + start, from + end, tokenMark(type));
        }
    };

    while (i < n) {
        const ch = text[i];
        if (ch === " " || ch === "\t") {
            i++;
            continue;
        }

        if (ch === ";" || (ch === "#" && (i === 0 || text[i - 1] === " " || text[i - 1] === "\t"))) {
            add(i, n, "comment");
            return;
        }

        if (ch === "<") {
            const close = text.indexOf(">", i + 1);
            if (close > i) {
                add(i, close + 1, "def");
                i = close + 1;
                continue;
            }
        }

        const rest = text.slice(i);

        const addr = rest.match(/^[0-9a-fA-F]+:/);
        if (addr) {
            add(i, i + addr[0].length, "number");
            i += addr[0].length;
            continue;
        }

        const ident = rest.match(/^%?[A-Za-z_.][\w.]*/);
        if (ident) {
            const raw = ident[0];
            const core = raw.startsWith("%") ? raw.slice(1).toLowerCase() : raw.toLowerCase();
            if (raw.startsWith("%") || REGISTERS.has(core)) {
                add(i, i + raw.length, "variable-2");
            } else if (INSTRUCTIONS.has(core)) {
                add(i, i + raw.length, "keyword");
            } else if (/^[0-9a-fA-F]+$/.test(raw)) {
                add(i, i + raw.length, "number");
            } else {
                add(i, i + raw.length, "variable");
            }
            i += raw.length;
            continue;
        }

        const num = rest.match(/^\$?(?:0x[0-9a-fA-F]+|\d+)\b/);
        if (num) {
            add(i, i + num[0].length, num[0].startsWith("$") ? "atom" : "number");
            i += num[0].length;
            continue;
        }

        if ("[],()*:+-".includes(ch)) {
            add(i, i + 1, "operator");
            i++;
            continue;
        }

        i++;
    }
}

function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    let lang: string | null = null;

    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const info = fenceLang(line.text);
        if (info !== null) {
            if (lang === null) {
                lang = info;
            } else {
                lang = null;
            }
            continue;
        }
        if (lang !== null && isAsmLang(lang)) {
            tokenizeLine(line.from, line.text, builder);
        }
    }

    return builder.finish();
}

export const refreshAsmHighlightEffect = StateEffect.define<null>();

const asmHighlightPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            const forced = update.transactions.some((tr) =>
                tr.effects.some((e) => e.is(refreshAsmHighlightEffect))
            );
            if (update.docChanged || update.viewportChanged || forced) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

export function createAsmHighlightExtension(): Extension {
    return asmHighlightPlugin;
}

export function refreshAsmHighlight(app: App): void {
    app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || view.getMode() !== "source") {
            return;
        }
        const cm = (view.editor as unknown as { cm?: EditorView }).cm;
        if (cm) {
            cm.dispatch({ effects: refreshAsmHighlightEffect.of(null) });
        }
    });
}

interface PrismLike {
    languages: Record<string, unknown>;
}

/** 阅读视图：给 Prism 补上 arm/asm 语法 */
export function registerAsmPrismLanguages(prism: PrismLike): void {
    const grammar = {
        comment: /;[^\n]*/,
        label: {
            pattern: /<[^>]+>/,
            alias: "function",
        },
        address: {
            pattern: /\b[0-9a-fA-F]+:/,
            alias: "number",
        },
        register: {
            pattern: /%(?:[er]?[abcd]x|[er]?[sd]i|[er]?[sb]p|eip|rip|r(?:1[0-5]|\d)|[abcd][lh])\b|\b(?:r|w|x)(?:[12]?\d|3[01])\b|\b(?:sp|lr|pc)\b/i,
            alias: "variable",
        },
        keyword: new RegExp(`\\b(?:${[...INSTRUCTIONS].join("|")})\\b`, "i"),
        number: /\$?(?:0x[0-9a-fA-F]+|\b\d+\b|\b[0-9a-fA-F]{2}\b)/,
        operator: /[[\](),*:+-]/,
    };

    for (const lang of ASM_LANGS) {
        if (!prism.languages[lang]) {
            prism.languages[lang] = grammar;
        }
    }
}
