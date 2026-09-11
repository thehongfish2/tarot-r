# ARCANUM 星軌塔羅聖儀 · Cloudflare Pages 雲端版

[Tarot Ritual](https://github.com/moonlin1213/tarot-ritual)（本機優先的 3D 塔羅儀式）的 Cloudflare Pages 移植：靜態前端 + Pages Functions 代理，訪客自備 LLM Base URL + API Key 即可獲得 AI 解讀。不需要自己的電腦一直開著。

## 部署：GitHub + Pages Git 整合

1. 在 GitHub 建立新 repo，把本專案全部檔案推上去。
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 選擇該 repo，建置設定：
   - Framework preset：**None**
   - Build command：留空
   - Build output directory：`public`
4. **Save and Deploy**。之後每次 `git push` 自動重新部署。

不需要任何環境變數。**不要**把自己的 API Key 放進環境變數——金鑰由每位訪客在自己的瀏覽器設定頁輸入，只存在頁面記憶體中。

## 功能

- 3D 星雲聖壇：洗牌渦旋、扇形選牌、飛牌入位、整組翻牌揭示、星爆粒子
- 五種牌陣（依問擇陣或自行選陣）、正逆位、牌義查閱
- AI 解讀：OpenAI 相容（chat/completions）、OpenAI Responses、Anthropic Messages 三種協議，SSE 串流
- 實景占卜：拍照上傳實體牌面，AI 辨識牌名與正逆位
- 行動裝置優化（見下）

## 行動裝置與動效優化（本移植版新增）

- `viewport-fit=cover` + safe-area-inset：瀏海機頂欄、底部手勢列不再遮擋內容
- 解讀面板在 ≤760px 寬度改為**底部抽屜**，相機取景同步改為垂直讓位（`fitCamera` 手機分支）
- 卡牌細讀改為底部全寬卡片；設置面板全寬；按鈕觸控目標 ≥44px
- 輸入框字體 ≥16px，避免 iOS 聚焦時自動放大頁面
- 面板改用 `svh` 動態視高，網址列伸縮不再造成版面跳動
- WebGL 效能：粗指針裝置 pixelRatio 上限 1.5、星辰/金塵粒子量降至 55%、分頁隱藏時暫停渲染省電
- `prefers-reduced-motion`：降低視差與環境漂移速度、停用入場動畫

## 與原版的差異

- 移除本機專屬功能：DSH 匯入、Codex 續期、cove-tarot-companion 陪伴接回（`#companion-config` 不存在時前端自動以單機模式運作）
- `/api/chat`、`/api/models` 由 Node 伺服器改寫為 Pages Functions，僅保留「自訂神谕」路徑；行為與錯誤格式忠於原版
- `/api/dsh` 系列回報「未發現」，設定頁的 DSH 匯入按鈕已隱藏
- 全站安全標頭由 `functions/_middleware.js` 套用（CSP、nosniff、DENY frame 等）

## 隱私

- 訪客的 Base URL / API Key 只存在其瀏覽器頁面記憶體，重新整理即消失；不進伺服器日誌或環境變數
- `/api/chat` 僅轉發 HTTPS 上游，拒絕 URL 內嵌凭据；問題、牌陣與照片只送往訪客自己選定的 AI 服務

## 授權

- 引擎本體：ISC（見 `LICENSE`）
- Three.js 0.185.1：MIT（`public/vendor/LICENSE-three.txt`）
- Cinzel / Cormorant Garamond 字體：SIL OFL 1.1（`public/fonts/OFL-*.txt`）
- 再發佈時請保留上述署名檔。
