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
}
tr:not(.${TABLE_ROW_STRIPE_CLASS}) > :is(th, td) {
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

function stripeRows(table: HTMLTableElement): void {
    table.querySelectorAll(`tr.${TABLE_ROW_STRIPE_CLASS}`).forEach((row) => {
        row.classList.remove(TABLE_ROW_STRIPE_CLASS);
    });

    if (!isTyporaModeOn()) {
        return;
    }

    const bodyRows: HTMLTableRowElement[] = [];
    if (table.tBodies.length > 0) {
        for (const tbody of Array.from(table.tBodies)) {
            bodyRows.push(...Array.from(tbody.rows));
        }
    } else {
        bodyRows.push(...Array.from(table.rows));
    }

    bodyRows.forEach((row, index) => {
        if ((index + 1) % 2 === 0) {
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
    root.querySelectorAll(".cm-html-embed iframe").forEach((node) => {
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
    if (!isTyporaModeOn()) {
        stripeRoot(root);
        return;
    }
    stripeRoot(root);
    stripeHtmlEmbedIframes(root);
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
