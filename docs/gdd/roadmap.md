# 4. Roadmap & open questions

## 4.1 What exists today <Badge type="tip" text="Live" />

- Project scaffold: Phaser 4 game, docs site and versioned web releases
- Bản chơi đầu: tap → hạt chạy theo dây, va chạm mất tim, cặp vỡ (effect theo kích thước), dây Completed, thắng/thua, Hint (zoom 1.5x), pinch zoom tới 3x, hướng dẫn 3 màn đầu, nhãn Hard, 10 level mở đầu
- [Level editor](../guide/editor) tại `/editor/`, generator v2 (từ ảnh hoặc SVG, chọn 1 trong 3 phương án)
- Hệ thống 100 level (bộ 5: relax / thường / khó), điểm độ khó, 100 hình SVG ([Level system](../guide/level-system))
- v0.3.0: bộ 30 level đang chơi (2 level hướng dẫn + chapter 5 từ tranh line art), booster Hint và Cut ở panel dưới, cảnh kết thúc slow motion, bảng màu Voxel 28 màu với cách phối theo kiểu phối màu, theme sáng/tối, editor chia chapter và generator chế độ Strokes (bóng bự, một cỡ bóng)
- v0.4.0: Play on (hồi tim chơi tiếp) và pop-up "Are you sure?" khi QUIT, bỏ slow motion cuối level, game build đúng Play order của Organiser (`levels/game.json`), Organiser có ảnh level và chọn tutorial từng level, editor có Dot size cho cả level và ô big dot từng bóng
- v0.5.0: hai bản game phụ Jelly (bóng như thạch) và Magic (level là dấu niêm phong trên cánh cửa, cửa mở ra căn phòng phía sau); giọt nước khi va chạm; hitbox 78%; màu theo nhóm tông (dây gần nhau không bao giờ cùng tông hay nhìn giống nhau, ở cả 2 theme); 30 level gen lại ở chapter 6 với bóng bự từ vòng tròn vẽ bằng nét

## 4.2 Roadmap <Badge type="warning" text="Coming soon" />

Order of priority. Milestones are scope buckets, not dates.

Kế hoạch ban đầu (M1 bản chơi đầu, M2 kích thước hạt và HUD, M3 editor và hint) đã xong trong v0.1.0, xem 4.1.

### Tiếp theo
| Item | Chapter |
|---|---|
| Chơi thử 30 level của bản v0.5.0 (chapter 6) bằng tay, chỉnh level chưa đẹp trong editor | [Level system](../guide/level-system) |
| Booster Hint, Cut và Play on: giới hạn số lượt, nối quảng cáo (hiện dùng không giới hạn) | [Rules](./rules) |
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
