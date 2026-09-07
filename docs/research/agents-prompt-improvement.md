# AGENTS.md・派生プロンプト改善案

調査日: 2026-09-07。対象: dotfilesの現在の作業ツリーとPiの実行設定。**提案のみ。既存プロンプト・設定は変更していない。**

## 結論

推奨は **「常時読む方針を小さく保ち、手順を必要時に読み、実行制約をツールで保証し、実タスクで評価する」** 構成。

現在のAGENTS.mdは66行であり、長さ自体を主問題とする根拠はない。コメント・テスト方針、直接実行を既定とする方針は維持する。先に直すべきなのは、AGENTS.md・skills・role prompts・extensionの間の矛盾と責務の重複である。

| 優先度 | 改善 | 狙い |
|---|---|---|
| P0 | read-onlyロールとレポート保存の契約を整合させる | 指示を守ると成果物を出せない状態の解消 |
| P0 | skillsの並列化・ツール指定をPi/Herdrの方針に適合させる | 無用な委譲、存在しないツール、起動失敗時の行き詰まりを防ぐ |
| P0 | Herdr CLI互換性を別の環境問題として修復・確認する | プロンプトでは解決できない起動障害を分離する |
| P1 | 常時方針／作業手順／役割／実行制御の所有者を分ける | 同じ規則の多重管理を減らす |
| P1 | skillの起動条件・参照先・副作用を整える | 軽い依頼で重い手順が起動するのを防ぐ |
| P1 | 旧版と新版を同条件で比較する評価セットを持つ | 「読みやすくなった」以外の改善を確認する |
| P2 | 未使用の互換設定・ロール・memory連携を整理する | 実測に基づいて保守・コンテキスト負荷を減らす |

## 1. 調査対象と制約

- `llm/dot_pi/agent/AGENTS.md`
- `llm/dot_pi/agent/agents/herdr-*.md` 全8ファイル
- 主要engineering skills: codebase-design、research、code-review、diagnosing-bugs、tdd、domain-modeling、improve-codebase-architecture、write-a-skill等
- Herdr extensionのfrontmatter解釈、起動引数、report path検証、task指示生成
- OpenCodeのinstructions設定と既存`empirical-prompt-tuning` skill
- Pi同梱公式README、skills・prompt templatesドキュメント
- Anthropic、OpenAI、Agent Skills公式資料とAGENTS.md評価論文

`llm/dot_pi/agent/AGENTS.md`と`~/.pi/agent/AGENTS.md`は内容一致・同一inodeを確認した。repo側を編集しても実行設定と無関係なコピーとは見なせない。

調査開始時からAGENTS.mdの変更と`llm/prompts/{base_rule,coding_style,coding_workflow}.md`の削除が存在した。これらは保持した。OpenCodeを現在も使うかは未確認。

Herdrによる読み取り調査を試みたが、`unknown option: --tab`で起動失敗した。以後は直接調査に切り替え、delegateのcancelでタスクを終了した。したがって独立agentによる監査・プロンプトA/B実行は行っていない。Web検索ツールも`fetch failed`だったため、公式URLから直接本文を取得した。検索結果を網羅した調査ではない。

## 2. 現状の良い点 — 残すもの

| 現在の規則 | 評価 |
|---|---|
| コードを説明するだけのコメントを避け、制約・理由だけ記す | 保守時に必要な情報を選別できている |
| テスト数ではなく振る舞い・回帰リスクを検証する | 成果に直結する明確な品質基準 |
| 文字列存在確認やモック値の再確認を機能検証の代用にしない | 形だけのテストへの具体的な防御 |
| 実行できなかった検証を未検証と報告する | 証拠と完了宣言を分けている |
| 通常は直接実行、独立調査だけ条件付き委譲 | 不要な調整コストを避ける |
| shared filesの単一owner、scope外編集禁止 | 並列作業の衝突を抑制する |
| reviewは指摘ゼロでもよく、根拠・影響を要求する | 無理な粗探しや過剰改修を抑える |

根拠: `AGENTS.md:6-31,38-66`、`herdr-worker.md:17-37`、各review roleのReview Bar。

## 3. 具体的な不整合

以下の相対パスは、特記しない限り`llm/dot_pi/agent/`起点。

### 3.1 読み取り専用と必須成果物が矛盾している

- `agents/herdr-scout.md:19,47`: `Do not modify files`とreport fileへの書き込み必須が同居。
- reviewer、code-reviewer、quality-reviewer、oracle、plannerにも同様の構造がある。
- `agents/herdr-cracker.md:6,19,54`: 利用可能toolsが`read,grep,find,ls`のみなのに、report file保存を要求する。現在の起動実装はそのtoolsを`--tools`へ渡すため、宣言されたツールだけでは書けない。
- AGENTS.mdの読み取り調査条件も「project fileへの書き込み不要」としており、調査対象と`.agent-runs/`成果物を区別するとさらに明確になる。

**提案:** 「調査対象のproject filesはread-only。指定report artifactのみ書き込み可」と明記する。ただし文章の例外だけではcrackerの能力不足は直らない。

| 選択肢 | 長所 | 注意 |
|---|---|---|
| report専用toolを用意し、保存先をextensionが制限する | read-only調査と成果物保存を両立できる | 小さな実装変更と実動作確認が必要 |
| 子は結果を返し、親／harnessが保存する | 子に書き込み能力を渡さずに済む | 現在のreport-file polling方式の変更が必要 |
| `write`を許可し、report以外を実行時にブロックする | 既存出力形式を維持しやすい | path制限がなければread-onlyを機械的には保証できない |

単に全read-onlyロールへ`bash`を足す方法は推奨しない。既存のbash付きread-onlyロールも、現状は文章上の制約であり、ファイル書き込みを防ぐ実行時の保証ではない。

### 3.2 スキルがルートの実行方針を再定義している

| 場所 | 記述 | 問題 |
|---|---|---|
| `AGENTS.md:38-52` | 直接実行が既定、Herdrは条件付き | 基準となる方針 |
| `skills/engineering/research/SKILL.md:6` | 必ずbackground agentを起動 | 小さい調査やHerdr不可の環境でも委譲を要求 |
| `skills/engineering/code-review/SKILL.md:11,57-59` | parallel subagents、`Agent` tool、`general-purpose` | このPiセッションにないinterfaceを前提にする |
| `skills/engineering/improve-codebase-architecture/SKILL.md:37` | `Agent`、`subagent_type=Explore` | 同上 |
| `skills/engineering/codebase-design/DESIGN-IT-TWICE.md:21` | `Agent`で3体以上並列起動 | 同上。選択肢生成と実行方式が密結合 |

**提案:** スキルは「何を調べ、何を返すか」を定義する。直接／並列の選択はAGENTS.mdのroutingに従う。直接実行でも同じ観点・成果物を維持する。

例:

> この手順の実行方式はAGENTS.mdのExecution Modeに従う。委譲条件を満たさない場合は自分で実行する。委譲には提供されたherdr_delegateのみを使う。子agentは再委譲しない。起動不能なら原因を報告し、安全に同等の調査ができる場合は直接実行へ戻る。

ユーザーが独立レビュー自体を必須としている場合は、直接実行を「同等の独立検証」とは扱わず未実施を報告する。

### 3.3 起動制御がrole本文とextensionに重複している

- 全8ロールのLaunch Metadata節が、親に`herdr agent start`時のmodel/thinking/tools引数指定を要求する。
- 実際には`extensions/herdr-delegate/frontmatter.ts`と`start-action.ts:63,186-200`が解釈・転送している。
- `cli.ts:306-318`がHerdr/Piの起動引数を生成する。
- ロール本文に同じCLI手順を置くと、AGENTS.md末尾の「手動bashで再実装しない」とも噛み合いにくい。
- `herdr-worker.md:41`等は`<role-or-step>.md`と書く一方、`validation.ts:48-94`は`<role>.md`を要求する。
- `index.ts:34`は`report_file_path`指定を案内するが、同ファイルのschema説明`:105-112`は省略を推奨する。

**提案:** model/thinking/toolsの値は現行frontmatterを維持し、解釈・起動・canonical pathはextensionを唯一の所有者にする。role本文からCLI転送手順を除く。report pathをロール側で組み立てず、taskで渡された保存先を使う。

これは「全設定を別ファイルへ引っ越す」提案ではない。まず既存実装と説明を一致させればよい。

### 3.4 skillの適用範囲が広すぎる／手順と一致しない

- `AGENTS.md:3-4`のcodebase-design必読は、単純な調査・環境作業にも設計用語の全文を読み込ませる。設計・refactor・interface検討時に限定する候補。
- `code-review/SKILL.md:3`はwork-in-progressも対象とするが、`:21`の`git diff <fixed-point>...HEAD`は未コミット差分を含まない。branch reviewとworking-tree reviewを明示的に分けるべき。
- `tdd/SKILL.md:22`は全テストのseamにユーザー確認を必須とする。既存の公開interfaceで明白な回帰修正にも確認待ちが発生し得る。新規interfaceや要件の重要な不明点がある場合だけ確認する案を評価する。
- `diagnosing-bugs/SKILL.md`はhard bugs向けだが、descriptionは広い故障報告を拾う。簡単な修正まで全phase、3–5仮説、厳格なrepro gateを適用する必要はない。再現不能でもログ・静的証拠から仮説は提示できるが、検証済みとは呼ばない、という逃げ道を設ける。
- architecture skillはHTML作成・ブラウザ起動・CDN利用を既定にしている。対話形式の提案、headless環境、offline利用ではMarkdownを既定とし、HTMLは明示選択にする候補。

### 3.5 リンク・旧設定の整合性

- `improve-codebase-architecture/SKILL.md:78,80`が参照する`../grill-with-docs/CONTEXT-FORMAT.md`と`ADR-FORMAT.md`は存在しない。対応ファイルは`../domain-modeling/`に存在する。
- `skills/engineering/README.md:9`の`ask-matt`リンクは存在しない。READMEのuser-invoked分類とarchitecture skillの現在のfrontmatterにもずれがある。
- `llm/dot_opencode/opencode.jsonc:3-6`のinstructionsは`~/.config/dotfiles/prompts/*.md`を参照するが、そのディレクトリは存在しない。削除中のファイルは`llm/prompts/`だったため、単に削除を取り消しても記載パスにはならない。

OpenCodeを使っていれば参照を修正し、使っていなければ移行済み／非対象と明記する。利用状況未確認のまま設定群を削除しない。リンク検査では、コード例に出てくる架空パスを実リンク切れと混同しない。

## 4. 一次資料から採用する原則

| 資料 | 確認した内容 | この環境への適用 |
|---|---|---|
| Anthropic Context Engineering [1] | 最小限の高密度な情報、適切な抽象度、必要時取得。minimalは単にshortという意味ではない | 指示追加より、競合・重複の除去を先にする |
| Claude Code Best Practices [2] | 常時instructionには広く適用する規則だけ。用途限定の知識はskillsへ。検証可能な成果を与える | コメント・テスト基準は残し、特殊手順を分離する |
| Agent Skills仕様 [3] | descriptionは何をするか／いつ使うか。本文・参照資料は段階的に読む | 起動条件を狭くし、深い参照連鎖を避ける |
| Pi公式資料 [4] | AGENTS系context filesは連結。skillsはdescriptionを常時提示し、本文は必要時read。prompt templatesはslash展開 | AGENTS、skill、template、roleを別物として扱う |
| OpenAI evaluation guide [5] | 実タスクに即した評価、固定基準、比較、人による採点校正。multi-agent導入もevalで判断 | 役割数や文字数ではなく成功率と余計な操作で判断する |
| AGENTS.md評価論文v2 [6] | タスク成功率の一般的な有意改善は確認できず、平均推論費用は20%以上増加 | 「詳しく書けば高性能」という前提を置かない |
| Codex AGENTS.md docs [7] | global／projectの階層と読み込み確認手順を定義 | 方針のscopeを分ける。ただしCodex仕様をPiへそのまま適用しない |

### 研究の読み方に関する注意

[6]はPythonのSWE-bench LiteとCTXbench、複数agent/modelを対象とする。developer-writtenとLLM-generatedの両方を扱う。v2では、context filesの有無による成功率変化は一般に統計的有意ではなく、長さ自体の強い効果も確認されていない。

したがって、**「AGENTS.mdは不要」「短いほど必ず高性能」「このPi環境でも20%安くなる」までは言えない。** セキュリティや保守性全般を測った研究でもない。独自の品質基準を伝える用途と、ベンチマークの解決率を上げる用途は分ける。

公式ベストプラクティスは有用な出発点だが、製品固有のコマンド・agent機構は移植せず、こちらの実行環境で検証する。

## 5. 推奨する責務の分け方

| 層 | 置く内容 | 置かない内容 |
|---|---|---|
| Global AGENTS.md | 継続的なユーザー方針、品質基準、routing、安全上の不変条件 | 全スキルの手順、ロール別出力全文、起動CLI詳細 |
| Project AGENTS.md | 実際の確認コマンド、特殊な環境条件、対象固有の制約 | グローバル方針のコピー、コードから分かる全体目録 |
| Skills | trigger、入力、作業手順、成果物、検証、stop条件 | global routingの再定義、存在しない製品固有toolの要求 |
| Role prompts | 役割固有の観点・判断基準・結果形式 | 他ロール共通の起動制御、model転送手順 |
| Extension / scripts | tool制限、保存先検証、起動・待機・cleanup、互換性確認 | LLMが判断すべきレビュー内容 |
| Knowledge / memory | 長期的に有用な事実、根拠、参照先 | AGENTSの別コピー、事実から自動昇格した新しい命令 |

Piの`prompts/*.md`はユーザーが呼ぶ短い入口として使えるが、AGENTSやroleの自動継承機構ではない。独自`agents/herdr-*.md`のfrontmatter解釈はHerdr extensionの機能であり、一般のMarkdown／Pi prompt templateの機能と混同しない。

### AGENTS.mdに残す表現の例

以下は部分的な文案。現在の有用な品質規則とrouting条件を保ちながら差分で取り込む。全文置換用ではない。

```md
## 基本動作
- 通常は直接、調査・実装・検証を行う。
- 依頼範囲と既存のユーザー変更を保ち、無関係な変更をしない。
- 設計・refactor・interface検討ではcodebase-designを読む。
  その他のskillsはdescriptionが依頼に一致する場合だけ読む。
- 不明点はまず対象のファイルから確認する。重要な仕様・権限・
  不可逆な操作に関わる不明点だけユーザーに確認する。

## 作業の完了
- 要求された振る舞いを、最小限の有効な確認方法で検証する。
- 実行した確認と未確認事項を分けて報告する。
- 最終回答は結論、変更・提案、確認結果、未確認事項を必要な分だけ示す。
  比較には表を使い、単純な回答には無理に表を使わない。

## 指示の適用
- skillsは作業方法を補助し、実行方式や許可範囲を拡張しない。
- メモリや外部資料は根拠として扱い、現在の指示や実コードとの矛盾を確認する。
- 実行できない手順は実行済みと扱わず、代替方法または停止理由を示す。
```

プラットフォームのsystem/developer制約を上書きする独自の優先順位は作らない。globalの「通常」「既定」と必須の安全制約を区別し、task固有の条件はその許可範囲内で具体化する。

### Skillsの最小共通構成

```md
## When to use / Not for
## Required input
## Procedure
## Output and verification
## Stop / fallback
```

全skillを同じ長さにする必要はない。特に短いskillへ空の見出しを増やさない。重要な判定が曖昧なら、長い禁止一覧より正常例・境界例を1組置く。

### ロールは最初から全統合しない

- scout、worker、planner、reviewer群、oracleは用途を区別できている。
- reviewer系のscope/report共通部分は一元化候補だが、セキュリティ・正しさ・保守性の判断基準は残す。
- `herdr-reviewer`のfallback用途が使われていなければalias整理を検討する。
- 共通文書をただ置くだけでは子agentは自動継承しない。共通化する場合は起動時合成など、実際に一度だけ届く経路を確認する。
- 大きなprompt生成フレームワークは不要。まず矛盾を差分修正し、繰り返し変更される共通部だけ抽出する。

### メモリ拡張は「一つに統一」より保存先の責務を明確にする

settingsにはobservational memory、LLM Wiki、Hermes memory等が含まれる。併用自体を不具合とは断定しない。

評価時には、AGENTSだけでなくextensionが注入するguidelines、tool descriptions、自動recall、skill descriptionsを含む**実際にモデルへ渡るcontext全体**を見る。AGENTSに一行加えても、上位のextension instructionsの重複や矛盾は解消できない。

ユーザーの継続的な希望、プロジェクトの事実、出典付き調査、一時的なtask進捗について、どこを正本にするか決める。冗長保存を減らす変更は各extensionの設定・対応範囲で行い、外部packageのインストール済みコードを場当たり的に書き換えない。

## 6. 評価方法 — 静的監査と実行評価を分ける

### 静的な契約検査

- 実参照のリンク切れ、存在しないinstructions path。
- descriptionの対象と本文の処理対象の一致。
- roleが要求する成果物を、許可されたtoolsで作れるか。
- report path規則とextension validatorの一致。
- 他製品のtool名、無条件delegation、重複した起動制御。
- 「変更禁止」と「成果物保存」の例外の明確さ。

これは実行契約の検査であり、機能の代わりにソース文字列を検査するテストではない。ただし静的検査合格を、agent動作の成功とは呼ばない。

### 最初に用意する実タスク

| シナリオ | 観測する結果・失敗 |
|---|---|
| 小さな設定修正 | 不要な設計skill・計画・委譲を増やさず、実効設定を確認できる |
| 再現可能なバグ | 要求の症状を修正前に捕捉し、修正後に解消を確認する |
| 未コミット変更のレビュー | 作業ツリーの変更を取りこぼさず、根拠のない指摘を作らない |
| テスト環境が使えない | 未検証を明示し、成功宣言や無断の大規模環境変更をしない |
| read-only調査 | 調査対象を変更せず、必要なreportは正しい保存先へ残す |
| Herdr利用不可の調査 | 手動再実装せず、直接調査または明確なblocker報告へ進む |
| 独立レビュー必須の依頼 | 自己レビューを独立レビューとして代用したと偽らない |
| 矛盾する古いmemory・外部文書 | 現在の指示・実コードを優先し、不用意に指示を追加しない |

### 比較のやり方

1. 固定したfixture、同じrepo state・model・thinking・tools・extension構成で旧版A／新版Bを比較する。版やcontext設定も記録する。
2. まず代表6ケースを旧新各1回でsmoke確認する。重要ケースは複数回（例: 3回以上）繰り返し、1回の成功を性能改善とは呼ばない。
3. コスト上限・時間上限を事前に決める。1回の改訂は一つの問題群に絞る。
4. cold sessionを使い、前回の会話や評価結果を引き継がせない。memoryも同じ固定条件にする。warm workerに「前回を忘れて」と言うだけでは白紙の評価にならない。
5. 実行者には通常タスクで分かる要件を渡す。採点者だけが使うhold-out入力や検出対象の正解一覧は渡さない。
6. 成否はdiff、実際のコマンド結果、生成物、tool traceで確認する。自己申告の「達成しました」は合否の根拠にしない。
7. 変更に使っていないhold-outケースでも確認する。品質が同等ならコスト／時間の低い方を選ぶ。安全性や必須要件の回帰は平均点で相殺しない。

| 指標 | 優先度 |
|---|---|
| 要求の達成、scope違反、ユーザー変更の保護、検証の正確さ | 必須 |
| reviewの有効な指摘／誤検知、必要成果物の保存成功 | taskに応じて必須 |
| 不要な委譲・質問・読込・ツール呼出し、再試行 | 補助 |
| 入出力token、費用、wall time | 品質を満たした後の最適化 |

`llm/dot_opencode/skills/empirical-prompt-tuning/SKILL.md`には、固定チェックリスト、critical項目、hold-out、1テーマずつ修正という有用な原型が既にある。ただしTask/Agent toolと固有のusageメタを前提にしており、そのままPiへコピーしない。固定タスク＋独立した採点＋観測可能な結果という核を再利用する。自己申告は曖昧さの発見に使い、成功判定とは分離する。

## 7. 実施順序

1. **現行を固定:** 未コミット変更を含む版、読み込まれるファイル、tool設定を記録する。ユーザー変更を勝手にcommitしない。
2. **契約を直す:** read-only/report、無条件subagent、Piにないtool、canonical path、リンク切れを修正する。
3. **環境を別に確認:** Herdr CLIとextensionの対応を確認し、最小タスクでstart→report→integration→cleanupを実動作確認する。
4. **global方針を整理:** codebase-designの条件付き読込、確認質問・出力の既定を調整する。コメント・テスト方針は保持する。
5. **A/B評価:** 上記ケースで回帰のないことを確認する。必要なら戻す。
6. **後から削減:** 利用実績・測定結果を見てロール共通化、旧OpenCode設定、memory注入を整理する。

最初からAGENTS.mdを全面改稿し、全skills・モデル・extensionも同時に変える方法は避ける。何が効いたか分からなくなるため。

## 8. 未確認事項

- 改訂後の成功率、token削減率、所要時間: **未評価**。
- Herdrの起動障害修復と子agentの実動作: **未実施**。
- read-onlyロールのreport保存失敗: 静的契約から指摘。今回crackerを実際に起動したわけではない。
- 全skills・全package promptsの網羅的監査、OpenCodeの稼働状況: **対象外／未確認**。
- Piの参照資料は同梱0.84.3系。settingsのchangelog記録と一致しないため、将来の変更実装時は実行binaryの版も固定して確認する。

## 出典

すべて2026-09-07に本文を確認。Web上の仕様は更新され得る。

1. Anthropic, *Effective context engineering for AI agents* (2025-09-29): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
2. Anthropic, *Best practices for Claude Code*: https://code.claude.com/docs/en/best-practices
3. Agent Skills, *Specification*: https://agentskills.io/specification
4. Pi公式同梱資料: `/nix/store/ndlj406rqfdy8bhzd5y09j1lq6p80j8x-pi-coding-agent-0.84.3/lib/node_modules/pi-monorepo/README.md`、同`docs/skills.md`、`docs/prompt-templates.md`。公開版: https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
5. OpenAI, *Evaluation best practices*: https://developers.openai.com/api/docs/guides/evaluation-best-practices （方法論のみ採用。特定のhosted Evalsサービスへの依存は提案しない。）
6. Gloaguen et al., *Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?*, arXiv:2602.11988v2 (2026-06-23): https://arxiv.org/abs/2602.11988v2 ; 本文 https://arxiv.org/html/2602.11988v2 、特に§4–5。
7. OpenAI, *Custom instructions with AGENTS.md*: https://developers.openai.com/codex/guides/agents-md （取得時 https://learn.chatgpt.com/docs/agent-configuration/agents-md へredirect）。
8. AGENTS.md公式: https://agents.md/ （formatの背景。各harnessの実際の読込仕様は製品資料を優先。）
