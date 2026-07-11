-- 第1章の戦闘ビート2件(雑魚戦「森のモンスター」・ボス戦「山の主」)に対戦相手デッキを
-- 用意し、`story_beats.deck_id` を紐付けるスクリプト。`story/第1章/第1章_insert.sql`実行時点
-- ではまだ対戦相手デッキが無く deck_id = NULL(準備中)のままだった箇所を埋める
-- (`story/第1章/第1章_insert.sql`末尾のコメント参照)。
--
-- 本番環境はこのアプリのサンドボックスから到達できないため、ADMIN_KEY保持者(開発者本人)が
-- 本番DBに対して直接実行すること。
--
-- キャラクターは8体×2デッキ(前衛4・控え4、`docs/設計.md`「1デッキは8枚、前衛4・控え4」)。
-- 序盤(チュートリアル)のバトルのため、パラメーター合計はプレイヤーキャラクターの上限
-- 100ptよりもかなり低い弱めの数値にしてある(雑魚戦は29〜36pt、ボス戦は32〜54pt。
-- ボス戦のみ山の主本体を35pt前後の他より少し強い54ptにして「ボスらしさ」を出している)。
-- いずれも`is_system = 1`(サンプルキャラクターと同じ扱い。編集・削除不可、全ユーザーの
-- キャラクター一覧に表示される)。画像(`image_url`)は雑魚戦・ボス戦とも8体全員分を設定済み
-- (雑魚戦=凶暴化角獣+雑魚モンスター7体、ボス戦=黒き山の主+取り巻き7体)。
--
-- 重要: 上記`image_url`は既存の他キャラクターと同じ規約(`php/config.php`の
-- ASSET_BASE_URL + '/characters/sample/<ファイル名>')に合わせた絶対URLにしてある。
-- この画像ファイル(`public/characters/sample/chapter1-mob.png`・`chapter1-mob2.png`〜
-- `chapter1-mob8.png`・`chapter1-boss.png`・`chapter1-boss2.png`〜`chapter1-boss8.png`、
-- このNext.jsリポジトリに追加済み)は、Next.js本体(Render)とは別にスターサーバー側
-- (`ASSET_BASE_URL`が指す実体、`public_html/card_game/public/characters/sample/`)にも
-- 同じファイル名でアップロードしないと実際には表示されない。このアプリのサンドボックスは
-- スターサーバーへ到達できないため、そちらへのアップロードは開発者本人が行うこと。
--
-- 実行前の確認用(対象の戦闘ビートがまだdeck_id未設定か)。
SELECT id, sort_order, title, deck_id
FROM story_beats
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND beat_type = 'battle';

-- ============================================================
-- 1. 雑魚戦「森のモンスター」用キャラクター8体
-- ============================================================

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '凶暴化角獣',
  '黒い力に当てられ、愛らしい姿のまま凶暴になってしまった小さな角獣。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-mob.png',
  36,
  1
);
SET @mob1 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@mob1, '攻撃', 14, 0), (@mob1, '防御', 6, 1), (@mob1, '素早さ', 10, 2), (@mob1, '体力', 6, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@mob1, '牙の一撃', '前方の敵に鋭い牙で噛みつく。', 'ガアアッ!', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '棘のイバラガニ',
  '体中に棘を纏った、森に棲む小型の魔物。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-mob2.png',
  34,
  1
);
SET @mob2 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@mob2, '攻撃', 8, 0), (@mob2, '防御', 14, 1), (@mob2, '素早さ', 4, 2), (@mob2, '体力', 8, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@mob2, '棘のギロチン', '硬い棘に覆われた鋏で挟み込む。', 'カチカチッ…', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '青スライム',
  '森のあちこちに現れる、ぷるぷるとした青いスライム。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-mob3.png',
  32,
  1
);
SET @mob3 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@mob3, '攻撃', 6, 0), (@mob3, '防御', 8, 1), (@mob3, '素早さ', 4, 2), (@mob3, '体力', 14, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@mob3, '酸の飛沫', '体の一部を飛ばし、酸で攻撃する。', 'ぷるん…', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '毒キノコウォーカー',
  '毒々しい胞子を放ちながら歩き回るキノコ型の魔物。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-mob4.png',
  30,
  1
);
SET @mob4 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@mob4, '攻撃', 10, 0), (@mob4, '防御', 5, 1), (@mob4, '素早さ', 7, 2), (@mob4, '体力', 8, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@mob4, '胞子まき散らし', '毒々しい胞子を周囲にまき散らす。', 'ぽふっ', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '荒ぶるイノシシ',
  '黒い霧を浴び、気性が荒くなってしまったイノシシ。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-mob5.png',
  33,
  1
);
SET @mob5 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@mob5, '攻撃', 12, 0), (@mob5, '防御', 7, 1), (@mob5, '素早さ', 8, 2), (@mob5, '体力', 6, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@mob5, '猪突猛進', '勢いよく体当たりする。', 'ブモォォ!', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  'コウモリの群れ',
  '洞穴からあふれ出た、落ち着きのないコウモリたち。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-mob6.png',
  29,
  1
);
SET @mob6 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@mob6, '攻撃', 8, 0), (@mob6, '防御', 4, 1), (@mob6, '素早さ', 13, 2), (@mob6, '体力', 4, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@mob6, '超音波旋回', '甲高い音で敵を混乱させる。', 'キィィ!', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '森ゴブリン見習い',
  'まだ戦い慣れていない、森の見習いゴブリン。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-mob7.png',
  29,
  1
);
SET @mob7 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@mob7, '攻撃', 9, 0), (@mob7, '防御', 6, 1), (@mob7, '素早さ', 7, 2), (@mob7, '体力', 7, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@mob7, '木の棍棒ふりまわし', '拾った棍棒を無造作に振り回す。', 'ウキャ!', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '苔まみれトレント',
  '長年森に立ち、苔むしてしまった小さな木の魔物。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-mob8.png',
  32,
  1
);
SET @mob8 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@mob8, '攻撃', 6, 0), (@mob8, '防御', 14, 1), (@mob8, '素早さ', 2, 2), (@mob8, '体力', 10, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@mob8, '根の絡めとり', '根を伸ばして相手の足を絡めとる。', 'ズズズ…', 0);

INSERT INTO decks (name, owner_name, is_story_enemy) VALUES ('森のモンスター', 'システム', 1);
SET @mobDeck = LAST_INSERT_ID();
INSERT INTO deck_cards (deck_id, character_id, role, slot_order) VALUES
  (@mobDeck, @mob1, 'front', 0),
  (@mobDeck, @mob2, 'front', 1),
  (@mobDeck, @mob3, 'front', 2),
  (@mobDeck, @mob4, 'front', 3),
  (@mobDeck, @mob5, 'bench', 0),
  (@mobDeck, @mob6, 'bench', 1),
  (@mobDeck, @mob7, 'bench', 2),
  (@mobDeck, @mob8, 'bench', 3);

UPDATE story_beats SET deck_id = @mobDeck
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '雑魚戦(森のモンスター)';

-- ============================================================
-- 2. ボス戦「山の主」用キャラクター8体(先頭が山の主本体、残りは取り巻き)
-- ============================================================

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '黒き山の主',
  'かつては穏やかだった山の守護者。黒い結晶の力に支配され、凶暴化してしまった。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-boss.png',
  54,
  1
);
SET @boss1 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@boss1, '攻撃', 18, 0), (@boss1, '防御', 14, 1), (@boss1, '素早さ', 6, 2), (@boss1, '体力', 16, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@boss1, '黒き雄叫び', '山を揺るがす咆哮で敵を威圧する。', 'グオオオオオ…!', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '憑かれた岩ワシ',
  '山の主に従う、黒い力に当てられた岩場のワシ。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-boss2.png',
  35,
  1
);
SET @boss2 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@boss2, '攻撃', 11, 0), (@boss2, '防御', 8, 1), (@boss2, '素早さ', 10, 2), (@boss2, '体力', 6, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@boss2, '急降下爪撃', '高空から一気に舞い降り、鋭い爪で切り裂く。', 'キィエェェ!', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '黒霧のオオカミ',
  '黒い霧をまとい、山を徘徊するオオカミ。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-boss3.png',
  36,
  1
);
SET @boss3 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@boss3, '攻撃', 13, 0), (@boss3, '防御', 6, 1), (@boss3, '素早さ', 11, 2), (@boss3, '体力', 6, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@boss3, '黒霧の牙', '黒い霧をまとった牙で噛みつく。', 'グルルル…', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '呪われた山猿',
  '黒い力に触れ、気性が荒くなってしまった山猿。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-boss4.png',
  35,
  1
);
SET @boss4 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@boss4, '攻撃', 10, 0), (@boss4, '防御', 8, 1), (@boss4, '素早さ', 9, 2), (@boss4, '体力', 8, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@boss4, '石つぶて乱舞', '山肌の石を次々と投げつける。', 'キキーッ!', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '黒水晶のコウモリ',
  '黒い結晶の欠片に引き寄せられたコウモリ。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-boss5.png',
  32,
  1
);
SET @boss5 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@boss5, '攻撃', 9, 0), (@boss5, '防御', 5, 1), (@boss5, '素早さ', 12, 2), (@boss5, '体力', 6, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@boss5, '反響波', '反響する音波で敵の感覚を狂わせる。', 'シャアァ…', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '山肌のイワトカゲ',
  '山肌に張り付くように暮らす、硬い皮膚のトカゲ。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-boss6.png',
  34,
  1
);
SET @boss6 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@boss6, '攻撃', 8, 0), (@boss6, '防御', 14, 1), (@boss6, '素早さ', 4, 2), (@boss6, '体力', 8, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@boss6, '岩肌の体当たり', '硬い体でそのままぶつかってくる。', 'ゴツン', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '濁流のカワウソ',
  '山を流れる川に棲む、素早いカワウソ。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-boss7.png',
  33,
  1
);
SET @boss7 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@boss7, '攻撃', 9, 0), (@boss7, '防御', 6, 1), (@boss7, '素早さ', 11, 2), (@boss7, '体力', 7, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@boss7, '水しぶき乱打', '素早く動き回り、水しぶきを浴びせる。', 'バシャッ!', 0);

INSERT INTO characters (name, description, image_url, total_points, is_system)
VALUES (
  '黒い霧の残滓',
  '黒い結晶から漏れ出た霧が、うっすらと形を成したもの。',
  'http://ss181301.stars.ne.jp/card_game/public/characters/sample/chapter1-boss8.png',
  33,
  1
);
SET @boss8 = LAST_INSERT_ID();
INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES
  (@boss8, '攻撃', 7, 0), (@boss8, '防御', 10, 1), (@boss8, '素早さ', 6, 2), (@boss8, '体力', 10, 3);
INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES
  (@boss8, '纏わりつく霧', 'じわりと霧を纏わりつかせ、動きを鈍らせる。', 'モワ…', 0);

INSERT INTO decks (name, owner_name, is_story_enemy) VALUES ('山の主', 'システム', 1);
SET @bossDeck = LAST_INSERT_ID();
INSERT INTO deck_cards (deck_id, character_id, role, slot_order) VALUES
  (@bossDeck, @boss1, 'front', 0),
  (@bossDeck, @boss2, 'front', 1),
  (@bossDeck, @boss3, 'front', 2),
  (@bossDeck, @boss4, 'front', 3),
  (@bossDeck, @boss5, 'bench', 0),
  (@bossDeck, @boss6, 'bench', 1),
  (@bossDeck, @boss7, 'bench', 2),
  (@bossDeck, @boss8, 'bench', 3);

UPDATE story_beats SET deck_id = @bossDeck
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = 'ボス戦(山の主)';

-- 実行後の確認用。
SELECT id, sort_order, title, deck_id
FROM story_beats
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND beat_type = 'battle';
SELECT * FROM decks WHERE id IN (@mobDeck, @bossDeck);
SELECT * FROM deck_cards WHERE deck_id IN (@mobDeck, @bossDeck) ORDER BY deck_id, role, slot_order;
