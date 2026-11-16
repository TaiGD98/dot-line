# Game Design Document

**Dot Line** · Game Design Document · tracks build `latest` (see [Changelog](./changelog))

This document describes what Dot Line is, how it plays, and why it is built the way it is. At this stage the GDD is the target design and the code has not caught up yet: features marked Coming soon are not in the game. Once a feature ships, its numbers come from the code.

## How to read this document

Each feature carries a status:

| Badge | Meaning |
|---|---|
| <Badge type="tip" text="Live" /> | In the current build and playable at [the demo](https://taigd98.github.io/dot-line/demo/). |
| <Badge type="warning" text="Coming soon" /> | Designed or planned, **not in the game yet**. Details may change before it ships. |

Coordinates and sizes are in **world pixels** on the 780 × 1688 game canvas (2× a 390 × 844 pt phone screen).

## Contents

| Part | Chapters |
|---|---|
| **I. Vision** | [1. Overview](./overview) |
| **II. Gameplay** | [2. Core loop](./core-loop) · [3. Rules & mechanics](./rules) |
| **III. Production** | [4. Roadmap & open questions](./roadmap) · [5. Changelog](./changelog) |

## One-paragraph summary

Trên màn hình có nhiều cặp hạt cùng màu nối với nhau bằng dây; người chơi tap một hạt để nó chạy dọc theo dây về phía hạt còn lại của cặp. Chạm được nhau thì cặp đó vỡ tung và biến mất. Đụng hạt của cặp khác thì bị hủy, hạt quay về chỗ cũ và mất 1 tim. Dọn sạch mọi cặp để qua màn.
