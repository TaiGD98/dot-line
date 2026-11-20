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
- Tốc độ di chuyển: chấm **khởi đầu ở 500 px thế giới / giây** và **tăng đều lên 750 px/giây sau 1 giây**, rồi giữ nguyên gia tốc đó (250 px/s²) cho tới hết quãng đường còn lại (`START_SPEED`, `MOVE_SPEED` trong `src/game/tuning.ts`). Khi bị chặn và quay về: **1020 px/giây** (= 1,36 × `MOVE_SPEED`). Chỉnh `MOVE_SPEED` bằng thanh cheat ⚙ speed trong game (bản Fluffy: ⚙ tuning); bấm Confirm khi chạy local để ghi vào code. Lấy theo cảm giác của clip tham khảo; chỉnh lại khi chơi thử.
- **Zoom:** người chơi chụm 2 ngón tay để thu nhỏ và kéo 2 ngón ra để phóng to board, tối đa 3 lần. Khi đang phóng to, người chơi kéo (pan) được board. Zoom chỉ áp dụng cho board, HUD giữ nguyên kích thước.

## 3.3 Va chạm <Badge type="tip" text="Live" />

- Nếu trên đường đi, hạt di chuyển **đụng hạt của một cặp khác** → lượt đó bị hủy, hạt di chuyển quay về vị trí ban đầu, không có cặp nào biến mất, và người chơi **mất 1 tim**. Màn hình không rung; phản hồi va chạm là biến dạng đàn hồi của 2 hạt (3.3b).
- Chỉ va chạm với **hạt** mới tính; dây của các cặp khác không chặn đường (dây cắt chéo nhau thoải mái).
- **Hitbox:** hai hạt va chạm khi khoảng cách tâm nhỏ hơn **78%** tổng hai bán kính (`HIT_SCALE` trong `src/core/solver.ts`; trước đây 85%). Với hạt thường (bán kính 16): hạt đứng yên có tâm cách dây **dưới 25 px** thì chặn hạt chạy trên dây; từ 25 px trở lên (mép hạt cách mép dây khoảng 6 px) thì hạt chạy đi qua. Hai hạt chỉ chạm mép (ví dụ hai hạt nằm sát nhau ở chỗ cắt) không tính là va chạm.
- **Cặp có đường thông (sẽ chạm được nhau):** chỉ trong lúc một hạt của cặp đang chạy, **cả 2 hạt của cặp đó đều không có hitbox**. Hạt của cặp khác đang chạy có thể đi xuyên qua chúng mà không bị tính là va chạm. Khi đứng yên, hạt có hitbox bình thường.
- **Cặp bị chặn:** trong lúc hạt của nó đang chạy (trước khi đụng), 2 hạt của cặp đó **vẫn có hitbox** với hạt của các cặp khác.
- **Bóng sọc (cặp đã va chạm):** khi một hạt đang chạy đụng hạt khác, cặp của hạt đang chạy bị **đánh dấu**: cả 2 hạt chuyển sang có **sọc trắng chéo**. Hạt có sọc đụng hạt khác thì **không mất tim** nữa. Hạt khác (chưa có sọc) đụng vào hạt có sọc thì vẫn mất tim như thường, và cặp của hạt vừa đụng bị đánh dấu. Đánh dấu giữ đến hết level (chơi lại thì xóa).

## 3.3b Cảm giác vật lý của bóng <Badge type="tip" text="Live" />

- **Khi chạy:** bóng bị kéo dài nhẹ theo hướng di chuyển (dài 116%, dẹt 88%) và để lại **vệt trail** mờ dần (9 vị trí gần nhất).
- **Hình dáng bóng:** bóng bóng loáng (glossy) với ánh sáng từ góc trên bên trái: viền tối, thân sáng dần về phía nguồn sáng, đốm phản quang trắng, ánh phản xạ nhẹ ở đáy; mỗi bóng có **bóng đổ** mềm lệch xuống dưới bên phải (bóng đổ đi theo bóng khi bóng méo).
- **Khi va chạm:** cả bóng đang chạy và bóng bị đụng **biến dạng đàn hồi** (co giãn dao động tắt dần trong khoảng 0,7 giây, theo hướng va chạm), và **cả 2 bóng bắn ra giọt nước** cùng màu với chính nó (6–9 giọt mỗi bóng, vài giọt màu sáng hơn), bay ra phía ngoài chỗ chạm (hình quạt ±65°), rơi nhẹ xuống và nhỏ dần rồi biến mất (khoảng 0,3–0,5 giây). Có ở cả bản thường và bản Jelly.
- **Khi tới bóng cùng cặp:** cũng bắn giọt nước như vậy (màu của cặp): bóng vừa tới bắn ngược về phía sau, bóng kia bắn về phía trước theo hướng chạy; sau đó cặp nổ như cũ (bản Jelly: lúc hai bóng bắt đầu ép vào nhau).

## 3.3b2 Bản Jelly <Badge type="tip" text="Live" />

Bản game phụ tại [`/jelly/`](https://taigd98.github.io/dot-line/jelly/) (nút **Play Jelly** ở trang chủ): cùng level, cùng luật, chỉ khác cảm giác của bóng (`src/game/mode.ts`, `JELLY` trong `src/scenes/Game.ts`):

- **Khi chạy:** không có trail; bóng **biến dạng như thạch**: kéo dài theo hướng chạy, càng nhanh càng dài (tới khoảng 1,5 lần), dẹt lại tương ứng (giữ diện tích), rung nhẹ trong lúc chạy. Độ dài đi theo một lò xo mềm nên khi bắt đầu chạy, quay đầu hay dừng lại bóng nảy qua nảy lại rồi mới tròn lại.
- **Khi va chạm:** rung mạnh và lâu hơn bản thường (biên độ 0,5 / 0,4 thay vì 0,32 / 0,22, tắt dần trong khoảng 1,3 giây thay vì 0,7 giây).
- **Khi tới bóng cùng cặp:** bóng dừng lúc chạm bóng kia, hai bóng **ép vào nhau** (dẹt ở chỗ chạm, 0,16 giây), **nhập thành một khối** (diện tích bằng tổng hai bóng, lúc đầu dài theo hướng gặp nhau rồi rung về tròn, 0,4 giây, phồng lên một chút) rồi mới **nổ**. Màn Well Done đến 0,5 giây sau tiếng nổ cuối.

## 3.3b3 Bản Magic <Badge type="tip" text="Live" />

Bản game phụ tại [`/magic/`](https://taigd98.github.io/dot-line/magic/) (nút **Play Magic** ở trang chủ): cùng level và luật, level là dấu niêm phong khắc trên một cánh cửa đôi (`src/scenes/Door.ts`, `MAGIC` trong `src/scenes/Game.ts`). Ảnh: [Magic variant: assets](../guide/magic-assets) (cửa, phía sau cửa, tia sáng, chùm sáng, hạt lấp lánh, bóng orb).

- **Bóng:** quả cầu orb (ảnh `orb.png`) trong màu của cặp, đủ 28 màu đều có bóng đổ và điểm sáng (màu tối của orb thành màu tối hơn, màu sáng thành trắng); bóng sọc vẫn có sọc trắng.
- **Cửa:** chỉ dùng phần mặt phẳng của `door.png` (bỏ khung hoa văn hai bên; hoa văn trên và dưới nằm dưới HUD và thanh booster), đổi sang **màu nền của bản thường** theo theme (sáng `#F2EEE6`, tối `#1F2335`), chỉ giữ vân đá mờ của ảnh. Mặt cửa liền, **không thấy khe** cho tới khi bóng cuối cùng biến mất. Dây (không viền) và trang ngoài cột game như bản thường.

- **Vào level:** hai cánh cửa trượt vào từ hai bên (0,43 giây), sập lại (rung nhẹ, hạt sáng dọc khe). Sau đó hai bóng của mỗi cặp cùng nằm ở đầu thứ nhất của dây, bóng thứ hai chạy theo dây sang đầu kia (0,35–0,85 giây tùy độ dài dây), dây hiện ra phía sau nó. Trong lúc này chưa chạm được bóng. Chữ hướng dẫn (tutorial) của level, nếu có, chỉ hiện sau khi bóng chạy xong, và tắt khi người chơi làm đúng điều kiện hoặc ngay khi bóng cuối cùng biến mất. Cửa đứng yên khi pinch zoom; dây và bóng zoom như bình thường.
- **Phá seal:** gỡ hết bóng thì level trở về zoom gốc và canh giữa; trước hết **map của level (mọi dây và mọi bóng ở chỗ ban đầu) hiện lại, sáng vàng như ánh sáng trong khe** (0,45 giây), sau đó khe cửa mới hiện ra và ánh sáng lọt qua (0,55 giây), rồi hai cánh cửa mở ra (0,8 giây), mỗi cánh mang nửa map của nó, với chùm sáng bung ra; rồi màn **Well Done** hiện trên căn phòng phía sau cửa (không làm tối; căn phòng vừa khít màn hình game). Hai thanh HUD (trên, dưới) **trượt ra khỏi màn hình** khi cửa bắt đầu mở và **trượt vào lại** (thanh trên từ trên xuống, thanh dưới từ dưới lên) khi cửa đã sập cho level sau; lúc vào game lần đầu cũng vậy. **CONTINUE** làm cửa sập lại cho level sau; **REPLAY** giữ cửa đóng, bóng chạy ra lại.

## 3.3b4 Theme Fluffy <Badge type="tip" text="Live" />

Bản game phụ tại [`/fluffy/`](https://taigd98.github.io/dot-line/fluffy/) (nút **Play Fluffy** ở trang chủ): cùng level và luật, mỗi hạt là một **cục bông lông có mặt** (`src/scenes/fluffy.ts`, `FLUFFY` trong `src/scenes/Game.ts`). Ảnh gốc và quy cách: [Fluffy theme: assets](../guide/fluffy-assets).

| Lúc | Mặt | Chuyển động / hiệu ứng |
|---|---|---|
| Đứng yên | ngủ (nhắm mắt) | thở: phồng xẹp (dọc ±4,5%, ngang ±2,5%) và nhấp nhô lên xuống 7% bán kính, mỗi cục lệch nhịp |
| Đứng yên, cặp đã va chạm (bị đánh dấu) | ngủ, có sọc trắng như bản thường. **Khi có ảnh `face-awake.png`:** thức, mở mắt, không sọc | thở như lúc ngủ |
| Tap vào cục | | 11–15 túm lông bay ra mọi phía ngay chỗ tap |
| Tap vào khoảng trống | | 5–7 cục lông tí hon (đủ 4 biểu cảm, màu các cặp trong level, rất mờ) văng lên, xoay rồi rơi xuống và mờ dần |
| Đang chạy | mắt tròn, ngạc nhiên | to hơn 6%, nảy nhanh; **trail dài** (24 khung hình) màu của cục, rắc **sparkle** lấp lánh (sao 4 cánh trắng và màu của cục, xoay và nhỏ dần) |
| Va chạm (cả hai cục) | `> <` (0,6 giây, và suốt lúc bị bật về) | bẹp rồi nảy; 10–14 túm lông **đúng một màu, màu của cục đó**, bay ra phía ngoài chỗ chạm, trôi nhẹ rồi mờ dần |
| Tới bóng cùng cặp | `^ ^` vui | dừng lúc chạm nhau: 14–18 túm lông bay ra mọi phía chỗ hai cục chạm, hai cục **va như hai cục va chạm** (bật ra một chút rồi về, bẹp và rung) và đứng cạnh nhau **0,2 giây** (`HUG_HOLD` trong `src/game/tuning.ts`; chỉnh bằng thanh *Pair touch → hearts* trong cheat ⚙ tuning của bản Fluffy, bấm Confirm khi chạy local để ghi vào code); rồi 6–9 trái tim nhỏ **cùng màu với cặp** bay lên, cùng lúc hai cục phồng nhẹ rồi thu nhỏ hết trong 0,2 giây |

- **Nền:** ô pattern các mặt cục lông (4 biểu cảm, xếp chéo), tương phản thấp, thưa và nhỏ (các mặt nhỏ, cách nhau xa, nhạt gần như màu nền), mỗi theme một ô (kem / xanh đậm). Nền nằm trong board nên **zoom cùng board**, mỗi ô phủ 1024 px của board, và **cuộn chậm theo đường chéo** từ trên trái xuống dưới phải (22 px/giây).
- **Tutorial:** bàn tay 👆 như bản thường. **Khi có ảnh `hand.png`:** thay bằng bàn chân lông xù, đầu ngón đặt đúng vào cục.
- **Màu:** thân xám của cục lông (lông mờ, không bóng, sợi lông rõ, đánh sáng từ trên trái nên thấy khối tròn; hướng đèn và độ sáng tối chỉnh bằng nhóm *Ball light* trong cheat ⚙ tuning: hướng đèn, độ cao đèn, độ sáng phía tối, độ sáng phía được chiếu, độ sáng mềm chỗ chiếu mạnh nhất; `LIGHT_*` trong `src/game/tuning.ts`) được tô theo 28 màu như bóng orb; cục bị đánh dấu (đã va chạm) có sọc trắng (khi có ảnh mặt thức thì bỏ sọc, thay bằng mặt thức).
- Màn Well Done đến 1 giây sau khi cặp cuối biến mất (với `HUG_HOLD` 0,2: 1,2 giây sau khi chạm nhau).

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

- **Thắng:** mọi cặp trên board đã biến mất → confetti và màn "Well Done!" (board để trống, không hiện lại hình vẽ phía sau).
- **Kết thúc level:** bóng cuối chạy với tốc độ bình thường; khi nổ, màn "Well Done!" hiện sau khoảng 0,5 giây (không còn slow motion hay zoom).
- **Kéo màn:** kéo được ở mọi mức zoom, kể cả nhỏ nhất.
- **Thua:** mỗi lần va chạm mất 1 tim, mỗi level có 3 tim. Hết tim = thua màn. Màn "Out of Hearts!" có 2 nút: **PLAY ON** (xanh, nhãn AD, xem quảng cáo; chưa nối quảng cáo thật): hồi đủ 3 tim và chơi tiếp đúng từ chỗ đang dở (các cặp đã dọn vẫn mất, cặp đã sọc vẫn sọc); **QUIT** (xám): mở pop-up **"Are you sure?"** cho thấy tiến độ level ("You have cleared X of Y lines.", thanh tiến độ và %) kèm cảnh báo "If you replay now, you will lose your progress on this level.", với 2 nút **PLAY ON** (xanh, AD, như trên) và **REPLAY** (đỏ: chơi lại level từ đầu). Màn thắng "Well Done!" (confetti, nút CONTINUE) và màn thua "Out of Hearts!" (nút RETRY) vẽ trong Phaser theo phong cách của skill `prototype-ui` (font Lilita One, tiêu đề gradient).

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

Nguồn: vật liệu `Voxel_*` của game Cube Blast (file `VoxelMaterials.json`). Mỗi màu có **Base** (`_BaseColor`: màu bóng và dây) và dải sáng tối `_RampKey`: **Dark** (nấc tối nhất: viền bóng), **Lit** (nấc gần 0,6: phần sáng của thân bóng) và **Light** (nấc sáng nhất: đốm sáng). White và Black không dùng vì bị chìm vào nền; level cũ có màu không còn trong bảng được đổi màu khi mở.

| Tên | Base | Dark | Lit | Light |
|---|---|---|---|---|
| blue | `#1020EB` | `#270B73` | `#765DFF` | `#AC9BFF` |
| brown | `#93592F` | `#5B2600` | `#8E4E2C` | `#E7A379` |
| cyan | `#2AC5F2` | `#1575BE` | `#2DD1FF` | `#DAF7FF` |
| dark_blue | `#0C3E7D` | `#042857` | `#1E65BE` | `#69ABFF` |
| dark_green | `#0A4414` | `#003508` | `#0C821F` | `#34B94A` |
| green | `#109616` | `#006314` | `#1FA125` | `#3EDE45` |
| lavender | `#B671F3` | `#6F18B9` | `#DF99FF` | `#ECD5FF` |
| light_green | `#B4F484` | `#357109` | `#9FF85F` | `#C3FF96` |
| light_orange | `#FFA461` | `#E26C2E` | `#FFB88D` | `#FFD1B1` |
| light_pink | `#FF97AF` | `#B02E4C` | `#FFB3A7` | `#FFF5F2` |
| light_yellow | `#FDE372` | `#A89314` | `#EDE12C` | `#FFFDC6` |
| lime | `#60E414` | `#2B6F00` | `#50EE1C` | `#ACF79B` |
| magenta | `#F00DE7` | `#B20398` | `#FF36F7` | `#FFB3F6` |
| maroon | `#73080A` | `#4B0002` | `#891518` | `#D44548` |
| navy | `#0C1465` | `#001276` | `#197DFF` | `#C4EFFF` |
| olive | `#936908` | `#6C4D00` | `#C8A930` | `#FFE99E` |
| olive_green | `#63A729` | `#2B3C00` | `#6EA814` | `#C0EE98` |
| orange | `#EC8C0F` | `#C88F25` | `#FFD896` | `#FFF0C9` |
| orange_red | `#F35021` | `#B04009` | `#FF9B14` | `#FFF0A2` |
| pink | `#FC547B` | `#892655` | `#FFA5C9` | `#FFEDF4` |
| purple | `#820EE8` | `#450080` | `#811ED4` | `#E094FF` |
| red | `#E5171B` | `#840005` | `#FF4063` | `#FF8F95` |
| sky_blue | `#0E6FE8` | `#0036B9` | `#008BFF` | `#AEE2FF` |
| spring_green | `#17E482` | `#006F4A` | `#69FFB8` | `#CBFFE7` |
| teal | `#04778E` | `#004F5E` | `#10A2C3` | `#86F1FF` |
| turquoise | `#13EDDB` | `#01707B` | `#00FFF2` | `#94FFF8` |
| yellow | `#FDD201` | `#E98E3F` | `#FFED3D` | `#FFF9BF` |
| yellow_green | `#A3F408` | `#527D00` | `#C8F72D` | `#E8FF70` |

**Nền:** theme sáng `#F2EEE6`, theme tối `#1F2335`. Dây chỉ có màu của nó, **không có viền**.

**Màu dùng cho mỗi theme** (chọn bằng mắt; `THEME_COLOURS` trong `src/core/palette.ts`):

| Theme | Màu giữ nguyên | Màu khó nhìn, sẽ được đổi |
|---|---|---|
| Sáng (17 màu) | blue, brown, cyan, green, lavender, light_orange, light_pink, lime, magenta, olive_green, orange, orange_red, pink, purple, red, sky_blue, spring_green | dark_blue, dark_green, light_green, light_yellow, maroon, navy, olive, teal, turquoise, yellow, yellow_green |
| Tối (19 màu) | cyan, green, lavender, light_green, light_orange, light_pink, light_yellow, lime, magenta, olive_green, orange, orange_red, pink, red, sky_blue, spring_green, turquoise, yellow, yellow_green | blue, brown, dark_blue, dark_green, maroon, navy, olive, purple, teal |

**Cách đổi khi chơi** (`themeColours` trong `src/core/palette.ts`, gọi từ `recolour` trong `src/scenes/Game.ts`):

1. Chỉ đổi màu **không nằm trong danh sách giữ** của theme đang bật. Màu trong danh sách giữ không bao giờ bị đổi.
2. Màu thay là một màu trong danh sách giữ, **không cần cùng tông** với màu gốc. Điều kiện: không trùng màu, không cùng nhóm tông, và khác rõ (độ khác màu ≥ 25) với **mọi dây đè lên hoặc chạy gần nó** (cách nhau dưới 60 px, như `nearPairs` của generator), tính theo màu đang hiện của các dây đó.
3. Trong các màu thỏa điều kiện: ưu tiên màu gần giống màu gốc nhất, rồi màu đang ít dùng trong level. Dây có nhiều dây gần được chọn trước; sau đó chọn lại vài lượt để dây chọn sớm cũng tính tới các dây chọn sau.
4. Nếu không còn màu nào thỏa (level quá dày, mọi màu giữ đều đụng một dây gần), lấy màu đụng ít dây nhất. Với 30 level đang chơi: còn 13 chỗ ở theme sáng (theme sáng không còn màu nào của nhóm vàng, nên các màu vàng thường thành cam và dễ đụng orange_red; vd. Butterfly, Christmas bear, các level Dancer, Glass poppy, Ice cream cone) và 1 chỗ ở theme tối (Dancer parasol).

Vì màu thay tùy theo các dây xung quanh, cùng một màu gốc có thể thành các màu khác nhau ở các level khác nhau. Đổi theme thì chọn lại theo theme mới. File level vẫn giữ màu gốc (editor không đổi). Generator và phần kiểm tra của editor không biết level xung quanh, nên vẫn ước lượng mỗi màu khó nhìn thành màu giữ gần nhất cùng tông (`shownColour`).

**Nhóm tông màu:** 28 màu chia thành 10 nhóm cùng tông (sáng hay đậm đều tính là cùng tông; `FAMILIES` trong `src/core/palette.ts`):

| Nhóm | Màu |
|---|---|
| Đỏ | red, maroon |
| Cam | orange_red, orange, light_orange, brown |
| Vàng | yellow, light_yellow, olive |
| Xanh cốm | lime, yellow_green, light_green, olive_green |
| Xanh lá | green, dark_green, spring_green |
| Xanh ngọc | turquoise, cyan, teal |
| Xanh dương | blue, sky_blue, dark_blue, navy |
| Tím | purple, lavender |
| Hồng tím | magenta |
| Hồng | pink, light_pink |

**Phối màu trong một level** (`colourPairs` trong `src/core/generator.ts`):
- **Cấm tuyệt đối:** hai dây gần nhau (chạm, cắt hoặc cách nhau dưới **60 px**) có màu **giống nhau**: cùng màu, cùng tông, hoặc khác tông nhưng **nhìn giống nhau trên màn hình** (ví dụ spring_green cạnh turquoise, green cạnh olive_green, blue cạnh purple). "Nhìn giống" đo bằng độ khác biệt màu theo mắt người (CIEDE2000, phải ≥ 25) trên đúng màu người chơi thấy, ở **cả theme sáng và theme tối** (sau khi đổi màu theo theme). Level checks báo lỗi (warn) nếu có, và `publish:levels` không cho đưa level đó lên (`farApart` trong `src/core/palette.ts`).
- **Càng nhiều màu càng tốt:** mỗi màu được dùng một lần trước khi màu nào dùng lần hai (level từ 28 cặp trở lên dùng đủ 28 màu), và trong số đó nhóm tông ít dùng nhất được chọn trước, để hạn chế tối đa các dây cùng tông trong cả level.
- Cách làm: tô dây khó nhất trước (dây còn ít màu hợp lệ nhất), thử tối đa 60 cách xáo trộn, giữ cách không vi phạm và dùng màu đều nhất. Dây chéo X/T (bước 2 của editor) cũng chọn màu theo cùng quy tắc. Ô **Colours** của editor là số màu tối đa (mặc định 28).
- Khi game đổi màu theo theme (bảng trên), màu chỉ được đổi **trong cùng nhóm tông** và **luôn đổi sang cùng một màu** (không phụ thuộc level), nên generator biết chính xác màu người chơi sẽ thấy và giữ quy tắc trên ở cả hai theme. Vì nhiều màu nhạt chìm trên nền sáng và nhiều màu đậm chìm trên nền tối, một level 28 màu khi chơi hiện khoảng 18 màu ở theme sáng và 19 màu ở theme tối.

## 3.8 Level <Badge type="tip" text="Live" />

- Mỗi level là một hình vẽ ghép từ các cặp hạt và dây (ví dụ cái micro trong clip).
- **Bộ level đang chơi (Play order, `levels/game.json`):** 30 level của **chapter 6**, gen lại từ hình gốc của bộ cũ (2 level hướng dẫn của chapter 1 + 28 level tranh line art của chapter 5) bằng generator hiện tại (`npm run levels:chapter6`). LEVEL 1 hướng dẫn bấm, LEVEL 2 hướng dẫn va chạm, LEVEL 3 hướng dẫn pinch zoom. Bản build của game chứa đúng các level này.
- Bộ cũ vẫn còn trong repo nhưng không chơi: hệ thống 100 level (chapter 1, xem [Level system](../guide/level-system) và `design/level-system.xlsx`), 10 level mở đầu cũ (bộ "Intro"), chapter 5 bản trước.
- **Hướng dẫn:** level có trường `tutorial` hiện bàn tay chỉ vào hạt và dòng chữ (Tap a dot to send it home / Blocked dots bounce back / Pinch to zoom); biến mất sau lần bấm hoặc zoom đầu tiên. Ở level hướng dẫn va chạm (`collision`), **lần đụng đầu tiên không mất tim**, rồi hiện thông báo "Free this time! Next bump costs a heart".
- **Nhãn "Hard"** hiện trên tim ở các level vị trí khó của hệ thống level (`category: "hard"`); level không thuộc hệ thống thì hiện khi độ khó từ 4 trở lên.
- Số cặp mỗi level, số màu, cách tăng độ khó qua các level: _TBD_.
- Điều kiện để level giải được: luôn tồn tại một thứ tự gỡ dọn sạch được board. Cách kiểm tra (bằng tay hay bằng công cụ): _TBD_.
