# Level editor (spec)

::: tip Đã có bản đầu
Editor chạy ở `<pagesUrl>/editor/` (máy local: `npm run editor`, mở `http://localhost:8080/editor/`). Đây là yêu cầu của editor, viết từ các câu trả lời của designer. Chỗ ghi `_TBD_` là chưa chốt; editor đang dùng quy tắc tạm và sẽ đổi khi có quyết định.
:::

## Cách dùng nhanh

| Thao tác | Cách làm |
|---|---|
| Chọn công cụ | `V` chọn/di chuyển · `P` thêm cặp · `H` kéo màn hình |
| Thêm cặp | Công cụ `P`: kéo chuột vẽ dây tự do (editor tự làm mượt), hoặc click điểm đầu rồi click điểm cuối (dây thẳng) |
| Chỉnh đường cong | Chọn 1 cặp: kéo điểm vuông (điểm neo) và điểm tròn (tay cầm). Double-click lên dây để thêm điểm, double-click điểm để xoá. Giữ Alt khi kéo tay cầm để bỏ đối xứng |
| Snap | Khi kéo hạt hoặc điểm neo, đường gióng hồng hiện ra và hạt hút vào cho thẳng hàng với hạt khác |
| Chọn nhiều | Shift-click, hoặc kéo khung trên chỗ trống · `Ctrl/Cmd+A` chọn hết |
| Copy | Alt-kéo · `Ctrl/Cmd+D` nhân đôi · `Ctrl/Cmd+C` / `V` |
| Khác | Mũi tên: dịch 1px (Shift: 10px) · `Del` xoá · `Ctrl/Cmd+Z` hoàn tác · `Ctrl/Cmd+S` lưu · `F` vừa khung · Space-kéo hoặc chuột phải-kéo: kéo màn hình · lăn chuột: zoom |

Editor chạy trong trình duyệt, là một trang riêng trong cùng project Vite + TypeScript, phục vụ tại `<pagesUrl>/editor/` (cạnh `/demo/` và `/docs/`). Editor **không** nằm trong bản snapshot của mỗi `build_demo` / `release_demo`. Giao diện viết bằng tiếng Anh, theo mẫu editor Fish Ball.

## 1. Dữ liệu level

### 1.1 Thành phần

- **Level** = danh sách **cặp**. Mỗi cặp có:
  - **Màu**: một trong 16 màu của [bảng màu GDD 3.7](../gdd/rules#_3-7-bang-mau).
  - **2 hạt** `a` và `b`, mỗi hạt có vị trí `(x, y)` và bán kính `r` riêng (chỉnh tự do, 2 hạt trong cặp có thể khác nhau).
  - **1 dây**: đường cong nối `a` với `b`, lưu như path SVG (các điểm neo, mỗi điểm có tay cầm vào/ra).
- **Board không giới hạn kích thước**; toạ độ là world pixel, có thể âm.
- **Obstacle:** phiên bản đầu chưa có. File level chừa sẵn trường `obstacles` (mảng rỗng) để thêm sau mà không đổi cấu trúc. Loại obstacle: _TBD_.
- **Ngoài dữ liệu level (editor không đụng tới):** tốc độ hạt chạy, số tim (3, cố định trong game), giới hạn pinch zoom (3x), zoom của Hint (1.5x), quảng cáo.

### 1.2 File level (bản nháp schema)

```json
{
  "schema": "dot-line-level",
  "version": "1.0",
  "id": "candy-01",
  "name": "Candy",
  "status": "WIP",
  "difficulty": 3,
  "category": "Food",
  "source": { "image": "candy-01.png", "pairs": 12, "colors": 5 },
  "pairs": [
    {
      "id": "p1",
      "color": "crimson",
      "a": { "x": 120, "y": 340, "r": 18 },
      "b": { "x": 410, "y": 520, "r": 26 },
      "path": [
        { "x": 120, "y": 340, "out": { "x": 200, "y": 300 } },
        { "x": 300, "y": 420, "in": { "x": 260, "y": 380 }, "out": { "x": 340, "y": 460 } },
        { "x": 410, "y": 520, "in": { "x": 380, "y": 500 } }
      ]
    }
  ],
  "obstacles": []
}
```

Trường tuỳ chọn: `tutorial` (`tap`, `collision`, `zoom`, `rope`, `lock`: game hiện bàn tay và dòng hướng dẫn), `rope: true` trên một cặp (dây thừng chặn bóng khác, GDD 3.12), `obstacles` (ổ khóa và chìa, GDD 3.13), `source.rect` (vị trí ảnh gốc trong editor).

Bắt buộc: `schema`, `version`, `id`, `name`, `pairs` (mỗi cặp: `id`, `color`, `a`, `b`, `path`). Điểm đầu và cuối của `path` trùng với tâm `a` và `b`. `source` chỉ có khi level được tạo từ ảnh.

### 1.3 Cảnh báo (Level checks)

- Cặp thiếu hạt, hoặc dây không nối đủ 2 đầu.
- Hai hạt chồng lên nhau ngay từ đầu.
- Màu không nằm trong bảng màu.
- **Level không giải được:** không có thứ tự gỡ nào dọn sạch board.
- Hạt nhỏ hơn mức nhỏ nhất (bán kính 11).
- (Thông tin) **Cỡ hạt không đồng nhất:** một level chỉ có một cỡ hạt thường; chỉ bóng bự (to hơn hạt thường từ 1.15 lần) mới khác cỡ. Check liệt kê các cặp có hạt lệch cỡ.
- (Thông tin) Những cặp đã có đường thông ngay từ đầu.

## 2. Tạo level

### 2.1 Generate từ hình vẽ: 2 phần độc lập

Khung **Generate from a drawing** có 2 phần, mỗi phần một nút riêng. Hai phần **không ảnh hưởng nhau**: phần 1 chỉ thay các dây nền (base), phần 2 chỉ thay các dây cross (X/T). Bấm lại phần nào thì chỉ phần đó đổi.

| Phần | Tham số | Kết quả |
|---|---|---|
| **1 · Fill the lines** | Pairs, Colours, Target difficulty | Các cặp chỉ nằm trên **nét của hình input** (dây nền). Các dây **gần nhau không có màu giống nhau** (chạm, cắt, hoặc cách nhau dưới 60 px): không cùng màu, không cùng tông, và nhìn khác rõ ở cả theme sáng lẫn tối (Rules 3.7). Dùng càng nhiều màu càng tốt; Colours = số màu tối đa (mặc định 28). |
| **2 · Overlap pattern** | X cross, T cross (và kiểu hoa văn) | Các **dây cross** vẽ đè lên hình như hoa văn. Không bao giờ dời hay cắt dây nền. |

**Tổng số dây của level = Pairs + X + T** (dòng "Target lines" trong khung hiện tổng này và số đang có). Kích thước hình khi generate tăng theo tổng số dây để hoa văn có chỗ.

**Phần 2: luật của dây cross**

- **X cross:** cắt qua ít nhất một dây khác, **cả 2 hạt nằm ở vùng trống**. Không chặn ai.
- **T cross:** **một hạt nằm trên dây của cặp khác** (chặn dây đó), hạt còn lại ở vùng trống.
- Không có dây cross nào mà cả 2 hạt đều nằm trên dây của cặp khác.
- Các dây **cắt nhau hoặc chạm nhau không bao giờ cùng màu**; dây đối xứng nhau thì cùng màu khi được.
- Dây cross được phép cắt hoặc đậu lên dây cross khác (T đậu trên T = chặn sâu hơn; mức này tăng theo Target difficulty).
- Hai mục đích: **làm level khó hơn** (T) và **làm hình sinh động hơn** (X) mà **vẫn giữ shape gốc**. Kết quả phải như tô hoa văn cho tranh, không phải nét nguệch ngoạc: một kiểu nét lặp lại theo nhịp đều, đối xứng gương khi hình đối xứng.
- Level luôn giải được: dây cross chỉ bị chặn bởi dây cross đậu trên nó.

**Kiểu hoa văn (Pattern):** Auto (đưa ra vài kiểu để chọn), Fringe (nét ngắn vuông góc, cách đều dọc theo nét), Rays (nét hướng về tâm hình), Stripes (sọc ngang), Columns (sọc dọc), Diagonal (sọc chéo đối xứng). Nét có thể thẳng, cong nhẹ, móc câu hoặc lượn sóng.

**Clear overlap** xoá mọi dây X/T. Trong Inspector, mục **Line type** cho đổi một dây vẽ tay thành Base / X cross / T cross (dây X/T sẽ bị thay khi bấm Generate overlap). Level checks báo: dây cắt nhau trùng màu, dây cross có cả 2 hạt trên dây khác, và số dây base + X + T.

Nếu hoa văn không đủ chỗ cho số dây yêu cầu, editor báo "Placed N of M": giảm số dây, đổi kiểu hoa văn, hoặc tăng Pairs/X/T rồi Generate lines lại để hình to hơn. Nếu Generate lines lại khi đang có overlap, các dây overlap được giữ nguyên; editor báo nếu chúng không còn khớp với dây nền mới.

#### Phần 1: chế độ Strokes (mặc định)

Ô **Mode** có 2 chế độ:

- **Strokes** (mới, mặc định): **mỗi nét của hình = một dây**, giữ nguyên hình. Đầu nét chạm nét khác thì thành hạt nằm **trên** nét đó (chặn nó); đầu nét ở chỗ trống là hạt tự do; hai đầu nét chạm nhau thì một đầu lùi lại cho 2 hạt nằm cạnh nhau. Chỉ nét kín hoặc rất dài (quá 1.7 lần cạnh hình) mới bị chia, và chỗ chia được chọn xa các giao điểm. Sau đó editor bỏ vòng chặn (lùi đầu dây rẻ nhất; hai dây chạy song song sát nhau thì bỏ dây ngắn hơn), rồi kéo nhẹ đầu tự do lên một dây ở phía trước nó để đạt mục tiêu: khoảng 1/3 dây mở từ đầu, ~1.3 lần chặn mỗi dây (theo Target difficulty). Số dây do hình quyết định; thiếu bao nhiêu so với Pairs thì thêm bằng phần 2.
- **Cut contours** (cũ, generator v2): cắt các nét dài thành nhiều cặp nối tiếp.

**Chỗ giao bị tách đôi:** trong ảnh PNG, mực dày ở giữa một chỗ giao (ví dụ cái mũi tô đặc ở giữa chữ "x") làm khung xương tách thành 2 chỗ giao cách nhau vài pixel. Hai chỗ giao nối nhau bằng một đoạn ngắn (≤ 14 px), mỗi chỗ có ít nhất 2 nét khác và cả cụm nhỏ (≤ 28 px), được gộp lại làm một: các nhánh đối diện nối thẳng qua (chữ "x" thành 2 nét chéo). Mỗi chỗ giao chỉ gộp một lần, nên vùng có nhiều chỗ giao dày đặc (tâm hoa) không bị nối xuyên qua.

**Dây mượt, không gấp khúc:** nét lấy từ ảnh được làm mượt (bỏ răng cưa pixel và các bậc nhỏ ở giao điểm), mọi góc nhọn được bo tròn (bán kính khoảng 12 px), và đường Bezier của dây liên tục hướng ở mọi điểm neo. Đầu dây nối lên dây khác theo một cung tròn đi tiếp đúng hướng của nét, nên không có móc ở đầu dây; nét thò một đoạn ngắn qua dây khác thì được cắt ngay tại chỗ giao.

**Dot size của level và ô Big dot (Inspector):** mục **Level** trong Inspector có ô **Dot size**: đổi giá trị thì mọi bóng thường của level (kể cả dây overlap X/T) đổi theo, bóng bự giữ nguyên; ô Dot size của phần Generate cũng đổi theo. Khi chọn một cặp, mỗi bóng (Dot A, Dot B) có ô **big dot**: bóng thường luôn có cỡ của level (không có thanh kéo); tick big dot thì bóng có thanh kéo riêng (mặc định 1,5 lần Dot size). Một cặp có thể có 1 bóng bự và 1 bóng thường. Trong file level bóng bự có `"big": true`; level cũ không có trường này thì bóng to hơn Dot size từ 1,15 lần được tính là bóng bự. Bóng mới vẽ tay có cỡ bằng Dot size của level. Bấm **Generate lines** lại với Dot size khác khi level đã có dây overlap: các dây overlap được giữ và đổi sang cỡ mới (bóng bự của chúng giữ nguyên). Level checks báo nếu bóng bự không to hơn Dot size.

**Cỡ hạt (ô Dot size):** mọi dây dày như nhau (5.1 px) và **mọi hạt thường của level có cùng một bán kính**, đặt ở ô **Dot size** (mặc định 16, nhỏ nhất 11). Hạt không tự thu nhỏ để vừa chỗ chật: khi hình có nét quá ngắn cho cỡ hạt này, editor **làm board to hơn** (×1.2 hoặc ×1.45, chỉ khi rõ ràng cần) thay vì làm hạt nhỏ đi; ghi chú dưới nút cho biết kích thước board đã dùng. Nét vẫn quá ngắn thì bị bỏ và được đếm trong ghi chú ("left out"). Muốn hạt to hoặc nhỏ hơn so với hình thì đổi Dot size rồi Generate lại: kích thước board không co theo Dot size (cạnh dài tối thiểu 704 px, tối đa khoảng 1440 px khi tự nới), nên Dot size nhỏ hơn cho bóng nhỏ hơn thật so với hình và chi tiết nhỏ có thêm chỗ. Cut contours và Generate overlap cũng dùng cỡ hạt này.

**Bóng bự (ô Big dots, chỉ ở chế độ Strokes):** chi tiết **tròn hoặc gần tròn, kín, nhỏ** của hình (mắt, mũi, nút áo, quả châu) không thành dây mà thành một **bóng bự** đặt ngay tại đó. Quy tắc:

- **Vòng tròn vẽ bằng nét, không cần kín hẳn**, cũng được tính (độ tròn đo bằng cách khớp một đường tròn: các điểm lệch trung bình không quá 6% bán kính):
  - một dây cuộn một vòng tròn **ở giữa** rồi chạy tiếp (dây kim tuyến quấn quanh quả châu): vòng đó thành bóng bự, dây được cắt tại cổ vòng; phần dài hơn mang bóng bự, phần kia lùi ra cho hạt của nó không chạm bóng bự;
  - một dây kết thúc bằng **một vòng** (quả bóng bay với dây): chỗ khép có thể hở tới khoảng 3 lần bề rộng nét (nét bị cắt ở chỗ giao khi trace);
  - một dây kết thúc bằng **một móc cong** đi được ít nhất 80% vòng tròn (quả châu vẽ chưa khép);
  - một **cung tròn** có hai đầu chạm (hoặc gần chạm, tới khoảng 2 lần khoảng cách cho phép trước đây) vào dây khác (quả châu treo trên cành) và đi được ít nhất 78% vòng tròn.
  - Bóng bự của các vòng này nhỏ hơn vòng vẽ một chút (85% bán kính, chỗ chật co được tới 1,3 lần hạt thường) để dây xung quanh còn chỗ; phần dây vẽ liền với vòng luôn là dây mang bóng bự đó.
- Chi tiết được tính khi bán kính của nó không quá 2.8 lần hạt thường; lớn hơn thì vẫn là dây vòng. Vòng có hình khác nằm bên trong (mặt đồng hồ) không tính; chi tiết nằm trong chi tiết lớn hơn (con ngươi trong mắt) gộp làm một; hai chi tiết quá sát nhau (hai lỗ mũi) gộp thành một bóng.
- **Cỡ bóng bự theo chi tiết trong hình** (mắt to thì bóng to), không phụ thuộc Dot size (chi tiết nào thành bóng bự cũng không phụ thuộc Dot size: tính theo kích thước board); nhưng luôn to hơn bóng thường ít nhất 1,3 lần. Chỗ chật bóng bự có thể nhỏ đi tối đa 15%.
- **Có dây nối trong hình:** nét nào kết thúc tại chi tiết, hoặc chi tiết nằm dính trên một nét (quả châu treo trên cành), thì nét đó là dây của bóng bự: một đầu là bóng bự, đầu kia là hạt thường. Nét bị chia tại chỗ chi tiết dính vào; phần dài hơn mang bóng bự.
- **Hạt nằm lưng chừng cạnh dây được kéo vào đè lên dây:** sau khi xếp xong (mọi chế độ gen, cả dây chéo X/T), hạt nào nằm gần một dây khác mà chưa đè rõ lên dây (tâm cách dây từ 1 bán kính tới mức hitbox cũ 85%, tức 16–27 px với hạt thường) được kéo vào cho tâm cách dây nửa bán kính (8 px), không được thì 1 bán kính (16 px). Hạt chặn dây thì nằm hẳn trên dây, hạt không chặn thì nằm hẳn ngoài: dễ nhìn hơn mà level không dễ đi. Chỉ kéo khi chỗ mới không đè hạt khác và level vẫn giải được (dây chéo luôn giữ một hạt ở chỗ trống); màu được tô sau bước này.
- **Dây bị kéo lùi được mọc lại:** khi xếp xong, mỗi đầu dây từng bị kéo lùi (để hạt không đè nhau hoặc để level giải được) thử dài ra lại theo nét gốc: cả đoạn, không được thì một nửa, rồi một phần tư; chỉ giữ khi hạt không đè hạt khác và level vẫn giải được. Nhờ vậy hình ít bị mất nét hơn.
- **Không có dây nối:** hai chi tiết thành **một cặp** (bóng bự + bóng bự) nối bằng một dây thẳng. Ưu tiên ghép hai chi tiết cùng cỡ nằm ngang hàng (hai mắt).
- Chi tiết lẻ, không có gì để ghép: nối bằng một dây thẳng tới dây gần nhất (đầu kia là hạt thường nằm trên dây đó).
- Đầu các dây khác nằm sát bóng bự bị lùi lại cho hạt nằm cạnh bóng bự.
- Trong ảnh PNG, chỗ mực dày không phải hình tròn (chỗ nhiều nét gặp nhau, đầu nét cọ to) không bị nhận nhầm thành bóng bự. Một cụm nét đứng riêng chỉ được tính là chi tiết tô đặc khi phần đặc bên trong rộng ít nhất 40% so với cả cụm (mắt, chấm tròn); cụm nét dày như mũi + miệng hình chữ "x" không tính.

**Hình input tốt nhất cho chế độ Strokes:** SVG, mỗi nét một `<path>`; khoảng 2/3 đầu nét dừng **đúng trên** một nét khác (khoảng 20–40% chiều dài nét đó), còn lại dừng ở chỗ trống; ít khi hai đầu nét chạm nhau; hình kín vẽ bằng 2–4 nét chồng nhau; không có hai nét chạy song song sát nhau (gần hơn 2 đường kính hạt); mắt, mũi, nút vẽ thành hình tròn kín nhỏ để thành bóng bự; khung dọc (cao ≈ 1.3 × rộng). Tiêu chí đầy đủ: `research/image_requirement.md`.

#### Phần 1: chế độ Cut contours (generator v2)

**Đầu vào:** ảnh line art (PNG/JPG, nét tối trên nền sáng) hoặc **file SVG** (khuyên dùng: nét chính xác, giữ góc nhọn). Với SVG, mỗi `path`, `line`, `polyline`, `polygon`, `rect`, `circle`, `ellipse` là một nét; nét kết thúc đúng trên một nét khác tạo thành chỗ chữ T.

**Luật thiết kế** (rút ra từ việc phân tích các level làm tay cùng thể loại):

1. **Chữ T là cơ chế chặn chính.** Nét chi tiết kết thúc trên nét khác thì hạt của nó nằm trên nét đó, nên chi tiết phải gỡ trước, khung sau.
2. **Chữ X không chặn.** Dây cắt chéo nhau thoải mái, chỉ để đánh lạc hướng.
3. **Nét dài và vòng kín được cắt thành nhiều cặp**, ưu tiên cắt ở góc gấp. Ở chỗ cắt có 2 hạt nằm sát nhau. Vòng kín cắt 1 lần là một cặp có 2 hạt chạm nhau, hạt phải chạy trọn vòng.
4. **Nét ngắn đứng riêng** (dưới ~170 đơn vị) thành cặp điểm nhấn có hạt to.
5. **Màu:** các dây gần nhau (chạm, cắt, hoặc cách nhau dưới 40 px) không trùng màu, trong giới hạn M màu; dây bị ràng buộc nhiều nhất được tô trước, các màu dùng đều nhau.

**Cách chạy:** ảnh được dò thành đồ thị nét (giữ chỗ nối, nối các đoạn đi thẳng qua chỗ giao thành một nét), rồi editor tạo 24 phương án ngẫu nhiên. Mỗi phương án được sửa cho **luôn giải được**: hạt đè nhau thì lùi lại; vòng chặn thì ưu tiên **dời điểm cắt** dọc nét (giữ hình liền), sau đó thu nhỏ hạt, rồi rút ngắn dây một chút. Nếu vẫn kẹt (hình nhỏ mà số cặp quá cao), cặp bị kẹt được **gộp với cặp liền kề trên cùng nét** (bỏ một điểm cắt): ít cặp hơn số yêu cầu nhưng hình luôn còn nguyên nét. Số cặp đã gộp được báo dưới nút Generate. Các phương án được chấm điểm theo độ khó mục tiêu; editor hiện **3 phương án tốt nhất** để chọn, rồi bạn chỉnh tay.

**Mẹo vẽ SVG:** đừng để 2 nét chồng lên nhau (ví dụ 2 hình chữ nhật dùng chung cạnh): dây chồng nhau sẽ chặn lẫn nhau và generator phải bỏ bớt cặp.

**Quy tắc tạm** (_TBD_, sẽ thay khi có quyết định):

| Độ khó d | Gợi ý số cặp | Gợi ý số màu | Số lượt tối thiểu mục tiêu | Tỉ lệ cặp mở lúc đầu mục tiêu |
|---|---|---|---|---|
| 1 | 6 | 3 | 1 + số cặp / 30 | 60% |
| 2 | 12 | 5 | 2.4 + số cặp / 30 | 45% |
| 3 | 20 | 7 | 3.8 + số cặp / 30 | 33% |
| 4 | 32 | 9 | 5.2 + số cặp / 30 | 25% |
| 5 | 48 | 11 | 6.6 + số cặp / 30 | 18% |

Điểm phương án = 2 × |số lượt − mục tiêu| + 8 × |tỉ lệ mở − mục tiêu| + 0.3 × |số cặp − yêu cầu| + phạt khi phải rút ngắn dây. Hình vẽ ít chữ T thì khó đạt độ khó cao: độ khó đến từ cấu trúc hình vẽ.

### 2.2 Vẽ và chỉnh tay

- **Thêm cặp:** chọn điểm đầu, điểm cuối, rồi vẽ dây tự do bằng chuột. Editor tự làm mượt thành đường cong mượt nhất, sau đó designer nắn lại bằng điểm neo và tay cầm (như chỉnh path SVG).
- **Snap kiểu Figma:** khi kéo hạt hoặc điểm neo, hiện đường gióng và hút vào để thẳng hàng ngang/dọc với các hạt khác.
- **Chọn một hoặc nhiều dây** (click, Shift-click, kéo khung) để di chuyển, copy, xoá, đổi màu.
- Chỉnh bán kính từng hạt, đổi màu từng cặp trong Inspector.
- Undo / Redo.

## 3. Lưu dữ liệu và quản lý level

- Nơi lưu: **folder trên máy** (File System Access API, chỉ Chrome/Edge) hoặc **Browser storage** để thử.
- **Chapter:** mỗi folder trong `levels/` là một chapter riêng (level, lịch sử và collection riêng). Chọn chapter ở ô **Chapter** trên danh sách level; nút **+** bên cạnh tạo chapter mới (folder được tạo khi Save level đầu tiên). Organiser chỉ sắp level của chapter đang mở.
- **Sửa level của game:** chọn chính folder project `dot-line` làm folder lưu. Game chơi các chapter theo thứ tự tên folder (`chapter-1`, `chapter-2`...); trong mỗi chapter theo collection đầu tiên trong `levels/<chapter>/collections.json`. Mọi lần Save trong editor là game thấy ngay: trang game tự tải lại, **trang editor thì không** (đang sửa dở vẫn giữ nguyên). Lịch sử version (`.versions/`) và bản nháp (`drafts/`) không được commit.
- Project cũ để level thẳng trong `levels/` (và `collections.json` ở gốc) vẫn mở được, hiện là chapter "levels/ (no chapter)".
- Mỗi level giữ **3 bản cũ gần nhất**; có bản nháp tự lưu.
- Cấu trúc folder:

```
<folder gốc>/
  levels/<chapter>/                     một folder = một chapter
    <id>.json                           level
    <id>.png | <id>.svg                 ảnh gốc dùng để generate (nếu có)
    .versions/<id>/                     3 version gần nhất
    collections.json                    danh sách collection của chapter
    collections/<Tên>/NNN_<id>.json     bản copy theo thứ tự chơi
  drafts/current.json                   bản nháp tự lưu (nhớ cả chapter)
```

- **Save:** ghi file level trước, rồi mới ghi ảnh gốc (nếu ảnh mới đổi). Ghi ảnh lỗi thì level vẫn được lưu, editor hiện hộp thông báo, và lần Save sau sẽ thử ghi ảnh lại. Save lỗi hẳn cũng hiện hộp thông báo. Ảnh đọc từ thư mục được chép vào bộ nhớ, nên cấp lại quyền thư mục hay ghi đè file sau khi mở level không làm hỏng Save.
- Import không bao giờ ghi đè: trùng id thì đặt id mới (`-2`, `-3`...). Xoá có hỏi xác nhận. Đổi id thì file, lịch sử và collection chứa level đổi theo; id trống hoặc đã tồn tại bị từ chối.
- Thông tin mỗi level: **Name, Id, Status** (WIP / PROD / ARCHIVE), **Difficulty, Category**.
- Tab **Organiser**:
  - **Game · play order** (mục đầu tiên): danh sách level game chơi, đúng thứ tự LEVEL 1, 2, … Lấy được level từ **mọi chapter** (hộp thoại **+ Add levels** có ô chọn chapter). Kéo thả hoặc ↑ ↓ để đổi thứ tự, × để bỏ khỏi game. **Save play order** ghi `levels/game.json`; game đọc file này.
  - Khi hộp thoại Add levels đang mở, chỉ danh sách trong hộp thoại cuộn được; trang phía sau đứng yên.
  - Bên dưới là các collection của chapter đang mở (như trước), có hộp thoại Add levels (Add all levels / Add selected levels, ô tìm kiếm, "N selected").
  - Mỗi dòng có **ảnh thu nhỏ của level** (dây và bóng của nó) và ô **Tutorial**: không có / Tap a dot / Bumping / Pinch to zoom. Đổi tutorial rồi bấm Save thì tutorial được ghi vào file level đó (kèm bản lưu cũ trong `.versions`).
- **Level nào vào game, theo thứ tự nào:** `levels/game.json`, sửa trong Organiser → Game · play order. Mỗi mục là `chapter/id` (hoặc `chapter/*` = cả chapter theo collection đầu tiên của nó). Bản build của game chứa **đúng và chỉ** các level này, theo thứ tự này (ô chọn level của bản dev cũng chỉ liệt kê chúng). Nếu không có file này, game dùng `src/game/playlist.ts` (dự phòng). Khi chạy `npm run dev`, lưu play order hoặc một level trong danh sách là trang game tải lại (editor không bị tải lại).
- **Đưa level vừa sửa lên game trên web:** sửa level trong editor (đã chọn thư mục project), bấm **Save**, rồi chạy `npm run publish:levels` trong thư mục project. Lệnh này:
  1. kiểm tra đang ở nhánh `main`, không thiếu commit nào từ GitHub, và chỉ có file trong `levels/` thay đổi (có file khác thay đổi thì dừng và liệt kê);
  2. kiểm tra mọi level trong danh sách chơi: đọc được, không có cảnh báo ở Level checks, giải được (level nào hỏng thì dừng và báo tên level, LEVEL mấy);
  3. commit các file level đã đổi, push lên GitHub và build lại bản mới nhất của trang web. Khoảng 1 phút sau game trên web có level mới.

  `npm run publish:levels -- --dry-run` chỉ kiểm tra, không commit hay đưa gì lên web. Trên máy, `npm run dev` thì game ở http://localhost:8080/ tự tải lại mỗi lần Save (bắt đầu lại từ LEVEL 1).

## 4. Kiểm tra level (mức C)

- **Level checks**: các cảnh báo ở mục 1.3.
- **Play**: chơi thử ngay trong editor (mục 5).
- **Simulation**: bộ giải tự tìm thứ tự gỡ, cho biết level giải được không, và các chỉ số tham khảo: số cặp mở / bị chặn lúc đầu, **Min rounds** (số lượt tối thiểu nếu mỗi lượt gỡ hết các cặp đang mở, tức độ dài chuỗi chặn dài nhất). Ô "Solve order" đánh số thứ tự gỡ lên từng dây. Cách quy đổi ra "độ khó": _TBD_.
- **Mô hình chặn** (dùng chung cho editor và game): hạt chạy dọc dây bị chặn khi tâm một hạt của cặp khác cách dây nhỏ hơn tổng 2 bán kính. Dây không bao giờ chặn. Gỡ một cặp chỉ làm bớt vật chặn, nên level giải được khi và chỉ khi cứ gỡ lần lượt các cặp đang mở là dọn sạch board.

## 5. Chơi thử

- Nút **Play** mở game Phaser của project đè lên editor, đọc **thẳng file level JSON của editor** (không chuyển đổi).
- Ưu tiên mở **level đang mở trong editor**, kể cả thay đổi chưa lưu.
- Có **cheat chọn level**: menu trong game để nhảy sang level khác trong folder.
- Có nút quay lại editor và nút chơi lại.

## 6. Giao diện (mặc định cố định)

Logo Athena (cam trên theme tối, đen trên theme sáng); tông màu theo mẫu Fish Ball; theme tối/sáng có nút Theme, nhớ lựa chọn. Bố cục: danh sách level bên trái, vùng làm việc ở giữa, Inspector bên phải; các panel thu gọn và kéo giãn được, nhớ trạng thái.

## Câu hỏi mở

| Câu hỏi | Trạng thái |
|---|---|
| Loại obstacle trong tương lai | _TBD_ |
| Bảng mục tiêu độ khó của generator (mục 2.1) | _TBD_ (đang dùng quy tắc tạm) |
| Quy tắc đề xuất số cặp / số màu theo độ khó | _TBD_ |
| Cách generator tạo đường giao nhau | _TBD_ |
| Cách tính độ khó từ kết quả mô phỏng | _TBD_ |

## Chapter 6: gen lại các level của game

`npm run levels:chapter6` gen lại **mọi level trong Play order** (`levels/game.json`) từ ảnh gốc của từng level (PNG được trace như editor, SVG đọc bằng `parseSvg`) bằng generator hiện tại (bóng bự từ vòng vẽ bằng nét, tô màu theo nhóm tông) và lưu vào `levels/chapter-6/`: file level, ảnh gốc (`<id>.png` / `.svg`), collection "Main" theo đúng thứ tự Play order. Mỗi level giữ tên, tutorial và category; dây chéo X/T của level tutorial được làm lại đúng số lượng. Level gốc ở chapter cũ và `levels/game.json` không bị đổi; chạy lại lệnh thì chapter 6 được viết lại từ đầu. Chỉ gen lại vài level: `npm run levels:chapter6 -- level-9 c5-029-rose` (các level khác của chapter 6 giữ nguyên). SVG được đọc như trình duyệt vẽ: nhóm `<g>` lồng nhau với `transform` (matrix, translate, scale, rotate, skew) và độ dày nét kế thừa; thành phần chưa đọc được (`use`, `image`, `text`) được in ra để biết.

