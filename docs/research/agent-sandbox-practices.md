# 子agentサンドボックスのベストプラクティス

調査日: 2026-09-07。質問8への判断材料。提案であり、読取制限や具体的な実装方式へのユーザー合意ではない。

## 基本原則

- 脅威モデルを明示する。誤操作・prompt injection・不信なテストコードへの対策と、カーネル脆弱性を悪用する攻撃への対策では必要な隔離強度が違う。
- 既定拒否・最小権限・多層防御。ファイルの読取／書込、通信、認証情報、プロセス、CPU・メモリ・実行時間を別々に扱う。
- 指示やshellコマンドの文字列検査ではなく、OS側で子プロセスを含めて強制する。read/edit等の直接toolも同じ契約の対象にする。
- 実行領域に秘密情報を渡さない。環境変数、SSH agent、Docker/Nix daemon/Herdr等のホスト制御socket、継承FDも確認する。モデルAPIの認証は信頼された制御側に分離する。
- repo全体が安全とは限らない。.env等の秘密、Git設定・hooks、agent設定の扱いを明示する。子がsandbox policyやlauncherを書き換えられないようにする。
- コマンドの通信は既定拒否。例外はproxy等で制御し、直接IP、DNS、localhostや内部ネットワークへの迂回も考慮する。ドメイン許可はAPI操作権限や漏洩防止を保証しない。
- taskごとに一時領域・HOME・cacheを分離し、実行時間・プロセス数・容量を制限する。終了時にはプロセスツリーも回収する。
- 違反・起動不能はfail closed。sandbox外での自動再試行は禁止する。
- 正常系と拒否系を実行検証する。別repo読取、scope外書込、symlink経由、子プロセス経由、直接通信、制御socketへの接続を検査する。実機で未検証なら保証済みと呼ばない。

## Pi/Herdrへの適用候補

信頼された親／launcherがtask契約と権限を決定し、子の作業tool・テストを既存の隔離runtimeへ渡す構成を推奨する。子Pi全体を隔離する方式と、各tool実行を隔離する方式は、認証・extension・tool経路を調査して比較する。bashだけを隔離し、他toolを無制限に残しても読取・書込制約の保証にはならない。

最初の候補はLinuxでのbubblewrap系runtime、または権限を絞ったrootless container。不信コードによるhost kernel攻撃も強く想定する場合はgVisorやVMを検討する。隔離基盤を独自に一から作らず、extensionは契約の検証とruntimeへの変換を担当する。

作業コピー／worktreeは衝突回避には有用だが、それだけではセキュリティ隔離にならない。また、成果物の取り込み時のscope検査は必要だが、禁止操作が実行されなかった保証の代わりにはならない。親が成果物を検証するときも、対象のテストコードを信頼できると自動的に見なさない。

## 一次資料

- Anthropic, Claude Code sandboxing: https://code.claude.com/docs/en/sandboxing — OSによるfilesystem/network制約、子プロセス、credential保護、起動不能時とunsandboxed retryの設定を確認。製品の既定動作はこの対話で合意したfail-closed方針と同じではない。
- Anthropic engineering: https://www.anthropic.com/engineering/claude-code-sandboxing — filesystemとnetworkの両方の隔離、認証情報を外部proxy側に置く構成を確認。記事の強い安全性表現を絶対保証として採用しない。
- gVisor security model: https://gvisor.dev/docs/architecture_guide/security/ — host kernel攻撃面の削減、脅威モデル、sandboxは安全な全体設計の代替ではないことを確認。
- Docker security: https://docs.docker.com/engine/security/ — daemonの権限、危険なhost mount、最小capabilities、cgroupsによる資源制御を確認。

具体的なruntimeの導入・設定・回避試験は未実施。現在のNix/Herdr環境での互換性は未確認。
