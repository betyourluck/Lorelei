//! GUI から使う OS ネイティブの機能 (spec 01 P4)。保存ダイアログと About は rfd で出す —
//! plugin-dialog を足さないので JS に権限が増えない。

use std::path::{Path, PathBuf};

use lorelei_core::output::write_output;
use lorelei_core::{RenderFormat, RenderOptions, render};
use tauri::{AppHandle, Manager};

/// 手直しした図を SVG / PNG / PDF で保存する。保存ダイアログで取り消されたら `Ok(None)`。
#[tauri::command]
pub async fn export_diagram(
    window: tauri::WebviewWindow,
    source: String,
    format: String,
    file_stem: String,
) -> Result<Option<String>, String> {
    let format = parse_format(&format)?;
    let ext = format.extension();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new()
            .set_parent(&window)
            .set_title(format!("{} として保存", ext.to_uppercase()))
            .set_file_name(format!("{file_stem}.{ext}"))
            .add_filter(ext.to_uppercase(), &[ext])
            .save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || export_to(&path, &source, format))
        .await
        .map_err(|e| e.to_string())?
        .map(|p| Some(p.display().to_string()))
}

/// 描画して書き出す。上書きの確認は OS の保存ダイアログが済ませているので上書きを許す。
pub fn export_to(path: &Path, source: &str, format: RenderFormat) -> Result<PathBuf, String> {
    let rendered = render(source, format, &RenderOptions::default()).map_err(|e| e.to_string())?;
    write_output(path, format, &rendered.bytes, true).map_err(|e| e.to_string())
}

fn parse_format(format: &str) -> Result<RenderFormat, String> {
    match format {
        "svg" => Ok(RenderFormat::Svg),
        "png" => Ok(RenderFormat::Png),
        "pdf" => Ok(RenderFormat::Pdf),
        other => Err(format!("未対応の形式です: {other}")),
    }
}

/// About を出す。入口はタイトルバーの「?」(spec 02 D5)。ネイティブのメニューは持たない —
/// decorations: false にすると Windows ではメニューバーごと消えるため (spec 02 P0-2)。
#[tauri::command]
pub fn show_about(app: AppHandle) {
    let window = app.get_webview_window("main");
    let text = about_text(env!("CARGO_PKG_VERSION"));
    std::thread::spawn(move || {
        let mut dialog = rfd::MessageDialog::new()
            .set_title("Lorelei について")
            .set_description(text)
            .set_buttons(rfd::MessageButtons::Ok);
        if let Some(w) = &window {
            dialog = dialog.set_parent(w);
        }
        dialog.show();
    });
}

/// About の本文。ライセンスの全文は配布物の licenses フォルダに同梱する (tauri.conf.json の bundle.resources)。
pub fn about_text(version: &str) -> String {
    format!(
        "Lorelei {version}\n\
         AI が書いた Mermaid を検査・描画・書き出しし、GUI で手直しするアプリです。\n\
         フォーク元: mermaid-editor (illionillion) https://github.com/illionillion/mermaid-editor\n\n\
         ライセンス\n\
         ・Lorelei / mermaid-editor (illionillion) — MIT License\n\
         ・merman (Latias94) — MIT OR Apache-2.0 (merman-core は修正版を同梱)\n\
         ・Noto Sans JP — SIL Open Font License 1.1\n  \
         Copyright 2014-2021 Adobe, with Reserved Font Name 'Source'\n\n\
         ライセンスの全文はインストール先の licenses フォルダにあります。"
    )
}
