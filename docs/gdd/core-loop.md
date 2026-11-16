# 2. Core loop <Badge type="warning" text="Coming soon" />

1. **Quan sát:** nhìn board, xem cặp nào có đường đi tới hạt kia mà không bị hạt của cặp khác chắn.
2. **Tap:** chạm vào một hạt.
3. **Di chuyển:** hạt đó chạy dọc theo dây về phía hạt còn lại của cặp. Trong lúc đó người chơi có thể tap tiếp các cặp khác.
4. **Kết quả:**
   - **Thành công:** chạm được hạt kia → 2 hạt vỡ ra (effect văng màu, hạt càng to thì effect càng to) và biến mất; dây ở lại, đổi sang màu Completed → thanh tiến độ tăng.
   - **Thất bại:** đụng hạt của cặp khác → bị hủy, hạt quay về vị trí ban đầu, mất 1 tim. Hết tim thì thua màn.
5. Lặp lại cho tới khi board sạch → màn thắng (confetti, các dây Completed ghép thành hình của level) → sang level tiếp theo.

Mỗi cặp vừa biến mất sẽ mở đường cho cặp khác, nên phần thú vị là tìm ra thứ tự gỡ đúng.
