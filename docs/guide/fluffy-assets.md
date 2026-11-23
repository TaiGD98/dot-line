# Fluffy theme: asset requests

Bản game phụ mới, **Fluffy** (sẽ ở `/fluffy/`, nút **Play Fluffy** ở trang chủ). Cùng level và luật chơi như bản thường; khác ở nhân vật và nền:

- Mỗi hạt là **một cục bông lông có mặt**, phong cách 3D cartoon, vui nhộn, dễ thương.
- Nền là **pattern các khuôn mặt cục lông**, xếp chéo và **cuộn chậm theo đường chéo** (từ trên trái xuống dưới phải).
- Pinch zoom thì **nền zoom theo board**, nên ảnh nền phải đủ nét ở mức zoom lớn nhất (3 lần).

## Hành vi (code làm, ảnh chỉ cần đúng quy cách)

| Lúc | Mặt | Chuyển động / hiệu ứng |
|---|---|---|
| Đứng yên (idle) | Nhắm mắt ngủ | **Thở**: phồng xẹp nhè nhẹ, nhấp nhô lên xuống, mỗi cục lệch nhịp nhau |
| Đang chạy trên dây | Mắt mở to, ngạc nhiên | Kéo dãn theo hướng chạy, lông hơi rung |
| Va chạm với bóng khác | Mắt `> <` | Bẹp lại rồi nảy; **lông bay ra** (vài túm lông màu của cục đó) ở cả hai cục |
| Đứng yên, cặp đã từng va chạm | Thức, mở mắt (thay cho sọc trắng; chỉ bật khi đã có ảnh, chưa có thì vẫn ngủ và có sọc) | Vẫn thở như lúc ngủ |
| Về tới bóng cùng cặp | Mắt `^ ^` vui vẻ | Ôm nhau một nhịp rồi biến mất, **bay ra các trái tim nhỏ** |

Mặt được đổi bằng cách chồng **ảnh mặt** lên **ảnh thân**, nên thân và mặt là các file riêng. Thân được tô màu bằng code cho đủ 28 màu của bảng màu, giống bóng orb của bản Magic. Code tự làm cả co giãn, nhịp thở, mặt đổi theo trạng thái, hạt bay và nền cuộn.

## Quy cách chung

- **Định dạng:** PNG, sRGB. Cỡ ghi ở từng ảnh; ra cỡ to hơn cùng tỉ lệ cũng được, mình sẽ thu nhỏ.
- **Nền trong suốt:** thân, mặt và hạt cần nền trong suốt thật. Nếu công cụ có tùy chọn *transparent background* thì dùng. Nếu không, xin **nền trắng tuyệt đối #FFFFFF** cho thân (lông trắng tách khỏi nền trắng khó, nên tránh dùng nền xanh vì lông sẽ ám màu xanh ở mép) và **nền xanh lá thuần #00FF00** cho mặt và hạt.
- **Đọc được khi nhỏ:** hạt trên màn hình chỉ cao khoảng 25–40 px (khi zoom tối đa khoảng 100 px). Mắt phải **to, đơn giản, đậm nét**: không lông mi, không chi tiết nhỏ.
- **Thân tròn:** viền ngoài của cục lông phải gần tròn (va chạm tính theo hình tròn). Lông xù ra ngoài vòng tròn chính không quá 10% bán kính.
- **Cùng phong cách:** dán đoạn *Style* vào đầu các prompt thân và mặt.
- **Không có chữ, logo, watermark.**

## Prompts

### Style (dán vào đầu prompt 1–5)

```text
Style: cute 3D cartoon render, soft and squishy, plush toy look, smooth soft lighting from the top left, gentle ambient occlusion, funny and adorable, clean simple shapes that read at a very small size, high resolution.
```

### 1. `ball.png` (bắt buộc): thân cục lông

```text
[Style]
A single round fluffy pom-pom creature body, perfectly round silhouette, seen straight-on, made of soft dense short fur with a few small tufts sticking out evenly all around the edge (no long strands), no face, no eyes, no mouth, no arms, no legs.
The fur is neutral light grey (no colour tint at all, it will be recoloured in code), slightly lighter at the top left where the light hits and slightly darker at the bottom right, with a soft white highlight on the top left.
Centred, the round body filling about 80 percent of the image width, the fur tufts staying inside the image.
Isolated on a transparent background (if transparency is not available: a pure flat white background #FFFFFF), no shadow on the ground, no reflections.
Square, 512 x 512 pixels.
Negative: face, eyes, mouth, text, watermark, colour tint, long hair, strands crossing the edge of the image, ground shadow, multiple objects.
```

### 2–5. Bốn khuôn mặt (bắt buộc): `face-sleep.png`, `face-surprised.png`, `face-ouch.png`, `face-happy.png`

Mỗi mặt là **một ảnh riêng, chỉ có mắt, miệng và má hồng**, không có thân. Bốn ảnh phải **cùng cỡ, cùng vị trí và cùng tỉ lệ**: mặt nằm giữa ảnh, hơi lệch lên trên, rộng khoảng 55% chiều rộng ảnh, để đặt chồng đúng lên `ball.png`. Mẹo: tạo một mặt trước, rồi dùng ảnh đó làm tham chiếu (image reference) cho ba mặt còn lại.

Đoạn chung cho cả bốn prompt:

```text
[Style]
Only a cartoon face to be placed on top of a round fluffy ball: two big simple eyes, a tiny mouth and two soft pink blush ovals on the cheeks. No body, no fur, no outline of a head.
The face is centred horizontally and slightly above the centre of the image, about 55 percent of the image width.
Eyes and mouth are glossy dark brown-black with a small white highlight, bold and simple so they read when the whole ball is only 30 pixels tall.
Isolated on a transparent background (if transparency is not available: a pure flat chroma-key green background #00FF00, with nothing green in the face).
Square, 512 x 512 pixels.
Negative: body, fur, head outline, eyebrows, eyelashes, nose, teeth, text, watermark, extra details.
```

Rồi thêm một dòng tùy theo mặt:

| File | Thêm vào prompt |
|---|---|
| `face-sleep.png` | `Expression: peacefully asleep, both eyes closed as gentle downward curved lines, a small relaxed smile, cheeks a little pinker.` |
| `face-surprised.png` | `Expression: surprised and excited, both eyes wide open and round with big white highlights, a small open round "o" mouth.` |
| `face-ouch.png` | `Expression: bumped and squished, both eyes shut tight drawn as ">" and "<" shapes, a small wavy worried mouth.` |
| `face-happy.png` | `Expression: overjoyed, both eyes drawn as happy upside-down U arcs "^ ^", a wide open happy smile, cheeks extra pink.` |

### 6. `fur.png` (nên có): túm lông bay ra khi va chạm

```text
A single small soft tuft of fluffy fur, slightly curved, wispy at the ends, neutral white to light grey (no colour tint, it will be recoloured in code), soft 3D cartoon render.
Isolated on a transparent background (if transparency is not available: a pure flat chroma-key green background #00FF00).
Centred, filling about 70 percent of the image, square, 128 x 128 pixels.
Negative: text, watermark, colour tint, multiple tufts, shadow.
```

### 7. `heart.png` (nên có): trái tim nhỏ khi về với cặp

```text
A single small cute puffy 3D cartoon heart, soft and glossy, bright pink-red with a white highlight at the top left, a thin slightly darker outline.
Isolated on a transparent background (if transparency is not available: a pure flat chroma-key green background #00FF00, with no green in the heart).
Centred, filling about 75 percent of the image, square, 128 x 128 pixels.
Negative: text, watermark, face, multiple hearts, shadow, sparkles.
```

### 8. `pattern-light.png` và `pattern-dark.png` (bắt buộc): nền pattern cuộn chéo

Nền được lặp lại (tile) và cuộn liên tục, nên ảnh **phải nối liền mép** (mép trái khớp mép phải, mép trên khớp mép dưới). Midjourney: thêm `--tile`. Công cụ khác: chọn chế độ *seamless / tileable pattern*. Hai ảnh: một cho theme sáng (nền kem `#F2EEE6`), một cho theme tối (nền xanh đậm `#1F2335`).

- **Cỡ: 2048 × 2048.** Mỗi ô lặp phủ khoảng 512 px của board, nên khi zoom gấp 3 vẫn còn nét.
- **Độ tương phản thấp:** các mặt trong pattern chỉ đậm hoặc nhạt hơn nền một chút, để dây và cục lông trên board luôn nổi rõ.
- **Xếp chéo:** các mặt xếp theo hàng chéo, cách đều, khoảng 4 × 4 mặt trên một ô, khoảng trống giữa các mặt rộng hơn chính các mặt.
- Phong cách **phẳng, đơn giản** (không 3D) để nền không tranh chú ý với các cục lông 3D.

```text
Seamless repeating pattern tile, perfectly tileable on all four edges.
Simple flat cartoon icons of cute round fluffy ball faces with different expressions: sleeping with closed curved eyes, surprised with wide round eyes, squished with "> <" eyes, overjoyed with "^ ^" eyes and a big smile.
About 16 faces in the tile, arranged in evenly spaced diagonal rows running from the top left to the bottom right, every face the same size, generous empty space between them, each face slightly rotated for a playful feel.
Two-tone, very low contrast: the background is a solid warm cream colour #F2EEE6 and the faces are drawn in a slightly darker beige #E3DCCD with soft rounded shapes, no outlines darker than that.
Flat 2D, no shading, no gradients, no texture noise, no text.
Square, 2048 x 2048 pixels.
Negative: 3D, realistic, high contrast, black lines, bright colours, text, watermark, borders, frames, seams.
```

Theme tối: dùng prompt trên, thay dòng *Two-tone* bằng:

```text
Two-tone, very low contrast: the background is a solid deep navy blue #1F2335 and the faces are drawn in a slightly lighter navy #2A3049 with soft rounded shapes, no outlines lighter than that.
```

### 9. `awake-hand.png` (bắt buộc): mặt "thức" và bàn tay tutorial, **hai ảnh trong một lần gen**

Một ảnh ngang chia đôi: **nửa trái là mặt thức**, **nửa phải là bàn tay tutorial**. Lệnh `npm run art:fluffy` tự cắt hai nửa (mặt thành `face-awake.png` cùng tỉ lệ với các mặt khác, bàn tay thành `hand.png`). Muốn gen riêng từng ảnh thì đặt tên `face-awake.png` và `hand.png`, lệnh dùng hai file đó thay cho nửa tương ứng.

- **Mặt thức:** cục lông đã bị va chạm thì không ngủ nữa mà **thức, mở mắt**, thay cho sọc trắng của bản thường. Mắt mở bình thường, bình tĩnh (nhỏ hơn mắt ngạc nhiên), miệng cười nhẹ. Cùng phong cách, cùng nét, cùng cỡ với các mặt trong `face.png` (dùng `face.png` làm ảnh tham chiếu).
- Hai thứ này **không có ảnh tạm**: chưa có ảnh thì game giữ như cũ (cặp đã va chạm vẫn ngủ và có sọc trắng, tutorial vẫn dùng 👆). Có ảnh và chạy `npm run art:fluffy` là game tự đổi.
- **Bàn tay tutorial:** thay bàn tay emoji 👆 đang chỉ vào cục cần tap. Một **bàn chân / bàn tay lông xù trắng** kiểu cục lông, **một ngón chỉ thẳng lên trên**, đầu ngón ở trên cùng của hình (game tự tìm đầu ngón để đặt đúng vào cục). Có đệm thịt hồng là đẹp. Viền nâu đậm nhẹ để nổi trên cả nền sáng lẫn nền tối.
- Hai hình **không chạm vạch giữa**, mỗi hình nằm gọn trong nửa của nó, khoảng trống rộng ở giữa.

```text
Style: cute 3D cartoon render, soft and squishy, plush toy look, smooth soft lighting from the top left, gentle ambient occlusion, funny and adorable, clean simple shapes that read at a very small size, high resolution.
One wide image split into two separate items side by side, with a wide empty gap between them, nothing crossing the middle of the image.
LEFT HALF: only a cartoon face to be placed on top of a round fluffy ball, in exactly the same style as the reference faces: two calm open eyes (simple glossy dark brown-black round eyes with a small white highlight, smaller and calmer than a surprised face), a tiny gentle smile, two soft pink blush ovals on the cheeks. Expression: awake and calm, just woke up, content. No body, no fur, no head outline.
RIGHT HALF: a cute fluffy white plush paw-hand like the fur of a pom-pom creature, with one finger pointing straight up and the other fingers curled, soft pink paw pads, a thin warm dark brown outline so it reads on both light and dark backgrounds. The fingertip is the highest point of the drawing. Seen from the front, no arm or only a short wrist.
Isolated on a transparent background (if transparency is not available: a pure flat chroma-key green background #00FF00, with nothing green in the drawings).
Wide 2:1 image, 2048 x 1024 pixels.
Negative: body, ball, head outline, text, watermark, extra fingers, realistic human hand, nails, shadow on the ground, objects crossing the middle, more than two items.
```

Mẹo: đưa `face.png` vào làm **ảnh tham chiếu** để mặt thức ra cùng nét với ba mặt kia.

## Gợi ý thêm

- **Pattern dạng SVG** (nếu bạn vẽ được, ví dụ trong Figma hoặc Illustrator): một ô SVG với các mặt vẽ bằng nét vector sẽ **nét ở mọi mức zoom** và nhẹ hơn PNG nhiều. Có SVG thì mình dùng SVG thay cho hai file `pattern-*.png`, đổi màu theo theme bằng code.
- Nếu ảnh mặt ra không cùng vị trí giữa bốn file, gửi luôn cho mình: mình sẽ căn lại vị trí và cỡ cho khớp với thân khi xử lý.

## Gửi ảnh

1. Bỏ ảnh gốc vào `art/fluffy/` với đúng tên file như trên.
2. Chạy `npm run art:fluffy` (`tools/fluffy-art.ts`): tạo bản cỡ game trong `src/assets/fluffy/`. Game chỉ đọc thư mục này, nên chạy lại lệnh mỗi khi đổi ảnh gốc. Ảnh nào chưa có thì game dùng ảnh tạm vẽ bằng code (`src/scenes/fluffy.ts`).

Lệnh làm gì với từng ảnh:

- **`ball.png`**: cắt vuông quanh cục lông, thu về 512 × 512. Ánh sáng sẵn có trong ảnh bị làm phẳng hẳn (`MATTE` = 0), chi tiết sợi lông đậm gấp 2 (`DETAIL`). Ảnh ra **không có ánh sáng**: game tự đánh sáng cục lông như một quả cầu mềm (`ballTexture` trong `src/scenes/fluffy.ts`), theo các số `LIGHT_ANGLE`, `LIGHT_HEIGHT`, `LIGHT_AMBIENT`, `LIGHT_DIFFUSE`, `LIGHT_SHEEN` trong `src/game/tuning.ts`. Chỉnh các số này ngay khi chơi bằng nhóm **Ball light** trong cheat ⚙ dev, bấm Confirm khi chạy local để ghi vào code. Game coi thân tròn chiếm 90% khung (lông xù ra ngoài một chút).
- **Mặt:** `face.png` có thể chứa **ba mặt trong một tấm** (ngạc nhiên trên trái, `> <` trên phải, `^ ^` ở dưới): lệnh tự tách. `face-sleep.png` để riêng. Mỗi mặt được cắt quanh nét vẽ, đưa về **cùng một tỉ lệ** (mặt từ ảnh riêng được co cho bằng bề rộng các mặt trong tấm) và đặt giữa khung chung 640 × 360. Có `face-surprised.png` / `face-ouch.png` / `face-happy.png` riêng thì dùng chúng thay cho phần tương ứng trong `face.png`.
- Vị trí mặt trên thân chỉnh trong code (`faceFrame` trong `src/scenes/fluffy.ts`): mặt rộng khoảng 68% đường kính thân, hạ xuống 10% bán kính.
- **`heart.png`**: cắt vuông, 160 × 160. Ảnh màu gì cũng được (đang là tim đỏ): game **tô lại theo màu của cặp** lúc hai cục ôm nhau (độ sáng giữ nguyên, chỗ bóng trắng vẫn trắng).
- **`fur.png`**: cắt vuông, 128 × 128, game tô theo màu cục lông. Nên là lông trắng hoặc xám.
- **`pattern-light.png` / `pattern-dark.png`**: làm **thưa, nhỏ và mờ hơn** rồi lưu JPEG. Lệnh tìm từng mặt trong ô (mảng khác màu nền), thu mặt còn một nửa, giãn khoảng cách ra 2 lần (ô mới 2 lần ô cũ, vẫn nối liền mép, vẫn xếp chéo) và nhạt đi 45% về phía màu nền. Chỉnh ba số `SPREAD`, `SHRINK`, `FADE` ở đầu phần pattern trong `tools/fluffy-art.ts`; đổi `SPREAD` thì đổi cả `patternWorld` trong `src/scenes/fluffy.ts`.

Bộ ảnh hiện tại (đã dùng trong game):

| File | Ghi chú |
|---|---|
| `ball.png` | 1024 × 1024, lông trắng, trong suốt |
| `face.png` | ba mặt surprised / ouch / happy trong một tấm |
| `face-sleep.png` | mặt ngủ, vẽ to hơn các mặt trong `face.png` (lệnh tự co lại) |
| `heart.png`, `fur.png` | trong suốt |
| `pattern-light.png`, `pattern-dark.png` | 1254 × 1254, nối liền mép |

Nếu sau này muốn nền nét hơn khi zoom tối đa: xin pattern 2048 × 2048 (ô gốc phủ 512 px của board, zoom 3 lần cần khoảng 1536 px trở lên).

Quy cách khi đặt ảnh mới:

| File | Mức | Cỡ |
|---|---|---|
| `ball.png` | bắt buộc | 512 × 512 |
| `face-sleep.png`, `face-surprised.png`, `face-ouch.png`, `face-happy.png` | bắt buộc | 512 × 512, cùng vị trí mặt |
| `pattern-light.png`, `pattern-dark.png` | bắt buộc | 2048 × 2048, nối liền mép |
| `fur.png` | nên có | 128 × 128 |
| `heart.png` | nên có | 128 × 128 |
| `awake-hand.png` (hoặc `face-awake.png` + `hand.png`) | bắt buộc | 2048 × 1024, mặt thức bên trái, bàn tay bên phải |
