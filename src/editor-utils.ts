import { Editor } from "obsidian";
import { flattenInlineToBold, selectionAlreadyBoldWrapped, stripRedMarkup } from "./inline-format";

const UNDO_ORIGIN = "format-hotkeys";

/** 一次替换，进入同一个撤销步 */
export function replaceRangeOnce(
    editor: Editor,
    replacement: string,
    from = editor.getCursor("from"),
    to = editor.getCursor("to")
): void {
    editor.replaceRange(replacement, from, to, UNDO_ORIGIN);
}

/** 切换包裹格式：已包裹则取消，否则添加 */
export function toggleWrap(editor: Editor, open: string, close: string): void {
    const selected = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");

    if (from.line !== to.line) {
        editor.replaceSelection(open + selected + close, UNDO_ORIGIN);
        if (selected.length > 0) {
            editor.setSelection(
                { line: from.line, ch: from.ch + open.length },
                { line: to.line, ch: to.ch + open.length }
            );
        } else {
            editor.setCursor({ line: from.line, ch: from.ch + open.length });
        }
        return;
    }

    const line = editor.getLine(from.line);
    const beforeStart = from.ch - open.length;
    const afterEnd = to.ch + close.length;

    if (
        beforeStart >= 0 &&
        afterEnd <= line.length &&
        line.substring(beforeStart, from.ch) === open &&
        line.substring(to.ch, afterEnd) === close
    ) {
        editor.replaceRange(selected, { line: from.line, ch: beforeStart }, { line: to.line, ch: afterEnd }, UNDO_ORIGIN);
        editor.setSelection(
            { line: from.line, ch: beforeStart },
            { line: to.line, ch: beforeStart + selected.length }
        );
        return;
    }

    editor.replaceSelection(open + selected + close, UNDO_ORIGIN);
    if (selected.length > 0) {
        editor.setSelection(
            { line: from.line, ch: from.ch + open.length },
            { line: to.line, ch: to.ch + open.length }
        );
    } else {
        editor.setCursor({ line: from.line, ch: from.ch + open.length });
    }
}

/** 设置当前行标题级别；已是该级别则取消标题 */
export function toggleHeading(editor: Editor, level: number): void {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const prefix = "#".repeat(level) + " ";

    if (headingMatch) {
        const currentLevel = headingMatch[1].length;
        const content = headingMatch[2];
        if (currentLevel === level) {
            editor.setLine(cursor.line, content);
        } else {
            editor.setLine(cursor.line, prefix + content);
        }
    } else {
        const content = line.trimStart();
        editor.setLine(cursor.line, prefix + content);
    }
}

/** 在光标处插入文本 */
export function insertTextAtCursor(editor: Editor, text: string): void {
    const cursor = editor.getCursor();
    editor.replaceSelection(text);
    editor.setCursor({ line: cursor.line, ch: cursor.ch + text.length });
}

const CODE_FENCE = "```";
const CODE_BLOCK_RE = /^```(\S*)\n([\s\S]*)\n```$/;

function openFence(language: string): string {
    return language ? `${CODE_FENCE}${language}` : CODE_FENCE;
}

/** 创建或切换代码块 */
export function toggleCodeBlock(editor: Editor, language = ""): void {
    const selected = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const fence = openFence(language);

    if (selected.length > 0) {
        const trimmed = selected.trim();
        const match = trimmed.match(CODE_BLOCK_RE);
        if (match) {
            const inner = match[2];
            editor.replaceSelection(inner);
            editor.setSelection(
                { line: from.line, ch: from.ch },
                { line: from.line, ch: from.ch + inner.length }
            );
            return;
        }

        editor.replaceSelection(`${fence}\n${selected}\n${CODE_FENCE}`);
        editor.setSelection(
            { line: from.line + 1, ch: 0 },
            { line: to.line + 1, ch: editor.getLine(to.line + 1).length }
        );
        return;
    }

    const cursor = editor.getCursor();
    editor.replaceSelection(`${fence}\n\n${CODE_FENCE}`);
    editor.setCursor({ line: cursor.line + 1, ch: 0 });
}

/** 去除选区内的空行（仅含空白字符的行） */
export function removeBlankLinesInSelection(editor: Editor): void {
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const startLine = from.line;
    const endLine = to.line;

    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
        lines.push(editor.getLine(i));
    }

    const nonBlankLines = lines.filter((line) => line.trim().length > 0);
    if (nonBlankLines.length === lines.length) {
        return;
    }

    const newText = nonBlankLines.join("\n");
    editor.replaceRange(
        newText,
        { line: startLine, ch: 0 },
        { line: endLine, ch: editor.getLine(endLine).length }
    );

    const lastLine = startLine + nonBlankLines.length - 1;
    editor.setSelection(
        { line: startLine, ch: 0 },
        { line: lastLine, ch: nonBlankLines[nonBlankLines.length - 1]?.length ?? 0 }
    );
}

/** 将块级 LaTeX 公式 ($$...$$) 转换为行内 LaTeX 公式 ($...$) */
export function convertBlockMathToInline(editor: Editor): void {
    const selected = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");

    if (selected.length === 0) {
        return;
    }

    const trimmed = selected.trim();
    const blockMathRe = /^\$\$\s*([\s\S]*?)\s*\$\$$/;
    const match = trimmed.match(blockMathRe);
    if (match) {
        const result = "$" + match[1].trim() + "$";
        editor.replaceSelection(result);
        editor.setSelection(
            { line: from.line, ch: from.ch },
            { line: from.line, ch: from.ch + result.length }
        );
        return;
    }

    const openPos = findBlockMathOpenDelimiter(editor, from);
    if (!openPos) return;

    const closePos = findBlockMathCloseDelimiter(editor, to);
    if (!closePos) return;

    const innerParts: string[] = [];
    for (let l = openPos.line; l <= closePos.line; l++) {
        let lineText = editor.getLine(l);
        let s = 0;
        let e = lineText.length;
        if (l === openPos.line) s = openPos.ch + 2;
        if (l === closePos.line) e = closePos.ch;
        if (l === openPos.line && l === closePos.line) {
            innerParts.push(lineText.substring(s, e));
        } else if (l === openPos.line) {
            innerParts.push(lineText.substring(s));
        } else if (l === closePos.line) {
            innerParts.push(lineText.substring(0, e));
        } else {
            innerParts.push(lineText);
        }
    }
    const innerContent = innerParts.join("\n").trim();
    const newText = "$" + innerContent + "$";
    const closeEndPos = { line: closePos.line, ch: closePos.ch + 2 };

    editor.replaceRange(newText, openPos, closeEndPos);

    editor.setSelection(
        { line: openPos.line, ch: openPos.ch },
        { line: openPos.line, ch: openPos.ch + newText.length }
    );
}

function findBlockMathOpenDelimiter(
    editor: Editor,
    from: { line: number; ch: number }
): { line: number; ch: number } | null {
    const line = editor.getLine(from.line);
    const before = line.substring(0, from.ch);
    const directIdx = before.lastIndexOf("$$");
    if (directIdx >= 0 && /^\s*$/.test(before.substring(directIdx + 2))) {
        return { line: from.line, ch: directIdx };
    }

    for (let l = from.line - 1; l >= 0; l--) {
        const text = editor.getLine(l);
        if (/^\s*\$\$\s*$/.test(text)) {
            const idx = text.indexOf("$$");
            return { line: l, ch: idx };
        }
        const lastIdx = text.lastIndexOf("$$");
        if (lastIdx >= 0 && /^\s*$/.test(text.substring(lastIdx + 2))) {
            return { line: l, ch: lastIdx };
        }
    }
    return null;
}

function findBlockMathCloseDelimiter(
    editor: Editor,
    to: { line: number; ch: number }
): { line: number; ch: number } | null {
    const line = editor.getLine(to.line);
    const after = line.substring(to.ch);
    const directIdx = after.indexOf("$$");
    if (directIdx >= 0 && /^\s*$/.test(after.substring(0, directIdx))) {
        return { line: to.line, ch: to.ch + directIdx };
    }

    for (let l = to.line + 1; l < editor.lineCount(); l++) {
        const text = editor.getLine(l);
        if (/^\s*\$\$\s*$/.test(text)) {
            const idx = text.indexOf("$$");
            return { line: l, ch: idx };
        }
        const firstIdx = text.indexOf("$$");
        if (firstIdx >= 0 && /^\s*$/.test(text.substring(0, firstIdx))) {
            return { line: l, ch: firstIdx };
        }
    }
    return null;
}

/** 块级公式转行内公式并上移一行（与上一行合并） */
export function convertBlockMathToInlineAndJoin(editor: Editor): void {
    convertBlockMathToInline(editor);

    const cursor = editor.getCursor();
    if (cursor.line <= 0) return;

    const currentLine = editor.getLine(cursor.line);
    const prevLine = editor.getLine(cursor.line - 1);
    const merged = prevLine + currentLine;

    editor.replaceRange(
        merged,
        { line: cursor.line - 1, ch: 0 },
        { line: cursor.line, ch: currentLine.length }
    );

    const newCh = prevLine.length + cursor.ch;
    editor.setCursor({ line: cursor.line - 1, ch: newCh });
}

const CN_TO_EN_PUNCT: [RegExp, string][] = [
    [/，/g, ","],
    [/。/g, "."],
    [/；/g, ";"],
    [/：/g, ":"],
    [/！/g, "!"],
    [/？/g, "?"],
    [/（/g, "("],
    [/）/g, ")"],
    [/【/g, "["],
    [/】/g, "]"],
    [/「/g, '"'],
    [/」/g, '"'],
    [/『/g, "'"],
    [/』/g, "'"],
    [/《/g, "<"],
    [/》/g, ">"],
    [/……/g, "..."],
    [/—/g, "-"],
    [/～/g, "~"],
    [/￥/g, "$"],
    [/　/g, " "],
];

/** 将全文中文标点符号转换为英文标点符号 */
export function normalizePunctuation(editor: Editor): void {
    const lineCount = editor.lineCount();
    if (lineCount === 0) return;

    const cursor = editor.getCursor();
    const totalCharsBefore = (() => {
        let total = 0;
        for (let l = 0; l < cursor.line; l++) {
            total += editor.getLine(l).length + 1;
        }
        return total + cursor.ch;
    })();

    const fullText = (() => {
        const lines: string[] = [];
        for (let l = 0; l < lineCount; l++) lines.push(editor.getLine(l));
        return lines.join("\n");
    })();

    let converted = fullText;
    for (const [re, replacement] of CN_TO_EN_PUNCT) {
        converted = converted.replace(re, replacement);
    }

    if (converted === fullText) return;

    const start = { line: 0, ch: 0 };
    const end = { line: lineCount - 1, ch: editor.getLine(lineCount - 1).length };
    editor.replaceRange(converted, start, end);

    let remaining = Math.min(totalCharsBefore, converted.length);
    let newLine = 0;
    const convertedLines = converted.split("\n");
    for (; newLine < convertedLines.length; newLine++) {
        const len = convertedLines[newLine].length + 1;
        if (remaining < len) {
            break;
        }
        remaining -= len;
    }
    if (newLine >= convertedLines.length) {
        newLine = convertedLines.length - 1;
        remaining = convertedLines[newLine].length;
    }
    editor.setCursor({ line: newLine, ch: remaining });
}

export type CalloutType = "tip" | "note" | "info" | "warning" | "important" | "question" | "example" | "quote";

export const CALLOUT_OPTIONS: { type: CalloutType; label: string }[] = [
    { type: "tip", label: "Tip 提示" },
    { type: "note", label: "Note 笔记" },
    { type: "info", label: "Info 信息" },
    { type: "warning", label: "Warning 警告" },
    { type: "important", label: "Important 重要" },
    { type: "question", label: "Question 问题" },
    { type: "example", label: "Example 示例" },
    { type: "quote", label: "Quote 引用" },
];

const CALLOUT_HEADER_RE = /^>\s*\[![\w-]+\][+-]?(?:\s+.*)?\s*$/;
const CALLOUT_BODY_RE = /^>\s?(.*)$/;

function unwrapCalloutText(text: string): string | null {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    let start = 0;
    while (start < lines.length && lines[start].trim() === "") {
        start++;
    }
    if (start >= lines.length || !CALLOUT_HEADER_RE.test(lines[start])) {
        return null;
    }

    const body = lines.slice(start + 1).map((line) => {
        const match = line.match(CALLOUT_BODY_RE);
        return match ? match[1] : line;
    });
    return body.join("\n");
}

/** 将选中文字包成 Callout（默认 tip）；已是 Callout 则取消 */
export function wrapCallout(editor: Editor, type: CalloutType = "tip"): void {
    const selected = editor.getSelection();
    const from = editor.getCursor("from");

    if (selected.length > 0) {
        const unwrapped = unwrapCalloutText(selected);
        if (unwrapped !== null) {
            editor.replaceSelection(unwrapped);
            return;
        }

        const bodyLines = selected.replace(/\r\n/g, "\n").split("\n").map((line) => {
            const stripped = line.replace(/^>\s?/, "");
            return stripped.length > 0 ? `> ${stripped}` : ">";
        });
        editor.replaceSelection(`> [!${type}]\n${bodyLines.join("\n")}`);
        return;
    }

    const line = editor.getLine(from.line);
    if (CALLOUT_HEADER_RE.test(line)) {
        editor.replaceRange("\n> ", { line: from.line, ch: line.length });
        editor.setCursor({ line: from.line + 1, ch: 2 });
        return;
    }

    const unwrappedLine = unwrapCalloutText(line);
    if (unwrappedLine !== null) {
        editor.replaceRange(
            unwrappedLine,
            { line: from.line, ch: 0 },
            { line: from.line, ch: line.length }
        );
        return;
    }

    const body = line.length > 0 ? `> ${line}` : "> ";
    editor.replaceRange(
        `> [!${type}]\n${body}`,
        { line: from.line, ch: 0 },
        { line: from.line, ch: line.length }
    );
    editor.setCursor({ line: from.line + 1, ch: body.length });
}

/** 统计一行的引用深度（开头连续 `>` 的数量） */
function calloutQuoteDepth(line: string): number {
    const m = line.match(/^\s*>(?:\s*>)*/);
    return m ? m[0].split(">").length - 1 : 0;
}

/** 取消选中的 Callout：移除 `> [!类型][+-]` 头，并去掉正文每行前的一个 `>`（嵌套引用保留一层） */
export function removeCallout(editor: Editor): void {
    const from = editor.getCursor("from");
    const posDepth = calloutQuoteDepth(editor.getLine(from.line));

    // 向上查找包含光标/选区起点的 Callout 头行（取所在引用块中最外层、深度最小的头）
    let headerLine = -1;
    let minDepth = Infinity;
    for (let l = from.line; l >= 0; l--) {
        const t = editor.getLine(l);
        if (CALLOUT_HEADER_RE.test(t)) {
            const d = calloutQuoteDepth(t);
            if (d <= posDepth && d < minDepth) {
                minDepth = d;
                headerLine = l;
            }
        }
        // 越过非引用内容行则停止向上搜索
        if (t.trim() !== "" && !t.trimStart().startsWith(">")) {
            break;
        }
    }
    if (headerLine === -1) return;

    // 确定 Callout 结束行：头行之后连续的引用行（含仅 ">" 的空白行）
    const lineCount = editor.lineCount();
    let endLine = headerLine;
    for (let l = headerLine + 1; l < lineCount; l++) {
        if (editor.getLine(l).trimStart().startsWith(">")) {
            endLine = l;
        } else {
            break;
        }
    }

    // 头行：去掉 "> [!类型][+-] " 前缀，保留标题文本（若有）作为普通行
    const headerText = editor.getLine(headerLine);
    const titleMatch = headerText.match(/^>\s*\[![\w-]+\][+-]?(?:\s+(.*))?\s*$/);
    const title = titleMatch ? (titleMatch[1] ?? "").trim() : "";

    const out: string[] = [];
    if (title.length > 0) {
        out.push(title);
    }

    // 正文：每行去掉一个 "> " 前缀（嵌套引用保留一层）
    for (let l = headerLine + 1; l <= endLine; l++) {
        const t = editor.getLine(l);
        const m = t.match(/^(\s*)>\s?(.*)$/);
        out.push(m ? m[1] + m[2] : t);
    }

    const newText = out.join("\n");
    const startPos = { line: headerLine, ch: 0 };
    const endPos = { line: endLine, ch: editor.getLine(endLine).length };
    replaceRangeOnce(editor, newText, startPos, endPos);

    const endSel = { line: headerLine + out.length - 1, ch: out[out.length - 1].length };
    editor.setSelection(startPos, endSel);
}

/** 清理一个 HTML 单元格内容：去标签、解码实体、压缩空白、转义管道符 */
function cleanHtmlCell(raw: string): string {
    let s = raw;
    // <br> 视为换行（Markdown 单元格内用空格代替）
    s = s.replace(/<br\s*\/?\s*>/gi, " ");
    // 去掉其余标签
    s = s.replace(/<[^>]+>/g, "");
    // 解码常见 HTML 实体
    s = s
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'");
    // 压缩空白（多行单元格合并为单行）
    s = s.replace(/\s+/g, " ").trim();
    // 转义 Markdown 表格分隔符
    s = s.replace(/\|/g, "\\|");
    return s;
}

/** 把 HTML `<table>` 文本解析为 Markdown 表格；无法解析时返回 null */
export function htmlTableToMarkdown(html: string): string | null {
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    if (!tableMatch) return null;
    const table = tableMatch[0];

    const rows: string[][] = [];
    const trRe = /<tr[\s\S]*?<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRe.exec(table)) !== null) {
        const cells: string[] = [];
        const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRe.exec(trMatch[0])) !== null) {
            cells.push(cleanHtmlCell(cellMatch[1]));
        }
        if (cells.length > 0) {
            rows.push(cells);
        }
    }

    if (rows.length === 0) return null;

    // 第一行作为表头；列数以最宽行为准
    const colCount = Math.max(...rows.map((r) => r.length));
    const header = rows[0];
    const body = rows.slice(1);

    const padRow = (cells: string[]): string => {
        const padded = [...cells];
        while (padded.length < colCount) padded.push("");
        return `| ${padded.join(" | ")} |`;
    };

    const lines: string[] = [padRow(header), `| ${Array(colCount).fill("---").join(" | ")} |`];
    for (const row of body) {
        lines.push(padRow(row));
    }
    return lines.join("\n");
}

/** 光标不在表格内时，向上/向下查找包围光标的 `<table>...</table>` 范围 */
function findEnclosingTable(
    editor: Editor,
    pos: { line: number; ch: number }
): { text: string; start: { line: number; ch: number }; end: { line: number; ch: number } } | null {
    let startLine = -1;
    for (let l = pos.line; l >= 0; l--) {
        if (/<table[\s>]/i.test(editor.getLine(l))) {
            startLine = l;
            break;
        }
    }
    if (startLine === -1) return null;

    let endLine = -1;
    const lineCount = editor.lineCount();
    for (let l = pos.line; l < lineCount; l++) {
        if (/<\/table>/i.test(editor.getLine(l))) {
            endLine = l;
            break;
        }
    }
    if (endLine === -1) return null;

    const lines: string[] = [];
    for (let l = startLine; l <= endLine; l++) {
        lines.push(editor.getLine(l));
    }
    return {
        text: lines.join("\n"),
        start: { line: startLine, ch: 0 },
        end: { line: endLine, ch: editor.getLine(endLine).length },
    };
}

/** 将选中（或光标所在）的 HTML 表格转换为 Obsidian Markdown 表格 */
export function convertHtmlTableToMarkdown(editor: Editor): void {
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    let text = editor.getSelection();
    let start = from;
    let end = to;

    if (text.trim().length === 0) {
        const found = findEnclosingTable(editor, from);
        if (!found) return;
        text = found.text;
        start = found.start;
        end = found.end;
    }

    const md = htmlTableToMarkdown(text);
    if (md === null) return;

    replaceRangeOnce(editor, md, start, end);
    const lines = md.split("\n");
    editor.setSelection(start, { line: start.line + lines.length - 1, ch: lines[lines.length - 1].length });
}

/** 切换选区 Markdown 加粗 `** **` */
export function toggleBold(editor: Editor): void {
    const selected = editor.getSelection();
    if (selected.length > 0 && selectionAlreadyBoldWrapped(selected)) {
        const inner = selected.slice(2, -2);
        const from = editor.getCursor("from");
        const to = editor.getCursor("to");
        replaceRangeOnce(editor, inner, from, to);
        editor.setSelection(from, { line: from.line, ch: from.ch + inner.length });
        return;
    }
    toggleWrap(editor, "**", "**");
}

function rewriteSelection(editor: Editor, rewrite: (text: string) => string): void {
    const selected = editor.getSelection();
    if (selected.length === 0) {
        return;
    }
    const next = rewrite(selected);
    if (next === selected) {
        return;
    }
    const from = editor.getCursor("from");
    replaceRangeOnce(editor, next, from, editor.getCursor("to"));
    const lines = next.split("\n");
    const end =
        lines.length === 1
            ? { line: from.line, ch: from.ch + next.length }
            : { line: from.line + lines.length - 1, ch: lines[lines.length - 1].length };
    editor.setSelection(from, end);
}

/** 选区内 HTML 变色 / 下划线等全部变成 **加粗** */
export function flattenSelectionToBold(editor: Editor): void {
    rewriteSelection(editor, flattenInlineToBold);
}

/** 去掉选区内变红；带粗体的红字保留为 **加粗** */
export function removeRedInSelection(editor: Editor): void {
    rewriteSelection(editor, stripRedMarkup);
}

