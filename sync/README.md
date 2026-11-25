# KidLG GitHub 数据中转（激活作废 / 进度同步）

浏览器**不能**安全地直接改 GitHub 仓库。  
本目录提供 **Cloudflare Worker**：密钥只放在 Worker 里，读写仍全部落在你的 GitHub 仓库（`data/codes.json`、`data/progress/`）。

## 效果

- 用户兑码 → Worker 把该码在 `data/codes.json` 标成 `used` 并 commit  
- 换浏览器 / 换设备再兑同一码 → 提示已使用  
- 进度可选同步到 `data/progress/<codeHash>.json`

## 一次性配置

### 1. 创建 GitHub Token

GitHub → Settings → Developer settings → Fine-grained personal access tokens  

- Repository：仅 `betterma/kidLG`  
- Permissions → Contents：**Read and write**  
- 复制 token（只显示一次）

### 2. 部署 Worker

需免费 [Cloudflare](https://dash.cloudflare.com/) 账号与 Node.js。

```bash
cd sync/worker
npm install
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
# 粘贴上一步的 token
npx wrangler deploy
```

记下输出的地址，例如：`https://kidlg-api.<你的子域>.workers.dev`

### 3. 写入网站配置

编辑仓库根目录 `config.json`：

```json
"license": {
  "endpoint": "https://kidlg-api.<你的子域>.workers.dev"
},
"sync": {
  "enabled": true,
  "endpoint": "https://kidlg-api.<你的子域>.workers.dev"
}
```

两个 endpoint 可填同一个。然后 push `config.json`（会触发 Pages 部署）。

### 4. 验证

```bash
curl https://kidlg-api.<子域>.workers.dev/health
```

前台用未使用过的激活码开通；到仓库 `data/codes.json` 应看到该码 `"status": "used"`。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/redeem` | `{ code, deviceId }` → 远程作废并返回权益 |
| POST | `/checkout` | `{ stageIds, mock:true }` → 模拟支付并写入新激活码 |
| PUT | `/progress` | 进度快照 |
| GET | `/progress/:codeHash` | 拉取进度 |
| DELETE | `/progress/:codeHash` | 清除云端进度 |

`ALLOW_MOCK_CHECKOUT` 默认可演示购买；若设为字符串 `false` 则关闭前台模拟支付。

## 说明

- 数据真相在 GitHub；Worker 只是带密钥的笔。  
- Token 不要写进前端或公开仓库。  
- 未配置 `license.endpoint` 时，前台会提示「激活服务未配置」。
