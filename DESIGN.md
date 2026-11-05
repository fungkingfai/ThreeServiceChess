# 三軍棋 3D — 專案設計與規則規格（給團隊成員）

> 本文件是唯一權威規格。實作前必讀；遇規格未涵蓋處，以「好玩、清楚、公平」為原則自行決定，
> 並在 `README.md` 的「數位版調整」一節補記。

## 0. 目標

用 **three.js**（vanilla ES modules、無建置流程）做一款完整可玩的台灣傳統 **三軍棋（陸海空三軍棋）**：

- 13×13 棋盤，北／南兩塊陸地夾著中間海洋；環形鐵路跨海相連；錨點、機場、行營、三座城門軍旗。
- 每方 **30 枚棋子**（種類各一），含隱藏資訊（對手看不到棋種）、裁判式戰鬥判定。
- **AI 對手**（可選難度），會自行佈陣、會依已知情報推理作戰。
- 3D 棋子造型**各有特色且美觀**、動畫、音效（可選）、完整詳細規則頁。
- 玩家操作：點選棋子 → 顯示合法落點 → 點擊移動／攻擊。
- 最終交付：靜態網站（`index.html`），以 `python3 -m http.server` 即可遊玩；推上 GitHub。

參考資料：
- 維基百科「三軍棋」<https://zh.wikipedia.org/wiki/%E4%B8%89%E8%BB%8D%E6%A3%8B>（勝負表即由此解析）
- 臺史博典藏棋盤紙 2010.031.0527.0002 <https://collections.nmth.gov.tw/CollectionContent.aspx?a=132&rno=2010.031.0527.0002>
- 痞客邦「話說棋盤遊戲之『攻位』系列(二)」規則說明

---

## 1. 棋盤（`src/core/board.js` 已實作，勿改座標約定）

- `COLS=13, ROWS=13`，node id = `row*13+col`。
- 分區：北陸 `row 0..4`、海洋 `row 5..7`、南陸 `row 8..12`。玩家默認 **南軍**，AI **北軍**。
- 世界座標：`x = col-6`, `z = row-6`（北 = 負 z）。棋子放 `y≈0.28`，飛機在 `y≈1.1`。
- 節點 `kind`：`normal` / `gate`（城門，每方 3：北 (2,0)(6,0)(10,0)、南 (2,12)(6,12)(10,12)）/ `camp`（行營，每方 2：北 (1,3)(11,3)、南 (1,9)(11,9)）/ `airport`（四角 (0,0)(12,0)(0,12)(12,12)）/ `anchor`（北 row5、南 row7 的 col 1,4,6,8,11）/ `bridge`（跨海鐵橋站：col 0/12，row 5..7）。
- `rail` 車站：北 row2 全部、南 row10 全部、以及 col 0/12 的 row2..10。鐵路邊在 `RAIL_ADJ`。
- 地面行走（陸軍）：`WALK_ADJ`（8 方向，同為陸地、非機場；可行經城門／行營／鐵路站）。
- 海上航行（海軍）：`SEA_ADJ`（8 方向，海域節點、不含鐵橋站；錨點可進）。
- 鐵路移動：`RAIL_ADJ`（沿鐵路 1~3 站，不可穿越佔用車站；跨海鐵橋存在故跨海至少需 2 回合）。
- 海岸關係：`SEA_TO_LAND`（海節點→相鄰海岸陸節點）、`LAND_TO_SEA`（陸→相鄰海節點）。
- 佈陣區：`DEPLOY_ZONES[side] = { allLand, coastal, gates, anchors, airports }`。
  - `allLand`：該方全部陸地節點（排除機場、城門）→ 一般陸軍／地雷／陷阱可佈。
  - `coastal`：該方海岸列（北 row4、南 row8）→ 炮壘限定。
  - `gates`：軍旗限定。`anchors`：海軍限定。`airports`：空軍限定。
- 空中航線：棋盤全部節點，正交直線（`airLine()`、`airDirection()`、`gridDistance()`）。
- 行營：營內棋子不受 **敵方陸軍** 攻擊（海軍砲擊、空軍轟炸仍可）。海軍登陸、空軍攻擊不受此限。
- 城門：軍旗只能在城門；任何棋子（含飛機、砲擊、登陸）攻擊到軍旗即獲勝；飛彈不可攻擊城門／機場。

## 2. 棋子（`src/core/pieces.js` 已實作）

每方 30 枚，種類各一。`combatKey = name` 對應 `combat-table.json`。

官兵階級：總司令 > 兵團司令 > 軍長 > 師長 > 團長 > 營長 > 連長 > 排長 > 騎兵 > 步兵 > 工兵。
武器：地雷、陷阱、炮壘（不可移動）；毒氣、飛彈、炸彈、原子炮、坦克車、大炮、高射炮、機關鎗（可移動）。
海軍：主力艦、巡洋艦、炮艦、驅逐艦、潛水艇。
空軍：戰鬥機、偵察機。軍旗。

### 2.1 佈陣

- 官兵＋可動武器：本方 `allLand` 任一節點（含城門）。
- 地雷／陷阱：本方 `allLand` 任一節點（含城門，可作誘餌）。
- 炮壘：本方 `coastal` 任一節點。
- 軍旗：本方 3 座城門之一。
- **城門誘餌**：三座城門都可佈置任何陸軍棋子（一門一格，共 3 枚）。敵方只能看到「城門上有棋背」，
  無法確定哪座是軍旗；建議三門全放（軍旗＋2 誘餌）。城門位置對敵方隱藏，除非被偵察、攻破或總司令陣亡。
- 海軍 5 艘：本方 5 個錨點（一對一）。
- 空軍 2 架：本方 2 個機場。空軍棋子 **永遠公開**（飛行器可見，屬數位版調整）。

### 2.2 移動／行動（每回合選一枚棋做一件事）

| 類型 | 規則 |
|---|---|
| 陸軍（可動） | 走到相鄰陸地節點 1 步（8 方向）；或沿鐵路走 1~3 站（不能穿過被佔用車站）。 |
| 海軍 | 走到相鄰海域節點 1 步（8 方向）；或特殊行動：砲擊／兩棲登陸。 |
| 空軍 | 選一正交方向直線飛 1 格以上，途中不可轉彎；可停在空節點或攻擊該線上任一敵棋（等同飛到目標格戰鬥）。 |
| 地雷／陷阱／炮壘／軍旗 | 不可移動；炮壘另有「砲擊」行動。 |

### 2.3 特殊行動

- **鐵路移動**：陸軍（含可動武器）在本方鐵路站或經鐵路抵達的站上，可沿鐵軌移動 1~3 站。
  不可穿過有棋子的站；若目標站有敵棋則發生戰鬥（戰鬥後若勝則佔領該站）。
- **炮壘砲擊**（`fire`）：炮壘可攻擊 `LAND_TO_SEA` 相鄰海域的敵艦，不移動。
  戰力以「炮壘」代入勝負表（防守方 = 敵艦）；對潛水艇 = 不分勝負；對炮艦＝攻擊者勝（炮壘先攻勝）。
- **炮艦砲擊**（`bombard`）：炮艦可攻擊 `SEA_TO_LAND` 相鄰海岸的敵方陸上棋子，不移動。
  戰力：對官兵視為「營長」、對武器視為「炮壘」（攻擊炮壘時炮艦勝）；可攻擊行營內棋子（海軍不受行營保護限制）。
- **兩棲登陸**（`land`）：主力艦／巡洋艦可從海域移動到相鄰海岸陸地節點。
  空地→登陸成功；敵棋→以登陸戰力（主力艦：官兵比師長、武器比坦克車；巡洋艦：官兵比團長、武器比大炮）判定，
  勝則登陸佔領、敗則艦毀；平手則同歸於盡。登陸後該棋成為陸上棋子（`landed=true`，不再能下海），但可繼續用陸上規則行動。
- **防空攻擊**（`antiair`）：高射炮可攻擊 `gridDistance ≤ 2` 的敵機（戰鬥機／偵察機），不移動；以「高射炮」代入勝負表。
  炮艦同樣可攻擊 `gridDistance ≤ 2` 的敵機。
- **飛彈轟擊**（`missile`）：飛彈不移動，沿同一行／列（空中航線）直線攻擊任意距離的敵棋，可越過任何棋子；
  不可攻擊城門、機場；不能用於攻擊行營保護？→ **可以**（飛彈從空中攻擊，不受行營限制）。
  判定：以「飛彈」代入勝負表（幾乎同歸於盡；陷阱勝、飛彈亡）。發射後飛彈必定消滅（除結果為陷阱時也是飛彈亡、陷阱存）。
- **偵察**（`recon`）：偵察機可偵察同一行／列直線上的任一敵棋（不需移動），使其對己方曝光（`revealed[side]=true`）。
  偵察機無戰鬥力；若被攻擊則依勝負表（敗於戰鬥機、高射炮、炮艦；與飛彈同歸於盡；對地雷／陷阱無效）。
- **反飛彈**：戰鬥機若移動到飛彈所在格可攻擊（勝）；飛彈遭戰鬥機攻擊會被消滅。
- **空軍禁攻城門**（house rule）：戰鬥機／偵察機的移動目的地不可為城門節點；可飛越城門上空，但不可攻擊城門上的棋子、不可停在城門格。軍旗只能被陸軍（或登陸後部隊）攻破。偵察機仍可偵察城門上的棋子。
- **飛越擊落**（自動）：飛機沿直線移動時，若途中經過敵方高射炮或敵方炮艦所在節點（不含終點），立即被擊落（飛機消滅、防空方存活，該回合結束）。
- **敵機攔截**：戰鬥機可攻擊直線上敵機（同歸於盡/先攻勝依表）。偵察機不能攻擊。

### 2.4 戰鬥判定（核心）

勝負表 `src/core/combat-table.json`：

```js
{ names: [30 個中文名], matrix: { 防守方名稱: { 攻擊方名稱: 'A'|'D'|'B'|'N'|'R'|'X' } } }
```
- `A` = 攻擊方勝（守方消滅，攻方佔位/存活）
- `D` = 防守方勝（攻方消滅）
- `B` = 同歸於盡（雙方消滅）
- `N` = 不分勝負（雙方存活，攻擊方退回原處）
- `R` = 偵察（目標曝光，不戰鬥；只有偵察機造成）
- `X` = 無法作用（不相容的交互）

**伺服器／引擎的規則**：
1. 先以「實際棋子」查表：`matrix[defender.name][attacker.name]`。
2. 特殊映射（攻擊方是特種單位時）：
   - 兩棲登陸：攻方代打者 = `LANDING_PROFILE[攻方.key]`（官兵→該官階名、武器→該武器名，依守方類別選）。
   - 炮艦砲擊：攻方代打者 = `BOMBARD_PROFILE.gunboat`（同上選類）。
   - 炮壘砲擊：攻方代打者 = `炮壘`。
   - 高射炮／炮艦對空：攻方代打者 = `高射炮`。
   - 飛彈轟擊：攻方代打者 = `飛彈`。
3. 修正規則（覆寫 wiki 表之錯誤／特例）：
   - 工兵攻擊炮壘 ⇒ 工兵勝（`A`，炮壘消滅）；工兵攻擊炸彈 ⇒ 工兵勝。
   - 炮艦攻擊炮壘／炮壘攻擊炮艦 ⇒ 攻擊者勝。
   - 敵方陸軍不得攻擊行營內的棋子（合法行動生成時直接排除，含鐵路抵達行營）。
   - 軍旗被任何敵棋攻擊 ⇒ 直接勝利（不論攻方棋種、是否同歸於盡；`outcome='FLAG'`）。
   - 飛彈不可選城門／機場為目標。
   - 潛水艇被飛彈、炮壘、戰鬥機攻擊 ⇒ `N`（雙方無損；飛彈則落空消滅）。勝負表已有，若為 X 則以 `N` 處理。
   - `X` 在合法行動中不允許出現（不生成該行動）。
4. 戰鬥後：若攻方勝或同歸於盡後攻方存活 → 佔領目標格。若 `D` 或 `N` → 攻方留在原格（不移動）。
   `B` → 雙方都消滅。`R` → 攻方不移動（偵察機原地），目標曝光。
5. 曝光：
   - 戰鬥參與雙方對彼此（及雙方玩家）公開棋種（數位版調整；設定可關）。
   - 偵察機偵察：目標對偵察機擁有者公開。
   - 總司令陣亡：其擁有者的軍旗城門位置對敵方公開。
   - 空軍棋子永遠公開。
   - AI 只能使用它「應該知道」的資訊（見 §4）。

### 2.5 勝負

- 奪得敵方軍旗 → 勝。
- 若一方所有棋子皆無法行動（全為不可動棋子），該方輸（無子可動）。
- 雙方連續無法行動 → 和局。
- 另設「投降」按鈕。

### 2.6 回合流程

1. `sideToMove` 選一枚己方棋執行一個合法行動（或 pass）。
2. 引擎套用行動 → 產生事件（移動／戰鬥／曝光／勝利…）。
3. 換手；若對方為 AI → AI 思考後行動。
4. 每步都檢查勝負。

---

## 3. 技術架構與檔案分工（重要：不要改別人的檔案）

```
sanjunqi/
  index.html                  Lead
  styles.css                  UI
  src/main.js                 Lead（遊戲控制器、輸入、回合流程、整合）
  src/core/board.js           Lead（已完成，勿改）
  src/core/pieces.js          Lead（已完成，勿改）
  src/core/combat-table.json  Lead（已完成，勿改）
  src/core/rng.js             Lead（提供；任何人不得改）
  src/core/engine.js          RULES  （遊戲狀態、合法行動、判定、部署、勝負）
  src/core/combat.js          RULES  （勝負表查詢＋特殊映射）
  src/core/legal-moves.js     RULES  （合法行動產生）
  tests/core.test.mjs         RULES  （node --test 或 node 直跑；不得依賴瀏覽器）
  src/ai/ai.js                AI     （AI：佈陣、決策、難度）
  src/ai/belief.js            AI     （隱藏資訊推理；可選）
  src/render/*.js             3D     （scene/board/pieces/effects/anim；只依賴 three + core 資料）
  src/ui/*.js                 UI     （DOM overlay：選單/HUD/規則頁/戰鬥結算/日誌/設定）
  content/rules.html          UI     （詳細規則頁內容，可注入 modal）
  tests/e2e.mjs               Lead   （Playwright 端對端、截圖）
  README.md                   Lead
```

- 所有模組用 **ES modules**，瀏覽器 import map 映射 `three` → `vendor/three/three.module.js`，`three/addons/` → `vendor/three/addons/`。
- 禁止 npm 依賴、禁止 build step、禁止外部 CDN（離線可玩）。
- 中文註解、程式碼風格簡潔一致。
- 不要修改 `index.html` 的 importmap（Lead 負責）。
- 若需新增檔案，請用自己 scope 內的檔名。

### 3.1 `src/core/engine.js` API（RULES 必須實作；其他人只讀）

```js
export function createGame(options = {}) -> Game
// options: { seed?: number, revealOnBattle?: boolean, autoDeploy?: boolean }

Game 物件（大部分 method 回傳值皆為純資料，不得含 three.js / DOM）：
game.state            // 權威狀態（AI 模擬用；一般 UI 請用 getView）
game.idCounter
game.deploy(side, placements)     // placements: [{ pieceKey, nodeId }]，回傳 {ok, errors}
game.autoDeploy(side)             // 自動佈陣（合法、有基本戰術考量），回傳 placements
game.startPlay()                  // 檢查雙方佈陣完成 → phase='play'，sideToMove='north'
game.getView(side)                // 給某方看的視圖：
//   { phase, turn, sideToMove, winner, winnerReason, flagRevealed:{north,south},
//     pieces: [{uid, side, key|null(hidden時), name|null, branch, nodeId, alive, revealed, landed, ...}],
//     log: [...], lastEvent, deploy: {north:boolean,south:boolean} }
game.getLegalActions(side)        // [{ type, pieceUid, from, to, path?, target?, ... }]
game.applyAction(side, action)    // 套用；回傳 { ok, events:[...], winner?, error? }
game.getActionsForPiece(side, uid) // 供 UI 高亮
game.canAct(side)                 // 是否有任何合法行動
game.pass(side)                   // 換手
game.snapshot() / game.restore(snapshot) / game.clone() // AI 模擬用（深拷貝狀態）
game.getPublicInfo()              // 給 HUD：各軍種存活數、被消滅棋子清單等
```

事件格式（`events`，供 UI/3D 動畫依序播放）：
```js
{ type:'move', uid, side, from, to, path:[nodeId...], mode:'walk'|'rail'|'sea'|'air'|'land' }
{ type:'battle', attackerUid, defenderUid, from, to, outcome:'A'|'D'|'B'|'N'|'R'|'FLAG', reveal:[{uid,key}], eliminated:[uid...], occupied:boolean, special?:'landing'|'bombard'|'fort'|'antiair'|'missile'|'air'|'rail'|'campProtect' }
{ type:'reveal', uid, toSide, source:'battle'|'scout'|'commander'|'public' }
{ type:'flagExposed', side } // 總司令陣亡
{ type:'win', winner, reason }
{ type:'pass', side, auto?:boolean }
{ type:'deploy', side }
```

合法行動格式：
```js
{ type:'move', pieceUid, from, to, path:[...], mode:'walk'|'rail'|'sea'|'air'|'land' }
{ type:'fire', pieceUid, from, target }        // 炮壘
{ type:'bombard', pieceUid, from, target }     // 炮艦
{ type:'land', pieceUid, from, to }            // 兩棲登陸（to 可為敵棋所在格）
{ type:'antiair', pieceUid, from, target }     // 高射炮/炮艦
{ type:'missile', pieceUid, from, target }     // 飛彈轟擊
{ type:'recon', pieceUid, from, target }       // 偵察機
{ type:'pass' }
```
（`move` 若目標格有敵棋，即為攻擊；引擎自動判定。）

### 3.2 `src/render` API（3D 必須實作；main.js 只依賴這介面）

```js
export function createView(container, { board, pieces }) -> View
View 方法（皆回傳 Promise 或立即）：
  await view.ready()                    // 資源就緒（無外部資源可 resolve 立即）
  view.setPerspective(side)             // 玩家視角（'south' 相機在南側）
  view.sync(state)                      // 依 getView() 結果重建/更新棋子（隱藏棋顯示棋背）
  view.setInteractive(bool)
  view.onNodePick(cb)                   // cb(nodeId)
  view.onPiecePick(cb)                  // cb(uid|null)
  view.highlightNodes(nodeIds, kind)    // kind: 'move'|'attack'|'deploy'|'danger'|'intel'
  view.clearHighlights()
  view.setSelected(uid|null)
  view.setDeployMode(bool, { side, placed }) // 佈陣時顯示可佈區
  view.animateEvents(events) -> Promise // 依序播放 move/battle/reveal/win 等（不阻塞遊戲狀態）
  view.cinematicBattle(event) -> Promise
  view.showBanner(text, ms?)            // 3D 內浮動文字（可選）
  view.focus(nodeId)                    // 相機聚焦（可選）
  view.setSideColors({south:{...},north:{...}})
  view.syncIntel(state)                 // 已被偵察/曝光資訊的視覺提示
  view.dispose()
```
- 渲染器 **不得** 自行決定遊戲規則；一切以 `getView()` / `events` 為準。
- 棋子隱藏時：顯示該軍種棋背（陸／海／空徽記 + 陣營色），不得顯示棋種。
- 布局：棋盤 `x∈[-7,7], z∈[-7,7]`，中央 (0,0)。桌面 + 柔和環境。相機初始 `(0, 12.5, 14)` 看向棋盤中心。
- 效能：60 棋子 + 169 節點 + 燈光 → 60fps；重用幾何／材質；限制 shadow map 大小。
- 造型要求：**30 種棋子都要有辨識度高的 3D 造型**（官兵：立姿軍官/騎兵/步兵/工兵小雕像；武器：坦克、大炮、高射炮、炮壘、地雷、陷阱、毒氣雲、飛彈、炸彈、原子炮、機槍；海軍：主力艦、巡洋艦、炮艦、驅逐艦、潛艇；空軍：戰鬥機、偵察機；軍旗：旗座）。以程序化幾何＋CanvasTexture 中文標籤完成，不需外部模型檔。
- 精緻度：PBR 材質、輪廓光、棋子底部圓形徽章、移動/攻擊動畫、粒子爆炸、鏡頭震動、Bloom（vender 已附 EffectComposer/UnrealBloomPass）、環境霧、選擇光環。

### 3.3 `src/ui` API（UI 必須實作；main.js 依赖這介面）

UI 用 DOM overlay，不碰 three.js。以 `createUI(deps)` 回傳物件，deps 由 main.js 提供 callback。
UI 需自行完成的畫面：
1. **主選單**：標題「三軍棋」、副標「陸・海・空 三軍立體戰場」、按鈕（開始遊戲／規則說明／設定／棋子圖鑑）、3D 場景當背景。
2. **佈陣畫面**：左側棋子托盤（30 枚，依軍種分組；已放置變灰）、右側提示、「自動佈陣」「重新佈陣」「開始戰鬥」；點棋子→點棋盤放置（main.js 協調）。
3. **對戰 HUD**：回合數、輪到誰、我方／敵方剩餘棋子數（依軍種）、被消滅棋子欄、戰鬥日誌、目前選中棋子資訊卡、按鈕（規則／設定／投降／重新開始）。
4. **戰鬥結算**：雙方棋子卡翻開對決動畫（HTML）、結果文字、剷除提示；點擊或自動關閉。
5. **規則頁**：超詳細中文規則（棋盤、30 棋子一覽表、佈陣、移動、特殊行動、勝負表呈現、勝負、數位版調整、參考資料連結）。
6. **設定**：音效開關、戰鬥揭露開關、難度（簡單／普通／困難）、視角輔助。
7. **結束畫面**：勝／敗／和局、統計、再來一局。
8. Toast / 提示 / AI 思考指示。
樣式：深色軍事風、金／紅／綠點綴、中文字體（Noto Sans TC/system-ui）、玻璃質感面板、RWD（≥1024 為主）、不遮擋棋盤中央。
所有文案繁體中文（台灣用語）。

### 3.4 `src/ai/ai.js` API（AI 必須實作）

```js
export function createAI({ side, difficulty = 'normal', seed }) -> AI
ai.deploy(game) -> placements   // 回傳 [{pieceKey,nodeId}] 合法佈陣
ai.chooseAction(game) -> action // 依 game（必須用 game.getView(side) 的資訊！不可偷看隱藏棋）
```
- AI 不得直接使用 `game.state` 中敵方未曝光的 `key`（公平性）。可用 `game.getView(side)`、`game.getLegalActions(side)`、
  `game.snapshot()` 模擬「自己相信的世界」；模擬未知敵棋時，以 `belief.js` 由剩餘棋種取樣。
- 難度：easy（貪心＋隨機）、normal（期望值＋威脅評估）、hard（取樣世界 2-ply 搜尋）。
- 每步決策 < 1.5 秒（普通難度）。
- 佈陣需合理：軍旗藏城門、地雷陷阱守要道／城門、炮壘佈海岸、主力集中中線、空軍與海軍有效運用。

---

## 4. 隱藏資訊與 AI 公平性

- 玩家視圖：敵方陸／海棋子顯示「棋背」（僅知軍種：陸軍、海軍；空軍永遠公開）。
- AI 視圖：`game.getView('north')` 只給 AI 應知資訊；AI 需自行以 `belief` 推理未知棋。
- 曝光來源：戰鬥（雙方棋種公開，預設開）、偵察機、總司令陣亡（軍旗位置曝光）、空軍公開。
- 玩家看得到自己的所有棋子；AI 看得到自己的所有棋子。

## 5. 視覺與體驗需求（3D / UI 共同）

- 一進畫面就有氣勢：棋盤置中、環境光、三軍元素（陸地黃土、海洋深藍、天空）。
- 棋子點選：金色光環 + 棋名浮標 + 合法落點光點（可走=綠、可攻擊=紅、部署=藍）。
- 移動：平滑滑行 + 輕微彈跳；戰鬥：雙方棋子浮起、碰撞光爆、鏡頭輕震；陣亡：碎片粒子淡出。
- 軍旗被奪：慢鏡頭 + 旗幟動畫 + 全螢幕結算。
- 海洋有動態波紋（shader 或法線貼圖程序生成）；鐵路有金屬質感；機場有停機坪與螺旋槳動畫（可選）。
- 音效可用 WebAudio 程序合成（落子、戰鬥、爆破、勝利），預設開啟、可關。

## 6. 驗收標準

1. `python3 -m http.server 8123` 開啟頁面無 console error、無 404。
2. 主選單 → 佈陣（可自動）→ 開始 → 玩家可完整操作到勝利／失敗；AI 能自動佈陣並行棋。
3. 30 種棋子全部有獨特可辨識模型；棋背不洩漏棋種（空軍除外）。
4. 規則頁完整、正確；README 有玩法、操作、技術說明與參考資料。
5. Playwright 截圖（主選單／佈陣／對戰／戰鬥）正常。
6. 推送 GitHub `https://github.com/fungkingfai/ThreeServiceChess.git`（main 分支），含 `.gitignore`（排除 node_modules、research 暫存）。

## 7. 已知/刻意調整（寫入規則頁「數位版調整」）

- 棋盤以傳統棋盤為概念重繪為 13×13 對稱棋盤；海軍 5 錨點、空軍 4 機場、3 城門、2 行營、環形鐵路。
- 行營只擋陸軍攻擊；海軍砲擊、空軍、飛彈可攻擊營內棋子。
- **城門誘餌**：三座城門皆可佈置任何陸軍棋子（一門一格）；軍旗藏於其中一座，敵方無法單憑「哪座門有棋」判斷軍旗位置。
- **空軍禁攻城門**：飛機不可攻擊或停留在城門節點（可飛越）；軍旗只能被陸軍攻破。
- 空軍棋子公開；戰鬥參與棋子公開；偵察機情報永久保留。
- 每回合一步（與原版相同）。
- 鐵路每回合最多 3 站（與原版相同）；跨海因距離自然需在橋上停留。
- 移動採 8 方向方格移動（原版路線圖較複雜，為數位可讀性簡化）。
