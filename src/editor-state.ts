import { Editor, MarkdownView } from "obsidian";

export interface CursorPos {
    line: number;
    ch: number;
}

export interface EditorStateSnapshot {
    cursor?: {
        from: CursorPos;
        to: CursorPos;
    };
    scroll?: number;
    lastModified?: number;
}

/** 读取当前源码视图的光标与滚动位置（参考 remember-cursor-position 插件的成熟读取方式） */
export function readViewState(view: MarkdownView): EditorStateSnapshot {
    const state: EditorStateSnapshot = {};

    // 滚动：从编辑器模式读取，Obsidian 官方状态保存也用它
    const mode = (view as unknown as { currentMode?: { getScroll?: () => number } }).currentMode;
    const scroll = mode?.getScroll?.();
    if (scroll !== undefined && !isNaN(scroll)) {
        state.scroll = Number(scroll.toFixed(4));
    }

    const editor = view.editor;
    if (editor) {
        const from = editor.getCursor("anchor");
        const to = editor.getCursor("head");
        if (from && to) {
            state.cursor = {
                from: { line: from.line, ch: from.ch },
                to: { line: to.line, ch: to.ch },
            };
        }
    }

    return state;
}

/** 把保存的光标位置钳制到当前文档实际范围内（文件被改短或套用到别的视图时不至于抛 RangeError） */
function clampPos(editor: Editor, pos: CursorPos): CursorPos {
    const lineCount = editor.lineCount();
    if (lineCount <= 0) return { line: 0, ch: 0 };
    const line = Math.max(0, Math.min(pos.line, lineCount - 1));
    const length = (editor.getLine(line) ?? "").length;
    const ch = Math.max(0, Math.min(pos.ch, length));
    return { line, ch };
}

/** 恢复视图状态：选区/光标 + 滚动 */
export function applyViewState(view: MarkdownView, state: EditorStateSnapshot): void {
    const editor = view.editor;
    try {
        if (state.scroll !== undefined) {
            // 用 Obsidian 官方的 ephemeral state 机制设置滚动，比 editor.setScroll 可靠
            view.setEphemeralState({ scroll: state.scroll });
            if (state.cursor && editor) {
                // 有明确滚动位置时只恢复光标，不主动滚动：保存时光标本就在该视野内，
                // 再调用 scrollIntoView 会把（位于顶部的）光标重新拉回视野，覆盖刚恢复的滚动
                editor.setSelection(
                    clampPos(editor, state.cursor.from),
                    clampPos(editor, state.cursor.to)
                );
            }
            return;
        }

        if (state.cursor && editor) {
            const from = clampPos(editor, state.cursor.from);
            const to = clampPos(editor, state.cursor.to);
            editor.setSelection(from, to);
            // 没有保存滚动时才兜底：center=false 仅在光标不在视野内时最小滚动
            editor.scrollIntoView({ from, to }, false);
        }
    } catch (e) {
        console.warn("Format Hotkeys: 恢复编辑位置失败", e);
    }
}

/** 两个状态是否相同（用于轮询判断是否需要更新） */
export function statesEqual(a: EditorStateSnapshot, b: EditorStateSnapshot): boolean {
    if (Boolean(a.cursor) !== Boolean(b.cursor)) return false;
    if (a.cursor) {
        const ca = a.cursor;
        const cb = b.cursor as NonNullable<EditorStateSnapshot["cursor"]>;
        if (ca.from.line !== cb.from.line || ca.from.ch !== cb.from.ch) return false;
        if (ca.to.line !== cb.to.line || ca.to.ch !== cb.to.ch) return false;
    }
    if (a.scroll !== b.scroll) return false;
    return true;
}
