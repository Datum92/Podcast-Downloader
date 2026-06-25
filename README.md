# Podcast Downloader

一個現代化、零依賴（Zero-dependency）且外觀精美的 Podcast 本地音檔下載工具。結合了 Python 的強大下載能力與 HTML/CSS/JS 的 Glassmorphism 卡片風格暗色調網頁介面。

## 🌟 特色功能

- 🎨 **現代化網頁介面**：使用 HSL 調色盤、玻璃擬態（Glassmorphism）與流暢的微動畫設計。
- ⚡ **零套件依賴**：完全基於 Python 標準庫開發，不需執行 `pip install` 安裝任何額外套件。
- 🔍 **強大解析支援**：
  - 支援 Apple Podcasts 節目與單集網址解析。
  - 支援直接輸入 Podcast RSS XML 訂閱源網址。
  - 當輸入單集網址時，會自動提示是否要「載入整檔節目（所有集數）」。
- 🗂️ **批次下載與篩選**：
  - 支援關鍵字搜尋過濾單集。
  - 快速鍵批次選擇（全選、反選、最新 10/50 集）。
  - 自動以 `[YYYY-MM-DD] 單集名稱.mp3` 的格式命名，便於在檔案總管中按日期排序。
- ⚙️ **穩定性防護**：
  - **自動逾時 (Timeout)**：設定 20 秒逾時機制，避免下載卡住。若單集失敗會自動跳過並繼續下載佇列中的下一集。
  - **頻率限制防護 (Polite Sleep)**：單集下載間隔 1 秒，防範被託管伺服器（例如 SoundOn）阻擋或封鎖。

---

## 🚀 快速開始

### 1. 複製並下載專案
將本專案複製到您的電腦本地目錄。

### 2. 執行伺服器
在專案目錄下開啟終端機（PowerShell / CMD），執行：
```bash
python app.py
```

### 3. 使用程式
伺服器啟動後，會**自動在您的預設瀏覽器中開啟** `http://localhost:8990/`：
1. 在輸入框中貼上 Podcast 網址（例如 Apple Podcasts 節目連結）。
2. 點擊 **「解析網址」**。
3. 勾選欲下載的集數（可搭配搜尋過濾或批次選擇按鈕）。
4. 設定本地儲存路徑（預設會下載至您的 `Downloads/Podcasts` 目錄）。
5. 點擊 **「開始下載已選集數」**，即可在右側即時看見下載速度與進度條！

---

## 🛠️ 技術架構

- **Backend**: Python 3 (使用 `http.server.ThreadingHTTPServer` 作為多執行緒伺服器，`urllib` 進行無 CORS 限制的下載，`xml.etree.ElementTree` 進行 RSS 訂閱源解析)。
- **Frontend**: HTML5, Vanilla CSS3 (自訂變數, Glassmorphism, 響應式佈局), Vanilla JavaScript (狀態管理與 API 輪詢)。
