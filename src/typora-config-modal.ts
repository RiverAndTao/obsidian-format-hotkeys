import { App, Modal } from "obsidian";
import type FormatHotkeysPlugin from "./main";
import { TyporaSettingsPanel } from "./typora-settings-ui";

export class TyporaConfigModal extends Modal {
    constructor(app: App, private plugin: FormatHotkeysPlugin) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass("format-hotkeys-typora-config-modal");
        this.titleEl.setText("Typora 配置");
        this.renderBody();
    }

    onClose(): void {
        this.contentEl.empty();
        this.modalEl.removeClass("format-hotkeys-typora-config-modal");
    }

    private renderBody(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("format-hotkeys-typora-modal");
        new TyporaSettingsPanel(this.plugin, contentEl, () => this.renderBody()).render();
    }
}
