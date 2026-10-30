# 散客数据看板

导管用公开数据看板（原 mingdan），两子页：

| 页 | 说明 |
|---|---|
| [未出团](https://qinfan079325-rgb.github.io/tourism-kb-mingdan/) | 出团日期 ≥ 今天；按出团日折叠 |
| [已完团](https://qinfan079325-rgb.github.io/tourism-kb-mingdan/completed.html) | 入库完团日期 ≥ 2026-07-01；按**出团日**折叠 → 导游 → 单组 |

对外名称：**散客数据看板**。与公开收客看板 `tourism-kb-shouke` **完全分离**（独立仓库），不写入 shouke 首页。URL 路径仍为 `tourism-kb-mingdan`。

## 访问（需登录）

打开页面需输入**用户名 + 密码**后方可查看名单正文；未出团 / 已完团两页共用登录态，页内可「退出」。

| 项 | 值 |
|---|---|
| 本地 | `/workspace/tourism-kb-model/web/mingdan/site/index.html` · `completed.html` · `upload.html` |
| GitHub Pages 未出团子页 | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/ |
| GitHub Pages 已完团子页 | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/completed.html |
| 仓库 | https://github.com/qinfan079325-rgb/tourism-kb-mingdan |

所有日期默认折叠，点天头展开。页顶可互相切换。账号由管理员单独发放（前端哈希门禁，非后端鉴权）。

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

产物：`web/mingdan/site/index.html` + `completed.html` + `upload.html`（自包含 CSS/JS）。模糊订单仅在 `upload.html`；易途完成前不写入未出团。

## 一键重建并推送

```bash
/workspace/tourism-kb-model/web/mingdan/deploy.sh
```

## 模糊订单上传（独立页）

登录后打开 **模糊订单** 页：https://qinfan079325-rgb.github.io/tourism-kb-mingdan/upload.html

流程：解析 → **销售在本页勾选并点确认** →「已确认待易途」→（助手录易途后）「标记易途已录入」→ 正式未出团仍靠**钉钉同步**。

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
- 草稿/OCR 仍指向 Cloudflare Worker；已放行 maozi Origin，客户端超时 45s/60s、重试×3。
- 同域 `/drafts` `/ocr` 网关反代：控制台规则 API 暂未能用脚本创建（需在 应用详情→规则→反向代理 手工添加，或付费 Web 反代）。

