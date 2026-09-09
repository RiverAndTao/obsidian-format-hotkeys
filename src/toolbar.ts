import { Editor, MarkdownView, Menu } from "obsidian";
import type FormatHotkeysPlugin from "./main";
import { insertTextAtCursor, removeBlankLinesInSelection, convertBlockMathToInline, convertBlockMathToInlineAndJoin, normalizePunctuation, wrapCallout, CALLOUT_OPTIONS, CalloutType, toggleBold, flattenSelectionToBold, removeRedInSelection } from "./editor-utils";
import { LanguageInputModal } from "./language-input-modal";
import { formatLanguageLabel, ToolbarButtonId } from "./settings";
import { ToolbarOrderModal } from "./toolbar-order-modal";
import { TyporaConfigModal } from "./typora-config-modal";

const TOOLBAR_CLASS = "format-hotkeys-toolbar";

export class EditorToolbarManager {
    private toolbarEl: HTMLElement | null = null;
    private attachedView: MarkdownView | null = null;

    constructor(private plugin: FormatHotkeysPlugin) {}

    attach(): void {
        this.plugin.app.workspace.onLayoutReady(() => this.syncToolbar());

        this.plugin.registerEvent(
            this.plugin.app.workspace.on("active-leaf-change", () => this.syncToolbar())
        );

        this.plugin.registerEvent(
            this.plugin.app.workspace.on("layout-change", () => this.syncToolbar())
        );
    }

    refresh(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        this.detach();
        if (view && view.getMode() === "source") {
            this.attachToView(view);
        }
    }

    private syncToolbar(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

        if (view === this.attachedView && this.toolbarEl?.isConnected) {
            return;
        }

        this.detach();

        if (!view || view.getMode() !== "source") {
            return;
        }

        this.attachToView(view);
    }

    private attachToView(view: MarkdownView): void {
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

    private renderButton(view: MarkdownView, buttonId: ToolbarButtonId): void {
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

    private addTyporaModeButton(_view: MarkdownView): void {
        if (!this.toolbarEl) return;

        const isActive = this.plugin.settings.typoraMode;
        const btn = this.toolbarEl.createEl("button", {
            cls: `format-hotkeys-toolbar-btn format-hotkeys-typora-btn${isActive ? " typora-mode-active" : ""}`,
            text: isActive ? "✓ Typora" : "Typora",
        });
        btn.setAttr("aria-label", isActive ? "关闭 Typora 模式" : "启用 Typora 模式");

        this.plugin.registerDomEvent(btn, "mousedown", (e) => e.preventDefault());
        this.plugin.registerDomEvent(btn, "click", async (e) => {
            e.preventDefault();
            this.plugin.settings.typoraMode = !this.plugin.settings.typoraMode;
            await this.plugin.saveSettings();
            this.plugin.applyTyporaMode();
            // 更新按钮状态
            const nowActive = this.plugin.settings.typoraMode;
            btn.textContent = nowActive ? "✓ Typora" : "Typora";
            btn.setAttr("aria-label", nowActive ? "关闭 Typora 模式" : "启用 Typora 模式");
            if (nowActive) {
                btn.addClass("typora-mode-active");
            } else {
                btn.removeClass("typora-mode-active");
            }
        });
    }

    private addTyporaConfigButton(): void {
        if (!this.toolbarEl) return;

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

    private addCalloutButton(view: MarkdownView): void {
        if (!this.toolbarEl) return;

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

    private showCalloutMenu(anchor: HTMLElement, view: MarkdownView): void {
        const menu = new Menu();
        for (const option of CALLOUT_OPTIONS) {
            menu.addItem((item) => {
                item.setTitle(option.label);
                item.onClick(() => wrapCallout(view.editor, option.type as CalloutType));
            });
        }
        menu.showAtPosition({
            x: anchor.getBoundingClientRect().left,
            y: anchor.getBoundingClientRect().top - 4,
        });
    }

    private addActionButton(
        view: MarkdownView,
        label: string,
        action: (editor: Editor) => void
    ): void {
        if (!this.toolbarEl) return;

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

    private addLanguageButton(view: MarkdownView): void {
        if (!this.toolbarEl) return;

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

    private showLanguageMenu(anchor: HTMLElement): void {
        const menu = new Menu();

        for (const lang of this.plugin.settings.codeLanguages) {
            const label = formatLanguageLabel(lang);
            const isActive = lang === this.plugin.settings.defaultCodeLanguage;
            menu.addItem((item) => {
                item.setTitle(isActive ? `✓ ${label}` : label);
                item.onClick(async () => {
                    this.plugin.settings.defaultCodeLanguage = lang;
                    await this.plugin.saveSettings();
                });
            });
        }

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle("添加语言…");
            item.onClick(async () => {
                const value = await new LanguageInputModal(this.plugin.app).openAndGetValue();
                if (value === null) return;

                if (!this.plugin.settings.codeLanguages.includes(value)) {
                    this.plugin.settings.codeLanguages.push(value);
                }
                this.plugin.settings.defaultCodeLanguage = value;
                await this.plugin.saveSettings();
            });
        });

        menu.showAtPosition({
            x: anchor.getBoundingClientRect().left,
            y: anchor.getBoundingClientRect().top - 4,
        });
    }

    private renderMoreButton(_view: MarkdownView): void {
        if (!this.toolbarEl) return;

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

    private detach(): void {
        this.toolbarEl?.remove();
        this.toolbarEl = null;
        this.attachedView = null;
    }
}
