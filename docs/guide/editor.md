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

Bắt buộc: `schema`, `version`, `id`, `name`, `pairs` (mỗi cặp: `id`, `color`, `a`, `b`, `path`). Điểm đầu và cuối của `path` trùng với tâm `a` và `b`. `source` chỉ có khi level được tạo từ ảnh.

### 1.3 Cảnh báo (Level checks)

- Cặp thiếu hạt, hoặc dây không nối đủ 2 đầu.
- Hai hạt chồng lên nhau ngay từ đầu.
- Màu không nằm trong bảng màu.
- **Level không giải được:** không có thứ tự gỡ nào dọn sạch board.
- (Thông tin) Những cặp đã có đường thông ngay từ đầu.

## 2. Tạo level

### 2.1 Generate từ hình ảnh

1. Designer đưa vào một ảnh line art: nét đen trên nền trắng, kiểu vẽ một nét liền (ví dụ viên kẹo).
2. Editor **nhận diện chính xác** nét vẽ, kể cả đoạn xoắn và cong gắt, và chuyển thành đường cong.
3. Editor cắt các đường thành **N cặp** (mỗi đoạn là một dây, 2 đầu là 2 hạt) và tô **M màu** từ bảng màu.
4. **Đường giao nhau** do generator tự tạo thêm (không lấy từ ảnh), để tạo thế chặn nhau giữa các cặp.
5. **Level tạo ra luôn giải được**: generator dùng bộ giải (mục 4) để kiểm tra, không đạt thì tạo lại.

Đầu vào designer đặt: ảnh, số cặp N, số màu M. Editor **đề xuất** N và M theo độ khó mong muốn; quyết định cuối là của designer. Độ dài dây không giới hạn; cặp cùng màu được nằm gần nhau.

Quy tắc đề xuất N và M theo độ khó: _TBD_. Quy tắc tạm đang dùng: độ khó d (1–5) → `6 + 4d` cặp, `2 + d` màu.

Cách generator tạo đường giao nhau: _TBD_. Quy tắc tạm đang dùng: khoảng 70% số cặp lấy từ nét trong ảnh, 30% là cặp "cắt ngang" nối 2 điểm trên 2 dây khác nhau bằng một đường cong. Mỗi cặp cắt ngang chỉ được giữ nếu level vẫn giải được. Nếu ảnh không đủ chỗ, editor tạo ít cặp hơn số yêu cầu và ghi rõ dưới nút Generate.

### 2.2 Vẽ và chỉnh tay

- **Thêm cặp:** chọn điểm đầu, điểm cuối, rồi vẽ dây tự do bằng chuột. Editor tự làm mượt thành đường cong mượt nhất, sau đó designer nắn lại bằng điểm neo và tay cầm (như chỉnh path SVG).
- **Snap kiểu Figma:** khi kéo hạt hoặc điểm neo, hiện đường gióng và hút vào để thẳng hàng ngang/dọc với các hạt khác.
- **Chọn một hoặc nhiều dây** (click, Shift-click, kéo khung) để di chuyển, copy, xoá, đổi màu.
- Chỉnh bán kính từng hạt, đổi màu từng cặp trong Inspector.
- Undo / Redo.

## 3. Lưu dữ liệu và quản lý level

- Nơi lưu: **folder trên máy** (File System Access API, chỉ Chrome/Edge) hoặc **Browser storage** để thử.
- Mỗi level giữ **3 bản cũ gần nhất**; có bản nháp tự lưu.
- Cấu trúc folder:

```
<folder gốc>/
  levels/<id>.json                level
  levels/<id>.png                 ảnh gốc dùng để generate (nếu có)
  levels/.versions/<id>/          3 version gần nhất
  drafts/current.json             bản nháp tự lưu
  collections.json                danh sách collection
  collections/<Tên>/NNN_<id>.json bản copy theo thứ tự chơi
```

- Import không bao giờ ghi đè: trùng id thì đặt id mới (`-2`, `-3`...). Xoá có hỏi xác nhận. Đổi id thì file, lịch sử và collection chứa level đổi theo; id trống hoặc đã tồn tại bị từ chối.
- Thông tin mỗi level: **Name, Id, Status** (WIP / PROD / ARCHIVE), **Difficulty, Category**.
- Tab **Organiser**: sắp level thành collection theo thứ tự chơi, có hộp thoại Add levels (Add all levels / Add selected levels, ô tìm kiếm, "N of M selected").

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
| Quy tắc đề xuất số cặp / số màu theo độ khó | _TBD_ |
| Cách generator tạo đường giao nhau | _TBD_ |
| Cách tính độ khó từ kết quả mô phỏng | _TBD_ |
