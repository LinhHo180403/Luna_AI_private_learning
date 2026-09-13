# Luna AI

AI VTuber tiếng Việt (song ngữ Việt-Anh) - chat assistant với tính cách nhất quán,
tích hợp game (Rắn săn mồi, Cờ ca-rô/Gomoku) và tính năng lập kế hoạch.

> **Lưu ý quan trọng:** Đây là bản dựng lại (rebuild) sau khi thư mục dự án gốc bị
> mất do cài lại Windows. Kiến trúc và logic được khôi phục theo đúng tài liệu đã
> lưu (`Luna_AI_Project_Status.docx`, `Luna_AI_VTuber_Roadmap.docx`), nhưng nội
> dung câu thoại cụ thể trong `lunaPrompt.js` là viết mới, không phải bản gốc.

## Cấu trúc dự án

```
luna-ai/
├── backend/          # Node.js + Express, kiến trúc Brain -> Skills
└── frontend/         # React 19 + Vite
```

## Cài đặt & chạy

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm start          # hoặc: npm run dev (dùng nodemon, tự reload khi sửa code)
```

Backend chạy mặc định ở `http://localhost:3001`. Mặc định `AI_PROVIDER=offline`
trong `.env` - **không cần API key** để chạy và test toàn bộ tính năng.

### 2. Frontend

Mở terminal khác:

```bash
cd frontend
npm install
npm run dev
```

Frontend chạy ở `http://localhost:5173`, tự động proxy `/api/*` sang backend
(xem `frontend/vite.config.js`).

Mở trình duyệt tới `http://localhost:5173` để bắt đầu chat với Luna.

## Bật AI thật (NaraRouter)

1. Trong `backend/.env`, đổi `AI_PROVIDER=nara` và điền `AI_API_KEY` thật.
2. Khởi động lại backend.
3. Theo đúng nguyên tắc trong roadmap: gửi 1 tin nhắn đơn giản trước để xác nhận
   plumbing hoạt động, tránh test nhiều tính năng cùng lúc gây tốn token oan.

## Test nhanh (không cần UI)

```bash
# Kiểm tra backend còn sống
curl http://localhost:3001/api/health

# Gửi thử 1 tin nhắn
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"chào Luna","sessionId":"test"}'
```

## Các lệnh thử trong chat

- `"tôi tên là <tên>"` - Luna lưu tên vào long-term memory
- `"5 + 5 * 2"` - Calculator skill
- `"chơi rắn đi"` / `"đóng game rắn"` - Snake (AI tự chơi hoặc người chơi)
- `"chơi cờ ca rô"` - TicTacToe (3x3 minimax hoặc Gomoku 15x15 heuristic)
- `"thời tiết ở Hà Nội"` - Weather (dữ liệu mock offline)
- `"lập kế hoạch cho việc học tiếng Anh"` - Planner (hiển thị PlanCard)

## Ghi chú kỹ thuật

- `backend/skills/offlineChatSkill.js` là **dead code cố ý giữ lại** để tham khảo
  lịch sử - KHÔNG được nạp vào `SKILL_ORDER`. Xem comment đầu file để biết chi tiết.
- Thứ tự skill trong `backend/skills/index.js` (`SKILL_ORDER`) rất quan trọng -
  đọc comment trong file trước khi thay đổi.
- Toàn bộ logic thuần (pure functions) trong các file game/App đã được viết để
  test độc lập bằng Node, không cần trình duyệt - xem phần export ở đầu mỗi file
  `SnakeGame.jsx`, `TicTacToe.jsx`, `App.jsx`.
