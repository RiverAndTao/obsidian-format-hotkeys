import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** c / cpp 家族。阅读视图同类语言走 styles.css 里的 language-* */
const CPP_LANGS = new Set(["c", "cpp", "c++", "cc", "cxx", "h", "hpp", "hh", "hxx"]);

const cppLine = Decoration.line({ class: "fh-cpp" });

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

/** 行首围栏。返回标记字符和 info string；不是围栏则为 null。 */
function fenceAt(text: string): { char: "`" | "~"; lang: string } | null {
    const match = /^(?: {0,3}|\t)(```+|~~~+)(.*)$/.exec(text);
    if (!match) {
        return null;
    }
    const marker = match[1];
    const char = marker[0] === "~" ? "~" : "`";
    return { char, lang: match[2].trim() };
}

function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    let fence: { char: "`" | "~"; lang: string } | null = null;

    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const found = fenceAt(line.text);
        if (fence) {
            if (found && found.char === fence.char && found.lang === "") {
                fence = null;
            } else if (isCppLang(fence.lang)) {
                builder.add(line.from, line.from, cppLine);
            }
            continue;
        }
        if (found) {
            fence = found;
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

/** 源码模式：给 C/C++ 代码行加上 fh-cpp，便于按 VS Code 配色覆盖。 */
export function createCppHighlightExtension(): Extension {
    return cppHighlightPlugin;
}
