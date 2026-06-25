# Podcast Downloader (雙模通用版)

一個現代化、零套件依賴、外觀精美的 Podcast 下載工具。此專案已整合為**雙模通用架構**，同時支援「本地運行直接下載」與「線上靜態網頁（GitHub Pages）運作」！

## 🌟 雙模運作機制

程式會自動根據網頁開啟的網址（`window.location.hostname`）切換對應模式：

### 1. 本地伺服器模式 (Local Server Mode) —— 最推薦 👍
* **啟用方式**：在本地執行 `python app.py` 並在瀏覽器打開 `http://localhost:8990`。
* **特色**：
  - 解鎖 **「開始下載已選集數」** 按鈕與實時進度條。
  - 直接透過 Python 後端將音檔下載並儲存至您電腦的實體硬碟資料夾（例如 `Downloads/Podcasts/節目名稱`）。
  - 有防伺服器鎖 IP / 頻率機制，下載極度穩定。
  - **適合對象**：希望一鍵下載音檔，直接存入硬碟的用戶。

### 2. 靜態網頁模式 (Static Web Mode)
* **啟用方式**：雙擊直接開啟 `index.html` 檔案（`file:///` 協議）或部署至 **GitHub Pages** 線上網址。
* **特色**：
  - 解鎖 **「批次下載工具箱」**（包含複製 MP3 連結、調用瀏覽器順序下載）。
  - 無需執行任何終端機指令或安裝 Python 後端，直接在線上即可解析 Apple Podcasts 節目與單集。
  - **下載路徑**：調用瀏覽器下載時，檔案會存入您瀏覽器的「預設下載位置」中（例如 Windows 的「下載`C:\Users\user\Downloads`」）。
  - **一鍵批次複製**：可一次複製所有已選集數的網址，貼上到 JDownloader 或 IDM 直接高速批次下載，最適合備份整檔節目。
  - **適合對象**：不想在電腦執行指令，想線上直接解析網址並取得 MP3 下載連結的用戶。

---

## 🚀 快速開始

### 本地使用 (儲存至指定硬碟路徑)
1. 在專案目錄下開啟終端機（PowerShell / CMD），執行：
   ```bash
   python app.py
   ```
2. 網頁會自動開啟 `http://localhost:8990/`，填入網址後即可直接下載。

### 線上使用 (GitHub Pages 部署)
1. 前往您的 GitHub 專案：`https://github.com/Datum92/Podcast-Downloader`
2. 點擊 **Settings -> Pages**。
3. 將 Branch 改為 **`main`**，目錄選擇 `/ (root)`，點擊 **Save**。
4. 稍等一分鐘即可在線上網址解析與下載。

---

## 🛠️ 技術架構

- **Backend (Local Mode)**: Python 3 多執行緒伺服器，`urllib` 無阻礙下載並存入指定路徑。
- **Frontend (Static Mode)**: HTML5 + Vanilla CSS (Glassmorphism 暗色調)、JavaScript。內建雙代理伺服器備用鏈（`corsproxy.io` 與 `allorigins.win` JSONP 備援），在純網頁端無 CORS 跨網域限制抓取 XML/HTML。
