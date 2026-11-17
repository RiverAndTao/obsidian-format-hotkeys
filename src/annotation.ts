import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { Editor, MarkdownView, Menu, Modal, Notice, Plugin, type App } from "obsidian";

/**
 * 选区高亮 + 悬停批注。
 * 写法放在笔记正文里，阅读视图和源码模式都能看到：
 * <span class="fh-anno" data-color="yellow" data-fh-id="ab12cd" data-comment="解释">原文</span>
 * 交互参考开源 Comment / Marginalia：选中文字、写下解释、鼠标移上去显示。
 */

export const ANNO_COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;
export type AnnoColor = (typeof ANNO_COLORS)[number];

const COLOR_LABEL: Record<AnnoColor, string> = {
    yellow: "黄色",
    green: "绿色",
    blue: "蓝色",
    pink: "粉色",
    orange: "橙色",
};

const SWATCH: Record<AnnoColor, string> = {
    yellow: "#ffe08a",
    green: "#b7ebc6",
    blue: "#b9d6ff",
    pink: "#ffc6de",
    orange: "#ffd0a8",
};

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

const hideTag = Decoration.mark({ class: "fh-anno-tag" });

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
    const colorRaw = readAttr(attrs, "data-color") ?? "yellow";
    const color = (ANNO_COLORS as readonly string[]).includes(colorRaw) ? (colorRaw as AnnoColor) : "yellow";
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
    const safeColor = (ANNO_COLORS as readonly string[]).includes(color) ? color : "yellow";
    const safeId = /^[a-z0-9]{4,16}$/.test(id) ? id : "anno00";
    const parts = [`class="fh-anno"`, `data-color="${safeColor}"`, `data-fh-id="${safeId}"`];
    const text = comment.trim();
    if (text) {
        const encoded = encodeAttr(text);
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
            text: "高亮会留在原文上。写下解释后，鼠标移到高亮上就会显示。解释可以留空，只保留高亮。",
            cls: "fh-anno-modal-desc",
        });

        const colors = contentEl.createDiv({ cls: "fh-anno-colors" });
        const paint = (): void => {
            colors.empty();
            for (const color of ANNO_COLORS) {
                const btn = colors.createEl("button", {
                    cls: `fh-anno-swatch${color === this.color ? " is-active" : ""}`,
                    attr: { type: "button", "aria-label": COLOR_LABEL[color], title: COLOR_LABEL[color] },
                });
                btn.style.background = SWATCH[color];
                btn.addEventListener("click", () => {
                    this.color = color;
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

function replaceSpan(editor: Editor, ann: AnnotationSpan, next: string): void {
    const doc = editor.getValue();
    const fresh = findAnnotations(doc).find((item) => (ann.id && item.id === ann.id) || (item.from === ann.from && item.to === ann.to));
    const target = fresh ?? ann;
    if (!doc.slice(target.from, target.to).startsWith("<span")) {
        new Notice("批注位置已变化，请重试");
        return;
    }
    editor.replaceRange(next, offsetToPos(doc, target.from), offsetToPos(doc, target.to));
}

export function promptAnnotation(app: App, editor: Editor): void {
    const doc = editor.getValue();
    const rawFrom = posToOffset(doc, editor.getCursor("from"));
    const rawTo = posToOffset(doc, editor.getCursor("to"));
    const from = Math.min(rawFrom, rawTo);
    const to = Math.max(rawFrom, rawTo);
    const hit = annotationTouching(doc, from, to);
    if (from === to) {
        if (hit) {
            void editAnnotation(app, editor, hit);
            return;
        }
        new Notice("请先选中要高亮的文字");
        return;
    }
    if (hit) {
        const inside = from >= hit.innerFrom && to <= hit.innerTo;
        if (inside) {
            void editAnnotation(app, editor, hit);
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
    void askAnnotation(app, { comment: "", color: "yellow" }, "高亮并批注", false).then((result) => {
        if (!result || result.action !== "save") {
            return;
        }
        const current = editor.getSelection();
        if (current !== selected) {
            new Notice("选区已变化，请重新添加");
            return;
        }
        editor.replaceSelection(buildAnnotation(current, result.color, result.comment, createId(editor.getValue())));
    });
}

export async function editAnnotation(app: App, editor: Editor, ann: AnnotationSpan): Promise<void> {
    const result = await askAnnotation(app, { comment: ann.comment, color: ann.color }, "编辑批注", true);
    if (!result) {
        return;
    }
    const docNow = editor.getValue();
    const freshNow =
        findAnnotations(docNow).find((item) => (ann.id && item.id === ann.id) || (item.from === ann.from && item.to === ann.to)) ??
        ann;
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

const annotationPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildAnnotationDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet) {
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

let tooltipEl: HTMLElement | null = null;
let currentHost: HTMLElement | null = null;
let hideTimer: number | null = null;

function removeTooltip(): void {
    tooltipEl?.remove();
    tooltipEl = null;
    currentHost = null;
}

function hideTooltip(): void {
    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }
    removeTooltip();
}

function scheduleHideTooltip(): void {
    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
    }
    hideTimer = window.setTimeout(() => {
        hideTimer = null;
        removeTooltip();
    }, 220) as unknown as number;
}

function cancelHideTooltip(): void {
    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }
}

export function destroyAnnotationTooltip(): void {
    hideTooltip();
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
    if (id) {
        const byId = anns.find((ann) => ann.id === id);
        if (byId) {
            return byId;
        }
    }
    if (view.getMode() === "source") {
        const cm = cmOf(view.editor);
        if (cm) {
            try {
                const pos = cm.posAtDOM(host, 0);
                const byPos = anns.find((ann) => pos >= ann.innerFrom && pos <= ann.innerTo);
                if (byPos) {
                    return byPos;
                }
            } catch {
                // 节点已经不在编辑器里
            }
        }
    }
    const comment = host.getAttribute("data-comment") ?? "";
    const inner = host.textContent ?? "";
    return anns.find((ann) => ann.comment === comment && ann.inner === inner) ?? (inner ? anns.find((ann) => ann.inner === inner) ?? null : null);
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
    const resolve = (data: string): AnnotationSpan | null =>
        findAnnotations(data).find((item) => (ann.id && item.id === ann.id) || (item.from === ann.from && item.inner === ann.inner)) ??
        null;
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

function placeTooltip(tip: HTMLElement, anchor: HTMLElement): void {
    tip.style.visibility = "hidden";
    tip.style.display = "block";
    const rect = anchor.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    let left = rect.left;
    let top = rect.top - height - 8;
    if (top < 8) {
        top = rect.bottom + 8;
    }
    if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - width - 8;
    }
    if (left < 8) {
        left = 8;
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.visibility = "visible";
}

function showTooltip(app: App, host: HTMLElement, comment: string): void {
    if (!tooltipEl) {
        tooltipEl = document.body.createDiv({ cls: "fh-anno-tip" });
    }
    currentHost = host;
    tooltipEl.empty();
    tooltipEl.createDiv({ cls: "fh-anno-tip-label", text: "批注" });
    const body = tooltipEl.createDiv({ cls: "fh-anno-tip-text" });
    body.textContent = comment;
    const actions = tooltipEl.createDiv({ cls: "fh-anno-tip-actions" });
    const editBtn = actions.createEl("button", { text: "编辑", cls: "fh-anno-tip-btn", attr: { type: "button" } });
    const removeBtn = actions.createEl("button", { text: "移除", cls: "fh-anno-tip-btn", attr: { type: "button" } });

    const run = (action: "edit" | "remove"): void => {
        const view = viewContaining(app, host);
        hideTooltip();
        if (!view) {
            new Notice("找不到所在笔记");
            return;
        }
        void (async () => {
            const data = await readNote(view);
            if (data === null) {
                new Notice("读不到笔记内容");
                return;
            }
            const ann = locate(data, view, host);
            if (!ann) {
                new Notice("找不到这条批注");
                return;
            }
            if (action === "remove") {
                await applyHoverEdit(view, ann, (fresh) => fresh.inner);
                return;
            }
            if (view.getMode() !== "source") {
                const result = await askAnnotation(app, { comment: ann.comment, color: ann.color }, "编辑批注", true);
                if (!result) {
                    return;
                }
                if (result.action === "remove") {
                    await applyHoverEdit(view, ann, (fresh) => fresh.inner);
                    return;
                }
                await applyHoverEdit(view, ann, (fresh) =>
                    buildAnnotation(fresh.inner, result.color, result.comment, fresh.id || createId(data))
                );
                return;
            }
            await editAnnotation(app, view.editor, ann);
        })();
    };

    editBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    removeBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    editBtn.addEventListener("click", () => run("edit"));
    removeBtn.addEventListener("click", () => run("remove"));
    placeTooltip(tooltipEl, host);
}

function commentFromHost(host: HTMLElement): string {
    const data = host.getAttribute("data-comment");
    if (data && data.trim()) {
        host.removeAttribute("title");
        return data;
    }
    const title = host.getAttribute("title");
    if (title && title.trim()) {
        host.setAttribute("data-comment", title);
        host.removeAttribute("title");
        return title;
    }
    return "";
}

export function installAnnotationHover(plugin: Plugin): void {
    const app = plugin.app;
    plugin.registerDomEvent(document as unknown as HTMLElement, "mouseover", (evt: MouseEvent) => {
        const target = evt.target;
        if (!(target instanceof Element)) {
            return;
        }
        const host = target.closest(".fh-anno");
        if (host instanceof HTMLElement) {
            const comment = commentFromHost(host);
            if (!comment.trim()) {
                scheduleHideTooltip();
                return;
            }
            cancelHideTooltip();
            if (host === currentHost && tooltipEl) {
                return;
            }
            showTooltip(app, host, comment);
            return;
        }
        if (target.closest(".fh-anno-tip")) {
            cancelHideTooltip();
            return;
        }
    });
    plugin.registerDomEvent(document as unknown as HTMLElement, "mouseout", (evt: MouseEvent) => {
        const related = evt.relatedTarget;
        if (related instanceof Element && (related.closest(".fh-anno") || related.closest(".fh-anno-tip"))) {
            return;
        }
        const fromAnno = evt.target instanceof Element && (evt.target.closest(".fh-anno") || evt.target.closest(".fh-anno-tip"));
        if (!fromAnno) {
            return;
        }
        scheduleHideTooltip();
    });
    window.addEventListener("scroll", hideTooltip, true);
    plugin.register(() => window.removeEventListener("scroll", hideTooltip, true));
}
