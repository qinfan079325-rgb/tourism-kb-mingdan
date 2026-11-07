# 散客数据看板

导管用公开数据看板（原 mingdan），两子页：

| 页 | 说明 |
|---|---|
| [未出团](https://qinfan079325-rgb.github.io/tourism-kb-mingdan/) | 登录后读取 `GET /api/board-kb/upcoming`；按出团日折叠 |
| [已完团](https://qinfan079325-rgb.github.io/tourism-kb-mingdan/completed.html) | 仅管理员。登录后读取 `GET /api/board-kb/completed`；页面不嵌名单 |

对外名称：**散客数据看板**。与公开收客看板 `tourism-kb-shouke` **完全分离**（独立仓库），不写入 shouke 首页。URL 路径仍为 `tourism-kb-mingdan`。

## 访问（需登录）

打开页面需输入**用户名 + 密码**。登录打到 Worker（`POST /api/login`、`GET /api/me`、`POST /api/logout`），会话是服务端 Cookie，CSRF 只留在页面内存，不写入 `localStorage`。未出团 / 已完团名单不在本仓库 HTML 里，登录后读取 `GET /api/board-kb/upcoming` 与（仅管理员）`GET /api/board-kb/completed`，响应形如 `{ok:true,kind:"upcoming",board:...}`。帽子云走同源 `/api`；GitHub Pages 改打 `https://tourism-kb-id-ocr.qinfan079325.workers.dev/api`。

管理员登录后，页顶出现「账号管理」，打开独立页：用户名、密码、角色（普通用户 / 管理员）和「添加人员」，以及账号表上的删除。普通用户提交为 Worker 角色 `staff`。创建时密码只要非空。不能删除初始管理员秦凡，也不能删除自己。登录成功直接进入，不再强制修改初始密码。未出团、已完团、模糊订单页不再内嵌这块表单。

秦凡这一行账号不在静态页里。旧页面只在浏览器用哈希对口令，通过后 `sessionStorage` 只存用户名，没有可导入的服务端账户（线上 D1 `users=0`）。公开哈希不能当成密码。本仓库没有 Worker 源码，不能改 `doSetup`。线上脚本若在初始化时把 `must_change_password` 写成 1，只改静态页去弹窗并不能让登录后的业务通过。静态页不初始化秦凡这一行。

普通用户可看未出团、模糊订单。导航不显示「已完团」和「账号管理」；直接打开 `completed.html` 只看到「仅管理员可查看已完团」，不会请求已完团数据。直接打开 `accounts.html` 只看到「仅管理员可管理账号」，不会请求账号列表。

| 项 | 值 |
|---|---|
| GitHub Pages 未出团 | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/ |
| GitHub Pages 已完团（仅管理员） | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/completed.html |
| GitHub Pages 模糊订单 | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/upload.html |
| GitHub Pages 账号管理（仅管理员） | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/accounts.html |
| GitHub Pages 传名单 | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/roster.html |
| GitHub Pages 对账 | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/recon.html |
| 帽子云上传 | https://mingdanupload-10m363dc.maozi.io/upload |
| 仓库 | https://github.com/qinfan079325-rgb/tourism-kb-mingdan |

所有日期默认折叠，点天头展开。页顶可互相切换。

## 传名单 / 对账

这两页不进散客看板，也不进 `upload.html` 导航。传名单是签单同事把名单交给总助买保险；对账是按清算表单独算钱。

| 页 | 地址 |
|---|---|
| 传名单 | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/roster.html |
| 对账 | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/recon.html |

页面合并进 `main` 后才会出现在 GitHub Pages。帽子云目前只反代 `/drafts` 和 `/ocr`，这两页请走上面的 Pages 地址。

### 怎么试传名单

传名单页不用登录，也没有团号。

1. 打开传名单页。日期填 `11.6`。起保日会变成第二天，承保天数默认 3，止保日含起保当天。这三项都能改。承保时间不同的人要单独再交一单，因为保险分开买。
2. 国内身份证整段粘贴后点「识别名单」。护照、港澳台、外籍在下面逐行填姓名、证件类型、证件号码、性别、出生日期。
3. 填参加线路和人均。队长整团把人均填 `0`，或勾选「队长」。总金额按不含队长的人数计算。
4. 点「提交给助手」。成功时列出线路、人数、队长、总金额、起保日、止保日、天数。

提交之后的实际路径：

1. 浏览器直接 `POST /roster` 到 `https://tourism-kb-id-ocr.qinfan079325.workers.dev/roster`。这一页不登录。对账页的读取仍要看板登录。
2. Worker 把这一组写入 D1 表 `signed_rosters`。队长记 `is_captain` / `is_gift`。人均为 0 的整组都算赠送。总金额只算不赠送的人。
3. Worker 再调用已经在用的保险名单通知：`INSURANCE_ROUTINE_WEBHOOK_URL`，事件 `insurance_list_submitted`，`via=roster`，`auto_order=false`。正文是 `[保险名单通知]`，里面有起保日、止保日、承保天数、线路和客人。队长仍在名单里，并单独标出。
4. 总助的「保险名单通知」例程收到后，就可以按这份名单去 chinatourins.com 买保险。这个网站不会自己下单。

通知失败时名单仍然留在库里，页面会写明没通知到。本页「助手已收到的名单」可读最近 20 条。

### 怎么试对账

打开对账页，选日期，点「读取这一天」。人数按传名单分成三档，队长不在任何一档里。也可以手工改人数。公式和清算表一致：

- 80总额 = 80人数 × 80
- 少总额 = 少人头 × 60
- 外籍总额 = 外籍人数 × 160
- 合计金额 = 上面三项相加
- 系统当日金额 = 系统当日总额 − 系统前日总额（前日空按 0）
- 差额 = 系统当日金额 − 合计金额 + 手续费
- 返款 = 80人数×35 + 少人头×20 + 外籍人数×85 + 差异金额

差额是算出来的，差异金额要手填，返款加的是差异金额。清算表前半段少人头返款是 25、外籍返款是 0，页面上可以切到「早期系数」。保存走 `POST /recon`，按日期写 D1 表 `recon_days`。

`node roster-math.test.js` 用清算表里的几天对过这些公式。

## 未出团字段

- **家庭组数 / 游客人数 / KB合计**：按天汇总。
- **名字 / 年龄 / 人群 / 户籍地 / 跟单价 / 需要查询 / 初步分析**（脱敏）。

## 已完团字段（顺序）

1. 团号  
2. 导游  
3. 单组游客信息（与未出团同结构：人数、人群、户籍、成员表、跟单价、需要查询、初步分析）  
4. 最低消费金额  
5. 预期消费金额（钉钉 `#VALUE!` 显示为空）  
6. 翡翠金额  
7. 翡翠人均  
8. 组团社  

日头另显示当日翡翠金额合计。

页面**不展示**完整身份证号、电话号码字段。

## 数据范围

- 源：`dingtalk_exports/` 下最新 `散客数据总表_*.xlsx` → sheet「小组级数据」
- 未出团：`出团日期 >= 今天(Asia/Shanghai)` 且「小组姓名」非空
- 已完团：`完团日期 >= 2026-07-01` 且「小组姓名」非空

## 每日更新（钉钉同步后自动）

```bash
/workspace/tourism-kb-model/web/mingdan/deploy.sh || echo "MINGDAN deploy failed (non-blocking)"
```

`sync_from_dingtalk.py --rebuild` 结束时也会**尽力**本地重建；带 `--publish-mingdan` 时再调用 `deploy.sh` 推送。

**不要**把本站 HTML 拷进 `tourism-kb-shouke` 公开仓。

## 构建命令

```bash
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py --xlsx /path/to/file.xlsx
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py --today 2026-10-26   # 测试
```

本仓库页面是无名单静态壳。未出团名单只在登录后的私有接口里，不要再把客人 JSON 写进 `index.html`。

## 一键重建并推送

```bash
/workspace/tourism-kb-model/web/mingdan/deploy.sh
```

## 模糊订单上传（独立页）

登录后打开 **模糊订单** 页：https://qinfan079325-rgb.github.io/tourism-kb-mingdan/upload.html

流程：解析 → **销售在本页勾选并点确认** →「已确认待易途」→（助手录易途后由后台 API 回写「已进易途」+订单号）→ 正式未出团仍靠**钉钉同步**。

### 改单

1. 销售点「申请改单」，填写改单说明并改右侧字段，点「提交改单」
2. **尚未进易途**：只更新本页草稿（状态仍「已确认待易途」）
3. **已进易途**：状态变「待同步易途」；「复制通知助手」/下载 JSON 通知我
4. 易途改完后点「易途已更新」；变更记录留在订单上
5. 已进未出团的以钉钉同步覆盖为准

### 截图识别

- 粘贴/拖入/选图：护照、台胞证、12306 火车票、航班截图（浏览器端 Tesseract.js，chi_sim+eng）
- 「识别证件 → 名单」写入客人名单；「识别交通 → 去程/返程」或「自动」填交通字段
- 仅改本页草稿字段，不写未出团 DATA；首次识别需下载中文模型，稍慢属正常

### 其它

- 左右对照：左原文、右可改字段
- 去重提示：组团社 + 出团日 + 代表人 相同则警告
- KB 只取结算明细纯数字项（汉字说明项不计）
- 不改未出团/已完团钉钉名单与展示逻辑

## 中国大陆访问（帽子云）

- 上传页（大陆可达）：https://mingdanupload-10m363dc.maozi.io/upload
- **前端**：在 `*.maozi.io` 上草稿/OCR 走**同源** `/drafts`、`/ocr`（不再直连 `workers.dev`，避免国内拦截）。GitHub Pages 仍直连 Worker。
- **必须配置网关反代**（保存后立即生效，无需重新部署应用；前端改完仍需点一次「重新部署」拉新页面）：

### 帽子云反向代理（一次性）

1. 打开 [帽子云控制台](https://maozi.io) → 登录 → 进入应用 **mingdanupload**
2. 应用详情 → **规则** → **反向代理规则** → **添加反向代理规则**
3. 填写：
   - 规则名称：`drafts-ocr-worker`（≤30 字）
   - 匹配规则：**自定义筛选**
     - 条件组 1：请求路径 **开头是** `/drafts`
     - 点「或者」加条件组 2：请求路径 **开头是** `/ocr`
   - 协议：**HTTPS**
   - Host 透传：**使用 Upstream 节点 Host**（重要，否则 Worker 证书/Host 会挂）
   - 节点：Host = `tourism-kb-id-ocr.qinfan079325.workers.dev`，Port = `443`，Weight = `100`
   - 超时：连接 15、发送 30、**读取 90**（OCR 可能较慢）
4. 保存并确认规则开关为**启用**。不必重新部署应用。
5. 本机验证（或让助手验）：  
   `GET https://mingdanupload-10m363dc.maozi.io/drafts?account=测试`  
   带 `Authorization: Bearer <SHARED_SECRET>` 应返回 Worker JSON（`{"ok":true,...}`），而不是 `bad_auth_token` / `not_found`。
6. 同事打开上传页强制刷新（Ctrl+Shift+R / Cmd+Shift+R）。

> 控制台规则 API 暂无法用脚本可靠创建（Scheme/PassHost/Nodes 常绑不上）。不要开通付费 Web 反代，除非主人明确同意花钱。

