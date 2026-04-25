---
name: context_manage
description: プロジェクトローカルなコンテキストの読み込み、保存・更新、削除・整理を管理する
---

# context_manage

`<PROJECT_ROOT>/.context/` 直下のプロジェクト用コンテキストを、読み込み・保存/更新・削除/整理するための手順。

## いつ使うか

- 非自明なプロジェクト作業を始める前に、関連コンテキストを読み込む。
- 作業完了後、再利用すべき判断・発見・制約・パターンがあるときに保存/更新する。
- メンテナンス時に、古い・重複・壊れたコンテキストを安全に整理する。

## Setup

- `<PROJECT_ROOT>/.context/` がなければ作成する。
- `<PROJECT_ROOT>/.gitignore` に `.context/` を冪等に追加する。
- `.context/` はフラットなディレクトリとして使い、サブディレクトリを作らない。

```bash
mkdir -p <PROJECT_ROOT>/.context/
grep -qxF ".context/" <PROJECT_ROOT>/.gitignore || echo ".context/" >> <PROJECT_ROOT>/.gitignore
```

## Loading

1. タスク内容・ドメイン・関係ファイル名から lowercase English のキーワードを 2〜4 個選ぶ。
2. `.context/` 直下だけを検索する。

```bash
find <PROJECT_ROOT>/.context/ -maxdepth 1 -type f \( -name "*<keyword1>*" -o -name "*<keyword2>*" \)
```

3. 一致が 0 件なら「一致なし」と報告し、隣接ドメイン語・同義語を足す、または具体キーワードを broader stem に置き換えて一度だけ再検索する。まだ 0 件なら、既存コンテキストなしで進める前提を明記する。
4. 一致が複数ある場合、小さければ全て読む。多い/大きい場合は、task relevance > exact filename match > recency > smaller/readable file の優先順で選び、選定理由を明記する。
5. 読み込んだファイル名と、タスクへの関連性を作業メモまたは最終報告に残す。

## Saving / Updating

- タスク終了時、今後再利用できる判断・設計パターン・調査結果・制約だけを保存する。
- 新規作成前に類似名を検索し、既存ファイルに統合/更新できるなら新規作成しない。
- Markdown として読みやすく、YAML frontmatter に `name` と `description` を必ず入れる。
- 書いた後に再読し、frontmatter と本文が読みやすく壊れていないことを確認する。

```markdown
---
name: auth_patterns
description: 認証まわりで再利用する設計判断と実装パターン
---

## 要点

- <context_content>
```

## Deleting / Pruning

- 盲目的に削除しない。まず stale 候補を dry-run で一覧化する。
- macOS/BSD と Linux では `find ... -atime +14` が使えることが多い。macOS/BSD で詳細確認したい場合は `stat -f` を inspection に使う。OS が不明なら削除コマンドではなく安全な一覧/報告に留める。

```bash
# dry-run: macOS/BSD and Linux
find <PROJECT_ROOT>/.context/ -maxdepth 1 -type f -atime +14 -print

# inspection on macOS/BSD
stat -f '%N %Sa' -t '%Y-%m-%d %H:%M:%S' <PROJECT_ROOT>/.context/*
```

- 削除するのは、正確なパスをレビュー済みで、古く、現在/進行中の作業に関係しないと確認できたファイルだけ。
- 削除/リネーム/統合の破壊的操作は、dry-run list → candidates と理由の要約 → 明示的な user approval → 承認された exact paths だけに実行 → verify/report の順で行う。明示承認がなければ proposed actions の報告に留め、削除/リネーム/統合しない。
- malformed な context は保持し、壊れているだけでリネーム/削除しない。filename/content から意図した name/description が明白な場合だけ frontmatter を修復し、それ以外は pruning report に `manual_review` として path と reason を記録する。
- 重複/重なりがある名前は、内容を比較し、統合・更新・リネームを検討してから削除する。
- 削除/統合/リネームしたファイルと理由を報告する。

## Format / Naming

- 1 つの event/topic につき 1 つの `.md` ファイルにする。
- 保存場所は `<PROJECT_ROOT>/.context/` 直下のみ。
- ファイル名 stem と frontmatter `name` は、lowercase English segments を `_` でつなぐ。最大 3 segments。
- readable/valid な context は、opening/closing `---`、非空の `name` と `description` を持ち、`name` が filename stem と一致するもの。意図的に異なる場合は理由を本文に説明する。
- 例: `auth_patterns.md`, `api_routes.md`, `login_verifier.md`
- 広い context には広い名前を、狭い context には具体的な名前を使う。ただし最大 3 segments を超えない。

## Reporting

最終回答または task notes で、読み込み・保存・更新・削除した context files と、判断時の assumptions を簡潔にまとめる。
