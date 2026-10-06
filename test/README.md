#### テスト実行環境

開発端末でテストを実行するときは以下を実行する

1. **Chromiumのインストール状況を確認する**
    以下のコマンドを実行する。

    ```bash
    npx playwright install chromium --dry-run
    ```

    インストール済みなら以降の手順は不要。

2. **Chromiumをインストールする**
    未インストールの場合はインストールを行う。

    ```bash
    npx playwright install chromium
    ```

    これにより端末の `$HOME/Library/Caches/ms-playwright`（macOSの場合）の下にChromiumがインストールされ、ブラウザを使ったテストが実施できるようになる。
