//! GUI から使う OS ネイティブの機能 (spec 01 P4)。保存ダイアログと About は rfd で出す —
//! plugin-dialog を足さないので JS に権限が増えない。

use std::path::{Path, PathBuf};

use lorelei_core::output::{write_file, write_output};
use lorelei_core::{RenderFormat, RenderOptions, render};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::error::{self, DesktopError};

/// 書き出しの種類 (data_contract `GuiCommands.export_diagram`)。描く 3 形式と、描かずにそのまま書く .mmd (spec 25 D2)。
/// RenderFormat は MCP の render の enum なので .mmd は足さない
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportKind {
    Render(RenderFormat),
    Mmd,
}

impl ExportKind {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Render(format) => format.extension(),
            Self::Mmd => "mmd",
        }
    }
}

/// 手直しした図を SVG / PNG / PDF / MMD で保存する。保存ダイアログで取り消されたら `Ok(None)`。
/// `dialog_title` は画面が言語で訳した保存ダイアログの題 (spec 34 D4)
#[tauri::command]
pub async fn export_diagram(
    window: tauri::WebviewWindow,
    source: String,
    format: String,
    file_stem: String,
    dialog_title: Option<String>,
) -> Result<Option<String>, DesktopError> {
    let kind = parse_kind(&format)?;
    let ext = kind.extension();
    let title = save_dialog_title(dialog_title, ext);
    let picked = tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new()
            .set_parent(&window)
            .set_title(title)
            .set_file_name(format!("{file_stem}.{ext}"))
            .add_filter(ext.to_uppercase(), &[ext])
            .save_file()
    })
    .await
    .map_err(|e| DesktopError::new(error::TASK_FAILED, e.to_string()).detail(&e))?;
    let Some(path) = picked else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || match kind {
        ExportKind::Render(format) => export_to(&path, &source, format),
        ExportKind::Mmd => save_mmd(&path, &source),
    })
    .await
    .map_err(|e| DesktopError::new(error::TASK_FAILED, e.to_string()).detail(&e))?
    .map(|p| Some(p.display().to_string()))
}

/// 描画して書き出す。上書きの確認は OS の保存ダイアログが済ませているので上書きを許す。
/// lorelei_core (render・output) の文は訳さない。detail に入れ、画面は題だけ訳す (spec 34 D3)
pub fn export_to(path: &Path, source: &str, format: RenderFormat) -> Result<PathBuf, DesktopError> {
    let rendered = render(source, format, &RenderOptions::default()).map_err(export_failed)?;
    write_output(path, format, &rendered.bytes, true).map_err(export_failed)
}

fn export_failed(e: impl ToString) -> DesktopError {
    let text = e.to_string();
    DesktopError::new(error::EXPORT_FAILED, text.clone()).detail(text)
}

/// コード生成のコードを .mmd としてそのまま書く (spec 25 D2)。描かず、検査もしない (描けないコードでも保存できる。Web 版の Blob と同じ)。
/// 上書きの確認は OS の保存ダイアログが済ませているので上書きを許す
pub fn save_mmd(path: &Path, source: &str) -> Result<PathBuf, DesktopError> {
    write_file(path, ExportKind::Mmd.extension(), source.as_bytes(), true).map_err(export_failed)
}

/// 画面が題を渡さなかった時 (空白だけを含む) は日本語
pub fn save_dialog_title(dialog_title: Option<String>, ext: &str) -> String {
    dialog_title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| format!("{} として保存", ext.to_uppercase()))
}

pub fn parse_kind(format: &str) -> Result<ExportKind, DesktopError> {
    match format {
        "svg" => Ok(ExportKind::Render(RenderFormat::Svg)),
        "png" => Ok(ExportKind::Render(RenderFormat::Png)),
        "pdf" => Ok(ExportKind::Render(RenderFormat::Pdf)),
        "mmd" => Ok(ExportKind::Mmd),
        other => Err(DesktopError::new(error::UNSUPPORTED_FORMAT, format!("未対応の形式です: {other}")).param("format", other)),
    }
}

/// About の訳す部品 (spec 34 D4)。画面が言語で訳して渡す。ライセンスの行 (固有名・URL・版) は about_text が組み立てる
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AboutLabels {
    pub title: String,
    pub description: String,
    pub forked_from: String,
    pub licenses: String,
    pub merman_patched: String,
    pub full_text: String,
}

/// 画面が部品を渡さなかった時の日本語 (前の版の文)
impl Default for AboutLabels {
    fn default() -> Self {
        Self {
            title: "Lorelei について".into(),
            description: "AI が書いた Mermaid を検査・描画・書き出しし、GUI で手直しするアプリです。".into(),
            forked_from: "フォーク元:".into(),
            licenses: "ライセンス".into(),
            merman_patched: "(merman-core は修正版を同梱)".into(),
            full_text: "ライセンスの全文はインストール先の licenses フォルダにあります。".into(),
        }
    }
}

/// About を出す。入口はタイトルバーの「?」(spec 02 D5)。ネイティブのメニューは持たない —
/// decorations: false にすると Windows ではメニューバーごと消えるため (spec 02 P0-2)。
#[tauri::command]
pub fn show_about(app: AppHandle, labels: Option<AboutLabels>) {
    let window = app.get_webview_window("main");
    let labels = labels.unwrap_or_default();
    let text = about_text(env!("CARGO_PKG_VERSION"), &labels);
    std::thread::spawn(move || {
        let mut dialog = rfd::MessageDialog::new()
            .set_title(labels.title)
            .set_description(text)
            .set_buttons(rfd::MessageButtons::Ok);
        if let Some(w) = &window {
            dialog = dialog.set_parent(w);
        }
        dialog.show();
    });
}

/// About の本文。ライセンスの全文は配布物の licenses フォルダに同梱する (tauri.conf.json の bundle.resources)。
pub fn about_text(version: &str, labels: &AboutLabels) -> String {
    let AboutLabels { description, forked_from, licenses, merman_patched, full_text, .. } = labels;
    format!(
        "Lorelei {version}\n\
         {description}\n\
         {forked_from} mermaid-editor (illionillion) https://github.com/illionillion/mermaid-editor\n\n\
         {licenses}\n\
         ・Lorelei / mermaid-editor (illionillion) — MIT License\n\
         ・merman (Latias94) — MIT OR Apache-2.0 {merman_patched}\n\
         ・Noto Sans JP / SC / KR — SIL Open Font License 1.1\n  \
         Copyright 2014-2021 Adobe, with Reserved Font Name 'Source'\n\n\
         {full_text}"
    )
}
