# Magsic

Vite + TypeScript で構築された Web 音ゲー（および譜面エディタ）プロジェクトです。

## 必要な環境

- **Node.js**: v16 以上推奨 (npm が付属しているもの)

## セットアップ手順

別の環境でこのプロジェクトを動かすには、以下の手順に従ってください。

1. **リポジトリのクローン**
   ```bash
   git clone git@github.com:negitoroGunKan/magsic.git
   cd magsic
   ```

2. **依存パッケージのインストール**
   ```bash
   npm install
   ```

3. **ビルド**
   ゲームやエディタのコードをコンパイルします。
   ```bash
   npm run build
   ```

## 起動方法

### Windows の場合
プロジェクトのルートにある `start_game.bat` をダブルクリックするだけで起動できます。
自動的にブラウザで以下のページが開きます：
- ゲーム画面: `http://localhost:8080/`
- エディタ画面: `http://localhost:8080/editor.html`
- エディタ V2 画面: `http://localhost:8080/editor2.html`

### その他の OS (Mac/Linux など) または手動起動の場合
以下のコマンドを実行して、ローカルサーバーを起動します：

```bash
node server.js
```

起動後、ブラウザで以下のいずれかの URL にアクセスしてください：
- **ゲーム**: [http://localhost:8080/](http://localhost:8080/)
- **エディタ (旧)**: [http://localhost:8080/editor.html](http://localhost:8080/editor.html)
- **エディタ (V2)**: [http://localhost:8080/editor2.html](http://localhost:8080/editor2.html)
- **譜面エディタ**: [http://localhost:8080/song_editor.html](http://localhost:8080/song_editor.html)

## 開発用コマンド

- `npm run dev`: コードを変更すると自動でビルドされる監視モードを起動します。
- `npm run test`: テストを実行します。
