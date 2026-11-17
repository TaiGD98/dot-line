# 4. Roadmap & open questions

## 4.1 What exists today <Badge type="tip" text="Live" />

- Project scaffold: Phaser 4 game, docs site and versioned web releases
- Bản chơi đầu: tap → hạt chạy theo dây, va chạm mất tim, cặp vỡ (effect theo kích thước), dây Completed, thắng/thua, Hint (zoom 1.5x), pinch zoom tới 3x, hướng dẫn 3 màn đầu, nhãn Hard, 10 level mở đầu
- [Level editor](../guide/editor) tại `/editor/`, generator v2 (từ ảnh hoặc SVG, chọn 1 trong 3 phương án)
- Hệ thống 100 level (bộ 5: relax / thường / khó), điểm độ khó, 100 hình SVG ([Level system](../guide/level-system))

## 4.2 Roadmap <Badge type="warning" text="Coming soon" />

Order of priority. Milestones are scope buckets, not dates.

Kế hoạch ban đầu (M1 bản chơi đầu, M2 kích thước hạt và HUD, M3 editor và hint) đã xong trong v0.1.0, xem 4.1.

### Tiếp theo
| Item | Chapter |
|---|---|
| Chơi thử 100 level bằng tay, chỉnh hình chưa đẹp trong `art/levels/` | [Level system](../guide/level-system) |
| Chơi thử trên điện thoại thật: tốc độ hạt, pinch zoom | [Rules](./rules) |
| Obstacle (chưa chốt ý tưởng) | _TBD_ |

## 4.3 Known issues {#known-issues}

| Issue | Impact | Planned fix |
|---|---|---|

## 4.4 Open questions {#open-questions}

| Question | Options | Current lean |
|---|---|---|
| Số cặp, số màu và độ khó qua các level | _TBD_ | Để sau |
| Cách kiểm tra level giải được | Bằng tay / bằng công cụ | _TBD_ |
| Thị trường mục tiêu, đối tượng người chơi | _TBD_ | _TBD_ |
