# Gemini 图片能力冻结（exploration freeze）

> 目标：把当前 `opencli gemini image` 的真实实现，与 Gemini Web `Create image` UI 中可见的显式能力对齐，冻结“已验证 / blocked / 推断”的边界。

## 范围

- 仓库：`clis/gemini/image.js`、`clis/gemini/utils.js`、`docs/adapters/browser/gemini.md`
- UI：已登录 `gemini.google.com` 的 `Create image` 入口
- 当前阶段：**只做探索冻结，不改代码**

---

## 结论先行

当前 `opencli gemini image` 已经能完成一个可用的最小闭环：

1. 打开 Gemini Web；
2. 新建 chat；
3. 把 prompt 发进去；
4. 等待新图片出现；
5. 可选下载图片到本地，或仅返回 Gemini 会话链接。

但它对 Gemini 高级图片能力的覆盖仍然很浅：

- `--rt`、`--st` 本质上是**prompt augmentation**，不是点击 Gemini 的原生图片控件；
- 当前未自动化 `Create image` 样式卡片、上传作为参考图、后续编辑、质量/高级面板；
- 观察到 UI 上确实存在一批显式入口（`Create image`、样式模板、upload menu、Tools 按钮、mode picker 按钮），但当前命令没有把这些入口映射为稳定 CLI 能力；
- 目前更准确的定位是：**Gemini 图片生成 MVP**，而不是“Gemini 高级图片能力覆盖”。

---

## 代码冻结

### 1. `opencli gemini image` 当前真实参数面

来自 `clis/gemini/image.js`：

- `prompt`：必填
- `--rt`：比例 shorthand
- `--st`：风格 shorthand
- `--op`：输出目录
- `--sd`：只返回 Gemini 页面链接，不下载

文档 `docs/adapters/browser/gemini.md` 也只暴露了这 4 个短参数，没有更高级图片能力说明。

### 2. `--rt` / `--st` 的实现性质

`buildImagePrompt(prompt, options)` 的实现是：

- 如果有 ratio，则拼接 `aspect ratio ...`
- 如果有 style，则拼接 `style ...`
- 最终把这些内容附加到原 prompt 后面，形成：

```text
Image requirements: aspect ratio X, style Y.
```

这说明：

- `--rt` 不是去点 Gemini UI 的比例控件；
- `--st` 也不是去点 `Create image` 页里的样式卡片；
- 它们只是把额外约束写进 prompt 文本。

**结论：`--rt` / `--st` 目前是 prompt-level 能力，不是 UI-native 能力。**

### 3. 当前真正自动化了哪些动作

从 `image.js` + `utils.js` 看，当前真实 UI 自动化主要只有：

1. `startNewGeminiChat(page)`：新建对话；
2. `sendGeminiMessage(page, effectivePrompt)`：把最终 prompt 发进 composer；
3. `getGeminiVisibleImageUrls(page)`：扫描 `main img` 中新出现的大图 URL；
4. `waitForGeminiImages(...)`：轮询直到图片稳定出现；
5. `exportGeminiImages(page, urls)`：通过 `fetch` / `canvas` 导出已显示图片；
6. 本地保存文件，或仅返回会话链接。

**结论：当前真正的 UI 自动化核心是“发 prompt + 等图片 + 导出图片”。**

### 4. 当前没有实现的 UI 能力

从代码中未看到以下动作的实现：

- 进入 `Create image` 后点击某个 style/template 卡片；
- 打开 upload menu 并上传参考图；
- 区分“普通附件”与“图片参考图工作流”；
- 调起编辑/重绘/局部修改流程；
- 切换图片专属模型；
- 调整质量、数量、seed、advanced panel；
- 读取并结构化暴露当前账户可见的图片能力面。

---

## UI 冻结（已验证）

以下内容来自成功的 `opencli browser state` 观察，只把**明确看到的**记为已验证。

### A. 零态存在 `Create image` 入口

在 Gemini 零态页，看到意图卡片：

- `🖼️ Create image`
- `🎸 Create music`
- `Help me learn`
- `Write anything`
- `Create video`
- `Boost my day`

**已验证：Gemini Web 有显式 `Create image` 工具入口。**

### B. 进入 `Create image` 后，存在显式样式模板区

成功进入 `Create image` 后，页面出现：

- 标题：`Pick a style for your image`
- 一组显式模板卡片，例如：
  - `Monochrome`
  - `Color block`
  - `Runway`
  - `Anyma's world`
  - `Risograph`
  - `Technicolor`
  - `Gothic clay`
  - `Dynamite`
  - `Salon`
  - `Sketch`
  - `Cinematic`
  - `Steampunk`
  - `Sunrise`
  - `Mythic fighter`
  - `Surreal`
  - `Moody`
  - `Enamel pin`
  - `Cyborg`
  - `Soft portrait`
  - `Oil painting`

**已验证：Gemini UI 有原生样式模板卡片，不只是自由文本 prompt。**

### C. `Create image` 状态下，存在 upload menu

在 `Create image` composer 区域，看到 `Open upload file menu`，展开后成功观察到菜单项：

- `Upload files`
- `Add from Drive`
- `Photos`
- `Import code`

**已验证：Gemini 在该图片流程中有显式上传入口。**

但需要注意：

- 这次观察只证明“有上传菜单”；
- **未验证** Gemini 是否把这里上传的图片自动作为“参考图/编辑源图”进入图片生成语义；
- 也**未验证**上传后会出现怎样的图片专属编辑控件。

### D. `Create image` 状态下，存在 `Tools` 与 `Open mode picker` 按钮

在成功进入 `Create image` 的 state 中，composer 区域看到了：

- `Tools`
- `Open mode picker`
- `Deselect Create image`

**已验证：Gemini UI 上至少存在额外能力入口，而不是只有一个纯文本输入框。**

但这次探索里：

- `Tools` 菜单内容没有稳定冻结下来；
- `Open mode picker` 的具体选项没有在同一条稳定链路里再次冻结；
- 因此不能把这些按钮直接等同为“已验证的图片专属高级控制项”。

### E. 未看到显式 `quality` / `advanced panel` / `seed` 控件

在成功捕获的 `Create image` state 中，**没有看到**以下显式控件：

- `quality` 切换
- `advanced` 面板
- `seed` 输入
- 图片数量选择
- 单独的图片分辨率控制

**已验证：本次观察里未见这些显式控件。**

这不等于“Gemini 永远没有”，只表示：

- 在当前账户、当前页面状态、当前成功捕获的 UI 中，没有冻结到这些显式入口。

---

## Blocked / 未完全验证

以下项目不能当作事实写死：

### 1. 图片专属模型选择

看到 `Open mode picker` 按钮，但本次没有把其菜单内容在稳定链路里冻结为最终证据。

因此当前只能写：

- **已验证**：有 `Open mode picker` 按钮；
- **未验证**：它是否是图片专属模型选择；
- **未验证**：其选项是否会真正影响图片生成质量或风格。

### 2. `Tools` 的具体图片能力

看到 `Tools` 按钮，但菜单项未稳定抓取成功。

因此当前不能确认：

- 是否包含图片编辑；
- 是否包含局部重绘；
- 是否包含背景替换；
- 是否包含参考图专用模式。

### 3. 参考图 / 编辑图工作流

upload menu 已验证存在，但尚未验证：

- 上传图片后是否进入 image-to-image；
- 是否存在单独“Edit image”或“Reference image”文案；
- 是否有上传后再编辑已有生成图的路径。

### 4. browser 观察链路稳定性

本次 exploration 中，`opencli browser` 的会话在部分尝试里会串到其他站点/标签页，因此：

- 本文只把**成功落在 Gemini 页面上的 state**记为证据；
- 对未稳定复现的按钮菜单，不做事实化描述。

---

## 当前命令 vs 真实 UI：能力对齐表

| 能力 | Gemini UI 是否可见 | `opencli gemini image` 当前状态 | 结论 |
|---|---|---|---|
| 进入 Gemini 并新建对话 | 是 | 已实现 | 真正 UI 自动化 |
| 发送 prompt | 是 | 已实现 | 真正 UI 自动化 |
| 等待图片出现 | 是 | 已实现（扫描 `main img`） | 真正 UI 自动化 |
| 下载/导出图片 | UI 已生成图片 | 已实现 | 真正 UI 自动化 |
| `Create image` 入口 | 是 | 未显式建模，仅靠 prompt 生成流程工作 | 有缺口 |
| 样式模板卡片 | 是 | 未点击卡片；`--st` 只改 prompt | 目前是 prompt-level 替代 |
| 比例控制 | 本次未见显式比例控件 | `--rt` 只改 prompt | prompt-level，不是 UI-native |
| 上传文件入口 | 是 | 命令未接入 | 有缺口 |
| 参考图工作流 | 未验证 | 未实现 | 有缺口 |
| 图片编辑/重绘 | 未验证 | 未实现 | 有缺口 |
| 图片专属模型选择 | 未验证 | 未实现 | 有缺口 |
| 质量/高级面板 | 本次未见 | 未实现 | 当前未覆盖 |
| `--op` 输出目录 | 与 UI 无关 | 已实现 | 本地文件能力 |
| `--sd` 只返回链接 | 与 UI 无关 | 已实现 | 输出模式开关 |

---

## 实测补充

执行了最小 harmless 验证：

```bash
opencli gemini image "Generate a minimal blue square icon" --sd true -f json
```

得到结果：

- `status`: `🎨 generated`
- `link`: Gemini conversation link

说明当前命令**确实可用**，但只能证明最小图片生成闭环可跑通，不能证明高级图片能力已覆盖。

---

## 对未来 `gemini image-capabilities` / `gemini image` 增强的建议

### 建议 1：先做 `image-capabilities`，不要直接堆参数

优先新增一个只读能力探测命令，例如：

```bash
opencli gemini image-capabilities
```

输出建议包括：

- 当前是否看得到 `Create image`
- 可见样式模板列表
- 是否看得到 upload menu
- upload menu 的菜单项
- 是否看得到 `Tools`
- 是否看得到 mode picker
- 是否看得到 quality / advanced / edit 控件
- 当前探测结果属于 `verified / blocked / absent`

这样能先把**账户可见能力面**冻住，再设计写操作命令。

### 建议 2：把“prompt augmentation”与“UI-native 控制”明确分层

建议未来把参数语义区分开：

- prompt-level：`--prompt-style`、`--prompt-ratio` 一类
- UI-native：`--template`、`--reference`、`--edit-from`、`--mode` 一类

避免用户误以为：

- `--st anime` = 已点击 Gemini 原生风格模板
- `--rt 16:9` = 已使用 Gemini 原生比例控件

当前这两件事都**不是**。

### 建议 3：优先实现“模板卡片映射”而不是抽象 style 文本

因为已验证 Gemini UI 中确实存在模板卡片，所以比起继续扩充自由文本 `--st`，更适合优先加：

```bash
opencli gemini image "..." --template "Monochrome"
```

或：

```bash
opencli gemini image-capabilities --templates
```

这样可以把 UI 原生模板和 CLI 参数对齐。

### 建议 4：把上传与参考图能力单独做成明确工作流

建议未来分成两类：

- `--attach <file>`：只是上传附件
- `--reference <image>`：明确作为图片参考图

如果 Gemini UI 后续验证出“编辑已有图”路径，再单列：

- `--edit-from <image>`
- `--mask <image>`（如果 UI 真有局部编辑）

不要在未验证前把所有上传都宣传成“参考图编辑”。

### 建议 5：对未验证高级控件返回结构化 blocked，而不是假装支持

如果未来命令想支持：

- `--quality`
- `--advanced`
- `--model`
- `--edit`

那么在 UI 没看到对应控件时，应该返回：

- `blocked`
- `not_visible_in_current_account`
- `not_verified`

而不是把参数悄悄降级成 prompt 文本。

---

## 冻结结论

截至本次 exploration freeze：

- **已验证**：`opencli gemini image` 是一个可工作的 Gemini Web 图片生成 MVP；
- **已验证**：Gemini `Create image` UI 至少包含原生样式模板和上传入口；
- **已验证**：当前 CLI 的 `--rt` / `--st` 只是 prompt augmentation；
- **未验证**：图片专属模型、质量、高级面板、参考图编辑链路；
- **结论**：下一步更适合先做 `gemini image-capabilities`，再决定是否扩展 `gemini image`。
