export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface TyporaHeadingStyle {
    size: number;
    color: string;
}

export interface TyporaStyleSettings {
    contentWidth: number;
    lineHeight: number;
    linePadding: number;
    hideSyntax: boolean;
    headingUnderline: boolean;
    highlightActiveLine: boolean;
    headings: Record<HeadingLevel, TyporaHeadingStyle>;
    quoteColor: string;
    linkColor: string;
    inlineCodeColor: string;
    listMarkerColor: string;
}

export const HEADING_LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

export const HEADING_LABELS: Record<HeadingLevel, string> = {
    1: "一级标题",
    2: "二级标题",
    3: "三级标题",
    4: "四级标题",
    5: "五级标题",
    6: "六级标题",
};

export const DEFAULT_TYPORA_STYLE: TyporaStyleSettings = {
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
] as const;

function cloneHeading(style: TyporaHeadingStyle): TyporaHeadingStyle {
    return { size: style.size, color: style.color };
}

export function mergeTyporaStyle(raw?: Partial<TyporaStyleSettings> | null): TyporaStyleSettings {
    const merged: TyporaStyleSettings = {
        ...DEFAULT_TYPORA_STYLE,
        ...(raw ?? {}),
        headings: {
            1: cloneHeading(DEFAULT_TYPORA_STYLE.headings[1]),
            2: cloneHeading(DEFAULT_TYPORA_STYLE.headings[2]),
            3: cloneHeading(DEFAULT_TYPORA_STYLE.headings[3]),
            4: cloneHeading(DEFAULT_TYPORA_STYLE.headings[4]),
            5: cloneHeading(DEFAULT_TYPORA_STYLE.headings[5]),
            6: cloneHeading(DEFAULT_TYPORA_STYLE.headings[6]),
        },
    };

    if (raw?.headings) {
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

export function cloneTyporaStyle(style: TyporaStyleSettings): TyporaStyleSettings {
    return mergeTyporaStyle(style);
}

/** 未自定义时跟随主题各级标题色（Prime：H1 紫 / H2 青 / H3 绿…） */
function headingColorValue(level: HeadingLevel, color: string): string {
    if (color) {
        return color;
    }
    return `var(--h${level}-color)`;
}

function writeTyporaVars(el: HTMLElement, style: TyporaStyleSettings): void {
    el.style.setProperty("--typora-content-width", `${style.contentWidth}px`);
    el.style.setProperty("--typora-line-height", String(style.lineHeight));
    el.style.setProperty("--typora-line-padding", `${style.linePadding}em`);

    for (const level of HEADING_LEVELS) {
        const heading = style.headings[level];
        el.style.setProperty(`--typora-h${level}-size`, `${heading.size}em`);
        el.style.setProperty(`--typora-h${level}-color`, headingColorValue(level, heading.color));
    }

    el.style.setProperty(
        "--typora-heading-underline",
        style.headingUnderline ? "1px solid var(--background-modifier-border)" : "none"
    );
    el.style.setProperty("--typora-quote-color", style.quoteColor || "var(--text-muted)");
    el.style.setProperty("--typora-link-color", style.linkColor || "var(--link-color)");
    el.style.setProperty("--typora-inline-code-color", style.inlineCodeColor || "var(--code-normal, var(--text-normal))");
    el.style.setProperty("--typora-list-marker-color", style.listMarkerColor || "var(--text-muted)");
    el.style.setProperty(
        "--typora-active-line-bg",
        style.highlightActiveLine ? "rgba(135, 131, 120, 0.05)" : "transparent"
    );
}

function headingColorOverrideCss(style: TyporaStyleSettings): string {
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

export function applyTyporaStyleVars(el: HTMLElement, style: TyporaStyleSettings): void {
    writeTyporaVars(el, style);
    if (document.documentElement !== el) {
        writeTyporaVars(document.documentElement, style);
    }

    let tag = document.getElementById(TYPORA_RUNTIME_STYLE_ID) as HTMLStyleElement | null;
    if (!tag) {
        tag = document.createElement("style");
        tag.id = TYPORA_RUNTIME_STYLE_ID;
        document.head.appendChild(tag);
    }
    tag.textContent = headingColorOverrideCss(style);
}

export function clearTyporaStyleVars(el: HTMLElement): void {
    for (const key of TYPORA_STYLE_KEYS) {
        el.style.removeProperty(key);
        document.documentElement.style.removeProperty(key);
    }
    document.getElementById(TYPORA_RUNTIME_STYLE_ID)?.remove();
}

export function cssColorToHex(color: string): string {
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

export function themeColorHex(cssVar = "--text-normal"): string {
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
export function headingThemeColorHex(level: HeadingLevel): string {
    const heading = themeColorHex(`--h${level}-color`);
    const normal = themeColorHex("--text-normal");
    if (heading && heading !== normal && heading !== "#808080") {
        return heading;
    }

    const palette: Record<HeadingLevel, string> = {
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
