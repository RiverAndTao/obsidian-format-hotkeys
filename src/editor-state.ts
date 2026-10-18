import { MarkdownView } from "obsidian";

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

/** 恢复视图状态：选区/光标 + 滚动 + 将光标行滚入视野 */
export function applyViewState(view: MarkdownView, state: EditorStateSnapshot): void {
    const editor = view.editor;

    if (state.cursor && editor) {
        editor.setSelection(state.cursor.from, state.cursor.to);
    }

    if (state.scroll !== undefined) {
        // 用 Obsidian 官方的 ephemeral state 机制设置滚动，比 editor.setScroll 可靠
        view.setEphemeralState({ scroll: state.scroll });
    }

    if (state.cursor && editor) {
        editor.scrollIntoView({ from: state.cursor.from, to: state.cursor.to }, true);
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
    if (Boolean(a.scroll) !== Boolean(b.scroll)) return false;
    if (a.scroll !== undefined && a.scroll !== b.scroll) return false;
    return true;
}
