# 未出团名单（内部站）

导管用的**未出团客人名单**看板：按出团日期分天折叠，含家庭组数、游客人数、名字、年龄、人群、户籍地、初步分析。

> 内部资料，勿外传。与公开收客看板 `tourism-kb-shouke` **完全分离**，不写入公开首页姓名。

## 访问

| 项 | 值 |
|---|---|
| 本地文件 | `/workspace/tourism-kb-model/web/mingdan/site/index.html` |
| GitHub Pages | https://qinfan079325-rgb.github.io/tourism-kb-mingdan/ |
| 仓库 | https://github.com/qinfan079325-rgb/tourism-kb-mingdan |
| 口令 | `jiuwu2026`（前端写死，改口令请改 `build_mingdan.py` 里 `PASSWORD` 后重建） |

首次打开需输入口令；通过后记在本机 `localStorage`，同浏览器再次打开不用重输。

## 字段说明

- **家庭组数 / 游客人数**：按天汇总，写在每天折叠标题上（如 `10月27日 · 10组 · 28人`）。
- **名字**：钉钉「小组姓名」按换行拆人。
- **年龄**：以出团日为基准，从身份证第 7–14 位推算；护照成员不写年龄。
- **人群**：年龄档 — 青年(&lt;45)、中年(45–59)、老年(60–69)、高龄(70+)；组级汇总如 `老年2+中年1`，并附粗标签（单人/夫妻/家庭）。
- **户籍地**：身份证前 6 位 → 省/市；护照写「境外/护照」。
- **初步分析**：钉钉原文，但**脱敏**完整身份证、手机号、银行卡号（仅留末 4 位）。

页面**不展示**完整身份证号、电话号码字段。

## 数据范围

- 源：`dingtalk_exports/` 下最新 `散客数据总表_*.xlsx` → sheet「小组级数据」
- 筛选：`出团日期 >= 今天(Asia/Shanghai)` 且「小组姓名」非空

## 每日更新（钉钉同步后）

```bash
# 1) 照常同步公开模型（已有流程）
python3 /workspace/tourism-kb-model/sync_from_dingtalk.py --xlsx /path/to/散客数据总表_YYYYMMDD.xlsx --rebuild
python3 /workspace/tourism-kb-model/web/build_site.py
# 推送 tourism-kb-shouke …

# 2) 重建未出团名单站并推送
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py
cd /workspace/tourism-kb-model/web/mingdan/site
git add index.html && git commit -m "mingdan: sync $(date +%Y%m%d)" && git push origin main
```

或在已 clone 的发布目录里只更新 `index.html` 后 push。例行「每日钉钉数据同步」里可在 `build_site.py` 之后加一行可选：

```bash
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py || true
# 再按需推送 tourism-kb-mingdan
```

**不要**把本站 HTML 拷进 `tourism-kb-shouke` 公开仓。

## 构建命令

```bash
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py --xlsx /path/to/file.xlsx
python3 /workspace/tourism-kb-model/web/mingdan/build_mingdan.py --today 2026-10-26   # 测试
```

产物：`web/mingdan/site/index.html`（单页自包含 CSS/JS，手机可打开）。
