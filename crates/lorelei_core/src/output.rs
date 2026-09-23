//! MCP 経由のファイル書き出し (data_contract `OutputPathPolicy`, spec 01 D7)。
//!
//! AI クライアントは元々ファイルを書けるので、これは権限の制限ではない。相対パスの解釈違い・
//! 既存ファイルの上書き・途中で切れた壊れファイルという事故を防ぐための規則。

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::RenderFormat;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum OutputPathError {
    #[error("output_path は絶対パスで指定してください: {0}")]
    NotAbsolute(String),
    #[error("拡張子が形式と一致しません (形式 {expected}、パス {path})")]
    ExtensionMismatch {
        expected: &'static str,
        path: String,
    },
    #[error("出力先のフォルダがありません: {0}")]
    ParentMissing(String),
    #[error("ファイルが既にあります (上書きするなら overwrite: true): {0}")]
    AlreadyExists(String),
    #[error("書き込みに失敗しました ({path}): {message}")]
    Io { path: String, message: String },
}

/// 規則を満たしていれば `bytes` を書き出し、書いた絶対パスを返す。何かを書く前に全部検査する。
pub fn write_output(
    path: &Path,
    format: RenderFormat,
    bytes: &[u8],
    overwrite: bool,
) -> Result<PathBuf, OutputPathError> {
    let shown = || path.display().to_string();
    // Windows では "/home/…" はドライブを持たず絶対パスにならない = WSL のパスはここで落ちる
    if !path.is_absolute() {
        return Err(OutputPathError::NotAbsolute(shown()));
    }
    let ext_ok = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(format.extension()));
    if !ext_ok {
        return Err(OutputPathError::ExtensionMismatch {
            expected: format.extension(),
            path: shown(),
        });
    }
    let parent = match path.parent() {
        Some(p) if p.is_dir() => p,
        _ => return Err(OutputPathError::ParentMissing(shown())),
    };
    if path.exists() && !overwrite {
        return Err(OutputPathError::AlreadyExists(shown()));
    }

    // 一時ファイルは同じフォルダに作る (別ボリュームの temp_dir だと rename が失敗する)
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("out");
    let tmp = parent.join(format!(".{file_name}.tmp.{}", uuid::Uuid::new_v4()));
    let io_err = |e: std::io::Error| OutputPathError::Io {
        path: shown(),
        message: e.to_string(),
    };
    let written = (|| {
        let mut file = fs::File::create_new(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(io_err(e));
    }
    Ok(path.to_path_buf())
}
