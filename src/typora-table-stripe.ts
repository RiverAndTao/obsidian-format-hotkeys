import type { App } from "obsidian";

export const TABLE_ROW_STRIPE_CLASS = "format-hotkeys-table-row-stripe";

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

function isTyporaModeOn(): boolean {
    return document.body.classList.contains("typora-mode-active");
}

function readCssVar(name: string, fallback: string): string {
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
function stripeRows(table: HTMLTableElement): void {
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
        const bodyRows: HTMLTableRowElement[] = [];
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

function ensureIframeStyles(doc: Document): void {
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

function stripeRoot(root: ParentNode): void {
    root.querySelectorAll("table").forEach((node) => {
        if (node instanceof HTMLTableElement) {
            stripeRows(node);
        }
    });
}

function stripeHtmlEmbedIframes(root: ParentNode = document): void {
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
        } catch {
            // sandbox / cross-origin
        }
    });
}

export function refreshTableStripes(_app?: App, root: ParentNode = document): void {
    stripeRoot(root);
    if (isTyporaModeOn()) {
        stripeHtmlEmbedIframes(root);
    }
}

let debounceTimer: number | undefined;

export function scheduleTableStripeRefresh(app: App): void {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        refreshTableStripes(app);
    }, 80);
}

export function attachTableStripeObserver(app: App, root: HTMLElement): MutationObserver {
    const observer = new MutationObserver(() => scheduleTableStripeRefresh(app));
    observer.observe(root, { childList: true, subtree: true });
    return observer;
}
