# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BFS (Bookmark Favorites System) — a single-file browser-based bookmark management SPA. No build step, no dependencies. **Must be served via HTTP, not `file://`.**

## Quick Start

双击 `start.bat` 或执行：
```bash
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Complete application: HTML + CSS + vanilla JS (~1680 lines) |
| `start.bat` | Windows 一键启动脚本 |
| `models/Xenova/all-MiniLM-L6-v2/` | 本地 embedding 模型文件 (23MB, 5 files) |
| `BV.html` | Legacy v1 — replaced by index.html |
| `favorites_2026_6_29.html` | Sample bookmark export (1849 bookmarks) |
| `favorites_test_100.html` | Test data (100 bookmarks) |

## Architecture

### Data Flow

```
Bookmark HTML import → DOMParser → Bookmark[] → Background Queue (concurrency=3)
  ├── deepseek-v4-flash → summary + keywords
  ├── OpenAI embedding / transformers.js → vector
  ├── OPFS auto-save (+ FSAA on explicit export)
  └── Every 20 new summaries → k-means clustering → AI label generation

Chat Search:
  User question → embedding → cosine similarity Top-20 → deepseek-v4-pro → recommendations
```

### UI Layout

- **Left sidebar** (collapsible): AI-generated categories + original folder tree
- **Right main area**: Chat panel (collapsible to floating button) + card grid + search bar
- **Bottom progress bar**: Background processing status, auto-hides 4s after completion
- **Landing screen**: Import button + API config + OPFS resume detection

### State Management

- `bookmarks[]` — parsed bookmarks from imported HTML
- `bookmarkMap{}` — url→bookmark for O(1) lookup
- `cache` — `{ version, bookmarks: { url: { summary, keywords, categories, embedding, generatedAt } }, categoryLabels }`
- `config` — DeepSeek/OpenAI keys, persisted to localStorage
- Background queue: `pendingUrls`, `activeCount`, `completedCount`, `alreadyDoneCount`

### Persistence Strategy

1. **OPFS** (Origin Private File System) — silent auto-save after each summary generation
2. **FSAA** (File System Access API) — explicit export/import via topbar buttons
3. **localStorage** — config only (API keys)

### Key Modules (all inline in `<script type="module">`)

| Module | Key Functions |
|--------|--------------|
| Storage | `opfsRead/Write`, `fsaaWriteCache`, `fsaaImportCacheFile`, `persistCache` |
| Parser | `parseBookmarkHTML(content)` — DOMParser-based Netscape format parsing |
| LLM Client | `callDeepSeek(model, messages)`, `callOpenAIEmbedding(text)`, `getLocalEmbedding(text)` |
| Embedding | `getEmbedding(text)` — OpenAI with transformers.js fallback |
| Summary | `generateSummary(url, title)` — Flash model, returns `{keywords, summary}` |
| Queue | `startBackgroundQueue(urls)` — 3 concurrent workers, skips already-processed URLs |
| Cluster | `runClustering()` — k-means with silhouette score, Pro for labels |
| Search | `vectorSearch(queryEmbedding, topK)` — cosine similarity |
| Chat | `sendChatMessage()` — question embedding → Top-20 → Pro rerank → 3-5 recommendations |
| Export | `exportBookmarksHTML()` — generates bookmark HTML with embedded BFS metadata |

### Models

| Model | Usage | API Endpoint |
|-------|-------|-------------|
| `deepseek-v4-flash` | Batch summary generation | `{deepseekUrl}/chat/completions` |
| `deepseek-v4-pro` | Chat search + cluster labeling | `{deepseekUrl}/chat/completions` |
| `text-embedding-3-small` | Primary embedding (OpenAI) | `{openaiUrl}/embeddings` |
| `Xenova/all-MiniLM-L6-v2` | Embedding fallback (browser) | transformers.js CDN |

## Development

必须通过 HTTP 服务运行，不可直接双击 `index.html`（`file://` 协议下 fetch 本地文件被 CORS 拦截）：
```bash
python -m http.server 8080
# 打开 http://localhost:8080
```

Edit `index.html` 后刷新浏览器即可。DevTools 调试。

### API Configuration

All API endpoints are OpenAI-compatible. DeepSeek base URL defaults to `https://api.deepseek.com/v1`. Configure via the landing page settings panel.
