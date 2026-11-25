# KidLG

幼儿少儿进阶学习游戏（网页版）。木墙缺口字母嵌合；GitHub Pages 托管；配置与激活码数据在仓库 JSON。

## 本地预览

不要用 `file://` 直接打开。在项目根目录：

```bash
npx --yes serve -l 5173
```

- 前台：`http://localhost:5173/`
- 后台：`http://localhost:5173/admin/`（口令见 `config.json` → `admin.passphrase`，默认 `kidlg-admin`）

## 功能概览

- **字母世界**：小写 a–z + 大写 A–Z，共 52 关（免费）
- **其它世界**：地图占位，需激活码
- **设置**：激活码开通、清除进度（未激活清本地；已激活清本地，有同步中转时顺带清云端）
- **管理后台**：费用配置、付费登记发码、激活码库、订单草稿

## GitHub Pages 与内容 JSON

| 内容 | 如何上线 | 是否跑 Actions |
|------|----------|----------------|
| `html` / `css` / `js` / `assets` / `admin` / `config.json` | Pages 部署 | 会 |
| `data/*.json`（价、码、关卡） | 推 `main` 后线上直读 raw | **不跑** |

线上站点：`https://betterma.github.io/kidLG/`  
后台：`https://betterma.github.io/kidLG/admin/`

Pages Source 请选 **GitHub Actions**。

## 后台发码流程（当前）

1. 打开 `/admin/`，口令登录  
2. **费用配置**：改价格/免费收费 → 下载 `stages.json` → 覆盖 `data/stages.json` → push  
3. **付费发码**：勾选世界、登记渠道与金额 → 生成一次性激活码 → 复制发给用户  
4. 下载 `codes.json` → 覆盖 `data/codes.json` → push（用户端即可兑换）  
5. 微信/支付宝自动收款回调：以后接到同一「生成激活码」逻辑；现为人工登记

请尽快修改默认口令 `kidlg-admin`。

## 关键文件

| 文件 | 作用 |
|------|------|
| `config.json` | 应用名、管理口令、数据源、同步中转 |
| `data/stages.json` | 世界免费/收费与价格 |
| `data/codes.json` | 激活码 |
| `data/levels/letters.json` | 字母关卡（大小写两组） |

演示码：`DEMO-PINYIN-0001`、`DEMO-ALL-0001`（一次性）

## 文档

见 `docs/策划案-v0.1.md` 与 `docs/开发说明书-世界阶段与激活码.md`。
