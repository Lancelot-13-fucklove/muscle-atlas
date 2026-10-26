# 交互式 3D 肌肉解剖 / 训练指导：GitHub 参考项目调研

> 调研日期：2026-10-25 ｜ 目标形态：three.js 程序化人体 + 中文训练动作库 + 离线双击运行的 Web 应用
> 数据来源：GitHub REST API（api.github.com）与各仓库 README 原文；Star / 许可证为调研时点快照，会随时间变化。
> 用途：为本项目做技术选型、交互借鉴与许可证风险排查；下列结论均以"能否安全复用"为第一判据。

## 一、候选项目总览（逐一核实）

| # | 项目 | 链接 | Star | 语言 | 许可证 | 形态 | 核心亮点 |
|---|------|------|------|------|--------|------|----------|
| 1 | free-muscles | [tiralonghipol/free-muscles](https://github.com/tiralonghipol/free-muscles) | 1 | TypeScript | 应用 MIT / 模型 CC BY-SA 4.0 | 3D（R3F + glb） | 400+ 肌肉、17 个训练肌群、876 个动作、X-ray 透视点选、URL 分享状态 |
| 2 | body-anatomy-3d-viewer | [hpfrei/body-anatomy-3d-viewer](https://github.com/hpfrei/body-anatomy-3d-viewer) | 14 | JavaScript | CC BY-SA 4.0（README 声明；GitHub 标 Other） | 3D（three.js + glb） | body.glb 6.9MB + Draco，three.js/tween.js 全本地打包；点选后把遮挡层"移走"看深层 |
| 3 | Anatomy | [kilnwire/Anatomy](https://github.com/kilnwire/Anatomy) | 1 | JavaScript | Other / NOASSERTION | 3D（three.js + glb） | 面向普拉提/运动科学教学：点击结构出名称与教学笔记、Studio focus 肌群串联、X-ray 肌肉 |
| 4 | Fitness-OS | [liuchuan01/Fitness-OS](https://github.com/liuchuan01/Fitness-OS) | 78 | TypeScript | Apache-2.0 | 3D | 交互式 3D 人体 + 训练记录 + AI 教练，数据本地存储 |
| 5 | muscleview | [buckypinkman/muscleview](https://github.com/buckypinkman/muscleview) | 1 | JavaScript | 无（null） | 3D | 3D 肌肉解剖 + 基于生物力学的训练动作推荐 |
| 6 | 3d-anatomy-atlas | [authorOd/3d-anatomy-atlas](https://github.com/authorOd/3d-anatomy-atlas) | 3 | TypeScript | Other / NOASSERTION | 3D | three.js + Z-Anatomy 的浏览器 3D 解剖图集（骨骼/器官/肌肉），偏医学教育 |
| 7 | body-muscles | [vulovix/body-muscles](https://github.com/vulovix/body-muscles) | 35 | TypeScript | Apache-2.0 | 2D SVG | 零依赖、70+ 肌肉、前后双视图、0–10 强度渐变色、支持 file:// 的 UMD |
| 8 | MuscleMap（iOS） | [melihcolpan/MuscleMap](https://github.com/melihcolpan/MuscleMap) | 281 | Swift | MIT | 2D SVG（iOS） | SwiftUI 肌肉图 SDK：高亮、热图、手势、UIKit 支持 |
| 9 | MuscleMap（Web） | [Jsplice/MuscleMap](https://github.com/Jsplice/MuscleMap) | 12 | TypeScript | MIT（README 声明；API 标 Other） | 2D SVG | headless core + React 组件；按左右面寻址、四种色模、区域真裁剪 |
| 10 | workout-planner | [adanzan/workout-planner](https://github.com/adanzan/workout-planner) | 14 | C++ | 无（null） | 桌面 GUI | 训练计划生成 + 交互式肌肉解剖图（非 Web） |

### 补充发现（GitHub 搜索 API 新发现，非原始候选）

| 项目 | 链接 | Star | 语言 | 许可证 | 形态 / 亮点 |
|------|------|------|------|--------|-------------|
| MuscleMapJS | [abdofallah/MuscleMapJS](https://github.com/abdofallah/MuscleMapJS) | 11 | TypeScript | MIT | 2D SVG：Web 肌肉图 SDK，group→surface 两级 |
| muscle_mapper | [suryamolly/muscle_mapper](https://github.com/suryamolly/muscle_mapper) | 4 | Dart | MIT | 2D：Flutter 可点解剖图，三级子肌层级，BYOA 自带素材 |
| muscle-map | [jonowrenn/muscle-map](https://github.com/jonowrenn/muscle-map) | 1 | HTML | 无 | 2D：Flask + 可点 SVG + 测验模式（需服务器） |
| muscle-atlas | [anujrawatdev/muscle-atlas](https://github.com/anujrawatdev/muscle-atlas) | 0 | JavaScript | 无 | 2D：肌肉解剖 + 训练计划 + 解剖图的静态站点 |
| Muscle-Finder-Map | [AllanRoz/Muscle-Finder-Map](https://github.com/AllanRoz/Muscle-Finder-Map) | 0 | TypeScript | 无 | 2D：解剖图 + 按部位发现动作 |
| muscleatlas | [flobra9-works/muscleatlas](https://github.com/flobra9-works/muscleatlas) | 0 | JavaScript | 无 | 2D：按肌肉查动作、激活模型、Web Bluetooth 心率 |

## 二、解剖 / 动作数据源与官方许可证

| 数据源 | 链接 | 许可证 | 要点 |
|--------|------|--------|------|
| Z-Anatomy（人体模型） | [Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) | CC BY-SA 4.0 | 免费解剖模型的事实标准；**衍生模型必须同协议开源 + 署名** |
| BodyParts3D（Z-Anatomy 上游） | [NBDC 官方许可页](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) | CC BY 4.0（2025-02-27 更新） | 官方要求署名："BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International"；旧资料常误写为 CC BY-SA 2.1 Japan |
| free-exercise-db（动作数据） | [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) | Unlicense（公有领域） | 800+ 动作 JSON，字段结构可直接对照 |
| Jsplice/MuscleMap（SVG 路径） | [Jsplice/MuscleMap](https://github.com/Jsplice/MuscleMap) | MIT | 目前唯一"代码 + 肌肉路径 + 体图"全部可复用的 Web 资产 |

## 三、可借鉴的 6 条设计结论

### 1. 3D 模型来源：现成 glb 还是程序化几何

- 现成方案：free-muscles 的解剖 glb 仅 1.7MB（用 Blender 脚本减面到约 31 万三角面，剔除筋膜/滑囊/腱鞘/深层肌）；hpfrei 的 body.glb 6.9MB（Draco 压缩）。
- 代价：两者都派生自 Z-Anatomy，**CC BY-SA 4.0 传染 + 必须署名**；glb 需要 `fetch()`，file:// 下被 CORS 拦截，必须起本地 HTTP 服务。
- 程序化方案：0 资产、0 网络请求、双击即开；每块肌肉单独一个 mesh，`userData.muscleId` 与数据层一一对应。表现力弱于医学模型，但对"训练示意级"人体足够。
- 结论：本项目走程序化路线，绕开许可证与 file:// 两个硬约束。

### 2. 点击拾取与高亮：三种可用做法

- hpfrei：每个结构独立 mesh，点击任意结构后"把它移到地面堆里"露出深层，再点已移走的结构可还原——不需要透明化就能点深层肌肉。
- free-muscles：X-ray 模式把遮挡层 opacity 降低，射线穿透点选目标。
- 通用可靠做法：`Raycaster` + `pointerdown/pointerup` 位移阈值（小于 5px 判定为点击，避免与 OrbitControls 拖拽冲突）+ emissive/描边高亮 + 侧栏联动。
- 结论：本项目用 raycaster + 位移阈值 + 高亮；对髂腰肌、冈下肌等深层肌肉，提供"半透明外层/剖切"开关作为兜底。

### 3. 肌肉分组层级：数据层唯一真源

- free-muscles 用 17 个训练肌群；muscle_mapper 做三级子肌；MuscleMapJS 是 group→surface 两级，`LATISSIMUS_LEFT/RIGHT` 分左右面寻址。
- 经验：平铺 70+ 肌肉的 UI 不可用，但**不要为分组维护第二份 ID 映射**，否则模型、数据、UI 三处漂移。
- 结论：本项目 25 个肌肉 ID 是唯一真源；UI 层只按胸/背肩/手臂/核心/下肢/头颈做展示分组，映射写在一处常量表里。

### 4. 动作数据模型：字段少、渲染端零适配

- free-exercise-db 的 JSON 字段：`id / name / force / level / mechanic / equipment / primaryMuscles / secondaryMuscles / instructions / images`。
- 本项目面向中文教学，裁剪为：`name / nameEn / equipment / difficulty / sets / rest / target / steps / tips / alt(可选)`——9 个字段即可直接渲染卡片、无需再做英文翻译层。
- 若后续需要"主/次目标肌"，按 free-exercise-db 的 `primaryMuscles/secondaryMuscles` 思路扩展即可，但离线体积优先，不引入 images。

### 5. 解剖资产许可证风险：先看许可证再看效果

- CC BY-SA 4.0（Z-Anatomy 及其衍生 glb）：可商用但**修改后的模型必须同样 CC BY-SA 开源**，闭源分发即违约。
- CC BY 4.0（BodyParts3D）：可自由使用/修改/再分发，唯一硬性义务是官方指定文案署名。
- MIT / Apache-2.0（Jsplice/MuscleMap、body-muscles、Fitness-OS）：可复用代码与数据，保留版权与许可声明；Apache-2.0 另含专利授权与 NOTICE 要求。
- 无许可证（muscleview、workout-planner、多数新仓库）：**默认保留所有权利，不能拷贝任何资产或代码**，只能"读设计思路"。
- 结论：本项目不拷贝任何第三方 glb/SVG 路径，模型自建、数据自写。

### 6. 离线自包含交付：file:// 的三个坑

- hpfrei 把 three.js、tween.js、Draco 解码器全部放进 `public/libs`，无 CDN、无构建工具——这是最接近本项目目标的做法。
- vulovix/body-muscles 提供可直接 file:// 打开的 UMD 构建；而 hpfrei、kilnwire 都要求本地 HTTP 服务器。
- 关键坑：file:// 下 `<script type="module">` 的 `import` 会被 CORS 拦截，因此必须用经典脚本（本项目 `vendor/three.min.js` + `vendor/OrbitControls.js` 正是按此布置）。
- 结论：全部依赖本地化、不用 ESM import、不 fetch 任何资源，才能保证"双击 index.html 即开"。

## 四、本项目取舍

- **模型**：原创程序化 three.js 人体（球体/圆柱/胶囊/lathe 组合），不引入任何第三方网格；每块肌肉独立 mesh + `userData.muscleId`，高亮与侧栏数据同源。
- **数据**：自写 `src/data/exercises.js`（25 个肌肉 ID × 86 个中文动作，含步骤/易错点/替代动作），不直接导入 free-exercise-db（英文、无中文要领），只借鉴其分类字段设计。
- **许可证边界**：MIT / Apache-2.0 可复用（保留声明）；CC BY 4.0 可复用（必须署名）；CC BY-SA 4.0 慎用（衍生须同协议开源）；无许可证 = 不可复用。
- **交付**：`index.html` 双击离线运行；three.js 与 OrbitControls 本地 vendor；无 CDN、无构建步骤、无网络请求。
- **不采用 2D SVG 路线**（body-muscles / MuscleMap 系）作为主线，但保留其"按训练量强度着色"的配色思路，用于肌肉高亮渐变。

## 五、遗留风险与待办

- 程序化模型表现力有限：深层小肌（冈下肌、前锯肌、髂腰肌）在正面视图中不可见，必须靠剖切/半透明/后视图提供入口。
- 编码：`exercises.js` 为 UTF-8 无 BOM，`index.html` 必须声明 `<meta charset="utf-8">`，否则部分 Windows 浏览器会按 GBK 解码导致中文乱码。
- 数据规模：86 个动作小于 free-exercise-db 的 800+，但本项目离线场景够用；后续可按同一 schema 扩写。
- 许可证表述以官方页面为准：BodyParts3D 已更新为 CC BY 4.0（2025-02-27），引用旧资料时注意其常被误写为 CC BY-SA 2.1 Japan。

## 六、一句话选型结论

- 若想直接拿"现成 3D 肌肉模型"：只有 Z-Anatomy 系可用，而 CC BY-SA 4.0 意味着你的模型衍生也必须同协议开源。
- 若想拿"可自由复用的肌肉图资产"：只有 MIT 的 Jsplice/MuscleMap（Web）与 melihcolpan/MuscleMap（Swift/iOS）。
- 若想"双击 index.html 离线打开"：程序化几何 + 经典 script 是唯一稳的组合，任何 glb/SVG 的 fetch 方案都必须配本地服务器。
- 本项目按第三种的约束反推设计，因此模型自建、数据自写、依赖全部 vendor 到本地。
