import { Editor, MarkdownView, Menu } from "obsidian";
import type FormatHotkeysPlugin from "./main";
import {
    removeBlankLinesInSelection,
    convertBlockMathToInline,
    convertBlockMathToInlineAndJoin,
    normalizePunctuation,
    wrapCallout,
    removeCallout,
    convertHtmlTableToMarkdown,
    CALLOUT_OPTIONS,
    CalloutType,
    toggleBold,
    flattenSelectionToBold,
    removeRedInSelection,
    toggleRedUnderline,
    toggleRedWavy,
} from "./editor-utils";
import { LanguageInputModal } from "./language-input-modal";
import {
    ALL_TOOLBAR_BUTTONS,
    formatLanguageLabel,
    TOOLBAR_BUTTON_LABELS,
    ToolbarButtonId,
} from "./settings";
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

    private overflowButtonIds(): ToolbarButtonId[] {
        const visible = new Set(this.plugin.settings.toolbarButtonOrder);
        return ALL_TOOLBAR_BUTTONS.filter((id) => !visible.has(id));
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
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS.bold, (editor) => toggleBold(editor));
                break;
            case "flatten-to-bold":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["flatten-to-bold"], (editor) =>
                    flattenSelectionToBold(editor)
                );
                break;
            case "remove-red":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["remove-red"], (editor) =>
                    removeRedInSelection(editor)
                );
                break;
            case "red-underline":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["red-underline"], (editor) =>
                    toggleRedUnderline(editor)
                );
                break;
            case "red-wavy":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["red-wavy"], (editor) =>
                    toggleRedWavy(editor)
                );
                break;
            case "remove-blank-lines":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["remove-blank-lines"], (editor) =>
                    removeBlankLinesInSelection(editor)
                );
                break;
            case "code-language":
                this.addLanguageButton(view);
                break;
            case "block-math-to-inline":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["block-math-to-inline"], (editor) =>
                    convertBlockMathToInline(editor)
                );
                break;
            case "block-math-to-inline-join":
                this.addActionButton(
                    view,
                    TOOLBAR_BUTTON_LABELS["block-math-to-inline-join"],
                    (editor) => convertBlockMathToInlineAndJoin(editor)
                );
                break;
            case "normalize-punctuation":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["normalize-punctuation"], (editor) =>
                    normalizePunctuation(editor)
                );
                break;
            case "callout":
                this.addCalloutButton(view);
                break;
            case "remove-callout":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["remove-callout"], (editor) =>
                    removeCallout(editor)
                );
                break;
            case "table-to-md":
                this.addActionButton(view, TOOLBAR_BUTTON_LABELS["table-to-md"], (editor) =>
                    convertHtmlTableToMarkdown(editor)
                );
                break;
        }
    }

    private runToolbarAction(view: MarkdownView, buttonId: ToolbarButtonId, anchor?: HTMLElement): void {
        switch (buttonId) {
            case "typora-mode":
                void this.toggleTyporaMode();
                break;
            case "typora-config":
                new TyporaConfigModal(this.plugin.app, this.plugin).open();
                break;
            case "bold":
                toggleBold(view.editor);
                break;
            case "flatten-to-bold":
                flattenSelectionToBold(view.editor);
                break;
            case "remove-red":
                removeRedInSelection(view.editor);
                break;
            case "red-underline":
                toggleRedUnderline(view.editor);
                break;
            case "red-wavy":
                toggleRedWavy(view.editor);
                break;
            case "remove-blank-lines":
                removeBlankLinesInSelection(view.editor);
                break;
            case "code-language":
                if (anchor) this.showLanguageMenu(anchor);
                break;
            case "block-math-to-inline":
                convertBlockMathToInline(view.editor);
                break;
            case "block-math-to-inline-join":
                convertBlockMathToInlineAndJoin(view.editor);
                break;
            case "normalize-punctuation":
                normalizePunctuation(view.editor);
                break;
            case "callout":
                if (anchor) this.showCalloutMenu(anchor, view);
                else wrapCallout(view.editor, "tip");
                break;
            case "remove-callout":
                removeCallout(view.editor);
                break;
            case "table-to-md":
                convertHtmlTableToMarkdown(view.editor);
                break;
        }
    }

    private async toggleTyporaMode(): Promise<void> {
        this.plugin.settings.typoraMode = !this.plugin.settings.typoraMode;
        await this.plugin.saveSettings();
        this.plugin.applyTyporaMode();
        this.refresh();
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
            await this.toggleTyporaMode();
        });
    }

    private addTyporaConfigButton(): void {
        if (!this.toolbarEl) return;

        const btn = this.toolbarEl.createEl("button", {
            cls: "format-hotkeys-toolbar-btn format-hotkeys-typora-config-btn",
            text: "配置",
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
                    this.refresh();
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
                this.refresh();
            });
        });

        menu.showAtPosition({
            x: anchor.getBoundingClientRect().left,
            y: anchor.getBoundingClientRect().top - 4,
        });
    }

    private renderMoreButton(view: MarkdownView): void {
        if (!this.toolbarEl) return;

        const btn = this.toolbarEl.createEl("button", {
            cls: "format-hotkeys-toolbar-btn format-hotkeys-more-btn",
            text: "更多",
        });
        btn.setAttr("aria-label", "更多工具与整理工具栏");

        this.plugin.registerDomEvent(btn, "mousedown", (e) => e.preventDefault());
        this.plugin.registerDomEvent(btn, "click", (e) => {
            e.preventDefault();
            this.showMoreMenu(btn, view);
        });
    }

    private showMoreMenu(anchor: HTMLElement, view: MarkdownView): void {
        const menu = new Menu();
        const overflow = this.overflowButtonIds();

        if (overflow.length > 0) {
            for (const id of overflow) {
                menu.addItem((item) => {
                    item.setTitle(TOOLBAR_BUTTON_LABELS[id]);
                    item.onClick(() => this.runToolbarAction(view, id, anchor));
                });
            }
            menu.addSeparator();
        }

        menu.addItem((item) => {
            item.setTitle("整理工具栏…");
            item.onClick(() => new ToolbarOrderModal(this.plugin.app, this.plugin).open());
        });

        menu.showAtPosition({
            x: anchor.getBoundingClientRect().left,
            y: anchor.getBoundingClientRect().top - 4,
        });
    }

    private detach(): void {
        this.toolbarEl?.remove();
        this.toolbarEl = null;
        this.attachedView = null;
    }
}
