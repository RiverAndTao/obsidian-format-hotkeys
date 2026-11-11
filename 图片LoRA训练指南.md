# Krea 2 训练 Maya Arnold 画风 LoRA

目标只有一个：出图时带上触发词，画面呈现 **Maya + Arnold** 的渲染质感。底模用 **Krea 2**。

Krea 2 有两个权重：

| 权重 | 用途 | 出图设置 |
|------|------|----------|
| `krea/Krea-2-Raw` | **只用来训练**。没有蒸馏，适合学画风 | 训练时的样图大约 28 步，guidance 3.5 |
| `krea/Krea-2-Turbo` | **只用来出图**。在 Raw 上练的 LoRA 直接挂到这里 | 8 步，guidance 0 |

不要在 Turbo 上训练。Turbo 是少步蒸馏模型，画风学不稳。

这和更早的 FLUX.1 Krea [dev] 不是同一个模型。那套走 Flux 架构，配置不能混用。

## 画风 LoRA 在学什么

Arnold 的观感来自物理渲染，不是某一支笔刷。数据集里要反复出现这些特征，标注里却不要把它们写出来：

- 区域光或天空光，阴影边缘软，接触处有细的接触阴影
- 暗部有带颜色的间接光，不是一片死黑
- 金属的高光形状跟着灯走，粗糙度能拉开亮和雾
- 玻璃有厚度和折射
- 皮肤有次表面散射，耳朵和鼻尖能透光
- 画面干净，采样足够，没有明显噪点和萤火虫
- 经过视图变换的成片，有胶片或 ACES 那种明暗，而不是线性 EXR 的灰雾

触发词负责代表整套观感。标注只写画面里是什么东西、什么角度、什么场景。

## 准备 40–60 张 Arnold 成片

画风要比人物更吃数量和多样性。第一版用 **40–60 张**。全部是你自己在 Maya 里用 Arnold 渲染的图，或你有权使用的成片。

### 在 Maya 里保持同一套渲染习惯

每张图都用同一条输出标准，换的是模型和布光：

- 材质用 `aiStandardSurface`，不要混 Blinn / Phong 的旧观感
- 灯光用 Arnold 的面积光、`skydome_light`，需要时加 HDRI
- 采样开到成片干净。训练图上的噪点会被当成画风
- 色彩管理固定一种（Maya 默认视图变换或 ACES），导出 **已经套好视图变换的 PNG**
- 不要导出未调色的线性 EXR。线性图又灰又平，LoRA 会把这种灰学进去

### 主体必须换，观感不要换

如果 40 张都是同一个机器人、同一块白背景，模型会把那个机器人焊进画风里。换这些：

- 角色特写、半身、全身
- 产品静物：陶瓷、拉丝金属、玻璃瓶、布料、木头
- 室内一角、室外自然光
- 动物或植物

灯光方案也可以换：棚拍灰背景、窗户光、黄昏外景、夜景实用光。材质种类要多，否则以后所有东西都会变成同一种塑料或皮肤。

这些不要放进数据集：Maya 视口截图、线框、Hypershade、水印、Blender、Unreal、Octane、实拍照片、插画。混进来的渲染器会把 Arnold 的观感冲掉。

### 文件夹

```text
D:\lora\dataset\arnold\
  001.png
  001.txt
  002.png
  002.txt
```

长边大约 1024 以上。jpg、png 都可以。

## 标注

触发词用一个不会和日常英文撞车的词，例如 `arnlook`。每张图句首都写它。

只描述内容：

```text
arnlook, a ceramic teapot on a white cyclorama, three-quarter view
```

```text
arnlook, a glass bottle on a wooden table, window light from the left, close-up
```

```text
arnlook, a young man in a linen shirt, head and shoulders, looking left
```

不要写 `arnold`、`maya`、`octane`、`3d render`、`subsurface scattering`、`ray tracing`、`global illumination`。这些词一旦写进标注，画风就绑在词上，不写它们时风格会变弱。

自动打标可以做初稿。生成后删掉所有渲染器、画风、材质学术语，只留物体、姿态、场景。

## 安装 ai-toolkit

Krea 2 用 [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit) 训练。在 PowerShell 里：

```powershell
git clone https://github.com/ostris/ai-toolkit.git
cd ai-toolkit
git submodule update --init --recursive
python -m venv venv
.\venv\Scripts\activate
```

PyTorch 装 CUDA 版，版本以仓库 README 为准。然后再：

```powershell
pip install -r requirements.txt
huggingface-cli login
```

`krea/Krea-2-Raw` 若在 Hugging Face 上需要同意协议，先在网页上接受，再登录。文本编码器默认会拉取 Qwen3-VL，VAE 默认用 Qwen-Image VAE，第一次运行要留出下载时间。磁盘至少留 40GB。显存按 **24GB** 来准备。

## 训练配置

新建 `config\arnold_krea2.yml`：

```yaml
job: extension
config:
  name: arnold_krea2_v1
  process:
    - type: diffusion_trainer
      training_folder: output
      device: cuda:0
      trigger_word: arnlook
      network:
        type: lora
        linear: 32
        linear_alpha: 32
      save:
        dtype: bf16
        save_every: 250
        max_step_saves_to_keep: 6
        save_format: diffusers
      datasets:
        - folder_path: "D:\\lora\\dataset\\arnold"
          caption_ext: txt
          caption_dropout_rate: 0.05
          cache_latents_to_disk: true
          resolution:
            - 1024
      train:
        batch_size: 1
        steps: 2500
        gradient_accumulation: 1
        train_unet: true
        train_text_encoder: false
        gradient_checkpointing: true
        noise_scheduler: flowmatch
        optimizer: adamw8bit
        timestep_type: linear
        content_or_style: style
        unload_text_encoder: true
        cache_text_embeddings: true
        lr: 1.0e-4
        dtype: bf16
      model:
        name_or_path: krea/Krea-2-Raw
        arch: krea2
        quantize: true
        quantize_te: true
        low_vram: false
      sample:
        sampler: flowmatch
        sample_every: 250
        width: 1024
        height: 1024
        guidance_scale: 3.5
        sample_steps: 28
        seed: 42
        walk_seed: true
        prompts:
          - "arnlook, a red kettle on a concrete floor, studio cyclorama"
          - "arnlook, a cat sitting on a marble pedestal, soft side light"
          - "arnlook, a small living room at dusk, sofa and a floor lamp"
```

Windows 路径里的反斜杠写成 `\\`。

`content_or_style: style` 让训练更偏向整体观感。三条样图提示必须是数据集里没出现过的物体和场景，用来检查画风有没有锁死某个模型。

样图阶段跑的是 Raw，所以用 28 步、guidance 3.5。最终出图改挂 Turbo，设置见下一节，两边不要混。

显存不够时，把 `low_vram` 改成 `true`。它会把权重量到内存里再逐块送上显卡，能开训，但每步会慢很多。24GB 卡先保持 `false`。

启动：

```powershell
.\venv\Scripts\activate
python run.py config\arnold_krea2.yml
```

权重和样图在 `output\arnold_krea2_v1\`。每 250 步存一次。中断后用同一配置再跑，会从最近的检查点继续。

## 看样图，选一步权重

不要默认用第 2500 步。从 1000、1500、2000、2500 里挑。

合格的样图同时满足：

- 材质像 Arnold：软阴影、有颜色的暗部、金属和玻璃的反射分开
- 提示里的新物体真的出现了，而不是数据集里某个角色反复出现
- 画面仍然干净，没有糊成塑料，也没有噪点被放大

| 现象 | 处理 |
|------|------|
| 500–1000 步已经像训练图里的某个模型 | 数据集主体太单一，补不同物体后再练 |
| 2500 步仍像普通照片或插画 | 检查训练图是不是混进了实拍或其他渲染器；步数加到 3500 |
| 什么都像同一种皮肤或塑料 | 材质种类不够，补玻璃、金属、布、木头 |
| 画风对，但一换场景就脏 | 用更早的检查点，或把学习率降到 `5e-5` 重跑 |
| 必须把 LoRA 权重降到 0.4 才正常 | 这一步过了，改用前一个存档 |

## 在 ComfyUI 里出图

1. ComfyUI 使用带 Krea 2 支持的版本，并装好 Krea 2 的文本编码器（Qwen3-VL）和 Qwen-Image VAE。
2. 扩散模型选 **Krea 2 Turbo**，不要选 Raw。
3. 把选中的 LoRA 放进 `models\loras\`，强度先用 **0.8–1.0**。
4. 采样用 Turbo 的设置：**8 步，guidance 0**。Turbo 上再开 guidance，会和蒸馏对着干。
5. 提示词以触发词开头，后面只写内容：

```text
arnlook, a brass desk lamp on an oak table, evening window light, three-quarter view
```

想要的是渲染观感，就继续用新的物体和场景去试。如果只有训练过的那几个模型才像 Arnold，说明画风没有分开，回到数据集补主体。

## 第一版就按这个做

1. 在 Maya 里用 Arnold 渲染 40–60 张干净成片，主体和灯光都要换，色彩管理和采样标准不变。
2. 每张配一句标注，句首 `arnlook`，只写物体和场景。
3. 用上面的配置，在 `krea/Krea-2-Raw` 上训练 2500 步，rank 32。
4. 按样图留下最像 Arnold、又能画出新物体的那一步。
5. 出图时把这份 LoRA 挂到 **Krea 2 Turbo**，8 步，guidance 0。
