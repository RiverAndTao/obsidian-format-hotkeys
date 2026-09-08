/** 保护代码块 / 行内代码 / 公式，避免格式变换误伤 */

const PLACEHOLDER_START = "\uE000";
const PLACEHOLDER_END = "\uE001";

export function withProtectedRegions(text: string, transform: (plain: string) => string): string {
    const slots: string[] = [];
    const stash = (match: string): string => {
        slots.push(match);
        return `${PLACEHOLDER_START}${slots.length - 1}${PLACEHOLDER_END}`;
    };

    const masked = text
        .replace(/```[\s\S]*?```/g, stash)
        .replace(/\$\$[\s\S]*?\$\$/g, stash)
        .replace(/\$[^$\n]+\$/g, stash)
        .replace(/`[^`\n]+`/g, stash);

    const transformed = transform(masked);
    return transformed.replace(/\uE000(\d+)\uE001/g, (_, index: string) => slots[Number(index)] ?? "");
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

function normalizeColor(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function isRedColorValue(value: string): boolean {
    return RED_VALUES.has(normalizeColor(value));
}

function colorFromAttrs(attrs: string): string | null {
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

function hasBoldWeight(attrs: string): boolean {
    return /font-weight\s*:\s*(bold|[6-9]00)/i.test(attrs);
}

function wrapAsBold(inner: string): string {
    const lead = inner.match(/^\s*/)?.[0] ?? "";
    const trail = inner.match(/\s*$/)?.[0] ?? "";
    let core = inner.slice(lead.length, inner.length - trail.length);
    core = core.replace(/\*\*/g, "");
    if (!core) {
        return inner;
    }
    return `${lead}**${core}**`;
}

function unwrapHtmlOnce(text: string, toBold: boolean, redOnly: boolean): string {
    const replaceTag = (attrs: string, inner: string): string | null => {
        const color = colorFromAttrs(attrs);
        if (redOnly) {
            if (!color || !isRedColorValue(color)) {
                return null;
            }
            if (hasBoldWeight(attrs)) {
                return wrapAsBold(inner);
            }
            return inner;
        }
        return wrapAsBold(inner);
    };

    let out = text.replace(/<font\b([^>]*)>([\s\S]*?)<\/font>/gi, (full, attrs: string, inner: string) => {
        const next = replaceTag(attrs, inner);
        return next === null ? full : next;
    });

    out = out.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (full, attrs: string, inner: string) => {
        if (redOnly) {
            const color = colorFromAttrs(attrs);
            if (!color || !isRedColorValue(color)) {
                return full;
            }
            return hasBoldWeight(attrs) ? wrapAsBold(inner) : inner;
        }
        if (!colorFromAttrs(attrs) && !hasBoldWeight(attrs)) {
            return full;
        }
        return wrapAsBold(inner);
    });

    if (!redOnly) {
        out = out.replace(/<u>([\s\S]*?)<\/u>/gi, (_full, inner: string) => wrapAsBold(inner));
        out = out.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, (_full, inner: string) => wrapAsBold(inner));
    }

    return out;
}

function stabilize(text: string, step: (value: string) => string): string {
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
export function flattenInlineToBold(text: string): string {
    return withProtectedRegions(text, (plain) => stabilize(plain, (value) => unwrapHtmlOnce(value, true, false)));
}

/** 去掉选区内的变红标记；若原标签带 bold，则保留为 **加粗** */
export function stripRedMarkup(text: string): string {
    return withProtectedRegions(text, (plain) => stabilize(plain, (value) => unwrapHtmlOnce(value, false, true)));
}

export function selectionAlreadyBoldWrapped(text: string): boolean {
    return /^\*\*[\s\S]+\*\*$/.test(text) && !text.slice(2, -2).includes("**");
}
