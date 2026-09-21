import type { App } from "obsidian";

const SRC_ATTR = "data-fh-outline-src";

const MD_RE = /[*_`~$=]|\[\[|\]\(|!\[]|~~|==/;

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** 大纲标题里的常见行内 Markdown，渲染成 HTML。双链/链接只显示可见文字。 */
export function renderOutlineMarkdown(src: string): string {
    let text = escapeHtml(src);
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
    text = text.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_m, note: string, alias?: string) =>
        alias || note
    );
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

function outlineInners(root: ParentNode = document): HTMLElement[] {
    return Array.from(
        root.querySelectorAll('.workspace-leaf-content[data-type="outline"] .tree-item-inner')
    ).filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function isPlainText(el: HTMLElement): boolean {
    return el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE;
}

function paint(el: HTMLElement): void {
    if (!isPlainText(el)) {
        return;
    }
    const src = el.textContent ?? "";
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

export function refreshOutlineMarkdown(root: ParentNode = document): void {
    for (const el of outlineInners(root)) {
        paint(el);
    }
}

export function restoreOutlineMarkdown(root: ParentNode = document): void {
    for (const el of outlineInners(root)) {
        const src = el.getAttribute(SRC_ATTR);
        if (src !== null) {
            el.textContent = src;
            el.removeAttribute(SRC_ATTR);
        }
    }
}

let debounceTimer: number | undefined;

export function scheduleOutlineMarkdownRefresh(): void {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => refreshOutlineMarkdown(), 40);
}

export function attachOutlineMarkdownObserver(_app: App, root: HTMLElement): MutationObserver {
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
            if (!target?.closest('.workspace-leaf-content[data-type="outline"]')) {
                continue;
            }
            scheduleOutlineMarkdownRefresh();
            return;
        }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return observer;
}
