import { Editor, Plugin } from "obsidian";
import {
    toggleHeading,
    toggleWrap,
    removeBlankLinesInSelection,
    insertTextAtCursor,
    toggleCodeBlock,
    convertBlockMathToInline,
    convertBlockMathToInlineAndJoin,
    normalizePunctuation,
    wrapCallout,
} from "./editor-utils";
import { DEFAULT_SETTINGS, FormatHotkeysSettingTab, FormatHotkeysSettings, ToolbarButtonId } from "./settings";
import { EditorToolbarManager } from "./toolbar";
import { TyporaConfigModal } from "./typora-config-modal";
import { applyTyporaStyleVars, clearTyporaStyleVars, mergeTyporaStyle } from "./typora-style";
import { createParenListExtension, refreshParenListDecorations } from "./typora-paren-list";

const RED_OPEN = '<font color="#ff0000">';
const RED_CLOSE = "</font>";

export default class FormatHotkeysPlugin extends Plugin {
    settings: FormatHotkeysSettings = DEFAULT_SETTINGS;
    private toolbarManager!: EditorToolbarManager;

    async onload() {
        await this.loadSettings();

        for (let level = 1; level <= 5; level++) {
            this.addCommand({
                id: `set-heading-${level}`,
                name: `设为 ${level} 级标题`,
                editorCallback: (editor: Editor) => toggleHeading(editor, level),
                hotkeys: [{ modifiers: ["Mod"], key: String(level) }],
            });
        }

        this.addCommand({
            id: "toggle-underline",
            name: "切换下划线",
            editorCallback: (editor: Editor) => toggleWrap(editor, "<u>", "</u>"),
            hotkeys: [{ modifiers: ["Mod"], key: "u" }],
        });

        this.addCommand({
            id: "toggle-red",
            name: "切换红色文字",
            editorCallback: (editor: Editor) => toggleWrap(editor, RED_OPEN, RED_CLOSE),
            hotkeys: [{ modifiers: ["Mod"], key: "r" }],
        });

        this.addCommand({
            id: "toggle-code-block",
            name: "创建代码块",
            editorCallback: (editor: Editor) =>
                toggleCodeBlock(editor, this.settings.defaultCodeLanguage),
            hotkeys: [{ modifiers: ["Mod", "Alt"], key: "d" }],
        });

        this.addCommand({
            id: "remove-blank-lines",
            name: "去除空格行",
            editorCallback: (editor: Editor) => removeBlankLinesInSelection(editor),
        });

        this.addCommand({
            id: "insert-dunhao",
            name: "插入顿号",
            editorCallback: (editor: Editor) => insertTextAtCursor(editor, "、"),
        });

        this.addCommand({
            id: "block-math-to-inline",
            name: "块级公式转行内公式",
            editorCallback: (editor: Editor) => convertBlockMathToInline(editor),
        });

        this.addCommand({
            id: "block-math-to-inline-join",
            name: "块级公式转行内并上移一行",
            editorCallback: (editor: Editor) => convertBlockMathToInlineAndJoin(editor),
        });

        this.addCommand({
            id: "normalize-punctuation",
            name: "中文标点转英文标点",
            editorCallback: (editor: Editor) => normalizePunctuation(editor),
        });

        this.addCommand({
            id: "wrap-callout-tip",
            name: "添加 Callout 提示块",
            editorCallback: (editor: Editor) => wrapCallout(editor, "tip"),
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
    }

    onunload(): void {
        const bodyEl = document.body;
        bodyEl.removeClass("typora-mode-active");
        bodyEl.removeClass("typora-hide-syntax");
        clearTyporaStyleVars(bodyEl);
    }

    /**
     * 应用 Typora 显示模式：写入自定义 CSS 变量，并切换 body 标记类
     */
    applyTyporaMode(): void {
        const bodyEl = document.body;
        applyTyporaStyleVars(bodyEl, this.settings.typora);
        bodyEl.toggleClass("typora-mode-active", this.settings.typoraMode);
        bodyEl.toggleClass("typora-hide-syntax", this.settings.typoraMode && this.settings.typora.hideSyntax);
        refreshParenListDecorations(this.app);
    }

    async loadSettings() {
        const data = (await this.loadData()) as Partial<FormatHotkeysSettings> | null;
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...(data ?? {}),
            typora: mergeTyporaStyle(data?.typora),
        };
        if (!Array.isArray(this.settings.codeLanguages) || this.settings.codeLanguages.length === 0) {
            this.settings.codeLanguages = [...DEFAULT_SETTINGS.codeLanguages];
        }

        // 兼容旧按钮 id
        if (Array.isArray(this.settings.toolbarButtonOrder)) {
            this.settings.toolbarButtonOrder = this.settings.toolbarButtonOrder.map((id) =>
                (id as string) === "callout-tip" ? "callout" : id
            ) as ToolbarButtonId[];
        }

        const validIds = new Set<ToolbarButtonId>([
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
        } else {
            this.settings.toolbarButtonOrder = this.settings.toolbarButtonOrder.filter((id) =>
                validIds.has(id)
            );
            for (const id of DEFAULT_SETTINGS.toolbarButtonOrder) {
                if (!this.settings.toolbarButtonOrder.includes(id)) {
                    this.settings.toolbarButtonOrder.push(id);
                }
            }
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.toolbarManager.refresh();
    }

    async saveTyporaSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
