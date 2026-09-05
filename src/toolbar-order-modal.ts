import { App, Modal, Setting } from "obsidian";
import type FormatHotkeysPlugin from "./main";
import { TOOLBAR_BUTTON_LABELS, ToolbarButtonId } from "./settings";

export class ToolbarOrderModal extends Modal {
    private order: ToolbarButtonId[];

    constructor(app: App, private plugin: FormatHotkeysPlugin) {
        super(app);
        this.order = [...plugin.settings.toolbarButtonOrder];
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText("编辑按钮顺序");
        contentEl.createEl("p", {
            text: "调整工具栏按钮的显示顺序（「…」按钮始终在最右侧）",
            cls: "format-hotkeys-order-desc",
        });

        const listEl = contentEl.createDiv({ cls: "format-hotkeys-order-list" });
        this.renderList(listEl);

        new Setting(contentEl).addButton((btn) =>
            btn.setButtonText("完成").setCta().onClick(async () => {
                this.plugin.settings.toolbarButtonOrder = [...this.order];
                await this.plugin.saveSettings();
                this.close();
            })
        );
    }

    private renderList(container: HTMLElement): void {
        container.empty();

        this.order.forEach((id, index) => {
            const row = container.createDiv({ cls: "format-hotkeys-order-row" });
            row.createSpan({ text: TOOLBAR_BUTTON_LABELS[id], cls: "format-hotkeys-order-label" });

            const controls = row.createDiv({ cls: "format-hotkeys-order-controls" });

            const upBtn = controls.createEl("button", { text: "↑", cls: "format-hotkeys-order-btn" });
            upBtn.disabled = index === 0;
            upBtn.addEventListener("click", () => {
                if (index === 0) return;
                [this.order[index - 1], this.order[index]] = [this.order[index], this.order[index - 1]];
                this.renderList(container);
            });

            const downBtn = controls.createEl("button", { text: "↓", cls: "format-hotkeys-order-btn" });
            downBtn.disabled = index === this.order.length - 1;
            downBtn.addEventListener("click", () => {
                if (index === this.order.length - 1) return;
                [this.order[index], this.order[index + 1]] = [this.order[index + 1], this.order[index]];
                this.renderList(container);
            });
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
