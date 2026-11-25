# KidLG 管理后台 · Token 保险库

公开仓库里**不再**放 `kidlg-admin` 这类明文口令。

## 原理

1. 用 **vault-seal.html** 把 GitHub PAT + 你自设的管理口令做成 AES-GCM 密文  
2. 密文粘进 `github-token-vault.js` 的 `EMBEDDED_BLOB`（可进仓库）  
3. 打开 `/admin/` 时输入管理口令 → 解密出 Token 到内存 → 才能推送 `stages.json` / `codes.json`  
4. 别人打开后台没有口令，无法写 GitHub  

Worker 用的 `GITHUB_TOKEN`（Cloudflare Secret）与此独立。

## 一次性设置

1. 准备 Fine-grained PAT（仅 `kidLG` 仓库，Contents: Read and write）——可用与 Worker 相同的那枚，或另建一枚  
2. 打开 `admin/vault-seal.html`（需本地静态服务或 Pages 已部署）  
3. 填入 Token + 自设口令（至少 6 位）→ 生成密文  
4. 编辑 `admin/github-token-vault.js`：

```js
export const EMBEDDED_BLOB = "这里粘贴整段密文";
```

5. `git push` 后，打开 `/admin/` 用**管理口令**解锁（不是 Token）

## 日常

- 费用配置 / 发码后点 **推送到 GitHub**  
- **锁定退出** 会清空内存 Token；未勾选「记住口令」时下次需重新输入  
