# OpenClipart line art (chapter 5 inputs)

All images come from [OpenClipart](https://openclipart.org), which releases every clipart into the
public domain ("All Clipart are Released into the Public Domain", unlimited commercial use:
https://openclipart.org/share). Downloaded 2026-11-18. Used only as input drawings for the level
generator (`npm run levels:chapter5`).

| File | Title | Author | Source |
|---|---|---|---|
| 01_pumpkin | Pumpkin Coloring Page | pianoBrad | https://openclipart.org/detail/187791/pumpkin-coloring-page |
| 02_bunny | bunny - outline | frankes | https://openclipart.org/detail/213606/bunny-outline |
| 03_imaginary-flower | Imaginary Flower Head | teck5 | https://openclipart.org/detail/352740/imaginary-flower-head |
| 04_simple-flower | Simple Flower Head Lineart | teck5 | https://openclipart.org/detail/352672/simple-flower-head-lineart |
| 05_christmas-tree | Christmas Tree Coloring Page | pianoBrad | https://openclipart.org/detail/187781/christmas-tree-coloring-page |
| 06_butterfly | Simple Detailed Butterfly Lineart | teck5 | https://openclipart.org/detail/352671/simple-detailed-butterfly-lineart |
| 07_hurricane-lamp | Hurricane Lamp | Gerald_G | https://openclipart.org/detail/8443/hurricane-lamp |
| 08_fall-leaves | Fall Leaves Coloring Page | pianoBrad | https://openclipart.org/detail/187784/fall-leaves-coloring-page |
| 09_christmas-bear | Christmas Bear Coloring Page | pianoBrad | https://openclipart.org/detail/187792/christmas-bear-coloring-page |
| 10_dog-ilio | Coloring Book Dog - Ilio | FunDraw_dot_com | https://openclipart.org/detail/5520/coloring-book-dog-ilio |

Batch 2 (downloaded 2026-11-18), picked with the stroke-width and detail-size rules in
`research/image_requirement.md` (even strokes like 01_pumpkin / 06_butterfly, no tiny details):

| File | Title | Author | Source |
|---|---|---|---|
| 11_mouse | Simple Cartoon Mouse, version for coloring | zapyon | https://openclipart.org/detail/333796 |
| 12_rocket | Rocket 11 (outline) | Firkin | https://openclipart.org/detail/301370 |
| 13_drum | Surdo outline | m1981 | https://openclipart.org/detail/289709 |
| 14_christmas-tree-2 | Christmas tree 6 (outline) | Firkin | https://openclipart.org/detail/304732 |
| 15_toy-airplane | Airplane with propeller - outline | spacefem | https://openclipart.org/detail/228075 |
| 16_palm-tree | Palm tree 7 (outline) | Firkin | https://openclipart.org/detail/301070 |
| 17_usb-stick | USB Key | lmproulx | https://openclipart.org/detail/29129 |
| 18_vase-twist | Vase 36 line drawing | Firkin | https://openclipart.org/detail/277677 |
| 19_angel | Angle 9 (outline) | Firkin | https://openclipart.org/detail/301825 |
| 20_dancer-swirl | Dancer 3 line drawing | Firkin | https://openclipart.org/detail/277215 |
| 21_dancer-hat | Dancer 11 line drawing | Firkin | https://openclipart.org/detail/277223 |
| 22_dancer-kimono | Dancer 15 line drawing | Firkin | https://openclipart.org/detail/277227 |
| 23_dancer-wave | Dancer 21 line drawing | Firkin | https://openclipart.org/detail/277266 |
| 24_dancer-parasol | Dancer 27 line drawing | Firkin | https://openclipart.org/detail/277272 |
| 25_dancer-shell | Dancer 29 line drawing | Firkin | https://openclipart.org/detail/277274 |
| 26_dancer-veil | Dancer 35 line drawing | Firkin | https://openclipart.org/detail/277280 |
| 27_dancer-fan | Dancer 37 line drawing | Firkin | https://openclipart.org/detail/277282 |
| 28_dancer-scarf | Dancer 45 line drawing | Firkin | https://openclipart.org/detail/277304 |
| 29_rose | Rose outline | Firkin | https://openclipart.org/detail/281715 |
| 30_glass-poppy | Poppy | warszawianka | https://openclipart.org/detail/22517 |
| 31_cupcake-ghosts | Cake 16 | Firkin | https://openclipart.org/detail/289800 |
| 32_cupcake-hats | Cake 12 | Firkin | https://openclipart.org/detail/289796 |
| 33_ice-cream-cone | Ice cream line art | mvolz | https://openclipart.org/detail/273240 |

Files: `NN_<name>.png` (OpenClipart's PNG, 800 px on the long side) and `NN_<name>.svg` (original
vector). Most SVGs draw lines as filled shapes, so the generator traces the PNG instead.
