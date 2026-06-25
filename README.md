# Podcast Downloader (GitHub Pages 靜態版)

一個完全執行於瀏覽器前端、**免安裝任何後端**且外觀精美的 Podcast 音檔解析與下載工具。支援部署至 GitHub Pages 永久免費線上運作！

## 🌟 特色功能

- 🎨 **現代化網頁介面**：使用 HSL 顏色、玻璃擬態（Glassmorphism）與流暢的微動畫設計。
- ☁️ **純前端運作 (Serverless)**：利用免費公開的 CORS 代理伺服器（Allorigins）直接在網頁端抓取並解析網址，免去本地執行 Python 的麻煩。
- 🔍 **支援解析網址**：
  - 支援 Apple Podcasts 節目與單集網址解析。
  - 支援直接輸入 Podcast RSS XML 訂閱源網址。
  - 輸入單集網址時，會自動提示是否要「載入整檔節目（所有集數）」。
- 🗂️ **批次下載與篩選**：
  - 支援關鍵字搜尋過濾單集。
  - 快速鍵批次選擇（全選、反選、最新 10/50 集）。
  - 單集清單支援複製單集連結、單集瀏覽器下載。
- 🛠️ **多種批量下載工具**：
  - **複製下載連結 (推薦 👍)**：一鍵複製所有已勾選單集的 MP3 連結。打開下載軟體（如 JDownloader 或 IDM）即可自動偵測並以最大頻寬下載，最適合備份整檔節目。
  - **瀏覽器直接下載**：依序調用瀏覽器下載已選項目。*(使用前請在瀏覽器設定中允許此站台多重下載)*

---

## 🚀 啟用 GitHub Pages (讓網頁永久上線)

由於此版本是純靜態網頁，您可以直接使用 GitHub 免費的 Pages 服務將其發佈上線：

1. 前往您 GitHub 上的 Repository 頁面：`https://github.com/Datum92/Podcast-Downloader`
2. 點擊上方的 **Settings** (設定) 頁籤。
3. 在左側選單中找到 **Pages** 項目。
4. 在 **Build and deployment** 底下的 **Source** 選擇 `Deploy from a branch`。
5. 在 **Branch** 底下選擇 `main` (或 `master`) 分支，目錄保持 `/ (root)`，點擊 **Save**。
6. 稍等 1-2 分鐘後重新整理頁面，最上方會出現您的專屬線上網址（例如：`https://datum92.github.io/Podcast-Downloader/`）。

現在，任何人隨時隨地都可以透過該網址在瀏覽器中直接解析並下載 Podcast 了！

---

## 🛠️ 技術架構

- **Frontend**: HTML5, Vanilla CSS3 (自訂變數, Glassmorphism, 響應式佈局), Vanilla JavaScript (DOMParser XML 解析, Allorigins API CORS 代理)。
- **Zero Backend**: 不需要任何後端伺服器或資料庫。
