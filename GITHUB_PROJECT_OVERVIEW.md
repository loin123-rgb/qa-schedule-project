# Plato Workflow Demo

Plato Workflow Demo 是一個用於展示「工作流程管理系統」概念的模擬專案，目標是先在本機環境展示整體操作流程，未來再部署到公司伺服器。

## Project Goal

這個專案聚焦在以下需求：

- 管理工作流程
- 管理人員與部門
- 區分驗證組與品檢組
- 模擬 Discord 推播提醒
- 先以本機展示版驗證操作流程

## Current Status

目前版本為 Demo 用途，特點如下：

- 可在本機直接展示
- 可使用假資料模擬流程
- 不需要連接正式資料庫
- 不需要連接正式 Discord Webhook
- 可先作為 GitHub 展示與內部提案版本

## Team Structure

目前預設部門：

- 驗證組
- 品檢組

## Demo Features

目前已完成的展示功能：

- 成員管理畫面
- 排程建立畫面
- 工作狀態總覽
- 排程清單展示
- 模擬提醒紀錄
- 單機版展示頁面

## Demo Files

重要檔案如下：

- `demo-preview.html`
  單機版展示頁面，直接雙擊即可預覽
- `open-demo.cmd`
  Windows 一鍵開啟展示頁
- `src/server.js`
  本機 API 與網頁服務入口
- `public/`
  網頁版前端資源
- `data/app-data.json`
  假資料與展示資料

## How To Preview

### Option 1: Standalone Demo

直接開啟以下檔案即可，不需要啟動伺服器：

- `demo-preview.html`

### Option 2: Local Server Demo

若要使用本機伺服器版本：

```bash
node src/server.js
```

然後開啟：

```text
http://localhost:3000/
```

## Suggested Deployment Plan

未來若部署到公司伺服器，可依下列方向擴充：

1. 接入正式資料庫，例如 SQLite、PostgreSQL 或 SQL Server
2. 接入正式 Discord Webhook
3. 建立帳號權限管理
4. 增加排程自動提醒機制
5. 建立主管報表與查詢介面

## Future R Integration

若未來要導入 R 語言，可以採用以下方式：

- 使用 R 作為資料分析與報表引擎
- 使用 plumber 建立 R API
- 使用 Shiny 建立分析型內部系統頁面
- 保留目前前端作為展示或操作介面

## Notes

這個版本主要是為了快速展示概念與操作流程，不代表最終正式系統架構。正式上線版本可再依公司環境調整為更完整的伺服器架構與權限機制。
