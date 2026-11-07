import { App, Editor, Menu, Modal, Notice, TFile } from "obsidian";
import {
    BlockLinkMode,
    BlockTarget,
    CacheLike,
    blockIdAtEnd,
    collectBlockIds,
    createBlockId,
    formatBlockLink,
    isOnlyBlockId,
    lineWithBlockId,
    resolveBlock,
} from "./block-ref";

const UNDO_ORIGIN = "format-hotkeys";

const MENU_ITEMS: Array<{ mode: BlockLinkMode; title: string; icon: string }> = [
    { mode: "link", title: "复制块链接", icon: "link" },
    { mode: "embed", title: "复制嵌入链接", icon: "links-coming-in" },
    { mode: "alias", title: "复制别名链接", icon: "pencil" },
];

/** 编辑器右键：复制跳转链接、嵌入链接、别名链接。 */
export function addBlockLinkMenuItems(menu: Menu, app: App, editor: Editor, file: TFile): void {
    menu.addSeparator();
    for (const entry of MENU_ITEMS) {
        menu.addItem((item) => {
            item.setTitle(entry.title);
            item.setIcon(entry.icon);
            item.onClick(() => {
                void copyBlockReference(app, editor, file, entry.mode);
            });
        });
    }
}

export async function copyBlockReference(
    app: App,
    editor: Editor,
    file: TFile,
    mode: BlockLinkMode
): Promise<void> {
    const line = anchorLine(editor);
    const initial = readTarget(app, editor, file, line);
    if (!initial.ok) {
        new Notice(initial.reason === "yaml" ? "属性区不能复制块链接" : "请把光标放在要引用的段落上");
        return;
    }

    let alias = "";
    if (mode === "alias") {
        const typed = await new BlockAliasModal(
            app,
            suggestAlias(editor),
            blockSnippet(editor, initial.target)
        ).openAndGetValue();
        if (typed == null) return;
        alias = typed;
    }

    const current = readTarget(app, editor, file, line);
    if (!current.ok) {
        new Notice(current.reason === "yaml" ? "属性区不能复制块链接" : "请把光标放在要引用的段落上");
        return;
    }

    const lines = readLines(editor);
    const id = ensureBlockId(editor, current.target, collectBlockIds(lines));
    if (!id) {
        new Notice("这一段无法添加块链接");
        return;
    }

    const note = noteLinktext(app, file);
    const text = formatBlockLink(note, id, mode, alias);
    const copied = await copyText(text);
    if (!copied) {
        new Notice("复制失败");
        return;
    }
    const label = mode === "embed" ? "已复制嵌入链接" : mode === "alias" ? "已复制别名链接" : "已复制块链接";
    new Notice(`${label}：${text}`);
}

function readTarget(
    app: App,
    editor: Editor,
    file: TFile,
    line: number
): { ok: true; target: BlockTarget } | { ok: false; reason: "empty" | "yaml" } {
    const cache = app.metadataCache.getFileCache(file) as CacheLike | null;
    return resolveBlock(readLines(editor), line, cache);
}

function anchorLine(editor: Editor): number {
    const cursor = editor.getCursor();
    if ((editor.getLine(cursor.line) ?? "").trim() !== "") return cursor.line;
    const from = editor.getCursor("from");
    if (from.line !== cursor.line && (editor.getLine(from.line) ?? "").trim() !== "") return from.line;
    return cursor.line;
}

function readLines(editor: Editor): string[] {
    const lines: string[] = [];
    const count = editor.lineCount();
    for (let i = 0; i < count; i++) lines.push(editor.getLine(i));
    return lines;
}

function noteLinktext(app: App, file: TFile): string {
    try {
        const text = app.metadataCache.fileToLinktext(file, "", true);
        if (text) return text;
    } catch {
        // 退回文件名
    }
    return file.basename;
}

function ensureBlockId(editor: Editor, target: BlockTarget, used: Set<string>): string | null {
    if (target.id) return target.id;
    if (!target.write) return null;

    const id = createBlockId(used);
    const cursor = editor.getCursor();
    const { mode, line } = target.write;
    if (line < 0 || line > editor.lastLine()) return null;

    const current = editor.getLine(line);
    if (mode === "inline") {
        const existing = blockIdAtEnd(current);
        if (existing) return existing;
        editor.replaceRange(
            lineWithBlockId(current, id),
            { line, ch: 0 },
            { line, ch: current.length },
            UNDO_ORIGIN
        );
    } else {
        const following = line < editor.lastLine() ? editor.getLine(line + 1) : "";
        if (isOnlyBlockId(following)) {
            const existing = blockIdAtEnd(following);
            if (existing) return existing;
        }
        editor.replaceRange(`\n^${id}`, { line, ch: current.length }, undefined, UNDO_ORIGIN);
    }

    const restoredLine = Math.min(cursor.line, editor.lastLine());
    const restoredCh = Math.min(cursor.ch, editor.getLine(restoredLine).length);
    editor.setCursor({ line: restoredLine, ch: restoredCh });
    return id;
}

function suggestAlias(editor: Editor): string {
    const selected = editor
        .getSelection()
        .replace(/\s+\^[A-Za-z0-9-]+\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!selected || selected.length > 40) return "";
    return selected;
}

function blockSnippet(editor: Editor, target: BlockTarget): string {
    const parts: string[] = [];
    for (let i = target.start; i <= target.end && i < editor.lineCount(); i++) {
        let line = editor.getLine(i).replace(/\s+\^[A-Za-z0-9-]+\s*$/, "");
        line = line.replace(/^\s*>\s?/, "");
        line = line.replace(/^#{1,6}\s+/, "");
        line = line.replace(/^(\s*)(?:[-+*]|\d+[.)])\s+/, "");
        line = line.replace(/^\[[ xX]\]\s+/, "");
        const trimmed = line.trim();
        if (trimmed && !isOnlyBlockId(trimmed)) parts.push(trimmed);
    }
    const text = parts.join(" ").replace(/\s+/g, " ");
    if (text.length <= 80) return text;
    return `${text.slice(0, 80)}…`;
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const area = document.createElement("textarea");
            area.value = text;
            area.setAttr("readonly", "");
            area.style.position = "fixed";
            area.style.left = "-9999px";
            document.body.append(area);
            area.select();
            const ok = document.execCommand("copy");
            area.remove();
            return ok;
        } catch {
            return false;
        }
    }
}

class BlockAliasModal extends Modal {
    private resolve: (value: string | null) => void;
    private settled = false;

    constructor(app: App, private initial: string, private preview: string) {
        super(app);
        this.resolve = () => undefined;
    }

    openAndGetValue(): Promise<string | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText("别名链接");
        contentEl.createEl("p", {
            cls: "format-hotkeys-block-alias-desc",
            text: "链接显示成这段文字，点击后仍跳到原段落并高亮。",
        });
        if (this.preview) {
            contentEl.createEl("p", {
                cls: "format-hotkeys-block-alias-preview",
                text: this.preview,
            });
        }

        const input = contentEl.createEl("input", {
            type: "text",
            cls: "format-hotkeys-lang-input",
            value: this.initial,
        });
        input.placeholder = "例如：内模式定义";

        const error = contentEl.createEl("p", {
            cls: "format-hotkeys-block-alias-error",
            text: "",
        });

        const confirm = () => {
            const value = input.value.trim();
            if (!value) {
                error.setText("请输入要显示的文字");
                input.focus();
                return;
            }
            this.closeWith(value);
        };

        const row = contentEl.createDiv({ cls: "format-hotkeys-lang-actions" });
        row.createEl("button", { text: "复制", cls: "mod-cta" }).addEventListener("click", confirm);
        row.createEl("button", { text: "取消" }).addEventListener("click", () => this.closeWith(null));

        input.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter") {
                event.preventDefault();
                confirm();
            } else if (event.key === "Escape") {
                event.preventDefault();
                this.closeWith(null);
            } else if (error.textContent) {
                error.setText("");
            }
        });

        window.setTimeout(() => {
            input.focus();
            if (this.initial) input.select();
        }, 0);
    }

    private closeWith(value: string | null): void {
        if (this.settled) return;
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
