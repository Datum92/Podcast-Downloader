// Global State
let podcastData = null;
let selectedEpisodes = new Set();
let searchQuery = "";
let isBatchDownloading = false;
let batchDownloadQueue = [];
let batchDownloadIndex = 0;
let batchDownloadInterval = null;

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

const elDownloadToolsCard = document.getElementById("download-tools-card");
const elBtnCopyLinks = document.getElementById("btn-copy-links");
const elBtnBrowserDownload = document.getElementById("btn-browser-download");

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

const elBrowserProgressCard = document.getElementById("browser-progress-card");
const elBtnCancelBrowserDownload = document.getElementById("btn-cancel-browser-download");
const elBrowserQueueRemaining = document.getElementById("browser-queue-remaining");
const elBrowserQueueCompleted = document.getElementById("browser-queue-completed");
const elBrowserActiveTitle = document.getElementById("browser-active-title");
const elBrowserProgressFill = document.getElementById("browser-progress-fill");

// Initialize Setup
window.addEventListener("DOMContentLoaded", () => {
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
    
    elBtnCopyLinks.addEventListener("click", copySelectedLinks);
    elBtnBrowserDownload.addEventListener("click", startBrowserBatchDownload);
    elBtnCancelBrowserDownload.addEventListener("click", stopBrowserBatchDownload);
    elBtnLoadFullShow.addEventListener("click", loadFullShowFromEpisode);
});

// ----------------- CORS PROXY FETCHING -----------------

function fetchWithProxy(url) {
    return new Promise((resolve, reject) => {
        // Create a unique callback name
        const callbackName = 'allorigins_' + Math.random().toString(36).substring(2, 11);
        
        // Timeout handling (15 seconds)
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("代理伺服器連線逾時，請檢查網址或稍後再試。"));
        }, 15000);
        
        function cleanup() {
            clearTimeout(timeoutId);
            delete window[callbackName];
            const script = document.getElementById(callbackName);
            if (script) {
                document.body.removeChild(script);
            }
        }
        
        // Define global callback
        window[callbackName] = function(data) {
            cleanup();
            if (data && data.contents) {
                resolve(data.contents);
            } else {
                reject(new Error("代理伺服器未返回內容，請確認網址正確性。"));
            }
        };
        
        // Inject script tag for JSONP (bypasses local file:/// origin CORS)
        const script = document.createElement("script");
        script.id = callbackName;
        script.src = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&callback=${callbackName}`;
        
        script.onerror = function() {
            cleanup();
            reject(new Error("連線代理伺服器失敗，請檢查您的網路連線。"));
        };
        
        document.body.appendChild(script);
    });
}

// ----------------- PARSING LOGIC (CLIENT-SIDE) -----------------

function recursiveSearchKey(obj, keyToFind) {
    let results = [];
    if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
            for (let item of obj) {
                results = results.concat(recursiveSearchKey(item, keyToFind));
            }
        } else {
            for (let [k, v] of Object.entries(obj)) {
                if (k === keyToFind) {
                    results.push(v);
                }
                results = results.concat(recursiveSearchKey(v, keyToFind));
            }
        }
    }
    return results;
}

function recursiveSearchKeys(obj, keysList) {
    let results = [];
    if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
            for (let item of obj) {
                results = results.concat(recursiveSearchKeys(item, keysList));
            }
        } else {
            const hasAllKeys = keysList.every(k => k in obj);
            if (hasAllKeys) {
                results.push(obj);
            }
            for (let v of Object.values(obj)) {
                results = results.concat(recursiveSearchKeys(v, keysList));
            }
        }
    }
    return results;
}

function parseRssFeed(xmlText, feedUrl) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    // Check parse error
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
        throw new Error("RSS XML 解析出錯。");
    }
    
    const channel = xmlDoc.querySelector("channel");
    if (!channel) {
        throw new Error("找不到 RSS 的 <channel> 節點。");
    }
    
    // Extract metadata
    const showTitle = channel.getElementsByTagName("title")[0]?.textContent || "未知節目";
    const author = channel.getElementsByTagName("itunes:author")[0]?.textContent || 
                   channel.getElementsByTagName("author")[0]?.textContent || "";
    const description = channel.getElementsByTagName("description")[0]?.textContent || "";
    
    let showImage = "";
    const imageEl = channel.getElementsByTagName("image")[0];
    if (imageEl) {
        showImage = imageEl.getElementsByTagName("url")[0]?.textContent || "";
    }
    if (!showImage) {
        const itunesImage = channel.getElementsByTagName("itunes:image")[0];
        showImage = itunesImage?.getAttribute("href") || "";
    }
    
    const episodes = [];
    const items = channel.getElementsByTagName("item");
    
    for (let item of items) {
        const title = item.getElementsByTagName("title")[0]?.textContent || "無標題單集";
        
        const enclosure = item.getElementsByTagName("enclosure")[0];
        if (!enclosure) continue;
        const audioUrl = enclosure.getAttribute("url");
        if (!audioUrl) continue;
        
        const pubDateRaw = item.getElementsByTagName("pubDate")[0]?.textContent || "";
        let formattedDate = "";
        if (pubDateRaw) {
            try {
                const dateObj = new Date(pubDateRaw);
                if (!isNaN(dateObj)) {
                    formattedDate = dateObj.toISOString().split('T')[0];
                } else {
                    formattedDate = pubDateRaw;
                }
            } catch(e) {
                formattedDate = pubDateRaw;
            }
        }
        
        const duration = item.getElementsByTagName("itunes:duration")[0]?.textContent || 
                         item.getElementsByTagName("duration")[0]?.textContent || "";
        const desc = item.getElementsByTagName("description")[0]?.textContent || "";
        
        episodes.push({
            title: title,
            url: audioUrl,
            date: formattedDate,
            duration: duration,
            description: desc
        });
    }
    
    return {
        is_single: false,
        show_title: showTitle,
        author: author,
        description: description,
        image: showImage,
        feed_url: feedUrl,
        episodes: episodes
    };
}

async function parseApplePodcastUrl(htmlText, url) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    
    // Find script with id serialized-server-data
    const scriptEl = doc.getElementById("serialized-server-data");
    if (!scriptEl) {
        throw new Error("無法在頁面中解析 serialized-server-data 腳本。請確認是否為正確的 Apple Podcasts 網址。");
    }
    
    const serverData = JSON.parse(scriptEl.textContent.trim());
    
    // Check if it's an episode link
    const match = url.match(/[?&]i=(\d+)/);
    const episodeId = match ? match[1] : null;
    
    if (episodeId) {
        // Episode Page
        const episodesData = recursiveSearchKeys(serverData, ["streamUrl", "title"]);
        if (episodesData.length === 0) {
            // Fallback to streamUrl
            const streamUrls = recursiveSearchKey(serverData, "streamUrl");
            if (streamUrls.length === 0) {
                throw new Error("無法從此單集頁面解析音檔網址。");
            }
            return {
                is_single: true,
                episode_id: episodeId,
                show_title: "Apple Podcast 節目",
                episode_title: doc.title || "單集音檔",
                url: streamUrls[0],
                date: "",
                duration: "",
                image: "",
                feed_url: ""
            };
        }
        
        // Find matching item or default to first
        let ep = episodesData[0];
        for (let item of episodesData) {
            if (String(item.contentId) === String(episodeId)) {
                ep = item;
                break;
            }
        }
        
        const title = ep.title || "無標題單集";
        const streamUrl = ep.streamUrl;
        
        // Duration
        const durationSec = ep.duration || 0;
        let durationStr = "";
        if (durationSec) {
            const m = Math.floor(durationSec / 60);
            const s = Math.floor(durationSec % 60);
            const h = Math.floor(m / 60);
            const remMin = m % 60;
            durationStr = h > 0 ? 
                `${h.toString().padStart(2, '0')}:${remMin.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : 
                `${remMin.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        
        // Date
        const releaseDate = ep.releaseDate || "";
        const formattedDate = releaseDate.length >= 10 ? releaseDate.slice(0, 10) : releaseDate;
        
        // Artwork image template
        let imageUrl = "";
        const artwork = ep.artwork;
        if (artwork && typeof artwork === 'object' && artwork.template) {
            imageUrl = artwork.template.replace("{w}x{h}", "600x600").replace("{f}", "jpg");
        }
        
        // Show details & feedUrl
        let showTitle = "未知節目";
        let feedUrl = "";
        const showOffer = ep.showOffer || ep.podcastOffer;
        if (showOffer && typeof showOffer === 'object') {
            showTitle = showOffer.title || showTitle;
            feedUrl = showOffer.feedUrl || "";
        }
        
        return {
            is_single: true,
            episode_id: episodeId,
            show_title: showTitle,
            episode_title: title,
            url: streamUrl,
            date: formattedDate,
            duration: durationStr,
            image: imageUrl,
            feed_url: feedUrl
        };
    } else {
        // Show Page
        let feedUrls = recursiveSearchKey(serverData, "feedUrl");
        if (feedUrls.length === 0) {
            // Regex fallback search
            const jsonStr = JSON.stringify(serverData);
            const rssMatch = jsonStr.match(/https?:\/\/[^\s"']*?\.xml[^\s"']*?/);
            if (rssMatch) {
                feedUrls = [rssMatch[0]];
            } else {
                throw new Error("無法定位此節目的 RSS 訂閱源 (feedUrl) 網址。");
            }
        }
        
        const rssUrl = feedUrls[0];
        showParseLoading("成功找到 RSS 訂閱源，正在解析全集資訊...");
        const xmlText = await fetchWithProxy(rssUrl);
        return parseRssFeed(xmlText, rssUrl);
    }
}

async function resolveUrl(url) {
    url = url.trim();
    if (!url) throw new Error("網址不可為空。");
    
    if (url.includes("podcasts.apple.com")) {
        showParseLoading("正在解析 Apple Podcasts 網頁...");
        const htmlText = await fetchWithProxy(url);
        return parseApplePodcastUrl(htmlText, url);
    } else if (url.endsWith(".xml") || url.includes("feed") || url.includes("rss")) {
        showParseLoading("正在解析 RSS 訂閱源 XML...");
        const xmlText = await fetchWithProxy(url);
        return parseRssFeed(xmlText, url);
    } else {
        // Attempt Apple Podcasts lookup if ID is provided
        if (/^\d+$/.test(url)) {
            showParseLoading("正在查詢 iTunes ID...");
            const lookupUrl = `https://itunes.apple.com/lookup?id=${url}`;
            const contents = await fetchWithProxy(lookupUrl);
            const data = JSON.parse(contents);
            if (data.resultCount > 0 && data.results[0].feedUrl) {
                const feedUrl = data.results[0].feedUrl;
                showParseLoading("成功找到 RSS 訂閱源，正在解析全集資訊...");
                const xmlText = await fetchWithProxy(feedUrl);
                return parseRssFeed(xmlText, feedUrl);
            }
        }
        throw new Error("不支援的網址類型。請輸入 Apple Podcasts 連結或直連 RSS XML 網址。");
    }
}

// ----------------- FRONTEND UI ACTIONS -----------------

// Handler: Parsing Podcast URL
async function handleParse() {
    const url = elUrlInput.value.trim();
    if (!url) {
        showError("請輸入網址。");
        return;
    }
    
    // UI State Reset
    hideError();
    showParseLoading("正在取得網頁內容...");
    elBtnParse.classList.add("loading");
    elBtnParse.disabled = true;
    
    elShowCard.classList.add("hidden");
    elDownloadToolsCard.classList.add("hidden");
    elEpisodesCard.classList.add("hidden");
    stopBrowserBatchDownload();
    
    try {
        podcastData = await resolveUrl(url);
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
    
    // Display cards
    elShowCard.classList.remove("hidden");
    elDownloadToolsCard.classList.remove("hidden");
    
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
        elEpisodesList.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); font-style: italic;">沒有找到符合搜尋條件的集數</td></tr>`;
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
            <td>
                <div class="action-btn-cell">
                    <button class="btn-icon-only btn-copy-single" title="複製 MP3 連結"><i class="fa-regular fa-copy"></i></button>
                    <a href="${ep.url}" target="_blank" download="${ep.title}.mp3" class="btn-icon-only btn-dl-single" title="瀏覽器直接下載"><i class="fa-solid fa-download"></i></a>
                </div>
            </td>
        `;
        
        // Single Copy Link action
        tr.querySelector(".btn-copy-single").addEventListener("click", (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(ep.url);
            showToast("已複製單集 MP3 連結");
        });
        
        // Stop row click propagation on download button
        tr.querySelector(".btn-dl-single").addEventListener("click", (e) => {
            e.stopPropagation();
        });
        
        // Toggle selection on row click (excluding buttons and checkbox)
        tr.addEventListener("click", (e) => {
            if (e.target.tagName !== "INPUT" && e.target.type !== "checkbox" && !e.target.closest(".btn-icon-only")) {
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
    
    const disabledState = selectedCount === 0;
    elBtnCopyLinks.disabled = disabledState;
    elBtnBrowserDownload.disabled = disabledState;
    
    elBtnCopyLinks.innerHTML = `<i class="fa-solid fa-copy"></i> 複製已選 MP3 下載連結 (${selectedCount})`;
    elBtnBrowserDownload.innerHTML = `<i class="fa-solid fa-download"></i> 瀏覽器直接下載已選項目 (${selectedCount})`;
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

// Single Episode Load Full Show
function loadFullShowFromEpisode() {
    if (!podcastData || !podcastData.feed_url) return;
    elUrlInput.value = podcastData.feed_url;
    handleParse();
}

// ----------------- DOWNLOADING ACTIONS -----------------

// Helper A: Copy Links to Clipboard
function copySelectedLinks() {
    if (selectedEpisodes.size === 0) return;
    
    const linksList = Array.from(selectedEpisodes).map(ep => ep.url).join("\n");
    navigator.clipboard.writeText(linksList)
        .then(() => {
            alert(`成功複製 ${selectedEpisodes.size} 個 MP3 下載連結！\n\n您可以打開 JDownloader / IDM 貼上，軟體會立即建立下載任務。`);
        })
        .catch(err => {
            console.error("複製連結失敗: ", err);
            alert("複製失敗，請手動複製控制台中的網址。");
        });
}

// Helper B: Browser Sequential Pop-up Download
function startBrowserBatchDownload() {
    if (selectedEpisodes.size === 0) return;
    
    batchDownloadQueue = Array.from(selectedEpisodes);
    batchDownloadIndex = 0;
    isBatchDownloading = true;
    
    // Show Progress Card
    elBrowserProgressCard.classList.remove("hidden");
    
    // Start interval loop
    updateBrowserProgressUI();
    triggerNextBrowserDownload();
    batchDownloadInterval = setInterval(triggerNextBrowserDownload, 1500); // 1.5s delay to let browser handle popups safely
}

function triggerNextBrowserDownload() {
    if (!isBatchDownloading) {
        stopBrowserBatchDownload();
        return;
    }
    
    if (batchDownloadIndex >= batchDownloadQueue.length) {
        stopBrowserBatchDownload();
        alert("已完成調用所有選擇的下載連結！\n如果部分項目未下載，請確認您已在瀏覽器設定中「允許此站台下載多個檔案與彈出視窗」。");
        return;
    }
    
    const ep = batchDownloadQueue[batchDownloadIndex];
    
    // Create temporary download element and click it
    const a = document.createElement("a");
    a.href = ep.url;
    a.download = `${ep.title}.mp3`;
    a.target = "_blank"; // Required for cross-origin downloads to open in new tab and trigger media save
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    batchDownloadIndex++;
    updateBrowserProgressUI();
}

function stopBrowserBatchDownload() {
    isBatchDownloading = false;
    if (batchDownloadInterval) {
        clearInterval(batchDownloadInterval);
        batchDownloadInterval = null;
    }
    elBrowserProgressCard.classList.add("hidden");
}

function updateBrowserProgressUI() {
    const total = batchDownloadQueue.length;
    const completed = batchDownloadIndex;
    const remaining = total - completed;
    
    elBrowserQueueRemaining.textContent = remaining;
    elBrowserQueueCompleted.textContent = completed;
    
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    elBrowserProgressFill.style.width = `${percent}%`;
    
    if (completed < total) {
        const ep = batchDownloadQueue[completed];
        elBrowserActiveTitle.textContent = ep.title;
        elBrowserActiveTitle.title = ep.title;
    } else {
        elBrowserActiveTitle.textContent = "下載完成";
    }
}

// ----------------- COMMON UTILS -----------------

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

function showToast(msg) {
    // Simple alert or status-bar toast
    const toast = document.createElement("div");
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = "rgba(99, 102, 241, 0.9)";
    toast.style.color = "white";
    toast.style.padding = "0.6rem 1.2rem";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "0.85rem";
    toast.style.zIndex = "1000";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    toast.style.fontFamily = "sans-serif";
    toast.textContent = msg;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.5s ease";
        setTimeout(() => document.body.removeChild(toast), 500);
    }, 2000);
}
