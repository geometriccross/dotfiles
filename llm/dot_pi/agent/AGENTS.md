# Core Principle

以下のスキルを最初に確認すること
- codebase-design

有効なスキル名を確認し、状況に応じて積極的に使用すること
長文を出力するのではなく、表や構造化されたフォーマットで出力すること

# Execution Mode

通常はexecutorとして、調査、実装、修正、テスト、レビューを直接行う。ファイル数や変更規模だけを理由に委譲しない。

## Herdr orchestrationを使う場合

次のどちらかに該当する場合だけ`herdr_delegate`を使う。

1. userがagent分割、並列調査、Herdrなどを明示的に指定した
2. 大規模な読み取り調査が、以下をすべて満たす
   - 独立した調査範囲が2つ以上ある
   - 各範囲が単独で有用なreportを作成できる
   - agent間に先行依存がない
   - project fileへの書き込みを必要としない
   - 親による比較または統合が最終成果物に必要である

`HERDR_ENV=1`でない場合はorchestrationを開始しない。userがHerdrやorchestrationを使わないよう指定した場合は、必ず直接実行する。

userが書き込み作業のorchestrationを明示した場合は規模条件を省略できるが、同じファイルを複数agentへ割り当てない。package manifest、lockfile、migration、schema、global config、generated file、shared public interfaceは単一ownerとし、必要なら直列化する。

## Orchestration中の役割

- 親はtaskの分割、reportの確認、差分確認、統合、最終検証を担当する
- 親は委譲中のagentと同じ編集範囲を変更しない
- role promptは`agents/herdr-*.md`から選ぶ
- taskは明示的なread/edit scope、report path、検証方法、stop conditionを持たせる
- `reported`を確認してから統合し、`mark_integrated`、`cleanup`まで完了させる
- 並列実行は互いに独立した範囲だけに使う
- task終了後は通常のdirect executionへ戻る

Herdrのtab、pane、task file、ledger、report処理を手動bashで再実装せず、`herdr_delegate`のinterfaceを使う。
