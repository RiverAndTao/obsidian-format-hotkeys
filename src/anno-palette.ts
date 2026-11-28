import { Notice } from "obsidian";

export interface AnnoPaletteColor {
    id: string;
    name: string;
    /** #rrggbb */
    hex: string;
}

export const DEFAULT_ANNO_PALETTE: AnnoPaletteColor[] = [
    { id: "yellow", name: "黄色", hex: "#ffd000" },
    { id: "green", name: "绿色", hex: "#48bb78" },
    { id: "blue", name: "蓝色", hex: "#589cf6" },
    { id: "pink", name: "粉色", hex: "#ec78a8" },
    { id: "orange", name: "橙色", hex: "#f2994a" },
];

const ID_RE = /^[a-z][a-z0-9]{0,15}$/;
const HEX_RE = /^#[0-9a-f]{6}$/;
const MAX_COLORS = 24;
const EXTRA_HEX = ["#c084fc", "#38bdf8", "#f472b6", "#facc15", "#fb7185", "#a3e635", "#94a3b8"];

export function cloneAnnoPalette(palette: AnnoPaletteColor[]): AnnoPaletteColor[] {
    return palette.map((item) => ({ id: item.id, name: item.name, hex: item.hex }));
}

export function normalizeAnnoPalette(raw: unknown): AnnoPaletteColor[] {
    if (!Array.isArray(raw)) {
        return cloneAnnoPalette(DEFAULT_ANNO_PALETTE);
    }
    const out: AnnoPaletteColor[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (!item || typeof item !== "object") {
            continue;
        }
        const rec = item as Record<string, unknown>;
        const id = typeof rec.id === "string" ? rec.id.trim().toLowerCase() : "";
        const hex = typeof rec.hex === "string" ? rec.hex.trim().toLowerCase() : "";
        const name = typeof rec.name === "string" ? rec.name.trim() : "";
        if (!ID_RE.test(id) || !HEX_RE.test(hex) || seen.has(id)) {
            continue;
        }
        seen.add(id);
        out.push({ id, name: name || "颜色", hex });
        if (out.length >= MAX_COLORS) {
            break;
        }
    }
    return out.length ? out : cloneAnnoPalette(DEFAULT_ANNO_PALETTE);
}

export function defaultAnnoColorId(palette: AnnoPaletteColor[]): string {
    return palette[0]?.id ?? "yellow";
}

export function annoColorName(palette: AnnoPaletteColor[], id: string): string {
    return palette.find((item) => item.id === id)?.name || "颜色";
}

export function annoSwatch(palette: AnnoPaletteColor[], id: string): string {
    return palette.find((item) => item.id === id)?.hex ?? "#ffd000";
}

export function sanitizeColorId(id: string, fallback: string): string {
    const clean = id.trim().toLowerCase();
    return ID_RE.test(clean) ? clean : fallback;
}

export function createPaletteColorId(palette: AnnoPaletteColor[]): string {
    const used = new Set(palette.map((item) => item.id));
    for (let n = 0; n < 8; n++) {
        const id = "c" + Math.random().toString(36).slice(2, 7);
        if (ID_RE.test(id) && !used.has(id)) {
            return id;
        }
    }
    return "c" + Date.now().toString(36).slice(-5);
}

function hexToRgb(hex: string): [number, number, number] {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function annoPaletteCss(palette: AnnoPaletteColor[]): string {
    const rules: string[] = [];
    for (const item of palette) {
        if (!ID_RE.test(item.id) || !HEX_RE.test(item.hex)) {
            continue;
        }
        const light = rgba(item.hex, 0.42);
        const dark = rgba(item.hex, 0.3);
        const id = item.id;
        rules.push(
            `:is(.markdown-source-view, .markdown-preview-view, .markdown-rendered) .fh-anno[data-color="${id}"]{background-color:${light}}`,
            `body.theme-dark :is(.markdown-source-view, .markdown-preview-view, .markdown-rendered) .fh-anno[data-color="${id}"]{background-color:${dark}}`,
            `.fh-anno-preview.is-add[data-color="${id}"]{background:${light}}`,
            `body.theme-dark .fh-anno-preview.is-add[data-color="${id}"]{background:${dark}}`
        );
    }
    return rules.join("\n");
}

const STYLE_ID = "fh-anno-palette";

export function applyAnnoPalette(palette: AnnoPaletteColor[]): void {
    let el = document.getElementById(STYLE_ID);
    if (!(el instanceof HTMLStyleElement)) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
    }
    el.textContent = annoPaletteCss(palette);
}

export function clearAnnoPalette(): void {
    document.getElementById(STYLE_ID)?.remove();
}

function nextHex(palette: AnnoPaletteColor[]): string {
    const used = new Set(palette.map((item) => item.hex));
    return EXTRA_HEX.find((hex) => !used.has(hex)) ?? "#a78bfa";
}

/** 设置页里的颜色列表：改色、改名、拖拽或上下移动排序、新增和删除 */
export function mountAnnoPaletteEditor(
    container: HTMLElement,
    palette: AnnoPaletteColor[],
    commit: (next: AnnoPaletteColor[]) => void | Promise<void>
): void {
    let items = cloneAnnoPalette(palette);
    let dragIndex: number | null = null;
    container.empty();
    container.createEl("h3", { text: "批注颜色" });
    container.createEl("p", {
        text: "批注选色按这个顺序排列。可以改颜色和名称，拖左侧把手或用上下按钮调整顺序。改色后，笔记里同一种颜色的高亮会一起变。",
        cls: "setting-item-description",
    });
    const list = container.createDiv({ cls: "fh-anno-palette" });

    const persist = (rerender: boolean): void => {
        void Promise.resolve(commit(cloneAnnoPalette(items)));
        if (rerender) {
            render();
        }
    };

    const clearDropMarks = (): void => {
        list.querySelectorAll<HTMLElement>(".drop-before, .drop-after").forEach((el) => {
            el.removeClass("drop-before");
            el.removeClass("drop-after");
        });
    };

    const move = (from: number, to: number): void => {
        if (to < 0 || to >= items.length || from === to) {
            return;
        }
        const [row] = items.splice(from, 1);
        items.splice(to, 0, row);
        persist(true);
    };

    const render = (): void => {
        list.empty();
        items.forEach((item, index) => {
            const row = list.createDiv({ cls: "fh-anno-palette-row" });
            const grip = row.createSpan({ text: "≡", cls: "fh-anno-palette-grip" });
            grip.setAttr("title", "拖拽调整顺序");
            grip.draggable = true;
            grip.addEventListener("dragstart", (evt) => {
                dragIndex = index;
                row.addClass("is-dragging");
                if (evt.dataTransfer) {
                    evt.dataTransfer.effectAllowed = "move";
                    evt.dataTransfer.setData("text/plain", item.id);
                }
            });
            grip.addEventListener("dragend", () => {
                dragIndex = null;
                row.removeClass("is-dragging");
                clearDropMarks();
            });
            row.addEventListener("dragover", (evt) => {
                if (dragIndex === null || dragIndex === index) {
                    return;
                }
                evt.preventDefault();
                if (evt.dataTransfer) {
                    evt.dataTransfer.dropEffect = "move";
                }
                const rect = row.getBoundingClientRect();
                const after = evt.clientY > rect.top + rect.height / 2;
                clearDropMarks();
                row.addClass(after ? "drop-after" : "drop-before");
            });
            row.addEventListener("drop", (evt) => {
                evt.preventDefault();
                const from = dragIndex;
                const rect = row.getBoundingClientRect();
                const after = evt.clientY > rect.top + rect.height / 2;
                clearDropMarks();
                dragIndex = null;
                if (from === null || from === index) {
                    return;
                }
                let insertAt = index + (after ? 1 : 0);
                if (from < insertAt) {
                    insertAt -= 1;
                }
                const moved = items.splice(from, 1)[0];
                items.splice(insertAt, 0, moved);
                persist(true);
            });

            const colorInput = row.createEl("input", { type: "color", cls: "fh-anno-palette-color" });
            colorInput.value = item.hex;
            colorInput.setAttr("aria-label", `${item.name}的颜色`);
            colorInput.addEventListener("input", () => {
                const hex = colorInput.value.trim().toLowerCase();
                if (!HEX_RE.test(hex)) {
                    return;
                }
                items[index].hex = hex;
                persist(false);
            });

            const nameInput = row.createEl("input", { type: "text", cls: "fh-anno-palette-name" });
            nameInput.value = item.name;
            nameInput.placeholder = "颜色名称";
            nameInput.addEventListener("input", () => {
                items[index].name = nameInput.value;
                persist(false);
            });
            nameInput.addEventListener("blur", () => {
                const trimmed = nameInput.value.trim() || "颜色";
                items[index].name = trimmed;
                nameInput.value = trimmed;
                persist(false);
            });

            const actions = row.createDiv({ cls: "fh-anno-palette-actions" });
            const up = actions.createEl("button", { text: "上移", attr: { type: "button" } });
            const down = actions.createEl("button", { text: "下移", attr: { type: "button" } });
            const remove = actions.createEl("button", { text: "删除", attr: { type: "button" } });
            up.disabled = index === 0;
            down.disabled = index === items.length - 1;
            remove.disabled = items.length <= 1;
            up.addEventListener("click", () => move(index, index - 1));
            down.addEventListener("click", () => move(index, index + 1));
            remove.addEventListener("click", () => {
                if (items.length <= 1) {
                    new Notice("至少保留一种颜色");
                    return;
                }
                items.splice(index, 1);
                persist(true);
            });
        });
    };

    render();

    const bar = container.createDiv({ cls: "fh-anno-palette-bar" });
    const add = bar.createEl("button", { text: "添加颜色", cls: "mod-cta", attr: { type: "button" } });
    const reset = bar.createEl("button", { text: "恢复默认", attr: { type: "button" } });
    add.addEventListener("click", () => {
        if (items.length >= MAX_COLORS) {
            new Notice("最多 24 种颜色");
            return;
        }
        items.push({ id: createPaletteColorId(items), name: "新颜色", hex: nextHex(items) });
        persist(true);
    });
    reset.addEventListener("click", () => {
        items = cloneAnnoPalette(DEFAULT_ANNO_PALETTE);
        persist(true);
    });
}
