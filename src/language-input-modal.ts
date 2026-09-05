import { App, Modal } from "obsidian";

export class LanguageInputModal extends Modal {
    private resolve: (value: string | null) => void;
    private settled = false;

    constructor(app: App) {
        super(app);
        this.resolve = () => undefined;
    }

    openAndGetValue(): Promise<string | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText("添加代码语言");
        contentEl.createEl("p", { text: "例如：java、python、typescript" });

        const input = contentEl.createEl("input", {
            type: "text",
            cls: "format-hotkeys-lang-input",
        });
        input.placeholder = "java";
        input.focus();

        const row = contentEl.createDiv({ cls: "format-hotkeys-lang-actions" });
        row.createEl("button", { text: "确定", cls: "mod-cta" }).addEventListener("click", () => {
            this.closeWith(input.value.trim());
        });
        row.createEl("button", { text: "取消" }).addEventListener("click", () => {
            this.closeWith(null);
        });

        input.addEventListener("keydown", (ev: KeyboardEvent) => {
            if (ev.key === "Enter") {
                this.closeWith(input.value.trim());
            }
            if (ev.key === "Escape") {
                this.closeWith(null);
            }
        });
    }

    private closeWith(value: string | null): void {
        if (this.settled) return;
        this.settled = true;
        this.resolve(value);
        this.close();
    }

    onClose(): void {
        if (!this.settled) {
            this.settled = true;
            this.resolve(null);
        }
        this.contentEl.empty();
    }
}
