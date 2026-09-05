'use strict';

var obsidian = require('obsidian');
var state = require('@codemirror/state');
var view = require('@codemirror/view');

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

/** 切换包裹格式：已包裹则取消，否则添加 */
function toggleWrap(editor, open, close) {
    const selected = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    if (from.line !== to.line) {
        editor.replaceSelection(open + selected + close);
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
        editor.replaceRange(selected, { line: from.line, ch: beforeStart }, { line: to.line, ch: afterEnd });
        editor.setSelection({ line: from.line, ch: beforeStart }, { line: to.line, ch: beforeStart + selected.length });
        return;
    }
    editor.replaceSelection(open + selected + close);
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
    el.style.setProperty("--typora-list-marker-color", style.listMarkerColor || "var(--text-muted)");
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
/** 浅色模式整站背景：主色 + 侧栏等次级面略加深 */
function backgroundOverrideCss(style) {
    var _a;
    const bg = (_a = style.backgroundColor) === null || _a === void 0 ? void 0 : _a.trim();
    if (!bg) {
        return "";
    }
    return `
body.theme-light {
    --background-primary: ${bg} !important;
    --background-primary-alt: color-mix(in srgb, ${bg} 92%, #000 8%) !important;
    --background-secondary: color-mix(in srgb, ${bg} 86%, #000 14%) !important;
    --background-secondary-alt: color-mix(in srgb, ${bg} 80%, #000 20%) !important;
    --titlebar-background: ${bg} !important;
    --titlebar-background-focused: ${bg} !important;
    --modal-background: ${bg} !important;
}
.format-hotkeys-typora-preview {
    background: ${bg} !important;
}`;
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
    tag.textContent = [backgroundOverrideCss(style), headingColorOverrideCss(style)].join("\n");
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
        new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl)
            .setName("隐藏 Markdown 语法")
            .setDesc("非编辑行隐藏 #、**、`、> 等符号；有序列表的 1. 2. 始终保留")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.typora.hideSyntax).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.typora.hideSyntax = value;
            yield this.persist();
        })));
        new obsidian.Setting(containerEl)
            .setName("一级 / 二级标题下划线")
            .setDesc("对齐 Typora GitHub 主题的标题底部分隔线")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.typora.headingUnderline).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.typora.headingUnderline = value;
            yield this.persist();
        })));
        new obsidian.Setting(containerEl)
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
        this.addOptionalColorSetting(containerEl, {
            name: "浅色模式背景",
            desc: "覆盖 Obsidian 整站背景（编辑区、侧栏、标题栏）。浅色太刺眼时可调成浅灰/米色；重置则恢复主题默认。深色模式不受影响。",
            getValue: () => this.plugin.settings.typora.backgroundColor,
            setValue: (value) => {
                this.plugin.settings.typora.backgroundColor = value;
            },
            fallbackVar: "--background-primary",
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
            fallbackVar: "--text-muted",
        });
        new obsidian.Setting(containerEl)
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
    }
    addHeadingStyleSetting(containerEl, level) {
        const heading = this.plugin.settings.typora.headings[level];
        const setting = new obsidian.Setting(containerEl)
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
        const setting = new obsidian.Setting(containerEl).setName(options.name).setDesc(options.desc);
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
        const setting = new obsidian.Setting(containerEl).setName(options.name).setDesc(options.desc);
        this.attachColorPicker(setting, {
            getValue: options.getValue,
            setValue: options.setValue,
            resolveFallback: () => themeColorHex(options.fallbackVar),
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
    callout: "Tips",
};
function formatLanguageLabel(language) {
    return language.trim() === "" ? "无" : language;
}
class FormatHotkeysSettingTab extends obsidian.PluginSettingTab {
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
        new obsidian.Setting(containerEl)
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
            new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl).addButton((btn) => btn
            .setButtonText("添加语言")
            .setCta()
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.codeLanguages.push("");
            yield this.plugin.saveSettings();
            this.display();
        })));
    }
}

class LanguageInputModal extends obsidian.Modal {
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

class ToolbarOrderModal extends obsidian.Modal {
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
        new obsidian.Setting(contentEl).addButton((btn) => btn.setButtonText("完成").setCta().onClick(() => __awaiter(this, void 0, void 0, function* () {
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

class TyporaConfigModal extends obsidian.Modal {
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
        const view = this.plugin.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        this.detach();
        if (view && view.getMode() === "source") {
            this.attachToView(view);
        }
    }
    syncToolbar() {
        var _a;
        const view = this.plugin.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
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
        const menu = new obsidian.Menu();
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
        const menu = new obsidian.Menu();
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
function isTyporaModeOn() {
    return document.body.classList.contains("typora-mode-active");
}
function buildDecorations(view$1) {
    const builder = new state.RangeSetBuilder();
    if (!isTyporaModeOn()) {
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
        this.decorations = buildDecorations(view);
    }
    update(update) {
        const forced = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshParenListEffect)));
        if (update.docChanged || update.viewportChanged || forced) {
            this.decorations = buildDecorations(update.view);
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
        if (!(view instanceof obsidian.MarkdownView) || view.getMode() !== "source") {
            return;
        }
        const cm = view.editor.cm;
        if (cm) {
            cm.dispatch({ effects: refreshParenListEffect.of(null) });
        }
    });
}

const RED_OPEN = '<font color="#ff0000">';
const RED_CLOSE = "</font>";
class FormatHotkeysPlugin extends obsidian.Plugin {
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
            this.toolbarManager = new EditorToolbarManager(this);
            this.toolbarManager.attach();
            this.applyTyporaMode();
        });
    }
    onunload() {
        const bodyEl = document.body;
        bodyEl.removeClass("typora-mode-active");
        bodyEl.removeClass("typora-hide-syntax");
        clearTyporaStyleVars(bodyEl);
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
