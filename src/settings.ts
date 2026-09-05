import { App, PluginSettingTab, Setting } from "obsidian";
import type FormatHotkeysPlugin from "./main";
import { DEFAULT_TYPORA_STYLE, TyporaStyleSettings, cloneTyporaStyle } from "./typora-style";
import { TyporaSettingsPanel } from "./typora-settings-ui";

export type ToolbarButtonId =
    | "remove-blank-lines"
    | "dunhao"
    | "code-language"
    | "block-math-to-inline"
    | "block-math-to-inline-join"
    | "normalize-punctuation"
    | "typora-mode"
    | "typora-config"
    | "callout";

export interface FormatHotkeysSettings {
    defaultCodeLanguage: string;
    codeLanguages: string[];
    toolbarButtonOrder: ToolbarButtonId[];
    typoraMode: boolean;
    typora: TyporaStyleSettings;
}

export const DEFAULT_SETTINGS: FormatHotkeysSettings = {
    defaultCodeLanguage: "",
    codeLanguages: ["java", "python", "javascript", "typescript", "bash", ""],
    toolbarButtonOrder: [
        "typora-mode",
        "typora-config",
        "callout",
        "remove-blank-lines",
        "dunhao",
        "code-language",
        "block-math-to-inline",
        "block-math-to-inline-join",
        "normalize-punctuation",
    ],
    typoraMode: false,
    typora: cloneTyporaStyle(DEFAULT_TYPORA_STYLE),
};

export const TOOLBAR_BUTTON_LABELS: Record<ToolbarButtonId, string> = {
    "remove-blank-lines": "去除空格行",
    dunhao: "、",
    "code-language": "代码语言",
    "block-math-to-inline": "公式转行内",
    "block-math-to-inline-join": "公式转行内换行",
    "normalize-punctuation": "符号格式化",
    "typora-mode": "Typora 模式",
    "typora-config": "Typora配置",
    callout: "Tips",
};

export function formatLanguageLabel(language: string): string {
    return language.trim() === "" ? "无" : language;
}

export class FormatHotkeysSettingTab extends PluginSettingTab {
    plugin: FormatHotkeysPlugin;

    constructor(app: App, plugin: FormatHotkeysPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Format Hotkeys 设置" });
        containerEl.createEl("h3", { text: "Typora 模式" });
        new TyporaSettingsPanel(this.plugin, containerEl, () => this.display()).render();

        new Setting(containerEl)
            .setName("默认代码语言")
            .setDesc("Ctrl+Alt+D 创建代码块时使用的语言标识")
            .addText((text) =>
                text
                    .setPlaceholder("例如 java")
                    .setValue(this.plugin.settings.defaultCodeLanguage)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultCodeLanguage = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl("h3", { text: "代码语言列表" });
        containerEl.createEl("p", {
            text: "工具栏「代码语言」按钮中显示的可选语言。留空表示无语言标识。",
            cls: "setting-item-description",
        });

        this.plugin.settings.codeLanguages.forEach((lang, index) => {
            new Setting(containerEl)
                .setName(formatLanguageLabel(lang))
                .addText((text) =>
                    text.setValue(lang).onChange(async (value) => {
                        this.plugin.settings.codeLanguages[index] = value.trim();
                        if (this.plugin.settings.defaultCodeLanguage === lang) {
                            this.plugin.settings.defaultCodeLanguage = value.trim();
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    })
                )
                .addExtraButton((btn) =>
                    btn
                        .setIcon("trash")
                        .setTooltip("删除")
                        .onClick(async () => {
                            const removed = this.plugin.settings.codeLanguages[index];
                            this.plugin.settings.codeLanguages.splice(index, 1);
                            if (this.plugin.settings.defaultCodeLanguage === removed) {
                                this.plugin.settings.defaultCodeLanguage =
                                    this.plugin.settings.codeLanguages[0] ?? "";
                            }
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );
        });

        new Setting(containerEl).addButton((btn) =>
            btn
                .setButtonText("添加语言")
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.codeLanguages.push("");
                    await this.plugin.saveSettings();
                    this.display();
                })
        );
    }
}
