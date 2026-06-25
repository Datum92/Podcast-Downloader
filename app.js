// Global State
let podcastData = null;
let selectedEpisodes = new Set();
let searchQuery = "";
let isPolling = false;
let pollIntervalId = null;

// Browser download state (for static mode)
let isBatchDownloading = false;
let batchDownloadQueue = [];
let batchDownloadIndex = 0;
let batchDownloadInterval = null;

// Detect running mode: True if served by local Python server
const isLocalServerMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
console.log(`Running in ${isLocalServerMode ? 'Python Local Server' : 'Static Browser'} Mode`);

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

// Dual mode cards
const elDownloadDirCard = document.getElementById("download-dir-card");
const elDownloadDirInput = document.getElementById("download-dir");
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

// Python progress elements
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

// Browser progress elements
const elBrowserProgressCard = document.getElementById("browser-progress-card");
const elBtnCancelBrowserDownload = document.getElementById("btn-cancel-browser-download");
const elBrowserQueueRemaining = document.getElementById("browser-queue-remaining");
const elBrowserQueueCompleted = document.getElementById("browser-queue-completed");
const elBrowserActiveTitle = document.getElementById("browser-active-title");
const elBrowserProgressFill = document.getElementById("browser-progress-fill");

// Initialize Setup
window.addEventListener("DOMContentLoaded", () => {
    // Show correct settings card depending on mode
    if (isLocalServerMode) {
        elDownloadDirInput.value = "C:\\Users\\user\\Downloads\\Podcasts";
        elBtnStartDownload.classList.remove("hidden");
    } else {
        elDownloadToolsCard.classList.remove("hidden");
    }
    
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
    
    // Wire download triggers
    elBtnStartDownload.addEventListener("click", startLocalDownloads);
    elBtnCancelDownloads.addEventListener("click", cancelLocalDownloads);
    
    elBtnCopyLinks.addEventListener("click", copySelectedLinks);
    elBtnBrowserDownload.addEventListener("click", startBrowserBatchDownload);
    elBtnCancelBrowserDownload.addEventListener("click", stopBrowserBatchDownload);
    elBtnLoadFullShow.addEventListener("click", loadFullShowFromEpisode);
    
    // Tab switching for Python progress logs
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".log-panel").forEach(p => p.classList.add("hidden"));
            
            btn.classList.add("active");
            const activeTabId = btn.getAttribute("data-tab");
            document.getElementById(activeTabId).classList.remove("hidden");
        });
    });
    
    // Check initial status for local server
    if (isLocalServerMode) {
        checkLocalDownloaderStatus();
    }
});

// Helper: Format Bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ----------------- DUAL-PROXY FETCHING (STATIC WEB MODE) -----------------

async function fetchWithProxy(url) {
    // Decode first to prevent double-encoding
    let decodedUrl = url;
    try {
        decodedUrl = decodeURIComponent(url);
    } catch (e) {
        console.warn("URL decoding failed:", e);
    }
    // Both corsproxy.io and AllOrigins require slashes and protocols to remain unencoded (safe='/')
    const partiallyEncoded = encodeURIComponent(decodedUrl).replace(/%2F/g, '/');

    const fetchWithTimeout = async (targetUrl, options = {}, timeout = 8000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(targetUrl, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    };

    // 1. Try corsproxy.io first (fast, reliable, and supports CORS)
    try {
        console.log("嘗試使用 corsproxy.io 解析...");
        const response = await fetchWithTimeout(`https://corsproxy.io/?${partiallyEncoded}`, {}, 8000);
        if (response.ok) {
            const text = await response.text();
            if (text && text.trim().length > 0) {
                console.log("corsproxy.io 解析成功");
                return text;
            }
        }
    } catch (e) {
        console.warn("corsproxy.io 失敗，嘗試備用方案 AllOrigins...", e);
    }

    // 2. Fallback to allorigins JSONP (works in all environments, including local file:///)
    console.log("嘗試使用 AllOrigins JSONP 備用解析...");
    return new Promise((resolve, reject) => {
        const callbackName = 'allorigins_' + Math.random().toString(36).substring(2, 11);
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("所有代理伺服器均連線逾時，請確認網址正確或稍後重試。"));
        }, 12000);
        
        function cleanup() {
            clearTimeout(timeoutId);
            delete window[callbackName];
            const script = document.getElementById(callbackName);
            if (script) {
                document.body.removeChild(script);
            }
        }
        
        window[callbackName] = function(data) {
            cleanup();
            if (data && data.contents) {
                console.log("AllOrigins JSONP 解析成功");
                resolve(data.contents);
            } else {
                reject(new Error("所有代理伺服器解析失敗，請確認網際網路連線或稍後再試。"));
            }
        };
        
        const script = document.createElement("script");
        script.id = callbackName;
        script.src = `https://api.allorigins.win/get?url=${partiallyEncoded}&callback=${callbackName}`;
        script.onerror = function() {
            cleanup();
            reject(new Error("連線代理伺服器失敗，請檢查您的網路連線。"));
        };
        
        document.body.appendChild(script);
    });
}

function fetchItunesLookupJsonp(showId, episodeId) {
    return new Promise((resolve, reject) => {
        const callbackName = 'itunes_' + Math.random().toString(36).substring(2, 11);
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("連線 Apple iTunes 服務逾時，請稍後重試。"));
        }, 10000);
        
        function cleanup() {
            clearTimeout(timeoutId);
            delete window[callbackName];
            const script = document.getElementById(callbackName);
            if (script) document.body.removeChild(script);
        }
        
        window[callbackName] = function(data) {
            cleanup();
            if (!data || !data.results || data.results.length === 0) {
                reject(new Error("iTunes 找不到此節目的相關資訊，請確認網址或 ID 是否正確。"));
                return;
            }
            
            const show = data.results[0];
            const episodes = [];
            
            for (let i = 1; i < data.results.length; i++) {
                const ep = data.results[i];
                if (ep.wrapperType === 'podcastEpisode') {
                    const durationSec = ep.trackTimeMillis ? Math.floor(ep.trackTimeMillis / 1000) : 0;
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
                    
                    const releaseDate = ep.releaseDate || "";
                    const formattedDate = releaseDate.length >= 10 ? releaseDate.slice(0, 10) : releaseDate;
                    
                    episodes.push({
                        title: ep.trackName || "無標題單集",
                        url: ep.episodeUrl || ep.previewUrl,
                        date: formattedDate,
                        duration: durationStr,
                        description: ep.description || ""
                    });
                }
            }
            
            if (episodeId) {
                let targetEp = null;
                for (let i = 1; i < data.results.length; i++) {
                    const ep = data.results[i];
                    if (ep.wrapperType === 'podcastEpisode' && String(ep.trackId) === String(episodeId)) {
                        targetEp = ep;
                        break;
                    }
                }
                
                if (targetEp) {
                    const durationSec = targetEp.trackTimeMillis ? Math.floor(targetEp.trackTimeMillis / 1000) : 0;
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
                    
                    const releaseDate = targetEp.releaseDate || "";
                    const formattedDate = releaseDate.length >= 10 ? releaseDate.slice(0, 10) : releaseDate;
                    
                    resolve({
                        is_single: true,
                        episode_id: episodeId,
                        show_title: show.collectionName || "Apple Podcast 節目",
                        episode_title: targetEp.trackName || "單集音檔",
                        url: targetEp.episodeUrl || targetEp.previewUrl,
                        date: formattedDate,
                        duration: durationStr,
                        image: targetEp.artworkUrl600 || show.artworkUrl600 || "",
                        feed_url: show.feedUrl || ""
                    });
                    return;
                }
            }
            
            resolve({
                is_single: false,
                show_title: show.collectionName || "未知節目",
                author: show.artistName || "未知創作者",
                description: "說明資訊請以 RSS 內容為準。線上網頁版目前直接載入最新 200 集，如需載入更多歷史集數，請執行本地端 Python 伺服器。",
                image: show.artworkUrl600 || "",
                feed_url: show.feedUrl || "",
                episodes: episodes
            });
        };
        
        const script = document.createElement("script");
        script.id = callbackName;
        script.src = `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&limit=200&callback=${callbackName}`;
        script.onerror = function() {
            cleanup();
            reject(new Error("查詢 iTunes 服務失敗，請確認網頁連線。"));
        };
        document.body.appendChild(script);
    });
}

function fetchItunesPageJsonp(showId, limit, offset) {
    return new Promise((resolve, reject) => {
        const callbackName = 'itunes_page_' + offset + '_' + Math.random().toString(36).substring(2, 11);
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("連線 Apple iTunes 服務逾時。"));
        }, 10000);
        
        function cleanup() {
            clearTimeout(timeoutId);
            delete window[callbackName];
            const script = document.getElementById(callbackName);
            if (script) document.body.removeChild(script);
        }
        
        window[callbackName] = function(data) {
            cleanup();
            if (!data || !data.results || data.results.length === 0) {
                resolve({ show: null, episodes: [] });
                return;
            }
            
            const show = data.results[0];
            const episodes = [];
            
            for (let i = 1; i < data.results.length; i++) {
                const ep = data.results[i];
                if (ep.wrapperType === 'podcastEpisode') {
                    const durationSec = ep.trackTimeMillis ? Math.floor(ep.trackTimeMillis / 1000) : 0;
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
                    
                    const releaseDate = ep.releaseDate || "";
                    const formattedDate = releaseDate.length >= 10 ? releaseDate.slice(0, 10) : releaseDate;
                    
                    episodes.push({
                        title: ep.trackName || "無標題單集",
                        url: ep.episodeUrl || ep.previewUrl,
                        date: formattedDate,
                        duration: durationStr,
                        description: ep.description || ""
                    });
                }
            }
            
            resolve({ show: show, episodes: episodes });
        };
        
        const script = document.createElement("script");
        script.id = callbackName;
        script.src = `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&limit=${limit}&offset=${offset}&callback=${callbackName}`;
        script.onerror = function() {
            cleanup();
            reject(new Error("查詢 iTunes 服務失敗，請確認網路連線。"));
        };
        document.body.appendChild(script);
    });
}

function fetchAllItunesEpisodesJsonp(showId) {
    return new Promise(async (resolve, reject) => {
        let allEpisodes = [];
        let showMeta = null;
        let offset = 0;
        const limit = 200;
        let hasMore = true;
        let attempts = 0;
        const maxAttempts = 15; // Limit pages to prevent infinite loops (max 3000 episodes)
        
        try {
            while (hasMore && attempts < maxAttempts) {
                attempts++;
                showParseLoading(`正在載入單集清單 (已載入 ${allEpisodes.length} 集)...`);
                const result = await fetchItunesPageJsonp(showId, limit, offset);
                
                if (!showMeta && result.show) {
                    showMeta = result.show;
                }
                
                if (result.episodes && result.episodes.length > 0) {
                    allEpisodes = allEpisodes.concat(result.episodes);
                    if (result.episodes.length < limit) {
                        hasMore = false;
                    } else {
                        offset += limit;
                    }
                } else {
                    hasMore = false;
                }
            }
            
            if (!showMeta) {
                reject(new Error("找不到該節目的相關資訊。"));
                return;
            }
            
            resolve({
                is_single: false,
                show_title: showMeta.collectionName || "未知節目",
                author: showMeta.artistName || "未知創作者",
                description: "說明資訊請以 RSS 內容為準。線上網頁版已透過 iTunes API 自動分頁載入所有單集。",
                image: showMeta.artworkUrl600 || "",
                feed_url: showMeta.feedUrl || "",
                episodes: allEpisodes
            });
            
        } catch (err) {
            reject(err);
        }
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
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) throw new Error("RSS XML 解析出錯。");
    
    const channel = xmlDoc.querySelector("channel");
    if (!channel) throw new Error("找不到 RSS 的 <channel> 節點。");
    
    const showTitle = channel.getElementsByTagName("title")[0]?.textContent || "未知節目";
    const author = channel.getElementsByTagName("itunes:author")[0]?.textContent || 
                   channel.getElementsByTagName("author")[0]?.textContent || "";
    const description = channel.getElementsByTagName("description")[0]?.textContent || "";
    
    let showImage = "";
    const imageEl = channel.getElementsByTagName("image")[0];
    if (imageEl) showImage = imageEl.getElementsByTagName("url")[0]?.textContent || "";
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
                if (!isNaN(dateObj)) formattedDate = dateObj.toISOString().split('T')[0];
                else formattedDate = pubDateRaw;
            } catch(e) { formattedDate = pubDateRaw; }
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
    
    let serverDataText = "";
    const scriptEl = doc.getElementById("serialized-server-data");
    if (scriptEl) {
        serverDataText = scriptEl.textContent.trim();
    } else {
        const match = htmlText.match(/<script\b[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
        if (match) serverDataText = match[1].trim();
    }
    
    if (!serverDataText) {
        throw new Error("無法在頁面中解析 serialized-server-data 腳本。請確認是否為正確的 Apple Podcasts 網址。");
    }
    
    const serverData = JSON.parse(serverDataText);
    const match = url.match(/[?&]i=(\d+)/);
    const episodeId = match ? match[1] : null;
    
    if (episodeId) {
        const episodesData = recursiveSearchKeys(serverData, ["streamUrl", "title"]);
        if (episodesData.length === 0) {
            const streamUrls = recursiveSearchKey(serverData, "streamUrl");
            if (streamUrls.length === 0) throw new Error("無法從此單集頁面解析音檔網址。");
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
        
        let ep = episodesData[0];
        for (let item of episodesData) {
            if (String(item.contentId) === String(episodeId)) {
                ep = item;
                break;
            }
        }
        
        const title = ep.title || "無標題單集";
        const streamUrl = ep.streamUrl;
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
        
        const releaseDate = ep.releaseDate || "";
        const formattedDate = releaseDate.length >= 10 ? releaseDate.slice(0, 10) : releaseDate;
        
        let imageUrl = "";
        const artwork = ep.artwork;
        if (artwork && typeof artwork === 'object' && artwork.template) {
            imageUrl = artwork.template.replace("{w}x{h}", "600x600").replace("{f}", "jpg");
        }
        
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
        let feedUrls = recursiveSearchKey(serverData, "feedUrl");
        if (feedUrls.length === 0) {
            const jsonStr = JSON.stringify(serverData);
            const rssMatch = jsonStr.match(/https?:\/\/[^\s"']*?\.xml[^\s"']*?/);
            if (rssMatch) feedUrls = [rssMatch[0]];
            else throw new Error("無法定位此節目的 RSS 訂閱源 (feedUrl) 網址。");
        }
        const rssUrl = feedUrls[0];
        showParseLoading("成功找到 RSS 訂閱源，正在解析全集資訊...");
        const xmlText = await fetchWithProxy(rssUrl);
        return parseRssFeed(xmlText, rssUrl);
    }
}

async function resolveUrlClientSide(url) {
    url = url.trim();
    if (!url) throw new Error("網址不可為空。");
    
    if (url.includes("podcasts.apple.com")) {
        const idMatch = url.match(/\/id(\d+)/);
        const episodeMatch = url.match(/[?&]i=(\d+)/);
        const episodeId = episodeMatch ? episodeMatch[1] : null;
        
        if (idMatch) {
            const showId = idMatch[1];
            showParseLoading("正在從 iTunes API 載入節目資訊...");
            try {
                if (episodeId) {
                    return await fetchItunesLookupJsonp(showId, episodeId);
                } else {
                    return await fetchAllItunesEpisodesJsonp(showId);
                }
            } catch (jsonpErr) {
                console.warn("iTunes JSONP Lookup 失敗，將嘗試使用 CORS 代理伺服器備用方案...", jsonpErr);
            }
        }
        
        showParseLoading("正在解析 Apple Podcasts 網頁...");
        const htmlText = await fetchWithProxy(url);
        return parseApplePodcastUrl(htmlText, url);
    } else if (url.endsWith(".xml") || url.includes("feed") || url.includes("rss")) {
        showParseLoading("正在解析 RSS 訂閱源 XML...");
        const xmlText = await fetchWithProxy(url);
        return parseRssFeed(xmlText, url);
    } else if (/^\d+$/.test(url)) {
        showParseLoading("正在查詢 iTunes ID...");
        try {
            return await fetchAllItunesEpisodesJsonp(url);
        } catch (jsonpErr) {
            console.warn("iTunes JSONP Lookup 失敗，將嘗試使用 CORS 代理伺服器備用方案...", jsonpErr);
        }
        
        const lookupUrl = `https://itunes.apple.com/lookup?id=${url}`;
        const contents = await fetchWithProxy(lookupUrl);
        const data = JSON.parse(contents);
        if (data.resultCount > 0 && data.results[0].feedUrl) {
            const feedUrl = data.results[0].feedUrl;
            showParseLoading("成功找到 RSS 訂閱源，正在解析全集資訊...");
            const xmlText = await fetchWithProxy(feedUrl);
            return parseRssFeed(xmlText, feedUrl);
        }
        throw new Error("無法查詢此 iTunes ID 的資訊。");
    } else {
        throw new Error("不支援的網址類型。請輸入 Apple Podcasts 連結或直連 RSS XML 網址。");
    }
}

// ----------------- PARSE ACTION HANDLER -----------------

async function handleParse() {
    const url = elUrlInput.value.trim();
    if (!url) {
        showError("請輸入網址。");
        return;
    }
    
    hideError();
    showParseLoading("正在載入節目網頁資訊...");
    elBtnParse.classList.add("loading");
    elBtnParse.disabled = true;
    
    elShowCard.classList.add("hidden");
    elDownloadDirCard.classList.add("hidden");
    elDownloadToolsCard.classList.add("hidden");
    elEpisodesCard.classList.add("hidden");
    stopBrowserBatchDownload();
    
    try {
        if (isLocalServerMode) {
            // Fetch parsing results directly from local python API
            const response = await fetch("/api/parse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "本地服務解析失敗。");
            podcastData = data;
        } else {
            // Fetch client side using proxy
            podcastData = await resolveUrlClientSide(url);
        }
        displayPodcastInfo();
    } catch (err) {
        showError(err.message);
    } finally {
        hideParseLoading();
        elBtnParse.classList.remove("loading");
        elBtnParse.disabled = false;
    }
}

// Display Details
function displayPodcastInfo() {
    if (!podcastData) return;
    
    elShowTitle.textContent = podcastData.show_title;
    elShowAuthor.textContent = podcastData.author || "未知創作者";
    
    if (podcastData.is_single) {
        elBadgeType.textContent = "單集";
        elShowDesc.textContent = `發佈日期: ${podcastData.date || "無資料"} | 時長: ${podcastData.duration || "無資料"}`;
        elSingleEpisodeSuggestion.classList.toggle("hidden", !podcastData.feed_url);
    } else {
        elBadgeType.textContent = "節目";
        elShowDesc.textContent = podcastData.description || "無描述資訊";
        elSingleEpisodeSuggestion.classList.add("hidden");
    }
    
    if (podcastData.image) {
        elShowImage.src = podcastData.image;
        elShowImage.classList.remove("hidden");
    } else {
        elShowImage.src = "";
        elShowImage.classList.add("hidden");
    }
    
    // Show panels depending on mode
    if (isLocalServerMode) {
        const sanitizeTitle = podcastData.show_title.replace(/[\\/:*?"<>|]/g, "_").trim();
        elDownloadDirInput.value = `C:\\Users\\user\\Downloads\\Podcasts\\${sanitizeTitle}`;
        elDownloadDirCard.classList.remove("hidden");
    } else {
        elDownloadToolsCard.classList.remove("hidden");
    }
    
    selectedEpisodes.clear();
    elEpisodeSearch.value = "";
    searchQuery = "";
    
    if (podcastData.is_single) {
        const singleEp = {
            title: podcastData.episode_title,
            url: podcastData.url,
            date: podcastData.date,
            duration: podcastData.duration
        };
        podcastData.episodes = [singleEp];
        selectedEpisodes.add(singleEp);
    }
    
    renderEpisodesList();
    elEpisodesCard.classList.remove("hidden");
    updateSelectionUI();
}

// Render Table Rows
function renderEpisodesList() {
    if (!podcastData || !podcastData.episodes) return;
    
    const visibleEpisodes = podcastData.episodes.filter(ep => 
        ep.title.toLowerCase().includes(searchQuery)
    );
    
    elEpisodesList.innerHTML = "";
    elEpisodeCount.textContent = `(${podcastData.episodes.length})`;
    
    if (visibleEpisodes.length === 0) {
        elEpisodesList.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); font-style: italic;">沒有找到符合搜尋條件的集數</td></tr>`;
        return;
    }
    
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
                    <a href="${ep.url}" target="_blank" download="${ep.title}.mp3" class="btn-icon-only btn-dl-single" title="開新分頁播放"><i class="fa-solid fa-play"></i></a>
                </div>
            </td>
        `;
        
        tr.querySelector(".btn-copy-single").addEventListener("click", (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(ep.url);
            showToast("已複製單集 MP3 連結");
        });
        
        tr.querySelector(".btn-dl-single").addEventListener("click", (e) => {
            e.stopPropagation();
        });
        
        tr.addEventListener("click", (e) => {
            if (e.target.tagName !== "INPUT" && e.target.type !== "checkbox" && !e.target.closest(".btn-icon-only")) {
                const check = tr.querySelector(".ep-check");
                check.checked = !check.checked;
                toggleEpisodeSelection(ep, check.checked, tr);
            }
        });
        
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
    
    const visibleEpisodes = podcastData.episodes.filter(ep => 
        ep.title.toLowerCase().includes(searchQuery)
    );
    const allVisibleSelected = visibleEpisodes.every(ep => selectedEpisodes.has(ep));
    elHeaderSelectAll.checked = allVisibleSelected && visibleEpisodes.length > 0;
    
    updateSelectionUI();
}

function updateSelectionUI() {
    const selectedCount = selectedEpisodes.size;
    const totalCount = podcastData ? podcastData.episodes.length : 0;
    
    elSelectedCount.textContent = selectedCount;
    elTotalCount.textContent = totalCount;
    
    const disabledState = selectedCount === 0;
    
    if (isLocalServerMode) {
        elBtnStartDownload.disabled = disabledState;
        elBtnStartDownload.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> 開始下載已選集數 (${selectedCount})`;
    } else {
        elBtnCopyLinks.disabled = disabledState;
        elBtnBrowserDownload.disabled = disabledState;
        elBtnCopyLinks.innerHTML = `<i class="fa-solid fa-copy"></i> 複製已選 MP3 下載連結 (${selectedCount})`;
        elBtnBrowserDownload.innerHTML = `<i class="fa-solid fa-download"></i> 瀏覽器直接下載已選項目 (${selectedCount})`;
    }
}

// Batch Selection
function selectAllVisible() {
    if (!podcastData) return;
    podcastData.episodes.forEach(ep => {
        if (ep.title.toLowerCase().includes(searchQuery)) selectedEpisodes.add(ep);
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
            if (isChecked) selectedEpisodes.add(ep);
            else selectedEpisodes.delete(ep);
        }
    });
    renderEpisodesList();
    updateSelectionUI();
}

function loadFullShowFromEpisode() {
    if (!podcastData || !podcastData.feed_url) return;
    elUrlInput.value = podcastData.feed_url;
    handleParse();
}

// ----------------- DOWNLOAD ACTION (LOCAL SERVER MODE) -----------------

async function startLocalDownloads() {
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                episodes: episodesToDownload,
                download_dir: downloadDir
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "無法啟動下載任務。");
        elProgressCard.classList.remove("hidden");
        startLocalPolling();
    } catch (err) {
        alert("下載出錯: " + err.message);
    }
}

async function cancelLocalDownloads() {
    if (!confirm("確定要取消佇列中所有的下載任務嗎？")) return;
    try {
        await fetch("/api/cancel", { method: "POST" });
        checkLocalDownloaderStatus();
    } catch (err) {
        console.error("取消下載錯誤: ", err);
    }
}

function startLocalPolling() {
    if (isPolling) return;
    isPolling = true;
    checkLocalDownloaderStatus();
    pollIntervalId = setInterval(checkLocalDownloaderStatus, 1000);
}

function stopLocalPolling() {
    if (!isPolling) return;
    isPolling = false;
    if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
    }
}

async function checkLocalDownloaderStatus() {
    try {
        const response = await fetch("/api/status");
        if (!response.ok) return;
        const status = await response.json();
        updateLocalProgressUI(status);
        if (status.is_downloading || status.total_in_queue > 0) {
            elProgressCard.classList.remove("hidden");
            startLocalPolling();
        } else {
            stopLocalPolling();
        }
    } catch (err) {
        console.error("無法取得下載器狀態: ", err);
    }
}

function updateLocalProgressUI(status) {
    elQueueRemaining.textContent = status.total_in_queue;
    elQueueCompleted.textContent = status.completed_in_session;
    
    if (status.is_downloading && status.current_episode) {
        elDownloadIdleContainer.classList.add("hidden");
        elActiveDownloadContainer.classList.remove("hidden");
        
        const ep = status.current_episode;
        elActiveDownloadTitle.textContent = ep.title;
        elActiveDownloadTitle.title = ep.title;
        elActiveProgressFill.style.width = `${ep.percent}%`;
        elActiveProgressPercent.textContent = `${ep.percent}%`;
        elActiveProgressSize.textContent = `${formatBytes(ep.bytes_downloaded)} / ${formatBytes(ep.bytes_total)}`;
        elActiveProgressSpeed.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${formatBytes(ep.speed)}/s`;
    } else {
        elActiveDownloadContainer.classList.add("hidden");
        elDownloadIdleContainer.classList.remove("hidden");
    }
    
    elLogCompletedCount.textContent = status.completed.length;
    elLogFailedCount.textContent = status.failed.length;
    
    if (status.completed.length > 0) {
        elCompletedLogList.innerHTML = status.completed.map(title => `
            <li class="completed-item">
                <span title="${title}"><i class="fa-regular fa-circle-check icon-green"></i> ${title}</span>
                <span style="color: var(--text-muted); font-size: 0.75rem;">已存檔</span>
            </li>
        `).reverse().join("");
    } else {
        elCompletedLogList.innerHTML = `<li class="empty-log">尚無完成的下載項目</li>`;
    }
    
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

// ----------------- DOWNLOAD ACTION (STATIC WEB MODE) -----------------

function copySelectedLinks() {
    if (selectedEpisodes.size === 0) return;
    const linksList = Array.from(selectedEpisodes).map(ep => ep.url).join("\n");
    navigator.clipboard.writeText(linksList)
        .then(() => {
            alert(`成功複製 ${selectedEpisodes.size} 個 MP3 下載連結！\n\n您可以打開 JDownloader / IDM 貼上進行批量下載。`);
        })
        .catch(err => {
            console.error("複製連結失敗: ", err);
            alert("複製失敗，請手動複製控制台中的網址。");
        });
}

function startBrowserBatchDownload() {
    if (selectedEpisodes.size === 0) return;
    
    const confirmMsg = "【瀏覽器下載重要提醒】\n\n" +
        "1. 您目前正在使用「線上網頁模式」，由於瀏覽器安全限制 (CORS/沙盒機制)，網頁無法直接將檔案存入您指定的本機資料夾中。\n" +
        "2. 點擊確定後，瀏覽器將開啟新分頁並載入音檔。如果該音檔伺服器不支援直連下載，瀏覽器預設會在新分頁「開啟播放」而非自動存檔，您需要在播放頁面點擊右鍵選擇「另存新檔」，或請在瀏覽器設定中允許此站台「彈出多個視窗與下載」。\n\n" +
        "※ 建議方案：\n" +
        "👉 點選「複製已選 MP3 下載連結」，並貼入下載軟體 (如 JDownloader 或 IDM) 進行全自動批次下載。\n" +
        "👉 執行本地端 Python 伺服器 (在專案資料夾執行 python app.py) 並使用 localhost 網頁，即可享受「直接自動下載到實體資料夾」的功能。\n\n" +
        "確定要繼續在瀏覽器中開啟新分頁播放/下載嗎？";
        
    if (!confirm(confirmMsg)) return;
    
    batchDownloadQueue = Array.from(selectedEpisodes);
    batchDownloadIndex = 0;
    isBatchDownloading = true;
    elBrowserProgressCard.classList.remove("hidden");
    updateBrowserProgressUI();
    triggerNextBrowserDownload();
    batchDownloadInterval = setInterval(triggerNextBrowserDownload, 1500);
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
    const a = document.createElement("a");
    a.href = ep.url;
    a.download = `${ep.title}.mp3`;
    a.target = "_blank";
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
