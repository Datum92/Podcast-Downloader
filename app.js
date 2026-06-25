// Global State
let podcastData = null;
let selectedEpisodes = new Set();
let searchQuery = "";
let isPolling = false;
let pollIntervalId = null;

// DOM Elements
const elUrlInput = document.getElementById("podcast-url");
const elBtnParse = document.getElementById("btn-parse");
const elParseLoading = document.getElementById("parse-loading");
const elParseLoadingText = document.getElementById("parse-loading-text");
const elParseError = document.getElementById("parse-error");
const elErrorMessage = document.getElementById("error-message");

const elShowCard = document.getElementById("show-card");
const elShowImage = document.getElementById("show-image");
const elBadgeType = document.getElementById("badge-type");
const elShowTitle = document.getElementById("show-title");
const elShowAuthor = document.getElementById("show-author");
const elShowDesc = document.getElementById("show-desc");
const elSingleEpisodeSuggestion = document.getElementById("single-episode-suggestion");
const elBtnLoadFullShow = document.getElementById("btn-load-full-show");

const elDownloadDirCard = document.getElementById("download-dir-card");
const elDownloadDirInput = document.getElementById("download-dir");

const elEpisodesCard = document.getElementById("episodes-card");
const elEpisodeCount = document.getElementById("episode-count");
const elEpisodeSearch = document.getElementById("episode-search");
const elBtnSelectAll = document.getElementById("btn-select-all");
const elBtnSelectNone = document.getElementById("btn-select-none");
const elBtnSelectLatest10 = document.getElementById("btn-select-latest-10");
const elBtnSelectLatest50 = document.getElementById("btn-select-latest-50");
const elHeaderSelectAll = document.getElementById("header-select-all");
const elEpisodesList = document.getElementById("episodes-list");
const elSelectedCount = document.getElementById("selected-count");
const elTotalCount = document.getElementById("total-count");
const elBtnStartDownload = document.getElementById("btn-start-download");

const elProgressCard = document.getElementById("progress-card");
const elBtnCancelDownloads = document.getElementById("btn-cancel-downloads");
const elProgressStatusIcon = document.getElementById("progress-status-icon");
const elQueueRemaining = document.getElementById("queue-remaining");
const elQueueCompleted = document.getElementById("queue-completed");
const elActiveDownloadContainer = document.getElementById("active-download-container");
const elActiveDownloadTitle = document.getElementById("active-download-title");
const elActiveProgressFill = document.getElementById("active-progress-fill");
const elActiveProgressPercent = document.getElementById("active-progress-percent");
const elActiveProgressSize = document.getElementById("active-progress-size");
const elActiveProgressSpeed = document.getElementById("active-progress-speed");
const elDownloadIdleContainer = document.getElementById("download-idle-container");

const elLogCompletedCount = document.getElementById("log-completed-count");
const elLogFailedCount = document.getElementById("log-failed-count");
const elCompletedLogList = document.getElementById("completed-log-list");
const elFailedLogList = document.getElementById("failed-log-list");

// Initialize Setup
window.addEventListener("DOMContentLoaded", () => {
    // Determine default base path based on Windows path separator
    const defaultBaseDir = "C:\\Users\\user\\Downloads\\Podcasts";
    elDownloadDirInput.value = defaultBaseDir;
    
    // Add Event Listeners
    elBtnParse.addEventListener("click", handleParse);
    elUrlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleParse();
    });
    
    elEpisodeSearch.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderEpisodesList();
    });
    
    elBtnSelectAll.addEventListener("click", selectAllVisible);
    elBtnSelectNone.addEventListener("click", selectNone);
    elBtnSelectLatest10.addEventListener("click", () => selectLatestN(10));
    elBtnSelectLatest50.addEventListener("click", () => selectLatestN(50));
    elHeaderSelectAll.addEventListener("change", toggleHeaderSelectAll);
    
    elBtnStartDownload.addEventListener("click", startSelectedDownloads);
    elBtnCancelDownloads.addEventListener("click", cancelDownloads);
    elBtnLoadFullShow.addEventListener("click", loadFullShowFromEpisode);
    
    // Tab switching for logs
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".log-panel").forEach(p => p.classList.add("hidden"));
            
            btn.classList.add("active");
            const activeTabId = btn.getAttribute("data-tab");
            document.getElementById(activeTabId).classList.remove("hidden");
        });
    });
    
    // Check initial downloader status (in case server restarted during download)
    checkDownloaderStatus();
});

// Helper: Format Bytes to Human Readable (KB, MB, GB)
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Handler: Parsing Podcast URL
async function handleParse() {
    const url = elUrlInput.value.trim();
    if (!url) {
        showError("請輸入網址。");
        return;
    }
    
    // UI State Reset
    hideError();
    showParseLoading("正在解析網址，請稍候...");
    elBtnParse.classList.add("loading");
    elBtnParse.disabled = true;
    
    elShowCard.classList.add("hidden");
    elDownloadDirCard.classList.add("hidden");
    elEpisodesCard.classList.add("hidden");
    
    try {
        const response = await fetch("/api/parse", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "伺服器解析失敗。");
        }
        
        // Success: store global data and display
        podcastData = data;
        displayPodcastInfo();
    } catch (err) {
        showError(err.message);
    } finally {
        hideParseLoading();
        elBtnParse.classList.remove("loading");
        elBtnParse.disabled = false;
    }
}

// Display Podcast details to cards
function displayPodcastInfo() {
    if (!podcastData) return;
    
    // Fill details
    elShowTitle.textContent = podcastData.show_title;
    elShowAuthor.textContent = podcastData.author || "未知創作者";
    
    if (podcastData.is_single) {
        elBadgeType.textContent = "單集";
        elShowDesc.textContent = "發佈日期: " + (podcastData.date || "無資料") + "\n時長: " + (podcastData.duration || "無資料");
        elSingleEpisodeSuggestion.classList.toggle("hidden", !podcastData.feed_url);
    } else {
        elBadgeType.textContent = "節目";
        elShowDesc.textContent = podcastData.description || "無描述資訊";
        elSingleEpisodeSuggestion.classList.add("hidden");
    }
    
    // Cover art fallback
    if (podcastData.image) {
        elShowImage.src = podcastData.image;
        elShowImage.classList.remove("hidden");
    } else {
        elShowImage.src = "";
        elShowImage.classList.add("hidden");
    }
    
    // Set default download folder path using sanitized show title
    const sanitizeTitle = podcastData.show_title.replace(/[\\/:*?"<>|]/g, "_").trim();
    const defaultBaseDir = "C:\\Users\\user\\Downloads\\Podcasts";
    elDownloadDirInput.value = `${defaultBaseDir}\\${sanitizeTitle}`;
    
    // Display cards
    elShowCard.classList.remove("hidden");
    elDownloadDirCard.classList.remove("hidden");
    
    // Handle episode list setup
    selectedEpisodes.clear();
    elEpisodeSearch.value = "";
    searchQuery = "";
    
    if (podcastData.is_single) {
        // Create an episode object for simple listing
        const singleEp = {
            title: podcastData.episode_title,
            url: podcastData.url,
            date: podcastData.date,
            duration: podcastData.duration
        };
        podcastData.episodes = [singleEp];
        selectedEpisodes.add(singleEp); // Pre-select the single episode
    }
    
    renderEpisodesList();
    elEpisodesCard.classList.remove("hidden");
    updateSelectionUI();
}

// Render dynamic episode table lines
function renderEpisodesList() {
    if (!podcastData || !podcastData.episodes) return;
    
    // Filter visible list based on search query
    const visibleEpisodes = podcastData.episodes.filter(ep => 
        ep.title.toLowerCase().includes(searchQuery)
    );
    
    elEpisodesList.innerHTML = "";
    elEpisodeCount.textContent = `(${podcastData.episodes.length})`;
    
    if (visibleEpisodes.length === 0) {
        elEpisodesList.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); font-style: italic;">沒有找到符合搜尋條件的集數</td></tr>`;
        return;
    }
    
    // Update Header checkbox state
    const allVisibleSelected = visibleEpisodes.every(ep => selectedEpisodes.has(ep));
    elHeaderSelectAll.checked = allVisibleSelected && visibleEpisodes.length > 0;
    
    visibleEpisodes.forEach((ep) => {
        const isSelected = selectedEpisodes.has(ep);
        const tr = document.createElement("tr");
        if (isSelected) tr.classList.add("selected");
        
        tr.innerHTML = `
            <td><input type="checkbox" class="ep-check" ${isSelected ? 'checked' : ''}></td>
            <td style="color: var(--text-sub);">${ep.date || 'N/A'}</td>
            <td class="episode-title-td" title="${ep.title}">${ep.title}</td>
            <td style="color: var(--text-muted);">${ep.duration || 'N/A'}</td>
        `;
        
        // Toggle selection on row click (excluding checkbox click to prevent double toggling)
        tr.addEventListener("click", (e) => {
            if (e.target.tagName !== "INPUT" && e.target.type !== "checkbox") {
                const check = tr.querySelector(".ep-check");
                check.checked = !check.checked;
                toggleEpisodeSelection(ep, check.checked, tr);
            }
        });
        
        // Toggle selection on checkbox change
        const checkbox = tr.querySelector(".ep-check");
        checkbox.addEventListener("change", (e) => {
            toggleEpisodeSelection(ep, e.target.checked, tr);
        });
        
        elEpisodesList.appendChild(tr);
    });
}

function toggleEpisodeSelection(episode, isSelected, rowElement) {
    if (isSelected) {
        selectedEpisodes.add(episode);
        rowElement.classList.add("selected");
    } else {
        selectedEpisodes.delete(episode);
        rowElement.classList.remove("selected");
    }
    
    // Sync Header Checkbox
    const visibleEpisodes = podcastData.episodes.filter(ep => 
        ep.title.toLowerCase().includes(searchQuery)
    );
    const allVisibleSelected = visibleEpisodes.every(ep => selectedEpisodes.has(ep));
    elHeaderSelectAll.checked = allVisibleSelected && visibleEpisodes.length > 0;
    
    updateSelectionUI();
}

// Update selection counts and button availability
function updateSelectionUI() {
    const selectedCount = selectedEpisodes.size;
    const totalCount = podcastData ? podcastData.episodes.length : 0;
    
    elSelectedCount.textContent = selectedCount;
    elTotalCount.textContent = totalCount;
    
    elBtnStartDownload.disabled = selectedCount === 0;
    elBtnStartDownload.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> 下載所選集數 (${selectedCount})`;
}

// Batch Selection Functions
function selectAllVisible() {
    if (!podcastData) return;
    podcastData.episodes.forEach(ep => {
        if (ep.title.toLowerCase().includes(searchQuery)) {
            selectedEpisodes.add(ep);
        }
    });
    renderEpisodesList();
    updateSelectionUI();
}

function selectNone() {
    selectedEpisodes.clear();
    renderEpisodesList();
    updateSelectionUI();
}

function selectLatestN(n) {
    if (!podcastData) return;
    selectedEpisodes.clear();
    // Assuming the list is ordered latest first
    const count = Math.min(n, podcastData.episodes.length);
    for (let i = 0; i < count; i++) {
        selectedEpisodes.add(podcastData.episodes[i]);
    }
    renderEpisodesList();
    updateSelectionUI();
}

function toggleHeaderSelectAll(e) {
    if (!podcastData) return;
    const isChecked = e.target.checked;
    
    podcastData.episodes.forEach(ep => {
        if (ep.title.toLowerCase().includes(searchQuery)) {
            if (isChecked) {
                selectedEpisodes.add(ep);
            } else {
                selectedEpisodes.delete(ep);
            }
        }
    });
    
    renderEpisodesList();
    updateSelectionUI();
}

// Handler: Start Downloads
async function startSelectedDownloads() {
    if (selectedEpisodes.size === 0) return;
    
    const downloadDir = elDownloadDirInput.value.trim();
    if (!downloadDir) {
        alert("請指定下載儲存路徑！");
        return;
    }
    
    const episodesToDownload = Array.from(selectedEpisodes).map(ep => ({
        title: ep.title,
        url: ep.url,
        date: ep.date
    }));
    
    try {
        const response = await fetch("/api/download", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                episodes: episodesToDownload,
                download_dir: downloadDir
            })
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "無法啟動下載任務。");
        }
        
        // Show progress card and start polling state
        elProgressCard.classList.remove("hidden");
        startPolling();
    } catch (err) {
        alert("啟動下載錯誤: " + err.message);
    }
}

// Handler: Cancel Downloads
async function cancelDownloads() {
    if (!confirm("確定要取消佇列中所有的下載任務嗎？")) return;
    
    try {
        await fetch("/api/cancel", { method: "POST" });
        // Polling will update UI state and stop itself
        checkDownloaderStatus();
    } catch (err) {
        console.error("取消下載錯誤: ", err);
    }
}

// Handler: Load Full Show when on single episode page
function loadFullShowFromEpisode() {
    if (!podcastData || !podcastData.feed_url) return;
    elUrlInput.value = podcastData.feed_url;
    handleParse();
}

// Downloader Polling management
function startPolling() {
    if (isPolling) return;
    isPolling = true;
    
    // Poll immediately, then every 1s
    checkDownloaderStatus();
    pollIntervalId = setInterval(checkDownloaderStatus, 1000);
}

function stopPolling() {
    if (!isPolling) return;
    isPolling = false;
    if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
    }
}

async function checkDownloaderStatus() {
    try {
        const response = await fetch("/api/status");
        if (!response.ok) return;
        
        const status = await response.json();
        updateProgressUI(status);
        
        // If there's an active download or items in queue, make sure we keep polling
        if (status.is_downloading || status.total_in_queue > 0) {
            elProgressCard.classList.remove("hidden");
            startPolling();
        } else {
            stopPolling();
        }
    } catch (err) {
        console.error("無法取得下載器狀態: ", err);
    }
}

function updateProgressUI(status) {
    // 1. Update queue details
    elQueueRemaining.textContent = status.total_in_queue;
    elQueueCompleted.textContent = status.completed_in_session;
    
    // 2. Active Download Card
    if (status.is_downloading && status.current_episode) {
        elDownloadIdleContainer.classList.add("hidden");
        elActiveDownloadContainer.classList.remove("hidden");
        
        const ep = status.current_episode;
        elActiveDownloadTitle.textContent = ep.title;
        elActiveDownloadTitle.title = ep.title;
        
        // Progress bar and numbers
        elActiveProgressFill.style.width = `${ep.percent}%`;
        elActiveProgressPercent.textContent = `${ep.percent}%`;
        
        const sizeDownloaded = formatBytes(ep.bytes_downloaded);
        const sizeTotal = formatBytes(ep.bytes_total);
        elActiveProgressSize.textContent = `${sizeDownloaded} / ${sizeTotal}`;
        
        const speedHuman = formatBytes(ep.speed);
        elActiveProgressSpeed.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${speedHuman}/s`;
        
        // Spin status icon
        elProgressStatusIcon.classList.add("fa-spin");
    } else {
        elActiveDownloadContainer.classList.add("hidden");
        elDownloadIdleContainer.classList.remove("hidden");
        elProgressStatusIcon.classList.remove("fa-spin");
    }
    
    // 3. Update logs
    elLogCompletedCount.textContent = status.completed.length;
    elLogFailedCount.textContent = status.failed.length;
    
    // Completed Log List
    if (status.completed.length > 0) {
        elCompletedLogList.innerHTML = status.completed.map(title => `
            <li class="completed-item">
                <span title="${title}"><i class="fa-regular fa-circle-check icon-green"></i> ${title}</span>
                <span style="color: var(--text-muted); font-size: 0.75rem;">已存檔</span>
            </li>
        `).reverse().join(""); // Show latest completed at top
    } else {
        elCompletedLogList.innerHTML = `<li class="empty-log">尚無完成的下載項目</li>`;
    }
    
    // Failed Log List
    if (status.failed.length > 0) {
        elFailedLogList.innerHTML = status.failed.map(item => `
            <li class="failed-item">
                <span title="${item.title}"><i class="fa-regular fa-circle-xmark icon-danger"></i> ${item.title}</span>
                <span class="item-error">${item.error}</span>
            </li>
        `).reverse().join("");
    } else {
        elFailedLogList.innerHTML = `<li class="empty-log">尚無失敗的下載項目</li>`;
    }
}

// UI State Helper Functions
function showParseLoading(text) {
    elParseLoadingText.textContent = text;
    elParseLoading.classList.remove("hidden");
}

function hideParseLoading() {
    elParseLoading.classList.add("hidden");
}

function showError(msg) {
    elErrorMessage.textContent = msg;
    elParseError.classList.remove("hidden");
}

function hideError() {
    elParseError.classList.add("hidden");
}
