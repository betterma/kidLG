# KidLG

幼儿少儿进阶学习游戏（网页版）。当前 MVP：木墙缺口英文字母嵌合，GitHub Pages 托管，配置与演示数据放在仓库 JSON。

## 本地预览

不要用 `file://` 直接打开（ES Module / fetch 会失败）。在项目根目录执行：

```bash
npx --yes serve -l 5173
```

或：

```bash
python -m http.server 5173
```

浏览器打开 `http://localhost:5173`。

## GitHub Pages（Actions）

部署由 `.github/workflows/pages.yml` 完成，避免 `data/*.json` 频繁修改刷流水线。

**会触发自动部署：** `html` / `css` / `js` / `assets` / `config.json` / 本 workflow  
**不会触发：** 只改 `data/**`（含 stages、codes、关卡 JSON）、只改 `docs/**`

只更新了 JSON、也要刷新线上时：GitHub → Actions → **Deploy GitHub Pages** → **Run workflow**（手动跑一次，会带上最新 JSON）。

配置步骤：

1. Settings → Pages → Build and deployment → Source 选 **GitHub Actions**  
2. 推送本仓库后，在 Actions 里确认首次部署成功（或手动 Run 一次）  
3. 访问 `https://<用户名>.github.io/<仓库名>/`

## 关键配置

| 文件 | 作用 |
|------|------|
| `config.json` | `edition`: `owner` \| `retail`；同步中转开关 |
| `data/stages.json` | 世界免费/收费与价格 |
| `data/codes.json` | 演示激活码 |
| `data/levels/letters.json` | 字母关卡组 |

- **Owner**：全世界大开（默认）  
- **Retail**：按 `stages.json` + 激活码门禁  
- 演示码：`DEMO-PINYIN-0001`、`DEMO-ALL-0001`

## 进度

- 未激活：只存浏览器 `localStorage`  
- 已激活：本机 + 可静默同步到 GitHub（需在 `config.sync` 配置中转 endpoint；Token 不可放前端）

## 发音

优先播放 `assets/audio/letters/a.mp3` … `z.mp3`；没有文件时用浏览器英语朗读兜底。

## 文档

见 `docs/策划案-v0.1.md` 与 `docs/开发说明书-世界阶段与激活码.md`。
