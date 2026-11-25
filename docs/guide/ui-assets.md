# Ảnh còn thiếu: bóng, UI, Home

Theme trong game gồm **bóng** (Jelly mặc định, Water, Fluffy; mở ở level 1, 5, 10) và **nền** (Classic, Fluffy; Fluffy mở ở level 10). **UI dùng chung**, không đổi theo theme. Ảnh Fluffy đã có (xem [Fluffy theme: assets](./fluffy-assets)); trang này liệt kê phần còn thiếu. Hiện các phần này đang **vẽ tạm bằng code**: có ảnh nào thì thay ảnh đó.

Ảnh nhỏ cùng loại được **gom vào một ảnh** (một lần gen ra nhiều hình, xếp lưới), rồi lệnh xử lý cắt ra từng hình. Quy ước cho mọi ảnh gộp:

- Mỗi hình nằm **gọn trong ô của nó**, khoảng trống rộng giữa các ô, **không hình nào chạm hay vượt vạch chia ô**.
- **Nền trong suốt**; nếu công cụ không có, dùng **nền xanh lá thuần `#00FF00`** và không có màu xanh lá trong hình.
- **Không chữ, logo, watermark** (chữ trên nút do game vẽ).
- Đặt tên file đúng như dưới, bỏ vào `art/ui/` (bóng: `art/balls/`).

Phần *Style* dùng chung (dán vào đầu prompt):

```text
Style: cute casual mobile puzzle game, soft 3D cartoon render, clean simple shapes, bright friendly colours, smooth soft lighting from the top left, gentle ambient occlusion, high resolution, crisp edges that read at a small size.
```

## 1. `balls.png`: bóng Water và Jelly (một ảnh, 3 ô)

Bóng được **tô màu bằng code** cho đủ 28 màu, nên ảnh vẽ **màu xám trung tính** (không ám màu). Bóng tròn đều, nhìn thẳng, chiếm khoảng 85% chiều rộng ô.

| Ô | File | Nội dung |
|---|---|---|
| Trái | `water-fill` | **Nước bên trong** quả bóng nước: một khối cầu nước **đầy kín** (không có khoảng trống, không bọt khí lớn), xám trung tính, có vân sóng nước và vệt sáng khúc xạ (caustics) mờ bên trong. Không có vỏ. |
| Giữa | `water-shell` | **Vỏ bong bóng trong suốt** đặt chồng lên phần nước: chỉ có các vệt sáng trên vỏ (một vệt cong lớn ở trên trái, một chấm sáng nhỏ, viền mép sáng nhẹ), phần còn lại **trong suốt hoàn toàn**. |
| Phải | `jelly-ball` | **Bóng thạch bóng loáng** (glossy), xám trung tính: thân đặc, mềm, điểm bóng sắc ở trên trái, ánh phản quang nhẹ ở dưới phải. |

Nước trong bóng Water **sóng sánh khi đứng yên** (vẫn đầy bình): code làm chuyển động bằng cách lắc phần nước (`water-fill`) bên trong vỏ, nên hai lớp phải **cùng tâm, cùng cỡ**. Bóng Jelly **không có idle animation**.

```text
[Style]
One wide image divided into three equal square cells side by side, each cell holds one ball, with wide empty gaps; nothing crosses the cell borders.
All three balls are neutral grey only (no colour tint at all, they are recoloured in code), perfectly round, seen straight on, centred in their cell, about 85 percent of the cell width, all three exactly the same size.
LEFT CELL: only the water inside a water balloon: a sphere completely filled with water (no air gap, no big bubbles), neutral grey, with soft wavy water ripples and faint light caustics inside, no outer shell, no reflections on a surface.
MIDDLE CELL: only the clear glass-like shell of a water bubble, to be placed on top of the left ball: a big curved white highlight at the top left, a small bright specular dot, a faint bright rim around the edge, everything else fully transparent.
RIGHT CELL: a glossy jelly candy ball, solid and squishy, neutral grey, a sharp white specular highlight at the top left, a soft glossy reflection band, a faint bounce light at the bottom right.
Isolated on a transparent background (if not available: pure flat chroma-key green #00FF00, no green in the balls).
Wide 3:1 image, 1536 x 512 pixels.
Negative: colour tint, text, watermark, ground shadow, faces, more than three items, items crossing the cell borders.
```

### Gen lại bóng nước: `water.png` (một ảnh, 2 ô)

Bản `balls.png` hiện tại có phần nước tối ở trên, sáng ở dưới, ngược với ánh sáng của mọi thứ khác trong game (đèn từ **trên trái**). Tạm thời lệnh `npm run art:ui` làm phẳng ánh sáng của phần nước và tự thêm sáng trên / tối dưới vào lớp vỏ. Gen lại hai lớp của bóng nước (bóng Jelly giữ nguyên). Có `art/ball/water.png` thì lệnh dùng nó thay cho hai ô nước của `balls.png`.

- **Phần nước:** đều màu, **không có mảng sáng tối lớn** (game lắc phần nước qua lại để làm sóng sánh, nên ánh sáng trong nước sẽ bị xoay theo). Chỉ có vân sóng và vệt sáng khúc xạ nhỏ phủ đều khắp quả cầu.
- **Vỏ:** ánh sáng **từ trên trái**: vệt sáng cong lớn ở trên trái, phần trên của vỏ sáng hơn, phần dưới tối hơn một chút, viền dưới có bóng tối mờ; phần còn lại **trong suốt**.

```text
[Style]
One wide image divided into two equal square cells side by side, each cell holds one ball, with wide empty gaps; nothing crosses the cell borders.
Both balls are neutral grey only (no colour tint, they are recoloured in code), perfectly round, seen straight on, centred in their cell, about 85 percent of the cell width, exactly the same size.
LEFT CELL: only the water inside a water balloon: a sphere completely filled with water, an EVEN flat mid grey all over (no big light or dark areas, no gradient from top to bottom), covered evenly with soft wavy water ripples and thin light caustic lines, no outer shell.
RIGHT CELL: only the clear glass-like shell of a water bubble, lit from the top left: a big curved white highlight at the top left, a small bright specular dot, the top half of the rim slightly brighter, a soft faint grey shade along the bottom edge, everything else fully transparent.
Isolated on a transparent background (if not available: pure flat chroma-key green #00FF00, no green in the balls).
Wide 2:1 image, 1024 x 512 pixels.
Negative: colour tint, light or dark gradient across the water, text, watermark, ground shadow, faces, more than two items, items crossing the cell borders.
```

## 2. `icons.png`: bộ icon UI (một ảnh, lưới 5 × 4)

Icon **trắng đặc, viền mờ tối nhẹ**, để đặt lên nút tròn có màu theo theme (nền nút do code vẽ). Mỗi icon chiếm khoảng 70% ô, cùng độ dày nét, cùng phong cách.

| Hàng | Icon (trái sang phải) |
|---|---|
| 1 | `settings` (bánh răng), `pause`, `play` (tam giác), `restart` (mũi tên vòng tròn), `close` (dấu X) |
| 2 | `sound-on` (loa có sóng), `sound-off` (loa gạch chéo), `music-on` (nốt nhạc), `music-off` (nốt nhạc gạch chéo), `lock` (ổ khóa) |
| 3 | `vibrate-on` (điện thoại rung), `vibrate-off` (điện thoại rung gạch chéo), `sun` (theme sáng), `moon` (theme tối), `heart` |
| 4 | `home` (ngôi nhà), `shop` (túi mua sắm), `theme` (bảng màu vẽ), `hint` (bóng đèn), `cut` (cái kéo) |

```text
[Style]
A sprite sheet of 20 game UI icons in a grid of 5 columns and 4 rows, every icon centred in its own square cell, about 70 percent of the cell, wide empty gaps between cells, nothing crosses the cell borders.
All icons are solid white glyphs with a soft rounded shape and a thin subtle dark grey outline, the same stroke weight and the same style, flat with a very soft inner shading, no background circle.
Row 1: a settings gear, a pause sign (two bars), a play triangle, a restart circular arrow, a close X.
Row 2: a speaker with sound waves, a speaker with a diagonal slash, a music note, a music note with a diagonal slash, a padlock.
Row 3: a vibrating phone, a vibrating phone with a diagonal slash, a sun, a crescent moon, a heart.
Row 4: a house, a shopping bag, a painter's palette, a light bulb, scissors.
Isolated on a transparent background (if not available: pure flat chroma-key green #00FF00, no green in the icons).
Square image, 2560 x 2048 pixels (5 x 4 cells of 512 px).
Negative: text, letters, numbers, watermark, coloured icons, background circles, items crossing the cell borders.
```

## Palette UI (lấy từ màn chơi)

Mọi UI (Home, pop-up, màn thắng, pop-up mở khóa, màn chơi) dùng **một palette**, lấy từ màn chơi (`PALETTE` trong `src/game/skinui.ts`). Dán đoạn *Colours* này vào các prompt dưới:

| Vai trò | Màu |
|---|---|
| Nền (board, Home) | kem `#F2EEE6` |
| Giấy (trong khung pop-up, ô) | `#FFF9F0`, ô lõm `#F5EADB` |
| Viền khung | nâu nhạt `#E7B48E` |
| Nút chính (PLAY, RESUME, APPLY, CONTINUE), dải ruy băng, level đang chơi | cam đào `#F6A26B` (mép dưới `#D27A45`) |
| Nút tròn, booster, level thường | hồng nhạt `#F7B6C8` (mép dưới `#D98AA2`) |
| Level khó | tím `#B57CF0` (mép dưới `#8452C4`) |
| Nút phụ (LATER, QUIT) | xám ấm `#B9B1A6`; nút đóng X đỏ `#E8536B` |
| Chữ trên nền sáng | nâu `#8A5A2B`; viền chữ trắng trên nút: xanh navy `#26346E` |

```text
Colours: warm cream background #F2EEE6, paper #FFF9F0, inset #F5EADB, soft tan borders #E7B48E, peach orange main buttons #F6A26B with a darker bottom edge #D27A45, light pink round buttons #F7B6C8 with a darker bottom edge #D98AA2, purple accent #B57CF0, brown text #8A5A2B, navy outlines #26346E. Warm, soft, friendly; no blue, no green.
```

## 3. `ui-kit-3.png`: khung, nút, bảng Theme (một ảnh, lưới 4 × 2)

**Gen lại theo palette** (bản `ui-kit-2.png` màu xanh, hiện đang được tô lại tạm). Mỗi hình một ô, khoảng trống rộng, không vượt ô (lệnh cắt theo từng hình nên lệch ô một chút vẫn được).

| Ô | Nội dung |
|---|---|
| 1 | **Khung pop-up** trống: viền nâu nhạt dày bo góc lớn, trong là giấy kem phẳng (kéo giãn 9-slice) |
| 2 | **Ruy băng** cam đào, trống (banner "Theme") |
| 3 | **Nút tròn** hồng nhạt trống, có độ dày 3D phía dưới, viền trắng |
| 4 | **Nút dài** cam đào trống, có độ dày 3D phía dưới, viền trắng |
| 5 | **Ô lưới** chọn bóng / nền: thẻ vuông bo góc, giấy kem, viền nâu nhạt mảnh |
| 6 | **Tab đang chọn** của bảng Theme: thẻ chữ nhật bo hai góc trên, cam đào, trống |
| 7 | **Tab không chọn**: như ô 6 nhưng màu ô lõm `#F5EADB` |
| 8 | **Khung bảng** của màn Theme: hình chữ nhật đứng bo góc, giấy kem, viền cam đào, trống (9-slice) |

```text
[Style]
[Colours]
A casual puzzle game UI kit sheet in a grid of 4 columns and 2 rows, each item centred in its own cell with wide empty gaps, nothing touches another item.
1: an empty popup panel with big rounded corners, a thick soft tan border, a flat cream paper inside with no pattern.
2: an empty peach orange title ribbon with folded ends, no text.
3: an empty round light pink button with a 3D thickness at the bottom and a white outline, no icon.
4: an empty long rounded peach orange button with a 3D thickness at the bottom and a white outline, no text.
5: an empty square card with rounded corners, cream paper, a thin soft tan border.
6: an empty tab header: a wide rectangle with only the two top corners rounded, peach orange.
7: the same tab header in light sand colour #F5EADB.
8: an empty tall rounded rectangle panel, cream paper inside, a thick peach orange border.
Isolated on a real transparent background (no checkerboard painted in), front view, soft lighting from the top left.
Wide 2:1 image, 2048 x 1024 pixels.
Negative: text, letters, icons, numbers, watermark, blue, green, items touching each other, perspective tilt.
```

## 4. `home-2.png`: màn Home (một ảnh, lưới 3 × 2)

Nút level giờ dùng **nút tròn của booster** (ô 3 ở trên, tô màu: hồng level thường, tím level khó, cam đào level đang chơi), không cần nút level riêng và vòng vàng. Còn thiếu:

| Ô | Nội dung |
|---|---|
| 1 | **Thanh tab dưới cùng**: dải ngang trắng / giấy kem, mép trên bo nhẹ, viền nâu nhạt mảnh (kéo giãn ngang) |
| 2 | **Nền tab đang chọn**: thẻ bo góc màu ô lõm `#F5EADB` |
| 3 | **Thẻ tên trên cùng** (pill): viên thuốc bo tròn navy `#26346E`, trống |
| 4 | **Đoạn đường nối** dọc giữa các nút level: dải trắng viền nâu, **lặp liền mạch** trên dưới (không có đầu bo) |
| 5 | **Đám mây** nhỏ trang trí, màu kem đậm hơn nền một chút |
| 6 | **Nhãn SOON**: thẻ nhỏ bo góc cam, trống |

```text
[Style]
[Colours]
A sprite sheet for a level map screen in a grid of 3 columns and 2 rows, each item centred in its own cell with wide empty gaps, nothing touches another item.
1: a wide bottom navigation bar: a horizontal strip of cream paper with a slightly rounded top edge and a thin soft tan line along the top, empty.
2: a rounded rectangle highlight for the selected tab, light sand #F5EADB.
3: an empty pill shaped name plate, navy #26346E, with a soft highlight.
4: a short vertical path strip, white with a thin brown outline on both sides, seamless at the top and bottom so it can repeat (no rounded ends).
5: a small soft cloud, cream slightly darker than the background.
6: a small empty rounded label tag, orange.
Isolated on a real transparent background (no checkerboard painted in).
Wide 3:2 image, 1536 x 1024 pixels.
Negative: text, numbers, letters, watermark, blue, green, items touching each other.
```

## 4b. `popup.png`: khung pop-up có chỗ cho tiêu đề (một ảnh)

Khung pop-up hiện tại là một tấm giấy trơn: tiêu đề ("Settings", "Out of Hearts!", "Well Done!"…) phải nằm chung với nội dung nên trông chật và lệch. Cần khung có **phần đầu riêng cho tiêu đề**: một dải đầu (header) màu cam đào ở mép trên, cao khoảng 1/5 khung, ngăn với phần thân giấy kem bằng một đường viền / gờ rõ. Code viết tiêu đề vào dải đầu và kéo giãn phần thân theo nội dung (9-slice: góc, viền và dải đầu giữ nguyên cỡ, phần thân giữa phẳng một màu).

```text
[Style]
[Colours]
One empty popup window frame for a casual mobile puzzle game, front view, centred, filling most of the image.
A rounded rectangle with big rounded corners and a soft tan outer border; at the top a header band (about one fifth of the height) in peach orange #F6A26B with a soft highlight, clearly separated from the body by a slim darker ledge; the body below is flat cream paper #FFF9F0 with no pattern so it can be stretched.
The header band is empty (the title is written in code), the body is empty.
Soft 3D, soft lighting from the top left, a gentle drop shadow under the frame.
Isolated on a real transparent background (no checkerboard painted in).
Portrait 3:4 image, 1536 x 2048 pixels.
Negative: text, letters, icons, buttons, ribbon, watermark, blue, green, pattern inside the body.
```

Bỏ vào `art/ui/popup.png` (tên `pop up.png` cũng được), chạy `npm run art:ui`: game dùng khung này cho mọi pop-up (thay `panel` của `ui-kit-3.png`). Lệnh in ra chỗ dải đầu kết thúc (hiện 98 / 640 px); nếu ảnh mới có dải đầu cao khác nhiều, chỉnh số cắt 9-slice trong `popupCard` (`src/scenes/uikit.ts`).

## 4c. `rope-tile.png`: dây thừng (obstacle, GDD 3.12)

Một đoạn dây thừng bện **thẳng ngang, xám trung tính**, lặp liền mạch trái phải. Game tô lại theo màu của cặp (xám giữa thành màu cặp, xám đậm thành bóng, xám sáng thành điểm sáng) và **lặp texture dọc theo dây** (web: `Rope` của Phaser; Unity: `LineRenderer`, Texture Mode = Tile, material tô màu cặp).

```text
A seamless, horizontally tileable segment of thick braided rope for a casual mobile puzzle game, side view, running straight left to right and filling the full width edge to edge. Two strands twisted together with clear diagonal twists (about 4 twists across the image), soft rounded cartoon shading, lit from the top left with a soft highlight along the top edge and a gentle shadow along the bottom. The rope is exactly 70% of the image height, centred vertically. Fully neutral grey tones only (light grey highlights, mid grey body, dark grey grooves between strands), no colour tint. The left and right ends must line up perfectly so the image tiles with no visible seam. Transparent background, no outline, no frayed ends, no texture noise, clean vector-like style matching glossy jelly balls.
```

`npm run art:ui` tự tìm chu kỳ xoắn trong ảnh (độ dịch mà dây trông giống hệt), cắt một số nguyên chu kỳ ở giữa ảnh (nên hai mép khớp nhau dù hai đầu ảnh gốc không khớp) và thu về **256 × 64** (lũy thừa của 2, để lặp được trên GPU). Với ảnh hiện tại: chu kỳ 407 px, cắt 3 chu kỳ. Trong game dây rộng 13 px, mỗi lần lặp dài 52 px.

`rope-end.png` (nút thắt đầu dây) **không dùng**: hai đầu dây luôn nằm dưới bóng của cặp nên không thấy; ảnh đó lại có quầng tối mờ thay vì nền trong.

## 4d. `lock-key.png`: ổ khóa và chìa (obstacle, GDD 3.13)

Một ảnh 2 ô: **ổ khóa đóng** (trái) và **chìa** nằm chéo (phải), **xám trung tính**. Game tô lại theo màu nhãn của từng cặp ổ / chìa (vàng, xanh dương, tím, xanh lá) và đặt thẳng lên line, không có khung. `npm run art:ui` cắt thành `lock.png` và `key.png` (256 px).

```text
A sprite sheet of two game icons for a casual mobile puzzle game, side by side in a grid of 2 columns and 1 row, each icon centred in its own square cell with wide empty margins, nothing touches the other icon or the cell edges.
Left: a chunky, cute padlock seen from the front: a rounded, slightly wide body with a small keyhole in the middle and a thick rounded shackle on top, closed.
Right: a chunky, cute old-style key lying diagonally (bow at the lower left, teeth at the upper right): a round bow with a hole, a thick short shaft and two simple square teeth.
Both in fully neutral grey tones only (light grey highlights, mid grey body, dark grey for the keyhole, the hole in the bow and the shading), no colour tint, so they can be recoloured in the game.
Soft glossy 3D look like toy plastic, rounded edges, soft lighting from the top left with a clear highlight on the upper left, gentle shading on the lower right, a thin darker grey rim for a readable silhouette at small size.
Simple bold shapes that stay readable at 40 pixels; no tiny details, no texture, no scratches.
Isolated on a real transparent background (no checkerboard painted in), no drop shadow, no glow.
Wide 2:1 image, 2048 x 1024 pixels.
Negative: text, numbers, letters, chain, open padlock, multiple keys, key ring, colour, metal rust, realistic photo, watermark.
```

## 5. Còn lại

- **Fluffy:** chỉ còn mặt "thức" `face-awake.png` (một ảnh, xem [Fluffy theme: assets](./fluffy-assets), mục 9: dùng nửa trái của prompt đó). Bàn tay giờ là bàn tay chung ở mục 3.
- **Ảnh ở màn chọn theme:** không cần ảnh riêng: game dùng chính bóng màu đỏ của từng loại bóng (có idle animation) và một ô hoa văn của từng nền.
- **Âm thanh** (cho các nút bật/tắt Sound FX, Music trong Settings): game chưa có âm thanh nào; khi cần sẽ có yêu cầu riêng.

## Gửi ảnh

Bỏ ảnh vào thư mục dưới rồi chạy `npm run art:ui` (`tools/ui-art.ts`): lệnh cắt từng hình trong lưới ra `src/assets/ui/` (ảnh nền trắng hay nền ô bàn cờ vẽ cứng cũng được: lệnh xóa nền từ mép mỗi ô vào, dừng ở viền màu hoặc viền tối của hình; mỗi ô chỉ giữ mảng hình lớn nhất). Vỏ bóng nước được đổi thành lớp trong: phần xám đều trong suốt, chỉ giữ vệt sáng và viền. Game dùng ảnh nào có, phần còn thiếu vẽ bằng code (`src/scenes/uiart.ts`).

| File | Thư mục | Trạng thái |
|---|---|---|
| `balls.png` | `art/ball/` | **đã dùng**: bóng Jelly (tô màu theo cặp), bóng Water (nước tô màu, lắc qua lại bên trong vỏ trong; tạm sửa ánh sáng, nên gen lại `water.png`) |
| `water.png` | `art/ball/` | **đã dùng**: phần nước và vỏ của bóng Water (thay hai ô nước của `balls.png`) |
| `icons.png` | `art/ui/` | **đã dùng**: nút tròn, Settings, tab Home, booster, tim (tô đỏ) |
| `ui-kit-2.png` (thay `ui-kit.png`) | `art/ui/` | **chỉ còn bàn tay tutorial** (phần khác lấy từ `ui-kit-3.png`): khung pop-up (kéo giãn 9-slice), ruy băng (chỉ cho banner màn Theme), nút tròn và nút dài (tự tô màu khác khi cần), ô thẻ của lưới Theme, bàn tay tutorial |
| `home.png` | `art/ui/` | **đã dùng một phần**: đường nối, mây (nút level giờ dùng nút tròn của booster) |
| `popup.png` (hoặc `pop up.png`) | `art/ui/` | **đã dùng**: khung mọi pop-up; tiêu đề nằm giữa dải đầu cam, phần thân kéo giãn theo nội dung |
| `ui-kit-3.png` | `art/ui/` | **đã dùng**: khung pop-up, ruy băng (banner Theme), nút tròn (hồng: nút, booster, level), nút dài (cam đào), ô lưới, tab và khung bảng Theme |
| `home-2.png` | `art/ui/` | **đã dùng**: thanh tab dưới, nền tab đang chọn, thẻ tên "Dot Line", đường nối, mây, nhãn SOON |
| `rope-tile.png` | `art/ui/` | **đã dùng**: dây thừng (obstacle), tô màu theo cặp, lặp dọc dây |
| `rope-end.png` | `art/ui/` | không dùng (đầu dây nằm dưới bóng) |
| `lock-key.png` | `art/ui/` | **đã dùng**: ổ khóa và chìa (obstacle), tô màu nhãn, không khung |
| `awake.png` | `art/fluffy/` | **đã dùng** (`npm run art:fluffy`): cặp Fluffy đã va chạm thì thức, mở mắt, không sọc |
