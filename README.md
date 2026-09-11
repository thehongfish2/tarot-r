# ARCANUM 星軌塔羅聖儀 · Cloudflare 雲端版

[Tarot Ritual](https://github.com/moonlin1213/tarot-ritual)（本機優先的 3D 塔羅儀式）的 Cloudflare 移植：**單一 Worker + 靜態資產**（Cloudflare 自 2026 起建議的新專案架構）。訪客自備 LLM Base URL + API Key 即可獲得 AI 解讀，站主不需要自己的電腦一直開著。

## 部署：GitHub + Git 整合

1. 在 GitHub 建立新 repo，把本專案全部檔案推上去。
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import repository / Connect to Git**，選擇該 repo。
3. 建置設定：
   - Build command：留空
   - Deploy command：`npx wrangler deploy`（預設值即是）
4. 部署。網址為 `https://tarot-ritual.<你的子網域>.workers.dev`（前綴取自 `wrangler.toml` 的 `name`，可自行修改）。之後每次 `git push` 自動重新部署。

不需要任何環境變數。**不要**把自己的 API Key 放進環境變數——金鑰由每位訪客在自己瀏覽器的設定頁輸入，只存在頁面記憶體中，刷新即消失。

## 架構

```
public/             前端（Three.js 3D 儀式、牌庫、字體）+ _headers 安全標頭
src/worker.js       Worker 入口：/api/* 路由 + API 安全標頭
src/api/chat.js     三協議串流代理（OpenAI 相容 / OpenAI Responses / Anthropic）
src/api/models.js   模型列表探測
src/api/dsh.js      雲端無本機 DSH，固定回報「未發現」讓前端降級
src/api/dsh-import.js  同上
src/api/health.js   活性檢查
wrangler.toml       main + [assets] 設定
```

## OpenCode Zen 免費模型

設定頁內建一鍵預設：點「OpenCode Zen 免費模型」後只需貼上 Zen API Key（到 [opencode.ai](https://opencode.ai) 登入 Zen 取得），載入後在模型下拉選單選擇 `-free` 結尾的型號（或 `big-pickle`）即可零費用解讀。`muse-spark-1.3-contributor-free` 走 Responses 端點，請改用「Zen · Muse Spark Free」預設鈕。

代理層內建相容處理：上游對可選參數回 HTTP 400 時會自動精簡重試一次。

注意：依 Zen 政策，免費模型的提示與回覆可能被用於模型訓練——請勿在占問或照片中放入私密資訊。

## 功能

- 3D 星雲聖壇：洗牌渦旋、扇形選牌、飛牌入位、整組翻牌揭示、星爆粒子
- 五種牌陣（依問擇陣或自行選陣）、正逆位、牌義查閱
- AI 解讀：OpenAI 相容（chat/completions）、OpenAI Responses、Anthropic Messages 三種協議，SSE 串流
- 實景占卜：拍照上傳實體牌面，AI 辨識牌名與正逆位

## 行動裝置與動效優化（本移植版新增）

- `viewport-fit=cover` + safe-area-inset：瀏海機頂欄、底部手勢列不再遮擋內容
- 解讀面板在 ≤760px 寬度改為**底部抽屜**，相機取景同步改為垂直讓位
- 卡牌細讀改為底部全寬卡片；設置面板全寬；按鈕觸控目標 ≥44px
- 輸入框字體 ≥16px，避免 iOS 聚焦時自動放大頁面
- 面板改用 `svh` 動態視高，網址列伸縮不再造成版面跳動
- WebGL 效能：粗指針裝置 pixelRatio 上限 1.5、星辰/金塵粒子量降至 55%、分頁隱藏時暫停渲染省電
- `prefers-reduced-motion`：降低視差與環境漂移速度、停用入場動畫

## 與原版的差異

- 本機 Node 伺服器（server.mjs）→ Cloudflare Worker + 靜態資產；`/api/chat`、`/api/models` 行為與錯誤格式忠於原版
- 移除本機專屬功能：DSH 匯入、Codex 續期、cove-tarot-companion 陪伴接回（前端在無 `#companion-config` 時自動以單機模式運作）
- 全站安全標頭：靜態資產由 `public/_headers`、API 回應由 Worker 統一套用

## 隱私

- 訪客的 Base URL / API Key 只存在其瀏覽器頁面記憶體，重新整理即消失；不進伺服器日誌或環境變數
- `/api/chat` 僅轉發 HTTPS 上游，拒絕 URL 內嵌凭据；問題、牌陣與照片只送往訪客自己選定的 AI 服務

## 授權

- 引擎本體：ISC（見 `LICENSE`）
- Three.js 0.185.1：MIT（`public/vendor/LICENSE-three.txt`）
- Cinzel / Cormorant Garamond 字體：SIL OFL 1.1（`public/fonts/OFL-*.txt`）
- 再發佈時請保留上述署名檔。
