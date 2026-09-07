# AGENTS.md改善 — 実装計画

作成日: 2026-09-07。設計合意（[agents-prompt-decisions.md](agents-prompt-decisions.md) Q1〜17）に基づく実装計画。**まだ実装開始承認ではない。**

## 前提: 未コミット変更の扱い（ユーザー決定必要）

作業ツリーに既存の変更がある。Phase 0で扱いを決定する。

| 変更 | 内容 | 選択肢 |
|---|---|---|
| `llm/dot_pi/agent/AGENTS.md` 修正 | コメント方針・テスト方針・完了前見直しの追加 | 本計画の改稿に取り込む or 先にcommit |
| `llm/prompts/*.md` 削除 | base_rule・coding_style・coding_workflow | 確認の上commit or 復元 |
| `docs/research/` 新規 | 今回の調査・設計文書 | commit推奨 |

## Phase 1: プロンプト修正（Executor中心）

対象: `llm/dot_pi/agent/AGENTS.md`

| 変更 | 合意元 | 内容 |
|---|---|---|
| 必読指定の廃止 | Q17 | `codebase-design`必読を条件付き読込へ。設計・refactor・interface検討時のみ |
| 不明点の仕分け基準 | Q12 | 影響・不可逆性・検証可能性。軽微は進み、重大は確認 |
| 変更範囲の明示 | Q13 | `git diff`が依頼で説明できる範囲。診断（pi-lsp）は指摘のみ |
| 検証の段階分け | Q14 | 設定→実効確認、コード→テスト・型検査、不能→未検証報告 |
| 停止条件の3条文化 | Q15 | 権限不足/前提崩壊/2回失敗+見通し不明。停止時の報告内容も |
| 報告の4要素 | Q16 | 変更・検証・指摘・未確認。形式の強制なし |

既存のコメント・テスト方針（Q13〜16の基盤）は保持する。

## Phase 2: skills適合（本文修正）

対象: `llm/dot_pi/agent/skills/engineering/`

| 対象 | 修正 |
|---|---|
| `research/SKILL.md` | 無条件background agent起動を廃止。「実行方式はAGENTS.mdのExecution Modeに従う」へ |
| `code-review/SKILL.md` | `Agent` tool参照をPi向けへ。working-tree reviewとbranch reviewの分離 |
| `improve-codebase-architecture/SKILL.md` | `subagent_type=Explore`参照の修正。壊れた`../grill-with-docs/`リンクを`../domain-modeling/`へ |
| `codebase-design/DESIGN-IT-TWICE.md` | `Agent` tool参照の適合 |
| `engineering/README.md` | 存在しない`ask-matt`リンク除去。実在skillsとの整合 |
| 上流更新管理 | fork元の記録と差分確認手順の整備 |

## Phase 3: Herdr role prompts修正

対象: `llm/dot_pi/agent/agents/herdr-*.md`

| 対象 | 修正 |
|---|---|
| 全read-onlyロール | 「調査対象はread-only、指定reportのみ書込可」へ契約を明確化 |
| Launch Metadata節 | CLI転送手順の記載を削除（extensionが単一責任者） |
| report path | `<role-or-step>`表記を`<role>`へ統一（validatorと一致） |
| `herdr-reviewer` | 利用実績を確認し、不要ならalias整理 |

## Phase 4: 拡張機能・環境（要技術調査、別途見積り）

| 項目 | 内容 | 前提 |
|---|---|---|
| CLI互換性修復 | `herdr agent start`の`--tab`エラー解消 | 環境問題として切り分け |
| read-only子のreport経路 | 制限付き保存経路の設計・実装 | 調査後 |
| 隔離runtime選定 | bubblewrap系 vs rootless containerの比較検証 | 調査後 |
| 認証分離 | Pi本体認証と作業toolの分離方式 | 調査後 |

Phase 1〜3の文面修正は先行できるが、子agentの安全な実行はPhase 4に依存する。Phase 4は調査結果を出してから個別に承認を得る。

Phase 3では8ロールの文面を修正した。モデル・toolsのfrontmatterは変更していない。`herdr-reviewer`はPhase 2のcode-reviewから参照されるため保持する。`herdr-cracker`には依然としてレポート保存手段がなく、他ロールもruntimeによる制約保証は未実装。文面上のblocker報告は起動前の強制拒否の代替ではない。これらをPhase 4で実装・検証するまで、Herdrの受入条件を達成済みとは扱わない。

## Phase 5: 検証

### 静的検査

- AGENTS.md・skills・role prompts間の矛盾・存在しないtool参照の absence
- リンク切れ修正の確認
- descriptionと本文の一致

### 実動作検証（受入条件）

| シナリオ | 合格条件 |
|---|---|
| 小さな設定修正の依頼 | 不要な委譲・skill読込なし。実効確認と4要素報告 |
| コード修正の依頼 | テスト実行、diffが依頼で説明可能、指摘が報告に含まれる |
| 検証不能な変更 | 未検証が明示され、成功宣言がない |
| 明示的な範囲外要求（攻撃的確認） | 停止または確認を取る |
| Herdr子agent起動（Phase 4後） | Q1〜11の各条件 |

費用・時間上限: 実行前に提示し承認を得る。数値は未定。

## 順序と依存

```
Phase 0 (未コミット整理) → Phase 1 → Phase 2 → Phase 3 → Phase 5(静的)
Phase 5(Executor実動作)は Phase 1〜2 後。Herdr実動作は Phase 3 と Phase 4 の両方に依存する。
```

## 実装開始前に必要な決定

1. 未コミット変更の扱い（Phase 0）
2. 実動作検証の予算上限
3. Phase 1〜3の一括着手か、Phaseごとの承認か
