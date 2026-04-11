# ChatGPT Deep Research Flow Freeze

状态：CP-1 exploration freeze（只冻结真实 UI / 流程，不写代码）

更新时间：2026-04-11

## 1. 结论先行

本次已**真实验证**到 ChatGPT `/deep-research` 的 landing 与 input-ready 两个状态，以及一次 **submitted-but-retry-required** 的线程状态；但**未能在当前 OpenCLI browser 自动化路径下稳定打到可见的 running / completed 报告面**。

因此本冻结文档把状态分为三类：

- ✅ **已验证**：landing、input-ready、线程创建、share 按钮存在、retry-required 按钮存在、conversation URL 形态、`Deep Research / 深度研究` 命名边界
- ⛔ **blocked**：应用/站点菜单真实内容、running 进度面、completed 报告面、来源面、导出面
- ⚠️ **推断**：只有在明确标注时才作为推断，不把推断写成事实

---

## 2. 本次方法与边界

### 已执行

1. 检查 repo 内现有 ChatGPT 相关命令与文档
2. 验证本地 OpenCLI 环境：`opencli --version`、`opencli list`、`opencli doctor`
3. 使用 `opencli browser` 实测 `https://chatgpt.com/deep-research`
4. 进行了**一次无害 prompt 提交**，观察是否进入 research 线程与后续状态

### 未执行

- 未改 repo 代码
- 未提交 commit
- 未做 destructive 操作

### 关键现实约束

`opencli browser` 在本环境中存在明显的**标签页漂移 / 目标页不稳定**现象：同一轮操作里，有时会从 `/deep-research` 飘到 `/images` 或其他已打开页面。因此本冻结以“单次可复现观察 + 明确标注 blocked”为准，不把无法稳定复现的状态当成已验证事实。

---

## 3. Repo 基线检查

### ✅ 已验证

当前 repo 的 ChatGPT 命令面仍是**桌面端**命令：

- `status`
- `new`
- `send`
- `read`
- `ask`
- `model`

未见已落地的 **chatgpt web deep-research** 命令。

### 证据

- `opencli chatgpt --help` 仅显示桌面端命令
- `docs/adapters/desktop/chatgpt.md` 仅描述桌面客户端自动化
- `docs/plans/chatgpt-grok-gemini-execution-checklist.md` 中把 ChatGPT Deep Research 标为 Phase 1 待冻结事项

---

## 4. 实际流程冻结

## 4.1 landing

### ✅ 已验证

**入口 URL**：`https://chatgpt.com/deep-research`

**稳定副标题文案**：

> 提出复杂问题，获取带来源的完整报告。

**稳定可见控件**（多次观察都出现）

- `添加文件等`
- `应用`
- `站点`
- `开始听写`
- `启动语音功能`
- 左侧导航中的 `深度研究`

**输入区特征**

- prompt 输入框存在
- placeholder 观察到为：`获取详细报告`
- 页面默认处于 `深度研究` 模式（composer 下方有 `深度研究` 标识）

**推荐卡 / 示例 prompt**

landing 页会出现多组示例卡，但**内容不稳定**，每次刷新/重开可变，例如：

- 比较生活改善效果
- 分析技能需求
- 追踪体育经济
- 评估网络覆盖
- 比较语言学习
- 追踪气候影响

### ✅ 已验证：hero 文案会变体

在同一路由 `/deep-research` 下，多次观察到不同的 H1 文案变体：

- `你在忙什么？`
- `我们先从哪里开始呢？`
- `今天有什么计划？`
- `你今天在想些什么？`
- `准备好了，随时开始`

**结论**：hero headline 存在轮换/实验文案；因此 Phase 1 不应把 landing H1 写死成唯一字符串。真正稳定的产品副标题是：

> 提出复杂问题，获取带来源的完整报告。

---

## 4.2 input-ready

### ✅ 已验证

在 `/deep-research` 页把 prompt 注入输入区后，可见状态变为 input-ready：

**已验证特征**

- 输入框中能看到 prompt 文本
- `应用`、`站点` 按钮仍保留
- `发送提示` 按钮会出现且变为可用
- 页面仍停留在 `/deep-research`

**一次已验证的 prompt 样例**

> 请研究 OpenAI 官方对 ChatGPT Deep Research 的公开描述。

### 备注

这一步是本次最稳定可复现的“可发送前状态”。

---

## 4.3 submitted / thread-created / retry-required

> 注意：这是**已验证状态**，但它**不是 running 的充分证据**。

### ✅ 已验证

点击 `发送提示` 后，能够创建 conversation 线程，并拿到 `/c/<uuid>` 形式的 URL。

**已验证 conversation URL 形态**：

- `/c/69da4e4b-648c-839b-8a85-a18b0c623307`
- `/c/69da4e7b-06a0-8398-b56a-edd8f1ab8e61`
- `/c/69da4e63-484c-83a1-882a-f644a4b45513`

**已验证线程标题形态**（自动生成、混合中英）

- `OpenAI ChatGPT 深度研究`
- `ChatGPT Deep Research 概述`
- `ChatGPT Deep Research 概括`

### ✅ 已验证：线程页真实可见控件

在已创建线程页里，真实看到：

- `分享`
- `打开对话选项`
- `复制消息`
- `编辑消息`
- `添加文件等`
- `应用`
- `站点`
- `开始听写`
- `启动语音功能`

### ✅ 已验证：出现 retry-required 按钮

在 assistant 区域附近，多次稳定看到一个按钮：

- 文本：`深度研究`
- aria：`深度研究，点击以重试`

并且它在等待 60 秒后仍然存在；点击该按钮后，再等待 60 秒，仍未进入可见报告面。

### ✅ 已验证：线程级分享按钮存在

即使 assistant 输出仍未形成可见报告，线程页顶部已经出现：

- `分享`

**结论**：`分享` 至少是**线程级**动作，而不一定只在 completed 报告页才出现。

### ⛔ blocked

虽然线程已创建，但未能在当前自动化路径下观察到以下任一 running 证据：

- 正在研究 / researching / in progress 文案
- 停止 / 取消研究按钮
- 来源采集中面板
- 实时搜索/浏览进度
- 中间态总结卡片

因此本状态只能命名为：

**submitted / thread-created / retry-required**

不能冒充为 running。

---

## 4.4 running

### ⛔ blocked

本次**未能冻结出真实 running 状态**。

### 原因

- 页面目标存在漂移，`opencli browser` 对当前 tab 的绑定不稳定
- 通过 DOM 注入 prompt + `发送提示` 的方式，只稳定打到了 thread-created / retry-required
- 未抓到任何明确 progress 文案、停止按钮、来源累积面板或中间工作台 UI

### 当前能说的只有

- running **应该**存在，但本次**没有可验证证据**
- Phase 1 不应在代码里假设 running 页已有固定文案/固定控件名

---

## 4.5 completed

### ⛔ blocked

本次**未能冻结出真实 completed 报告面**。

### 因此以下均未验证

- 报告正文结构
- 来源列表 / citation surface
- 分享后的公开 URL 行为
- 导出 / 下载 / PDF / copy link
- 结果页 tabs（如 report / sources）
- completed 后 follow-up composer 是否保留 `深度研究` / `应用` / `站点`

---

## 5. 控件清单（按可信度分层）

## 5.1 ✅ 已验证存在

### Landing / Input-ready

- `添加文件等`
- `应用`
- `站点`
- `开始听写`
- `启动语音功能`
- `发送提示`（input-ready 时可用）
- 左侧导航 `深度研究`

### Thread-created / retry-required

- `分享`
- `打开对话选项`
- `复制消息`
- `编辑消息`
- `深度研究`（aria: `深度研究，点击以重试`）
- `应用`
- `站点`
- `添加文件等`
- `开始听写`
- `启动语音功能`

## 5.2 ⛔ 已见按钮但未成功打开其菜单/内容

- `应用` 菜单内容
- `站点` 菜单内容
- `分享` 弹层/菜单内容
- `打开对话选项` 的真实菜单项

说明：按钮本身存在已验证，但其展开面在本次自动化路径下未能稳定抓到。

## 5.3 ⛔ 未观察到

- `导出`
- `下载`
- `来源`
- `Sources`
- `Report`
- `Stop research`
- `Cancel research`

这些都**不能写进 Phase 1 合同作为已知真实 UI**。

---

## 6. 命名冻结

## 6.1 ✅ 已验证

正式产品标签层面，本次只看到：

- `深度研究`
- `Deep Research`（主要出现在自动生成线程标题中）

## 6.2 ✅ 已检查且未发现

在页面可见文本与 HTML 字符串检查中，**未发现**以下正式命名：

- `Pro Research`
- `Extended Research`

## 6.3 ⚠️ 需要区分的非产品名

下列字符串**不要误当成产品正式命名**：

- `OpenAI ChatGPT 深度研究`
- `ChatGPT Deep Research 概述`
- `ChatGPT Deep Research 概括`

这些更像是**按 prompt 自动生成的线程标题**，不是产品功能名。

---

## 7. 结果面 / 来源面 / 分享面冻结

## 7.1 分享

### ✅ 已验证

- conversation thread 顶部存在 `分享` 按钮

### ⛔ blocked

- 点击后弹层/可分享 URL/复制链接动作未成功冻结

## 7.2 来源 / 报告 / 导出

### ⛔ blocked

本次没有拿到 completed 报告，因此未验证：

- source list
- citation anchors
- report tabs
- export / download / PDF

---

## 8. 本次冻结后，Phase 1 应如何收缩命令合同

## 建议纳入 Phase 1 的最小命令合同

### 合同 A：`chatgpt deep-research <prompt>`

**只承诺做到已验证部分**：

1. 打开 `/deep-research`
2. 确认处于 `深度研究` 模式
3. 注入 prompt
4. 触发发送
5. 返回：
   - `conversation_url`
   - `conversation_id`
   - `thread_title`（若可见）
   - `mode_label=Deep Research`
   - `ui_state`

### `ui_state` 初版只允许这些保守枚举

- `landing`
- `input_ready`
- `thread_created`
- `retry_required`
- `unknown`

### 明确不要在 Phase 1 承诺的内容

- `running`
- `completed`
- `result_url`
- `sources`
- `export`
- `share_url`

除非后续先把 running/completed 真 UI 冻结出来。

### 合同 B：`chatgpt deep-research-status <conversation_url>`

只做**可见 UI 分类**，不要伪造 provider 状态：

返回建议字段：

- `conversation_url`
- `thread_title`
- `ui_state`
- `visible_buttons[]`
- `share_button_visible`
- `retry_button_visible`
- `report_visible`
- `sources_visible`
- `raw_excerpt`

其中：

- 若看到 `深度研究，点击以重试`，就返回 `ui_state=retry_required`
- 没看到真实进度，不要擅自返回 `running`
- 没看到真实报告，不要擅自返回 `completed`

---

## 9. 最终冻结判断

### ✅ 已冻结

- `/deep-research` landing 基本结构
- input-ready 的真实输入与发送前状态
- 发送后 conversation URL 形态
- 线程级 `分享` 按钮存在
- `深度研究，点击以重试` 按钮存在
- 正式命名未超出 `Deep Research / 深度研究`

### ⛔ 仍需后续补冻结

- running 真状态
- completed 真状态
- source/result surface
- share/export 的展开面
- 应用/站点菜单真实内容

### 总结一句话

**当前最稳妥的工程结论不是“ChatGPT Deep Research 已跑通”，而是“我们已经冻结了启动入口与失败/重试线程态，但 running/completed 报告态还不能诚实地声称已验证”。**
