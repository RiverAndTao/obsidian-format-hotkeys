import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";
import { MarkdownView, type App } from "obsidian";
import { isRedColorValue } from "./inline-format";

export const refreshHtmlStyleEffect = StateEffect.define<null>();

const FONT_RE = /<font\b([^>]*)>([\s\S]*?)<\/font>/gi;
const SPAN_RE = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;

const hideTagDeco = Decoration.mark({ class: "typora-html-tag" });

function isTyporaModeOn(): boolean {
    return document.body.classList.contains("typora-mode-active");
}

function hideSyntaxOn(): boolean {
    return document.body.classList.contains("typora-hide-syntax");
}

function colorFromAttrs(attrs: string): string | null {
    const quoted = attrs.match(/\bcolor\s*=\s*["']([^"']+)["']/i);
    if (quoted) {
        return quoted[1].trim();
    }
    const bare = attrs.match(/\bcolor\s*=\s*([#\w()]+)/i);
    if (bare) {
        return bare[1].trim();
    }
    const style = attrs.match(/\bstyle\s*=\s*["']([^"']+)["']/i);
    if (style) {
        const color = style[1].match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        if (color) {
            return color[1].trim();
        }
    }
    return null;
}

function hasBoldWeight(attrs: string): boolean {
    return /font-weight\s*:\s*(bold|[6-9]00)/i.test(attrs);
}

function displayColor(cssColor: string): string {
    return isRedColorValue(cssColor) ? "var(--typora-red)" : cssColor;
}

function innerStyle(attrs: string): string {
    const color = colorFromAttrs(attrs);
    const parts: string[] = [];
    if (color) {
        parts.push(`color: ${displayColor(color)}`);
    }
    if (hasBoldWeight(attrs)) {
        parts.push("font-weight: 700");
    }
    return parts.join("; ");
}

interface TagHit {
    from: number;
    to: number;
    innerFrom: number;
    innerTo: number;
    style: string;
}

function collectHits(text: string, lineFrom: number): TagHit[] {
    const hits: TagHit[] = [];
    const pushAll = (pattern: RegExp): void => {
        const re = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;
        while ((match = re.exec(text))) {
            const full = match[0];
            const attrs = match[1] ?? "";
            const inner = match[2] ?? "";
            const style = innerStyle(attrs);
            if (!style) {
                continue;
            }
            const openLen = full.length - inner.length - closingLength(full);
            const innerFrom = lineFrom + match.index + openLen;
            const innerTo = innerFrom + inner.length;
            hits.push({
                from: lineFrom + match.index,
                to: lineFrom + match.index + full.length,
                innerFrom,
                innerTo,
                style,
            });
        }
    };
    pushAll(FONT_RE);
    pushAll(SPAN_RE);
    hits.sort((a, b) => a.from - b.from || a.to - b.to);
    return hits;
}

function closingLength(full: string): number {
    const close = full.match(/<\/(?:font|span)>$/i);
    return close ? close[0].length : 0;
}

function lineIsActive(view: EditorView, lineFrom: number, lineTo: number): boolean {
    for (const range of view.state.selection.ranges) {
        if (range.from <= lineTo && range.to >= lineFrom) {
            return true;
        }
    }
    return false;
}

function fenceLang(text: string): boolean {
    return text.trimStart().startsWith("```");
}

function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    if (!isTyporaModeOn()) {
        return Decoration.none;
    }

    const hideTags = hideSyntaxOn();
    const doc = view.state.doc;
    let inFence = false;

    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        if (fenceLang(line.text)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }

        const hits = collectHits(line.text, line.from);
        const active = lineIsActive(view, line.from, line.to);
        const hide = hideTags && !active;
        let lastTo = -1;

        for (const hit of hits) {
            if (hit.from < lastTo) {
                continue;
            }
            lastTo = hit.to;
            if (hide && hit.innerFrom > hit.from) {
                builder.add(hit.from, hit.innerFrom, hideTagDeco);
            }
            if (hit.innerTo > hit.innerFrom) {
                builder.add(
                    hit.innerFrom,
                    hit.innerTo,
                    Decoration.mark({
                        class: "typora-html-colored",
                        attributes: { style: hit.style },
                    })
                );
            }
            if (hide && hit.to > hit.innerTo) {
                builder.add(hit.innerTo, hit.to, hideTagDeco);
            }
        }
    }

    return builder.finish();
}

const htmlStylePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            const forced = update.transactions.some((tr) =>
                tr.effects.some((e) => e.is(refreshHtmlStyleEffect))
            );
            if (update.docChanged || update.selectionSet || update.viewportChanged || forced) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

export function createHtmlStyleExtension(): Extension {
    return htmlStylePlugin;
}

export function refreshHtmlStyleDecorations(app: App): void {
    app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || view.getMode() !== "source") {
            return;
        }
        const cm = (view.editor as unknown as { cm?: EditorView }).cm;
        if (cm) {
            cm.dispatch({ effects: refreshHtmlStyleEffect.of(null) });
        }
    });
}
