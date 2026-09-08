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

