# 4. Roadmap & open questions

## 4.1 What exists today <Badge type="tip" text="Live" />

- Project scaffold: Phaser 4 game, docs site and versioned web releases
- Bản chơi đầu: tap → hạt chạy theo dây, va chạm mất tim, cặp vỡ (effect theo kích thước), dây Completed, thắng/thua, Hint (zoom 1.5x), pinch zoom tới 3x, hướng dẫn 3 màn đầu, nhãn Hard, 10 level mở đầu
- [Level editor](../guide/editor) tại `/editor/`, generator v2 (từ ảnh hoặc SVG, chọn 1 trong 3 phương án)
- Hệ thống 100 level (bộ 5: relax / thường / khó), điểm độ khó, 100 hình SVG ([Level system](../guide/level-system))
- v0.3.0: bộ 30 level đang chơi (2 level hướng dẫn + chapter 5 từ tranh line art), booster Hint và Cut ở panel dưới, cảnh kết thúc slow motion, bảng màu Voxel 28 màu với cách phối theo kiểu phối màu, theme sáng/tối, editor chia chapter và generator chế độ Strokes (bóng bự, một cỡ bóng)
- v0.4.0: Play on (hồi tim chơi tiếp) và pop-up "Are you sure?" khi QUIT, bỏ slow motion cuối level, game build đúng Play order của Organiser (`levels/game.json`), Organiser có ảnh level và chọn tutorial từng level, editor có Dot size cho cả level và ô big dot từng bóng
- v0.5.0: hai bản game phụ Jelly (bóng như thạch) và Magic (level là dấu niêm phong trên cánh cửa, cửa mở ra căn phòng phía sau); giọt nước khi va chạm; hitbox 78%; màu theo nhóm tông (dây gần nhau không bao giờ cùng tông hay nhìn giống nhau, ở cả 2 theme); 30 level gen lại ở chapter 6 với bóng bự từ vòng tròn vẽ bằng nét
- v0.6.0: bản game phụ Fluffy (cục bông lông có mặt, nền pattern cuộn chéo, lông bay, trail lấp lánh, tim cùng màu cặp; đánh sáng chỉnh trực tiếp bằng cheat); mỗi theme có danh sách màu riêng, màu khó nhìn được đổi sang màu không đụng dây gần nó

## 4.2 Roadmap <Badge type="warning" text="Coming soon" />

Order of priority. Milestones are scope buckets, not dates.

Kế hoạch ban đầu (M1 bản chơi đầu, M2 kích thước hạt và HUD, M3 editor và hint) đã xong trong v0.1.0, xem 4.1.

### Tiếp theo
| Item | Chapter |
|---|---|
| Chơi thử 30 level của bản v0.6.0 (chapter 6) bằng tay, chỉnh level chưa đẹp trong editor | [Level system](../guide/level-system) |
| Booster Hint, Cut và Play on: giới hạn số lượt, nối quảng cáo (hiện dùng không giới hạn) | [Rules](./rules) |
| Chơi thử trên điện thoại thật: tốc độ hạt, pinch zoom | [Rules](./rules) |
| Fluffy: mặt "thức" cho cặp đã va chạm và bàn tay tutorial lông xù (chờ ảnh `awake-hand.png`) | [Fluffy assets](../guide/fluffy-assets) |
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

## 4.5 Port sang Unity: lưu ý shader {#unity-shaders}

Game sắp được port sang Unity. Các ảnh cần đổi màu hiện được tô **từng pixel trên CPU** lúc chạy (canvas của trình duyệt); trên Unity nên làm bằng **shader** (nhanh hơn, chỉnh live không phải tạo lại texture). Bộ ảnh hiện tại dùng được với shader vì các ảnh cần tô màu đều là **ảnh xám**. Công thức dưới đây chép từ code để bản Unity ra giống bản web.

### Ảnh nào dùng shader nào

| Ảnh | Cách dùng trên Unity | Code web tương ứng |
|---|---|---|
| `src/assets/fluffy/ball.png` (xám, chưa có ánh sáng) | Shader **tô màu + đánh sáng cầu** (công thức bên dưới) | `ballTexture` trong `src/scenes/fluffy.ts` |
| `src/assets/fluffy/heart.png` (đỏ) | Shader tô màu theo kênh sáng nhất (dùng nguyên ảnh đỏ được) | `heartTexture` trong `src/scenes/fluffy.ts` |
| `src/assets/fluffy/fur.png` (trắng) | Không cần shader: tô bằng màu hạt của Particle System | `furPuff` trong `src/scenes/Game.ts` |
| `src/assets/fluffy/face-*.png` | Không cần shader: sprite chồng lên thân (rộng 68% đường kính thân, hạ 10% bán kính) | `faceFrame` trong `src/scenes/fluffy.ts` |
| `src/assets/fluffy/pattern-*.jpg` | Material lặp ô, Wrap Mode = Repeat, dịch UV để cuộn chéo (4 px/giây), mỗi ô phủ 1024 px board | `bg` trong `src/scenes/Game.ts` |
| `src/assets/magic/orb.png` (xám, đã bỏ nền xanh) | Shader tô màu như thân cục lông nhưng không có đèn (công thức orb bên dưới) | `colourOrb` trong `src/scenes/Door.ts` |
| `src/assets/magic/door.jpg` | Shader: màu nền theme + 35% vân sáng tối của ảnh quanh độ sáng trung bình | `makeDoor` trong `src/scenes/Door.ts` |
| `src/assets/magic/light-ray.jpg`, `light-burst.jpg`, `sparkle.jpg` (nền đen) | Shader **cộng sáng (Additive)**: nền đen tự biến mất | `Door.ts` |

### Công thức

Ký hiệu: `grey` là độ sáng của pixel ảnh (trung bình R, G, B, từ 0 tới 1); `mid` là độ sáng trung bình của phần đặc của ảnh (alpha > 200), **tính một lần cho mỗi ảnh** rồi truyền vào shader dưới dạng hằng số; `col` là màu của cặp (`base` trong bảng màu).

**Thân cục lông (Fluffy).** Pháp tuyến cầu lấy từ UV: tâm và bán kính là vùng đặc của ảnh (thân chiếm 90% khung). Ngoài vòng tròn thì kéo pháp tuyến về mép (`nz = 0`). Hướng đèn từ 5 số `LIGHT_*` trong `src/game/tuning.ts`:

```text
a = LIGHT_ANGLE (độ, 0 phải, 90 dưới, 180 trái, 270 trên)    h = LIGHT_HEIGHT
light = (cos a · √(1−h²), sin a · √(1−h²), h)
lit   = max(0, dot(normal, light))
shade = LIGHT_AMBIENT + LIGHT_DIFFUSE · lit
L     = clamp(mid · shade + LIGHT_SHEEN · lit⁴ + (grey − mid) · (0.6 + 0.4 · shade), 0, 1)
màu   = L < mid ? col · (0.3 + 0.7 · L / mid)
               : col + (1 − col) · ((L − mid) / (1 − mid))^1.4 · 0.55
```

**Orb (Magic):** giống dòng `màu` ở trên với `L = grey`, nhưng `0.25 + 0.75 · L / mid` cho phần tối và không có hệ số `0.55` cho phần sáng (điểm sáng thành trắng hẳn).

**Trái tim:** `mx`, `mn` là kênh lớn nhất và nhỏ nhất của pixel; phần ít màu (điểm bóng) giữ trắng:

```text
white = max(0, (1 − (mx − mn) / mx) − 0.25) / 0.75
v     = col · min(1, mx · 1.08)
màu   = v + (1 − v) · white · mx
```

### Chơi tiếp level đang dở

Lưu level đang chơi (xem Rules 3.11) bằng `PlayerPrefs` / file JSON, ghi khi trạng thái đổi và trong `OnApplicationPause(true)`, `OnApplicationQuit`; mở app thì vào thẳng level nếu có phần đã lưu khớp level đang tới.

### Lưu ý khi làm shader

- **Dùng ảnh trong `src/assets/fluffy/`, không dùng `art/fluffy/`.** Ảnh gốc trong `art/` còn ánh sáng sẵn và lông chưa làm đậm (lệnh `npm run art:fluffy` làm việc đó); dùng nó với shader thì ánh sáng bị chồng hai lần.
- **Không gian màu:** bản web tính màu trong sRGB (gamma). Unity mặc định dùng Linear, nên cùng công thức sẽ ra màu khác (thường nhạt, phẳng hơn). Hoặc đặt project ở **Gamma**, hoặc trong shader đổi màu sang gamma trước khi tính rồi đổi lại.
- **Tọa độ:** web có trục y hướng xuống, Unity hướng lên. Góc đèn (`LIGHT_ANGLE`), hướng lông bay và quạt giọt nước phải đảo trục y (đèn trên trái là 230° trên web, khoảng 130° trên Unity).
- **Màu mỗi cặp qua vertex color** (màu của SpriteRenderer hoặc MaterialPropertyBlock), không tạo material riêng cho từng màu, để 30 cặp vẫn được vẽ chung một lượt (batch). Màu cụ thể vẫn do code chọn theo theme (`themeColours` trong `src/core/palette.ts`), shader chỉ nhận màu đã chọn.
- **Đèn chỉnh live:** 5 số `LIGHT_*` thành tham số của material (dùng chung cho mọi cục lông), chỉnh được trong Play mode như cheat ⚙ dev của bản web.
- **Mép ảnh trong suốt:** PNG từ `npm run art:fluffy` không nhân sẵn alpha (premultiplied). Khi import bật *Alpha Is Transparency* để mép lông không bị viền tối.
- **Nén ảnh:** pattern đang 2508 × 2508 (không phải lũy thừa của 2). Nén ASTC trên điện thoại vẫn được; nếu cần máy iOS rất cũ (PVRTC) thì thu về 2048.
- **Dây và bóng bản Classic, Jelly** đang vẽ bằng code mỗi khung hình (không có ảnh). Trên Unity cần mesh dây tự dựng (hoặc plugin như Shapes) và một sprite bóng xám tô màu bằng shader như orb, hoặc shader vẽ hình tròn.
