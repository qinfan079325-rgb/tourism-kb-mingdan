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

## 模糊订单上传（未出团 · MVP）

登录后打开 **模糊订单** 页（`upload.html`）上传/粘贴。流程：解析 → **销售确认无误** → 本机标「已确认待易途」。易途录完前**不进未出团**；未确认不上钉钉正式名单。字段与解析桩见 `upload/`。

- KB 只取结算明细纯数字项（汉字说明项不计）
- 助手通知：页内「复制通知助手」或下载 JSON（interim；尚无上传后端）
- 不改已完团页；不改钉钉导出合并逻辑

