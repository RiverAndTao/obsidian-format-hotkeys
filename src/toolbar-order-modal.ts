import { App, Modal, Setting } from "obsidian";
import type FormatHotkeysPlugin from "./main";
import {
    ALL_TOOLBAR_BUTTONS,
    DEFAULT_SETTINGS,
    TOOLBAR_BUTTON_LABELS,
    ToolbarButtonId,
} from "./settings";

export class ToolbarOrderModal extends Modal {
    private visible: ToolbarButtonId[];
    /** 正在拖拽的行对应的 visible 下标 */
    private dragIndex: number | null = null;

    constructor(app: App, private plugin: FormatHotkeysPlugin) {
        super(app);
        this.visible = [...plugin.settings.toolbarButtonOrder];
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText("整理工具栏");
        contentEl.createEl("p", {
            text: "勾选显示在工具栏上的按钮，按住行拖拽可调整顺序；未勾选的会出现在「更多」菜单里。顿号「、」已改用 Alt+`，不再占用按钮。",
            cls: "format-hotkeys-order-desc",
        });

        const listEl = contentEl.createDiv({ cls: "format-hotkeys-order-list" });
        this.renderList(listEl);

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("恢复默认").onClick(() => {
                    this.visible = [...DEFAULT_SETTINGS.toolbarButtonOrder];
                    this.renderList(listEl);
                })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("完成")
                    .setCta()
                    .onClick(async () => {
                        this.plugin.settings.toolbarButtonOrder = [...this.visible];
                        await this.plugin.saveSettings();
                        this.close();
                    })
            );
    }

    private renderList(container: HTMLElement): void {
        container.empty();

        const hidden = ALL_TOOLBAR_BUTTONS.filter((id) => !this.visible.includes(id));
        const rows: { id: ToolbarButtonId; shown: boolean }[] = [
            ...this.visible.map((id) => ({ id, shown: true })),
            ...hidden.map((id) => ({ id, shown: false })),
        ];

        rows.forEach((row) => {
            const el = container.createDiv({ cls: "format-hotkeys-order-row" });

            const check = el.createEl("input", { type: "checkbox", cls: "format-hotkeys-order-check" });
            check.checked = row.shown;
            check.addEventListener("change", () => {
                if (check.checked) {
                    if (!this.visible.includes(row.id)) this.visible.push(row.id);
                } else {
                    this.visible = this.visible.filter((id) => id !== row.id);
                }
                this.renderList(container);
            });

            el.createSpan({ text: TOOLBAR_BUTTON_LABELS[row.id], cls: "format-hotkeys-order-label" });

            if (!row.shown) {
                el.createSpan({ text: "更多", cls: "format-hotkeys-order-badge" });
                return;
            }

            const visibleIndex = this.visible.indexOf(row.id);

            // 拖拽把手：整行都可拖，把手只是视觉提示
            const grip = el.createSpan({ text: "≡", cls: "format-hotkeys-order-grip" });
            grip.setAttr("aria-hidden", "true");
            grip.setAttr("title", "拖拽调整顺序");

            el.addClass("is-draggable");
            el.draggable = true;

            el.addEventListener("dragstart", (evt) => {
                this.dragIndex = visibleIndex;
                el.addClass("is-dragging");
                if (evt.dataTransfer) {
                    evt.dataTransfer.effectAllowed = "move";
                    // 某些平台必须写点数据才会触发 drop
                    evt.dataTransfer.setData("text/plain", row.id);
                }
            });

            el.addEventListener("dragend", () => {
                this.dragIndex = null;
                el.removeClass("is-dragging");
                this.clearDropMarks(container);
            });

            el.addEventListener("dragover", (evt) => {
                if (this.dragIndex === null || this.dragIndex === visibleIndex) return;
                evt.preventDefault();
                if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
                const rect = el.getBoundingClientRect();
                const after = evt.clientY > rect.top + rect.height / 2;
                this.clearDropMarks(container);
                el.addClass(after ? "drop-after" : "drop-before");
            });

            el.addEventListener("drop", (evt) => {
                evt.preventDefault();
                const from = this.dragIndex;
                const rect = el.getBoundingClientRect();
                const after = evt.clientY > rect.top + rect.height / 2;
                this.clearDropMarks(container);
                this.dragIndex = null;
                if (from === null || from === visibleIndex) return;

                // 先把“插入到目标行前/后”的位置换算成移除源行之后的下标
                let insertAt = visibleIndex + (after ? 1 : 0);
                if (from < insertAt) insertAt -= 1;
                const moved = this.visible.splice(from, 1)[0];
                this.visible.splice(insertAt, 0, moved);
                this.renderList(container);
            });
        });
    }

    private clearDropMarks(container: HTMLElement): void {
        container.querySelectorAll<HTMLElement>(".drop-before, .drop-after").forEach((el) => {
            el.removeClass("drop-before");
            el.removeClass("drop-after");
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
