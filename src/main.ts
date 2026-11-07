import { Editor, EventRef, MarkdownView, Plugin, TFile } from "obsidian";
import * as ObsidianApi from "obsidian";
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
    removeCallout,
    convertHtmlTableToMarkdown,
    toggleBold,
    flattenSelectionToBold,
    removeRedInSelection,
    toggleRedUnderline,
    toggleRedWavy,
} from "./editor-utils";
import { DEFAULT_SETTINGS, FormatHotkeysSettingTab, FormatHotkeysSettings, ToolbarButtonId } from "./settings";
import { EditorToolbarManager } from "./toolbar";
import { TyporaConfigModal } from "./typora-config-modal";
import { readViewState, applyViewState, statesEqual, EditorStateSnapshot } from "./editor-state";
import { applyTableStableStyle } from "./table-stable";
import { applyTyporaStyleVars, clearTyporaStyleVars, mergeTyporaStyle } from "./typora-style";
import { createParenListExtension, refreshParenListDecorations } from "./typora-paren-list";
import { createAsmHighlightExtension, refreshAsmHighlight, registerAsmPrismLanguages } from "./asm-highlight";
import { createHtmlStyleExtension, refreshHtmlStyleDecorations } from "./typora-html-style";
import {
    attachTableStripeObserver,
    refreshTableStripes,
    scheduleTableStripeRefresh,
} from "./typora-table-stripe";
import {
    attachOutlineMarkdownObserver,
    restoreOutlineMarkdown,
    scheduleOutlineMarkdownRefresh,
} from "./outline-markdown";

const RED_OPEN = '<font color="#ff0000">';
const RED_CLOSE = "</font>";

/**
 * 编辑进度保存/恢复（参考 MIT 协议插件 dy-sh/obsidian-remember-cursor-position 的成熟实现）：
 * - 保存：每 100ms 轮询当前文件的光标/滚动，变化即写入内存 db（任何时刻都最新）；
 * - 落盘：每 5s 周期写独立 json 文件，Obsidian 退出（quit 事件）与插件卸载时再强制写一次；
 * - 恢复：监听 file-open 事件，延迟等编辑器就绪后套用状态；1.5s 防重 guard 避免反复跳转；
 * - 从链接跳转（存在 .is-flashing 元素）时不覆盖目标位置。
 */
const CHECK_INTERVAL_MS = 100;
const DB_FLUSH_INTERVAL_MS = 5000;
const RESTORE_DELAY_MS = 100;
const RESTORE_GUARD_WINDOW_MS = 1500;
const LAYOUT_READY_RESTORE_DELAY = 600;

export default class FormatHotkeysPlugin extends Plugin {
    settings: FormatHotkeysSettings = DEFAULT_SETTINGS;
    private toolbarManager!: EditorToolbarManager;
    private tableStripeObserver?: MutationObserver;
    private outlineMarkdownObserver?: MutationObserver;

    private db: Record<string, EditorStateSnapshot> = {};
    private lastSavedDbJson = "";
    private dbPath = "";
    private lastLoadedFileName = "";
    private lastState: EditorStateSnapshot = {};
    private lastRestoredKey = "";
    private lastRestoredAt = 0;
    private loadingFile = false;

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
            id: "toggle-bold",
            name: "切换加粗",
            editorCallback: (editor: Editor) => toggleBold(editor),
        });

        this.addCommand({
            id: "flatten-to-bold",
            name: "变化改加粗",
            editorCallback: (editor: Editor) => flattenSelectionToBold(editor),
        });

        this.addCommand({
            id: "remove-red",
            name: "取消选区变红",
            editorCallback: (editor: Editor) => removeRedInSelection(editor),
        });

        this.addCommand({
            id: "toggle-red-underline",
            name: "切换红色下划线",
            editorCallback: (editor: Editor) => toggleRedUnderline(editor),
        });

        this.addCommand({
            id: "toggle-red-wavy",
            name: "切换红色波浪线",
            editorCallback: (editor: Editor) => toggleRedWavy(editor),
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
            hotkeys: [{ modifiers: ["Alt"], key: "`" }],
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
            id: "remove-callout",
            name: "取消选区 Callout",
            editorCallback: (editor: Editor) => removeCallout(editor),
        });

        this.addCommand({
            id: "html-table-to-md",
            name: "HTML 表格转 Markdown 表格",
            editorCallback: (editor: Editor) => convertHtmlTableToMarkdown(editor),
        });

        this.addCommand({
            id: "open-typora-config",
            name: "打开 Typora 配置",
            callback: () => new TyporaConfigModal(this.app, this).open(),
        });

        this.addSettingTab(new FormatHotkeysSettingTab(this.app, this));

        this.registerEditorExtension(createParenListExtension());
        this.registerEditorExtension(createAsmHighlightExtension());
        this.registerEditorExtension(createHtmlStyleExtension());
        void this.registerPrismAsmLanguages();

        this.toolbarManager = new EditorToolbarManager(this);
        this.toolbarManager.attach();

        // ---- 编辑进度保存/恢复（按文件记忆光标/滚动/选区，切换与关闭重开后恢复） ----
        this.dbPath = `${this.manifest.dir}/cursor-positions.json`;
        await this.loadDb();

        this.registerEvent(this.app.workspace.on("file-open", (file) => this.restoreState(file)));
        this.registerEvent(
            (this.app.workspace as unknown as { on: (e: "quit", cb: () => void) => EventRef }).on("quit", () => this.writeDb())
        );
        // 文件重命名/删除时同步迁移或清理位置记录
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (file.path !== oldPath) {
                    this.db[file.path] = this.db[oldPath];
                    delete this.db[oldPath];
                }
            })
        );
        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                delete this.db[file.path];
            })
        );

        // 保存：持续轮询当前文件位置；落盘：周期写 + 退出/卸载写
        this.registerInterval(window.setInterval(() => this.checkStateChanged(), CHECK_INTERVAL_MS));
        this.registerInterval(window.setInterval(() => this.writeDb(), DB_FLUSH_INTERVAL_MS));

        // 恢复：布局就绪后延迟强制恢复一次（覆盖 workspace 加载场景）
        this.app.workspace.onLayoutReady(() => {
            window.setTimeout(() => this.restoreState(), LAYOUT_READY_RESTORE_DELAY);
        });
        this.restoreState();

        this.applyTyporaMode();
        this.applyTableStable();
        this.setupTableStripeRefresh();
        this.setupOutlineMarkdown();
    }

    onunload(): void {
        this.writeDb();
        applyTableStableStyle(false);

        const bodyEl = document.body;
        bodyEl.removeClass("typora-mode-active");
        bodyEl.removeClass("typora-hide-syntax");
        clearTyporaStyleVars(bodyEl);
        this.tableStripeObserver?.disconnect();
        refreshTableStripes(this.app);
        this.outlineMarkdownObserver?.disconnect();
        restoreOutlineMarkdown();
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
        refreshAsmHighlight(this.app);
        refreshHtmlStyleDecorations(this.app);
        scheduleTableStripeRefresh(this.app);
    }

    /** 应用/移除表格编辑宽度稳定样式（设置开关切换时也调用） */
    applyTableStable(): void {
        applyTableStableStyle(this.settings.tableWidthStable);
    }

    /** 轮询：当前文件位置发生变化时写入内存 db */
    private checkStateChanged(): void {
        if (!this.settings.restoreEditorPosition) return;
        // 悬停预览窗口（Page preview / Hover Editor）是瞬态视图，绝不记录位置
        if (this.isHoverPopoverActive()) return;
        const fileName = this.app.workspace.getActiveFile()?.path;
        // 等待文件加载完成，且只记录当前正在浏览的文件
        if (!fileName || !this.lastLoadedFileName || fileName !== this.lastLoadedFileName || this.loadingFile) {
            return;
        }
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const st = readViewState(view);
        const hadPrior = Object.keys(this.lastState).length > 0;
        if (!hadPrior) {
            this.lastState = st;
            return;
        }
        if (!statesEqual(st, this.lastState)) {
            this.db[fileName] = { ...st, lastModified: Date.now() };
            this.lastState = st;
        }
    }

    /** 文件打开/激活时恢复其保存的进度 */
    private async restoreState(file?: TFile | null): Promise<void> {
        const fileName = this.app.workspace.getActiveFile()?.path;
        // 悬停预览窗口不恢复位置；若预览了某个文件，顺带清掉它的记录避免污染
        if (this.isHoverPopoverActive()) {
            if (fileName) delete this.db[fileName];
            return;
        }
        if (fileName && this.loadingFile && this.lastLoadedFileName === fileName) {
            return;
        }

        // 1.5s 防重 guard：同一个 leaf+file 刚恢复过就不再重复跳
        const leaf = this.app.workspace.getMostRecentLeaf();
        const leafId = (leaf as unknown as { id?: string }).id ?? "";
        const leafFile = (leaf?.getViewState().state as { file?: string } | null)?.file ?? "";
        const guardKey = `${leafId}:${leafFile}`;
        if (fileName && this.lastRestoredKey === guardKey && Date.now() - this.lastRestoredAt < RESTORE_GUARD_WINDOW_MS) {
            return;
        }

        this.loadingFile = true;
        if (this.lastLoadedFileName !== fileName) {
            this.lastState = {};
            this.lastLoadedFileName = fileName ?? "";
            let st: EditorStateSnapshot = {};
            if (fileName && this.settings.restoreEditorPosition) {
                st = this.db[fileName] ?? {};
                if (Object.keys(st).length > 0) {
                    await this.delay(RESTORE_DELAY_MS);
                    // 从链接/搜索跳转时 Obsidian 会高亮目标，此时不覆盖
                    const flashing = this.app.workspace.containerEl.querySelector(".is-flashing");
                    if (!flashing) {
                        await this.delay(10);
                        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (view) {
                            applyViewState(view, st);
                        }
                    }
                }
            }
            this.lastRestoredKey = guardKey;
            this.lastRestoredAt = Date.now();
            this.lastState = st;
        }
        this.loadingFile = false;
    }

    /** 从独立 json 文件读取历史进度 */
    private async loadDb(): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            if (await adapter.exists(this.dbPath)) {
                const data = await adapter.read(this.dbPath);
                this.db = JSON.parse(data) as Record<string, EditorStateSnapshot>;
            }
        } catch (e) {
            console.error("Format Hotkeys: 读取光标位置数据库失败", e);
            this.db = {};
        }
        // 清理已不存在文件的孤儿记录，避免数据库无限膨胀
        for (const key of Object.keys(this.db)) {
            if (!this.app.vault.getAbstractFileByPath(key)) {
                delete this.db[key];
            }
        }
        this.lastSavedDbJson = JSON.stringify(this.db);
    }

    /** 当前激活视图是否为悬停预览窗口（Page preview / Hover Editor 等瞬态视图） */
    private isHoverPopoverActive(): boolean {
        const container = this.app.workspace.getActiveViewOfType(MarkdownView)?.containerEl;
        if (!container) return false;
        return container.closest(".hover-popover") !== null || container.closest(".hover-editor") !== null;
    }

    /** 把内存 db 写入独立 json 文件（仅内容变化时写） */
    private async writeDb(): Promise<void> {
        try {
            const json = JSON.stringify(this.db);
            if (json === this.lastSavedDbJson) return;
            const adapter = this.app.vault.adapter;
            const parent = this.dbPath.substring(0, this.dbPath.lastIndexOf("/"));
            if (!(await adapter.exists(parent))) {
                await adapter.mkdir(parent);
            }
            await adapter.write(this.dbPath, json);
            this.lastSavedDbJson = json;
        } catch (e) {
            console.error("Format Hotkeys: 写入光标位置数据库失败", e);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private setupTableStripeRefresh(): void {
        this.registerEvent(
            this.app.workspace.on("layout-change", () => scheduleTableStripeRefresh(this.app))
        );
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => scheduleTableStripeRefresh(this.app))
        );
        this.app.workspace.onLayoutReady(() => {
            const workspaceEl = document.querySelector(".workspace");
            if (workspaceEl instanceof HTMLElement) {
                this.tableStripeObserver?.disconnect();
                this.tableStripeObserver = attachTableStripeObserver(this.app, workspaceEl);
            }
            scheduleTableStripeRefresh(this.app);
        });
    }

    private setupOutlineMarkdown(): void {
        this.registerEvent(this.app.workspace.on("layout-change", () => scheduleOutlineMarkdownRefresh()));
        this.registerEvent(this.app.workspace.on("active-leaf-change", () => scheduleOutlineMarkdownRefresh()));
        this.app.workspace.onLayoutReady(() => {
            const workspaceEl = document.querySelector(".workspace");
            if (workspaceEl instanceof HTMLElement) {
                this.outlineMarkdownObserver?.disconnect();
                this.outlineMarkdownObserver = attachOutlineMarkdownObserver(this.app, workspaceEl);
            }
            scheduleOutlineMarkdownRefresh();
        });
    }

    private async registerPrismAsmLanguages(): Promise<void> {
        try {
            const api = ObsidianApi as unknown as {
                loadPrism?: () => Promise<{ languages: Record<string, unknown> }>;
            };
            const prism =
                typeof api.loadPrism === "function"
                    ? await api.loadPrism()
                    : (window as unknown as { Prism?: { languages: Record<string, unknown> } }).Prism;
            if (prism?.languages) {
                registerAsmPrismLanguages(prism);
            }
        } catch {
            // Prism 不可用时源码视图仍由 CodeMirror 装饰高亮
        }
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
            "bold",
            "flatten-to-bold",
            "remove-red",
            "red-underline",
            "red-wavy",
            "callout",
            "remove-callout",
            "table-to-md",
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
