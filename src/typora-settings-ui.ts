import { ColorComponent, Setting } from "obsidian";
import type FormatHotkeysPlugin from "./main";
import {
    DEFAULT_TYPORA_STYLE,
    HEADING_LABELS,
    HEADING_LEVELS,
    HeadingLevel,
    cloneTyporaStyle,
    headingThemeColorHex,
    themeColorHex,
} from "./typora-style";

export class TyporaSettingsPanel {
    constructor(
        private plugin: FormatHotkeysPlugin,
        private containerEl: HTMLElement,
        private onRerender: () => void
    ) {}

    render(): void {
        const { containerEl } = this;

        containerEl.createEl("p", {
            text: "默认跟随当前主题的标题色（Prime 主题：H1 紫、H2 青、H3 绿、H4 黄、H5 橙、H6 粉）。改色后即时生效。",
            cls: "setting-item-description format-hotkeys-typora-intro",
        });

        new Setting(containerEl)
            .setName("启用 Typora 显示模式")
            .setDesc("隐藏 Markdown 语法符号并套用下方排版。也可从编辑器工具栏开关。")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.typoraMode).onChange(async (value) => {
                    this.plugin.settings.typoraMode = value;
                    await this.plugin.saveSettings();
                    this.plugin.applyTyporaMode();
                })
            );

        this.renderPreview(containerEl);

        containerEl.createEl("h4", { text: "排版", cls: "format-hotkeys-typora-subtitle" });

        this.addSliderSetting(containerEl, {
            name: "内容宽度",
            desc: "编辑区域最大宽度",
            min: 720,
            max: 1600,
            step: 20,
            getValue: () => this.plugin.settings.typora.contentWidth,
            setValue: (value) => {
                this.plugin.settings.typora.contentWidth = value;
            },
            format: (value) => `${value}px`,
        });

        this.addSliderSetting(containerEl, {
            name: "行高",
            desc: "正文行距，Typora GitHub 主题约为 1.6",
            min: 1.2,
            max: 2.2,
            step: 0.05,
            getValue: () => this.plugin.settings.typora.lineHeight,
            setValue: (value) => {
                this.plugin.settings.typora.lineHeight = value;
            },
            format: (value) => value.toFixed(2),
        });

        this.addSliderSetting(containerEl, {
            name: "段落行间距",
            desc: "每一行上下的额外空隙",
            min: 0,
            max: 0.45,
            step: 0.01,
            getValue: () => this.plugin.settings.typora.linePadding,
            setValue: (value) => {
                this.plugin.settings.typora.linePadding = value;
            },
            format: (value) => `${value.toFixed(2)}em`,
        });

        new Setting(containerEl)
            .setName("隐藏 Markdown 语法")
            .setDesc("非编辑行隐藏 #、**、`、> 等符号；有序列表的 1. 2. 始终保留")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.typora.hideSyntax).onChange(async (value) => {
                    this.plugin.settings.typora.hideSyntax = value;
                    await this.persist();
                })
            );

        new Setting(containerEl)
            .setName("一级 / 二级标题下划线")
            .setDesc("对齐 Typora GitHub 主题的标题底部分隔线")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.typora.headingUnderline).onChange(async (value) => {
                    this.plugin.settings.typora.headingUnderline = value;
                    await this.persist();
                })
            );

        new Setting(containerEl)
            .setName("高亮当前编辑行")
            .setDesc("光标所在行显示淡底，便于对照语法")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.typora.highlightActiveLine).onChange(async (value) => {
                    this.plugin.settings.typora.highlightActiveLine = value;
                    await this.persist();
                })
            );

        containerEl.createEl("h4", { text: "标题字号与颜色", cls: "format-hotkeys-typora-subtitle" });
        containerEl.createEl("p", {
            text: "默认写入当前主题的各级标题色。H1 紫、H2 青。点色块可改，重置则回到主题色。",
            cls: "setting-item-description",
        });

        for (const level of HEADING_LEVELS) {
            this.addHeadingStyleSetting(containerEl, level);
        }

        containerEl.createEl("h4", { text: "其他颜色", cls: "format-hotkeys-typora-subtitle" });

        this.addOptionalColorSetting(containerEl, {
            name: "引用文字颜色",
            desc: "块引用 > 的文字颜色",
            getValue: () => this.plugin.settings.typora.quoteColor,
            setValue: (value) => {
                this.plugin.settings.typora.quoteColor = value;
            },
            fallbackVar: "--text-muted",
        });

        this.addOptionalColorSetting(containerEl, {
            name: "链接颜色",
            desc: "链接文字颜色",
            getValue: () => this.plugin.settings.typora.linkColor,
            setValue: (value) => {
                this.plugin.settings.typora.linkColor = value;
            },
            fallbackVar: "--link-color",
        });

        this.addOptionalColorSetting(containerEl, {
            name: "行内代码颜色",
            desc: "行内 `code` 的文字颜色",
            getValue: () => this.plugin.settings.typora.inlineCodeColor,
            setValue: (value) => {
                this.plugin.settings.typora.inlineCodeColor = value;
            },
            fallbackVar: "--code-normal",
        });

        this.addOptionalColorSetting(containerEl, {
            name: "列表标记颜色",
            desc: "无序列表圆点颜色",
            getValue: () => this.plugin.settings.typora.listMarkerColor,
            setValue: (value) => {
                this.plugin.settings.typora.listMarkerColor = value;
            },
            fallbackVar: "--text-muted",
        });

        new Setting(containerEl)
            .setName("恢复默认样式")
            .setDesc("还原为当前主题的标题色（H1 紫、H2 青等）和默认排版")
            .addButton((btn) =>
                btn.setButtonText("恢复默认").onClick(async () => {
                    const enabled = this.plugin.settings.typoraMode;
                    this.plugin.settings.typora = cloneTyporaStyle(DEFAULT_TYPORA_STYLE);
                    this.plugin.settings.typoraMode = enabled;
                    await this.persist();
                    this.onRerender();
                })
            );
    }

    private renderPreview(containerEl: HTMLElement): void {
        const preview = containerEl.createDiv({ cls: "format-hotkeys-typora-preview" });
        preview.createDiv({ cls: "format-hotkeys-typora-preview-label", text: "样式预览" });
        for (const level of HEADING_LEVELS) {
            preview.createDiv({
                cls: `format-hotkeys-typora-preview-h format-hotkeys-typora-preview-h${level}`,
                text: `${"#".repeat(level)} ${HEADING_LABELS[level]}`,
            });
        }
        preview.createDiv({
            cls: "format-hotkeys-typora-preview-quote",
            text: "引用：这是一段块引用文字的预览。",
        });
        const body = preview.createDiv({ cls: "format-hotkeys-typora-preview-body" });
        body.appendText("正文预览：");
        body.createEl("code", { text: "inline code" });
        body.appendText(" 与 ");
        body.createEl("a", { text: "链接文字", href: "#" });
        body.appendText("。");
    }

    private addHeadingStyleSetting(containerEl: HTMLElement, level: HeadingLevel): void {
        const heading = this.plugin.settings.typora.headings[level];
        const setting = new Setting(containerEl)
            .setName(HEADING_LABELS[level])
            .setDesc(level === 1 ? "H1 默认紫色" : level === 2 ? "H2 默认青色" : `H${level} 字号与颜色`);

        setting.addSlider((slider) =>
            slider
                .setLimits(0.8, 2.8, 0.02)
                .setValue(heading.size)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    heading.size = Number(value.toFixed(2));
                    valueEl.setText(`${heading.size.toFixed(2)}em`);
                    await this.persist();
                })
        );

        const valueEl = setting.controlEl.createSpan({
            cls: "format-hotkeys-typora-value",
            text: `${heading.size.toFixed(2)}em`,
        });

        this.attachColorPicker(setting, {
            getValue: () => heading.color,
            setValue: (value) => {
                heading.color = value;
            },
            resolveFallback: () => headingThemeColorHex(level),
        });
    }

    private addSliderSetting(
        containerEl: HTMLElement,
        options: {
            name: string;
            desc: string;
            min: number;
            max: number;
            step: number;
            getValue: () => number;
            setValue: (value: number) => void;
            format: (value: number) => string;
        }
    ): void {
        const setting = new Setting(containerEl).setName(options.name).setDesc(options.desc);
        setting.addSlider((slider) =>
            slider
                .setLimits(options.min, options.max, options.step)
                .setValue(options.getValue())
                .setDynamicTooltip()
                .onChange(async (value) => {
                    options.setValue(value);
                    valueEl.setText(options.format(value));
                    await this.persist();
                })
        );
        const valueEl = setting.controlEl.createSpan({
            cls: "format-hotkeys-typora-value",
            text: options.format(options.getValue()),
        });
    }

    private addOptionalColorSetting(
        containerEl: HTMLElement,
        options: {
            name: string;
            desc: string;
            getValue: () => string;
            setValue: (value: string) => void;
            fallbackVar: string;
        }
    ): void {
        const setting = new Setting(containerEl).setName(options.name).setDesc(options.desc);
        this.attachColorPicker(setting, {
            getValue: options.getValue,
            setValue: options.setValue,
            resolveFallback: () => themeColorHex(options.fallbackVar),
        });
    }

    private attachColorPicker(
        setting: Setting,
        options: {
            getValue: () => string;
            setValue: (value: string) => void;
            resolveFallback: () => string;
        }
    ): void {
        let picker!: ColorComponent;
        let ignoreChange = false;
        setting.addColorPicker((component) => {
            picker = component;
            ignoreChange = true;
            component.setValue(options.getValue() || options.resolveFallback());
            window.setTimeout(() => {
                ignoreChange = false;
            }, 0);
            component.onChange(async (value) => {
                if (ignoreChange) {
                    return;
                }
                options.setValue(value);
                await this.persist();
            });
        });
        setting.addExtraButton((btn) =>
            btn
                .setIcon("reset")
                .setTooltip("恢复 Obsidian 默认色")
                .onClick(async () => {
                    ignoreChange = true;
                    options.setValue("");
                    picker.setValue(options.resolveFallback());
                    ignoreChange = false;
                    await this.persist();
                })
        );
    }

    private async persist(): Promise<void> {
        this.plugin.applyTyporaMode();
        await this.plugin.saveTyporaSettings();
    }
}
