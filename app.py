import os
import sys
import re
import json
import time
import queue
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import threading
import http.server
import socketserver
import email.utils
import webbrowser

# Target download and server configurations
PORT = 8990
DEFAULT_DOWNLOAD_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "Podcasts")

# Global lock and queue for downloads
download_queue = queue.Queue()
download_status = {
    "is_downloading": False,
    "current_episode": None, # dict
    "completed": [], # list of titles
    "failed": [], # list of dicts (title, error)
    "total_in_queue": 0,
    "completed_in_session": 0,
    "cancel_flag": False
}
status_lock = threading.Lock()

# ----------------- PARSING UTILITIES -----------------

def get_headers():
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

def safe_encode_url(url):
    """Safely encode a URL that may contain non-ASCII characters or be already percent-encoded."""
    try:
        decoded_url = urllib.parse.unquote(url)
        parts = urllib.parse.urlparse(decoded_url)
        path = urllib.parse.quote(parts.path)
        query = urllib.parse.quote(parts.query, safe='=&')
        return urllib.parse.urlunparse((
            parts.scheme,
            parts.netloc,
            path,
            parts.params,
            query,
            parts.fragment
        ))
    except Exception:
        return url


def sanitize_filename(name):
    """Sanitizes filename for Windows filesystem."""
    invalid_chars = r'[\\/:*?"<>|]'
    clean_name = re.sub(invalid_chars, '-', name)
    clean_name = re.sub(r'\s+', ' ', clean_name)
    clean_name = re.sub(r'-+', '-', clean_name)
    return clean_name.strip()

def recursive_search_key(obj, key_to_find):
    results = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key_to_find:
                results.append(v)
            results.extend(recursive_search_key(v, key_to_find))
    elif isinstance(obj, list):
        for item in obj:
            results.extend(recursive_search_key(item, key_to_find))
    return results

def recursive_search_keys(obj, keys_list):
    results = []
    if isinstance(obj, dict):
        if all(k in obj for k in keys_list):
            results.append(obj)
        for k, v in obj.items():
            results.extend(recursive_search_keys(v, keys_list))
    elif isinstance(obj, list):
        for item in obj:
            results.extend(recursive_search_keys(item, keys_list))
    return results

def parse_rss_feed(feed_url):
    req = urllib.request.Request(safe_encode_url(feed_url), headers=get_headers())
    with urllib.request.urlopen(req, timeout=20) as response:
        xml_data = response.read()
    
    root = ET.fromstring(xml_data)
    channel = root.find("channel")
    if channel is None:
        raise ValueError("Invalid RSS feed format: <channel> not found.")
    
    show_title = channel.findtext("title", "Unknown Podcast")
    show_author = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}author", "")
    if not show_author:
        show_author = channel.findtext("author", "")
    show_description = channel.findtext("description", "")
    
    show_image = ""
    image_el = channel.find("image")
    if image_el is not None:
        show_image = image_el.findtext("url", "")
    if not show_image:
        itunes_image = channel.find("{http://www.itunes.com/dtds/podcast-1.0.dtd}image")
        if itunes_image is not None:
            show_image = itunes_image.get("href", "")
            
    episodes = []
    items = channel.findall("item")
    for item in items:
        title = item.findtext("title", "Untitled Episode")
        enclosure = item.find("enclosure")
        if enclosure is None:
            continue
        audio_url = enclosure.get("url")
        if not audio_url:
            continue
            
        file_size = enclosure.get("length", "0")
        
        pub_date_raw = item.findtext("pubDate", "")
        formatted_date = ""
        if pub_date_raw:
            try:
                dt = email.utils.parsedate_to_datetime(pub_date_raw)
                formatted_date = dt.strftime("%Y-%m-%d")
            except Exception:
                formatted_date = pub_date_raw
                
        duration = item.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}duration", "")
        if not duration:
            duration = item.findtext("duration", "")
            
        description = item.findtext("description", "")
        
        episodes.append({
            "title": title,
            "url": audio_url,
            "date": formatted_date,
            "duration": duration,
            "description": description,
            "file_size": file_size
        })
        
    return {
        "is_single": False,
        "show_title": show_title,
        "author": show_author,
        "description": show_description,
        "image": show_image,
        "feed_url": feed_url,
        "episodes": episodes
    }

def parse_apple_podcast_url(url):
    parsed_url = urllib.parse.urlparse(url)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    episode_id = query_params.get("i", [None])[0]
    
    req = urllib.request.Request(safe_encode_url(url), headers=get_headers())
    with urllib.request.urlopen(req, timeout=20) as response:
        html = response.read().decode("utf-8")
        
    pattern = r'<script\b[^>]*id="serialized-server-data"[^>]*>(.*?)</script>'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        raise ValueError("Could not find podcast details on the webpage. Ensure it is a valid Apple Podcasts link.")
        
    server_data = json.loads(match.group(1).strip())
    
    if episode_id:
        episodes_data = recursive_search_keys(server_data, ["streamUrl", "title"])
        if not episodes_data:
            stream_urls = recursive_search_key(server_data, "streamUrl")
            if not stream_urls:
                raise ValueError("Could not extract audio link from this episode page.")
            return {
                "is_single": True,
                "episode_id": episode_id,
                "show_title": "Apple Podcast Show",
                "episode_title": "Single Episode",
                "url": stream_urls[0],
                "date": "",
                "duration": "",
                "image": "",
                "feed_url": ""
            }
            
        ep = episodes_data[0]
        for item in episodes_data:
            if str(item.get("contentId")) == str(episode_id):
                ep = item
                break
                
        title = ep.get("title", "Untitled Episode")
        stream_url = ep.get("streamUrl")
        
        duration_sec = ep.get("duration", 0)
        duration_str = ""
        if duration_sec:
            m, s = divmod(int(duration_sec), 60)
            h, m = divmod(m, 60)
            if h > 0:
                duration_str = f"{h:02d}:{m:02d}:{s:02d}"
            else:
                duration_str = f"{m:02d}:{s:02d}"
                
        release_date = ep.get("releaseDate", "")
        formatted_date = release_date[:10] if release_date and len(release_date) >= 10 else release_date
            
        image_url = ""
        artwork = ep.get("artwork")
        if artwork and isinstance(artwork, dict) and "template" in artwork:
            template = artwork["template"]
            image_url = template.replace("{w}x{h}", "600x600").replace("{f}", "jpg")
            
        show_title = "Unknown Podcast"
        feed_url = ""
        show_offer = ep.get("showOffer") or ep.get("podcastOffer")
        if show_offer and isinstance(show_offer, dict):
            show_title = show_offer.get("title", show_title)
            feed_url = show_offer.get("feedUrl", "")
            
        return {
            "is_single": True,
            "episode_id": episode_id,
            "show_title": show_title,
            "episode_title": title,
            "url": stream_url,
            "date": formatted_date,
            "duration": duration_str,
            "image": image_url,
            "feed_url": feed_url
        }
    else:
        feed_urls = recursive_search_key(server_data, "feedUrl")
        if not feed_urls:
            json_str = json.dumps(server_data)
            rss_match = re.findall(r'https?://[^\s"\']*?\.xml[^\s"\']*?', json_str)
            if rss_match:
                feed_urls = [rss_match[0]]
            else:
                raise ValueError("Could not locate the RSS Feed URL for this podcast show.")
        return parse_rss_feed(feed_urls[0])

def resolve_url(url):
    url = url.strip()
    if not url:
        raise ValueError("URL cannot be empty.")
    if "podcasts.apple.com" in url:
        return parse_apple_podcast_url(url)
    elif url.endswith(".xml") or "feed" in url or "rss" in url:
        return parse_rss_feed(url)
    else:
        if url.isdigit():
            lookup_url = f"https://itunes.apple.com/lookup?id={url}"
            req = urllib.request.Request(safe_encode_url(lookup_url), headers=get_headers())
            with urllib.request.urlopen(req, timeout=20) as response:
                data = json.loads(response.read().decode())
                if data.get("resultCount", 0) > 0:
                    feed_url = data["results"][0].get("feedUrl")
                    if feed_url:
                        return parse_rss_feed(feed_url)
        raise ValueError("Unsupported URL.")

# ----------------- BACKGROUND DOWNLOADER -----------------

def download_worker():
    global download_status
    while True:
        try:
            task = download_queue.get_nowait()
        except queue.Empty:
            with status_lock:
                download_status["is_downloading"] = False
                download_status["current_episode"] = None
            break
            
        title = task["title"]
        url = task["url"]
        filename = task["filename"]
        download_dir = task["download_dir"]
        dest_path = os.path.join(download_dir, filename)
        
        with status_lock:
            if download_status["cancel_flag"]:
                download_queue.task_done()
                continue
            download_status["is_downloading"] = True
            download_status["current_episode"] = {
                "title": title,
                "bytes_downloaded": 0,
                "bytes_total": 0,
                "speed": 0.0,
                "percent": 0
            }
            
        req = urllib.request.Request(safe_encode_url(url), headers=get_headers())
        success = False
        error_msg = ""
        
        try:
            os.makedirs(download_dir, exist_ok=True)
            with urllib.request.urlopen(req, timeout=20) as response:
                total_size = int(response.info().get('Content-Length', 0))
                downloaded = 0
                start_time = time.time()
                last_progress_time = start_time
                last_downloaded = 0
                
                with open(dest_path, "wb") as f:
                    while True:
                        with status_lock:
                            if download_status["cancel_flag"]:
                                error_msg = "Cancelled by user"
                                break
                        chunk = response.read(65536)
                        if not chunk:
                            success = True
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        current_time = time.time()
                        if current_time - last_progress_time >= 0.5 or downloaded == total_size:
                            time_diff = current_time - last_progress_time
                            speed = (downloaded - last_downloaded) / time_diff if time_diff > 0 else 0.0
                            percent = int((downloaded / total_size) * 100) if total_size > 0 else 0
                            with status_lock:
                                if download_status["current_episode"]:
                                    download_status["current_episode"]["bytes_downloaded"] = downloaded
                                    download_status["current_episode"]["bytes_total"] = total_size
                                    download_status["current_episode"]["speed"] = speed
                                    download_status["current_episode"]["percent"] = percent
                            last_progress_time = current_time
                            last_downloaded = downloaded
            if not success and os.path.exists(dest_path):
                try: os.remove(dest_path)
                except Exception: pass
        except Exception as e:
            error_msg = str(e)
            if os.path.exists(dest_path):
                try: os.remove(dest_path)
                except Exception: pass
                
        with status_lock:
            if download_status["cancel_flag"]:
                download_queue.task_done()
                continue
            if success:
                download_status["completed"].append(title)
                download_status["completed_in_session"] += 1
            else:
                download_status["failed"].append({"title": title, "error": error_msg})
            download_status["total_in_queue"] = max(0, download_status["total_in_queue"] - 1)
            
        download_queue.task_done()
        time.sleep(1.0) # Polite delay

def start_download_thread():
    global download_status
    with status_lock:
        download_status["cancel_flag"] = False
        if not download_status["is_downloading"]:
            download_status["is_downloading"] = True
            t = threading.Thread(target=download_worker, daemon=True)
            t.start()

def cancel_all_downloads():
    global download_status
    with status_lock:
        download_status["cancel_flag"] = True
        try:
            while True:
                download_queue.get_nowait()
                download_queue.task_done()
        except queue.Empty: pass
        download_status["total_in_queue"] = 0
        download_status["current_episode"] = None
        download_status["is_downloading"] = False

# ----------------- HTTP SERVER HANDLER -----------------

class PodcastHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    def do_GET(self):
        if self.path == "/api/status":
            self.handle_api_status()
            return
        clean_path = self.path.split('?')[0]
        if clean_path == "/" or clean_path == "/index.html":
            self.serve_file("index.html", "text/html")
        elif clean_path == "/app.css":
            self.serve_file("app.css", "text/css")
        elif clean_path == "/app.js":
            self.serve_file("app.js", "application/javascript")
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")
            
    def do_POST(self):
        if self.path == "/api/parse":
            self.handle_api_parse()
        elif self.path == "/api/download":
            self.handle_api_download()
        elif self.path == "/api/cancel":
            self.handle_api_cancel()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")
            
    def serve_file(self, filename, content_type):
        try:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            filepath = os.path.join(current_dir, filename)
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Internal Error: {e}".encode())

    def handle_api_parse(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(post_data)
            url = params.get("url")
            result = resolve_url(url)
            response_bytes = json.dumps(result, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)
        except Exception as e:
            error_response = json.dumps({"error": str(e)}, ensure_ascii=False).encode('utf-8')
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(error_response)))
            self.end_headers()
            self.wfile.write(error_response)
            
    def handle_api_download(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(post_data)
            episodes = params.get("episodes", [])
            download_dir = params.get("download_dir", DEFAULT_DOWNLOAD_DIR)
            if not episodes:
                raise ValueError("No episodes selected.")
            with status_lock:
                for ep in episodes:
                    title = ep.get("title")
                    url = ep.get("url")
                    date = ep.get("date", "")
                    safe_title = sanitize_filename(title)
                    filename = f"[{date}] {safe_title}.mp3" if date else f"{safe_title}.mp3"
                    download_queue.put({
                        "title": title,
                        "url": url,
                        "filename": filename,
                        "download_dir": download_dir
                    })
                    download_status["total_in_queue"] += 1
            start_download_thread()
            response = json.dumps({"status": "ok"}).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        except Exception as e:
            error_response = json.dumps({"error": str(e)}).encode('utf-8')
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(error_response)))
            self.end_headers()
            self.wfile.write(error_response)
            
    def handle_api_status(self):
        with status_lock:
            status_copy = {
                "is_downloading": download_status["is_downloading"],
                "current_episode": download_status["current_episode"].copy() if download_status["current_episode"] else None,
                "completed": list(download_status["completed"]),
                "failed": list(download_status["failed"]),
                "total_in_queue": download_status["total_in_queue"],
                "completed_in_session": download_status["completed_in_session"]
            }
        response = json.dumps(status_copy, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)
        
    def handle_api_cancel(self):
        cancel_all_downloads()
        response = json.dumps({"status": "ok"}).encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    pass

def start_server():
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, PodcastHTTPRequestHandler)
    print(f"=== Podcast Downloader Server started on http://localhost:{PORT} ===")
    try:
        webbrowser.open(f"http://localhost:{PORT}")
    except Exception: pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        cancel_all_downloads()
        httpd.server_close()
        sys.exit(0)

if __name__ == "__main__":
    start_server()
