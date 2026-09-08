# Obsidian Format Hotkeys

Obsidian 插件：用快捷键和底部工具栏快速排版 Markdown，并提供接近 Typora 的源码所见即所得显示模式。

仓库：https://github.com/RiverAndTao/obsidian-format-hotkeys

## 功能概览

### 格式快捷键

| 操作 | 默认快捷键 |
|------|------------|
| 设为 1～5 级标题 | `Ctrl/Cmd + 1` … `5` |
| 下划线 | `Ctrl/Cmd + U` |
| 红色文字 | `Ctrl/Cmd + R` |
| 创建代码块 | `Ctrl/Cmd + Alt + D` |

另外可通过命令面板使用：去除空行、插入顿号、块级公式转行内、中英文标点转换等。

### 编辑器工具栏

源码模式下底部浮动工具栏，按钮顺序可自定义（点「…」）：

- **Typora**：开关 Typora 显示模式
- **Typora配置**：宽度、行高、标题字号/颜色等
- **Tips**：为选中文字快速包成 Callout（tip / note / warning 等）
- 去除空格行、顿号、代码语言、公式转换、符号格式化

### Typora 显示模式

开启后在源码视图中模拟 Typora 风格：

- 非编辑行隐藏 `#`、`**`、`` ` ``、`>` 等语法标记
- 有序列表 `1. ` / 无序列表 `- ` 保留并优化层级缩进
- 课本常见的 `(1)` / `（1）` 括号编号按列表样式显示；条目下正文缩进，连续空 3 行及以上则视为正文、不再缩进
- 标题颜色默认跟随当前主题（如 Prime：H1 紫、H2 青等），可在配置中自定义
- 加粗、引用、代码、链接等排版更接近 Typora
- 表格左右顶满、隔行灰底；浅色对齐 GitHub 主题，深色用略提亮的底与 Night 风格边框

## 安装

### 手动安装

1. 下载本仓库，或 Clone 后执行 `npm install && npm run build`
2. 将下列文件复制到库的插件目录：  
   `.obsidian/plugins/obsidian-format-hotkeys/`
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. 在 Obsidian：**设置 → 第三方插件** 中启用 **Format Hotkeys**

### 开发

```bash
npm install
npm run build        # 生产构建并安装到 obsidian-vault.config.json 指定目录
npm run build:dev    # 监视模式，输出到 test/.obsidian/plugins/...
```

## 使用提示

1. 打开任意 Markdown，切到**源码模式**，底部会出现工具栏。
2. 点击 **Typora** 开启所见即所得风格；点 **Typora配置** 调整样式。
3. 选中文字后点 **Tips**，可插入 `> [!tip]` 等 Callout。
4. 更多命令：`Ctrl/Cmd + P` 搜索「Format Hotkeys」相关项。

## 目录结构

```
├── src/                 # TypeScript 源码
├── main.js              # 构建产物
├── styles.css           # 样式（含 Typora 模式）
├── manifest.json
├── rollup.config.js
└── scripts/install-plugin.js
```

## 作者

[RiverAndTao](https://github.com/RiverAndTao)

## License

MIT
