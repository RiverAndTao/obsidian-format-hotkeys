import { Editor, EventRef, MarkdownView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
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
    convertSelectionToFraction,
} from "./editor-utils";
import {
    ALL_TOOLBAR_BUTTONS,
    DEFAULT_SETTINGS,
    FormatHotkeysSettingTab,
    FormatHotkeysSettings,
    TOOLBAR_LAYOUT_VERSION,
    ToolbarButtonId,
} from "./settings";
import { EditorToolbarManager } from "./toolbar";
import { TyporaConfigModal } from "./typora-config-modal";
import { readViewState, applyViewState, statesEqual, EditorStateSnapshot } from "./editor-state";
import { applyTableStableStyle } from "./table-stable";
import { applyAnnoPalette, clearAnnoPalette, normalizeAnnoPalette } from "./anno-palette";
import { applyTyporaStyleVars, clearTyporaStyleVars, mergeTyporaStyle } from "./typora-style";
import { createAsmHighlightExtension, refreshAsmHighlight, registerAsmPrismLanguages } from "./asm-highlight";
import { createCppHighlightExtension, registerCppPrismLanguages } from "./cpp-highlight";
import { createSqlHighlightExtension, refreshSqlHighlight, registerSqlPrismLanguages } from "./sql-highlight";
import { createJspHighlightExtension, registerJspPrismLanguages } from "./jsp-highlight";
import {
    addAnnotationMenuItems,
    createAnnotationExtension,
    destroyAnnotationTooltip,
    editAnnotationAtCursor,
    bindAnnoPalette,
    installAnnotationHover,
    promptAnnotation,
    removeAnnotationAtCursor,
} from "./annotation";
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
import { addBlockLinkMenuItems, copyBlockReference } from "./block-link";

const RED_OPEN = '<font color="#ff0000">';
const RED_CLOSE = "</font>";

/**
 * 编辑进度保存/恢复（参考 MIT 协议插件 dy-sh/obsidian-remember-cursor-position 的成熟实现）：
 * - 保存：每 100ms 轮询当前文件的光标/滚动，变化即写入内存 db（任何时刻都最新）；
 * - 落盘：每 5s 周期写独立 json 文件，Obsidian 退出（quit 事件）与插件卸载时再强制写一次；
 * - 恢复：监听 file-open 事件，延迟等编辑器就绪后套用状态；
 * - 会话内再按“窗格(leaf)”记一层，双栏打开同一/不同文件时互不覆盖；
 * - 恢复是异步的：用 token + 视图校验，快速连开多个 md 或先开脑图再开 md 时，
 *   过期的那次恢复会被丢弃，绝不会把 A 文件的位置套到 B 文件的视图上；
 * - 从链接跳转（存在 .is-flashing 元素）时不覆盖目标位置；悬停预览不记录也不恢复。
 */
const CHECK_INTERVAL_MS = 100;
const DB_FLUSH_INTERVAL_MS = 5000;
const RESTORE_DELAY_MS = 100;
const LAYOUT_READY_RESTORE_DELAY = 600;

export default class FormatHotkeysPlugin extends Plugin {
    settings: FormatHotkeysSettings = DEFAULT_SETTINGS;
    private toolbarManager!: EditorToolbarManager;
    private tableStripeObserver?: MutationObserver;
    private outlineMarkdownObserver?: MutationObserver;

    private db: Record<string, EditorStateSnapshot> = {};
    private lastSavedDbJson = "";
    private dbPath = "";
    /** 会话内按窗格(leaf)记忆：同一文件开在两个窗格时不互相覆盖 */
    private paneState = new Map<string, { path: string; state: EditorStateSnapshot }>();
    /** 窗格级恢复序号：序号变了说明有更新的打开/恢复请求，旧的这次作废 */
    private paneRestoreToken = new Map<string, number>();
    /** 正在恢复的文件：这段时间不要把“还在顶部”的光标写回数据库 */
    private pendingRestorePaths = new Set<string>();
    private leafIds = new WeakMap<WorkspaceLeaf, string>();
    private leafSeq = 0;

    async onload() {
        await this.loadSettings();
        bindAnnoPalette(() => this.settings.annoPalette);
        applyAnnoPalette(this.settings.annoPalette);

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
            id: "to-fraction",
            name: "转为 LaTeX 分数",
            editorCallback: (editor: Editor) => convertSelectionToFraction(editor),
        });

        this.addCommand({
            id: "add-annotation",
            name: "高亮并批注",
            editorCallback: (editor: Editor) => promptAnnotation(this.app, editor),
            hotkeys: [{ modifiers: ["Mod", "Alt"], key: "h" }],
        });

        this.addCommand({
            id: "edit-annotation",
            name: "编辑批注",
            editorCallback: (editor: Editor) => editAnnotationAtCursor(this.app, editor),
        });

        this.addCommand({
            id: "remove-annotation",
            name: "移除批注",
            editorCallback: (editor: Editor) => removeAnnotationAtCursor(editor),
        });

        this.addCommand({
            id: "copy-block-link",
            name: "复制块链接",
            editorCallback: (editor, view) => {
                if (!view.file) return;
                void copyBlockReference(this.app, editor, view.file, "link");
            },
        });

        this.addCommand({
            id: "copy-block-embed",
            name: "复制嵌入链接",
            editorCallback: (editor, view) => {
                if (!view.file) return;
                void copyBlockReference(this.app, editor, view.file, "embed");
            },
        });

        this.addCommand({
            id: "copy-block-alias-link",
            name: "复制别名链接",
            editorCallback: (editor, view) => {
                if (!view.file) return;
                void copyBlockReference(this.app, editor, view.file, "alias");
            },
        });

        this.addCommand({
            id: "open-typora-config",
            name: "打开 Typora 配置",
            callback: () => new TyporaConfigModal(this.app, this).open(),
        });

        this.addSettingTab(new FormatHotkeysSettingTab(this.app, this));

        this.registerEditorExtension(createAsmHighlightExtension());
        this.registerEditorExtension(createCppHighlightExtension());
        this.registerEditorExtension(createSqlHighlightExtension());
        this.registerEditorExtension(createJspHighlightExtension());
        this.registerEditorExtension(createAnnotationExtension());
        this.registerEditorExtension(createHtmlStyleExtension());
        void this.registerPrismExtraLanguages();

        this.toolbarManager = new EditorToolbarManager(this);
        this.toolbarManager.attach();

        // ---- 编辑进度保存/恢复（按文件记忆光标/滚动/选区，切换与关闭重开后恢复） ----
        this.dbPath = `${this.manifest.dir}/cursor-positions.json`;
        await this.loadDb();

        this.registerEvent(this.app.workspace.on("file-open", (file) => this.restoreState(file)));
        this.registerEvent(this.app.workspace.on("layout-change", () => this.prunePaneState()));
        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu, editor, view) => {
                addAnnotationMenuItems(menu, this.app, editor);
                if (!view.file) return;
                menu.addSeparator();
                addBlockLinkMenuItems(menu, this.app, editor, view.file);
            })
        );
        this.registerEvent(
            (this.app.workspace as unknown as { on: (e: "quit", cb: () => void) => EventRef }).on("quit", () => this.writeDb())
        );
        // 文件重命名/删除时同步迁移或清理位置记录
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (file.path === oldPath) return;
                if (Object.prototype.hasOwnProperty.call(this.db, oldPath)) {
                    this.db[file.path] = this.db[oldPath];
                    delete this.db[oldPath];
                }
                for (const entry of this.paneState.values()) {
                    if (entry.path === oldPath) entry.path = file.path;
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
            window.setTimeout(
                () => this.restoreState(this.app.workspace.getActiveFile()),
                LAYOUT_READY_RESTORE_DELAY
            );
        });
        this.restoreState(this.app.workspace.getActiveFile());

        installAnnotationHover(this);
        this.applyTyporaMode();
        this.applyTableStable();
        this.setupTableStripeRefresh();
        this.setupOutlineMarkdown();
    }

    onunload(): void {
        destroyAnnotationTooltip();
        clearAnnoPalette();
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
        refreshAsmHighlight(this.app);
        refreshSqlHighlight(this.app);
        refreshHtmlStyleDecorations(this.app);
        scheduleTableStripeRefresh(this.app);
    }

    /** 应用/移除表格编辑宽度稳定样式（设置开关切换时也调用） */
    applyTableStable(): void {
        applyTableStableStyle(this.settings.tableWidthStable);
    }

    /** 给 leaf 分配稳定的会话内 id（不依赖 Obsidian 内部字段） */
    private leafKey(leaf: WorkspaceLeaf): string {
        let id = this.leafIds.get(leaf);
        if (!id) {
            this.leafSeq += 1;
            id = `leaf${this.leafSeq}`;
            this.leafIds.set(leaf, id);
        }
        return id;
    }

    private leafFilePath(leaf: WorkspaceLeaf): string {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file) return view.file.path;
        const state = leaf.getViewState().state as { file?: string } | null;
        return state?.file ?? "";
    }

    /**
     * 刚打开的文件所在窗格。
     * 活动窗格优先：同一文件开了两栏时，不能套到上一个焦点窗格上。
     */
    private findLeafForPath(path: string): WorkspaceLeaf | null {
        const active = this.app.workspace.activeLeaf;
        if (active && this.leafFilePath(active) === path) return active;

        let fresh: WorkspaceLeaf | null = null;
        let matched: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (this.leafFilePath(leaf) !== path) return;
            if (!matched) matched = leaf;
            const pane = this.paneState.get(this.leafKey(leaf));
            if (!fresh && (!pane || pane.path !== path)) fresh = leaf;
        });
        return fresh ?? matched;
    }

    /** 某个 MarkdownView 所在的 leaf */
    private leafOfView(view: MarkdownView): WorkspaceLeaf | null {
        let found: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (!found && leaf.view === view) found = leaf;
        });
        return found;
    }

    /** 悬停预览（Page preview / Hover Editor）等瞬态视图：既不记录也不恢复 */
    private isTransientView(view: MarkdownView): boolean {
        const container = view.containerEl;
        return Boolean(container.closest(".hover-popover") || container.closest(".hover-editor"));
    }

    /** 关闭窗格后清理该窗格的会话记录，避免表无限增长 */
    private prunePaneState(): void {
        const alive = new Set<string>();
        this.app.workspace.iterateAllLeaves((leaf) => alive.add(this.leafKey(leaf)));
        for (const key of [...this.paneState.keys()]) {
            if (!alive.has(key)) this.paneState.delete(key);
        }
        for (const key of [...this.paneRestoreToken.keys()]) {
            if (!alive.has(key)) this.paneRestoreToken.delete(key);
        }
    }

    private stateForPane(key: string, path: string): EditorStateSnapshot {
        const pane = this.paneState.get(key);
        if (pane && pane.path === path) return pane.state;
        return this.db[path] ?? {};
    }

    private hasRestorableState(state: EditorStateSnapshot): boolean {
        return Boolean(state.cursor) || state.scroll !== undefined;
    }

    /** 轮询：当前文件位置发生变化时写入内存 db */
    private checkStateChanged(): void {
        if (!this.settings.restoreEditorPosition) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return;
        // 悬停预览窗口（Page preview / Hover Editor）是瞬态视图，绝不记录位置
        if (this.isTransientView(view)) return;
        const leaf = this.leafOfView(view);
        if (!leaf) return;
        const key = this.leafKey(leaf);
        // 该窗格正在恢复位置：跳过，否则会把“恢复前的顶部位置”写回数据库
        if (this.paneRestoreToken.has(key)) return;

        const path = view.file.path;
        if (this.pendingRestorePaths.has(path)) return;
        const st = readViewState(view);
        const prev = this.paneState.get(key);
        this.paneState.set(key, { path, state: st });
        // 同一窗格同一文件、位置没变 → 不需要写库
        if (prev && prev.path === path && statesEqual(prev.state, st)) return;
        this.db[path] = { ...st, lastModified: Date.now() };
    }

    /**
     * 文件打开时恢复该窗格的进度。
     * 延迟套用前会再核对窗格和文件路径。
     * 快速连开两个 md，或先开脑图再开 md 时，过期的那次恢复会被丢掉。
     */
    private restoreState(file?: TFile | null): void {
        if (!this.settings.restoreEditorPosition) return;
        const path = file?.path;
        if (!path) return;
        this.pendingRestorePaths.add(path);

        const leaf = this.findLeafForPath(path);
        if (!leaf) {
            // 窗格状态可能还没切过来，稍后再认一次
            window.setTimeout(() => {
                const later = this.findLeafForPath(path);
                if (!later || (later.view instanceof MarkdownView && this.isTransientView(later.view))) {
                    this.pendingRestorePaths.delete(path);
                    return;
                }
                this.scheduleRestore(later, path);
            }, RESTORE_DELAY_MS);
            return;
        }
        if (leaf.view instanceof MarkdownView && this.isTransientView(leaf.view)) {
            this.pendingRestorePaths.delete(path);
            return;
        }
        this.scheduleRestore(leaf, path);
    }

    private scheduleRestore(leaf: WorkspaceLeaf, path: string): void {
        const key = this.leafKey(leaf);
        const token = (this.paneRestoreToken.get(key) ?? 0) + 1;
        this.paneRestoreToken.set(key, token);
        window.setTimeout(() => this.applyScheduledRestore(leaf, key, path, token), RESTORE_DELAY_MS);
    }

    private applyScheduledRestore(leaf: WorkspaceLeaf, key: string, path: string, token: number): void {
        if (this.paneRestoreToken.get(key) !== token) return;
        this.paneRestoreToken.delete(key);
        this.pendingRestorePaths.delete(path);

        const view = leaf.view;
        // 脑图 / Canvas / PDF 等没有文本光标，清掉该窗格记录
        if (!(view instanceof MarkdownView)) {
            this.paneState.delete(key);
            return;
        }
        if ((view.file?.path ?? "") !== path || this.isTransientView(view)) return;
        // 从链接/搜索跳转时 Obsidian 会高亮目标，此时不覆盖
        if (view.containerEl.querySelector(".is-flashing")) return;

        const target = this.stateForPane(key, path);
        if (!this.hasRestorableState(target)) {
            this.paneState.set(key, { path, state: {} });
            return;
        }
        applyViewState(view, target);
        this.paneState.set(key, { path, state: target });
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

    private async registerPrismExtraLanguages(): Promise<void> {
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
                registerCppPrismLanguages(prism);
                registerSqlPrismLanguages(prism);
                registerJspPrismLanguages(prism);
            }
        } catch {
            // Prism 不可用时源码视图仍由 CodeMirror 装饰高亮
        }
    }

    async loadSettings() {
        const data = (await this.loadData()) as Partial<FormatHotkeysSettings> | null;
        // 必须以磁盘上的版本为准；缺省视为 0，才能触发精简工具栏迁移
        const layoutVersion = Number(data?.toolbarLayoutVersion ?? 0);

        this.settings = {
            ...DEFAULT_SETTINGS,
            ...(data ?? {}),
            typora: mergeTyporaStyle(data?.typora),
        };
        if (!Array.isArray(this.settings.codeLanguages) || this.settings.codeLanguages.length === 0) {
            this.settings.codeLanguages = [...DEFAULT_SETTINGS.codeLanguages];
        }
        this.settings.annoPalette = normalizeAnnoPalette(data?.annoPalette);

        // 兼容旧按钮 id；顿号已改 Alt+`，从工具栏移除
        if (Array.isArray(this.settings.toolbarButtonOrder)) {
            this.settings.toolbarButtonOrder = this.settings.toolbarButtonOrder
                .map((id) => ((id as string) === "callout-tip" ? "callout" : id))
                .filter((id) => (id as string) !== "dunhao") as ToolbarButtonId[];
        }

        const validIds = new Set<ToolbarButtonId>(ALL_TOOLBAR_BUTTONS);

        // 版本 < 2：一次性切到精简默认。之后的版本只追加新按钮，避免打乱已有排序。
        const previousLayout = layoutVersion;
        if (
            !Array.isArray(this.settings.toolbarButtonOrder) ||
            this.settings.toolbarButtonOrder.length === 0 ||
            previousLayout < 2
        ) {
            this.settings.toolbarButtonOrder = [...DEFAULT_SETTINGS.toolbarButtonOrder];
        } else {
            this.settings.toolbarButtonOrder = this.settings.toolbarButtonOrder.filter((id) =>
                validIds.has(id)
            );
            if (this.settings.toolbarButtonOrder.length === 0) {
                this.settings.toolbarButtonOrder = [...DEFAULT_SETTINGS.toolbarButtonOrder];
            } else if (previousLayout < TOOLBAR_LAYOUT_VERSION) {
                for (const id of ["to-fraction", "annotate"] as ToolbarButtonId[]) {
                    if (!this.settings.toolbarButtonOrder.includes(id)) {
                        this.settings.toolbarButtonOrder.push(id);
                    }
                }
            }
        }
        if (previousLayout < TOOLBAR_LAYOUT_VERSION && !this.settings.codeLanguages.includes("jsp")) {
            this.settings.codeLanguages.push("jsp");
        }
        this.settings.toolbarLayoutVersion = TOOLBAR_LAYOUT_VERSION;
        if (previousLayout < TOOLBAR_LAYOUT_VERSION) {
            await this.saveData(this.settings);
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        applyAnnoPalette(this.settings.annoPalette);
        this.toolbarManager.refresh();
    }

    async saveTyporaSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
