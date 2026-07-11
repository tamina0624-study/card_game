-- `2026-07-10_chapter1_battle_decks.sql` は単純なINSERTのみで冪等ではないため、
-- (雑魚モンスターの`image_url`追加前に1回・追加後にもう1回、のように)複数回実行すると
-- 雑魚戦「森のモンスター」・ボス戦「山の主」のキャラクター16体・デッキ2件・deck_cardsが
-- 二重に登録されてしまう。このスクリプトは、その重複を安全に解消する。
--
-- 方針:
--   1. `story_beats.deck_id`が「今まさに参照しているデッキ」を正として残し、
--      同名(森のモンスター/山の主、is_story_enemy=1)の別デッキは削除する。
--      (`deck_cards.deck_id`にON DELETE CASCADEがあるため、削除したデッキの
--      deck_cardsも連動して消える。`story_beats.deck_id`にはON DELETE SET NULLがあるが、
--      参照中のデッキ自体は消さないのでstory_beats側は影響を受けない。)
--   2. 上記1でどのdeck_cardsからも参照されなくなった重複キャラクターを削除する。
--      (`character_parameters`・`special_moves`はON DELETE CASCADEで自動的に消える。)
--      自己結合で「同名の別キャラクターが残っている場合のみ」削除するため、
--      重複が無い名前や、誤って同名キャラクターを全滅させてしまう事故は起きない。
--
-- 本番環境はこのアプリのサンドボックスから到達できないため、ADMIN_KEY保持者(開発者本人)が
-- 本番DBに対して直接実行すること。実行前に必ず下記SELECTで重複件数を確認し、
-- 実行後の結果(件数がすべて1件ずつ、image_urlが設定済みになっているか)も確認すること。
--
-- 万一、重複していた方のキャラクターが既に`battles.mvp_character_id`として使われていた場合は
-- 外部キー制約でDELETEがエラーになる(=データを壊さず安全に止まる)。その場合は該当行を
-- 個別に確認のうえ、このスクリプトを流用して手動で対処すること。

-- ============================================================
-- 実行前の確認用(名前ごとの件数。2件以上あれば重複)。
-- ============================================================
SELECT name, COUNT(*) AS cnt
FROM characters
WHERE is_system = 1
  AND name IN (
    '凶暴化角獣', '棘のイバラガニ', '青スライム', '毒キノコウォーカー',
    '荒ぶるイノシシ', 'コウモリの群れ', '森ゴブリン見習い', '苔まみれトレント',
    '黒き山の主', '憑かれた岩ワシ', '黒霧のオオカミ', '呪われた山猿',
    '黒水晶のコウモリ', '山肌のイワトカゲ', '濁流のカワウソ', '黒い霧の残滓'
  )
GROUP BY name
ORDER BY name;

SELECT id, name, is_story_enemy FROM decks WHERE name IN ('森のモンスター', '山の主');

SELECT id, sort_order, title, deck_id
FROM story_beats
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND beat_type = 'battle';

-- ============================================================
-- 修正本体
-- ============================================================
START TRANSACTION;

-- 1. story_beatsが現在参照していない方の同名デッキを削除(deck_cardsも連動して削除される)。
DELETE FROM decks
WHERE name = '森のモンスター'
  AND is_story_enemy = 1
  AND id <> (
    SELECT deck_id FROM story_beats
    WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
      AND title = '雑魚戦(森のモンスター)'
  );

DELETE FROM decks
WHERE name = '山の主'
  AND is_story_enemy = 1
  AND id <> (
    SELECT deck_id FROM story_beats
    WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
      AND title = 'ボス戦(山の主)'
  );

-- 2. どのdeck_cardsからも参照されなくなった重複キャラクターを削除。
--    (同じ名前のキャラクターが自分以外にもう1件残っている場合のみが対象。
--     生き残るデッキが使っている方は必ずdeck_cardsから参照されているため削除されない。)
DELETE t1 FROM characters t1
JOIN characters t2
  ON t2.name = t1.name AND t2.is_system = 1 AND t2.id <> t1.id
WHERE t1.is_system = 1
  AND t1.name IN (
    '凶暴化角獣', '棘のイバラガニ', '青スライム', '毒キノコウォーカー',
    '荒ぶるイノシシ', 'コウモリの群れ', '森ゴブリン見習い', '苔まみれトレント',
    '黒き山の主', '憑かれた岩ワシ', '黒霧のオオカミ', '呪われた山猿',
    '黒水晶のコウモリ', '山肌のイワトカゲ', '濁流のカワウソ', '黒い霧の残滓'
  )
  AND NOT EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.character_id = t1.id);

COMMIT;

-- ============================================================
-- 実行後の確認用(すべて1件ずつ・image_urlが設定済みになっていればOK)。
-- ============================================================
SELECT name, COUNT(*) AS cnt
FROM characters
WHERE is_system = 1
  AND name IN (
    '凶暴化角獣', '棘のイバラガニ', '青スライム', '毒キノコウォーカー',
    '荒ぶるイノシシ', 'コウモリの群れ', '森ゴブリン見習い', '苔まみれトレント',
    '黒き山の主', '憑かれた岩ワシ', '黒霧のオオカミ', '呪われた山猿',
    '黒水晶のコウモリ', '山肌のイワトカゲ', '濁流のカワウソ', '黒い霧の残滓'
  )
GROUP BY name
ORDER BY name;

SELECT id, name FROM decks WHERE name IN ('森のモンスター', '山の主');

SELECT d.name AS deck_name, dc.role, dc.slot_order, c.id, c.name, c.image_url
FROM deck_cards dc
JOIN decks d ON d.id = dc.deck_id
JOIN characters c ON c.id = dc.character_id
WHERE d.name IN ('森のモンスター', '山の主')
ORDER BY d.name, dc.role, dc.slot_order;
