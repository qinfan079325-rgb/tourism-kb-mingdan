# 未出团名单

导管用的**未出团客人名单**看板：按出团日期分天折叠，含家庭组数、游客人数、名字、年龄、人群、户籍地（省+市）、初步分析。

与公开收客看板 `tourism-kb-shouke` **完全分离**（独立仓库），不写入 shouke 首页。

## 访问（公开、无口令）

| 项 | 值 |
|---|---|
| 本地文件 | `/workspace/tourism-kb-model/web/mingdan/site/index.html` |
| GitHub Pages | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/ |
| 仓库 | https://github.com/qinfan079325-rgb/tourism-kb-mingdan |

打开即可查看，**不设口令**。所有日期默认折叠，点天头展开。

## 字段说明

- **家庭组数 / 游客人数**：按天汇总，写在每天折叠标题上。
- **名字**：钉钉「小组姓名」按换行拆人。
- **年龄**：以出团日为基准，从身份证推算；护照不写年龄。
- **人群**：青年(&lt;45) / 中年(45–59) / 老年(60–69) / 高龄(70+)，组级汇总并附单人/夫妻/家庭粗标签。
- **户籍地**：**省+市**（如「山东省滨州市」）；直辖市只写市名；护照写「境外/护照」。含旧地级码兜底（如 3723→滨州）。
- **初步分析**：钉钉原文，放在组卡**右侧**（手机上下堆叠）；脱敏完整身份证、手机号、银行卡号。

页面**不展示**完整身份证号、电话号码字段。

## 数据范围

- 源：`dingtalk_exports/` 下最新 `散客数据总表_*.xlsx` → sheet「小组级数据」
- 筛选：`出团日期 >= 今天(Asia/Shanghai)` 且「小组姓名」非空

## 每日更新（钉钉同步后自动）

在 `sync_from_dingtalk.py --rebuild` 与公开看板 `build_site.py` / 推送 shouke **之后**执行（失败不阻断主看板）：

```bash
# 重建未出团名单并推送 Pages（推荐）
/workspace/tourism-kb-model/web/mingdan/deploy.sh || echo "MINGDAN deploy failed (non-blocking)"
```

`sync_from_dingtalk.py --rebuild` 结束时也会**尽力**本地重建 `web/mingdan/site/index.html`；带 `--publish-mingdan` 时再调用 `deploy.sh` 推送。

**不要**把本站 HTML 拷进 `tourism-kb-shouke` 公开仓。

## 构建命令

```bash
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py --xlsx /path/to/file.xlsx
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py --today 2026-10-26   # 测试
```

产物：`web/mingdan/site/index.html`（单页自包含 CSS/JS）。

## 一键重建并推送

```bash
/workspace/tourism-kb-model/web/mingdan/deploy.sh
```
