# Grok web adapter 根因冻结（exploration freeze）

- 日期：2026-04-11
- 仓库：`repos/OpenCLI-fork`
- 范围：只做根因冻结、证据整理、修复边界定义；**不改代码、不提交 commit**。

## 结论先行

当前 `opencli grok ask --web` 在已登录 Grok 会话里返回 `submit button not clickable`，**一阶根因不是登录失效，也不是 submit 永远不可用**，而是：

1. `clis/grok/ask.js` 的显式 web flow（`sendPromptViaExplicitWeb()`）把 submit 选择器写死成了 **`button[aria-label="Submit"]`**；
2. 当前实际页面是 **中文本地化 UI**，`document.documentElement.lang` / `navigator.language` 为 `zh` / `zh-CN`，submit 实际可见标签是 **`aria-label="提交"`**；
3. 在同一页面里，prompt 插入后约 **1 秒**，真实 submit 已经变成 **enabled + visible**，说明“等待窗口太短”不是当前主因；
4. OneTrust 隐私弹窗确实存在，但依据本次探针，它更像 **次级风险项**，不是这次 blocked 的直接触发点；
5. `opencli grok ask`（默认兼容路径）在同环境下可以返回正常答案，进一步说明当前问题集中在 **`--web` 显式 consumer-web flow**，不是整个 Grok 会话都坏掉。

---

## 1. 代码冻结：`clis/grok/ask.js`

### 1.1 关键实现位置

- `clis/grok/ask.js:52` `runDefaultAsk()`
- `clis/grok/ask.js:148` `sendPromptViaExplicitWeb()`
- `clis/grok/ask.js:204` 显式 web flow 的 submit 查询：
  - 只查 `button[aria-label="Submit"]`
- `clis/grok/ask.js:218` blocked 文案：
  - `Grok submit button did not reach a clickable ready state after prompt insertion.`

### 1.2 两条路径的真实差异

#### 默认路径 `runDefaultAsk()`
默认路径仍然是偏旧的兼容实现：
- 找 `textarea`
- 发送后优先找 `button[aria-label="提交"]`
- 如果找不到，再 fallback 到 `button[type="submit"]`
- 再不行才尝试 Enter

这条路径对中文 submit 明显更宽容。

#### 显式 web 路径 `sendPromptViaExplicitWeb()`
显式 web flow：
- 找 `.ProseMirror[contenteditable="true"]`
- 通过 `composer.editor.commands.insertContent(...)` 写入 prompt
- 然后最多等 6 次，每次 500ms
- 但只查：`button[aria-label="Submit"]`
- 找不到就直接 blocked

**冻结判断：** 当前 `--web` 失败的主因是 selector/readiness 判定写死英文标签，而不是 prompt 未写入，也不是 submit 长期 disabled。

---

## 2. 运行时复现与对照证据

## 2.1 直接复现 `--web` 失败

已复现：

```bash
opencli grok ask --web --timeout 25 -f json "diagnostic ping"
```

返回：

```json
[
  {
    "response": "[BLOCKED] Grok submit button did not reach a clickable ready state after prompt insertion. Likely login/auth/challenge/session issue in the existing grok.com browser session."
  }
]
```

### 冻结说明
这个 blocked 文案当前会把问题归因到 login/auth/challenge/session，但本次对照结果显示：**这在当前案例里是误导性的 blocked 说明**。

---

## 2.2 默认路径对照：同环境下可正常返回

已复现：

```bash
opencli grok ask --timeout 25 -f json "default path probe"
```

返回了正常文本答案（与 prompt 相关、不是登录页/风控页内容）。

### 冻结说明
这说明：
- 当前浏览器 profile 下 **Grok 会话是活的**；
- “已登录但 submit 不可点”不能直接归因到 session dead；
- 问题更集中在 `--web` 这条显式 consumer-web flow 的 **选择器 / readiness 判定**。

---

## 2.3 页面语言与 submit 标签：已验证为中文 UI

在 `grok.com` 页面内直接探针得到：

```json
{
  "url": "https://grok.com/",
  "title": "Grok",
  "lang": "zh",
  "navigatorLanguage": "zh-CN",
  "submitLabels": ["提交"]
}
```

### 冻结说明
这条证据直接对应 `clis/grok/ask.js:204` 的英文 selector：

```js
button[aria-label="Submit"]
```

而页面真实可见的是：

```text
button[aria-label="提交"]
```

**这是已验证的硬失配，不是推测。**

---

## 2.4 prompt 已成功写入；submit 1 秒后就 ready

在同一个 Grok 页面里，用与 adapter 同类的 editor API 探针（不改仓库代码）验证：
- `.ProseMirror[contenteditable="true"]` 存在
- `composer.editor.commands` 存在
- `insertContent()` 成功
- 写入后立刻看 submit，按钮还 disabled / 不可见
- **1 秒后 / 3 秒后**再看，按钮已经：
  - `aria = "提交"`
  - `type = "submit"`
  - `disabled = false`
  - `visible = true`

关键快照（1 秒后）：

```json
{
  "composerText": "delayed probe",
  "buttons": [
    {
      "aria": "提交",
      "type": "submit",
      "disabled": false,
      "visible": true
    }
  ]
}
```

### 冻结说明
这说明：
- 不是“prompt 根本没插进去”；
- 也不是“Grok submit 永远不进入 ready state”；
- 当前 6×500ms 的等待窗口**至少在本环境下够用**；
- 真正卡住的是：**等到了 ready，但查错了按钮。**

---

## 2.5 OneTrust 隐私弹窗：存在，但不像本次的一阶根因

页面状态与 DOM 探针都能稳定看到 OneTrust：
- `#onetrust-consent-sdk`
- `role="dialog" aria-label="隐私偏好中心"`
- `全部允许`
- `确认我的选择`

同一时间，Grok 页面的核心输入区也同时存在：
- composer
- submit
- `Imagine`
- 私密模式
- 模型选择 `Auto`

进一步探针显示：
- 在 **OneTrust 仍存在** 时，插入 prompt 后约 1 秒，submit 已经 `disabled=false`；
- 在 **OneTrust 仍存在** 时，可以对 `button[type="submit"]` 执行 DOM `click()`，点击调用本身成功返回。

### 冻结说明
当前能确认的是：
- OneTrust 是一个真实存在的 consumer-web 边界条件；
- 它**值得加入诊断与防御**；
- 但按本次已验证链路，它**不像当前 blocked 的直接触发点**，因为 submit 在 overlay 存在时仍能 ready，而且 DOM click 可以被调用。

### 仍未完全验证的点
- 我**没有稳定抓到点击后同页 response bubble 的回流**，因为 browser 探针上下文在等待后会偶发跳到别的已开 tab；
- 因此不能把 overlay 完全排除为“零风险项”；
- 但足以冻结为：**次级风险，不是一阶根因。**

---

## 3. 真实可见能力面冻结（consumer UI）

以下内容是本次在已登录 Grok consumer 页里实际探针到的：

### 3.1 已稳定可见 / 可确认

```json
{
  "imagineLinks": [
    { "href": "/imagine", "text": "Imagine", "aria": "" },
    { "href": "/imagine", "text": "Imagine", "aria": "Imagine" }
  ],
  "privateLinks": [
    { "href": "/c#private", "text": "私密模式", "aria": "切换到私密聊天" }
  ],
  "modelTrigger": {
    "text": "Auto",
    "aria": "模型选择",
    "expanded": "false"
  },
  "onetrust": true,
  "submitLabels": ["提交"]
}
```

### 结论
已验证当前 consumer UI 至少暴露出：
- `Imagine` 入口（可见）
- `私密模式` 入口（可见）
- `模型选择` 触发器（当前显示 `Auto`）
- 附件按钮
- 听写 / 语音相关按钮
- submit 按钮

### 3.2 模型能力：页面配置已下发，但菜单展开未完全人工验证

从页面脚本中抽取到的模式配置：

```json
{
  "modes": [
    { "id": "auto", "title": "Auto", "description": "Chooses Fast or Expert" },
    { "id": "fast", "title": "Fast", "description": "Quick responses - Grok 4.20" },
    { "id": "expert", "title": "Expert", "description": "Thinks hard - Grok 4.20" },
    { "id": "heavy", "title": "Heavy", "description": "Powered by Grok 4.20" }
  ],
  "defaultModeId": "auto"
}
```

### 冻结说明
这里要严格区分两层：

1. **已人工可见确认**：
   - 模型选择 trigger 存在
   - trigger 当前文案为 `Auto`

2. **已从页面配置抽取，但未稳定完成“菜单展开可见”验证**：
   - `Auto / Fast / Expert / Heavy`

因此本次冻结里，**不能把 `Fast / Expert / Heavy` 都写成“已人工看到菜单项”**；更准确的说法是：
- 页面已下发这些模式配置；
- 当前账户/页面大概率支持这些模式；
- 但本次 exploration 没把“展开后逐项可见且可点击”验证到闭环。

---

## 4. 分层根因判断

## 4.1 页面层（Page layer）
**结论：页面本身不是“未登录”状态。**

证据：
- 可见头像 / consumer controls / composer / submit
- 默认 `opencli grok ask` 可返回正常答案

冻结结论：
- `login/auth/challenge/session issue` 不是当前 blocked 的首要归因。

---

## 4.2 选择器层（Selector layer）
**结论：这是当前最确定的一阶根因。**

证据链闭环：
- 代码只查 `button[aria-label="Submit"]`
- 页面语言为中文 `zh-CN`
- 实际 submit 标签为 `aria-label="提交"`
- prompt 插入后 1 秒 submit 已 enabled + visible
- `--web` 仍 blocked

冻结结论：
- 这是当前 Phase 1 必修复项。

---

## 4.3 等待逻辑层（Wait / readiness layer）
**结论：存在可改进空间，但不是这次 blocked 的首要根因。**

证据：
- 立即插入后按钮尚未 ready；
- 约 1 秒后已 ready；
- 现有实现总共等约 3 秒（6 × 500ms）；
- 所以当前环境下等待窗口足够覆盖 ready 出现。

冻结结论：
- readiness 逻辑可以增强，但应该排在 selector 修正之后；
- 更好的实现应允许：
  - 多语言 submit 标签
  - `type=submit` fallback
  - 更明确地记录 `disabled / visible / overlay` 状态

---

## 4.4 状态判定 / blocked 文案层
**结论：blocked reason 过度指向 session 问题，容易误导排障。**

当前用户看到的是：
- `Likely login/auth/challenge/session issue`

但当前案例真实更像：
- `localized submit selector mismatch`
- 可能伴随 overlay / readiness 诊断信息

冻结结论：
- 诊断文案应拆开：
  - composer not found
  - editor API missing
  - submit found but disabled
  - submit localized / selector mismatch
  - consent overlay present
  - no assistant bubble after click

---

## 4.5 适配器层（Adapter layer）
**结论：问题集中在 `--web` 显式 consumer-web flow 的实现边界，不在 default path 全局逻辑。**

冻结结论：
- 不建议把整个 Grok adapter 重写；
- Phase 1 应做 **最小修复**：只修 `sendPromptViaExplicitWeb()` 的 submit 发现与诊断；
- response bubble / capability 扩展 / model 菜单自动化应分开后续支线做。

---

## 5. 推荐修复顺序（不在本次执行）

## Phase 1：最小修复，先让 `--web` 能发出去

### 建议顺序
1. **修 submit selector**
   - 从只认 `button[aria-label="Submit"]`
   - 改为优先级组合：
     - `button[aria-label="Submit"]`
     - `button[aria-label="提交"]`
     - `button[type="submit"]`
     - 必要时结合 `visible + !disabled`

2. **保留 readiness 检查，但输出更细的 blocked diagnostics**
   - 区分：
     - 找不到 submit
     - submit 找到但 disabled
     - submit 找到但 hidden
     - overlay 存在

3. **把当前 locale / submit labels 带进 blocked detail**
   - 至少输出：
     - `document.documentElement.lang`
     - `navigator.language`
     - 命中的 submit labels 摘要

4. **把 overlay 检测做成附加诊断，不先当作主 blocker**
   - 检测 OneTrust dialog 是否存在
   - 若存在则放入 detail
   - 但不要在没有证据时直接归因为 consent block

### 不建议在 Phase 1 一起做的事
- 不要顺手重写 response bubble 检测
- 不要顺手扩展 model 菜单自动化
- 不要顺手做 Imagine 新命令
- 不要顺手做整页 capability 抽象

---

## 6. 建议的修复边界

## 建议纳入 `fix/grok-web-submit-readiness` 的内容

- `clis/grok/ask.js`
  - 只修 `sendPromptViaExplicitWeb()` 的 submit 查找与 blocked diagnostics
- `clis/grok/ask.test.js`
  - 增加 explicit web flow 的 selector / locale / diagnostics 单元测试
- `docs/adapters/browser/grok.md`
  - 更新 `--web` caveat 与已知 consumer-web 语言/overlay 风险

## 建议暂时不要混进同一个分支的内容

- response bubble 结构大改
- Grok capability mapping（Imagine / modes / private / media）
- Grok model menu 自动展开与选择
- Grok Imagine / image / video 新命令设计
- 任何跨 provider（ChatGPT/Gemini/Grok）的通用抽象重构

---

## 7. Phase 1 之外应单独起分支的范围

### 分支 A：`feat/grok-capability-map`
单独处理：
- `Imagine` / 私密模式 / 附件 / 语音 / model trigger 的能力面冻结
- 区分“页面已下发配置” vs “人工可见可点”
- 后续是否沉淀成 capability-inspection 命令

### 分支 B：`feat/grok-model-mode-selection`
单独处理：
- 模型菜单展开
- `Auto / Fast / Expert / Heavy` 显示与选择
- 账户权限 / 升级 gating
- 与 prompt 发送流解耦

### 分支 C：`fix/grok-web-overlay-diagnostics`
单独处理：
- OneTrust / 其他 overlay 检测
- 被遮挡 / 焦点 / pointer-interception 诊断
- 更可靠的截图 / state artifact（如果后续需要）

### 分支 D：`fix/grok-web-response-detection`
单独处理：
- response bubble 选择器
- assistant candidate 判定
- streaming / stabilization 逻辑
- 新旧 UI 兼容性

---

## 8. 本次冻结的 top findings

1. **`--web` 的一阶根因是 submit selector 英文化写死，不是登录失效。**
2. **当前 Grok 页面是中文 UI，真实 submit 为 `aria-label="提交"`。**
3. **prompt 插入后约 1 秒，submit 已 `enabled + visible`，说明等待窗口不是当前主因。**
4. **OneTrust 弹窗真实存在，但更像次级风险项，不像当前 blocked 的直接触发条件。**
5. **当前 consumer 页已确认可见 `Imagine`、`私密模式`、`模型选择(Auto)`；模式配置中还能抽到 `Auto/Fast/Expert/Heavy`，但后者尚未完成“展开菜单可见”闭环验证。**

---

## 9. 本次 exploration 的限制

- 本次没有改代码，所以没有直接验证修复后命令是否恢复；
- browser 探针在等待较长时间后偶发跳到其他已开 tab，因此“点击 submit 后同页 bubble 回流”没有完整闭环抓到；
- 但对当前根因判断不构成实质影响，因为 selector mismatch 证据已经闭环。

---

## 最终冻结判断

**当前 `opencli grok ask --web` 的 Phase 1 修复边界已经足够清晰：**
- 先修 `sendPromptViaExplicitWeb()` 的 submit 发现逻辑；
- 用多语言 / `type=submit` fallback 替代英文硬编码；
- 同时补细粒度 blocked diagnostics；
- 把 overlay、model capability、response detection 留给后续独立分支。
