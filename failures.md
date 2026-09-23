# failures — 踏んだ罠

書式: 症状 → 真因 → 処方 → 一般化。番号は通しで振る。

## #1 vendor の中で走らせたテストの build 成果物をコミットしかけた（2026-09-24）

- **症状**: merman-core の修正コミットが 1,367 ファイル・+17,255 行になった。中身の大半は
  `vendor/merman-core/target/` と `vendor/merman-core/Cargo.lock`。push 前に気づき、そのコミットから取り除いた。
- **真因**: `.gitignore` の `/target` がリポジトリ直下だけを除外していた。`vendor/merman-core` は workspace から
  `exclude` しているので、その中で `cargo test` を走らせると独立した project として自分の `target/` を作る。
  コミットでは `git add -A vendor` とディレクトリ単位で積んだので、中身を見ないまま入った。
- **処方**: `.gitignore` を `target/`（どの階層でも）に変えた。
- **一般化**: workspace から外したディレクトリは「別の project」として振る舞い、ルートの前提（成果物の置き場・
  lock ファイル）が効かない。**ディレクトリ単位で `git add` した時は、コミット前に `git status --short` の件数を見る** —
  予想した件数（今回は 8）と桁が違えば止まる。
