# 一二布布 · 后端服务 (er-bubu-server)

Express + JWT 的轻量同步后端，提供：
- 用户注册 / 登录（JWT）
- 个人数据云端备份
- 圈子（夫妻小家）邀请码 + 公共空间同步（冰箱 / 待办 / 习惯打卡 / 学习榜 / 旅行 / 朋友圈 / 白板）
- 照片 / 语音媒体上传

## 本地运行

```bash
npm install
node server.js        # 默认 http://localhost:3000
```

环境变量（见 `.env.example`）：`PORT`、`JWT_SECRET`、`CORS_ORIGIN`、`DATA_DIR`。

## 一键部署到 Render（免费，支持 GitHub 登录）

1. 打开 https://render.com ，用 GitHub 登录（账号 lzhlzh66）。
2. New → Web Service → 选择仓库 `er-bubu-server`。
3. Render 会自动读取 `render.yaml`，无需改配置，点 Create Web Service。
4. 部署完成后得到一个地址，形如 `https://er-bubu-server.onrender.com`。
5. 在前端 App 的「设置 → API 地址」里填入该地址即可开启夫妻跨设备同步。

> 注意：Render 免费版会「休眠」，首次访问可能延迟几秒，属正常现象。
