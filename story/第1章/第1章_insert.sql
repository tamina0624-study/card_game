-- 第1章「はじまりのカード」を story_chapters + story_beats に登録するSQL。
--
-- 章内に複数の「ストーリー」「戦闘イベント」を任意の順序で登録できる新設計
-- (`story_beats`、`php/schema.sql`・`php/stories.php`参照)に合わせて、`story/第1章`の
-- 原稿を「話」単位のビートへ分割している。原稿中の「戦闘イベントを挟んでください」は
-- 実際の戦闘ビート(beat_type='battle')そのものに置き換わったため本文には含めていない。
-- 各話末尾の「適宜、デッキメンバーの〜を挟んでください」という執筆メモは、その話を
-- 生成するAIへの指示として各ビートのoutlineにそのまま残している。
--
-- 戦闘ビートの対戦相手デッキ(雑魚戦=森のモンスター、ボス戦=山の主)はまだDBに
-- 用意されていないため、いったん deck_id = NULL(準備中)で登録する。デッキ・
-- マスコットキャラクター(マッツン)を用意できたら、下記の update-beat 相当のUPDATE文
-- (末尾にコメントで例を記載)で後から紐付けること。
--
-- 実行前に、章番号1が未使用であることを確認すること(UNIQUE KEY制約があるため、
-- 既に使われていればINSERTはエラーになる)。
SELECT * FROM story_chapters WHERE chapter_number = 1;

-- 上のSELECTで0件だったら、以下を実行する。

INSERT INTO story_chapters (chapter_number, title, outline)
VALUES (
  1,
  'はじまりのカード',
  'カードに導かれ「カードワールド」へ迷い込んだ主人公が、妖精マッツン・長老ねぎじぃと出会い、森を脅かす黒い結晶の異変に立ち向かう波乱の第一章。'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  0,
  'story',
  'プロローグ',
  '主人公は、ごく普通の生活を送っていた。
ある日、古びたカードショップで一枚だけ光り輝くカードを手に取る。
カードには見たこともない紋章が描かれていた。
「このカードは…？」
その瞬間、カードが強い光を放ち、主人公は意識を失う。
目を覚ますと、そこは空に巨大なカードが浮かぶ不思議な世界だった。'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  1,
  'story',
  '第一話 妖精マッツンとの出会い',
  '主人公の前に、小さな妖精が現れる。
「やっと来てくれた！」
妖精の名前はマッツン。
マッツンは、この世界が「カードワールド」と呼ばれる場所であることを説明する。
かつてこの世界では、人とモンスターが共存していた。
しかし最近になって、モンスターが突然凶暴化する、森や大地の魔力が乱れる、各地の守護者が姿を消した、という異変が起きている。
原因はまだ分かっていない。
主人公は元の世界へ帰る方法を尋ねる。
マッツンは少し困った顔をして言う。
「異変を止めない限り、帰る方法は見つからないと思う。」
こうして主人公は、この世界を救う旅に出ることになる。'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  2,
  'story',
  '第二話 ねぎじぃの集落',
  '近くの集落へ向かうと、村長のような老人、ねぎじぃが迎えてくれる。
ねぎじぃは主人公を見るなり、
「ほぉ…マッツン様に選ばれた者か。」
と言う。
事情を聞いたねぎじぃは、
「一人では危険じゃ。」
と言って、頼もしい仲間を紹介してくれる。
ここでプレイヤーは最初のデッキを入手する。
適宜、デッキメンバーとの最初の挨拶を挟んでください。'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  3,
  'story',
  '第三話 森の異変',
  'ねぎじぃは困った表情で話す。
「最近、森のモンスターが突然狂暴になってな…畑も家畜も荒らされておる。」
話をしている最中、村人が慌てて駆け込んでくる。
「大変だ！またモンスターが来た！」
主人公たちは急いで現場へ向かう。
ここがゲーム最初のバトルになる。
適宜、デッキメンバーのエピソードを挟んでください。'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, deck_id)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  4,
  'battle',
  '雑魚戦(森のモンスター)',
  NULL
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  5,
  'story',
  '第四話 マッツンのご加護',
  'モンスターを倒すと、倒れた魔物から黒い霧のようなものが空へ消えていく。
それを見たマッツンが驚く。
「やっぱり…この黒い力が原因なんだ！」
するとマッツンが光り始める。
主人公たちは優しい光に包まれ、新たな力を宿す。
マッツンは照れながら言う。
「えへへ。少しだけ力を分けてあげたよ。」
適宜、デッキメンバーのパワーアップした様子の会話を挟んでください。'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  6,
  'story',
  '第五話 集落最大の脅威',
  'しかし安心したのも束の間、村人から新たな報告が入る。
「山奥にいる巨大な魔物が動き始めた！」
ねぎじぃは顔を青くする。
「あやつは昔から山の主じゃ。普段は人を襲わぬ。あれほど怒っておる姿は見たことがない。」
主人公たちは山へ向かう。道中では少し強い敵と戦いながら進んでいく。
適宜、デッキメンバーとの会話を挟んでください。'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  7,
  'story',
  '第六話 山の主との決戦',
  '山頂には巨大なモンスターが待ち構えていた。体中から黒いオーラを放っている。
マッツンが叫ぶ。
「あれは完全に黒い魔力に支配されてる！」
適宜、デッキメンバーとのシリアスな会話を入れてください。'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, deck_id)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  8,
  'battle',
  'ボス戦(山の主)',
  NULL
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  9,
  'story',
  '第七話',
  'ボスを倒すと、黒い結晶が砕け、巨大な魔物は元の穏やかな姿へ戻る。
魔物は主人公たちへ静かに頭を下げ、森の奥へ帰っていく。
マッツンは確信する。
「やっぱり原因は"黒い結晶"だ。」'
);

INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline)
VALUES (
  (SELECT id FROM story_chapters WHERE chapter_number = 1),
  10,
  'story',
  'エンディング 宴会',
  '集落では皆が大喜び。村人総出で宴会が開かれる。料理が並び、子どもたちは主人公を英雄と呼ぶ。
ねぎじぃは酒を飲みながら言う。
「久しぶりに笑顔が戻ったわい。」
その夜、主人公は星空を見上げる。するとマッツンが隣へ飛んでくる。
「でもね……この程度じゃ終わらないよ。」
マッツンは遠くの空を見つめる。その先では、どこか遠い大陸から、さらに巨大な黒い光が立ち昇っていた。
「異変は、この世界中で起きている。」
主人公は静かに立ち上がる。
「よし。次の町へ行こう。」
マッツンは笑顔でうなずく。
「うん！一緒に世界を救おう！」
こうして主人公たちの本当の冒険が始まる。
適宜、デッキメンバーの意外な一面が出る会話・エピソードを入れてください。'
);

-- 登録結果の確認用。
SELECT * FROM story_chapters WHERE chapter_number = 1;
SELECT * FROM story_beats WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1)
  ORDER BY sort_order ASC;

-- マッツンをこの章のマスコットに設定する場合(マッツンのcharacters.idが分かってから):
-- UPDATE story_chapters SET mascot_character_id = <マッツンのid> WHERE chapter_number = 1;

-- 雑魚戦・ボス戦の対戦相手デッキを後から紐付ける場合(該当デッキのdecks.idが分かってから):
-- UPDATE story_beats SET deck_id = <森のモンスターデッキのid>
--   WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1) AND title = '雑魚戦(森のモンスター)';
-- UPDATE story_beats SET deck_id = <山の主デッキのid>
--   WHERE story_chapter_id = (SELECT id FROM story_chapters WHERE chapter_number = 1) AND title = 'ボス戦(山の主)';
-- (UPDATEしたデッキは decks.is_story_enemy を手動で1にすることを忘れずに。
--  APIのaction=update-beat経由で登録した場合はこれも自動で行われる。)
