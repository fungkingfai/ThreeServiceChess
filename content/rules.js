/**
 * 三軍棋規則頁內容（繁體中文・台灣用語）
 * ------------------------------------------------------------------
 * 此檔只放「敘述性內容」；資料驅動的表格（30 枚棋子、勝負表、棋盤圖、
 * 特殊戰力對照…）由 src/ui/rules.js 於注入時填入 data-widget 節點，
 * 確保棋子與勝負表只有 core 一份資料來源。
 *
 * 章節導覽由 rules.js 依 section[data-chapter] 自動產生。
 */

export const RULES_META = {
  title: '三軍棋規則大全',
  subtitle: '陸・海・空三軍棋｜台灣傳統軍棋・數位立體版',
  version: '數位版 v1.0',
  updated: '2026',
};

export const RULES_HTML = `
<div class="rules-doc" id="rules-doc">

  <section class="rules-section" id="rules-overview" data-chapter="遊戲概覽">
    <header class="rules-section__head">
      <span class="rules-section__no">01</span>
      <h2>遊戲概覽</h2>
      <p class="rules-section__lede">兩塊陸地、一片海洋、三十枚看不見底牌的棋子——先奪下對方軍旗的人獲勝。</p>
    </header>

    <div class="rule-callout rule-callout--gold">
      <div class="rule-callout__title">一句話認識三軍棋</div>
      <p>三軍棋是台灣相當流行的軍棋類遊戲，一般也稱「陸海空三軍棋」、「三軍戰鬥棋」。棋盤中央是海洋，南北兩塊陸地隔海相望、以兩側鐵橋相連；雙方各擁有陸、海、空三軍共 30 枚棋子，棋種對敵人隱藏，碰面時依「勝負表」判定生死，最后以奪取敵方軍旗定勝負。</p>
    </div>

    <div class="rule-stats">
      <div class="rule-stat"><span class="rule-stat__value">30</span><span class="rule-stat__label">每方棋子（種）</span></div>
      <div class="rule-stat"><span class="rule-stat__value">13×13</span><span class="rule-stat__label">棋盤節點</span></div>
      <div class="rule-stat"><span class="rule-stat__value">1</span><span class="rule-stat__label">每回合一個行動</span></div>
      <div class="rule-stat"><span class="rule-stat__value">3</span><span class="rule-stat__label">城門（軍旗／誘餌）</span></div>
      <div class="rule-stat"><span class="rule-stat__value">5</span><span class="rule-stat__label">錨點（海軍）</span></div>
      <div class="rule-stat"><span class="rule-stat__value">2</span><span class="rule-stat__label">機場（空軍）</span></div>
    </div>

    <h3>棋子的三大軍種</h3>
    <div class="rule-grid rule-grid--3">
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--army">陸</div>
        <h4>陸軍・23 枚</h4>
        <p>11 名官兵（總司令到工兵）＋ 11 種武器（地雷、飛彈、坦克車……）＋ 1 面軍旗。佔領陸地、守城門、沿鐵路調度，是棋局的主體。</p>
        <p class="rule-card__foot">部署：陸地兵站（含城門；炮壘限海岸、軍旗限城門）</p>
      </article>
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--navy">海</div>
        <h4>海軍・5 枚</h4>
        <p>主力艦、巡洋艦、炮艦、驅逐艦、潛水艇。航行於中央海域，可砲擊海岸、載運登陸，或與敵艦在海上一決勝負。</p>
        <p class="rule-card__foot">部署：沿岸 5 個錨點，一艦一點</p>
      </article>
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--air">空</div>
        <h4>空軍・2 枚</h4>
        <p>戰鬥機與偵察機。沿著棋盤的航線直線飛行，可以飛越任何地形與棋子；戰鬥機是幾乎所有地面單位的天敵，偵察機則能揭開敵棋真面目。</p>
        <p class="rule-card__foot">部署：棋盤角落的 2 座機場</p>
      </article>
    </div>

    <h3>遊戲目標</h3>
    <ul class="rule-list">
      <li><strong>奪旗勝利：</strong>任何一枚敵棋攻擊到對方軍旗所在的城門，立即獲勝——不論攻擊方最後是否同歸於盡。</li>
      <li><strong>無子可動：</strong>若一方所有棋子都無法行動（只剩不可移動的棋子），該方判負。</li>
      <li><strong>和局：</strong>雙方連續都無法行動時，以和局收場。</li>
      <li><strong>投降：</strong>數位版可隨時投降，直接結束棋局。</li>
    </ul>

    <div class="rule-callout">
      <div class="rule-callout__title">資訊隱藏：這是「裁判式」軍棋</div>
      <p>除了空軍棋子永遠公開之外，你看不到對手棋子的種類，只能看到「這是一枚陸軍」或「這是一枚海軍」。當兩枚棋子接觸時，由系統扮演裁判依勝負表判定，並公開參與該次戰鬥的棋種。因此，<strong>推理與心理戰</strong>和棋子強弱同樣重要。</p>
    </div>

    <h3>與本作（數位立體版）的關係</h3>
    <p>本作將傳統棋盤重繪為 <strong>13×13 的對稱棋盤</strong>，保留三軍棋的核心：南北陸地、中央海洋、環形鐵路、城門、行營、機場、錨點，以及 30 種棋子與勝負表。你執 <span class="inline-badge inline-badge--green">南軍・綠</span>，由 AI 操作 <span class="inline-badge inline-badge--red">北軍・紅</span>。詳細的數位化調整請見〈<a class="rule-link" href="#rules-digital">數位版調整</a>〉。</p>
  </section>

  <section class="rules-section" id="rules-history" data-chapter="歷史與源流">
    <header class="rules-section__head">
      <span class="rules-section__no">02</span>
      <h2>歷史與源流</h2>
      <p class="rules-section__lede">從上海的「陸海空軍棋」到台灣的三軍棋，一副棋盤裡藏著二戰後到冷戰初期的軍事想像。</p>
    </header>

    <h3>源流：陸海空軍棋 → 三軍棋</h3>
    <p>三軍棋是中國「陸海空軍棋」的改進版本。陸海空軍棋約在第二次世界大戰結束前出現在上海，由無錫人陸鐵民發明，是傳統「陸軍棋」的擴大版：除了陸軍官兵，還加入海軍軍艦與空軍飛機。戰後這套棋隨局勢傳入台灣，並在台灣發展出自己的版本。</p>
    <p>台灣版三軍棋與原版的差異主要在陸軍：<strong>取消了師長以下的旅長</strong>，提高了軍以上的「兵團司令」；同時增加了毒氣、原子炮、騎兵、坦克、大炮、陷阱、機關鎗等棋子。這項改動與二戰後各國以現代化裝備的「集團軍」取代以步兵為主的陸軍軍編制相互呼應。</p>

    <div class="rule-timeline">
      <div class="rule-timeline__item">
        <span class="rule-timeline__dot"></span>
        <div class="rule-timeline__body">
          <span class="rule-timeline__year">1930–40 年代</span>
          <h4>上海・陸海空軍棋問世</h4>
          <p>以陸軍棋為基礎，加入海軍艦艇與空軍飛機；同時期西方也有機制類似的 Tri-Tactics（1932）等軍棋。</p>
        </div>
      </div>
      <div class="rule-timeline__item">
        <span class="rule-timeline__dot"></span>
        <div class="rule-timeline__body">
          <span class="rule-timeline__year">戰後</span>
          <h4>傳入台灣・在地改版</h4>
          <p>增加兵團司令、毒氣、原子炮、騎兵、坦克、大炮、陷阱、機關鎗；刪去旅長，形成今日台灣三軍棋的樣貌。</p>
        </div>
      </div>
      <div class="rule-timeline__item">
        <span class="rule-timeline__dot"></span>
        <div class="rule-timeline__body">
          <span class="rule-timeline__year">1950 年代氛圍</span>
          <h4>冷戰初期的兵器縮影</h4>
          <p>主力艦排名第一、但實戰最強的是潛水艇；飛機最大的敵人仍是高射炮；原子炮是短暫存在的戰術核武器——整體反映二戰後到 1950 年代初的軍種與武器。</p>
        </div>
      </div>
      <div class="rule-timeline__item">
        <span class="rule-timeline__dot"></span>
        <div class="rule-timeline__body">
          <span class="rule-timeline__year">今日</span>
          <h4>台灣家庭與學校的經典棋戲</h4>
          <p>棋盤紙與規則在民間流傳，也見於博物館典藏；本作即以此傳統規則為基礎，重製為 3D 網頁遊戲。</p>
        </div>
      </div>
    </div>

    <h3>從棋子看時代</h3>
    <div class="rule-grid rule-grid--2">
      <article class="rule-card rule-card--plain">
        <h4>原子炮：短命的戰術核武</h4>
        <p>原子炮是以火炮發射原子彈頭的戰術核武器，在原子彈問世後曾短暫出現，之後被短程導彈取代。棋盤上的原子炮能擊敗幾乎所有武器與官兵，但碰到地雷、飛彈、炸彈會同歸於盡，遇到陷阱則自毀——正如核武「威力大、風險也大」。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>潛水艇：排名最後、戰力最強</h4>
        <p>海軍排序是主力艦、巡洋艦、炮艦、驅逐艦、潛水艇，但潛水艇能擊敗前三者，只敗給驅逐艦。若不算航空母艦，這樣的安排與二戰後海軍的現實大致相符——水面艦隊的霸主，往往栽在水下。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>高射炮：飛機的天敵</h4>
        <p>戰鬥機能擊敗棋盤上幾乎所有棋子，唯獨敗給高射炮與炮艦。飛機飛越敵方高射炮或炮艦上空時更會被直接擊落。這反映的是 1950 年代末空對空飛彈普及之前，防空火砲仍是飛機最大威脅的年代。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>兵團司令：集團軍的產物</h4>
        <p>台灣版把陸軍官階往上擴充到「兵團司令」，反映二戰後各國以現代化裝備的集團軍取代步兵為主的軍編制。官兵階級依序為：總司令、兵團司令、軍長、師長、團長、營長、連長、排長、騎兵、步兵、工兵。</p>
      </article>
    </div>

    <h3>與相關棋類的比較</h3>
    <div class="table-wrap">
      <table class="rule-table">
        <thead><tr><th>棋類</th><th>棋盤</th><th>軍種</th><th>隱藏資訊</th><th>勝負關鍵</th></tr></thead>
        <tbody>
          <tr><td><strong>三軍棋（本作）</strong></td><td>南北陸地＋中央海洋</td><td>陸・海・空三軍</td><td>棋種隱藏（空軍公開）</td><td>奪取軍旗</td></tr>
          <tr><td>陸軍棋</td><td>單一陸地、鐵路線</td><td>僅陸軍</td><td>棋種隱藏</td><td>奪取軍旗</td></tr>
          <tr><td>陸海空軍棋</td><td>陸海分區、鐵路相連</td><td>陸・海・空</td><td>棋種隱藏</td><td>奪取軍旗／大本營</td></tr>
          <tr><td>西洋軍棋（Stratego）</td><td>方格棋盤</td><td>步兵為主</td><td>棋種隱藏</td><td>奪取旗幟</td></tr>
        </tbody>
      </table>
    </div>

    <div class="rule-callout">
      <div class="rule-callout__title">參考資料</div>
      <p>歷史段落整理自維基百科「三軍棋」條目、臺史博典藏棋盤紙與痞客邦規則文章；完整連結請見〈<a class="rule-link" href="#rules-refs">參考資料</a>〉。</p>
    </div>
  </section>

  <section class="rules-section" id="rules-board" data-chapter="棋盤解剖">
    <header class="rules-section__head">
      <span class="rules-section__no">03</span>
      <h2>棋盤解剖</h2>
      <p class="rules-section__lede">13×13 節點，南北陸地各五列、中央海洋三列；一條環形鐵路把兩個戰場縫在一起。</p>
    </header>

    <h3>座標與分區</h3>
    <p>棋盤由 <strong>13 欄 × 13 列</strong>共 169 個節點組成。欄位以 <strong>A～M</strong> 由西向東標示，列以 <strong>1～13</strong> 由北向南標示。棋盤分成三個大區：</p>
    <ul class="rule-list">
      <li><span class="inline-badge inline-badge--red">北陸</span> 第 1～5 列：AI 北軍（紅方）的領地。</li>
      <li><span class="inline-badge inline-badge--blue">海洋</span> 第 6～8 列：海軍航行區，中央海域。</li>
      <li><span class="inline-badge inline-badge--green">南陸</span> 第 9～13 列：玩家南軍（綠方）的領地。</li>
    </ul>

    <figure class="rule-figure rule-figure--board">
      <div class="rule-figure__head">
        <span class="rule-figure__title">棋盤節點示意圖</span>
        <span class="rule-figure__hint">欄 A–M（西→東）・列 1–13（北→南）</span>
      </div>
      <div class="board-map-host" data-widget="board-map"></div>
      <figcaption>圓點與字母標記特殊節點；金色線條為鐵路，兩側縱貫線跨海形成環狀鐵道。此圖為概念示意，實際 3D 棋盤的節點位置與此一致。</figcaption>
    </figure>

    <div class="board-legend" data-widget="board-legend"></div>

    <h3>特殊節點</h3>
    <div class="rule-grid rule-grid--2">
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--gold">門</div>
        <h4>城門・每方 3 座</h4>
        <p>北軍在 <strong>C1、G1、K1</strong>，南軍在 <strong>C13、G13、K13</strong>。三座城門都可以放置陸軍棋子當作<strong>誘餌</strong>（一門一格）；軍旗必須藏在其中一座。城門位置對敵方隱藏，除非被偵察、攻破（戰鬥揭露）或總司令陣亡。敵方只看到「某座城門上有一枚棋背」，必須攻破才能確定是不是軍旗。任何敵棋攻擊到軍旗即獲勝。<strong>飛彈與空軍不可攻擊城門</strong>（空軍可飛越、偵察機可偵察城門上的棋子）。</p>
      </article>
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--teal">營</div>
        <h4>行營・每方 2 座</h4>
        <p>北軍在 <strong>B4、L4</strong>，南軍在 <strong>B10、L10</strong>。營內棋子不受<strong>敵方陸軍</strong>攻擊；但海軍砲擊、空軍轟炸與飛彈仍可攻擊營內棋子。</p>
      </article>
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--cyan">機</div>
        <h4>機場・四角共 4 座</h4>
        <p>北軍在 <strong>A1、M1</strong>，南軍在 <strong>A13、M13</strong>。空軍棋子只能部署於機場；機場節點不可供陸軍行走或佈陣。飛彈不可攻擊機場。</p>
      </article>
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--blue">錨</div>
        <h4>錨點・每方 5 個</h4>
        <p>北軍在 <strong>B6、E6、G6、I6、L6</strong>，南軍在 <strong>B8、E8、G8、I8、L8</strong>。海軍五艘軍艦必須一對一部署在錨點上；錨點位於海岸列與海洋交界，方便出海。</p>
      </article>
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--gold">鐵</div>
        <h4>環形鐵路</h4>
        <p>北軍鐵路橫貫第 3 列、南軍鐵路橫貫第 11 列；A 欄與 M 欄的縱貫線跨越海洋（第 6～8 列為鐵橋站）。陸軍每回合可沿鐵路移動 1～3 站，但不可穿越被佔用的車站。</p>
      </article>
      <article class="rule-card">
        <div class="rule-card__icon rule-card__icon--green">岸</div>
        <h4>海岸列</h4>
        <p>北岸為第 5 列、南岸為第 9 列（與海洋相鄰的陸地）。炮壘只能部署在己方海岸列；海軍可對相鄰海岸砲擊或登陸；炮壘可砲擊相鄰海域的敵艦。</p>
      </article>
    </div>

    <h3>鐵路怎麼走</h3>
    <p>鐵路是棋盤上唯一能快速跨越戰場的通道，也是三軍棋節奏的來源：</p>
    <ol class="rule-steps">
      <li><strong>1～3 站：</strong>移動中的陸軍（含可動武器）若位於鐵路車站，可沿鐵軌一次移動 1～3 站。</li>
      <li><strong>不可穿越：</strong>路徑上若有任何棋子（不分敵我）佔用車站，就不能通過；只能停在該站「之前」，或直接攻擊該站上的敵棋。</li>
      <li><strong>跨海：</strong>鐵路只在 A 欄與 M 欄跨海（第 6～8 列為鐵橋站）。因為一回合最多 3 站，跨海至少需要兩個回合：先停在橋頭站，下一回合再進入對岸。</li>
      <li><strong>海軍不能上橋：</strong>鐵橋站屬於鐵路節點，海域航行不可經過或停靠鐵橋站。</li>
    </ol>

    <h3>空中航線</h3>
    <p>空軍不受地形限制，沿棋盤的<strong>同一行或同一列</strong>（正交直線）飛行。一次飛行可以飛任意遠，但<strong>途中不能轉彎</strong>；要轉向必須先停在某個節點。飛機可以飛越任何棋子與地形，並可攻擊同一條航線上的任一敵棋——<strong>城門節點除外</strong>（空軍不可攻擊或停留城門，見〈<a class="rule-link" href="#rules-special">特殊行動</a>〉）。</p>
  </section>

  <section class="rules-section" id="rules-pieces" data-chapter="棋子總覽">
    <header class="rules-section__head">
      <span class="rules-section__no">04</span>
      <h2>棋子總覽・30 枚</h2>
      <p class="rules-section__lede">陸軍 23 枚、海軍 5 枚、空軍 2 枚。每種棋子雙方各一枚，總計每方 30 枚。</p>
    </header>

    <p>下表由 <code>src/core/pieces.js</code> 自動生成，與遊戲內資料同步。棋名後方的標籤代表軍種與類別；「數量」為每方枚數。</p>

    <div class="pieces-table-host" data-widget="pieces-table"></div>

    <h3>官兵階級一覽</h3>
    <p>官兵相遇時「上級勝下級」。工兵官階最低，卻是唯一能破解地雷、陷阱、毒氣、炸彈與炮壘的棋子。</p>
    <div class="officer-ladder-host" data-widget="officer-ladder"></div>

    <div class="rule-callout rule-callout--red">
      <div class="rule-callout__title">重要：官兵不是無敵</div>
      <p>官兵遇到「武器」通常會落敗，少數例外是工兵（可破雷、陷阱、毒氣、炸彈、炮壘）與高階官兵對上部分武器時的勝負表判定。實際結果一律以〈<a class="rule-link" href="#rules-table">勝負表</a>〉為準。</p>
    </div>

    <h3>武器與特殊單位的定位</h3>
    <div class="rule-grid rule-grid--3">
      <article class="rule-card rule-card--plain">
        <h4>靜止型：地雷、陷阱、炮壘、軍旗</h4>
        <p>不可移動，靠埋伏與位置發揮價值。地雷與攻擊者同歸於盡；陷阱幾乎通殺，唯獨怕工兵；炮壘守住海岸；軍旗是最終目標。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>玉石俱焚型：飛彈、炸彈、原子炮</h4>
        <p>威力大、代價也大。飛彈能越過障礙直線轟擊；炸彈碰到任何棋子幾乎同歸於盡；原子炮能橫掃陸軍，但遇上同歸於盡型棋子也難倖免。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>海空投射型：軍艦、飛機</h4>
        <p>主力艦與巡洋艦可兩棲登陸；炮艦能砲擊海岸；潛水艇稱霸海上；戰鬥機掌握制空權；偵察機提供情報。牠們通常不受行營保護限制。</p>
      </article>
    </div>
  </section>

  <section class="rules-section" id="rules-setup" data-chapter="佈陣規則">
    <header class="rules-section__head">
      <span class="rules-section__no">05</span>
      <h2>佈陣規則</h2>
      <p class="rules-section__lede">30 枚棋子在開局前一次佈完。位置決定一切——尤其是那面藏在三座城門之一、還需要用誘餌掩護的軍旗。</p>
    </header>

    <h3>各類棋子的佈陣位置</h3>
    <div class="rule-grid rule-grid--2" data-widget="deploy-zones"></div>

    <h3>佈陣流程</h3>
    <ol class="rule-steps">
      <li>系統進入「佈陣」畫面，左側為你的 30 枚棋子托盤，依軍種分組。</li>
      <li>點選托盤中的棋子，再點擊棋盤上的合法位置放置；重複直到 30 枚全部放完。</li>
      <li>按「自動佈陣」可由系統依戰術原則自動配置；按「重新佈陣」清空重來。</li>
      <li>我方佈陣完成後按「開始戰鬥」。AI 北軍會同時完成自己的佈陣（不公開）。</li>
      <li>棋局由北軍先行（AI 先手），之後雙方輪流各下一個行動。</li>
    </ol>

    <div class="rule-callout">
      <div class="rule-callout__title">隱藏資訊提醒</div>
      <p>你的軍旗藏在哪座城門，對手看不到；同理，你也看不到對手軍旗的位置。若你的<strong>總司令陣亡</strong>，你的軍旗城門位置就會對敵人曝光；被敵方偵察機偵察到的棋子也會永久曝光。因此，開局時把總司令藏好，和藏旗同等重要。</p>
      <p><strong>城門誘餌：</strong>三座城門都可以放任何陸軍棋子（軍旗、官兵、可移動武器、地雷、陷阱皆可，一門一格）。若只把軍旗放在城門、另外兩座空著，等於直接告訴對手「有棋的那座就是軍旗」。正確做法是<strong>三門都放棋</strong>：軍旗藏在其中一座，另外兩座擺放誘餌。</p>
    </div>

    <h3>佈陣建議（給新手）</h3>
    <ul class="rule-list rule-list--check">
      <li><strong>三門都放棋：</strong>軍旗藏在中間或邊角的城門，另外兩座各放一枚誘餌（強力棋子或地雷）；三門皆有棋背，對手無法從空位判斷軍旗位置。</li>
      <li><strong>地雷守城門與要道：</strong>地雷不能移動，放在敵軍必經之路或城門前最划算。</li>
      <li><strong>陷阱放在行營旁：</strong>行營能擋敵方陸軍，陷阱再補上致命一擊。</li>
      <li><strong>炮壘沿海岸列：</strong>炮壘只能佈在海岸列；放在敵艦可能接近的岸段，能封鎖海面。</li>
      <li><strong>主力艦坐鎮中央錨點：</strong>方便兩棲登陸與支援；巡洋艦可擔任第二波登陸。</li>
      <li><strong>戰鬥機與偵察機分開：</strong>戰鬥機負責空優，偵察機盡早探出敵方主力與城門。</li>
      <li><strong>總司令不要衝第一：</strong>總司令一死，軍旗位置立刻曝光，代價極高。</li>
    </ul>
  </section>

  <section class="rules-section" id="rules-turn" data-chapter="回合流程">
    <header class="rules-section__head">
      <span class="rules-section__no">06</span>
      <h2>回合流程</h2>
      <p class="rules-section__lede">每回合選一枚棋子、做一件事：移動、攻擊、砲擊、登陸、偵察或發射飛彈。</p>
    </header>

    <ol class="rule-flow">
      <li class="rule-flow__step">
        <span class="rule-flow__no">1</span>
        <div><h4>選擇棋子</h4><p>點擊我方一枚棋子。系統會亮出所有合法落點與可執行的特殊行動。</p></div>
      </li>
      <li class="rule-flow__step">
        <span class="rule-flow__no">2</span>
        <div><h4>選擇落點／目標</h4><p><span class="dot dot--green"></span>綠色＝可移動　<span class="dot dot--red"></span>紅色＝可攻擊　<span class="dot dot--blue"></span>藍色＝可佈陣。點擊即可執行。</p></div>
      </li>
      <li class="rule-flow__step">
        <span class="rule-flow__no">3</span>
        <div><h4>系統判定</h4><p>若目標格有敵棋，系統依勝負表判定並公開雙方棋種、播放戰鬥結算。</p></div>
      </li>
      <li class="rule-flow__step">
        <span class="rule-flow__no">4</span>
        <div><h4>套用結果</h4><p>勝利則佔領目標格；同歸於盡則雙方消滅；不分勝負則攻擊方留在原地。</p></div>
      </li>
      <li class="rule-flow__step">
        <span class="rule-flow__no">5</span>
        <div><h4>換手與勝負檢查</h4><p>換對手行動；每一步之後都檢查是否奪旗、無子可動或和局。</p></div>
      </li>
    </ol>

    <h3>行動種類一覽</h3>
    <div class="table-wrap">
      <table class="rule-table">
        <thead><tr><th>行動</th><th>適用棋子</th><th>說明</th></tr></thead>
        <tbody>
          <tr><td>步行</td><td>陸軍官兵、可動武器</td><td>移動到相鄰的陸地節點（8 方向）。</td></tr>
          <tr><td>鐵路移動</td><td>陸軍官兵、可動武器</td><td>沿鐵路移動 1～3 站，不可穿越被佔用的車站。</td></tr>
          <tr><td>航行</td><td>海軍</td><td>移動到相鄰的海域節點（8 方向）。</td></tr>
          <tr><td>飛行</td><td>空軍</td><td>沿同一行／列直線飛行任意距離，可攻擊線上任一敵棋（不可攻擊或停留城門）。</td></tr>
          <tr><td>兩棲登陸</td><td>主力艦、巡洋艦</td><td>從海域移動到相鄰海岸陸地。</td></tr>
          <tr><td>炮壘砲擊</td><td>炮壘</td><td>攻擊相鄰海域的敵艦，自身不移動。</td></tr>
          <tr><td>炮艦砲擊</td><td>炮艦</td><td>攻擊相鄰海岸的敵方陸上棋子，自身不移動。</td></tr>
          <tr><td>防空攻擊</td><td>高射炮、炮艦</td><td>攻擊直線距離 2 格內的敵機。</td></tr>
          <tr><td>飛彈轟擊</td><td>飛彈</td><td>沿直線攻擊任意距離的敵棋，可越過障礙。</td></tr>
          <tr><td>偵察</td><td>偵察機</td><td>使同一行／列直線上的敵棋曝光。</td></tr>
          <tr><td>PASS</td><td>任何一方</td><td>沒有合法行動時自動換手；連續雙方無法行動則和局。</td></tr>
        </tbody>
      </table>
    </div>

    <div class="rule-callout">
      <div class="rule-callout__title">每回合只有「一個行動」</div>
      <p>移動與攻擊不能拆成兩步：走到敵棋所在格＝攻擊；抵達空格＝移動。特殊行動（砲擊、登陸、防空、飛彈、偵察）同樣消耗該回合唯一的行動。選錯棋子不會有懲罰——按 ESC 或再點空白處即可取消。</p>
    </div>
  </section>

  <section class="rules-section" id="rules-move" data-chapter="移動規則">
    <header class="rules-section__head">
      <span class="rules-section__no">07</span>
      <h2>移動規則</h2>
      <p class="rules-section__lede">陸軍走格、海軍航行、空軍直線飛行；能不能「走到」與能不能「打到」是兩回事。</p>
    </header>

    <h3>陸軍・步行</h3>
    <ul class="rule-list">
      <li>每次移動到<strong>相鄰的一個陸地節點</strong>，方向為 8 方向（含斜向）。</li>
      <li>可通過城門、行營與鐵路車站；<strong>機場不可步行進入</strong>（機場只供空軍起降）。</li>
      <li>不能進入已被任何棋子佔用的節點（敵棋所在＝攻擊，見下）。</li>
      <li>不能跨越海洋；要在南北陸之間移動，只能走兩側的鐵橋（陸軍在鐵橋站視為在鐵路上）。</li>
    </ul>

    <h3>陸軍・鐵路移動</h3>
    <ul class="rule-list">
      <li>若棋子目前位於鐵路車站，可沿鐵軌移動 <strong>1～3 站</strong>（可不只走 1 站，但最多 3 站）。</li>
      <li>路徑中途<strong>不可穿越</strong>任何被棋子佔用的車站；目標站若有敵棋，則在該站發生戰鬥。</li>
      <li>鐵路是環形的：北軍第 3 列、南軍第 11 列橫貫，A／M 欄縱貫跨海。跨海須經鐵橋站（第 6～8 列），一回合最多 3 站，因此通常需要兩個回合。</li>
      <li>地雷、陷阱、炮壘、軍旗不可移動，自然也無法使用鐵路。</li>
    </ul>

    <h3>海軍・航行</h3>
    <ul class="rule-list">
      <li>每次移動到<strong>相鄰的一個海域節點</strong>（8 方向）。</li>
      <li>可進入己方或敵方錨點；<strong>不可停靠或穿越鐵橋站</strong>（鐵橋屬於鐵路，不屬於海域）。</li>
      <li>軍艦不能直接上岸；要上岸必須執行〈兩棲登陸〉（僅主力艦、巡洋艦）。</li>
      <li>海軍可對相鄰海岸砲擊（炮艦）、對相鄰海域開火（炮壘），或對空開火（炮艦）。</li>
    </ul>

    <h3>空軍・飛行</h3>
    <ul class="rule-list">
      <li>選擇<strong>東、西、南、北其中一個正交方向</strong>，沿直線飛行任意距離（至少 1 格），途中不可轉彎。</li>
      <li>可以飛越任何地形、任何棋子；可以停在空節點，或攻擊同一條直線上的任一敵棋（等同飛到目標格戰鬥）。</li>
      <li>若途中經過敵方高射炮或敵方炮艦所在節點（<strong>不含終點</strong>），飛機立即被擊落：飛機消滅、防空方存活，該回合結束。</li>
      <li>戰鬥機可攻擊直線上的敵機（敵機攔截）；偵察機不能攻擊，只能偵察。</li>
      <li>飛機只能在棋盤範圍內飛行，不可飛出邊界。</li>
      <li><strong>空軍不可攻擊或停留在城門節點</strong>（但可以飛越）：這是數位版調整，避免戰鬥機直接飛到城門「斬首」軍旗。偵察機仍可偵察城門上的棋子。</li>
    </ul>

    <h3>不可移動的棋子</h3>
    <div class="rule-pill-row">
      <span class="rule-pill rule-pill--static">地雷</span>
      <span class="rule-pill rule-pill--static">陷阱</span>
      <span class="rule-pill rule-pill--static">炮壘</span>
      <span class="rule-pill rule-pill--static">軍旗</span>
      <span class="rule-pill">其餘陸軍棋子皆可移動</span>
    </div>
    <p>炮壘雖不可移動，但可執行「砲擊」行動；軍旗、地雷、陷阱則只能被動等待敵人上門。</p>

    <h3>「移動」與「攻擊」的差別</h3>
    <div class="table-wrap">
      <table class="rule-table">
        <thead><tr><th>目標格</th><th>行動結果</th><th>判定</th></tr></thead>
        <tbody>
          <tr><td>空格</td><td>移動</td><td>直接佔據該格。</td></tr>
          <tr><td>我方棋子</td><td>不可進入</td><td>一個節點只能容納一枚棋子。</td></tr>
          <tr><td>敵方棋子</td><td>攻擊</td><td>依勝負表判定；攻方勝則佔領、同歸於盡則雙方消滅、敗或平手則攻擊方留在原地。</td></tr>
          <tr><td>敵方軍旗</td><td>奪旗</td><td>立即獲勝（飛彈除外——飛彈不可攻擊城門）。</td></tr>
        </tbody>
      </table>
    </div>

    <div class="rule-callout rule-callout--blue">
      <div class="rule-callout__title">介面提示</div>
      <p>選取棋子後，合法的移動格顯示為<span class="dot dot--green"></span>綠色光點，可攻擊的敵棋顯示為<span class="dot dot--red"></span>紅色光點；特殊行動會另外以圖示標示。點擊光點即可執行，再點一次已選棋子或按 ESC 可取消選取。</p>
    </div>
  </section>

  <section class="rules-section" id="rules-special" data-chapter="特殊行動">
    <header class="rules-section__head">
      <span class="rules-section__no">08</span>
      <h2>特殊行動</h2>
      <p class="rules-section__lede">砲擊、登陸、防空、飛彈、偵察、飛越擊落——三軍棋最精彩的戰術都藏在這裡。</p>
    </header>

    <h3>特殊行動總表</h3>
    <div class="table-wrap">
      <table class="rule-table">
        <thead><tr><th>棋子</th><th>行動</th><th>條件／範圍</th><th>判定方式</th></tr></thead>
        <tbody>
          <tr><td><strong>主力艦</strong></td><td>兩棲登陸</td><td>位於海域，目標為相鄰海岸的陸地節點</td><td>官兵比師長、武器比坦克車</td></tr>
          <tr><td><strong>巡洋艦</strong></td><td>兩棲登陸</td><td>同上</td><td>官兵比團長、武器比大炮</td></tr>
          <tr><td><strong>炮壘</strong></td><td>砲擊</td><td>目標為相鄰海域的敵艦</td><td>以炮壘戰力代入</td></tr>
          <tr><td><strong>炮艦</strong></td><td>砲擊</td><td>目標為相鄰海岸的敵方陸上棋子</td><td>官兵比營長、武器比炮壘</td></tr>
          <tr><td><strong>炮艦</strong></td><td>對空</td><td>直線距離 2 格內的敵機</td><td>以高射炮戰力代入</td></tr>
          <tr><td><strong>高射炮</strong></td><td>對空</td><td>直線距離 2 格內的敵機</td><td>以高射炮戰力代入</td></tr>
          <tr><td><strong>飛彈</strong></td><td>轟擊</td><td>同一行／列直線任意距離，可越過障礙；不可攻擊城門、機場</td><td>以飛彈戰力代入</td></tr>
          <tr><td><strong>偵察機</strong></td><td>偵察</td><td>同一行／列直線上的任一敵棋</td><td>目標曝光，不發生戰鬥</td></tr>
          <tr><td><strong>戰鬥機</strong></td><td>攔截／反飛彈</td><td>直線上的敵機、或位於飛彈所在格</td><td>依勝負表判定</td></tr>
        </tbody>
      </table>
    </div>

    <h3>特殊戰力對照</h3>
    <p>有些棋子本身不直接比大小，而是「代打」成另一種棋子查表。以下由核心棋子資料自動生成：</p>
    <div class="special-profiles-host" data-widget="special-profiles"></div>

    <h3>逐一說明</h3>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">A</span>兩棲登陸（主力艦・巡洋艦）</h4>
      <p>軍艦從海域移動到相鄰的海岸陸地。若目標格是空地，登陸成功、直接佔領；若目標格有敵棋，則以「登陸戰力」與守方判定。</p>
      <ul class="rule-list">
        <li>主力艦登陸：對官兵比照<strong>師長</strong>，對武器比照<strong>坦克車</strong>。</li>
        <li>巡洋艦登陸：對官兵比照<strong>團長</strong>，對武器比照<strong>大炮</strong>。</li>
        <li>登陸成功後，該艦成為陸上棋子（<code>landed</code>），<strong>不能再下海</strong>，但之後可以用陸上規則行動（步行、鐵路）。</li>
        <li>登陸戰敗則艦毀；平手則同歸於盡。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">B</span>炮壘砲擊</h4>
      <p>炮壘不可移動，但可攻擊相鄰海域的敵艦，自身留在岸上。戰力以「炮壘」代入勝負表。</p>
      <ul class="rule-list">
        <li>對潛水艇＝不分勝負；對炮艦＝攻擊方（炮壘）勝；對其他軍艦依表判定。</li>
        <li>發射後炮壘不會移動，也沒有彈藥限制。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">C</span>炮艦砲擊</h4>
      <p>炮艦可自海上砲擊相鄰海岸的敵方陸上棋子，自身不移動。戰力：對官兵比照<strong>營長</strong>、對武器比照<strong>炮壘</strong>；攻擊炮壘時炮艦勝。</p>
      <ul class="rule-list">
        <li>可以攻擊<strong>行營內</strong>的棋子——行營只能擋敵方陸軍的攻擊，擋不住來自海上的砲彈。</li>
        <li>被攻擊的守方若是潛水艇以外的軍艦，則不適用（炮艦砲擊只打陸上目標）。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">D</span>防空與飛越擊落</h4>
      <ul class="rule-list">
        <li><strong>防空攻擊：</strong>高射炮或炮艦可主動攻擊直線距離 <strong>2 格內</strong>的敵機，以「高射炮」戰力代入勝負表，不需移動。</li>
        <li><strong>飛越擊落（自動）：</strong>任何飛機沿直線飛行時，若途中經過敵方高射炮或敵方炮艦所在節點（<strong>不含終點</strong>），立即被擊落：飛機消滅、防空方存活，該回合結束。</li>
        <li>換句話說，敵方防空單位周圍的直線航線是飛機的禁航區；繞路或先摧毀防空單位，是空軍的必修課。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">D2</span>空軍與城門（數位版）</h4>
      <p>空軍棋子<strong>不可攻擊或停留在城門節點</strong>，但可以飛越城門上空。這條數位版規則用來避免戰鬥機一開局就飛到城門「斬首」軍旗，讓藏旗與誘餌的佈陣策略有意義。</p>
      <ul class="rule-list">
        <li>偵察機仍可偵察城門上的棋子，讓城門上的棋種曝光。</li>
        <li>飛彈同樣不可攻擊城門；海軍砲擊也到不了城門（城門位於內陸，不與海洋相鄰）。</li>
        <li>換句話說：<strong>軍旗只能被陸軍（步行、鐵路或兩棲登陸後的部隊）攻破</strong>。空軍可飛越城門上空，但不能攻擊或停留。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">E</span>飛彈轟擊</h4>
      <p>飛彈不移動，沿同一行或同一列（空中航線）直線攻擊<strong>任意距離</strong>的敵棋，可以越過任何棋子與地形。</p>
      <ul class="rule-list">
        <li>判定以「飛彈」戰力代入勝負表：幾乎所有目標同歸於盡，唯獨陷阱不受影響（飛彈自毀、陷阱留存）。</li>
        <li><strong>不可攻擊城門與機場</strong>；因此不能用飛彈直接轟擊軍旗，也不能打機場上的敵機。</li>
        <li>飛彈<strong>可以</strong>攻擊行營內的棋子（飛彈從空中來，不受行營保護限制）。</li>
        <li>發射後飛彈一律消滅；對潛水艇為不分勝負時，飛彈落空消滅、潛艇安然無恙。</li>
        <li>戰鬥機若移動到飛彈所在格可以攻擊飛彈並取勝；飛彈遭戰鬥機攻擊會被消滅。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">F</span>偵察與情報</h4>
      <ul class="rule-list">
        <li>偵察機可偵察同一行／列直線上的任一敵棋，<strong>不需移動</strong>，使該棋對己方永久曝光（<code>revealed</code>）。</li>
        <li>偵察機沒有戰鬥力：被攻擊時敗給戰鬥機、高射炮、炮艦；與飛彈同歸於盡；對地雷不分勝負。</li>
        <li>數位版中，偵察得到的情報<strong>永久保留</strong>——被看過的棋子，之後都會以棋種顯示。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">G</span>行營保護</h4>
      <p>行營內的棋子<strong>不受敵方陸軍攻擊</strong>。這包括步行、鐵路抵達的攻擊，以及兩棲登陸後的陸上攻擊。</p>
      <ul class="rule-list">
        <li>行營<strong>擋不住</strong>海軍砲擊（炮艦）、空軍攻擊與飛彈轟擊。</li>
        <li>同理，海軍登陸、空軍攻擊不受行營保護限制。</li>
        <li>數位版在產生合法行動時就排除「敵方陸軍攻擊行營內棋子」的行動，因此不會出現無效攻擊。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">H</span>總司令陣亡與軍旗曝光</h4>
      <p>當一方的<strong>總司令</strong>被消滅時，該方的軍旗城門位置立即對敵方曝光。這是三軍棋最關鍵的情報事件之一：即使軍旗還在，敵人也已經知道該往哪座城門進攻。</p>
      <ul class="rule-list">
        <li>曝光後，軍旗位置在棋盤上以特殊標記顯示，直到棋局結束。</li>
        <li>因此「總司令」既是全棋最強的官兵，也是最大的情報風險。</li>
        <li>相對地，若能擊殺對方總司令，往往比吃掉幾枚棋子更有價值。</li>
      </ul>
    </article>

    <article class="rule-detail-block">
      <h4><span class="rule-detail-block__no">I</span>奪旗勝利</h4>
      <p>任何敵棋攻擊到軍旗所在的城門，<strong>立即獲勝</strong>——不論攻方最後是否存活、也不論結果是否為同歸於盡。飛彈與空軍不可攻擊城門，所以無法用飛彈或戰鬥機直接奪旗；空軍只能飛越城門，偵察機則可偵察城門上的棋子。城門位於內陸，海軍砲擊也無法觸及——軍旗只能被陸軍（含登陸後的部隊）攻破。</p>
    </article>

    <div class="rule-callout rule-callout--red">
      <div class="rule-callout__title">規則衝突時怎麼辦？</div>
      <p>若你覺得某個判定和記憶中的傳統規則不同，請先看〈<a class="rule-link" href="#rules-digital">數位版調整</a>〉與〈<a class="rule-link" href="#rules-table">數位版覆寫</a>〉——數位版為了公平與可玩性，對少數爭議判定做了統一規定。</p>
    </div>
  </section>

  <section class="rules-section" id="rules-combat" data-chapter="戰鬥判定">
    <header class="rules-section__head">
      <span class="rules-section__no">09</span>
      <h2>戰鬥判定</h2>
      <p class="rules-section__lede">兩枚棋子接觸時，系統扮演裁判：查勝負表 → 特殊代打 → 覆寫規則 → 套用結果 → 公開棋種。</p>
    </header>

    <h3>判定順序</h3>
    <ol class="rule-steps rule-steps--numbered">
      <li><strong>查表：</strong>以「實際棋子」查詢勝負表 <code>matrix[守方][攻方]</code>。</li>
      <li><strong>特殊映射：</strong>若攻方是登陸艦、砲擊艦、炮壘、防空單位或飛彈，先換算成代打戰力（見〈特殊戰力對照〉）。</li>
      <li><strong>規則覆寫：</strong>套用數位版的統一規定（例如工兵攻擊炮壘視為工兵勝、軍旗被攻擊直接奪旗）。</li>
      <li><strong>套用結果：</strong>依 A／D／B／N／F 移動或移除棋子；偵察 R 則只曝光、不戰鬥。</li>
      <li><strong>公開棋種：</strong>參與戰鬥的雙方棋子對彼此公開（可在設定中關閉「戰鬥揭露棋子」）。</li>
    </ol>

    <h3>七種結果</h3>
    <div class="result-codes" data-widget="result-codes"></div>

    <h3>戰鬥後的佔位</h3>
    <div class="table-wrap">
      <table class="rule-table">
        <thead><tr><th>結果</th><th>攻擊方</th><th>防守方</th><th>目標格</th></tr></thead>
        <tbody>
          <tr><td><span class="res-chip res-chip--attack">攻擊方勝</span></td><td>存活</td><td>消滅</td><td>攻擊方佔領</td></tr>
          <tr><td><span class="res-chip res-chip--defend">防守方勝</span></td><td>消滅</td><td>存活</td><td>防守方留在原地</td></tr>
          <tr><td><span class="res-chip res-chip--both">同歸於盡</span></td><td>消滅</td><td>消滅</td><td>清空</td></tr>
          <tr><td><span class="res-chip res-chip--draw">不分勝負</span></td><td>存活、退回原格</td><td>存活</td><td>不變</td></tr>
          <tr><td><span class="res-chip res-chip--scout">偵察</span></td><td>不移動</td><td>存活、曝光</td><td>不變</td></tr>
          <tr><td><span class="res-chip res-chip--flag">奪旗</span></td><td>立即獲勝</td><td>軍旗失守</td><td>棋局結束</td></tr>
        </tbody>
      </table>
    </div>

    <h3>曝光規則</h3>
    <div class="rule-grid rule-grid--2">
      <article class="rule-card rule-card--plain">
        <h4>戰鬥曝光</h4>
        <p>戰鬥參與的雙方棋種會互相公開（預設開啟，可在設定關閉）。即使其中一方被消滅，棋種仍會記錄在戰報與「被消滅棋子」欄中。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>偵察曝光</h4>
        <p>偵察機看過的敵棋，對偵察方永久公開。偵察機可安全地「點名」敵方一個棋子，是資訊戰的核心。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>總司令陣亡</h4>
        <p>總司令被消滅時，該方軍旗所在的城門位置對敵方公開。這是強制曝光，無法隱藏。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>空軍永遠公開</h4>
        <p>基於「飛行器在天上看得見」的設計，空軍棋子一開始就對雙方公開。其他棋子則保持隱藏，直到被戰鬥、偵察或軍旗曝光事件揭開。</p>
      </article>
    </div>

    <h3>數位版覆寫規則</h3>
    <p>下列情況會<strong>覆蓋</strong>原始勝負表，以維持公平與可玩性。互動查詢與摘要表都已套用這些覆寫：</p>
    <div class="house-rules-host" data-widget="house-rules"></div>

    <h3>特殊行動的代打戰力</h3>
    <p>登陸、砲擊、防空、飛彈不使用攻方原本的棋種查表，而是先換算成代打戰力。詳細對照見〈<a class="rule-link" href="#rules-special">特殊行動</a>〉的〈特殊戰力對照〉。</p>

    <div class="rule-callout">
      <div class="rule-callout__title">關於「無法作用（X）」</div>
      <p>原始勝負表中有許多組合標示為 X，代表兩者不可能在正常規則下交手（例如官兵攻擊驅逐艦、飛機攻擊地雷等）。<strong>引擎不會產生這些行動</strong>，所以你在遊戲中不會看到「無效攻擊」。規則頁的查詢工具仍保留 X，方便理解勝負表全貌。</p>
    </div>

    <h3>公平性：AI 不會偷看你的棋</h3>
    <p>AI 北軍只能依規則「應該知道」的資訊行動：自己的棋子、已曝光的敵棋、公開的空軍、以及從戰鬥中得到的資訊。未知的敵棋會由 AI 依剩餘棋種分布推測——因此，把王牌藏好、偶爾虛張聲勢，是有用的。</p>
  </section>

  <section class="rules-section" id="rules-table" data-chapter="勝負表查詢">
    <header class="rules-section__head">
      <span class="rules-section__no">10</span>
      <h2>勝負表查詢</h2>
      <p class="rules-section__lede">30×30 的完整表很難用肉眼查；這裡提供互動查詢、每枚棋的勝負摘要，以及可展開的完整矩陣。</p>
    </header>

    <h3>互動查詢</h3>
    <p>選擇攻擊方、防守方與行動類型，立即顯示判定結果。結果已包含數位版覆寫；若與原始表不同，會額外標示。</p>
    <div class="combat-lookup-host" data-widget="combat-lookup"></div>

    <h3>每枚棋的勝負摘要</h3>
    <p>以「這枚棋當攻擊方」的角度，列出它能擊敗誰、敗給誰、和誰同歸於盡、和誰不分勝負。可切換成「當防守方」的視角。</p>
    <div class="combat-summary-host" data-widget="combat-summary"></div>

    <h3>完整 30×30 矩陣</h3>
    <details class="rule-details">
      <summary>展開完整勝負矩陣（守方 × 攻方）</summary>
      <p class="rule-details__hint">列＝防守方、欄＝攻擊方。滑鼠移到格子上可查看說明；點擊格子會帶入上方互動查詢。</p>
      <div class="combat-matrix-host" data-widget="combat-matrix"></div>
    </details>

    <h3>怎麼讀這張表</h3>
    <ul class="rule-list">
      <li><strong>縱橫都是棋名：</strong>傳統勝負表以「守方」為列、「攻方」為欄；本頁查詢工具直接讓你選「誰攻擊誰」。</li>
      <li><strong>官兵比階級：</strong>上級勝下級。官兵遇到武器通常落敗，但工兵例外。</li>
      <li><strong>武器比性質：</strong>飛彈、炸彈、原子炮等以同歸於盡為主；地雷、陷阱靠埋伏；炮壘守海岸。</li>
      <li><strong>跨軍種多有 X：</strong>陸軍打不到海上的船、飛機也很難被地面單位攻擊；這些交由特殊行動（砲擊、防空、登陸）處理。</li>
      <li><strong>軍旗：</strong>表中以「奪旗」表示任何攻擊方都能立即獲勝。</li>
    </ul>
  </section>

  <section class="rules-section" id="rules-win" data-chapter="勝負條件">
    <header class="rules-section__head">
      <span class="rules-section__no">11</span>
      <h2>勝負條件</h2>
      <p class="rules-section__lede">奪旗、無子可動、和局、投降——四種結束方式。</p>
    </header>

    <div class="rule-grid rule-grid--2">
      <article class="rule-card rule-card--win">
        <div class="rule-card__icon rule-card__icon--gold">旗</div>
        <h4>奪旗勝利</h4>
        <p>任何敵棋攻擊到軍旗即獲勝。軍旗被攻擊時，不論攻方是否同歸於盡，都算奪旗成功。飛彈與空軍不可攻擊城門，因此無法用飛彈或飛機奪旗；城門位於內陸，軍旗只能被陸軍（含登陸後的部隊）攻破。</p>
      </article>
      <article class="rule-card rule-card--win">
        <div class="rule-card__icon rule-card__icon--gold">困</div>
        <h4>無子可動</h4>
        <p>若輪到某方時，該方<strong>沒有任何合法行動</strong>（棋子全為不可移動，或全被封鎖），該方判負。若雙方接連都無法行動，則判定和局。</p>
      </article>
      <article class="rule-card rule-card--win">
        <div class="rule-card__icon rule-card__icon--gold">和</div>
        <h4>和局</h4>
        <p>雙方連續無法行動時和局。數位版目前不設回合上限；若戰況僵持，可選擇投降或重新開始。</p>
      </article>
      <article class="rule-card rule-card--win">
        <div class="rule-card__icon rule-card__icon--gold">降</div>
        <h4>投降</h4>
        <p>對戰中可隨時按「投降」結束棋局，由對手獲勝。投降前會跳出確認視窗，避免誤觸。</p>
      </article>
    </div>

    <h3>每一步都檢查</h3>
    <p>每個行動套用後（包含移動、戰鬥、特殊行動與 PASS），系統都會立即檢查勝負條件。一旦任一方奪旗、無子可動或雙方連續無法行動，棋局立刻結束並顯示結算畫面。</p>

    <h3>結算畫面</h3>
    <ul class="rule-list">
      <li>顯示「勝利／敗北／和局」與結束原因（奪旗、無子可動、投降、和局）。</li>
      <li>統計本局回合數、雙方剩餘棋子數與被消滅的棋子。</li>
      <li>可選擇「再來一局」重新開局，或「回主選單」休息一下。</li>
    </ul>
  </section>

  <section class="rules-section" id="rules-tips" data-chapter="戰術提示">
    <header class="rules-section__head">
      <span class="rules-section__no">12</span>
      <h2>戰術提示</h2>
      <p class="rules-section__lede">從開局到殘局，幾個能立刻提升勝率的小原則。</p>
    </header>

    <h3>開局：先立於不敗</h3>
    <ul class="rule-list rule-list--check">
      <li><strong>先藏旗，再想進攻。</strong>軍旗所在城門是三座之一；若能讓對手連「猜」都猜錯，就先贏了一半。</li>
      <li><strong>總司令與軍旗不要放在一起。</strong>總司令陣亡會曝光軍旗位置，兩者同區等於把答案送給對手。</li>
      <li><strong>地雷擺在對手必經的窄路。</strong>行營旁、城門前、鐵橋頭都是好位置；地雷不會移動，位置錯了就浪費。</li>
      <li><strong>陷阱藏在看起來最安全的地方。</strong>陷阱能吃掉幾乎所有棋子，唯獨怕工兵；放在行營或城門附近，引誘對手深入。</li>
      <li><strong>炮壘守海岸，不要貪。</strong>炮壘不可移動，放在敵艦可能接近的岸段即可，不必擠在角落。</li>
      <li><strong>偵察機越早出動越好。</strong>它沒有戰鬥力，但換來的情報可能決定整局走向。</li>
    </ul>

    <h3>中局：製造不對稱</h3>
    <ul class="rule-list rule-list--check">
      <li><strong>用「已知」打「未知」。</strong>戰鬥會公開雙方棋種；先派小棋子試探，換取對手主力情報。</li>
      <li><strong>工兵是拆雷與拆彈的鑰匙。</strong>看到對手在城門前佈防，先派工兵清路，再讓主力進場。</li>
      <li><strong>戰鬥機要避開高射炮與炮艦。</strong>飛機飛越防空單位上空會被擊落；先偵察、繞路，或用砲火清掉防空。</li>
      <li><strong>飛彈當成「強制兌子」。</strong>飛彈幾乎與所有目標同歸於盡，適合硬換對手的大棋子；但別忘了陷阱會讓飛彈白白送命。</li>
      <li><strong>海軍是第二戰場。</strong>炮艦砲擊海岸、主力艦登陸，都能逼對手分兵回防，替陸軍製造破口。</li>
      <li><strong>行營是前線堡壘。</strong>把棋子放進行營，敵方陸軍就只能用海空或飛彈處理，等於多一層保護。</li>
    </ul>

    <h3>殘局：算清楚每一步</h3>
    <ul class="rule-list rule-list--check">
      <li><strong>軍旗曝光後立即轉守。</strong>若你的總司令已陣亡，對手已知城門位置，請把剩餘棋子往城門收攏。</li>
      <li><strong>對手無子可動也是一種贏法。</strong>把對手的可動棋子吃光或困住，比硬攻城門更省力。</li>
      <li><strong>鐵路是最後的快速通道。</strong>殘局時利用鐵路 1～3 站的機動性，迅速轉移兵力或偷襲。</li>
      <li><strong>注意「不分勝負」的棋子。</strong>平手代表攻擊方退回，對守方而言是拖延時間的好工具。</li>
    </ul>

    <h3>常見誤解</h3>
    <div class="rule-grid rule-grid--2">
      <article class="rule-card rule-card--plain">
        <h4>Q：官兵碰到武器一定輸？</h4>
        <p>A：不一定。工兵能破解地雷、陷阱、毒氣、炸彈與炮壘；其他官兵對上武器多半落敗。實際結果請查勝負表。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>Q：行營裡的棋子無敵？</h4>
        <p>A：只對「敵方陸軍」免疫。海軍砲擊、空軍、飛彈都能攻擊行營內的棋子。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>Q：飛機可以隨便轉彎？</h4>
        <p>A：不行。一次飛行只能沿同一行或列直線前進；要轉彎必須停下來，下一回合再飛。</p>
      </article>
      <article class="rule-card rule-card--plain">
        <h4>Q：用飛彈可以直接打軍旗？</h4>
        <p>A：不行。飛彈不可攻擊城門與機場；空軍也不能攻擊或停留在城門。要奪旗，必須派陸軍（或登陸後的部隊）攻破城門；城門位於內陸，海軍砲擊也打不到。</p>
      </article>
    </div>
  </section>

  <section class="rules-section" id="rules-digital" data-chapter="數位版調整">
    <header class="rules-section__head">
      <span class="rules-section__no">13</span>
      <h2>數位版調整</h2>
      <p class="rules-section__lede">為了在網頁上順暢、公平地重現傳統棋局，本作做了一些明確的調整；遇到爭議時，以本節與 DESIGN 規格為準。</p>
    </header>

    <h3>棋盤與規則</h3>
    <div class="table-wrap">
      <table class="rule-table">
        <thead><tr><th>項目</th><th>數位版作法</th><th>說明</th></tr></thead>
        <tbody>
          <tr><td>棋盤</td><td>13×13 對稱方格</td><td>以傳統棋盤為概念重繪：北陸 5 列、海洋 3 列、南陸 5 列；三座城門、兩座行營、四座機場、五個錨點、環形鐵路。</td></tr>
          <tr><td>移動</td><td>8 方向方格移動</td><td>原版路線圖較複雜；為求數位可讀性與操作性，統一為方格 8 方向。</td></tr>
          <tr><td>鐵路</td><td>每回合 1～3 站</td><td>與原版相同；跨海因距離自然需要在橋頭停留。</td></tr>
          <tr><td>行營</td><td>只擋敵方陸軍</td><td>海軍砲擊、空軍、飛彈可攻擊行營內棋子。</td></tr>
          <tr><td>隱藏資訊</td><td>空軍永遠公開</td><td>飛行器在天上可見；戰鬥參與棋子公開；偵察機情報永久保留。</td></tr>
          <tr><td>回合</td><td>每回合一個行動</td><td>與原版相同；沒有「先移動再攻擊」。</td></tr>
          <tr><td>裁判</td><td>系統自動判定</td><td>取代原版真人裁判；勝負表與特殊映射由核心引擎統一處理。</td></tr>
          <tr><td>無效組合</td><td>不產生合法行動</td><td>原表中 X 的組合不會出現在可選行動中。</td></tr>
          <tr><td>軍旗</td><td>被攻擊即勝</td><td>不論攻方是否同歸於盡；飛彈與空軍不可攻擊城門。</td></tr>
          <tr><td>城門誘餌</td><td>三門皆可放陸軍棋子</td><td>每座城門可放 1 枚陸軍棋子（軍旗、官兵、可移動武器、地雷、陷阱）；軍旗仍只能藏在三門之一，敵方須攻破才能確定。按下「自動佈陣」時，系統也會三門全放（軍旗＋誘餌）。</td></tr>
          <tr><td>空軍與城門</td><td>不可攻擊或停留</td><td>空軍可飛越城門，但不可攻擊或停留在城門節點；偵察機仍可偵察城門上的棋子。</td></tr>
        </tbody>
      </table>
    </div>

    <h3>介面與體驗</h3>
    <div class="table-wrap">
      <table class="rule-table">
        <thead><tr><th>項目</th><th>作法</th><th>說明</th></tr></thead>
        <tbody>
          <tr><td>佈陣</td><td>玩家手動或「自動佈陣」</td><td>AI 亦會自動佈陣；AI 的佈陣不會公開。</td></tr>
          <tr><td>可動提示</td><td>綠色＝移動、紅色＝攻擊、藍色＝佈陣</td><td>選取棋子後直接顯示合法落點，不必記住規則。</td></tr>
          <tr><td>戰鬥結算</td><td>雙方棋子卡翻開對決</td><td>顯示棋種、軍種、結果與消滅提示；可設定是否公開戰鬥棋種。</td></tr>
          <tr><td>戰鬥日誌</td><td>記錄每一步與判定</td><td>可回顧整局攻防；最新的記錄顯示在最上方。</td></tr>
          <tr><td>難度</td><td>簡單／普通／困難</td><td>AI 的推理深度與風險偏好不同；困難模式會取樣多個可能世界做搜尋。</td></tr>
          <tr><td>音效</td><td>WebAudio 程序合成</td><td>落子、戰鬥、爆破、勝利等音效；可隨時開關，預設開啟。</td></tr>
          <tr><td>投降／重新開始</td><td>HUD 按鈕</td><td>投降需確認；重新開始會重新佈陣。</td></tr>
        </tbody>
      </table>
    </div>

    <div class="rule-callout rule-callout--blue">
      <div class="rule-callout__title">與原版最大的不同</div>
      <p>原版三軍棋的棋盤紙路線與圖示各版本略有差異，規則也常靠口耳相傳與裁判裁量。本作以 <code>DESIGN.md</code> 為單一權威規格，將所有判定數位化、一致化；若你熟悉的版本與此處不同，歡迎把它當作本作的「競技規則」。</p>
    </div>
  </section>

  <section class="rules-section" id="rules-controls" data-chapter="操作說明">
    <header class="rules-section__head">
      <span class="rules-section__no">14</span>
      <h2>操作說明</h2>
      <p class="rules-section__lede">滑鼠三次點擊就能下完一回合：點棋子 → 點亮點 → 看結算。</p>
    </header>

    <h3>基本操作</h3>
    <ol class="rule-steps">
      <li><strong>選擇棋子：</strong>點擊棋盤上我方的棋子，棋子會亮起金色光環，右側資訊卡顯示棋種與能力。</li>
      <li><strong>選擇落點：</strong>棋盤上會出現光點——<span class="dot dot--green"></span>綠色可移動、<span class="dot dot--red"></span>紅色可攻擊。特殊行動（砲擊、登陸、防空、飛彈、偵察）會以額外圖示標示目標。</li>
      <li><strong>執行：</strong>點擊光點或目標，系統播放動畫並判定。</li>
      <li><strong>取消：</strong>再點一次已選棋子、點擊棋盤空白處，或按 <kbd>Esc</kbd>。</li>
      <li><strong>戰鬥：</strong>結算卡會顯示雙方棋子與結果；點「繼續」或按 <kbd>空白鍵</kbd> 關閉。</li>
    </ol>

    <h3>畫面元素</h3>
    <div class="table-wrap">
      <table class="rule-table">
        <thead><tr><th>區域</th><th>內容</th></tr></thead>
        <tbody>
          <tr><td>上方狀態列</td><td>回合數、當前輪次（你的回合／AI 思考中）、音效、規則、設定、重新開始。</td></tr>
          <tr><td>左側面板</td><td>我方剩餘棋子（依陸／海／空分組）、軍旗狀態、被消滅棋子。</td></tr>
          <tr><td>右側面板</td><td>敵方剩餘棋子、已確認擊破的敵棋、戰鬥日誌、投降按鈕。</td></tr>
          <tr><td>左下資訊卡</td><td>目前選中棋子的名稱、軍種、階級與能力說明。</td></tr>
          <tr><td>戰鬥結算卡</td><td>雙方棋子、戰鬥結果、特殊行動與消滅提示。</td></tr>
          <tr><td>規則／設定／圖鑑</td><td>隨時可開啟；棋局會在背景暫停等你回來。</td></tr>
        </tbody>
      </table>
    </div>

    <h3>手機與小螢幕</h3>
    <ul class="rule-list">
      <li>小螢幕上，左右面板會收合成可展開的資訊抽屜；點上方「戰況／日誌」切換。</li>
      <li>棋子托盤在佈陣畫面下方，可橫向滑動；點選棋子後再點棋盤放置。</li>
      <li>雙指縮放／拖曳棋盤（依裝置支援）可調整視角；所有按鈕皆以觸控友善尺寸設計。</li>
      <li>若覺得棋盤被面板遮住，可先關閉面板再操作。</li>
    </ul>

    <h3>無障礙與節奏</h3>
    <ul class="rule-list">
      <li>所有操作都有對應的按鈕或提示，不強迫使用鍵盤快捷鍵。</li>
      <li>戰鬥結算可手動關閉，不會自動跳過重要資訊（除非你開啟自動繼續）。</li>
      <li>系統尊重「減少動態效果」偏好：若裝置設定減少動畫，動畫會縮短或改為淡入。</li>
    </ul>
  </section>

  <section class="rules-section" id="rules-refs" data-chapter="參考資料">
    <header class="rules-section__head">
      <span class="rules-section__no">15</span>
      <h2>參考資料</h2>
      <p class="rules-section__lede">本作規則整理自以下公開資料；棋盤與勝負表以維基百科條目為主要依據，並依 DESIGN 規格統一。</p>
    </header>

    <div class="ref-list">
      <a class="ref-card" href="https://zh.wikipedia.org/wiki/%E4%B8%89%E8%BB%8D%E6%A3%8B" target="_blank" rel="noopener noreferrer">
        <span class="ref-card__index">01</span>
        <span class="ref-card__body">
          <span class="ref-card__title">維基百科・三軍棋</span>
          <span class="ref-card__url">zh.wikipedia.org/wiki/三軍棋</span>
          <span class="ref-card__desc">歷史源流、棋子說明、30×30 勝負表（本作勝負表即由此解析）。</span>
        </span>
        <span class="ref-card__arrow">↗</span>
      </a>
      <a class="ref-card" href="https://collections.nmth.gov.tw/CollectionContent.aspx?a=132&amp;rno=2010.031.0527.0002" target="_blank" rel="noopener noreferrer">
        <span class="ref-card__index">02</span>
        <span class="ref-card__body">
          <span class="ref-card__title">國立臺灣歷史博物館・典藏棋盤紙</span>
          <span class="ref-card__url">collections.nmth.gov.tw・2010.031.0527.0002</span>
          <span class="ref-card__desc">館藏三軍棋棋盤紙，可對照傳統棋盤的城門、行營、錨點與鐵路配置。</span>
        </span>
        <span class="ref-card__arrow">↗</span>
      </a>
      <a class="ref-card" href="https://j9981168.pixnet.net/blog/posts/9363276992" target="_blank" rel="noopener noreferrer">
        <span class="ref-card__index">03</span>
        <span class="ref-card__body">
          <span class="ref-card__title">痞客邦・話說棋盤遊戲之「攻位」系列(二)</span>
          <span class="ref-card__url">j9981168.pixnet.net/blog/posts/9363276992</span>
          <span class="ref-card__desc">三軍棋玩法與勝負判定說明：官兵、武器、海戰、空戰、陸海空對決整理。</span>
        </span>
        <span class="ref-card__arrow">↗</span>
      </a>
      <a class="ref-card" href="https://zh.wikipedia.org/wiki/%E9%99%B8%E8%BB%8D%E6%A3%8B" target="_blank" rel="noopener noreferrer">
        <span class="ref-card__index">04</span>
        <span class="ref-card__body">
          <span class="ref-card__title">維基百科・陸軍棋</span>
          <span class="ref-card__url">zh.wikipedia.org/wiki/陸軍棋</span>
          <span class="ref-card__desc">三軍棋的前身棋類；可比較棋盤、棋子與隱藏資訊機制的異同。</span>
        </span>
        <span class="ref-card__arrow">↗</span>
      </a>
      <a class="ref-card" href="https://zh.wikipedia.org/wiki/%E9%99%B8%E6%B5%B7%E7%A9%BA%E8%BB%8D%E6%A3%8B" target="_blank" rel="noopener noreferrer">
        <span class="ref-card__index">05</span>
        <span class="ref-card__body">
          <span class="ref-card__title">維基百科・陸海空軍棋</span>
          <span class="ref-card__url">zh.wikipedia.org/wiki/陸海空軍棋</span>
          <span class="ref-card__desc">三軍棋的中國原版；台灣版在此基礎上增刪棋子、形成今日樣貌。</span>
        </span>
        <span class="ref-card__arrow">↗</span>
      </a>
    </div>

    <h3>技術與致謝</h3>
    <ul class="rule-list">
      <li><strong>3D 引擎：</strong>three.js（vanilla ES modules、無建置流程、離線可玩）。</li>
      <li><strong>字體：</strong>系統字體堆疊（Noto Sans TC／PingFang TC／Microsoft JhengHei 等），不使用外部字型 CDN。</li>
      <li><strong>圖示：</strong>內嵌 SVG 與 CSS 幾何圖形；不使用外部圖片。</li>
      <li><strong>音效：</strong>WebAudio 程序合成，無外部音檔。</li>
      <li><strong>AI：</strong>以隱藏資訊推理與有限深度搜尋實作；AI 不會讀取你未曝光的棋種。</li>
    </ul>

    <div class="rule-callout">
      <div class="rule-callout__title">版本資訊</div>
      <p>三軍棋 3D・數位版 v1.0。規格權威：<code>DESIGN.md</code>；棋子資料：<code>src/core/pieces.js</code>；勝負表：<code>src/core/combat-table.json</code>。若你發現規則頁與實際判定不一致，請以遊戲內引擎判定為準，並回報給開發者。</p>
    </div>

    <p class="rules-end">— 祝棋運昌隆，奪旗得勝 —</p>
  </section>

</div>
`;
