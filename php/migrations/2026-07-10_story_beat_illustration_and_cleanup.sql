-- 2つの対応をまとめた1本のSQLスクリプト(`php/migrate.php`・`php/schema.sql`に加えた
-- 変更と同内容を、ADMIN_KEY保護のHTTPエンドポイントを経由せず直接実行できるようにしたもの。
-- `php/migrations/2026-07-08_story_beats.sql`と同じ方針)。
--
-- 1. `story_beats.illustration_url` 列の追加(各話の挿絵表示用)。
-- 2. 第1章の各話outlineに含まれていた「適宜、デッキメンバーの〜を挟んでください」という
--    執筆メモ(AIにデッキメンバーを自動で活躍させる指示、`src/lib/stories/prompt.ts`側は
--    既に廃止済み)をDBからも削除し、あわせて各話の挿絵を`illustration_url`に紐付ける。
--
-- 本番環境は既にこのアプリのサンドボックスから到達できないため、この1本を
-- ADMIN_KEY保持者(開発者本人)が本番DBに対して直接実行すること。
-- 実行前に対象行の存在を確認し(下記SELECT)、実行後の結果も確認すること。

-- 実行前の確認用(第1章の各話outlineに旧メモが残っているか)。
-- 注意: この時点では illustration_url 列はまだ存在しないため、この列は含めない。
SELECT id, sort_order, title, outline
FROM story_beats
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
ORDER BY sort_order ASC;

-- 1. `illustration_url`列の追加(未追加の場合のみ実行すること。既に列がある場合は
--    このALTERはエラーになるため読み飛ばす)。
ALTER TABLE story_beats ADD COLUMN illustration_url TEXT NULL AFTER outline;

-- 2-a. 第1章の各話outlineから「適宜、デッキメンバーの〜を挟んでください」を削除する。
-- (該当の1文の直前の改行ごと取り除く。他の話には該当文が無いため対象外。)
UPDATE story_beats
SET outline = REPLACE(outline, '\n適宜、デッキメンバーとの最初の挨拶を挟んでください。', '')
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第二話 ねぎじぃの集落';

UPDATE story_beats
SET outline = REPLACE(outline, '\n適宜、デッキメンバーのエピソードを挟んでください。', '')
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第三話 森の異変';

UPDATE story_beats
SET outline = REPLACE(outline, '\n適宜、デッキメンバーのパワーアップした様子の会話を挟んでください。', '')
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第四話 マッツンのご加護';

UPDATE story_beats
SET outline = REPLACE(outline, '\n適宜、デッキメンバーとの会話を挟んでください。', '')
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第五話 集落最大の脅威';

UPDATE story_beats
SET outline = REPLACE(outline, '\n適宜、デッキメンバーとのシリアスな会話を入れてください。', '')
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第六話 山の主との決戦';

UPDATE story_beats
SET outline = REPLACE(outline, '\n適宜、デッキメンバーの意外な一面が出る会話・エピソードを入れてください。', '')
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = 'エンディング 宴会';

-- 2-b. 第1章の各話・戦闘イベントに挿絵を紐付ける(`story/第1章/第N話_挿絵.png`を
-- `public/story/chapter1/beat0N.png`に配置済み。プロローグ・第六話・ボス戦(山の主)には
-- 対応する挿絵が無いため未設定のまま)。
UPDATE story_beats SET illustration_url = '/story/chapter1/beat01.png'
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第一話 妖精マッツンとの出会い';

UPDATE story_beats SET illustration_url = '/story/chapter1/beat02.png'
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第二話 ねぎじぃの集落';

UPDATE story_beats SET illustration_url = '/story/chapter1/beat03.png'
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第三話 森の異変';

UPDATE story_beats SET illustration_url = '/story/chapter1/beat04.png'
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '雑魚戦(森のモンスター)';

UPDATE story_beats SET illustration_url = '/story/chapter1/beat05.png'
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第四話 マッツンのご加護';

UPDATE story_beats SET illustration_url = '/story/chapter1/beat06.png'
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第五話 集落最大の脅威';

UPDATE story_beats SET illustration_url = '/story/chapter1/beat07.png'
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = '第七話';

UPDATE story_beats SET illustration_url = '/story/chapter1/beat08.png'
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  AND title = 'エンディング 宴会';

-- 実行後の確認用。
SELECT id, sort_order, title, outline, illustration_url
FROM story_beats
WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
ORDER BY sort_order ASC;
