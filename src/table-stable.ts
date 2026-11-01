/**
 * 表格编辑宽度/位置稳定：
 * Live Preview 点击单元格时会在格子里挂嵌套 CodeMirror。
 * 若正文边距、列宽策略、widget 外壳不一致，表格会突然变大并移位。
 * 开启时注入 <style>，关闭时移除。
 */
const TABLE_STABLE_STYLE_ID = "format-hotkeys-table-stable";

const TABLE_STABLE_CSS = `
/* 真正作用在 table 上：固定列宽、占满行宽 */
.markdown-source-view.mod-cm6 .cm-table-widget table,
.markdown-source-view.mod-cm6 .cm-embed-block:has(table) table,
.markdown-preview-view table {
    table-layout: fixed !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box;
}

.markdown-source-view.mod-cm6 .cm-table-widget,
.markdown-source-view.mod-cm6 .cm-table-widget .table-wrapper,
.markdown-source-view.mod-cm6.is-readable-line-width .cm-table-widget,
.markdown-preview-view.is-readable-line-width :is(table, .table-wrapper) {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box;
}

/* 长表格横向滚动，避免挤压列宽 */
.markdown-source-view.mod-cm6 .cm-table-widget .table-wrapper {
    overflow-x: auto;
}

/* 嵌套单元格编辑器：清掉正文边距，避免点击后撑开表格 */
.markdown-source-view.mod-cm6 .cm-table-widget .cm-content,
.markdown-source-view.mod-cm6 .cm-table-widget .cm-scroller,
.markdown-source-view.mod-cm6 .cm-embed-block:has(table) .cm-content,
.markdown-source-view.mod-cm6 .cm-embed-block:has(table) .cm-scroller {
    max-width: none !important;
    width: auto !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
}

.markdown-source-view.mod-cm6 .cm-table-widget .cm-line,
.markdown-source-view.mod-cm6 .cm-embed-block:has(table) .cm-line {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    width: 100% !important;
    max-width: none !important;
}
`;

export function applyTableStableStyle(enabled: boolean): void {
    let tag = document.getElementById(TABLE_STABLE_STYLE_ID) as HTMLStyleElement | null;
    if (!enabled) {
        tag?.remove();
        return;
    }
    if (!tag) {
        tag = document.createElement("style");
        tag.id = TABLE_STABLE_STYLE_ID;
        document.head.appendChild(tag);
    }
    tag.textContent = TABLE_STABLE_CSS;
}
