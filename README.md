# BFS — Bookmark Favorites System

智能书签管理工具。导入浏览器书签导出文件，自动生成摘要与关键词，向量化后支持自然语言搜索。双击 `start.bat` 即用。

## 快速开始

```bash
# Windows: 双击 start.bat
# 或手动:
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

> ⚠️ 必须通过 HTTP 服务运行，不可直接打开 `index.html`（`file://` 协议限制）。

## 功能

- **自动摘要**：导入书签后后台自动调用 DeepSeek V4 Flash 生成中文摘要与关键词
- **向量检索**：本地 embedding 模型（384 维）将摘要向量化，支持语义搜索
- **智能对话**：用自然语言描述需求，DeepSeek V4 Pro 从书签中推荐最相关网站
- **自动分类**：k-means 聚类 + AI 标签，书签自动归入学习/工具/资源等类别
- **多轮对话**：支持追问与澄清，携带上下文

## API 配置

| 服务 | 用途 | 获取地址 |
|------|------|---------|
| DeepSeek API | 摘要 + 对话搜索 | https://platform.deepseek.com |
| OpenAI API（可选） | Embedding 向量化 | https://platform.openai.com |

不填 OpenAI Key 时自动使用本地 embedding 模型（`models/` 目录，首次加载无需网络）。

## 模型文件

`models/Xenova/all-MiniLM-L6-v2/` 包含 5 个文件（~23MB）：

| 文件 | 大小 |
|------|------|
| `config.json` | 650 B |
| `tokenizer.json` | 455 KB |
| `tokenizer_config.json` | 366 B |
| `special_tokens_map.json` | 125 B |
| `onnx/model_quantized.onnx` | 22 MB |

来源：https://huggingface.co/Xenova/all-MiniLM-L6-v2

## 数据存储

| 存储 | 位置 | 内容 |
|------|------|------|
| IndexedDB `bfs_db` | 浏览器内部 | 摘要 + 向量 + 进度 |
| OPFS | 浏览器沙箱 | 同上副本 |
| 书签目录 | 手动导出 | `bookmarks_cache.json` / 增强 HTML |

## 项目结构

```
BFS/
├── index.html                 # 主应用（单文件 SPA）
├── start.bat                  # Windows 一键启动
├── models/                    # 本地 embedding 模型
├── favorites_test_100.html    # 测试数据（100 条书签）
├── favorites_2026_6_29.html   # 示例数据（1849 条书签）
└── BV.html                    # v1 旧版
```
