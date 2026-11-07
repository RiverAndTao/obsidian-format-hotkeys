'use strict';

var ObsidianApi = require('obsidian');
var state = require('@codemirror/state');
var view = require('@codemirror/view');

function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n["default"] = e;
    return Object.freeze(n);
}

var ObsidianApi__namespace = /*#__PURE__*/_interopNamespace(ObsidianApi);

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

/** 保护代码块 / 行内代码 / 公式，避免格式变换误伤 */
const PLACEHOLDER_START = "\uE000";
const PLACEHOLDER_END = "\uE001";
function withProtectedRegions(text, transform) {
    const slots = [];
    const stash = (match) => {
        slots.push(match);
        return `${PLACEHOLDER_START}${slots.length - 1}${PLACEHOLDER_END}`;
    };
    const masked = text
        .replace(/```[\s\S]*?```/g, stash)
        .replace(/\$\$[\s\S]*?\$\$/g, stash)
        .replace(/\$[^$\n]+\$/g, stash)
        .replace(/`[^`\n]+`/g, stash);
    const transformed = transform(masked);
    return transformed.replace(/\uE000(\d+)\uE001/g, (_, index) => { var _a; return (_a = slots[Number(index)]) !== null && _a !== void 0 ? _a : ""; });
}
const RED_VALUES = new Set([
    "red",
    "#f00",
    "#ff0000",
    "#d1242f",
    "#cf222e",
    "#d73a49",
    "#c41e3a",
    "#c00000",
    "#d93333",
    "#ff7b72",
    "#f85149",
    "rgb(255,0,0)",
    "rgb(255, 0, 0)",
]);
function normalizeColor(value) {
    return value.trim().toLowerCase().replace(/\s+/g, "");
}
function isRedColorValue(value) {
    return RED_VALUES.has(normalizeColor(value));
}
function colorFromAttrs$1(attrs) {
    const quoted = attrs.match(/\bcolor\s*=\s*["']([^"']+)["']/i);
    if (quoted) {
        return quoted[1];
    }
    const bare = attrs.match(/\bcolor\s*=\s*([#\w()]+)/i);
    if (bare) {
        return bare[1];
    }
    const style = attrs.match(/\bstyle\s*=\s*["']([^"']+)["']/i);
    if (style) {
        const color = style[1].match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        if (color) {
            return color[1];
        }
    }
    return null;
}
const RED_UNDERLINE_CLASS = "fh-red-underline";
const RED_WAVY_CLASS = "fh-red-wavy";
function htmlAttrsHaveClass(attrs, className) {
    const quoted = attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i);
    if (!quoted) {
        return false;
    }
    return quoted[1].split(/\s+/).includes(className);
}
function hasBoldWeight$1(attrs) {
    return /font-weight\s*:\s*(bold|[6-9]00)/i.test(attrs);
}
function isRedEmphasisAttrs(attrs) {
    if (htmlAttrsHaveClass(attrs, RED_UNDERLINE_CLASS) || htmlAttrsHaveClass(attrs, RED_WAVY_CLASS)) {
        return true;
    }
    const color = colorFromAttrs$1(attrs);
    return !!color && isRedColorValue(color);
}
function wrapAsBold(inner) {
    var _a, _b, _c, _d;
    const lead = (_b = (_a = inner.match(/^\s*/)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : "";
    const trail = (_d = (_c = inner.match(/\s*$/)) === null || _c === void 0 ? void 0 : _c[0]) !== null && _d !== void 0 ? _d : "";
    let core = inner.slice(lead.length, inner.length - trail.length);
    core = core.replace(/\*\*/g, "");
    if (!core) {
        return inner;
    }
    return `${lead}**${core}**`;
}
function unwrapHtmlOnce(text, toBold, redOnly) {
    const replaceTag = (attrs, inner) => {
        if (redOnly) {
            if (!isRedEmphasisAttrs(attrs)) {
                return null;
            }
            if (hasBoldWeight$1(attrs)) {
                return wrapAsBold(inner);
            }
            return inner;
        }
        return wrapAsBold(inner);
    };
    let out = text.replace(/<font\b([^>]*)>([\s\S]*?)<\/font>/gi, (full, attrs, inner) => {
        const next = replaceTag(attrs, inner);
        return next === null ? full : next;
    });
    out = out.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (full, attrs, inner) => {
        if (redOnly) {
            if (!isRedEmphasisAttrs(attrs)) {
                return full;
            }
            return hasBoldWeight$1(attrs) ? wrapAsBold(inner) : inner;
        }
        if (!colorFromAttrs$1(attrs) && !hasBoldWeight$1(attrs) && !isRedEmphasisAttrs(attrs)) {
            return full;
        }
        return wrapAsBold(inner);
    });
    if (!redOnly) {
        out = out.replace(/<u>([\s\S]*?)<\/u>/gi, (_full, inner) => wrapAsBold(inner));
        out = out.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, (_full, inner) => wrapAsBold(inner));
    }
    return out;
}
function stabilize(text, step) {
    let current = text;
    for (let i = 0; i < 8; i++) {
        const next = step(current);
        if (next === current) {
            return current;
        }
        current = next;
    }
    return current;
}
/** 选区内 HTML 变色 / 下划线 / 加粗标签全部变成 Markdown **加粗** */
function flattenInlineToBold(text) {
    return withProtectedRegions(text, (plain) => stabilize(plain, (value) => unwrapHtmlOnce(value, true, false)));
}
/** 去掉选区内的变红标记；若原标签带 bold，则保留为 **加粗** */
function stripRedMarkup(text) {
    return withProtectedRegions(text, (plain) => stabilize(plain, (value) => unwrapHtmlOnce(value, false, true)));
}
function selectionAlreadyBoldWrapped(text) {
    return /^\*\*[\s\S]+\*\*$/.test(text) && !text.slice(2, -2).includes("**");
}

const UNDO_ORIGIN = "format-hotkeys";
/** 一次替换，进入同一个撤销步 */
function replaceRangeOnce(editor, replacement, from = editor.getCursor("from"), to = editor.getCursor("to")) {
    editor.replaceRange(replacement, from, to, UNDO_ORIGIN);
}
const RED_UNDERLINE_OPEN = '<span class="fh-red-underline">';
const RED_WAVY_OPEN = '<span class="fh-red-wavy">';
const SPAN_CLOSE = "</span>";
function toggleRedUnderline(editor) {
    toggleWrap(editor, RED_UNDERLINE_OPEN, SPAN_CLOSE);
}
function toggleRedWavy(editor) {
    toggleWrap(editor, RED_WAVY_OPEN, SPAN_CLOSE);
}
/** 切换包裹格式：已包裹则取消，否则添加。有选区时结束后光标落在词后，不保持选中。 */
function toggleWrap(editor, open, close) {
    const selected = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    if (from.line !== to.line) {
        editor.replaceSelection(open + selected + close, UNDO_ORIGIN);
        if (selected.length > 0) {
            editor.setCursor({ line: to.line, ch: to.ch });
        }
        else {
            editor.setCursor({ line: from.line, ch: from.ch + open.length });
        }
        return;
    }
    const line = editor.getLine(from.line);
    const beforeStart = from.ch - open.length;
    const afterEnd = to.ch + close.length;
    if (beforeStart >= 0 &&
        afterEnd <= line.length &&
        line.substring(beforeStart, from.ch) === open &&
        line.substring(to.ch, afterEnd) === close) {
        editor.replaceRange(selected, { line: from.line, ch: beforeStart }, { line: to.line, ch: afterEnd }, UNDO_ORIGIN);
        editor.setCursor({ line: from.line, ch: beforeStart + selected.length });
        return;
    }
    editor.replaceSelection(open + selected + close, UNDO_ORIGIN);
    if (selected.length > 0) {
        editor.setCursor({ line: to.line, ch: to.ch + open.length });
    }
    else {
        editor.setCursor({ line: from.line, ch: from.ch + open.length });
    }
}
/** 光标在正文中的偏移；落在标题标记或行首空白上时视为 0 */
function contentOffset(cursorCh, prefixLen) {
    return Math.max(0, cursorCh - prefixLen);
}
/**
 * 设置当前行标题级别；已是该级别则取消标题。
 * 加上标题后，光标停在 `#` 标记之后（正文里原有位置会保留）。
 */
function toggleHeading(editor, level) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const prefix = "#".repeat(level) + " ";
    if (headingMatch) {
        const currentLevel = headingMatch[1].length;
        const content = headingMatch[2];
        const oldPrefixLen = line.length - content.length;
        const offset = contentOffset(cursor.ch, oldPrefixLen);
        if (currentLevel === level) {
            editor.setLine(cursor.line, content);
            editor.setCursor({ line: cursor.line, ch: Math.min(offset, content.length) });
            return;
        }
        editor.setLine(cursor.line, prefix + content);
        editor.setCursor({ line: cursor.line, ch: prefix.length + offset });
        return;
    }
    const content = line.trimStart();
    const leading = line.length - content.length;
    const offset = contentOffset(cursor.ch, leading);
    editor.setLine(cursor.line, prefix + content);
    editor.setCursor({ line: cursor.line, ch: prefix.length + offset });
}
/** 在光标处插入文本 */
function insertTextAtCursor(editor, text) {
    const cursor = editor.getCursor();
    editor.replaceSelection(text);
    editor.setCursor({ line: cursor.line, ch: cursor.ch + text.length });
}
const CODE_FENCE = "```";
const CODE_BLOCK_RE = /^```(\S*)\n([\s\S]*)\n```$/;
function openFence(language) {
    return language ? `${CODE_FENCE}${language}` : CODE_FENCE;
}
/** 创建或切换代码块 */
function toggleCodeBlock(editor, language = "") {
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
            editor.setSelection({ line: from.line, ch: from.ch }, { line: from.line, ch: from.ch + inner.length });
            return;
        }
        editor.replaceSelection(`${fence}\n${selected}\n${CODE_FENCE}`);
        editor.setSelection({ line: from.line + 1, ch: 0 }, { line: to.line + 1, ch: editor.getLine(to.line + 1).length });
        return;
    }
    const cursor = editor.getCursor();
    editor.replaceSelection(`${fence}\n\n${CODE_FENCE}`);
    editor.setCursor({ line: cursor.line + 1, ch: 0 });
}
/** 去除选区内的空行（仅含空白字符的行） */
function removeBlankLinesInSelection(editor) {
    var _a, _b;
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const startLine = from.line;
    const endLine = to.line;
    const lines = [];
    for (let i = startLine; i <= endLine; i++) {
        lines.push(editor.getLine(i));
    }
    const nonBlankLines = lines.filter((line) => line.trim().length > 0);
    if (nonBlankLines.length === lines.length) {
        return;
    }
    const newText = nonBlankLines.join("\n");
    editor.replaceRange(newText, { line: startLine, ch: 0 }, { line: endLine, ch: editor.getLine(endLine).length });
    const lastLine = startLine + nonBlankLines.length - 1;
    editor.setSelection({ line: startLine, ch: 0 }, { line: lastLine, ch: (_b = (_a = nonBlankLines[nonBlankLines.length - 1]) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0 });
}
/** 将块级 LaTeX 公式 ($$...$$) 转换为行内 LaTeX 公式 ($...$) */
function convertBlockMathToInline(editor) {
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
        editor.setSelection({ line: from.line, ch: from.ch }, { line: from.line, ch: from.ch + result.length });
        return;
    }
    const openPos = findBlockMathOpenDelimiter(editor, from);
    if (!openPos)
        return;
    const closePos = findBlockMathCloseDelimiter(editor, to);
    if (!closePos)
        return;
    const innerParts = [];
    for (let l = openPos.line; l <= closePos.line; l++) {
        let lineText = editor.getLine(l);
        let s = 0;
        let e = lineText.length;
        if (l === openPos.line)
            s = openPos.ch + 2;
        if (l === closePos.line)
            e = closePos.ch;
        if (l === openPos.line && l === closePos.line) {
            innerParts.push(lineText.substring(s, e));
        }
        else if (l === openPos.line) {
            innerParts.push(lineText.substring(s));
        }
        else if (l === closePos.line) {
            innerParts.push(lineText.substring(0, e));
        }
        else {
            innerParts.push(lineText);
        }
    }
    const innerContent = innerParts.join("\n").trim();
    const newText = "$" + innerContent + "$";
    const closeEndPos = { line: closePos.line, ch: closePos.ch + 2 };
    editor.replaceRange(newText, openPos, closeEndPos);
    editor.setSelection({ line: openPos.line, ch: openPos.ch }, { line: openPos.line, ch: openPos.ch + newText.length });
}
function findBlockMathOpenDelimiter(editor, from) {
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
function findBlockMathCloseDelimiter(editor, to) {
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
function convertBlockMathToInlineAndJoin(editor) {
    convertBlockMathToInline(editor);
    const cursor = editor.getCursor();
    if (cursor.line <= 0)
        return;
    const currentLine = editor.getLine(cursor.line);
    const prevLine = editor.getLine(cursor.line - 1);
    const merged = prevLine + currentLine;
    editor.replaceRange(merged, { line: cursor.line - 1, ch: 0 }, { line: cursor.line, ch: currentLine.length });
    const newCh = prevLine.length + cursor.ch;
    editor.setCursor({ line: cursor.line - 1, ch: newCh });
}
const CN_TO_EN_PUNCT = [
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
function normalizePunctuation(editor) {
    const lineCount = editor.lineCount();
    if (lineCount === 0)
        return;
    const cursor = editor.getCursor();
    const totalCharsBefore = (() => {
        let total = 0;
        for (let l = 0; l < cursor.line; l++) {
            total += editor.getLine(l).length + 1;
        }
        return total + cursor.ch;
    })();
    const fullText = (() => {
        const lines = [];
        for (let l = 0; l < lineCount; l++)
            lines.push(editor.getLine(l));
        return lines.join("\n");
    })();
    let converted = fullText;
    for (const [re, replacement] of CN_TO_EN_PUNCT) {
        converted = converted.replace(re, replacement);
    }
    if (converted === fullText)
        return;
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
const CALLOUT_OPTIONS = [
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
function unwrapCalloutText(text) {
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
function wrapCallout(editor, type = "tip") {
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
        editor.replaceRange(unwrappedLine, { line: from.line, ch: 0 }, { line: from.line, ch: line.length });
        return;
    }
    const body = line.length > 0 ? `> ${line}` : "> ";
    editor.replaceRange(`> [!${type}]\n${body}`, { line: from.line, ch: 0 }, { line: from.line, ch: line.length });
    editor.setCursor({ line: from.line + 1, ch: body.length });
}
/** 统计一行的引用深度（开头连续 `>` 的数量） */
function calloutQuoteDepth(line) {
    const m = line.match(/^\s*>(?:\s*>)*/);
    return m ? m[0].split(">").length - 1 : 0;
}
/** 取消选中的 Callout：移除 `> [!类型][+-]` 头，并去掉正文每行前的一个 `>`（嵌套引用保留一层） */
function removeCallout(editor) {
    var _a;
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
    if (headerLine === -1)
        return;
    // 确定 Callout 结束行：头行之后连续的引用行（含仅 ">" 的空白行）
    const lineCount = editor.lineCount();
    let endLine = headerLine;
    for (let l = headerLine + 1; l < lineCount; l++) {
        if (editor.getLine(l).trimStart().startsWith(">")) {
            endLine = l;
        }
        else {
            break;
        }
    }
    // 头行：去掉 "> [!类型][+-] " 前缀，保留标题文本（若有）作为普通行
    const headerText = editor.getLine(headerLine);
    const titleMatch = headerText.match(/^>\s*\[![\w-]+\][+-]?(?:\s+(.*))?\s*$/);
    const title = titleMatch ? ((_a = titleMatch[1]) !== null && _a !== void 0 ? _a : "").trim() : "";
    const out = [];
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
function cleanHtmlCell(raw) {
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
function htmlTableToMarkdown(html) {
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    if (!tableMatch)
        return null;
    const table = tableMatch[0];
    const rows = [];
    const trRe = /<tr[\s\S]*?<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRe.exec(table)) !== null) {
        const cells = [];
        const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let cellMatch;
        while ((cellMatch = cellRe.exec(trMatch[0])) !== null) {
            cells.push(cleanHtmlCell(cellMatch[1]));
        }
        if (cells.length > 0) {
            rows.push(cells);
        }
    }
    if (rows.length === 0)
        return null;
    // 第一行作为表头；列数以最宽行为准
    const colCount = Math.max(...rows.map((r) => r.length));
    const header = rows[0];
    const body = rows.slice(1);
    const padRow = (cells) => {
        const padded = [...cells];
        while (padded.length < colCount)
            padded.push("");
        return `| ${padded.join(" | ")} |`;
    };
    const lines = [padRow(header), `| ${Array(colCount).fill("---").join(" | ")} |`];
    for (const row of body) {
        lines.push(padRow(row));
    }
    return lines.join("\n");
}
/** 光标不在表格内时，向上/向下查找包围光标的 `<table>...</table>` 范围 */
function findEnclosingTable(editor, pos) {
    let startLine = -1;
    for (let l = pos.line; l >= 0; l--) {
        if (/<table[\s>]/i.test(editor.getLine(l))) {
            startLine = l;
            break;
        }
    }
    if (startLine === -1)
        return null;
    let endLine = -1;
    const lineCount = editor.lineCount();
    for (let l = pos.line; l < lineCount; l++) {
        if (/<\/table>/i.test(editor.getLine(l))) {
            endLine = l;
            break;
        }
    }
    if (endLine === -1)
        return null;
    const lines = [];
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
function convertHtmlTableToMarkdown(editor) {
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    let text = editor.getSelection();
    let start = from;
    let end = to;
    if (text.trim().length === 0) {
        const found = findEnclosingTable(editor, from);
        if (!found)
            return;
        text = found.text;
        start = found.start;
        end = found.end;
    }
    const md = htmlTableToMarkdown(text);
    if (md === null)
        return;
    replaceRangeOnce(editor, md, start, end);
    const lines = md.split("\n");
    editor.setSelection(start, { line: start.line + lines.length - 1, ch: lines[lines.length - 1].length });
}
/** 切换选区 Markdown 加粗 `** **` */
function toggleBold(editor) {
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
function rewriteSelection(editor, rewrite) {
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
    const end = lines.length === 1
        ? { line: from.line, ch: from.ch + next.length }
        : { line: from.line + lines.length - 1, ch: lines[lines.length - 1].length };
    editor.setSelection(from, end);
}
/** 选区内 HTML 变色 / 下划线等全部变成 **加粗** */
function flattenSelectionToBold(editor) {
    rewriteSelection(editor, flattenInlineToBold);
}
/** 去掉选区内变红；带粗体的红字保留为 **加粗** */
function removeRedInSelection(editor) {
    rewriteSelection(editor, stripRedMarkup);
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];
const HEADING_LABELS = {
    1: "一级标题",
    2: "二级标题",
    3: "三级标题",
    4: "四级标题",
    5: "五级标题",
    6: "六级标题",
};
const DEFAULT_TYPORA_STYLE = {
    contentWidth: 1200,
    lineHeight: 1.6,
    linePadding: 0.15,
    hideSyntax: true,
    headingUnderline: true,
    highlightActiveLine: true,
    headings: {
        1: { size: 1.48, color: "" },
        2: { size: 1.26, color: "" },
        3: { size: 1.12, color: "" },
        4: { size: 1.04, color: "" },
        5: { size: 1.0, color: "" },
        6: { size: 0.95, color: "" },
    },
    backgroundColor: "",
    backgroundColorDark: "",
    textColor: "",
    textColorDark: "",
    textMutedColor: "",
    textMutedColorDark: "",
    boldColor: "",
    quoteColor: "",
    linkColor: "",
    inlineCodeColor: "",
    listMarkerColor: "",
};
const TYPORA_RUNTIME_STYLE_ID = "format-hotkeys-typora-runtime";
const TYPORA_STYLE_KEYS = [
    "--typora-content-width",
    "--typora-line-height",
    "--typora-line-padding",
    "--typora-h1-size",
    "--typora-h2-size",
    "--typora-h3-size",
    "--typora-h4-size",
    "--typora-h5-size",
    "--typora-h6-size",
    "--typora-h1-color",
    "--typora-h2-color",
    "--typora-h3-color",
    "--typora-h4-color",
    "--typora-h5-color",
    "--typora-h6-color",
    "--typora-heading-underline",
    "--typora-quote-color",
    "--typora-link-color",
    "--typora-inline-code-color",
    "--typora-list-marker-color",
    "--typora-bold-color",
    "--typora-active-line-bg",
];
function cloneHeading(style) {
    return { size: style.size, color: style.color };
}
function mergeTyporaStyle(raw) {
    const merged = Object.assign(Object.assign(Object.assign({}, DEFAULT_TYPORA_STYLE), (raw !== null && raw !== void 0 ? raw : {})), { headings: {
            1: cloneHeading(DEFAULT_TYPORA_STYLE.headings[1]),
            2: cloneHeading(DEFAULT_TYPORA_STYLE.headings[2]),
            3: cloneHeading(DEFAULT_TYPORA_STYLE.headings[3]),
            4: cloneHeading(DEFAULT_TYPORA_STYLE.headings[4]),
            5: cloneHeading(DEFAULT_TYPORA_STYLE.headings[5]),
            6: cloneHeading(DEFAULT_TYPORA_STYLE.headings[6]),
        } });
    if (raw === null || raw === void 0 ? void 0 : raw.headings) {
        for (const level of HEADING_LEVELS) {
            const incoming = raw.headings[level];
            if (incoming) {
                merged.headings[level] = {
                    size: typeof incoming.size === "number" ? incoming.size : DEFAULT_TYPORA_STYLE.headings[level].size,
                    color: typeof incoming.color === "string" ? incoming.color : "",
                };
            }
        }
    }
    return merged;
}
function cloneTyporaStyle(style) {
    return mergeTyporaStyle(style);
}
/** 未自定义时跟随主题各级标题色（Prime：H1 紫 / H2 青 / H3 绿…） */
function headingColorValue(level, color) {
    if (color) {
        return color;
    }
    return `var(--h${level}-color)`;
}
function writeTyporaVars(el, style) {
    el.style.setProperty("--typora-content-width", `${style.contentWidth}px`);
    el.style.setProperty("--typora-line-height", String(style.lineHeight));
    el.style.setProperty("--typora-line-padding", `${style.linePadding}em`);
    for (const level of HEADING_LEVELS) {
        const heading = style.headings[level];
        el.style.setProperty(`--typora-h${level}-size`, `${heading.size}em`);
        el.style.setProperty(`--typora-h${level}-color`, headingColorValue(level, heading.color));
    }
    el.style.setProperty("--typora-heading-underline", style.headingUnderline ? "1px solid var(--background-modifier-border)" : "none");
    el.style.setProperty("--typora-quote-color", style.quoteColor || "var(--text-muted)");
    el.style.setProperty("--typora-link-color", style.linkColor || "var(--link-color)");
    el.style.setProperty("--typora-inline-code-color", style.inlineCodeColor || "var(--code-normal, var(--text-normal))");
    el.style.setProperty("--typora-list-marker-color", style.listMarkerColor || "var(--text-normal)");
    el.style.setProperty("--typora-bold-color", style.boldColor || "var(--bold-color, var(--text-normal))");
    el.style.setProperty("--typora-active-line-bg", style.highlightActiveLine ? "rgba(135, 131, 120, 0.05)" : "transparent");
}
function headingColorOverrideCss(style) {
    return HEADING_LEVELS.map((level) => {
        const custom = style.headings[level].color;
        if (!custom) {
            return `
.format-hotkeys-typora-preview-h${level} {
    color: var(--h${level}-color);
}`;
        }
        return `
body.typora-mode-active .markdown-source-view.mod-cm6 {
    --h${level}-color: ${custom} !important;
}
body.typora-mode-active .markdown-source-view.mod-cm6 .HyperMD-header-${level},
body.typora-mode-active .markdown-source-view.mod-cm6 .HyperMD-header-${level} .cm-header,
body.typora-mode-active .markdown-source-view.mod-cm6 .cm-header.cm-header-${level} {
    color: ${custom} !important;
}
.format-hotkeys-typora-preview-h${level} {
    color: ${custom} !important;
}`;
    }).join("\n");
}
/** 浅色 / 深色：背景 + 正文 / 次要文字 */
function surfaceOverrideCss(style) {
    var _a, _b, _c, _d, _e, _f, _g;
    const parts = [];
    const lightBg = (_a = style.backgroundColor) === null || _a === void 0 ? void 0 : _a.trim();
    const darkBg = (_b = style.backgroundColorDark) === null || _b === void 0 ? void 0 : _b.trim();
    const lightText = (_c = style.textColor) === null || _c === void 0 ? void 0 : _c.trim();
    const darkText = (_d = style.textColorDark) === null || _d === void 0 ? void 0 : _d.trim();
    const lightMuted = (_e = style.textMutedColor) === null || _e === void 0 ? void 0 : _e.trim();
    const darkMuted = (_f = style.textMutedColorDark) === null || _f === void 0 ? void 0 : _f.trim();
    const bold = (_g = style.boldColor) === null || _g === void 0 ? void 0 : _g.trim();
    if (lightBg || lightText || lightMuted) {
        const rules = [];
        if (lightBg) {
            rules.push(`--background-primary: ${lightBg} !important;`, `--background-primary-alt: color-mix(in srgb, ${lightBg} 92%, #000 8%) !important;`, `--background-secondary: color-mix(in srgb, ${lightBg} 86%, #000 14%) !important;`, `--background-secondary-alt: color-mix(in srgb, ${lightBg} 80%, #000 20%) !important;`, `--titlebar-background: ${lightBg} !important;`, `--titlebar-background-focused: ${lightBg} !important;`, `--modal-background: ${lightBg} !important;`);
        }
        if (lightText) {
            rules.push(`--text-normal: ${lightText} !important;`, `--text-muted: ${lightMuted || `color-mix(in srgb, ${lightText} 72%, transparent)`} !important;`, `--text-faint: color-mix(in srgb, ${lightText} 45%, transparent) !important;`);
        }
        else if (lightMuted) {
            rules.push(`--text-muted: ${lightMuted} !important;`);
        }
        parts.push(`body.theme-light {\n${rules.map((r) => `    ${r}`).join("\n")}\n}`);
        if (lightBg) {
            parts.push(`.format-hotkeys-typora-preview { background: ${lightBg} !important; }`);
        }
        if (lightText) {
            parts.push(`.format-hotkeys-typora-preview { color: ${lightText} !important; }`);
        }
    }
    if (darkBg || darkText || darkMuted) {
        const rules = [];
        if (darkBg) {
            rules.push(`--background-primary: ${darkBg} !important;`, `--background-primary-alt: color-mix(in srgb, ${darkBg} 88%, #fff 12%) !important;`, `--background-secondary: color-mix(in srgb, ${darkBg} 82%, #fff 18%) !important;`, `--background-secondary-alt: color-mix(in srgb, ${darkBg} 76%, #fff 24%) !important;`, `--titlebar-background: ${darkBg} !important;`, `--titlebar-background-focused: ${darkBg} !important;`, `--modal-background: ${darkBg} !important;`);
        }
        if (darkText) {
            rules.push(`--text-normal: ${darkText} !important;`, `--text-muted: ${darkMuted || `color-mix(in srgb, ${darkText} 72%, transparent)`} !important;`, `--text-faint: color-mix(in srgb, ${darkText} 45%, transparent) !important;`);
        }
        else if (darkMuted) {
            rules.push(`--text-muted: ${darkMuted} !important;`);
        }
        parts.push(`body.theme-dark {\n${rules.map((r) => `    ${r}`).join("\n")}\n}`);
    }
    if (bold) {
        parts.push(`
body.typora-mode-active .markdown-source-view.mod-cm6 {
    --bold-color: ${bold} !important;
    --typora-bold-color: ${bold} !important;
}
body.typora-mode-active .markdown-source-view.mod-cm6 .cm-strong {
    color: ${bold} !important;
}`);
    }
    return parts.join("\n");
}
function applyTyporaStyleVars(el, style) {
    writeTyporaVars(el, style);
    if (document.documentElement !== el) {
        writeTyporaVars(document.documentElement, style);
    }
    let tag = document.getElementById(TYPORA_RUNTIME_STYLE_ID);
    if (!tag) {
        tag = document.createElement("style");
        tag.id = TYPORA_RUNTIME_STYLE_ID;
        document.head.appendChild(tag);
    }
    tag.textContent = [surfaceOverrideCss(style), headingColorOverrideCss(style)].join("\n");
}
function clearTyporaStyleVars(el) {
    var _a;
    for (const key of TYPORA_STYLE_KEYS) {
        el.style.removeProperty(key);
        document.documentElement.style.removeProperty(key);
    }
    (_a = document.getElementById(TYPORA_RUNTIME_STYLE_ID)) === null || _a === void 0 ? void 0 : _a.remove();
}
function cssColorToHex(color) {
    const value = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
        return value.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
        return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
    }
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("2d");
    if (ctx) {
        ctx.fillStyle = "#808080";
        ctx.fillStyle = value;
        const normalized = String(ctx.fillStyle);
        if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
            return normalized.toLowerCase();
        }
    }
    const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgb) {
        const hex = [rgb[1], rgb[2], rgb[3]]
            .map((part) => Number(part).toString(16).padStart(2, "0"))
            .join("");
        return `#${hex}`;
    }
    return "#808080";
}
function themeColorHex(cssVar = "--text-normal") {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.color = `var(${cssVar})`;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    if (computed) {
        return cssColorToHex(computed);
    }
    return cssColorToHex(getComputedStyle(document.body).color);
}
/** 读取当前主题的各级标题色（Prime：H1 紫 / H2 青 / H3 绿 / H4 黄 / H5 橙 / H6 粉） */
function headingThemeColorHex(level) {
    const heading = themeColorHex(`--h${level}-color`);
    const normal = themeColorHex("--text-normal");
    if (heading && heading !== normal && heading !== "#808080") {
        return heading;
    }
    const palette = {
        1: "--color-purple",
        2: "--color-blue",
        3: "--color-green",
        4: "--color-yellow",
        5: "--color-orange",
        6: "--color-pink",
    };
    const fromPalette = themeColorHex(palette[level]);
    if (fromPalette && fromPalette !== "#808080" && fromPalette !== normal) {
        return fromPalette;
    }
    return heading || themeColorHex("--text-accent");
}

class TyporaSettingsPanel {
    constructor(plugin, containerEl, onRerender) {
        this.plugin = plugin;
        this.containerEl = containerEl;
        this.onRerender = onRerender;
    }
    render() {
        const { containerEl } = this;
        containerEl.createEl("p", {
            text: "默认跟随当前主题的标题色（Prime 主题：H1 紫、H2 青、H3 绿、H4 黄、H5 橙、H6 粉）。改色后即时生效。",
            cls: "setting-item-description format-hotkeys-typora-intro",
        });
        new ObsidianApi.Setting(containerEl)
            .setName("启用 Typora 显示模式")
            .setDesc("隐藏 Markdown 语法符号并套用下方排版。也可从编辑器工具栏开关。")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.typoraMode).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.typoraMode = value;
            yield this.plugin.saveSettings();
            this.plugin.applyTyporaMode();
        })));
        this.renderPreview(containerEl);
        containerEl.createEl("h4", { text: "排版", cls: "format-hotkeys-typora-subtitle" });
        this.addSliderSetting(containerEl, {
            name: "内容宽度",
            desc: "编辑区域最大宽度",
            min: 720,
            max: 1600,
            step: 20,
            getValue: () => this.plugin.settings.typora.contentWidth,
            setValue: (value) => {
                this.plugin.settings.typora.contentWidth = value;
            },
            format: (value) => `${value}px`,
        });
        this.addSliderSetting(containerEl, {
            name: "行高",
            desc: "正文行距，Typora GitHub 主题约为 1.6",
            min: 1.2,
            max: 2.2,
            step: 0.05,
            getValue: () => this.plugin.settings.typora.lineHeight,
            setValue: (value) => {
                this.plugin.settings.typora.lineHeight = value;
            },
            format: (value) => value.toFixed(2),
        });
        this.addSliderSetting(containerEl, {
            name: "段落行间距",
            desc: "每一行上下的额外空隙",
            min: 0,
            max: 0.45,
            step: 0.01,
            getValue: () => this.plugin.settings.typora.linePadding,
            setValue: (value) => {
                this.plugin.settings.typora.linePadding = value;
            },
            format: (value) => `${value.toFixed(2)}em`,
        });
        new ObsidianApi.Setting(containerEl)
            .setName("隐藏 Markdown 语法")
            .setDesc("非编辑行隐藏 #、**、`、> 等符号；有序列表的 1. 2. 始终保留")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.typora.hideSyntax).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.typora.hideSyntax = value;
            yield this.persist();
        })));
        new ObsidianApi.Setting(containerEl)
            .setName("一级 / 二级标题下划线")
            .setDesc("对齐 Typora GitHub 主题的标题底部分隔线")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.typora.headingUnderline).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.typora.headingUnderline = value;
            yield this.persist();
        })));
        new ObsidianApi.Setting(containerEl)
            .setName("高亮当前编辑行")
            .setDesc("光标所在行显示淡底，便于对照语法")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.typora.highlightActiveLine).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.typora.highlightActiveLine = value;
            yield this.persist();
        })));
        containerEl.createEl("h4", { text: "标题字号与颜色", cls: "format-hotkeys-typora-subtitle" });
        containerEl.createEl("p", {
            text: "默认写入当前主题的各级标题色。H1 紫、H2 青。点色块可改，重置则回到主题色。",
            cls: "setting-item-description",
        });
        for (const level of HEADING_LEVELS) {
            this.addHeadingStyleSetting(containerEl, level);
        }
        containerEl.createEl("h4", { text: "界面与颜色", cls: "format-hotkeys-typora-subtitle" });
        containerEl.createEl("p", {
            text: "背景 / 正文可分别设置浅色与深色。空值跟随当前主题；点重置恢复主题色。",
            cls: "setting-item-description",
        });
        this.addOptionalColorSetting(containerEl, {
            name: "浅色模式背景",
            desc: "覆盖浅色模式下整站背景（编辑区、侧栏、标题栏）",
            getValue: () => this.plugin.settings.typora.backgroundColor,
            setValue: (value) => {
                this.plugin.settings.typora.backgroundColor = value;
            },
            fallbackVar: "--background-primary",
            fallbackHex: "#ffffff",
        });
        this.addOptionalColorSetting(containerEl, {
            name: "深色模式背景",
            desc: "覆盖深色模式下整站背景；浅色模式不受影响",
            getValue: () => this.plugin.settings.typora.backgroundColorDark,
            setValue: (value) => {
                this.plugin.settings.typora.backgroundColorDark = value;
            },
            fallbackVar: "--background-primary",
            fallbackHex: "#1e1e1e",
            preferDarkFallback: true,
        });
        this.addOptionalColorSetting(containerEl, {
            name: "浅色模式正文",
            desc: "浅色模式下正文 / 段落文字颜色",
            getValue: () => this.plugin.settings.typora.textColor,
            setValue: (value) => {
                this.plugin.settings.typora.textColor = value;
            },
            fallbackVar: "--text-normal",
            fallbackHex: "#2e3338",
        });
        this.addOptionalColorSetting(containerEl, {
            name: "深色模式正文",
            desc: "深色模式下正文 / 段落文字颜色",
            getValue: () => this.plugin.settings.typora.textColorDark,
            setValue: (value) => {
                this.plugin.settings.typora.textColorDark = value;
            },
            fallbackVar: "--text-normal",
            fallbackHex: "#dcddde",
            preferDarkFallback: true,
        });
        this.addOptionalColorSetting(containerEl, {
            name: "浅色次要文字",
            desc: "浅色模式下弱化文字（muted）",
            getValue: () => this.plugin.settings.typora.textMutedColor,
            setValue: (value) => {
                this.plugin.settings.typora.textMutedColor = value;
            },
            fallbackVar: "--text-muted",
            fallbackHex: "#6c6f73",
        });
        this.addOptionalColorSetting(containerEl, {
            name: "深色次要文字",
            desc: "深色模式下弱化文字（muted）",
            getValue: () => this.plugin.settings.typora.textMutedColorDark,
            setValue: (value) => {
                this.plugin.settings.typora.textMutedColorDark = value;
            },
            fallbackVar: "--text-muted",
            fallbackHex: "#999999",
            preferDarkFallback: true,
        });
        this.addOptionalColorSetting(containerEl, {
            name: "粗体颜色",
            desc: "加粗文字颜色（空则跟随正文）",
            getValue: () => this.plugin.settings.typora.boldColor,
            setValue: (value) => {
                this.plugin.settings.typora.boldColor = value;
            },
            fallbackVar: "--text-normal",
        });
        this.addOptionalColorSetting(containerEl, {
            name: "引用文字颜色",
            desc: "块引用 > 的文字颜色",
            getValue: () => this.plugin.settings.typora.quoteColor,
            setValue: (value) => {
                this.plugin.settings.typora.quoteColor = value;
            },
            fallbackVar: "--text-muted",
        });
        this.addOptionalColorSetting(containerEl, {
            name: "链接颜色",
            desc: "链接文字颜色",
            getValue: () => this.plugin.settings.typora.linkColor,
            setValue: (value) => {
                this.plugin.settings.typora.linkColor = value;
            },
            fallbackVar: "--link-color",
        });
        this.addOptionalColorSetting(containerEl, {
            name: "行内代码颜色",
            desc: "行内 `code` 的文字颜色",
            getValue: () => this.plugin.settings.typora.inlineCodeColor,
            setValue: (value) => {
                this.plugin.settings.typora.inlineCodeColor = value;
            },
            fallbackVar: "--code-normal",
        });
        this.addOptionalColorSetting(containerEl, {
            name: "列表标记颜色",
            desc: "无序列表圆点颜色",
            getValue: () => this.plugin.settings.typora.listMarkerColor,
            setValue: (value) => {
                this.plugin.settings.typora.listMarkerColor = value;
            },
            fallbackVar: "--text-normal",
        });
        new ObsidianApi.Setting(containerEl)
            .setName("恢复默认样式")
            .setDesc("还原为当前主题的标题色（H1 紫、H2 青等）和默认排版")
            .addButton((btn) => btn.setButtonText("恢复默认").onClick(() => __awaiter(this, void 0, void 0, function* () {
            const enabled = this.plugin.settings.typoraMode;
            this.plugin.settings.typora = cloneTyporaStyle(DEFAULT_TYPORA_STYLE);
            this.plugin.settings.typoraMode = enabled;
            yield this.persist();
            this.onRerender();
        })));
    }
    renderPreview(containerEl) {
        const preview = containerEl.createDiv({ cls: "format-hotkeys-typora-preview" });
        preview.createDiv({ cls: "format-hotkeys-typora-preview-label", text: "样式预览" });
        for (const level of HEADING_LEVELS) {
            preview.createDiv({
                cls: `format-hotkeys-typora-preview-h format-hotkeys-typora-preview-h${level}`,
                text: `${"#".repeat(level)} ${HEADING_LABELS[level]}`,
            });
        }
        preview.createDiv({
            cls: "format-hotkeys-typora-preview-quote",
            text: "引用：这是一段块引用文字的预览。",
        });
        const body = preview.createDiv({ cls: "format-hotkeys-typora-preview-body" });
        body.appendText("正文预览：");
        body.createEl("code", { text: "inline code" });
        body.appendText(" 与 ");
        body.createEl("a", { text: "链接文字", href: "#" });
        body.appendText("。");
        const table = preview.createEl("table");
        const headRow = table.createEl("thead").createEl("tr");
        for (const label of ["字段", "值", "说明"]) {
            headRow.createEl("th", { text: label });
        }
        const tbody = table.createEl("tbody");
        const rowA = tbody.createEl("tr");
        rowA.createEl("td", { text: "mod" });
        rowA.createEl("td", { text: "01" });
        rowA.createEl("td", { text: "奇数行" });
        const rowB = tbody.createEl("tr");
        rowB.createEl("td", { text: "r/m" });
        rowB.createEl("td", { text: "001" });
        rowB.createEl("td", { text: "偶数行灰底" });
    }
    addHeadingStyleSetting(containerEl, level) {
        const heading = this.plugin.settings.typora.headings[level];
        const setting = new ObsidianApi.Setting(containerEl)
            .setName(HEADING_LABELS[level])
            .setDesc(level === 1 ? "H1 默认紫色" : level === 2 ? "H2 默认青色" : `H${level} 字号与颜色`);
        setting.addSlider((slider) => slider
            .setLimits(0.8, 2.8, 0.02)
            .setValue(heading.size)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            heading.size = Number(value.toFixed(2));
            valueEl.setText(`${heading.size.toFixed(2)}em`);
            yield this.persist();
        })));
        const valueEl = setting.controlEl.createSpan({
            cls: "format-hotkeys-typora-value",
            text: `${heading.size.toFixed(2)}em`,
        });
        this.attachColorPicker(setting, {
            getValue: () => heading.color,
            setValue: (value) => {
                heading.color = value;
            },
            resolveFallback: () => headingThemeColorHex(level),
        });
    }
    addSliderSetting(containerEl, options) {
        const setting = new ObsidianApi.Setting(containerEl).setName(options.name).setDesc(options.desc);
        setting.addSlider((slider) => slider
            .setLimits(options.min, options.max, options.step)
            .setValue(options.getValue())
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            options.setValue(value);
            valueEl.setText(options.format(value));
            yield this.persist();
        })));
        const valueEl = setting.controlEl.createSpan({
            cls: "format-hotkeys-typora-value",
            text: options.format(options.getValue()),
        });
    }
    addOptionalColorSetting(containerEl, options) {
        const setting = new ObsidianApi.Setting(containerEl).setName(options.name).setDesc(options.desc);
        this.attachColorPicker(setting, {
            getValue: options.getValue,
            setValue: options.setValue,
            resolveFallback: () => {
                const isDark = document.body.classList.contains("theme-dark");
                if (options.preferDarkFallback && !isDark && options.fallbackHex) {
                    return options.fallbackHex;
                }
                if (!options.preferDarkFallback && isDark && options.fallbackHex && options.fallbackVar === "--background-primary") {
                    // 浅色项在深色主题下也尽量给出合理示意色
                    return options.fallbackHex;
                }
                return themeColorHex(options.fallbackVar);
            },
        });
    }
    attachColorPicker(setting, options) {
        let picker;
        let ignoreChange = false;
        setting.addColorPicker((component) => {
            picker = component;
            ignoreChange = true;
            component.setValue(options.getValue() || options.resolveFallback());
            window.setTimeout(() => {
                ignoreChange = false;
            }, 0);
            component.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                if (ignoreChange) {
                    return;
                }
                options.setValue(value);
                yield this.persist();
            }));
        });
        setting.addExtraButton((btn) => btn
            .setIcon("reset")
            .setTooltip("恢复 Obsidian 默认色")
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            ignoreChange = true;
            options.setValue("");
            picker.setValue(options.resolveFallback());
            ignoreChange = false;
            yield this.persist();
        })));
    }
    persist() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.applyTyporaMode();
            yield this.plugin.saveTyporaSettings();
        });
    }
}

const DEFAULT_SETTINGS = {
    defaultCodeLanguage: "",
    codeLanguages: ["java", "python", "javascript", "typescript", "bash", ""],
    toolbarButtonOrder: [
        "typora-mode",
        "typora-config",
        "bold",
        "flatten-to-bold",
        "remove-red",
        "red-underline",
        "red-wavy",
        "callout",
        "remove-callout",
        "table-to-md",
        "remove-blank-lines",
        "dunhao",
        "code-language",
        "block-math-to-inline",
        "block-math-to-inline-join",
        "normalize-punctuation",
    ],
    typoraMode: false,
    typora: cloneTyporaStyle(DEFAULT_TYPORA_STYLE),
    restoreEditorPosition: true,
    tableWidthStable: true,
};
const TOOLBAR_BUTTON_LABELS = {
    "remove-blank-lines": "去除空格行",
    dunhao: "、",
    "code-language": "代码语言",
    "block-math-to-inline": "公式转行内",
    "block-math-to-inline-join": "公式转行内换行",
    "normalize-punctuation": "符号格式化",
    "typora-mode": "Typora 模式",
    "typora-config": "Typora配置",
    bold: "加粗",
    "flatten-to-bold": "变化改加粗",
    "remove-red": "取消变红",
    "red-underline": "红+下划线",
    "red-wavy": "红+波浪线",
    callout: "Tips",
    "remove-callout": "取消提示",
    "table-to-md": "表格转MD",
};
function formatLanguageLabel(language) {
    return language.trim() === "" ? "无" : language;
}
class FormatHotkeysSettingTab extends ObsidianApi.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Format Hotkeys 设置" });
        containerEl.createEl("h3", { text: "Typora 模式" });
        new TyporaSettingsPanel(this.plugin, containerEl, () => this.display()).render();
        new ObsidianApi.Setting(containerEl)
            .setName("恢复上次编辑位置")
            .setDesc("切换文件或关闭重开后，恢复到上次的光标、滚动与选区位置（按文件记忆）")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.restoreEditorPosition).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.restoreEditorPosition = value;
            yield this.plugin.saveSettings();
        })));
        new ObsidianApi.Setting(containerEl)
            .setName("表格编辑宽度稳定")
            .setDesc("统一编辑态与预览态的表格宽度，避免点击表格编辑时列宽跳动")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.tableWidthStable).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.tableWidthStable = value;
            yield this.plugin.saveSettings();
            this.plugin.applyTableStable();
        })));
        new ObsidianApi.Setting(containerEl)
            .setName("默认代码语言")
            .setDesc("Ctrl+Alt+D 创建代码块时使用的语言标识")
            .addText((text) => text
            .setPlaceholder("例如 java")
            .setValue(this.plugin.settings.defaultCodeLanguage)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.defaultCodeLanguage = value.trim();
            yield this.plugin.saveSettings();
        })));
        containerEl.createEl("h3", { text: "代码语言列表" });
        containerEl.createEl("p", {
            text: "工具栏「代码语言」按钮中显示的可选语言。留空表示无语言标识。",
            cls: "setting-item-description",
        });
        this.plugin.settings.codeLanguages.forEach((lang, index) => {
            new ObsidianApi.Setting(containerEl)
                .setName(formatLanguageLabel(lang))
                .addText((text) => text.setValue(lang).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.codeLanguages[index] = value.trim();
                if (this.plugin.settings.defaultCodeLanguage === lang) {
                    this.plugin.settings.defaultCodeLanguage = value.trim();
                }
                yield this.plugin.saveSettings();
                this.display();
            })))
                .addExtraButton((btn) => btn
                .setIcon("trash")
                .setTooltip("删除")
                .onClick(() => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const removed = this.plugin.settings.codeLanguages[index];
                this.plugin.settings.codeLanguages.splice(index, 1);
                if (this.plugin.settings.defaultCodeLanguage === removed) {
                    this.plugin.settings.defaultCodeLanguage =
                        (_a = this.plugin.settings.codeLanguages[0]) !== null && _a !== void 0 ? _a : "";
                }
                yield this.plugin.saveSettings();
                this.display();
            })));
        });
        new ObsidianApi.Setting(containerEl).addButton((btn) => btn
            .setButtonText("添加语言")
            .setCta()
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.codeLanguages.push("");
            yield this.plugin.saveSettings();
            this.display();
        })));
    }
}

class LanguageInputModal extends ObsidianApi.Modal {
    constructor(app) {
        super(app);
        this.settled = false;
        this.resolve = () => undefined;
    }
    openAndGetValue() {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }
    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText("添加代码语言");
        contentEl.createEl("p", { text: "例如：java、python、typescript" });
        const input = contentEl.createEl("input", {
            type: "text",
            cls: "format-hotkeys-lang-input",
        });
        input.placeholder = "java";
        input.focus();
        const row = contentEl.createDiv({ cls: "format-hotkeys-lang-actions" });
        row.createEl("button", { text: "确定", cls: "mod-cta" }).addEventListener("click", () => {
            this.closeWith(input.value.trim());
        });
        row.createEl("button", { text: "取消" }).addEventListener("click", () => {
            this.closeWith(null);
        });
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                this.closeWith(input.value.trim());
            }
            if (ev.key === "Escape") {
                this.closeWith(null);
            }
        });
    }
    closeWith(value) {
        if (this.settled)
            return;
        this.settled = true;
        this.resolve(value);
        this.close();
    }
    onClose() {
        if (!this.settled) {
            this.settled = true;
            this.resolve(null);
        }
        this.contentEl.empty();
    }
}

class ToolbarOrderModal extends ObsidianApi.Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        this.order = [...plugin.settings.toolbarButtonOrder];
    }
    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText("编辑按钮顺序");
        contentEl.createEl("p", {
            text: "调整工具栏按钮的显示顺序（「…」按钮始终在最右侧）",
            cls: "format-hotkeys-order-desc",
        });
        const listEl = contentEl.createDiv({ cls: "format-hotkeys-order-list" });
        this.renderList(listEl);
        new ObsidianApi.Setting(contentEl).addButton((btn) => btn.setButtonText("完成").setCta().onClick(() => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.toolbarButtonOrder = [...this.order];
            yield this.plugin.saveSettings();
            this.close();
        })));
    }
    renderList(container) {
        container.empty();
        this.order.forEach((id, index) => {
            const row = container.createDiv({ cls: "format-hotkeys-order-row" });
            row.createSpan({ text: TOOLBAR_BUTTON_LABELS[id], cls: "format-hotkeys-order-label" });
            const controls = row.createDiv({ cls: "format-hotkeys-order-controls" });
            const upBtn = controls.createEl("button", { text: "↑", cls: "format-hotkeys-order-btn" });
            upBtn.disabled = index === 0;
            upBtn.addEventListener("click", () => {
                if (index === 0)
                    return;
                [this.order[index - 1], this.order[index]] = [this.order[index], this.order[index - 1]];
                this.renderList(container);
            });
            const downBtn = controls.createEl("button", { text: "↓", cls: "format-hotkeys-order-btn" });
            downBtn.disabled = index === this.order.length - 1;
            downBtn.addEventListener("click", () => {
                if (index === this.order.length - 1)
                    return;
                [this.order[index], this.order[index + 1]] = [this.order[index + 1], this.order[index]];
                this.renderList(container);
            });
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}

class TyporaConfigModal extends ObsidianApi.Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }
    onOpen() {
        this.modalEl.addClass("format-hotkeys-typora-config-modal");
        this.titleEl.setText("Typora 配置");
        this.renderBody();
    }
    onClose() {
        this.contentEl.empty();
        this.modalEl.removeClass("format-hotkeys-typora-config-modal");
    }
    renderBody() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("format-hotkeys-typora-modal");
        new TyporaSettingsPanel(this.plugin, contentEl, () => this.renderBody()).render();
    }
}

const TOOLBAR_CLASS = "format-hotkeys-toolbar";
class EditorToolbarManager {
    constructor(plugin) {
        this.plugin = plugin;
        this.toolbarEl = null;
        this.attachedView = null;
    }
    attach() {
        this.plugin.app.workspace.onLayoutReady(() => this.syncToolbar());
        this.plugin.registerEvent(this.plugin.app.workspace.on("active-leaf-change", () => this.syncToolbar()));
        this.plugin.registerEvent(this.plugin.app.workspace.on("layout-change", () => this.syncToolbar()));
    }
    refresh() {
        const view = this.plugin.app.workspace.getActiveViewOfType(ObsidianApi.MarkdownView);
        this.detach();
        if (view && view.getMode() === "source") {
            this.attachToView(view);
        }
    }
    syncToolbar() {
        var _a;
        const view = this.plugin.app.workspace.getActiveViewOfType(ObsidianApi.MarkdownView);
        if (view === this.attachedView && ((_a = this.toolbarEl) === null || _a === void 0 ? void 0 : _a.isConnected)) {
            return;
        }
        this.detach();
        if (!view || view.getMode() !== "source") {
            return;
        }
        this.attachToView(view);
    }
    attachToView(view) {
        const container = view.containerEl.querySelector(".markdown-source-view");
        if (!container) {
            return;
        }
        this.attachedView = view;
        this.toolbarEl = container.createDiv({ cls: TOOLBAR_CLASS });
        for (const buttonId of this.plugin.settings.toolbarButtonOrder) {
            this.renderButton(view, buttonId);
        }
        this.renderMoreButton(view);
    }
    renderButton(view, buttonId) {
        switch (buttonId) {
            case "typora-mode":
                this.addTyporaModeButton(view);
                break;
            case "typora-config":
                this.addTyporaConfigButton();
                break;
            case "bold":
                this.addActionButton(view, "加粗", (editor) => toggleBold(editor));
                break;
            case "flatten-to-bold":
                this.addActionButton(view, "变化改加粗", (editor) => flattenSelectionToBold(editor));
                break;
            case "remove-red":
                this.addActionButton(view, "取消变红", (editor) => removeRedInSelection(editor));
                break;
            case "red-underline":
                this.addActionButton(view, "红+下划线", (editor) => toggleRedUnderline(editor));
                break;
            case "red-wavy":
                this.addActionButton(view, "红+波浪线", (editor) => toggleRedWavy(editor));
                break;
            case "remove-blank-lines":
                this.addActionButton(view, "去除空格行", (editor) => removeBlankLinesInSelection(editor));
                break;
            case "dunhao":
                this.addActionButton(view, "、", (editor) => insertTextAtCursor(editor, "、"));
                break;
            case "code-language":
                this.addLanguageButton(view);
                break;
            case "block-math-to-inline":
                this.addActionButton(view, "公式转行内", (editor) => convertBlockMathToInline(editor));
                break;
            case "block-math-to-inline-join":
                this.addActionButton(view, "公式转行内换行", (editor) => convertBlockMathToInlineAndJoin(editor));
                break;
            case "normalize-punctuation":
                this.addActionButton(view, "符号格式化", (editor) => normalizePunctuation(editor));
                break;
            case "callout":
                this.addCalloutButton(view);
                break;
            case "remove-callout":
                this.addActionButton(view, "取消提示", (editor) => removeCallout(editor));
                break;
            case "table-to-md":
                this.addActionButton(view, "表格转MD", (editor) => convertHtmlTableToMarkdown(editor));
                break;
        }
    }
    addTyporaModeButton(_view) {
        if (!this.toolbarEl)
            return;
        const isActive = this.plugin.settings.typoraMode;
        const btn = this.toolbarEl.createEl("button", {
            cls: `format-hotkeys-toolbar-btn format-hotkeys-typora-btn${isActive ? " typora-mode-active" : ""}`,
            text: isActive ? "✓ Typora" : "Typora",
        });
        btn.setAttr("aria-label", isActive ? "关闭 Typora 模式" : "启用 Typora 模式");
        this.plugin.registerDomEvent(btn, "mousedown", (e) => e.preventDefault());
        this.plugin.registerDomEvent(btn, "click", (e) => __awaiter(this, void 0, void 0, function* () {
            e.preventDefault();
            this.plugin.settings.typoraMode = !this.plugin.settings.typoraMode;
            yield this.plugin.saveSettings();
            this.plugin.applyTyporaMode();
            // 更新按钮状态
            const nowActive = this.plugin.settings.typoraMode;
            btn.textContent = nowActive ? "✓ Typora" : "Typora";
            btn.setAttr("aria-label", nowActive ? "关闭 Typora 模式" : "启用 Typora 模式");
            if (nowActive) {
                btn.addClass("typora-mode-active");
            }
            else {
                btn.removeClass("typora-mode-active");
            }
        }));
    }
    addTyporaConfigButton() {
        if (!this.toolbarEl)
            return;
        const btn = this.toolbarEl.createEl("button", {
            cls: "format-hotkeys-toolbar-btn format-hotkeys-typora-config-btn",
            text: "Typora配置",
        });
        btn.setAttr("aria-label", "打开 Typora 配置");
        this.plugin.registerDomEvent(btn, "mousedown", (e) => e.preventDefault());
        this.plugin.registerDomEvent(btn, "click", (e) => {
            e.preventDefault();
            new TyporaConfigModal(this.plugin.app, this.plugin).open();
        });
    }
    addCalloutButton(view) {
        if (!this.toolbarEl)
            return;
        const btn = this.toolbarEl.createEl("button", {
            cls: "format-hotkeys-toolbar-btn format-hotkeys-callout-btn",
            text: "提示",
        });
        btn.setAttr("aria-label", "添加提示 Callout（点击选类型，默认 tip）");
        this.plugin.registerDomEvent(btn, "mousedown", (e) => e.preventDefault());
        this.plugin.registerDomEvent(btn, "click", (e) => {
            e.preventDefault();
            this.showCalloutMenu(btn, view);
        });
    }
    showCalloutMenu(anchor, view) {
        const menu = new ObsidianApi.Menu();
        for (const option of CALLOUT_OPTIONS) {
            menu.addItem((item) => {
                item.setTitle(option.label);
                item.onClick(() => wrapCallout(view.editor, option.type));
            });
        }
        menu.showAtPosition({
            x: anchor.getBoundingClientRect().left,
            y: anchor.getBoundingClientRect().top - 4,
        });
    }
    addActionButton(view, label, action) {
        if (!this.toolbarEl)
            return;
        const btn = this.toolbarEl.createEl("button", {
            cls: "format-hotkeys-toolbar-btn",
            text: label,
        });
        this.plugin.registerDomEvent(btn, "mousedown", (e) => e.preventDefault());
        this.plugin.registerDomEvent(btn, "click", (e) => {
            e.preventDefault();
            action(view.editor);
        });
    }
    addLanguageButton(view) {
        if (!this.toolbarEl)
            return;
        const lang = this.plugin.settings.defaultCodeLanguage;
        const btn = this.toolbarEl.createEl("button", {
            cls: "format-hotkeys-toolbar-btn format-hotkeys-lang-btn",
            text: formatLanguageLabel(lang),
        });
        btn.setAttr("aria-label", "设置代码块默认语言");
        this.plugin.registerDomEvent(btn, "mousedown", (e) => e.preventDefault());
        this.plugin.registerDomEvent(btn, "click", (e) => {
            e.preventDefault();
            this.showLanguageMenu(btn);
        });
    }
    showLanguageMenu(anchor) {
        const menu = new ObsidianApi.Menu();
        for (const lang of this.plugin.settings.codeLanguages) {
            const label = formatLanguageLabel(lang);
            const isActive = lang === this.plugin.settings.defaultCodeLanguage;
            menu.addItem((item) => {
                item.setTitle(isActive ? `✓ ${label}` : label);
                item.onClick(() => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.defaultCodeLanguage = lang;
                    yield this.plugin.saveSettings();
                }));
            });
        }
        menu.addSeparator();
        menu.addItem((item) => {
            item.setTitle("添加语言…");
            item.onClick(() => __awaiter(this, void 0, void 0, function* () {
                const value = yield new LanguageInputModal(this.plugin.app).openAndGetValue();
                if (value === null)
                    return;
                if (!this.plugin.settings.codeLanguages.includes(value)) {
                    this.plugin.settings.codeLanguages.push(value);
                }
                this.plugin.settings.defaultCodeLanguage = value;
                yield this.plugin.saveSettings();
            }));
        });
        menu.showAtPosition({
            x: anchor.getBoundingClientRect().left,
            y: anchor.getBoundingClientRect().top - 4,
        });
    }
    renderMoreButton(_view) {
        if (!this.toolbarEl)
            return;
        const btn = this.toolbarEl.createEl("button", {
            cls: "format-hotkeys-toolbar-btn format-hotkeys-more-btn",
            text: "…",
        });
        btn.setAttr("aria-label", "编辑按钮顺序");
        this.plugin.registerDomEvent(btn, "mousedown", (e) => e.preventDefault());
        this.plugin.registerDomEvent(btn, "click", (e) => {
            e.preventDefault();
            new ToolbarOrderModal(this.plugin.app, this.plugin).open();
        });
    }
    detach() {
        var _a;
        (_a = this.toolbarEl) === null || _a === void 0 ? void 0 : _a.remove();
        this.toolbarEl = null;
        this.attachedView = null;
    }
}

/** 读取当前源码视图的光标与滚动位置（参考 remember-cursor-position 插件的成熟读取方式） */
function readViewState(view) {
    var _a;
    const state = {};
    // 滚动：从编辑器模式读取，Obsidian 官方状态保存也用它
    const mode = view.currentMode;
    const scroll = (_a = mode === null || mode === void 0 ? void 0 : mode.getScroll) === null || _a === void 0 ? void 0 : _a.call(mode);
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
function applyViewState(view, state) {
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
function statesEqual(a, b) {
    if (Boolean(a.cursor) !== Boolean(b.cursor))
        return false;
    if (a.cursor) {
        const ca = a.cursor;
        const cb = b.cursor;
        if (ca.from.line !== cb.from.line || ca.from.ch !== cb.from.ch)
            return false;
        if (ca.to.line !== cb.to.line || ca.to.ch !== cb.to.ch)
            return false;
    }
    if (Boolean(a.scroll) !== Boolean(b.scroll))
        return false;
    if (a.scroll !== undefined && a.scroll !== b.scroll)
        return false;
    return true;
}

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
function applyTableStableStyle(enabled) {
    let tag = document.getElementById(TABLE_STABLE_STYLE_ID);
    if (!enabled) {
        tag === null || tag === void 0 ? void 0 : tag.remove();
        return;
    }
    if (!tag) {
        tag = document.createElement("style");
        tag.id = TABLE_STABLE_STYLE_ID;
        document.head.appendChild(tag);
    }
    tag.textContent = TABLE_STABLE_CSS;
}

/** 行首 `(1)` / `（1）` 括号编号，课本常用写法 */
const PAREN_ITEM_RE = /^(\s*)(?:\((\d+)\)|（(\d+)）)/;
const HEADING_RE = /^#{1,6}\s/;
const FENCE_RE = /^(\s*)```/;
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const refreshParenListEffect = state.StateEffect.define();
const itemLineDeco = view.Decoration.line({ class: "typora-paren-list-item" });
const bodyLineDeco = view.Decoration.line({ class: "typora-paren-list-body" });
const markerDeco = view.Decoration.mark({ class: "typora-paren-list-marker" });
function isTyporaModeOn$2() {
    return document.body.classList.contains("typora-mode-active");
}
function buildDecorations$2(view$1) {
    const builder = new state.RangeSetBuilder();
    if (!isTyporaModeOn$2()) {
        return view.Decoration.none;
    }
    const doc = view$1.state.doc;
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
const parenListPlugin = view.ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = buildDecorations$2(view);
    }
    update(update) {
        const forced = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshParenListEffect)));
        if (update.docChanged || update.viewportChanged || forced) {
            this.decorations = buildDecorations$2(update.view);
        }
    }
}, {
    decorations: (v) => v.decorations,
});
function createParenListExtension() {
    return parenListPlugin;
}
/** Typora 开关后刷新所有源码编辑器中的括号列表装饰 */
function refreshParenListDecorations(app) {
    app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!(view instanceof ObsidianApi.MarkdownView) || view.getMode() !== "source") {
            return;
        }
        const cm = view.editor.cm;
        if (cm) {
            cm.dispatch({ effects: refreshParenListEffect.of(null) });
        }
    });
}

const ASM_LANGS = new Set(["arm", "armasm", "asm", "gas", "nasm", "objdump", "x86asm"]);
const INSTRUCTIONS = new Set([
    "push", "pop", "mov", "movb", "movw", "movl", "movq", "movzbl", "movzwl", "movsbl", "movswl",
    "lea", "leal", "leaq",
    "add", "addl", "addq", "adc", "sub", "subl", "subq", "sbb", "inc", "dec", "neg", "not",
    "mul", "imul", "div", "idiv",
    "and", "or", "xor", "shl", "shr", "sal", "sar", "rol", "ror",
    "cmp", "test", "nop",
    "jmp", "je", "jne", "jz", "jnz", "ja", "jae", "jb", "jbe", "jl", "jle", "jg", "jge", "js", "jns", "call", "ret", "leave",
    "pushl", "popl", "int", "syscall",
    "ldr", "ldrb", "ldrh", "ldp", "str", "strb", "strh", "stp",
    "b", "bl", "bx", "blx", "beq", "bne", "blt", "bgt", "ble", "bge",
    "svc", "mrs", "msr", "cbz", "cbnz",
]);
const REGISTERS = new Set([
    "eax", "ebx", "ecx", "edx", "esi", "edi", "ebp", "esp", "eip",
    "rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp", "rip",
    "ax", "bx", "cx", "dx", "si", "di", "bp", "sp", "ip",
    "al", "ah", "bl", "bh", "cl", "ch", "dl", "dh",
    "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15",
    "cs", "ds", "es", "fs", "gs", "ss",
    "sp", "lr", "pc", "ip", "fp", "sl",
]);
for (let i = 0; i <= 31; i++) {
    REGISTERS.add(`r${i}`);
    REGISTERS.add(`w${i}`);
    REGISTERS.add(`x${i}`);
}
const decoCache = new Map();
function tokenMark(type) {
    let deco = decoCache.get(type);
    if (!deco) {
        deco = view.Decoration.mark({ class: `cm-${type}` });
        decoCache.set(type, deco);
    }
    return deco;
}
function isAsmLang(info) {
    var _a;
    const lang = (_a = info.trim().toLowerCase().split(/[\s:{]/)[0]) !== null && _a !== void 0 ? _a : "";
    return ASM_LANGS.has(lang);
}
function fenceLang$1(text) {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("```")) {
        return null;
    }
    return trimmed.slice(3).trim();
}
function tokenizeLine(from, text, builder) {
    let i = 0;
    const n = text.length;
    const add = (start, end, type) => {
        if (end > start) {
            builder.add(from + start, from + end, tokenMark(type));
        }
    };
    while (i < n) {
        const ch = text[i];
        if (ch === " " || ch === "\t") {
            i++;
            continue;
        }
        if (ch === ";" || (ch === "#" && (i === 0 || text[i - 1] === " " || text[i - 1] === "\t"))) {
            add(i, n, "comment");
            return;
        }
        if (ch === "<") {
            const close = text.indexOf(">", i + 1);
            if (close > i) {
                add(i, close + 1, "def");
                i = close + 1;
                continue;
            }
        }
        const rest = text.slice(i);
        const addr = rest.match(/^[0-9a-fA-F]+:/);
        if (addr) {
            add(i, i + addr[0].length, "number");
            i += addr[0].length;
            continue;
        }
        const ident = rest.match(/^%?[A-Za-z_.][\w.]*/);
        if (ident) {
            const raw = ident[0];
            const core = raw.startsWith("%") ? raw.slice(1).toLowerCase() : raw.toLowerCase();
            if (raw.startsWith("%") || REGISTERS.has(core)) {
                add(i, i + raw.length, "variable-2");
            }
            else if (INSTRUCTIONS.has(core)) {
                add(i, i + raw.length, "keyword");
            }
            else if (/^[0-9a-fA-F]+$/.test(raw)) {
                add(i, i + raw.length, "number");
            }
            else {
                add(i, i + raw.length, "variable");
            }
            i += raw.length;
            continue;
        }
        const num = rest.match(/^\$?(?:0x[0-9a-fA-F]+|\d+)\b/);
        if (num) {
            add(i, i + num[0].length, num[0].startsWith("$") ? "atom" : "number");
            i += num[0].length;
            continue;
        }
        if ("[],()*:+-".includes(ch)) {
            add(i, i + 1, "operator");
            i++;
            continue;
        }
        i++;
    }
}
function buildDecorations$1(view) {
    const builder = new state.RangeSetBuilder();
    const doc = view.state.doc;
    let lang = null;
    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const info = fenceLang$1(line.text);
        if (info !== null) {
            if (lang === null) {
                lang = info;
            }
            else {
                lang = null;
            }
            continue;
        }
        if (lang !== null && isAsmLang(lang)) {
            tokenizeLine(line.from, line.text, builder);
        }
    }
    return builder.finish();
}
const refreshAsmHighlightEffect = state.StateEffect.define();
const asmHighlightPlugin = view.ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = buildDecorations$1(view);
    }
    update(update) {
        const forced = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshAsmHighlightEffect)));
        if (update.docChanged || update.viewportChanged || forced) {
            this.decorations = buildDecorations$1(update.view);
        }
    }
}, {
    decorations: (v) => v.decorations,
});
function createAsmHighlightExtension() {
    return asmHighlightPlugin;
}
function refreshAsmHighlight(app) {
    app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!(view instanceof ObsidianApi.MarkdownView) || view.getMode() !== "source") {
            return;
        }
        const cm = view.editor.cm;
        if (cm) {
            cm.dispatch({ effects: refreshAsmHighlightEffect.of(null) });
        }
    });
}
/** 阅读视图：给 Prism 补上 arm/asm 语法 */
function registerAsmPrismLanguages(prism) {
    const grammar = {
        comment: /;[^\n]*/,
        label: {
            pattern: /<[^>]+>/,
            alias: "function",
        },
        address: {
            pattern: /\b[0-9a-fA-F]+:/,
            alias: "number",
        },
        register: {
            pattern: /%(?:[er]?[abcd]x|[er]?[sd]i|[er]?[sb]p|eip|rip|r(?:1[0-5]|\d)|[abcd][lh])\b|\b(?:r|w|x)(?:[12]?\d|3[01])\b|\b(?:sp|lr|pc)\b/i,
            alias: "variable",
        },
        keyword: new RegExp(`\\b(?:${[...INSTRUCTIONS].join("|")})\\b`, "i"),
        number: /\$?(?:0x[0-9a-fA-F]+|\b\d+\b|\b[0-9a-fA-F]{2}\b)/,
        operator: /[[\](),*:+-]/,
    };
    for (const lang of ASM_LANGS) {
        if (!prism.languages[lang]) {
            prism.languages[lang] = grammar;
        }
    }
}

const refreshHtmlStyleEffect = state.StateEffect.define();
const FONT_RE = /<font\b([^>]*)>([\s\S]*?)<\/font>/gi;
const SPAN_RE = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
const hideTagDeco = view.Decoration.mark({ class: "typora-html-tag" });
function isTyporaModeOn$1() {
    return document.body.classList.contains("typora-mode-active");
}
function hideSyntaxOn() {
    return document.body.classList.contains("typora-hide-syntax");
}
function colorFromAttrs(attrs) {
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
function hasBoldWeight(attrs) {
    return /font-weight\s*:\s*(bold|[6-9]00)/i.test(attrs);
}
function displayColor(cssColor) {
    return isRedColorValue(cssColor) ? "var(--typora-red)" : cssColor;
}
function innerStyle(attrs) {
    const color = colorFromAttrs(attrs);
    const redUnderline = htmlAttrsHaveClass(attrs, RED_UNDERLINE_CLASS);
    const redWavy = htmlAttrsHaveClass(attrs, RED_WAVY_CLASS) || htmlAttrsHaveClass(attrs, "wavy-underline");
    const parts = [];
    if (color) {
        parts.push(`color: ${displayColor(color)}`);
    }
    else if (redUnderline || redWavy) {
        parts.push("color: var(--typora-red)");
    }
    if (hasBoldWeight(attrs)) {
        parts.push("font-weight: 700");
    }
    if (redWavy) {
        parts.push("text-decoration-line: underline", "text-decoration-style: wavy", "text-decoration-color: var(--typora-red)", "text-underline-offset: 0.12em");
    }
    else if (redUnderline || /text-decoration(?:-line)?\s*:\s*underline/i.test(attrs)) {
        parts.push("text-decoration: underline", "text-underline-offset: 0.12em");
    }
    return parts.join("; ");
}
function collectHits(text, lineFrom) {
    const hits = [];
    const pushAll = (pattern) => {
        var _a, _b;
        const re = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = re.exec(text))) {
            const full = match[0];
            const attrs = (_a = match[1]) !== null && _a !== void 0 ? _a : "";
            const inner = (_b = match[2]) !== null && _b !== void 0 ? _b : "";
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
function closingLength(full) {
    const close = full.match(/<\/(?:font|span)>$/i);
    return close ? close[0].length : 0;
}
/** 光标/选区是否落在标签字符上（不含内部文字），落在标签上才露出源码便于改色值 */
function selectionTouches(view, from, to) {
    for (const range of view.state.selection.ranges) {
        if (range.from === range.to) {
            if (range.from > from && range.from < to) {
                return true;
            }
        }
        else if (range.from < to && range.to > from) {
            return true;
        }
    }
    return false;
}
function fenceLang(text) {
    return text.trimStart().startsWith("```");
}
function buildDecorations(view$1) {
    const builder = new state.RangeSetBuilder();
    if (!isTyporaModeOn$1()) {
        return view.Decoration.none;
    }
    const hideTags = hideSyntaxOn();
    const doc = view$1.state.doc;
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
        let lastTo = -1;
        for (const hit of hits) {
            if (hit.from < lastTo) {
                continue;
            }
            lastTo = hit.to;
            // 光标在红字内部时也隐藏 <font>/<span> 标签，Ctrl+R 后不必再点别处
            if (hideTags && hit.innerFrom > hit.from && !selectionTouches(view$1, hit.from, hit.innerFrom)) {
                builder.add(hit.from, hit.innerFrom, hideTagDeco);
            }
            if (hit.innerTo > hit.innerFrom) {
                builder.add(hit.innerFrom, hit.innerTo, view.Decoration.mark({
                    class: "typora-html-colored",
                    attributes: { style: hit.style },
                }));
            }
            if (hideTags && hit.to > hit.innerTo && !selectionTouches(view$1, hit.innerTo, hit.to)) {
                builder.add(hit.innerTo, hit.to, hideTagDeco);
            }
        }
    }
    return builder.finish();
}
const htmlStylePlugin = view.ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = buildDecorations(view);
    }
    update(update) {
        const forced = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshHtmlStyleEffect)));
        if (update.docChanged || update.selectionSet || update.viewportChanged || forced) {
            this.decorations = buildDecorations(update.view);
        }
    }
}, {
    decorations: (v) => v.decorations,
});
function createHtmlStyleExtension() {
    return htmlStylePlugin;
}
function refreshHtmlStyleDecorations(app) {
    app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!(view instanceof ObsidianApi.MarkdownView) || view.getMode() !== "source") {
            return;
        }
        const cm = view.editor.cm;
        if (cm) {
            cm.dispatch({ effects: refreshHtmlStyleEffect.of(null) });
        }
    });
}

const TABLE_ROW_STRIPE_CLASS = "format-hotkeys-table-row-stripe";
const IFRAME_STYLE_ID = "format-hotkeys-table-stripe-css";
const IFRAME_TABLE_CSS = `
table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
}
th, td {
    border: 1px solid var(--typora-table-border, #dfe2e5);
    padding: 6px 13px;
    font-weight: 400;
    vertical-align: middle;
    background-color: var(--typora-table-base, var(--background-primary, #fff)) !important;
}
tr.${TABLE_ROW_STRIPE_CLASS} > :is(th, td) {
    background-color: var(--typora-table-stripe, #f8f8f8) !important;
}
`;
function isTyporaModeOn() {
    return document.body.classList.contains("typora-mode-active");
}
function readCssVar(name, fallback) {
    const value = getComputedStyle(document.body).getPropertyValue(name).trim();
    return value || fallback;
}
/**
 * Typora / GitHub 斑马规则：
 * - 表头有浅底
 * - 第一行数据无底
 * - 第二行数据有浅底，之后交替
 *
 * Obsidian 管道表通常是 thead+tbody；部分 HTML 表则是全部 tr 平铺。
 */
function stripeRows(table) {
    table.querySelectorAll(`tr.${TABLE_ROW_STRIPE_CLASS}`).forEach((row) => {
        row.classList.remove(TABLE_ROW_STRIPE_CLASS);
    });
    if (!isTyporaModeOn()) {
        return;
    }
    const headRows = table.tHead ? Array.from(table.tHead.rows) : [];
    if (headRows.length > 0) {
        for (const row of headRows) {
            row.classList.add(TABLE_ROW_STRIPE_CLASS);
        }
        const bodyRows = [];
        for (const tbody of Array.from(table.tBodies)) {
            bodyRows.push(...Array.from(tbody.rows));
        }
        bodyRows.forEach((row, index) => {
            // 第 2、4、6… 行数据（1-based even）
            if ((index + 1) % 2 === 0) {
                row.classList.add(TABLE_ROW_STRIPE_CLASS);
            }
        });
        return;
    }
    // 无 thead：第 1、3、5… 行（含表头）上色，等价于「表头 + 偶数数据行」
    Array.from(table.rows).forEach((row, index) => {
        if (index % 2 === 0) {
            row.classList.add(TABLE_ROW_STRIPE_CLASS);
        }
    });
}
function ensureIframeStyles(doc) {
    if (doc.getElementById(IFRAME_STYLE_ID)) {
        return;
    }
    const root = doc.documentElement;
    root.style.setProperty("--typora-table-border", readCssVar("--typora-table-border", "#dfe2e5"));
    root.style.setProperty("--typora-table-stripe", readCssVar("--typora-table-stripe", "#f8f8f8"));
    root.style.setProperty("--typora-table-base", readCssVar("--background-primary", "#ffffff"));
    const style = doc.createElement("style");
    style.id = IFRAME_STYLE_ID;
    style.textContent = IFRAME_TABLE_CSS;
    doc.head.appendChild(style);
}
function stripeRoot(root) {
    root.querySelectorAll("table").forEach((node) => {
        if (node instanceof HTMLTableElement) {
            stripeRows(node);
        }
    });
}
function stripeHtmlEmbedIframes(root = document) {
    root.querySelectorAll(".cm-html-embed iframe, .cm-embed-block iframe").forEach((node) => {
        if (!(node instanceof HTMLIFrameElement)) {
            return;
        }
        try {
            const doc = node.contentDocument;
            if (!doc) {
                return;
            }
            ensureIframeStyles(doc);
            stripeRoot(doc);
        }
        catch (_a) {
            // sandbox / cross-origin
        }
    });
}
function refreshTableStripes(_app, root = document) {
    stripeRoot(root);
    if (isTyporaModeOn()) {
        stripeHtmlEmbedIframes(root);
    }
}
let debounceTimer$1;
function scheduleTableStripeRefresh(app) {
    window.clearTimeout(debounceTimer$1);
    debounceTimer$1 = window.setTimeout(() => {
        refreshTableStripes();
    }, 80);
}
function attachTableStripeObserver(app, root) {
    const observer = new MutationObserver(() => scheduleTableStripeRefresh());
    observer.observe(root, { childList: true, subtree: true });
    return observer;
}

const SRC_ATTR = "data-fh-outline-src";
const MD_RE = /[*_`~$=]|\[\[|\]\(|!\[]|~~|==/;
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
/** 大纲标题里的常见行内 Markdown，渲染成 HTML。双链/链接只显示可见文字。 */
function renderOutlineMarkdown(src) {
    let text = escapeHtml(src);
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
    text = text.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_m, note, alias) => alias || note);
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/==([^=\n]+)==/g, "<mark>$1</mark>");
    text = text.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
    text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
    text = text.replace(/(^|[\s([（])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    text = text.replace(/(^|[\s([（])_([^_\n]+)_/g, "$1<em>$2</em>");
    text = text.replace(/\$([^$\n]+)\$/g, '<span class="fh-outline-math">$1</span>');
    return text;
}
function outlineInners(root = document) {
    return Array.from(root.querySelectorAll('.workspace-leaf-content[data-type="outline"] .tree-item-inner')).filter((node) => node instanceof HTMLElement);
}
function isPlainText(el) {
    var _a;
    return el.childNodes.length === 1 && ((_a = el.firstChild) === null || _a === void 0 ? void 0 : _a.nodeType) === Node.TEXT_NODE;
}
function paint(el) {
    var _a;
    if (!isPlainText(el)) {
        return;
    }
    const src = (_a = el.textContent) !== null && _a !== void 0 ? _a : "";
    if (!MD_RE.test(src)) {
        el.removeAttribute(SRC_ATTR);
        return;
    }
    if (el.getAttribute(SRC_ATTR) === src && !isPlainText(el)) {
        return;
    }
    el.setAttribute(SRC_ATTR, src);
    el.innerHTML = renderOutlineMarkdown(src);
}
function refreshOutlineMarkdown(root = document) {
    for (const el of outlineInners(root)) {
        paint(el);
    }
}
function restoreOutlineMarkdown(root = document) {
    for (const el of outlineInners(root)) {
        const src = el.getAttribute(SRC_ATTR);
        if (src !== null) {
            el.textContent = src;
            el.removeAttribute(SRC_ATTR);
        }
    }
}
let debounceTimer;
function scheduleOutlineMarkdownRefresh() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => refreshOutlineMarkdown(), 40);
}
function attachOutlineMarkdownObserver(_app, root) {
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
            if (!(target === null || target === void 0 ? void 0 : target.closest('.workspace-leaf-content[data-type="outline"]'))) {
                continue;
            }
            scheduleOutlineMarkdownRefresh();
            return;
        }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return observer;
}

const RED_OPEN = '<font color="#ff0000">';
const RED_CLOSE = "</font>";
/**
 * 编辑进度保存/恢复（参考 MIT 协议插件 dy-sh/obsidian-remember-cursor-position 的成熟实现）：
 * - 保存：每 100ms 轮询当前文件的光标/滚动，变化即写入内存 db（任何时刻都最新）；
 * - 落盘：每 5s 周期写独立 json 文件，Obsidian 退出（quit 事件）与插件卸载时再强制写一次；
 * - 恢复：监听 file-open 事件，延迟等编辑器就绪后套用状态；1.5s 防重 guard 避免反复跳转；
 * - 从链接跳转（存在 .is-flashing 元素）时不覆盖目标位置。
 */
const CHECK_INTERVAL_MS = 100;
const DB_FLUSH_INTERVAL_MS = 5000;
const RESTORE_DELAY_MS = 100;
const RESTORE_GUARD_WINDOW_MS = 1500;
const LAYOUT_READY_RESTORE_DELAY = 600;
class FormatHotkeysPlugin extends ObsidianApi.Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
        this.db = {};
        this.lastSavedDbJson = "";
        this.dbPath = "";
        this.lastLoadedFileName = "";
        this.lastState = {};
        this.lastRestoredKey = "";
        this.lastRestoredAt = 0;
        this.loadingFile = false;
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            for (let level = 1; level <= 5; level++) {
                this.addCommand({
                    id: `set-heading-${level}`,
                    name: `设为 ${level} 级标题`,
                    editorCallback: (editor) => toggleHeading(editor, level),
                    hotkeys: [{ modifiers: ["Mod"], key: String(level) }],
                });
            }
            this.addCommand({
                id: "toggle-underline",
                name: "切换下划线",
                editorCallback: (editor) => toggleWrap(editor, "<u>", "</u>"),
                hotkeys: [{ modifiers: ["Mod"], key: "u" }],
            });
            this.addCommand({
                id: "toggle-red",
                name: "切换红色文字",
                editorCallback: (editor) => toggleWrap(editor, RED_OPEN, RED_CLOSE),
                hotkeys: [{ modifiers: ["Mod"], key: "r" }],
            });
            this.addCommand({
                id: "toggle-bold",
                name: "切换加粗",
                editorCallback: (editor) => toggleBold(editor),
            });
            this.addCommand({
                id: "flatten-to-bold",
                name: "变化改加粗",
                editorCallback: (editor) => flattenSelectionToBold(editor),
            });
            this.addCommand({
                id: "remove-red",
                name: "取消选区变红",
                editorCallback: (editor) => removeRedInSelection(editor),
            });
            this.addCommand({
                id: "toggle-red-underline",
                name: "切换红色下划线",
                editorCallback: (editor) => toggleRedUnderline(editor),
            });
            this.addCommand({
                id: "toggle-red-wavy",
                name: "切换红色波浪线",
                editorCallback: (editor) => toggleRedWavy(editor),
            });
            this.addCommand({
                id: "toggle-code-block",
                name: "创建代码块",
                editorCallback: (editor) => toggleCodeBlock(editor, this.settings.defaultCodeLanguage),
                hotkeys: [{ modifiers: ["Mod", "Alt"], key: "d" }],
            });
            this.addCommand({
                id: "remove-blank-lines",
                name: "去除空格行",
                editorCallback: (editor) => removeBlankLinesInSelection(editor),
            });
            this.addCommand({
                id: "insert-dunhao",
                name: "插入顿号",
                editorCallback: (editor) => insertTextAtCursor(editor, "、"),
                hotkeys: [{ modifiers: ["Alt"], key: "`" }],
            });
            this.addCommand({
                id: "block-math-to-inline",
                name: "块级公式转行内公式",
                editorCallback: (editor) => convertBlockMathToInline(editor),
            });
            this.addCommand({
                id: "block-math-to-inline-join",
                name: "块级公式转行内并上移一行",
                editorCallback: (editor) => convertBlockMathToInlineAndJoin(editor),
            });
            this.addCommand({
                id: "normalize-punctuation",
                name: "中文标点转英文标点",
                editorCallback: (editor) => normalizePunctuation(editor),
            });
            this.addCommand({
                id: "wrap-callout-tip",
                name: "添加 Callout 提示块",
                editorCallback: (editor) => wrapCallout(editor, "tip"),
            });
            this.addCommand({
                id: "remove-callout",
                name: "取消选区 Callout",
                editorCallback: (editor) => removeCallout(editor),
            });
            this.addCommand({
                id: "html-table-to-md",
                name: "HTML 表格转 Markdown 表格",
                editorCallback: (editor) => convertHtmlTableToMarkdown(editor),
            });
            this.addCommand({
                id: "open-typora-config",
                name: "打开 Typora 配置",
                callback: () => new TyporaConfigModal(this.app, this).open(),
            });
            this.addSettingTab(new FormatHotkeysSettingTab(this.app, this));
            this.registerEditorExtension(createParenListExtension());
            this.registerEditorExtension(createAsmHighlightExtension());
            this.registerEditorExtension(createHtmlStyleExtension());
            void this.registerPrismAsmLanguages();
            this.toolbarManager = new EditorToolbarManager(this);
            this.toolbarManager.attach();
            // ---- 编辑进度保存/恢复（按文件记忆光标/滚动/选区，切换与关闭重开后恢复） ----
            this.dbPath = `${this.manifest.dir}/cursor-positions.json`;
            yield this.loadDb();
            this.registerEvent(this.app.workspace.on("file-open", (file) => this.restoreState(file)));
            this.registerEvent(this.app.workspace.on("quit", () => this.writeDb()));
            // 文件重命名/删除时同步迁移或清理位置记录
            this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
                if (file.path !== oldPath) {
                    this.db[file.path] = this.db[oldPath];
                    delete this.db[oldPath];
                }
            }));
            this.registerEvent(this.app.vault.on("delete", (file) => {
                delete this.db[file.path];
            }));
            // 保存：持续轮询当前文件位置；落盘：周期写 + 退出/卸载写
            this.registerInterval(window.setInterval(() => this.checkStateChanged(), CHECK_INTERVAL_MS));
            this.registerInterval(window.setInterval(() => this.writeDb(), DB_FLUSH_INTERVAL_MS));
            // 恢复：布局就绪后延迟强制恢复一次（覆盖 workspace 加载场景）
            this.app.workspace.onLayoutReady(() => {
                window.setTimeout(() => this.restoreState(), LAYOUT_READY_RESTORE_DELAY);
            });
            this.restoreState();
            this.applyTyporaMode();
            this.applyTableStable();
            this.setupTableStripeRefresh();
            this.setupOutlineMarkdown();
        });
    }
    onunload() {
        var _a, _b;
        this.writeDb();
        applyTableStableStyle(false);
        const bodyEl = document.body;
        bodyEl.removeClass("typora-mode-active");
        bodyEl.removeClass("typora-hide-syntax");
        clearTyporaStyleVars(bodyEl);
        (_a = this.tableStripeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        refreshTableStripes(this.app);
        (_b = this.outlineMarkdownObserver) === null || _b === void 0 ? void 0 : _b.disconnect();
        restoreOutlineMarkdown();
    }
    /**
     * 应用 Typora 显示模式：写入自定义 CSS 变量，并切换 body 标记类
     */
    applyTyporaMode() {
        const bodyEl = document.body;
        applyTyporaStyleVars(bodyEl, this.settings.typora);
        bodyEl.toggleClass("typora-mode-active", this.settings.typoraMode);
        bodyEl.toggleClass("typora-hide-syntax", this.settings.typoraMode && this.settings.typora.hideSyntax);
        refreshParenListDecorations(this.app);
        refreshAsmHighlight(this.app);
        refreshHtmlStyleDecorations(this.app);
        scheduleTableStripeRefresh(this.app);
    }
    /** 应用/移除表格编辑宽度稳定样式（设置开关切换时也调用） */
    applyTableStable() {
        applyTableStableStyle(this.settings.tableWidthStable);
    }
    /** 轮询：当前文件位置发生变化时写入内存 db */
    checkStateChanged() {
        var _a;
        if (!this.settings.restoreEditorPosition)
            return;
        // 悬停预览窗口（Page preview / Hover Editor）是瞬态视图，绝不记录位置
        if (this.isHoverPopoverActive())
            return;
        const fileName = (_a = this.app.workspace.getActiveFile()) === null || _a === void 0 ? void 0 : _a.path;
        // 等待文件加载完成，且只记录当前正在浏览的文件
        if (!fileName || !this.lastLoadedFileName || fileName !== this.lastLoadedFileName || this.loadingFile) {
            return;
        }
        const view = this.app.workspace.getActiveViewOfType(ObsidianApi.MarkdownView);
        if (!view)
            return;
        const st = readViewState(view);
        const hadPrior = Object.keys(this.lastState).length > 0;
        if (!hadPrior) {
            this.lastState = st;
            return;
        }
        if (!statesEqual(st, this.lastState)) {
            this.db[fileName] = Object.assign(Object.assign({}, st), { lastModified: Date.now() });
            this.lastState = st;
        }
    }
    /** 文件打开/激活时恢复其保存的进度 */
    restoreState(file) {
        var _a, _b, _c, _d, _e;
        return __awaiter(this, void 0, void 0, function* () {
            const fileName = (_a = this.app.workspace.getActiveFile()) === null || _a === void 0 ? void 0 : _a.path;
            // 悬停预览窗口不恢复位置；若预览了某个文件，顺带清掉它的记录避免污染
            if (this.isHoverPopoverActive()) {
                if (fileName)
                    delete this.db[fileName];
                return;
            }
            if (fileName && this.loadingFile && this.lastLoadedFileName === fileName) {
                return;
            }
            // 1.5s 防重 guard：同一个 leaf+file 刚恢复过就不再重复跳
            const leaf = this.app.workspace.getMostRecentLeaf();
            const leafId = (_b = leaf.id) !== null && _b !== void 0 ? _b : "";
            const leafFile = (_d = (_c = leaf === null || leaf === void 0 ? void 0 : leaf.getViewState().state) === null || _c === void 0 ? void 0 : _c.file) !== null && _d !== void 0 ? _d : "";
            const guardKey = `${leafId}:${leafFile}`;
            if (fileName && this.lastRestoredKey === guardKey && Date.now() - this.lastRestoredAt < RESTORE_GUARD_WINDOW_MS) {
                return;
            }
            this.loadingFile = true;
            if (this.lastLoadedFileName !== fileName) {
                this.lastState = {};
                this.lastLoadedFileName = fileName !== null && fileName !== void 0 ? fileName : "";
                let st = {};
                if (fileName && this.settings.restoreEditorPosition) {
                    st = (_e = this.db[fileName]) !== null && _e !== void 0 ? _e : {};
                    if (Object.keys(st).length > 0) {
                        yield this.delay(RESTORE_DELAY_MS);
                        // 从链接/搜索跳转时 Obsidian 会高亮目标，此时不覆盖
                        const flashing = this.app.workspace.containerEl.querySelector(".is-flashing");
                        if (!flashing) {
                            yield this.delay(10);
                            const view = this.app.workspace.getActiveViewOfType(ObsidianApi.MarkdownView);
                            if (view) {
                                applyViewState(view, st);
                            }
                        }
                    }
                }
                this.lastRestoredKey = guardKey;
                this.lastRestoredAt = Date.now();
                this.lastState = st;
            }
            this.loadingFile = false;
        });
    }
    /** 从独立 json 文件读取历史进度 */
    loadDb() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const adapter = this.app.vault.adapter;
                if (yield adapter.exists(this.dbPath)) {
                    const data = yield adapter.read(this.dbPath);
                    this.db = JSON.parse(data);
                }
            }
            catch (e) {
                console.error("Format Hotkeys: 读取光标位置数据库失败", e);
                this.db = {};
            }
            // 清理已不存在文件的孤儿记录，避免数据库无限膨胀
            for (const key of Object.keys(this.db)) {
                if (!this.app.vault.getAbstractFileByPath(key)) {
                    delete this.db[key];
                }
            }
            this.lastSavedDbJson = JSON.stringify(this.db);
        });
    }
    /** 当前激活视图是否为悬停预览窗口（Page preview / Hover Editor 等瞬态视图） */
    isHoverPopoverActive() {
        var _a;
        const container = (_a = this.app.workspace.getActiveViewOfType(ObsidianApi.MarkdownView)) === null || _a === void 0 ? void 0 : _a.containerEl;
        if (!container)
            return false;
        return container.closest(".hover-popover") !== null || container.closest(".hover-editor") !== null;
    }
    /** 把内存 db 写入独立 json 文件（仅内容变化时写） */
    writeDb() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const json = JSON.stringify(this.db);
                if (json === this.lastSavedDbJson)
                    return;
                const adapter = this.app.vault.adapter;
                const parent = this.dbPath.substring(0, this.dbPath.lastIndexOf("/"));
                if (!(yield adapter.exists(parent))) {
                    yield adapter.mkdir(parent);
                }
                yield adapter.write(this.dbPath, json);
                this.lastSavedDbJson = json;
            }
            catch (e) {
                console.error("Format Hotkeys: 写入光标位置数据库失败", e);
            }
        });
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    setupTableStripeRefresh() {
        this.registerEvent(this.app.workspace.on("layout-change", () => scheduleTableStripeRefresh(this.app)));
        this.registerEvent(this.app.workspace.on("active-leaf-change", () => scheduleTableStripeRefresh(this.app)));
        this.app.workspace.onLayoutReady(() => {
            var _a;
            const workspaceEl = document.querySelector(".workspace");
            if (workspaceEl instanceof HTMLElement) {
                (_a = this.tableStripeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
                this.tableStripeObserver = attachTableStripeObserver(this.app, workspaceEl);
            }
            scheduleTableStripeRefresh(this.app);
        });
    }
    setupOutlineMarkdown() {
        this.registerEvent(this.app.workspace.on("layout-change", () => scheduleOutlineMarkdownRefresh()));
        this.registerEvent(this.app.workspace.on("active-leaf-change", () => scheduleOutlineMarkdownRefresh()));
        this.app.workspace.onLayoutReady(() => {
            var _a;
            const workspaceEl = document.querySelector(".workspace");
            if (workspaceEl instanceof HTMLElement) {
                (_a = this.outlineMarkdownObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
                this.outlineMarkdownObserver = attachOutlineMarkdownObserver(this.app, workspaceEl);
            }
            scheduleOutlineMarkdownRefresh();
        });
    }
    registerPrismAsmLanguages() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const api = ObsidianApi__namespace;
                const prism = typeof api.loadPrism === "function"
                    ? yield api.loadPrism()
                    : window.Prism;
                if (prism === null || prism === void 0 ? void 0 : prism.languages) {
                    registerAsmPrismLanguages(prism);
                }
            }
            catch (_a) {
                // Prism 不可用时源码视图仍由 CodeMirror 装饰高亮
            }
        });
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            const data = (yield this.loadData());
            this.settings = Object.assign(Object.assign(Object.assign({}, DEFAULT_SETTINGS), (data !== null && data !== void 0 ? data : {})), { typora: mergeTyporaStyle(data === null || data === void 0 ? void 0 : data.typora) });
            if (!Array.isArray(this.settings.codeLanguages) || this.settings.codeLanguages.length === 0) {
                this.settings.codeLanguages = [...DEFAULT_SETTINGS.codeLanguages];
            }
            // 兼容旧按钮 id
            if (Array.isArray(this.settings.toolbarButtonOrder)) {
                this.settings.toolbarButtonOrder = this.settings.toolbarButtonOrder.map((id) => id === "callout-tip" ? "callout" : id);
            }
            const validIds = new Set([
                "typora-mode",
                "typora-config",
                "bold",
                "flatten-to-bold",
                "remove-red",
                "red-underline",
                "red-wavy",
                "callout",
                "remove-callout",
                "table-to-md",
                "remove-blank-lines",
                "dunhao",
                "code-language",
                "block-math-to-inline",
                "block-math-to-inline-join",
                "normalize-punctuation",
            ]);
            if (!Array.isArray(this.settings.toolbarButtonOrder) || this.settings.toolbarButtonOrder.length === 0) {
                this.settings.toolbarButtonOrder = [...DEFAULT_SETTINGS.toolbarButtonOrder];
            }
            else {
                this.settings.toolbarButtonOrder = this.settings.toolbarButtonOrder.filter((id) => validIds.has(id));
                for (const id of DEFAULT_SETTINGS.toolbarButtonOrder) {
                    if (!this.settings.toolbarButtonOrder.includes(id)) {
                        this.settings.toolbarButtonOrder.push(id);
                    }
                }
            }
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
            this.toolbarManager.refresh();
        });
    }
    saveTyporaSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
}

module.exports = FormatHotkeysPlugin;
