# 3. Rules & mechanics

## 3.1 Thành phần trên board <Badge type="tip" text="Live" />

| Thành phần | Mô tả |
|---|---|
| **Hạt** | Hình tròn, có màu. Mỗi hạt thuộc đúng một cặp. |
| **Cặp** | 2 hạt cùng màu, nối nhau bằng một sợi dây cùng màu. |
| **Dây** | Đường nối 2 hạt của một cặp. Có thể thẳng hoặc cong/gấp khúc (theo clip). Dây của các cặp khác nhau có thể cắt chéo nhau. |
| **Kích thước hạt** | Trong một level, **hầu hết hạt có cùng một cỡ** (cỡ hạt thường của level, chọn theo kích cỡ hình). Ngoại lệ là **bóng bự**: hạt to hơn hẳn, đặt ở chi tiết tròn kín của hình (mắt, mũi, nút áo). 2 hạt trong cùng một cặp có thể khác kích thước (bóng bự nối với hạt thường, hoặc hai bóng bự thành một cặp). |

## 3.2 Tap và di chuyển <Badge type="tip" text="Live" />

- Người chơi tap vào một hạt bất kỳ; hạt đó là **hạt di chuyển**, hạt còn lại của cặp là **hạt đích**.
- Hạt di chuyển chạy **dọc theo sợi dây** về phía hạt đích; dây ngắn dần sau lưng nó.
- Khi một hạt đang chạy, **không tap được hạt còn lại của cặp đó**.
- Khi một hạt đang chạy, người chơi **vẫn tap được hạt của các cặp khác**; nhiều hạt có thể chạy cùng lúc.
- Tốc độ di chuyển: chấm **khởi đầu ở 500 px thế giới / giây** và **tăng đều lên 750 px/giây sau 1 giây**, rồi giữ nguyên gia tốc đó (250 px/s²) cho tới hết quãng đường còn lại (`START_SPEED`, `MOVE_SPEED` trong `src/game/tuning.ts`). Khi bị chặn và quay về: **1020 px/giây** (= 1,36 × `MOVE_SPEED`). Chỉnh `MOVE_SPEED` bằng thanh cheat ⚙ speed trong game; bấm Confirm khi chạy local để ghi vào code. Lấy theo cảm giác của clip tham khảo; chỉnh lại khi chơi thử.
- **Zoom:** người chơi chụm 2 ngón tay để thu nhỏ và kéo 2 ngón ra để phóng to board, tối đa 3 lần. Khi đang phóng to, người chơi kéo (pan) được board. Zoom chỉ áp dụng cho board, HUD giữ nguyên kích thước.

## 3.3 Va chạm <Badge type="tip" text="Live" />

- Nếu trên đường đi, hạt di chuyển **đụng hạt của một cặp khác** → lượt đó bị hủy, hạt di chuyển quay về vị trí ban đầu, không có cặp nào biến mất, và người chơi **mất 1 tim**. Màn hình không rung; phản hồi va chạm là biến dạng đàn hồi của 2 hạt (3.3b).
- Chỉ va chạm với **hạt** mới tính; dây của các cặp khác không chặn đường (dây cắt chéo nhau thoải mái).
- **Hitbox:** hai hạt va chạm khi khoảng cách tâm nhỏ hơn **85%** tổng hai bán kính (`HIT_SCALE` trong `src/core/solver.ts`). Hai hạt chỉ chạm mép (ví dụ hai hạt nằm sát nhau ở chỗ cắt) không tính là va chạm.
- **Cặp có đường thông (sẽ chạm được nhau):** chỉ trong lúc một hạt của cặp đang chạy, **cả 2 hạt của cặp đó đều không có hitbox**. Hạt của cặp khác đang chạy có thể đi xuyên qua chúng mà không bị tính là va chạm. Khi đứng yên, hạt có hitbox bình thường.
- **Cặp bị chặn:** trong lúc hạt của nó đang chạy (trước khi đụng), 2 hạt của cặp đó **vẫn có hitbox** với hạt của các cặp khác.
- **Bóng sọc (cặp đã va chạm):** khi một hạt đang chạy đụng hạt khác, cặp của hạt đang chạy bị **đánh dấu**: cả 2 hạt chuyển sang có **sọc trắng chéo**. Hạt có sọc đụng hạt khác thì **không mất tim** nữa. Hạt khác (chưa có sọc) đụng vào hạt có sọc thì vẫn mất tim như thường, và cặp của hạt vừa đụng bị đánh dấu. Đánh dấu giữ đến hết level (chơi lại thì xóa).

## 3.3b Cảm giác vật lý của bóng <Badge type="tip" text="Live" />

- **Khi chạy:** bóng bị kéo dài nhẹ theo hướng di chuyển (dài 116%, dẹt 88%) và để lại **vệt trail** mờ dần (9 vị trí gần nhất).
- **Hình dáng bóng:** bóng bóng loáng (glossy) với ánh sáng từ góc trên bên trái: viền tối, thân sáng dần về phía nguồn sáng, đốm phản quang trắng, ánh phản xạ nhẹ ở đáy; mỗi bóng có **bóng đổ** mềm lệch xuống dưới bên phải (bóng đổ đi theo bóng khi bóng méo).
- **Khi va chạm:** cả bóng đang chạy và bóng bị đụng **biến dạng đàn hồi** (co giãn dao động tắt dần trong khoảng 0,7 giây, theo hướng va chạm).

## 3.3c Giao diện sáng / tối <Badge type="tip" text="Live" />

Bật trong **Settings** (nút Pause ở góc trên trái mở Settings, game tạm dừng; nút **THEME: LIGHT/DARK**, ghi nhớ trong trình duyệt, mặc định sáng).

| | Sáng | Tối |
|---|---|---|
| Nền | `#fbfaf3` (kem) | `#171a24` (xanh đen) |
| Bóng đổ của bóng | nâu nhạt, mờ | đen, đậm hơn |
| Thanh tiến độ (nền) | `#e5e2da` | `#2c3142` |
| Chữ hướng dẫn | nâu `#8a5a2b` | cam nhạt `#f3c98b` |
| Màu "black" của bảng màu | `#494E68` | sáng hơn `#7B83AA` để không chìm vào nền |

## 3.4 Cặp biến mất <Badge type="tip" text="Live" />

- Khi hạt di chuyển chạm vào hạt đích → cả 2 hạt vỡ ra, có effect văng màu tại chỗ chạm, rồi biến mất.
- **Sợi dây cũng biến mất hoàn toàn** khỏi board. Chỉ khi dọn xong mọi cặp, tất cả các dây mới hiện lại (mờ dần trong khoảng 0,7 giây) bằng màu Completed `#6977C2`, ghép thành hình vẽ của level, rồi màn thắng mới hiện.
- **Hạt càng to, effect vỡ càng to.**

## 3.5 Thắng và thua <Badge type="tip" text="Live" />

- **Thắng:** mọi cặp trên board đã biến mất → hình vẽ của level hiện lại từ tất cả các dây (màu Completed), rồi confetti và màn "Well Done!".
- **Cảnh kết thúc:** khi chỉ còn 1 dây và bóng cuối đang chạy, lúc bóng sắp chạm bóng đích (còn khoảng 0,4 giây đường đi, hoặc 6 bán kính bóng) game chuyển **slow motion** (tốc độ 0,2) và camera **zoom 2,2 lần** vào điểm va chạm, đưa điểm đó ra giữa màn hình. Khi bóng nổ thì màn "Well Done!" bung ra ngay; phía sau, camera lùi về toàn cảnh trong lúc hình vẽ hiện lại.
- **Kéo màn:** kéo được ở mọi mức zoom, kể cả nhỏ nhất.
- **Thua:** mỗi lần va chạm mất 1 tim, mỗi level có 3 tim. Hết tim = thua màn. Màn thắng "Well Done!" (confetti, nút CONTINUE) và màn thua "Out of Hearts!" (nút RETRY) vẽ trong Phaser theo phong cách của skill `prototype-ui` (font Lilita One, tiêu đề gradient).

## 3.6 HUD và nút (theo clip) <Badge type="tip" text="Live" />

| Vị trí | Thành phần |
|---|---|
| Trên cùng, bên trái | Nút Pause: mở Settings (tạm dừng game, chọn giao diện sáng/tối, RESUME) |
| Trên cùng, ở giữa | 3 trái tim (mạng) |
| Dưới HUD | Thanh tiến độ: % cặp đã dọn trong level |
| Panel dưới cùng | Dải booster, cùng màu nền với board và nằm đè lên vùng chơi (board trượt xuống dưới nó khi zoom/kéo), góc trên bo tròn, bóng đổ nhẹ. Dải trên cùng (HUD) cũng có nền như vậy. Chạm vào 2 dải này không tính là chạm vào board. |
| Booster Hint | Nút bóng đèn, nhãn AD (xem quảng cáo để dùng). Khi bấm: chọn ngẫu nhiên một hạt đang tap được (có đường thông), camera zoom vào hạt đó tới 1.5 lần so với bình thường, rồi hạt chạy nhấp nhả một đoạn ngắn dọc theo dây để thu hút sự chú ý của người chơi. |
| Booster Cut (cây kéo) | Nút cây kéo, nhãn AD. Bấm để cầm kéo (nút sáng viền vàng và nhấp nháy, dòng "Tap a line to cut it" hiện phía trên panel); chạm vào một dây hoặc hạt của cặp đang đứng yên thì cặp đó bị cắt: nổ ở chỗ cắt và ở 2 hạt, cặp biến mất và tính là đã dọn. Chạm trượt thì vẫn cầm kéo; bấm lại nút để bỏ. Cắt cặp cuối cùng thì thắng màn như thường. |

## 3.7 Bảng màu <Badge type="tip" text="Live" />

Nguồn: tài liệu DotPaint Concept. Mỗi màu có 3 sắc: **Base** (màu hạt và dây), **Gradient** và **Inner Light** (vẽ bóng của hạt).

| Tên | Base | Gradient | Inner Light |
|---|---|---|---|
| crimson | `#DA0561` | `#FF3B3B` | `#FF6738` |
| blue | `#484EF6` | `#4F93FF` | `#56B0FF` |
| magenta | `#E221CA` | `#FF77A7` | `#FF9CCE` |
| light_blue | `#43C0FF` | `#8CFFF2` | `#EEF7FF` |
| green | `#6BD234` | `#E2F016` | `#CCFFE6` |
| yellow | `#FFC430` | `#E2F016` | `#F9F3A1` |
| purple | `#9F54FA` | `#FB82EF` | `#FCA7F5` |
| orange | `#FF772D` | `#FFA754` | `#FFC079` |
| pink | `#FF80C4` | `#FFACAC` | `#FFC0C0` |
| brown | `#AC6F6D` | `#E67775` | `#FF8C8A` |
| dark_green | `#008D7F` | `#00D2BD` | `#00F3D7` |
| red | `#FA3E3E` | `#FA692B` | `#FB904D` |
| gold | `#D3BB7F` | `#FFEC83` | `#FFF7AF` |
| black | `#494E68` | `#5C658F` | `#7B83AA` |

Dây đã hoàn thành (Completed): `#6977C2`.

**Không dùng nữa:** grey (`#888888`) và white (`#D6E6E9`), vì bị chìm vào nền. Level cũ còn 2 màu này được đổi sang một màu khác khi mở (màu không trùng với dây nào ở gần).

## 3.8 Level <Badge type="tip" text="Live" />

- Mỗi level là một hình vẽ ghép từ các cặp hạt và dây (ví dụ cái micro trong clip).
- **Hệ thống 100 level** (bộ "Main", game chơi bộ này trước): xem [Level system](../guide/level-system) và `design/level-system.xlsx`.
- **10 level mở đầu cũ** (bộ "Intro", chơi sau level 100): Ripples (hướng dẫn bấm), Flag (hướng dẫn va chạm), Kite (hướng dẫn pinch zoom), House, Fish, Sailboat, Umbrella, Rocket, Tree, Castle. Level 1–2 làm tay; level 3–10 tạo bằng generator v2 từ hình vẽ trong `tools/intro-levels.ts`. File level nằm trong `levels/`, thứ tự chơi là bộ "Intro" trong `collections.json`.
- **Hướng dẫn:** level có trường `tutorial` hiện bàn tay chỉ vào hạt và dòng chữ (Tap a dot to send it home / Bumping costs a heart / Pinch to zoom); biến mất sau lần bấm hoặc zoom đầu tiên.
- **Nhãn "Hard"** hiện trên tim ở các level vị trí khó của hệ thống level (`category: "hard"`); level không thuộc hệ thống thì hiện khi độ khó từ 4 trở lên.
- Số cặp mỗi level, số màu, cách tăng độ khó qua các level: _TBD_.
- Điều kiện để level giải được: luôn tồn tại một thứ tự gỡ dọn sạch được board. Cách kiểm tra (bằng tay hay bằng công cụ): _TBD_.
