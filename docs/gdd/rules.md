# 3. Rules & mechanics

## 3.1 Thành phần trên board <Badge type="tip" text="Live" />

| Thành phần | Mô tả |
|---|---|
| **Hạt** | Hình tròn, có màu. Mỗi hạt thuộc đúng một cặp. |
| **Cặp** | 2 hạt cùng màu, nối nhau bằng một sợi dây cùng màu. |
| **Dây** | Đường nối 2 hạt của một cặp. Có thể thẳng hoặc cong/gấp khúc (theo clip). Dây của các cặp khác nhau có thể cắt chéo nhau. |
| **Kích thước hạt** | Hạt có thể to hoặc nhỏ hơn bình thường. 2 hạt trong cùng một cặp có thể khác kích thước. Kích thước không theo mức cố định mà chỉnh tự do cho từng hạt, tùy tình huống của level. |

## 3.2 Tap và di chuyển <Badge type="tip" text="Live" />

- Người chơi tap vào một hạt bất kỳ; hạt đó là **hạt di chuyển**, hạt còn lại của cặp là **hạt đích**.
- Hạt di chuyển chạy **dọc theo sợi dây** về phía hạt đích; dây ngắn dần sau lưng nó.
- Khi một hạt đang chạy, **không tap được hạt còn lại của cặp đó**.
- Khi một hạt đang chạy, người chơi **vẫn tap được hạt của các cặp khác**; nhiều hạt có thể chạy cùng lúc.
- Tốc độ di chuyển: **1100 px thế giới / giây** khi chạy tới, **1500 px/giây** khi bị chặn và quay về (`MOVE_SPEED`, `RETURN_SPEED` trong `src/scenes/Game.ts`). Lấy theo cảm giác của clip tham khảo; chỉnh lại khi chơi thử.
- **Zoom:** người chơi chụm 2 ngón tay để thu nhỏ và kéo 2 ngón ra để phóng to board, tối đa 3 lần. Khi đang phóng to, người chơi kéo (pan) được board. Zoom chỉ áp dụng cho board, HUD giữ nguyên kích thước.

## 3.3 Va chạm <Badge type="tip" text="Live" />

- Nếu trên đường đi, hạt di chuyển **đụng hạt của một cặp khác** → lượt đó bị hủy, hạt di chuyển quay về vị trí ban đầu, không có cặp nào biến mất, và người chơi **mất 1 tim**.
- Chỉ va chạm với **hạt** mới tính; dây của các cặp khác không chặn đường (dây cắt chéo nhau thoải mái).
- **Cặp có đường thông (sẽ chạm được nhau):** chỉ trong lúc một hạt của cặp đang chạy, **cả 2 hạt của cặp đó đều không có hitbox**. Hạt của cặp khác đang chạy có thể đi xuyên qua chúng mà không bị tính là va chạm. Khi đứng yên, hạt có hitbox bình thường.
- **Cặp bị chặn:** trong lúc hạt của nó đang chạy (trước khi đụng), 2 hạt của cặp đó **vẫn có hitbox** với hạt của các cặp khác.

## 3.4 Cặp biến mất <Badge type="tip" text="Live" />

- Khi hạt di chuyển chạm vào hạt đích → cả 2 hạt vỡ ra, có effect văng màu tại chỗ chạm, rồi biến mất.
- **Sợi dây ở lại** trên board, đổi sang màu Completed `#6977C2`. Khi dọn xong mọi cặp, các dây đã hoàn thành ghép lại thành hình vẽ của level.
- **Hạt càng to, effect vỡ càng to.**

## 3.5 Thắng và thua <Badge type="tip" text="Live" />

- **Thắng:** mọi cặp trên board đã biến mất → confetti; hình vẽ của level hiện ra từ các dây màu Completed (theo clip).
- **Thua:** mỗi lần va chạm mất 1 tim, mỗi level có 3 tim. Hết tim = thua màn. Màn thắng "Well Done!" (confetti, nút CONTINUE) và màn thua "Out of Hearts!" (nút RETRY) vẽ trong Phaser theo phong cách của skill `prototype-ui` (font Lilita One, tiêu đề gradient).

## 3.6 HUD và nút (theo clip) <Badge type="tip" text="Live" />

| Vị trí | Thành phần |
|---|---|
| Trên cùng, bên trái | Nút Pause |
| Trên cùng, ở giữa | 3 trái tim (mạng) |
| Trên cùng, bên phải | Nút Hint (gợi ý), có nhãn AD (xem quảng cáo để dùng). Khi bấm: chọn ngẫu nhiên một hạt đang tap được (có đường thông), camera zoom vào hạt đó tới 1.5 lần so với bình thường, rồi hạt chạy nhấp nhả một đoạn ngắn dọc theo dây để thu hút sự chú ý của người chơi. |
| Dưới HUD | Thanh tiến độ: % cặp đã dọn trong level |

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
| grey | `#888888` | `#CFC9BC` | `#E4E0D9` |
| dark_green | `#008D7F` | `#00D2BD` | `#00F3D7` |
| red | `#FA3E3E` | `#FA692B` | `#FB904D` |
| gold | `#D3BB7F` | `#FFEC83` | `#FFF7AF` |
| white | `#D6E6E9` | `#FFFFFF` | `#FFFFFF` |
| black | `#494E68` | `#5C658F` | `#7B83AA` |

Dây đã hoàn thành (Completed): `#6977C2`.

## 3.8 Level <Badge type="tip" text="Live" />

- Mỗi level là một hình vẽ ghép từ các cặp hạt và dây (ví dụ cái micro trong clip).
- **10 level mở đầu** (hình vẽ gốc của Dot Line): Ripples (hướng dẫn bấm), Flag (hướng dẫn va chạm), Kite (hướng dẫn pinch zoom), House, Fish, Sailboat, Umbrella, Rocket, Tree, Castle. Level 1–2 làm tay; level 3–10 tạo bằng generator v2 từ hình vẽ trong `tools/intro-levels.ts` (`npm run levels:intro`).
- **Hướng dẫn:** level có trường `tutorial` hiện bàn tay chỉ vào hạt và dòng chữ (Tap a dot to send it home / Bumping costs a heart / Pinch to zoom); biến mất sau lần bấm hoặc zoom đầu tiên.
- **Nhãn "Hard"** hiện trên tim khi độ khó của level từ 4 trở lên.
- Số cặp mỗi level, số màu, cách tăng độ khó qua các level: _TBD_.
- Điều kiện để level giải được: luôn tồn tại một thứ tự gỡ dọn sạch được board. Cách kiểm tra (bằng tay hay bằng công cụ): _TBD_.
