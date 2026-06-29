# 🎯 SeatSpin — Web Quay Random Chỗ Ngồi + Bot Telegram

Web quay random chỗ ngồi linh hoạt (kiểu rạp phim), điều khiển bằng **bot Telegram**.

## Tính năng
- 🪑 **Sơ đồ tuỳ biến**: nhiều hàng (A, B, C…), số ghế mỗi hàng tuỳ ý.
- ✍️ **Nhập tên trên web** (không hard-code), lưu lại khi restart.
- 👫 **Nhóm ngồi cạnh nhau**: tạo các nhóm tên, ở chế độ sắp đặt mỗi nhóm luôn được xếp vào các ghế **liền kề** trong cùng 1 hàng (và xáo chỗ trong nhóm).
- 🎛️ **2 chế độ** điều khiển qua Telegram: *tự nhiên* (random hoàn toàn) và *sắp đặt* (theo nhóm).
- 🎬 Giao diện rạp phim, hiệu ứng quay slot-machine + confetti. Màn quay **không lộ** thông tin chế độ/sắp đặt (cài đặt nằm trong ngăn riêng).

## Chạy local
```bash
npm install
TELEGRAM_BOT_TOKEN=token_cua_ban npm start   # hoặc: node --env-file=.env server.js
```
Mở http://localhost:3000 — biểu tượng ⚙️ góc phải để nhập tên / sơ đồ / nhóm.

## Lệnh Telegram
| Lệnh | Tác dụng |
|---|---|
| `random tự nhiên` | chế độ ngẫu nhiên hoàn toàn |
| `random theo sắp đặt` | các nhóm luôn ngồi cạnh nhau |
| `quay` | quay 1 lần (web tự chạy hiệu ứng) |
| `trạng thái` | xem chế độ + kết quả |
| `/nhom Ngọc, Trinh, Diệp` | tạo nhóm ngồi cạnh nhau |
| `/dsnhom` / `/xoanhom` | xem / xoá nhóm |
| `/dsten` | xem danh sách người |
| `/setten An, Bình, ...` | đặt lại danh sách người |
| `/sodo A:8, B:8, C:10` | đặt sơ đồ (Hàng:SốGhế) |
| `/help` | hướng dẫn |

## Deploy free 24/7 (Render)
1. Đẩy code lên GitHub.
2. render.com → New → Web Service → chọn repo (đọc sẵn `render.yaml`, plan **Free**).
3. Thêm biến môi trường `TELEGRAM_BOT_TOKEN`.
4. Deploy → có link `https://...onrender.com`. Bot dùng long polling nên chỉ cần token.

## Cấu trúc
```
server.js          # Express + REST API
src/seating.js     # Engine quay random (layout, nhóm liền kề, 2 chế độ)
src/store.js       # Trạng thái + lưu data.json
src/telegram.js    # Bot Telegram (long polling)
public/            # Giao diện (rạp phim + ngăn cài đặt)
```

## API
| Method | Path | Body |
|---|---|---|
| GET | `/api/state` | |
| POST | `/api/mode` | `{mode:"natural"\|"arranged"}` |
| POST | `/api/spin` | |
| POST | `/api/people` | `{people:[...]}` |
| POST | `/api/layout` | `{rows:[{label,count}]}` |
| POST | `/api/groups/add` | `{members:[...],label?}` |
| DELETE | `/api/groups/:id` | |
| POST | `/api/groups/clear` | |
