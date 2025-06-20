# 美住町バス時刻表

美住町バス停の茅ヶ崎駅行きと辻堂駅行きのバス時刻を比較表示するWebアプリケーションです。

## 機能

- 茅ヶ崎駅行きと辻堂駅行きのバス時刻を並列表示
- 次のバスまでの残り時間をリアルタイム表示
- 平日・土曜・休日ダイヤの自動切り替え
- PWA対応でオフラインでも使用可能
- モバイルフレンドリーなレスポンシブデザイン

## 使い方

以下のURLにアクセスしてください：

https://makikub.github.io/my-bus-stop/

## 自動更新

GitHub Actionsにより、バス時刻表データを定期的に自動更新しています：
- 1日3回（朝6時、昼12時、夕方6時）に時刻表データを更新
- 月初に祝日データを更新

## 技術スタック

- Frontend: HTML, CSS, JavaScript (Vanilla)
- Hosting: GitHub Pages
- CI/CD: GitHub Actions
- PWA対応

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。
