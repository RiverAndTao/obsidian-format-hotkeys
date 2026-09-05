import { RangeSetBuilder, StateEffect, Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
} from "@codemirror/view";
import { MarkdownView, type App } from "obsidian";

/** 行首 `(1)` / `（1）` 括号编号，课本常用写法 */
const PAREN_ITEM_RE = /^(\s*)(?:\((\d+)\)|（(\d+)）)/;

const HEADING_RE = /^#{1,6}\s/;
const FENCE_RE = /^(\s*)```/;
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

export const refreshParenListEffect = StateEffect.define<null>();

const itemLineDeco = Decoration.line({ class: "typora-paren-list-item" });
const bodyLineDeco = Decoration.line({ class: "typora-paren-list-body" });
const markerDeco = Decoration.mark({ class: "typora-paren-list-marker" });

function isTyporaModeOn(): boolean {
    return document.body.classList.contains("typora-mode-active");
}

function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    if (!isTyporaModeOn()) {
        return Decoration.none;
    }

    const doc = view.state.doc;
    let inParenBlock = false;
    let blankRun = 0;
    /** 连续空行达到该数量则认为括号列表已结束，后面按正文 */
    const BLANK_BREAK = 3;

    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const text = line.text;

        if (/^\s*$/.test(text)) {
            blankRun++;
            if (inParenBlock && blankRun >= BLANK_BREAK) {
                inParenBlock = false;
            }
            continue;
        }

        blankRun = 0;

        if (FENCE_RE.test(text)) {
            inParenBlock = false;
            continue;
        }
        if (HEADING_RE.test(text) || HR_RE.test(text)) {
            inParenBlock = false;
            continue;
        }

        const match = text.match(PAREN_ITEM_RE);
        if (match) {
            inParenBlock = true;
            builder.add(line.from, line.from, itemLineDeco);
            const markerLen = match[0].length;
            builder.add(line.from, line.from + markerLen, markerDeco);
            continue;
        }

        if (inParenBlock) {
            builder.add(line.from, line.from, bodyLineDeco);
        }
    }

    return builder.finish();
}

const parenListPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            const forced = update.transactions.some((tr) =>
                tr.effects.some((e) => e.is(refreshParenListEffect))
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

export function createParenListExtension(): Extension {
    return parenListPlugin;
}

/** Typora 开关后刷新所有源码编辑器中的括号列表装饰 */
export function refreshParenListDecorations(app: App): void {
    app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || view.getMode() !== "source") {
            return;
        }
        const cm = (view.editor as unknown as { cm?: EditorView }).cm;
        if (cm) {
            cm.dispatch({ effects: refreshParenListEffect.of(null) });
        }
    });
}
