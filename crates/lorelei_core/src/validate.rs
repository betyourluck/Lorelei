//! 検査 (MCP ツール `validate`)。data_contract `ValidationResult`。

use merman::{Error, ParseOptions, ParsedDiagram};
use serde::Serialize;

use crate::{
    CoreError, EditorCompat, MAX_SOURCE_BYTES, editor, engine, is_editable_in_gui, render::Theme,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ParseError {
    pub message: String,
    /// 1 始まり。merman が位置を返さなかった時は None (行を偽らない)。
    pub line: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ValidationResult {
    pub ok: bool,
    /// merman の `diagram_type` (例: `flowchart-v2` / `er` / `sequence`)。判定できなかった時は None。
    pub family: Option<String>,
    pub errors: Vec<ParseError>,
    /// GUI で開けるか、開くと何が落ちるか (spec 01 D5')。文法エラーの時は dropped が空。
    pub editor: EditorCompat,
}

pub fn validate(source: &str) -> Result<ValidationResult, CoreError> {
    match parse(source) {
        Ok(parsed) => {
            let family = parsed.meta.diagram_type;
            let payload = editor::convert(&family, &parsed.model)?;
            Ok(ValidationResult {
                ok: true,
                editor: EditorCompat {
                    editable: payload.is_some(),
                    dropped: payload.map(|p| p.dropped().to_vec()).unwrap_or_default(),
                },
                family: Some(family),
                errors: Vec::new(),
            })
        }
        Err(CoreError::Parse(err)) => {
            let family = family_of_failure(source);
            Ok(ValidationResult {
                ok: false,
                editor: EditorCompat {
                    editable: family.as_deref().is_some_and(is_editable_in_gui),
                    dropped: Vec::new(),
                },
                family,
                errors: vec![err],
            })
        }
        Err(other) => Err(other),
    }
}

/// 図を意味モデルまでパースする。validate と、エディタへの変換 (D5') が使う。
pub(crate) fn parse(source: &str) -> Result<ParsedDiagram, CoreError> {
    check_size(source)?;
    let engine = engine::engine(Theme::Default);
    match engine.parse_diagram_sync(source, ParseOptions::strict()) {
        Ok(Some(parsed)) => Ok(parsed),
        Ok(None) => Err(CoreError::Parse(ParseError {
            message: "Mermaid の図が見つかりません".to_string(),
            line: None,
        })),
        Err(err) => Err(CoreError::Parse(to_parse_error(source, &err))),
    }
}

pub(crate) fn check_size(source: &str) -> Result<(), CoreError> {
    if source.len() > MAX_SOURCE_BYTES {
        return Err(CoreError::InputTooLarge {
            actual: source.len(),
            limit: MAX_SOURCE_BYTES,
        });
    }
    Ok(())
}

fn to_parse_error(source: &str, err: &Error) -> ParseError {
    match err {
        Error::DiagramParse { diagnostic, .. } => ParseError {
            message: diagnostic.message().to_string(),
            line: diagnostic.span().map(|span| line_of(source, span.start)),
        },
        Error::DetectType(_) => ParseError {
            message: "図の種類を判定できません (先頭に flowchart / erDiagram などの宣言が必要です)"
                .to_string(),
            line: None,
        },
        other => ParseError {
            message: other.to_string(),
            line: None,
        },
    }
}

/// 文法エラーでも図の種類は分かることが多い。validate の戻り値に載せる。
fn family_of_failure(source: &str) -> Option<String> {
    engine::engine(Theme::Default)
        .parse_metadata_sync(source)
        .ok()
        .map(|meta| meta.diagram_type)
}

/// バイト位置 → 1 始まりの行番号。位置が本文の外なら最終行に丸める。
fn line_of(source: &str, byte: usize) -> usize {
    let end = byte.min(source.len());
    source.as_bytes()[..end]
        .iter()
        .filter(|&&b| b == b'\n')
        .count()
        + 1
}

#[cfg(test)]
mod tests {
    use super::line_of;

    #[test]
    fn line_of_counts_newlines_before_the_offset() {
        let src = "a\nbc\nd";
        assert_eq!(line_of(src, 0), 1);
        assert_eq!(line_of(src, 2), 2);
        assert_eq!(line_of(src, 5), 3);
        assert_eq!(line_of(src, 999), 3);
    }
}
