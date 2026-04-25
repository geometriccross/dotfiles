---
name: context_manage
description: コンテキストの保存方法、読み込み方法、削除方法を管理する
---

# Loading
タスクを行う前に、<PROJECT_ROOT>/.context/に保存してあるコンテキストを読み込む
もしフォルダがなければ作成する
コンテキストフォルダは.gitignoreに追加する

```bash
mkdir -p <PROJECT_ROOT>/.context/
cat .gitignore | grep -q "^.context/$" || echo ".context/" >> .gitignore
```
# Context file
コンテキストは事象ごとに一つのmdファイルで管理する
コンテキストは<PROJECT_ROOT>/.context/に階層化せずに保存する
フォーマットはこの通り


```
---
name: <context_name>
description: <context_description>

<context_content>
---
```

ファイル名は<context_name_A>_<context_name_B>_<context_name_C>...のように何を表すかを繋げ、名前で簡単な階層をつける
それぞれのcontext_nameは英語で、1 ~ 1.5単語で表す
繋げられる最大数は3つまで
大きいトピックなら繋げる数を少なく、 小さいトピックならその反対


