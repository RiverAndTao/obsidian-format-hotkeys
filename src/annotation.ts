import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { Editor, MarkdownView, Menu, Modal, Notice, Plugin, type App } from "obsidian";
import {
    cloneAnnoPalette,
    DEFAULT_ANNO_PALETTE,
    defaultAnnoColorId,
    sanitizeColorId,
    type AnnoPaletteColor,
} from "./anno-palette";
import {
    limitsFromBlocks,
    previewSegments,
    resizeReplacement,
    snapUnwrappedIndex,
    unwrapPos,
} from "./annotation-geom";

/**
 * 选区高亮 + 悬停批注。
 * 写法放在笔记正文里，阅读视图和源码模式都能看到：
 * <span class="fh-anno" data-color="yellow" data-fh-id="ab12cd" data-comment="解释">原文</span>
 * 有解释时，指针在高亮上停留一会儿才弹出；移开高亮后马上收起。
 * 点进弹出层后会保持打开，方便改文字和颜色。
 * 源码模式下高亮开头和结尾各有一条紫色竖线，可以分别拖动调整范围。
 */

/** 笔记里 data-color 的取值，对应设置里的颜色 id */
export type AnnoColor = string;

const COLOR_ID = /^[a-z][a-z0-9]{0,15}$/;

let readPalette: () => AnnoPaletteColor[] = () => cloneAnnoPalette(DEFAULT_ANNO_PALETTE);

export function bindAnnoPalette(get: () => AnnoPaletteColor[]): void {
    readPalette = () => {
        const list = get();
        return list.length ? list : cloneAnnoPalette(DEFAULT_ANNO_PALETTE);
    };
}

function palette(): AnnoPaletteColor[] {
    return readPalette();
}

function fallbackColor(): AnnoColor {
    return defaultAnnoColorId(palette());
}

export interface AnnotationSpan {
    from: number;
    to: number;
    innerFrom: number;
    innerTo: number;
    inner: string;
    color: AnnoColor;
    comment: string;
    id: string;
}

interface AnnoDraft {
    comment: string;
    color: AnnoColor;
    action: "save" | "remove";
}

/**
 * 标签用替换装饰藏起来，不要用 display:none。
 * display:none 没有盒模型，posAtCoords 会落到文档开头，向里收也读不到正文位置。
 */
const hideTag = Decoration.replace({ inclusive: false });

function encodeAttr(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\r\n|\r|\n/g, "&#10;");
}

function decodeAttr(text: string): string {
    return text
        .replace(/&#10;/g, "\n")
        .replace(/&#13;/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function readAttr(attrs: string, name: string): string | null {
    const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
    const match = attrs.match(re);
    if (!match) {
        return null;
    }
    return decodeAttr(match[2]);
}

function parseAnnoAttrs(attrs: string): { color: AnnoColor; comment: string; id: string } | null {
    const className = readAttr(attrs, "class");
    if (!className || !className.split(/\s+/).includes("fh-anno")) {
        return null;
    }
    const colorRaw = readAttr(attrs, "data-color") ?? "";
    const color = COLOR_ID.test(colorRaw.trim().toLowerCase()) ? colorRaw.trim().toLowerCase() : fallbackColor();
    const comment = (readAttr(attrs, "data-comment") ?? readAttr(attrs, "title") ?? "").trim();
    const idRaw = readAttr(attrs, "data-fh-id") ?? "";
    const id = /^[a-z0-9]{4,16}$/.test(idRaw) ? idRaw : "";
    return { color, comment, id };
}

function fenceRanges(doc: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const re = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/gm;
    let open: { index: number; char: string; len: number } | null = null;
    let match: RegExpExecArray | null;
    while ((match = re.exec(doc))) {
        const marker = match[1];
        const info = (match[2] ?? "").trim();
        if (!open) {
            open = { index: match.index, char: marker[0], len: marker.length };
            continue;
        }
        if (info === "" && marker[0] === open.char && marker.length >= open.len) {
            ranges.push([open.index, match.index + match[0].length]);
            open = null;
        }
    }
    if (open) {
        ranges.push([open.index, doc.length]);
    }
    return ranges;
}

function insideRange(pos: number, ranges: Array<[number, number]>): boolean {
    return ranges.some(([from, to]) => pos >= from && pos < to);
}

export function findAnnotations(doc: string): AnnotationSpan[] {
    const blocked = fenceRanges(doc);
    const out: AnnotationSpan[] = [];
    const re = /<span\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(doc))) {
        const parsed = parseAnnoAttrs(match[1] ?? "");
        if (!parsed) {
            continue;
        }
        const openAt = match.index;
        if (insideRange(openAt, blocked)) {
            continue;
        }
        const innerFrom = openAt + match[0].length;
        const close = doc.indexOf("</span>", innerFrom);
        if (close < 0) {
            continue;
        }
        const to = close + "</span>".length;
        out.push({
            from: openAt,
            to,
            innerFrom,
            innerTo: close,
            inner: doc.slice(innerFrom, close),
            color: parsed.color,
            comment: parsed.comment,
            id: parsed.id,
        });
        re.lastIndex = to;
    }
    return out;
}

export function buildAnnotation(inner: string, color: AnnoColor, comment: string, id: string): string {
    const safeColor = sanitizeColorId(color, fallbackColor());
    const safeId = /^[a-z0-9]{4,16}$/.test(id) ? id : "anno00";
    const parts = [`class="fh-anno"`, `data-color="${safeColor}"`, `data-fh-id="${safeId}"`];
    const text = comment.trim();
    if (text) {
        const encoded = encodeAttr(text);
        // title 留给阅读视图：有的净化规则会丢掉 data-comment，点状下划线由样式关掉
        parts.push(`data-comment="${encoded}"`, `title="${encoded}"`);
    }
    return `<span ${parts.join(" ")}>${inner}</span>`;
}

function createId(doc: string): string {
    const used = new Set(findAnnotations(doc).map((ann) => ann.id).filter(Boolean));
    for (let n = 0; n < 6; n++) {
        const id = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
        if (!used.has(id)) {
            return id;
        }
    }
    return Date.now().toString(36).slice(-8);
}

function posToOffset(doc: string, pos: { line: number; ch: number }): number {
    let line = 0;
    let i = 0;
    while (i < doc.length && line < pos.line) {
        if (doc.charCodeAt(i) === 10) {
            line++;
        }
        i++;
    }
    return Math.min(doc.length, i + Math.max(0, pos.ch));
}

function offsetToPos(doc: string, offset: number): { line: number; ch: number } {
    let line = 0;
    let start = 0;
    const end = Math.max(0, Math.min(offset, doc.length));
    for (let i = 0; i < end; i++) {
        if (doc.charCodeAt(i) === 10) {
            line++;
            start = i + 1;
        }
    }
    return { line, ch: end - start };
}

function askAnnotation(app: App, initial: { comment: string; color: AnnoColor }, title: string, allowRemove: boolean): Promise<AnnoDraft | null> {
    return new AnnotationModal(app, initial, title, allowRemove).openAndWait();
}

class AnnotationModal extends Modal {
    private resolve: (value: AnnoDraft | null) => void;
    private settled = false;
    private color: AnnoColor;

    constructor(
        app: App,
        private initial: { comment: string; color: AnnoColor },
        private titleText: string,
        private allowRemove: boolean
    ) {
        super(app);
        this.color = initial.color;
        this.resolve = () => undefined;
    }

    openAndWait(): Promise<AnnoDraft | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        contentEl.addClass("fh-anno-modal");
        titleEl.setText(this.titleText);
        contentEl.createEl("p", {
            text: "高亮会留在原文上。写下解释后，鼠标在高亮上停一会儿才会显示，移开就收起；点进去即可修改。源码模式里，高亮开头和结尾各有一条紫线，可以分别拖动调整范围。解释可以留空，只保留高亮。",
            cls: "fh-anno-modal-desc",
        });

        const colors = contentEl.createDiv({ cls: "fh-anno-colors" });
        const paint = (): void => {
            colors.empty();
            for (const item of palette()) {
                const active = item.id === this.color;
                const btn = colors.createEl("button", {
                    cls: `fh-anno-swatch${active ? " is-active" : ""}`,
                    attr: {
                        type: "button",
                        "aria-label": item.name,
                        "aria-pressed": active ? "true" : "false",
                        title: item.name,
                    },
                });
                btn.style.background = item.hex;
                btn.addEventListener("click", () => {
                    this.color = item.id;
                    paint();
                });
            }
        };
        paint();

        const input = contentEl.createEl("textarea", {
            cls: "fh-anno-input",
            attr: { placeholder: "解释或评论，可留空", rows: "5" },
        });
        input.value = this.initial.comment;

        const row = contentEl.createDiv({ cls: "fh-anno-modal-actions" });
        if (this.allowRemove) {
            const removeBtn = row.createEl("button", { text: "移除" });
            removeBtn.addEventListener("click", () => {
                this.finish({ comment: input.value, color: this.color, action: "remove" });
            });
        }
        const right = row.createDiv({ cls: "fh-anno-modal-actions-right" });
        right.createEl("button", { text: "取消" }).addEventListener("click", () => {
            this.finish(null);
        });
        const save = right.createEl("button", { text: "保存", cls: "mod-cta" });
        save.addEventListener("click", () => {
            this.finish({ comment: input.value, color: this.color, action: "save" });
        });

        input.addEventListener("keydown", (ev: KeyboardEvent) => {
            if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
                ev.preventDefault();
                this.finish({ comment: input.value, color: this.color, action: "save" });
            }
        });
        window.setTimeout(() => input.focus(), 0);
    }

    private finish(value: AnnoDraft | null): void {
        if (this.settled) {
            return;
        }
        this.settled = true;
        this.resolve(value);
        this.close();
    }

    onClose(): void {
        if (!this.settled) {
            this.settled = true;
            this.resolve(null);
        }
        this.contentEl.empty();
    }
}

function annotationTouching(doc: string, from: number, to: number): AnnotationSpan | null {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const anns = findAnnotations(doc);
    if (start === end) {
        return anns.find((ann) => start >= ann.from && start <= ann.to) ?? null;
    }
    return anns.find((ann) => start < ann.to && end > ann.from) ?? null;
}

/** 按 id 找回批注；id 被复制成多条时改用原来的位置，避免改到另一条 */
function resolveAnnotation(doc: string, ann: AnnotationSpan): AnnotationSpan | null {
    const anns = findAnnotations(doc);
    const sameId = ann.id ? anns.filter((item) => item.id === ann.id) : [];
    if (sameId.length === 1) {
        return sameId[0];
    }
    const pool = sameId.length > 1 ? sameId : anns;
    return (
        pool.find((item) => item.from === ann.from && item.to === ann.to) ??
        pool.find((item) => item.from === ann.from && item.inner === ann.inner) ??
        null
    );
}

function replaceSpan(editor: Editor, ann: AnnotationSpan, next: string): void {
    const doc = editor.getValue();
    const target = resolveAnnotation(doc, ann) ?? ann;
    if (!doc.slice(target.from, target.to).startsWith("<span")) {
        new Notice("批注位置已变化，请重试");
        return;
    }
    editor.replaceRange(next, offsetToPos(doc, target.from), offsetToPos(doc, target.to));
}

export async function promptAnnotation(app: App, editor: Editor): Promise<void> {
    const doc = editor.getValue();
    const rawFrom = posToOffset(doc, editor.getCursor("from"));
    const rawTo = posToOffset(doc, editor.getCursor("to"));
    const from = Math.min(rawFrom, rawTo);
    const to = Math.max(rawFrom, rawTo);
    const hit = annotationTouching(doc, from, to);
    if (from === to) {
        if (hit) {
            await editAnnotation(app, editor, hit);
            return;
        }
        new Notice("请先选中要高亮的文字");
        return;
    }
    if (hit) {
        const inside = from >= hit.innerFrom && to <= hit.innerTo;
        if (inside) {
            await editAnnotation(app, editor, hit);
            return;
        }
        new Notice("选区与已有批注重叠");
        return;
    }
    if (fenceRanges(doc).some(([a, b]) => from < b && to > a)) {
        new Notice("代码块里不能添加批注");
        return;
    }
    const selected = editor.getSelection();
    if (!selected.trim()) {
        new Notice("请先选中要高亮的文字");
        return;
    }
    if (/<\/?span\b/i.test(selected)) {
        new Notice("选区里已有 span 标签，请换一段文字");
        return;
    }
    const result = await askAnnotation(app, { comment: "", color: fallbackColor() }, "高亮并批注", false);
    if (!result || result.action !== "save") {
        return;
    }
    const current = editor.getSelection();
    if (current !== selected) {
        new Notice("选区已变化，请重新添加");
        return;
    }
    editor.replaceSelection(buildAnnotation(current, result.color, result.comment, createId(editor.getValue())));
}

export async function editAnnotation(app: App, editor: Editor, ann: AnnotationSpan): Promise<void> {
    const result = await askAnnotation(app, { comment: ann.comment, color: ann.color }, "编辑批注", true);
    if (!result) {
        return;
    }
    const docNow = editor.getValue();
    const freshNow = resolveAnnotation(docNow, ann) ?? ann;
    if (result.action === "remove") {
        replaceSpan(editor, freshNow, freshNow.inner);
        return;
    }
    const id = freshNow.id || createId(docNow);
    replaceSpan(editor, freshNow, buildAnnotation(freshNow.inner, result.color, result.comment, id));
}

export function editAnnotationAtCursor(app: App, editor: Editor): void {
    const doc = editor.getValue();
    const pos = posToOffset(doc, editor.getCursor("from"));
    const hit = annotationTouching(doc, pos, pos);
    if (!hit) {
        new Notice("光标不在批注上");
        return;
    }
    void editAnnotation(app, editor, hit);
}

export function removeAnnotationAtCursor(editor: Editor): void {
    const doc = editor.getValue();
    const from = posToOffset(doc, editor.getCursor("from"));
    const to = posToOffset(doc, editor.getCursor("to"));
    const hit = annotationTouching(doc, from, to);
    if (!hit) {
        new Notice("光标不在批注上");
        return;
    }
    replaceSpan(editor, hit, hit.inner);
}

export function addAnnotationMenuItems(menu: Menu, app: App, editor: Editor): void {
    menu.addItem((item) => {
        item.setTitle("高亮并批注");
        item.onClick(() => promptAnnotation(app, editor));
    });
    const doc = editor.getValue();
    const pos = posToOffset(doc, editor.getCursor("from"));
    const hit = annotationTouching(doc, pos, pos);
    if (!hit) {
        return;
    }
    menu.addItem((item) => {
        item.setTitle("编辑批注");
        item.onClick(() => void editAnnotation(app, editor, hit));
    });
    menu.addItem((item) => {
        item.setTitle("移除批注");
        item.onClick(() => replaceSpan(editor, hit, hit.inner));
    });
}

function revealsSource(view: EditorView, ann: AnnotationSpan): boolean {
    for (const range of view.state.selection.ranges) {
        const start = Math.min(range.from, range.to);
        const end = Math.max(range.from, range.to);
        if (start === end) {
            if (start > ann.from && start < ann.innerFrom) {
                return true;
            }
            if (start > ann.innerTo && start < ann.to) {
                return true;
            }
            continue;
        }
        const touchesOpen = start < ann.innerFrom && end > ann.from;
        const touchesClose = start < ann.to && end > ann.innerTo;
        if (touchesOpen || touchesClose) {
            return true;
        }
    }
    return false;
}

function markFor(ann: AnnotationSpan): Decoration {
    const attributes: Record<string, string> = {
        "data-color": ann.color,
    };
    if (ann.id) {
        attributes["data-fh-id"] = ann.id;
    }
    if (ann.comment) {
        attributes["data-comment"] = ann.comment;
    }
    return Decoration.mark({ class: "fh-anno", attributes });
}

function buildAnnotationDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc.toString();
    let cursor = 0;
    for (const ann of findAnnotations(doc)) {
        if (ann.from < cursor || ann.to < ann.from) {
            continue;
        }
        const showSource = revealsSource(view, ann);
        if (!showSource && ann.innerFrom > ann.from) {
            builder.add(ann.from, ann.innerFrom, hideTag);
        }
        if (ann.innerTo > ann.innerFrom) {
            builder.add(ann.innerFrom, ann.innerTo, markFor(ann));
        }
        if (!showSource && ann.to > ann.innerTo) {
            builder.add(ann.innerTo, ann.to, hideTag);
        }
        cursor = ann.to;
    }
    return builder.finish();
}

/** 光标只在标签上时才需要重画；在正文里点一下不要拆掉高亮节点，否则弹出层会跟着缩回去 */
let noteAnnotationDocChanged = (_view: EditorView): void => {
    void _view;
};

function revealSignature(view: EditorView): string {
    const doc = view.state.doc.toString();
    let key = "";
    for (const ann of findAnnotations(doc)) {
        key += revealsSource(view, ann) ? "1" : "0";
    }
    return key;
}

const annotationPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;
        revealKey: string;

        constructor(view: EditorView) {
            this.decorations = buildAnnotationDecorations(view);
            this.revealKey = revealSignature(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged) {
                this.decorations = buildAnnotationDecorations(update.view);
                this.revealKey = revealSignature(update.view);
                noteAnnotationDocChanged(update.view);
                return;
            }
            if (!update.selectionSet) {
                return;
            }
            const key = revealSignature(update.view);
            if (key !== this.revealKey) {
                this.revealKey = key;
                this.decorations = buildAnnotationDecorations(update.view);
            }
        }
    },
    {
        decorations: (value) => value.decorations,
    }
);

export function createAnnotationExtension(): Extension {
    return annotationPlugin;
}

interface HostHit {
    md: MarkdownView;
    cm: EditorView | null;
    ann: AnnotationSpan;
    doc: string;
}

interface CaretStop {
    pos: number;
    x: number;
    top: number;
    bottom: number;
}

interface ResizeDrag {
    ann: AnnotationSpan;
    doc: string;
    edge: "start" | "end";
    ns: number;
    ne: number;
    originNs: number;
    originNe: number;
    minNs: number;
    maxNe: number;
    /** 当前视觉行上，每个可见字的光标位置。拖动时只在这里面挑 */
    stops: CaretStop[];
    stopsKey: string;
}

interface Box {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

interface AnnoSession {
    host: HTMLElement;
    md: MarkdownView;
    cm: EditorView | null;
    ann: AnnotationSpan;
    doc: string;
    pointerY: number;
    tip: HTMLElement | null;
    bridge: HTMLElement | null;
    textarea: HTMLTextAreaElement | null;
    grips: HTMLElement[];
    previews: HTMLElement[];
    color: AnnoColor;
    /** 已经点进弹出层或正在拖范围，移开鼠标也不收 */
    engaged: boolean;
    dirty: boolean;
    applying: boolean;
    hideTimer: number | null;
    resize: ResizeDrag | null;
}

/** 停在高亮上再弹出，避免指针扫过时闪一下 */
const SHOW_DELAY_MS = 500;
/** 离开高亮后尽快收起；短延迟只为了能移进弹出层 */
const HIDE_DELAY_MS = 80;

let hoverApp: App | null = null;
let session: AnnoSession | null = null;
let hoverToken = 0;
let lastX = 0;
let lastY = 0;
let placeRaf = 0;
let dragFrame = 0;
let dragMoved = false;
let saving = false;
let showTimer: number | null = null;
let showHost: HTMLElement | null = null;
let showPointerY = 0;

function clampNum(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function clearPreviews(): void {
    if (!session) {
        return;
    }
    for (const el of session.previews) {
        el.remove();
    }
    session.previews = [];
}

function cancelShow(): void {
    if (showTimer !== null) {
        window.clearTimeout(showTimer);
        showTimer = null;
    }
    showHost = null;
}

function cancelDragFrame(): void {
    if (dragFrame) {
        window.cancelAnimationFrame(dragFrame);
        dragFrame = 0;
    }
}

function closeSession(): void {
    cancelShow();
    cancelDragFrame();
    dragMoved = false;
    if (placeRaf) {
        window.cancelAnimationFrame(placeRaf);
        placeRaf = 0;
    }
    if (!session) {
        return;
    }
    if (session.hideTimer !== null) {
        window.clearTimeout(session.hideTimer);
    }
    session.tip?.remove();
    session.bridge?.remove();
    for (const grip of session.grips) {
        grip.remove();
    }
    clearPreviews();
    document.body.classList.remove("fh-anno-resizing");
    session = null;
}

export function destroyAnnotationTooltip(): void {
    closeSession();
}

function keepOpen(): boolean {
    if (!session) {
        return false;
    }
    if (session.resize || session.engaged || session.dirty) {
        return true;
    }
    const active = document.activeElement;
    return !!(session.tip && active instanceof Node && session.tip.contains(active));
}

function cancelHide(): void {
    if (session?.hideTimer != null) {
        window.clearTimeout(session.hideTimer);
        session.hideTimer = null;
    }
}

function scheduleHide(): void {
    if (!session || keepOpen()) {
        return;
    }
    cancelHide();
    session.hideTimer = window.setTimeout(() => {
        if (!session) {
            return;
        }
        session.hideTimer = null;
        if (keepOpen()) {
            return;
        }
        const under = document.elementFromPoint(lastX, lastY);
        if (under && isSessionNode(under)) {
            return;
        }
        closeSession();
    }, HIDE_DELAY_MS) as unknown as number;
}

function annoHostOf(node: Node): HTMLElement | null {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) {
        return null;
    }
    const host = el.closest(".fh-anno");
    return host instanceof HTMLElement ? host : null;
}

function hostsMatch(a: HTMLElement, b: HTMLElement): boolean {
    if (a === b) {
        return true;
    }
    const ida = a.getAttribute("data-fh-id") ?? "";
    const idb = b.getAttribute("data-fh-id") ?? "";
    if (ida || idb) {
        return ida !== "" && ida === idb;
    }
    const cm = EditorView.findFromDOM(a);
    if (!cm || EditorView.findFromDOM(b) !== cm) {
        return false;
    }
    try {
        const pa = cm.posAtDOM(a, 1);
        const pb = cm.posAtDOM(b, 1);
        for (const ann of findAnnotations(cm.state.doc.toString())) {
            const inside = (pos: number): boolean => pos >= ann.innerFrom && pos < ann.innerTo;
            if (inside(pa) && inside(pb)) {
                return true;
            }
        }
    } catch {
        return false;
    }
    return false;
}

function pointerOnHost(host: HTMLElement): boolean {
    const under = document.elementFromPoint(lastX, lastY);
    if (!(under instanceof Node)) {
        return false;
    }
    const current = annoHostOf(under);
    return !!current && hostsMatch(current, host);
}

function pointerStillOnHost(host: HTMLElement, related: EventTarget | null, x: number, y: number): boolean {
    if (related instanceof Node) {
        const next = annoHostOf(related);
        if (next && hostsMatch(next, host)) {
            return true;
        }
        return related instanceof Element && (host === related || host.contains(related));
    }
    const under = document.elementFromPoint(x, y);
    if (!(under instanceof Node)) {
        return false;
    }
    const next = annoHostOf(under);
    return !!next && hostsMatch(next, host);
}

function scheduleShow(host: HTMLElement, pointerY: number): void {
    showPointerY = pointerY;
    if (showHost && hostsMatch(showHost, host)) {
        showHost = host;
        return;
    }
    cancelShow();
    showHost = host;
    showTimer = window.setTimeout(() => {
        showTimer = null;
        const pending = showHost;
        const y = showPointerY;
        showHost = null;
        if (!pending || !pending.isConnected || !pointerOnHost(pending)) {
            return;
        }
        openFromHost(pending, y);
    }, SHOW_DELAY_MS) as unknown as number;
}

function quickSame(host: HTMLElement): boolean {
    if (!session) {
        return false;
    }
    if (host === session.host) {
        return true;
    }
    if (session.cm) {
        try {
            const pos = session.cm.posAtDOM(host, 0);
            return pos >= session.ann.innerFrom && pos <= session.ann.innerTo;
        } catch {
            return false;
        }
    }
    const id = host.getAttribute("data-fh-id") ?? "";
    if (id && session.ann.id && id === session.ann.id) {
        return true;
    }
    const comment = host.getAttribute("data-comment") ?? "";
    return comment === session.ann.comment && (host.textContent ?? "") === session.ann.inner;
}

function isSessionNode(node: Node): boolean {
    if (!session) {
        return false;
    }
    if (session.tip && (node === session.tip || session.tip.contains(node))) {
        return true;
    }
    if (session.bridge && (node === session.bridge || session.bridge.contains(node))) {
        return true;
    }
    for (const grip of session.grips) {
        if (node === grip || grip.contains(node)) {
            return true;
        }
    }
    const host = annoHostOf(node);
    return !!host && quickSame(host);
}

function pointerInTipBox(): boolean {
    if (!session?.tip) {
        return false;
    }
    const rect = session.tip.getBoundingClientRect();
    return lastX >= rect.left && lastX <= rect.right && lastY >= rect.top && lastY <= rect.bottom;
}

function viewContaining(app: App, el: HTMLElement): MarkdownView | null {
    let found: MarkdownView | null = null;
    app.workspace.iterateAllLeaves((leaf) => {
        if (found) {
            return;
        }
        const view = leaf.view;
        if (view instanceof MarkdownView && view.containerEl.contains(el)) {
            found = view;
        }
    });
    return found;
}

function cmOf(editor: Editor): EditorView | null {
    const cm = (editor as unknown as { cm?: EditorView }).cm;
    return cm ?? null;
}

function locate(data: string, view: MarkdownView, host: HTMLElement): AnnotationSpan | null {
    const anns = findAnnotations(data);
    const id = host.getAttribute("data-fh-id") ?? "";
    const sameId = id ? anns.filter((ann) => ann.id === id) : [];
    // 复制粘贴会带出相同 id，只有唯一一条时才按 id 命中
    if (sameId.length === 1) {
        return sameId[0];
    }
    const narrowed = sameId.length > 1 ? sameId : anns;
    if (view.getMode() === "source") {
        const cm = cmOf(view.editor);
        if (cm) {
            try {
                const pos = cm.posAtDOM(host, 0);
                const byPos = narrowed.find((ann) => pos >= ann.innerFrom && pos <= ann.innerTo);
                if (byPos) {
                    return byPos;
                }
            } catch {
                // 节点已经不在编辑器里
            }
        }
    }
    const comment = host.getAttribute("data-comment") ?? host.getAttribute("title") ?? "";
    const inner = host.textContent ?? "";
    return (
        narrowed.find((ann) => ann.comment === comment && ann.inner === inner) ??
        (inner ? narrowed.find((ann) => ann.inner === inner) ?? null : null)
    );
}

async function readNote(view: MarkdownView): Promise<string | null> {
    if (view.getMode() === "source") {
        try {
            return view.editor.getValue();
        } catch {
            return null;
        }
    }
    if (view.file) {
        try {
            return await view.app.vault.cachedRead(view.file);
        } catch {
            return null;
        }
    }
    return null;
}

async function applyHoverEdit(view: MarkdownView, ann: AnnotationSpan, build: (fresh: AnnotationSpan) => string): Promise<void> {
    const resolve = (data: string): AnnotationSpan | null => resolveAnnotation(data, ann);
    if (view.getMode() === "source") {
        const fresh = resolve(view.editor.getValue());
        if (!fresh) {
            new Notice("找不到这条批注");
            return;
        }
        replaceSpan(view.editor, fresh, build(fresh));
        return;
    }
    const file = view.file;
    if (!file) {
        new Notice("当前笔记无法修改");
        return;
    }
    const data = await view.app.vault.read(file);
    const fresh = resolve(data);
    if (!fresh) {
        new Notice("找不到这条批注");
        return;
    }
    const built = build(fresh);
    await view.app.vault.modify(file, data.slice(0, fresh.from) + built + data.slice(fresh.to));
}

function commentFromHost(host: HTMLElement): void {
    const data = host.getAttribute("data-comment");
    if (data && data.trim()) {
        host.removeAttribute("title");
        return;
    }
    const title = host.getAttribute("title");
    if (title && title.trim()) {
        host.setAttribute("data-comment", title);
        host.removeAttribute("title");
    }
}

function outsideBlocks(doc: string, ann: AnnotationSpan): Array<[number, number]> {
    const blocks: Array<[number, number]> = [];
    for (const [from, to] of fenceRanges(doc)) {
        if (to <= ann.from || from >= ann.to) {
            blocks.push([from, to]);
        }
    }
    for (const other of findAnnotations(doc)) {
        if (other.from === ann.from && other.to === ann.to) {
            continue;
        }
        if (other.to <= ann.from || other.from >= ann.to) {
            blocks.push([other.from, other.to]);
        }
    }
    return blocks;
}

function boxesBetween(view: EditorView, from: number, to: number): Box[] {
    if (to <= from) {
        return [];
    }
    let start: { node: Node; offset: number };
    let end: { node: Node; offset: number };
    try {
        start = view.domAtPos(from, 1);
        end = view.domAtPos(to, -1);
    } catch {
        return [];
    }
    const range = document.createRange();
    try {
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
    } catch {
        return [];
    }
    const boxes: Box[] = [];
    for (const rect of Array.from(range.getClientRects())) {
        if (rect.width < 0.5 || rect.height < 0.5) {
            continue;
        }
        boxes.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
    return boxes;
}

function nearestBox(boxes: Box[], y: number): Box {
    let best = boxes[0];
    let bestDist = Infinity;
    for (const box of boxes) {
        const mid = (box.top + box.bottom) / 2;
        const dist = Math.abs(mid - y);
        if (dist < bestDist) {
            best = box;
            bestDist = dist;
        }
    }
    return best;
}

function anchorBox(): Box | null {
    if (!session) {
        return null;
    }
    if (session.cm) {
        const boxes = boxesBetween(session.cm, session.ann.innerFrom, session.ann.innerTo);
        if (boxes.length) {
            return nearestBox(boxes, session.pointerY);
        }
        const caret = session.cm.coordsAtPos(session.ann.innerFrom, 1);
        if (!caret) {
            return null;
        }
        return { left: caret.left, right: caret.right, top: caret.top, bottom: caret.bottom };
    }
    if (!session.host.isConnected) {
        return null;
    }
    const rect = session.host.getBoundingClientRect();
    if (rect.width < 0.5 && rect.height < 0.5) {
        return null;
    }
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
}

function placeTip(tip: HTMLElement, box: Box): void {
    tip.style.visibility = "hidden";
    tip.style.display = "block";
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const pointerY = session?.pointerY ?? box.top;
    const lineTop = Math.min(box.bottom, Math.max(box.top, pointerY));
    let top = lineTop - height - 8;
    let left = box.left;
    if (top < 8) {
        top = Math.min(box.bottom, lineTop) + 8;
    }
    if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - width - 8;
    }
    if (left < 8) {
        left = 8;
    }
    if (top + height > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - height - 8);
    }
    const coversPointer = lastX >= left && lastX <= left + width && lastY >= top && lastY <= top + height;
    if (coversPointer) {
        const below = lastY + 18;
        if (below + height <= window.innerHeight - 8) {
            top = below;
        } else {
            top = Math.max(8, lastY - height - 18);
        }
    }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.visibility = "visible";
}

function placeBridge(bridge: HTMLElement, box: Box, tip: HTMLElement): void {
    const tipRect = tip.getBoundingClientRect();
    const above = tipRect.bottom <= box.top + 2;
    const below = tipRect.top >= box.bottom - 2;
    if (!above && !below) {
        bridge.style.display = "none";
        return;
    }
    const top = above ? tipRect.bottom - 10 : box.bottom - 10;
    const rawHeight = above ? box.top - tipRect.bottom + 20 : tipRect.top - box.bottom + 20;
    const height = Math.max(12, Math.min(40, rawHeight));
    const left = Math.min(tipRect.left, box.left);
    const right = Math.max(tipRect.right, box.right);
    bridge.style.display = "block";
    bridge.style.left = `${Math.round(left)}px`;
    bridge.style.top = `${Math.round(top)}px`;
    bridge.style.width = `${Math.max(24, Math.round(right - left))}px`;
    bridge.style.height = `${Math.round(height)}px`;
}

function caretBox(view: EditorView, pos: number, side: -1 | 1): Box | null {
    const caret = view.coordsAtPos(pos, side);
    if (!caret) {
        return null;
    }
    return { left: caret.left, right: caret.right, top: caret.top, bottom: caret.bottom };
}

function placeGripElement(el: HTMLElement, box: Box | null, edge: "start" | "end"): void {
    if (!box) {
        el.style.display = "none";
        return;
    }
    const raw = box.bottom - box.top;
    if (raw < 1) {
        el.style.display = "none";
        return;
    }
    const height = Math.max(16, raw);
    const line = 3;
    const boundary = edge === "start" ? box.left : Math.max(box.left, box.right);
    // 整条线放在高亮外侧，贴着边缘，避免被正文盖住后只看见结尾
    const x = edge === "start" ? boundary - line : boundary;
    const y = box.top - (height - raw) / 2;
    el.style.display = "block";
    el.style.width = `${line}px`;
    el.style.height = `${Math.round(height)}px`;
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
}

function pushRects(rects: Box[], node: HTMLElement): void {
    for (const rect of Array.from(node.getClientRects())) {
        if (rect.width < 1 || rect.height < 1) {
            continue;
        }
        rects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
}

/**
 * 直接量悬停的高亮色块。开头用第一行的左缘，结尾用最后一行的右缘。
 * 不要用光标坐标：它会把两端都落到词尾，看起来像两个紫色光标。
 */
function highlightEdges(cm: EditorView, ann: AnnotationSpan, host: HTMLElement): { start: Box; end: Box } | null {
    const nodes: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    const add = (node: HTMLElement): void => {
        if (seen.has(node) || !node.isConnected) {
            return;
        }
        seen.add(node);
        nodes.push(node);
    };
    if (host.classList.contains("fh-anno")) {
        add(host);
    }
    const id = (ann.id || host.getAttribute("data-fh-id") || "").trim();
    if (id) {
        cm.contentDOM.querySelectorAll<HTMLElement>(".fh-anno").forEach((node) => {
            if (node.getAttribute("data-fh-id") !== id) {
                return;
            }
            try {
                const pos = cm.posAtDOM(node, 0);
                if (pos < ann.innerFrom || pos >= ann.innerTo) {
                    return;
                }
            } catch {
                return;
            }
            add(node);
        });
    }
    const rects: Box[] = [];
    for (const node of nodes) {
        pushRects(rects, node);
    }
    if (!rects.length && host.isConnected) {
        const rect = host.getBoundingClientRect();
        if (rect.width >= 1 && rect.height >= 1) {
            rects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
        }
    }
    if (!rects.length) {
        return null;
    }
    rects.sort((a, b) => a.top - b.top || a.left - b.left);
    const firstLine = rects[0].top;
    const lastLine = rects[rects.length - 1].top;
    const head = rects.filter((rect) => Math.abs(rect.top - firstLine) < 4);
    const tail = rects.filter((rect) => Math.abs(rect.top - lastLine) < 4);
    let startX = Math.min(...head.map((rect) => rect.left));
    let endX = Math.max(...tail.map((rect) => rect.right));
    let startTop = Math.min(...head.map((rect) => rect.top));
    let startBottom = Math.max(...head.map((rect) => rect.bottom));
    let endTop = Math.min(...tail.map((rect) => rect.top));
    let endBottom = Math.max(...tail.map((rect) => rect.bottom));
    if (host.isConnected) {
        const box = host.getBoundingClientRect();
        if (box.width > 12 && endX - startX < Math.min(12, box.width * 0.5)) {
            startX = box.left;
            endX = box.right;
            startTop = box.top;
            startBottom = box.bottom;
            endTop = box.top;
            endBottom = box.bottom;
        }
    }
    if (endX - startX < 2) {
        return null;
    }
    return {
        start: { left: startX, right: startX, top: startTop, bottom: startBottom },
        end: { left: endX, right: endX, top: endTop, bottom: endBottom },
    };
}

function caretEdge(view: EditorView, pos: number, edge: "start" | "end"): Box | null {
    const caret = caretBox(view, pos, edge === "start" ? 1 : -1);
    if (!caret) {
        return null;
    }
    const x = edge === "start" ? caret.left : Math.max(caret.left, caret.right);
    return { left: x, right: x, top: caret.top, bottom: caret.bottom };
}

function placeGrips(): void {
    if (!session || session.grips.length < 2 || !session.cm || session.resize) {
        return;
    }
    const cm = session.cm;
    const ann = session.ann;
    const visual = highlightEdges(cm, ann, session.host);
    const endPos = ann.innerTo > ann.innerFrom ? ann.innerTo : ann.innerFrom;
    const start = visual?.start ?? caretEdge(cm, ann.innerFrom, "start");
    const end = visual?.end ?? caretEdge(cm, endPos, "end");
    placeGripElement(session.grips[0], start, "start");
    placeGripElement(session.grips[1], end, "end");
}

function placeAll(): void {
    if (!session || session.resize) {
        return;
    }
    placeGrips();
    if (!session.tip) {
        return;
    }
    const box = anchorBox();
    if (!box) {
        return;
    }
    placeTip(session.tip, box);
    if (session.bridge) {
        placeBridge(session.bridge, box, session.tip);
    }
}

function fitTextarea(input: HTMLTextAreaElement): void {
    input.style.height = "0px";
    const next = Math.min(220, Math.max(52, input.scrollHeight));
    input.style.height = `${next}px`;
}

function paintSwatches(colors: HTMLElement, s: AnnoSession): void {
    colors.empty();
    for (const item of palette()) {
        const active = item.id === s.color;
        const btn = colors.createEl("button", {
            cls: `fh-anno-swatch${active ? " is-active" : ""}`,
            attr: {
                type: "button",
                "aria-label": item.name,
                "aria-pressed": active ? "true" : "false",
                title: item.name,
            },
        });
        btn.style.background = item.hex;
        btn.addEventListener("click", () => {
            if (!session) {
                return;
            }
            session.color = item.id;
            session.engaged = true;
            const text = session.textarea?.value ?? session.ann.comment;
            session.dirty = item.id !== session.ann.color || text.trim() !== session.ann.comment;
            if (session.tip) {
                session.tip.dataset.color = item.id;
            }
            paintSwatches(colors, session);
        });
    }
}

function buildTip(s: AnnoSession): void {
    const tip = document.body.createDiv({ cls: "fh-anno-tip" });
    tip.style.visibility = "hidden";
    tip.dataset.color = s.color;
    const label = tip.createDiv({ cls: "fh-anno-tip-label", text: "批注" });
    label.title = "在外面点一下，或按 Esc 收起";
    const colors = tip.createDiv({ cls: "fh-anno-colors" });
    paintSwatches(colors, s);
    const input = tip.createEl("textarea", {
        cls: "fh-anno-tip-input",
        attr: { rows: "2", placeholder: "写解释，可留空" },
    });
    input.value = s.ann.comment;
    input.addEventListener("input", () => {
        if (!session) {
            return;
        }
        session.engaged = true;
        session.dirty = input.value.trim() !== session.ann.comment || session.color !== session.ann.color;
        fitTextarea(input);
    });
    input.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            void finishSession("save");
        }
    });
    tip.addEventListener("pointerdown", (ev) => {
        if (session) {
            session.engaged = true;
            cancelHide();
        }
        ev.stopPropagation();
    });
    tip.addEventListener("focusin", () => {
        if (!session) {
            return;
        }
        session.engaged = true;
        cancelHide();
    });
    const actions = tip.createDiv({ cls: "fh-anno-tip-actions" });
    const saveBtn = actions.createEl("button", {
        text: "保存",
        cls: "fh-anno-tip-btn mod-cta",
        attr: { type: "button", title: "Ctrl+Enter" },
    });
    const removeBtn = actions.createEl("button", { text: "移除", cls: "fh-anno-tip-btn", attr: { type: "button" } });
    saveBtn.addEventListener("click", () => void finishSession("save"));
    removeBtn.addEventListener("click", () => void finishSession("remove"));
    s.tip = tip;
    s.textarea = input;
    s.bridge = document.body.createDiv({ cls: "fh-anno-bridge" });
    fitTextarea(input);
}

function buildGrips(s: AnnoSession): void {
    const start = document.body.createDiv({
        cls: "fh-anno-grip",
        attr: { "data-edge": "start", "aria-label": "拖动调整高亮起点" },
    });
    const end = document.body.createDiv({
        cls: "fh-anno-grip",
        attr: { "data-edge": "end", "aria-label": "拖动调整高亮终点" },
    });
    start.addEventListener("pointerdown", (ev) => beginResize(ev, "start"));
    end.addEventListener("pointerdown", (ev) => beginResize(ev, "end"));
    s.grips = [start, end];
}

function sameHit(hit: HostHit): boolean {
    if (!session) {
        return false;
    }
    if (session.ann.id && hit.ann.id === session.ann.id) {
        const copies = findAnnotations(hit.doc).filter((item) => item.id === session!.ann.id);
        const fresh = resolveAnnotation(hit.doc, session.ann);
        if (copies.length === 1 && fresh) {
            return fresh.from === hit.ann.from && fresh.to === hit.ann.to;
        }
        if (fresh && fresh.from === hit.ann.from && fresh.to === hit.ann.to) {
            return true;
        }
    }
    return hit.ann.from === session.ann.from && hit.ann.to === session.ann.to;
}

function adopt(hit: HostHit, host: HTMLElement, pointerY: number): void {
    if (session && sameHit(hit)) {
        const moved = session.ann.from !== hit.ann.from || session.ann.to !== hit.ann.to || session.ann.inner !== hit.ann.inner;
        session.ann = hit.ann;
        session.doc = hit.doc;
        session.host = host;
        session.md = hit.md;
        session.cm = hit.cm ?? session.cm;
        if (!session.engaged && !session.dirty) {
            session.pointerY = pointerY;
        }
        cancelHide();
        if (moved) {
            placeAll();
        }
        if (session.cm && session.md.getMode() === "source" && session.grips.length === 0) {
            buildGrips(session);
            placeGrips();
        }
        return;
    }
    if (session?.engaged || session?.dirty || session?.resize) {
        return;
    }
    closeSession();
    const next: AnnoSession = {
        host,
        md: hit.md,
        cm: hit.cm,
        ann: hit.ann,
        doc: hit.doc,
        pointerY,
        tip: null,
        bridge: null,
        textarea: null,
        grips: [],
        previews: [],
        color: hit.ann.color,
        engaged: false,
        dirty: false,
        applying: false,
        hideTimer: null,
        resize: null,
    };
    session = next;
    if (hit.ann.comment.trim()) {
        buildTip(next);
    }
    if (hit.cm && hit.md.getMode() === "source") {
        buildGrips(next);
    }
    placeAll();
}

function openFromHost(host: HTMLElement, pointerY: number): void {
    const app = hoverApp;
    if (!app) {
        return;
    }
    const md = viewContaining(app, host);
    if (!md) {
        return;
    }
    commentFromHost(host);
    if (md.getMode() === "source") {
        hoverToken++;
        let doc: string;
        try {
            doc = md.editor.getValue();
        } catch {
            return;
        }
        const ann = locate(doc, md, host);
        if (!ann) {
            return;
        }
        const cm = EditorView.findFromDOM(host) ?? cmOf(md.editor);
        adopt({ md, cm, ann, doc }, host, pointerY);
        return;
    }
    const token = ++hoverToken;
    void readNote(md).then((data) => {
        if (token !== hoverToken || data === null) {
            return;
        }
        if (!host.isConnected || !host.matches(":hover")) {
            return;
        }
        const ann = locate(data, md, host);
        if (!ann) {
            return;
        }
        adopt({ md, cm: null, ann, doc: data }, host, pointerY);
    });
}

function paintBoxes(cm: EditorView, from: number, to: number, kind: "add" | "cut", color: AnnoColor): void {
    if (!session) {
        return;
    }
    for (const box of boxesBetween(cm, from, to)) {
        const el = document.body.createDiv({ cls: `fh-anno-preview is-${kind}` });
        el.dataset.color = color;
        el.style.left = `${box.left}px`;
        el.style.top = `${box.top}px`;
        el.style.width = `${Math.max(2, box.right - box.left)}px`;
        el.style.height = `${Math.max(2, box.bottom - box.top)}px`;
        session.previews.push(el);
    }
}

function paintDrag(): void {
    if (!session?.resize || !session.cm) {
        return;
    }
    const drag = session.resize;
    const cm = session.cm;
    clearPreviews();
    const parts = previewSegments(drag.ann, drag.ns, drag.ne);
    for (const [from, to] of parts.add) {
        paintBoxes(cm, from, to, "add", drag.ann.color);
    }
    for (const [from, to] of parts.cut) {
        paintBoxes(cm, from, to, "cut", drag.ann.color);
    }
}

function beginResize(ev: PointerEvent, edge: "start" | "end"): void {
    if (!session?.cm || session.resize) {
        return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const cm = session.cm;
    const doc = cm.state.doc.toString();
    const fresh = resolveAnnotation(doc, session.ann);
    if (!fresh) {
        new Notice("找不到这条批注");
        return;
    }
    session.ann = fresh;
    session.doc = doc;
    const limits = limitsFromBlocks(doc, fresh, outsideBlocks(doc, fresh));
    const originNs = fresh.from;
    const originNe = fresh.from + (fresh.innerTo - fresh.innerFrom);
    session.resize = {
        ann: fresh,
        doc,
        edge,
        ns: originNs,
        ne: originNe,
        originNs,
        originNe,
        minNs: Math.min(limits.minNs, originNs),
        maxNe: Math.max(limits.maxNe, originNe),
        stops: [],
        stopsKey: "",
    };
    dragMoved = false;
    session.engaged = true;
    for (const grip of session.grips) {
        // 把手是 fixed 层，挡着指针时 caret 命中的是把手而不是正文
        grip.style.pointerEvents = "none";
    }
    const grip = ev.currentTarget;
    if (grip instanceof HTMLElement) {
        grip.classList.add("is-dragging");
        try {
            grip.setPointerCapture(ev.pointerId);
        } catch {
            // 捕获失败时仍靠 window 上的 pointerup
        }
    }
    document.body.classList.add("fh-anno-resizing");
    if (session.tip) {
        session.tip.style.visibility = "hidden";
    }
    if (session.bridge) {
        session.bridge.style.display = "none";
    }
}

function reattachHost(): void {
    if (!session?.cm) {
        return;
    }
    const pos = session.ann.innerFrom < session.ann.innerTo ? session.ann.innerFrom : session.ann.from;
    let dom: { node: Node };
    try {
        dom = session.cm.domAtPos(pos, 1);
    } catch {
        return;
    }
    const base = dom.node instanceof Element ? dom.node : dom.node.parentElement;
    const host = base?.closest(".fh-anno");
    if (host instanceof HTMLElement) {
        session.host = host;
    }
}

function endResize(commit: boolean): void {
    // 第二步：松开后才按光标记下的范围改高亮文本
    const drag = session?.resize;
    if (!drag || !session) {
        return;
    }
    session.resize = null;
    clearPreviews();
    document.body.classList.remove("fh-anno-resizing");
    for (const grip of session.grips) {
        grip.classList.remove("is-dragging");
        grip.style.pointerEvents = "";
    }
    const showTip = (): void => {
        if (session?.tip) {
            session.tip.style.visibility = "visible";
        }
        placeAll();
    };
    const changed = drag.ns !== drag.originNs || drag.ne !== drag.originNe;
    if (!commit || !changed || !session.cm) {
        showTip();
        return;
    }
    const cm = session.cm;
    const md = session.md;
    const doc = cm.state.doc.toString();
    if (doc !== drag.doc) {
        new Notice("笔记已变化，请重试");
        showTip();
        return;
    }
    const fresh = resolveAnnotation(doc, drag.ann);
    if (!fresh) {
        new Notice("找不到这条批注");
        closeSession();
        return;
    }
    let ns = snapUnwrappedIndex(doc, fresh, drag.ns, "start");
    let ne = snapUnwrappedIndex(doc, fresh, drag.ne, "end");
    if (ne <= ns) {
        showTip();
        return;
    }
    ns = clampNum(ns, drag.minNs, ne - 1);
    ne = clampNum(ne, ns + 1, drag.maxNe);
    const edit = resizeReplacement(doc, fresh, ns, ne);
    if (!edit || (edit.before === "" && edit.after === "" && edit.inner === fresh.inner)) {
        showTip();
        return;
    }
    if (/<\/?span\b/i.test(edit.before + edit.inner + edit.after)) {
        new Notice("这里不能扩展高亮");
        showTip();
        return;
    }
    const comment = session.textarea?.value ?? fresh.comment;
    const color = session.color;
    const id = fresh.id || createId(doc);
    const built = buildAnnotation(edit.inner, color, comment, id);
    const next = edit.before + built + edit.after;
    session.applying = true;
    try {
        md.editor.replaceRange(next, offsetToPos(doc, edit.from), offsetToPos(doc, edit.to));
    } finally {
        session.applying = false;
    }
    const after = md.editor.getValue();
    if (after === doc) {
        showTip();
        return;
    }
    session.dirty = false;
    const updated =
        findAnnotations(after)
            .filter((item) => item.id === id && item.inner === edit.inner)
            .sort((a, b) => Math.abs(a.from - fresh.from) - Math.abs(b.from - fresh.from))[0] ?? null;
    if (updated && session) {
        session.ann = updated;
        session.doc = after;
        session.color = updated.color;
        if (session.textarea) {
            session.textarea.value = updated.comment;
        }
        if (session.tip) {
            session.tip.dataset.color = updated.color;
        }
    }
    window.requestAnimationFrame(() => {
        if (!session) {
            return;
        }
        reattachHost();
        showTip();
    });
}

async function finishSession(mode: "save" | "save-if-dirty" | "remove"): Promise<void> {
    const current = session;
    if (!current || saving) {
        return;
    }
    const ann = current.ann;
    const md = current.md;
    const color = current.color;
    const idDoc = current.doc;
    const comment = current.textarea?.value ?? ann.comment;
    const changed = comment.trim() !== ann.comment || color !== ann.color;
    if (mode !== "remove" && !changed) {
        closeSession();
        return;
    }
    closeSession();
    saving = true;
    try {
        if (mode === "remove") {
            await applyHoverEdit(md, ann, (fresh) => fresh.inner);
            return;
        }
        await applyHoverEdit(md, ann, (fresh) => buildAnnotation(fresh.inner, color, comment, fresh.id || createId(idDoc)));
    } finally {
        saving = false;
    }
}

function onMouseOver(evt: MouseEvent): void {
    lastX = evt.clientX;
    lastY = evt.clientY;
    const target = evt.target;
    if (!(target instanceof Node) || session?.resize) {
        return;
    }
    if (session?.tip && (target === session.tip || session.tip.contains(target))) {
        cancelHide();
        if (pointerInTipBox()) {
            session.engaged = true;
        }
        return;
    }
    if (session?.bridge && (target === session.bridge || session.bridge.contains(target))) {
        cancelHide();
        return;
    }
    if (session && session.grips.some((grip) => grip === target || grip.contains(target))) {
        cancelHide();
        return;
    }
    const host = annoHostOf(target);
    if (!host) {
        return;
    }
    commentFromHost(host);
    if (session && quickSame(host)) {
        session.host = host;
        cancelShow();
        cancelHide();
        return;
    }
    if (session?.engaged || session?.dirty || session?.resize) {
        return;
    }
    if (session) {
        closeSession();
    }
    scheduleShow(host, evt.clientY);
}

function onMouseOut(evt: MouseEvent): void {
    lastX = evt.clientX;
    lastY = evt.clientY;
    const target = evt.target;
    if (!(target instanceof Node)) {
        return;
    }
    if (showHost) {
        const from = annoHostOf(target);
        if (from && hostsMatch(from, showHost) && !pointerStillOnHost(showHost, evt.relatedTarget, evt.clientX, evt.clientY)) {
            cancelShow();
        }
    }
    if (!session || session.resize) {
        return;
    }
    if (!isSessionNode(target)) {
        return;
    }
    const related = evt.relatedTarget;
    if (related instanceof Node && isSessionNode(related)) {
        return;
    }
    if (related == null) {
        const under = document.elementFromPoint(evt.clientX, evt.clientY);
        if (under && isSessionNode(under)) {
            return;
        }
    }
    if (keepOpen()) {
        return;
    }
    scheduleHide();
}

function onPointerDown(ev: PointerEvent): void {
    if (!session || session.resize) {
        return;
    }
    const target = ev.target;
    if (!(target instanceof Node)) {
        return;
    }
    if (session.tip && session.tip.contains(target)) {
        session.engaged = true;
        cancelHide();
        return;
    }
    if (session.grips.some((grip) => grip.contains(target))) {
        return;
    }
    if (session.bridge && session.bridge.contains(target)) {
        return;
    }
    if (session.engaged || session.dirty) {
        void finishSession("save-if-dirty");
        return;
    }
    closeSession();
}

function onKeyDown(ev: KeyboardEvent): void {
    if (ev.key !== "Escape" || (!session && !showHost)) {
        return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    closeSession();
}

/** 量一个可见字的屏幕盒子。标签被替换掉以后没有字形，不当成光标位。 */
function glyphBox(view: EditorView, pos: number): { left: number; right: number; top: number; bottom: number } | null {
    const doc = view.state.doc;
    if (pos < 0 || pos >= doc.length) {
        return null;
    }
    const fromCaret = (): { left: number; right: number; top: number; bottom: number } | null => {
        const caret = view.coordsAtPos(pos, 1);
        if (!caret || caret.bottom - caret.top < 1 || caret.right - caret.left < 2) {
            return null;
        }
        return { left: caret.left, right: caret.right, top: caret.top, bottom: caret.bottom };
    };
    let start: { node: Node; offset: number };
    let end: { node: Node; offset: number };
    try {
        start = view.domAtPos(pos, 1);
        end = view.domAtPos(pos + 1, -1);
    } catch {
        return fromCaret();
    }
    if (start.node !== end.node || start.offset !== end.offset) {
        const range = document.createRange();
        try {
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            for (const rect of Array.from(range.getClientRects())) {
                if (rect.width < 0.4 || rect.height < 1) {
                    continue;
                }
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
            }
        } catch {
            // 落到光标坐标
        }
    }
    return fromCaret();
}

function glyphOnRow(box: { top: number; bottom: number }, y: number): boolean {
    return y >= box.top - 6 && y <= box.bottom + 6;
}

function posFromCaret(view: EditorView, x: number, y: number): number | null {
    const root = view.dom.ownerDocument;
    const api = root as Document & {
        caretPositionFromPoint?: (px: number, py: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (px: number, py: number) => Range | null;
    };
    let node: Node | null = null;
    let offset = 0;
    const caret = api.caretPositionFromPoint?.(x, y) ?? null;
    if (caret) {
        node = caret.offsetNode;
        offset = caret.offset;
    } else {
        const range = api.caretRangeFromPoint?.(x, y) ?? null;
        if (!range) {
            return null;
        }
        node = range.startContainer;
        offset = range.startOffset;
    }
    if (!node || !view.dom.contains(node)) {
        return null;
    }
    try {
        return view.posAtDOM(node, offset);
    } catch {
        return null;
    }
}

/** 指针所在的那一行。标签没有字形时向两侧找可见字，竖直方向对不上就丢掉。 */
function pointerSeed(view: EditorView, x: number, y: number): number | null {
    const near = (pos: number | null): number | null => {
        if (pos == null || !Number.isFinite(pos)) {
            return null;
        }
        const doc = view.state.doc;
        if (!doc.length) {
            return null;
        }
        const clamped = Math.max(0, Math.min(doc.length, pos));
        const line = doc.lineAt(Math.min(clamped, doc.length));
        const start = Math.max(line.from, Math.min(line.to - 1, clamped));
        const at = (p: number) => (p >= line.from && p < line.to ? glyphBox(view, p) : null);
        const direct = at(start);
        if (direct && glyphOnRow(direct, y)) {
            return start;
        }
        let otherRow = 0;
        const span = line.to - line.from;
        for (let d = 1; d <= span; d++) {
            let sawOther = false;
            for (const p of [start - d, start + d]) {
                const box = at(p);
                if (!box) {
                    continue;
                }
                if (glyphOnRow(box, y)) {
                    return p;
                }
                sawOther = true;
            }
            if (sawOther) {
                otherRow++;
            }
            if (otherRow > 4 && d > 40) {
                return null;
            }
        }
        return null;
    };
    return near(posFromCaret(view, x, y)) ?? near(view.posAtCoords({ x, y }, false));
}

/**
 * 当前视觉行上每个可见字的左缘，再加行尾那一条右缘。
 * 标签没有字形，不会占一个光标位；相邻的字不会被并成一个。
 */
function stopsForRow(view: EditorView, seed: number, y: number): { key: string; stops: CaretStop[] } {
    const doc = view.state.doc;
    const line = doc.lineAt(Math.max(0, Math.min(seed, doc.length)));
    let origin = -1;
    const span = line.to - line.from;
    let missed = 0;
    for (let d = 0; d <= span; d++) {
        const candidates = d === 0 ? [Math.min(line.to - 1, Math.max(line.from, seed))] : [seed - d, seed + d];
        let sawOff = false;
        for (const pos of candidates) {
            if (pos < line.from || pos >= line.to) {
                continue;
            }
            const box = glyphBox(view, pos);
            if (!box) {
                continue;
            }
            if (glyphOnRow(box, y)) {
                origin = pos;
                break;
            }
            sawOff = true;
        }
        if (origin >= 0) {
            break;
        }
        if (sawOff) {
            missed++;
        }
        if (missed > 3 && d > 24) {
            break;
        }
    }
    if (origin < 0) {
        return { key: "", stops: [] };
    }
    const originBox = glyphBox(view, origin);
    let from = origin;
    for (let pos = origin - 1; pos >= line.from; pos--) {
        const box = glyphBox(view, pos);
        if (!box) {
            continue;
        }
        if (!glyphOnRow(box, y)) {
            break;
        }
        from = pos;
    }
    let to = origin;
    let lastBox = originBox;
    for (let pos = origin + 1; pos < line.to; pos++) {
        const box = glyphBox(view, pos);
        if (!box) {
            continue;
        }
        if (!glyphOnRow(box, y)) {
            break;
        }
        to = pos;
        lastBox = box;
    }
    const stops: CaretStop[] = [];
    let prevX = Number.NaN;
    for (let pos = from; pos <= to; pos++) {
        const box = pos === origin ? originBox : pos === to ? lastBox : glyphBox(view, pos);
        const measured = box && glyphOnRow(box, y) ? box : glyphBox(view, pos);
        if (!measured || !glyphOnRow(measured, y)) {
            continue;
        }
        if (stops.length && Math.abs(measured.left - prevX) < 0.5) {
            stops[stops.length - 1].pos = pos;
            continue;
        }
        stops.push({ pos, x: measured.left, top: measured.top, bottom: measured.bottom });
        prevX = measured.left;
        if (pos === to) {
            stops.push({
                pos: pos + 1,
                x: measured.right,
                top: measured.top,
                bottom: measured.bottom,
            });
        }
    }
    const key = `${line.from}:${from}:${Math.round(originBox?.top ?? y)}`;
    return { key, stops };
}

/** 高亮正文里的每个字都留一个光标位，避免行扫描在标签处停住后左边无法向右收。 */
function withInnerGlyphs(view: EditorView, ann: AnnotationSpan, y: number, stops: CaretStop[]): CaretStop[] {
    const have = new Set(stops.map((stop) => stop.pos));
    const next = stops.slice();
    for (let pos = ann.innerFrom; pos < ann.innerTo; pos++) {
        if (have.has(pos)) {
            continue;
        }
        const box = glyphBox(view, pos);
        if (!box || !glyphOnRow(box, y)) {
            continue;
        }
        next.push({ pos, x: box.left, top: box.top, bottom: box.bottom });
        have.add(pos);
    }
    next.sort((a, b) => a.x - b.x || a.pos - b.pos);
    const unique: CaretStop[] = [];
    for (const stop of next) {
        const prev = unique[unique.length - 1];
        if (prev && Math.abs(prev.x - stop.x) < 0.5) {
            if (stop.pos > prev.pos) {
                prev.pos = stop.pos;
            }
            continue;
        }
        unique.push({ ...stop });
    }
    return unique;
}

function closestStop(stops: CaretStop[], x: number): CaretStop | null {
    let best: CaretStop | null = null;
    let bestDx = Infinity;
    for (const stop of stops) {
        const dx = Math.abs(stop.x - x);
        if (dx < bestDx) {
            best = stop;
            bestDx = dx;
        }
    }
    return best;
}

/**
 * 第一步：拖动只移动光标，逐字落在可见文字上，并记住范围。
 * 高亮文本要等松开后再改。
 */
function trackDragCursor(): void {
    const drag = session?.resize;
    const cm = session?.cm;
    if (!drag || !cm || !session || session.grips.length < 2) {
        return;
    }
    const onCachedRow =
        drag.stops.length > 0 &&
        drag.stops.some((stop) => lastY >= stop.top - 8 && lastY <= stop.bottom + 8);
    if (!onCachedRow) {
        const seed = pointerSeed(cm, lastX, lastY);
        if (seed == null) {
            return;
        }
        const built = stopsForRow(cm, seed, lastY);
        const stops = withInnerGlyphs(cm, drag.ann, lastY, built.stops);
        if (!stops.length) {
            return;
        }
        drag.stops = stops;
        drag.stopsKey = built.key || "row";
    }
    const hit = closestStop(drag.stops, lastX);
    if (!hit) {
        return;
    }
    const next = snapUnwrappedIndex(drag.doc, drag.ann, unwrapPos(drag.ann, hit.pos), drag.edge);
    if (drag.edge === "start") {
        drag.ns = clampNum(next, drag.minNs, drag.ne - 1);
    } else {
        drag.ne = clampNum(next, drag.ns + 1, drag.maxNe);
    }
    paintDrag();
    const grip = session.grips[drag.edge === "start" ? 0 : 1];
    placeGripElement(grip, { left: hit.x, right: hit.x, top: hit.top, bottom: hit.bottom }, drag.edge);
}

function onPointerMove(ev: PointerEvent): void {
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (!session?.resize || !session.cm) {
        return;
    }
    dragMoved = true;
    if (dragFrame) {
        return;
    }
    dragFrame = window.requestAnimationFrame(() => {
        dragFrame = 0;
        trackDragCursor();
    });
}

function onPointerUp(): void {
    if (!session?.resize) {
        return;
    }
    cancelDragFrame();
    if (dragMoved) {
        trackDragCursor();
    }
    dragMoved = false;
    endResize(true);
}

function onPointerCancel(): void {
    if (!session?.resize) {
        return;
    }
    cancelDragFrame();
    dragMoved = false;
    endResize(false);
}

function onScroll(ev: Event): void {
    if (!session) {
        return;
    }
    const target = ev.target;
    if (target instanceof Node && session.tip?.contains(target)) {
        return;
    }
    if (session.resize) {
        return;
    }
    placeAll();
}

function onWindowResize(): void {
    if (!session || session.resize) {
        return;
    }
    placeAll();
}

noteAnnotationDocChanged = (view: EditorView): void => {
    if (!session || session.cm !== view) {
        return;
    }
    const doc = view.state.doc.toString();
    const fresh = resolveAnnotation(doc, session.ann);
    if (session.applying) {
        if (fresh) {
            session.ann = fresh;
            session.doc = doc;
        }
        return;
    }
    if (session.resize) {
        cancelDragFrame();
        dragMoved = false;
        session.resize = null;
        clearPreviews();
        document.body.classList.remove("fh-anno-resizing");
        for (const grip of session.grips) {
            grip.classList.remove("is-dragging");
            grip.style.pointerEvents = "";
        }
    }
    if (!fresh) {
        closeSession();
        return;
    }
    session.ann = fresh;
    session.doc = doc;
    if (placeRaf) {
        return;
    }
    placeRaf = window.requestAnimationFrame(() => {
        placeRaf = 0;
        if (!session || session.resize) {
            return;
        }
        placeAll();
    });
};

export function installAnnotationHover(plugin: Plugin): void {
    hoverApp = plugin.app;
    plugin.registerDomEvent(document, "mouseover", onMouseOver);
    plugin.registerDomEvent(document, "mouseout", onMouseOut);
    plugin.registerDomEvent(document, "pointerdown", onPointerDown);
    plugin.registerDomEvent(document, "keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    plugin.register(() => {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onWindowResize);
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("pointercancel", onPointerCancel, true);
        closeSession();
    });
}
