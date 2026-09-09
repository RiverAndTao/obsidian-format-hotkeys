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
function hasBoldWeight$1(attrs) {
    return /font-weight\s*:\s*(bold|[6-9]00)/i.test(attrs);
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
        const color = colorFromAttrs$1(attrs);
        if (redOnly) {
            if (!color || !isRedColorValue(color)) {
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
            const color = colorFromAttrs$1(attrs);
            if (!color || !isRedColorValue(color)) {
                return full;
            }
            return hasBoldWeight$1(attrs) ? wrapAsBold(inner) : inner;
        }
        if (!colorFromAttrs$1(attrs) && !hasBoldWeight$1(attrs)) {
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
/** 切换包裹格式：已包裹则取消，否则添加 */
function toggleWrap(editor, open, close) {
    const selected = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    if (from.line !== to.line) {
        editor.replaceSelection(open + selected + close, UNDO_ORIGIN);
        if (selected.length > 0) {
            editor.setSelection({ line: from.line, ch: from.ch + open.length }, { line: to.line, ch: to.ch + open.length });
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
        editor.setSelection({ line: from.line, ch: beforeStart }, { line: to.line, ch: beforeStart + selected.length });
        return;
    }
    editor.replaceSelection(open + selected + close, UNDO_ORIGIN);
    if (selected.length > 0) {
        editor.setSelection({ line: from.line, ch: from.ch + open.length }, { line: to.line, ch: to.ch + open.length });
    }
    else {
        editor.setCursor({ line: from.line, ch: from.ch + open.length });
    }
}
/** 设置当前行标题级别；已是该级别则取消标题 */
function toggleHeading(editor, level) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const prefix = "#".repeat(level) + " ";
    if (headingMatch) {
        const currentLevel = headingMatch[1].length;
        const content = headingMatch[2];
        if (currentLevel === level) {
            editor.setLine(cursor.line, content);
        }
        else {
            editor.setLine(cursor.line, prefix + content);
        }
    }
    else {
        const content = line.trimStart();
        editor.setLine(cursor.line, prefix + content);
    }
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
        "callout",
        "remove-blank-lines",
        "dunhao",
        "code-language",
        "block-math-to-inline",
        "block-math-to-inline-join",
        "normalize-punctuation",
    ],
    typoraMode: false,
    typora: cloneTyporaStyle(DEFAULT_TYPORA_STYLE),
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
    "flatten-to-bold": "格式转加粗",
    "remove-red": "取消变红",
    callout: "Tips",
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
                this.addActionButton(view, "格式转加粗", (editor) => flattenSelectionToBold(editor));
                break;
            case "remove-red":
                this.addActionButton(view, "取消变红", (editor) => removeRedInSelection(editor));
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
    const parts = [];
    if (color) {
        parts.push(`color: ${displayColor(color)}`);
    }
    if (hasBoldWeight(attrs)) {
        parts.push("font-weight: 700");
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
function lineIsActive(view, lineFrom, lineTo) {
    for (const range of view.state.selection.ranges) {
        if (range.from <= lineTo && range.to >= lineFrom) {
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
        const active = lineIsActive(view$1, line.from, line.to);
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
                builder.add(hit.innerFrom, hit.innerTo, view.Decoration.mark({
                    class: "typora-html-colored",
                    attributes: { style: hit.style },
                }));
            }
            if (hide && hit.to > hit.innerTo) {
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
let debounceTimer;
function scheduleTableStripeRefresh(app) {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        refreshTableStripes();
    }, 80);
}
function attachTableStripeObserver(app, root) {
    const observer = new MutationObserver(() => scheduleTableStripeRefresh());
    observer.observe(root, { childList: true, subtree: true });
    return observer;
}

const RED_OPEN = '<font color="#ff0000">';
const RED_CLOSE = "</font>";
class FormatHotkeysPlugin extends ObsidianApi.Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
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
                name: "选区格式转为加粗",
                editorCallback: (editor) => flattenSelectionToBold(editor),
            });
            this.addCommand({
                id: "remove-red",
                name: "取消选区变红",
                editorCallback: (editor) => removeRedInSelection(editor),
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
            this.applyTyporaMode();
            this.setupTableStripeRefresh();
        });
    }
    onunload() {
        var _a;
        const bodyEl = document.body;
        bodyEl.removeClass("typora-mode-active");
        bodyEl.removeClass("typora-hide-syntax");
        clearTyporaStyleVars(bodyEl);
        (_a = this.tableStripeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        refreshTableStripes(this.app);
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
                "callout",
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
