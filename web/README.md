# 資材ノート（SvelteKit＋Supabase版）

農業資材の在庫・価格の変動・取扱説明書を家族で管理するWebアプリです。

- 導入と使い方：[../manual.md](../manual.md)
- 要件定義：[../requirements.md](../requirements.md)

```sh
npm install
npm run dev     # 開発用サーバー（http://localhost:5173）
npm test        # 計算・データ読み取りのテスト
npm run check   # 型チェック
```

データベースの定義は `supabase/schema.sql` です（Supabase の SQL Editor で1回実行）。
