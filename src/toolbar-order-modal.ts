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

    constructor(app: App, private plugin: FormatHotkeysPlugin) {
        super(app);
        this.visible = [...plugin.settings.toolbarButtonOrder];
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText("整理工具栏");
        contentEl.createEl("p", {
            text: "勾选显示在工具栏上的按钮，可用 ↑↓ 调整顺序；未勾选的会出现在「更多」菜单里。顿号「、」已改用 Alt+`，不再占用按钮。",
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
            const controls = el.createDiv({ cls: "format-hotkeys-order-controls" });

            const upBtn = controls.createEl("button", { text: "↑", cls: "format-hotkeys-order-btn" });
            upBtn.disabled = visibleIndex <= 0;
            upBtn.addEventListener("click", () => {
                if (visibleIndex <= 0) return;
                [this.visible[visibleIndex - 1], this.visible[visibleIndex]] = [
                    this.visible[visibleIndex],
                    this.visible[visibleIndex - 1],
                ];
                this.renderList(container);
            });

            const downBtn = controls.createEl("button", { text: "↓", cls: "format-hotkeys-order-btn" });
            downBtn.disabled = visibleIndex >= this.visible.length - 1;
            downBtn.addEventListener("click", () => {
                if (visibleIndex >= this.visible.length - 1) return;
                [this.visible[visibleIndex], this.visible[visibleIndex + 1]] = [
                    this.visible[visibleIndex + 1],
                    this.visible[visibleIndex],
                ];
                this.renderList(container);
            });
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
