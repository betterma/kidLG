# KidLG

幼儿少儿进阶学习游戏（网页版）。木墙缺口字母嵌合；GitHub Pages 托管；配置与激活码数据在仓库 JSON。

## 本地预览

不要用 `file://` 直接打开。在项目根目录：

```bash
npx --yes serve -l 5173
```

- 前台：`http://localhost:5173/`
- 后台：`http://localhost:5173/admin/`（需先用 `admin/vault-seal.html` 封存 Token，见 `admin/README.md`）

## 功能概览

- **字母世界**：小写 a–z + 大写 A–Z，共 52 关（免费）
- **拼音 / 汉字 / 单词 / 词语**：可玩关卡 + 地图购买开通
- **用户流程**：点锁定世界 → 模拟支付 → 自动发码并开通 → 进入关卡
- **设置**：也可手动填激活码；清除进度
- **管理后台**：费用配置、发码、推送到 GitHub（Token 保险库）

## GitHub Pages 与内容 JSON

| 内容 | 如何上线 | 是否跑 Actions |
|------|----------|----------------|
| `html` / `css` / `js` / `assets` / `admin` / `config.json` | Pages 部署 | 会 |
| `data/*.json`（价、码、关卡） | 推 `main` 后线上直读 raw | **不跑** |

线上站点：`https://betterma.github.io/kidLG/`  
后台：`https://betterma.github.io/kidLG/admin/`

Pages Source 请选 **GitHub Actions**。

## 后台发码流程（当前）

1. 首次：`/admin/vault-seal.html` 用 GitHub Token + 自设口令生成密文，写入 `github-token-vault.js` 并 push  
2. 打开 `/admin/`，用**管理口令**解锁（不是 Token）  
3. **费用配置** / **付费发码** → 点 **推送到 GitHub**（直接改仓库 `data/*.json`）  
4. 复制激活码发给用户；用户开通时由 Worker 把码标为 `used`  
5. 微信/支付宝自动收款以后再接到同一发码逻辑  

详见 `admin/README.md`。

## 激活码全局作废（必做）

纯静态页无法安全改 GitHub。需部署 `sync/worker`（免费 Cloudflare Worker），密钥只放 Worker，数据仍在本仓库。  

步骤见 **[sync/README.md](sync/README.md)**：创建 PAT → `wrangler deploy` → 把 Worker 地址写入 `config.json` 的 `license.endpoint`。

## 关键文件

| 文件 | 作用 |
|------|------|
| `config.json` | 应用名、管理口令、数据源、同步中转 |
| `data/stages.json` | 世界免费/收费与价格 |
| `data/codes.json` | 激活码 |
| `data/levels/letters.json` | 字母关卡（大小写两组） |

演示码：`DEMO-PINYIN-0001`、`DEMO-ALL-0001`（兑一次后远程 `status: used`）

## 文档

见 `docs/策划案-v0.1.md` 与 `docs/开发说明书-世界阶段与激活码.md`。
