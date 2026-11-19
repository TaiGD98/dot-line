# Magic variant: asset requests

Bản game phụ thứ ba, **Magic** (sẽ ở `/magic/`, nút **Play Magic** ở trang chủ). Cùng level và luật chơi như bản thường; khác ở khung cảnh: level là **dấu niêm phong (seal) trên một cánh cửa**.

## Cách chơi

| Lúc | Điều xảy ra |
|---|---|
| Vào level | Hai cánh cửa **sập vào từ hai bên**, khép lại ở giữa màn hình. |
| Ngay sau khi cửa khép | Hai bóng của mỗi cặp **cùng nằm ở một đầu dây**; một bóng **chạy theo dây tới đầu còn lại**, nên hai bóng rời xa nhau và về đúng vị trí bắt đầu chơi. |
| Khi chơi | Như bản thường, trên mặt cửa (màu nền của theme). Cửa đứng yên trên màn hình; pinch zoom chỉ phóng to level (dây và bóng). |
| Gỡ hết bóng | Level **trở về độ zoom bình thường và canh giữa lại**, khe cửa hiện ra và **ánh sáng lọt qua khe**, rồi hai cánh cửa **mở ra hai bên**, ánh sáng phía sau tràn ra, rồi hiện **Well Done**. |
| Bấm Next | Cửa **sập lại**, level sau bắt đầu (bóng lại chạy ra). |

Bóng giữ như bản thường, trừ khi có ảnh `orb.png`.

Bóng, map sáng lúc phá seal, chuyển động cửa, rung khi cửa sập, thời điểm và độ mạnh của ánh sáng, giọt nước, tia nổ và màn Well Done đều làm bằng code. Ảnh chỉ cần cho cửa, phía sau cửa và ánh sáng.

## Quy cách chung

- **Định dạng:** PNG, sRGB. Cỡ ghi ở từng ảnh; ra cỡ to hơn cùng tỉ lệ cũng được, mình sẽ thu nhỏ.
- **Ảnh toàn màn hình:** **1170 × 2532** (tỉ lệ dọc 6:13; Midjourney: `--ar 6:13`). Nếu công cụ không ra đúng tỉ lệ, chọn khung dọc cao nhất có thể (9:16) và để phần trên, dưới là viền cửa đơn giản, mình sẽ nối thêm.
- **Vùng bị che** (trên ảnh 1170 × 2532): **345 px trên cùng** nằm dưới thanh HUD, **315 px dưới cùng** nằm dưới thanh booster.
- **Vùng seal (giữa cửa) phải "yên":** phẳng, ít chi tiết, tương phản thấp, tông trung bình đến tối, để dây và bóng nhiều màu nổi rõ. (Hiện game đổi mặt cửa sang màu nền của theme, chỉ giữ vân của ảnh.)
- **Nền:** công cụ tạo ảnh thường không ra được nền trong suốt, nên các ảnh ánh sáng xin **nền đen tuyệt đối** (mình dùng chế độ cộng sáng, phần đen tự biến mất), còn `orb.png` xin **nền xanh lá thuần #00FF00** (mình tách nền).
- **Không có chữ, logo, watermark**; không vẽ bóng, dây hay hình level lên cửa.
- **Cùng phong cách:** dán đoạn *Style* dưới đây vào đầu mỗi prompt (đổi nếu bạn muốn phong cách khác).

## Prompts

### Style (dán vào đầu mỗi prompt)

```text
Style: polished mobile casual puzzle game art, stylized fantasy, hand-painted look with clean readable shapes, soft global light from the top left, rich materials but low visual noise, cohesive palette of deep slate blue, muted violet and antique gold accents.
```

### 1. `door.png` (bắt buộc): cánh cửa đóng

```text
[Style]
A closed ancient enchanted double door, seen perfectly straight-on in orthographic front view, filling the entire portrait frame edge to edge, with no walls, floor, ceiling or sky visible around it.
The door is split into two equal leaves by a single thin, perfectly straight, perfectly vertical seam running from the very top to the very bottom exactly through the horizontal centre of the image. The seam is a crisp dark hairline with a faint warm glow, nothing crosses it: no handles, no lock, no bar, no emblem, no ornament overlapping the centre line.
The two leaves are mirror-symmetrical.
Ornamentation only on the outer zones: an ornate frame of carved arcane runes, antique gold filigree and small rivets along the left and right outer edges; a decorative arch band across the top 15 percent of the image and a heavy decorated base band across the bottom 12 percent.
The large central area of both leaves (from about 15 percent to 88 percent of the height, and from 8 percent to 92 percent of the width) is a calm, smooth, flat panel of dark slate-blue enchanted stone with a very subtle fine grain, even matte surface, low contrast, no engravings, no cracks, no patterns, no symbols, so that coloured objects placed on it later remain clearly readable.
Even, soft lighting across the whole door, no strong shadows, no vignette in the centre, no light rays.
Portrait aspect ratio 6:13, 1170 x 2532 pixels, high resolution, sharp.
Negative: text, letters, logo, watermark, people, perspective, tilted view, doorknob, keyhole, chains, padlock, central emblem, circles in the centre, busy patterns in the middle, cracks, light beams.
```

### 2. `backdrop.png` (bắt buộc): phía sau cửa

```text
[Style]
The view behind a magic door that has just opened: a radiant enchanted treasure sanctum, seen straight-on, filling the entire portrait frame.
The brightest point is in the exact centre of the image: an intense warm white-gold glow, as if a portal of pure light, with soft god rays radiating outwards.
Towards the edges the scene fades into deep violet and slate-blue shadows with faint silhouettes of magical shelves, arches and floating glowing particles and sparkles; all detail stays soft and slightly blurred so it reads as background.
The upper and lower thirds should be calm and dimmer, because white text and buttons will be placed over them.
Portrait aspect ratio 6:13, 1170 x 2532 pixels, high resolution.
Negative: text, letters, logo, watermark, people, characters, creatures, doors, hard edges in the centre, overexposed full-white frame.
```

### 3. `light-ray.png` (nên có): tia sáng lọt qua khe

```text
A single tall vertical beam of magical light leaking through a narrow crack, isolated on a pure solid black background (#000000).
The beam runs the full height of the image, centred horizontally: an extremely thin, intensely bright white core with a warm gold tint, surrounded by a soft glow that fades smoothly to black within about a third of the image width on each side.
A few very fine, faint horizontal light streaks and tiny glittering specks escape sideways from the core at random heights.
Nothing else in the image: no door, no walls, no texture, no noise in the black.
Tall narrow image, 256 x 2532 pixels (or any tall portrait size with the beam centred).
Negative: text, watermark, background texture, gradient in the black area, coloured background, frame.
```

### 4. `light-burst.png` (nên có): luồng sáng khi cửa mở

```text
A radial burst of magical god rays exploding from the exact centre of the image, isolated on a pure solid black background (#000000).
Bright white-gold core, around 30 long tapering rays of varying length and width spreading in all directions, a soft circular bloom around the centre, a few tiny sparkles along the rays; the rays fade completely to black before reaching the image edges.
Perfectly centred, square, 1024 x 1024 pixels.
Negative: text, watermark, any objects, background texture, coloured background, hard edges, rays cut off by the image border.
```

### 5. `sparkle.png` (nên có): hạt lấp lánh

```text
A single magical sparkle for a game particle effect, isolated on a pure solid black background (#000000).
A pure white four-pointed star with long thin pointed rays (vertical and horizontal rays longer than the diagonals), a small bright round core, and a soft round white glow around the core.
Completely white and neutral, no colour tint.
Centred, small margin around it, nothing touching the edges, square, 128 x 128 pixels (or larger square).
Negative: text, watermark, colour, multiple stars, background texture.
```

### 6. `orb.png` (tùy chọn, chỉ khi muốn đổi bóng): quả cầu phép

```text
[Style]
A single glossy magical glass orb, game sprite, isolated on a pure flat chroma-key green background (#00FF00).
The orb is neutral medium grey (no colour tint, so it can be recoloured in code), perfectly round, seen straight-on, with a soft inner glow in the centre, a darker rim around its edge, a large soft highlight and a small sharp white specular spot at the top left, and a faint bounce light at the bottom right.
No shadow on the background, no reflection of the background colour on the orb.
Centred, filling about 85 percent of the image, square, 256 x 256 pixels (or larger square).
Negative: text, watermark, colour tint, green reflections, drop shadow, base, stand, multiple orbs.
```

## Không cần ảnh

Map sáng lúc phá seal (vẽ bằng code theo dây của level), bóng (khi không có `orb.png`), chuyển động cửa, rung khi cửa sập, thời điểm và độ mạnh của ánh sáng, giọt nước và tia nổ, màn Well Done.

## Gửi ảnh

1. Bỏ ảnh gốc vào `art/magic/`, đặt đúng tên file như trên (ghi đè để thay ảnh).
2. Chạy `npm run art:magic`: tạo bản cỡ game trong `src/assets/magic/` (cửa và nền 780 × 1688, ảnh ánh sáng thành JPEG, `orb.png` thu về 256 × 256). Game chỉ đọc thư mục này, nên phải chạy lại lệnh này mỗi khi đổi ảnh gốc.
3. Tải lại trang dev (`?mode=magic`). Ảnh nào chưa có thì game dùng ảnh tạm vẽ bằng code (riêng `orb`: không có thì bóng như bản thường).

Game tự xử lý thêm khi tải:
- `door.png`: chỉ lấy mặt phẳng bên trong khung vàng (x 58–722 trên ảnh 780 px), che khe vẽ sẵn ở giữa (khe chỉ hiện khi cửa sắp mở), rồi đổi sang màu nền của theme, chỉ giữ vân của ảnh. `door-light.png` (tùy chọn) thay `door.png` làm vân cho theme sáng.
- `orb.png`: tách nền xanh, rồi tô từng màu của bảng màu (xám trung bình thành màu đó, xám tối thành tối hơn, xám sáng thành trắng).
- `backdrop.png`: vừa khít màn hình game (cả ảnh, không cắt).
