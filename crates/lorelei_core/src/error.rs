use crate::output::OutputPathError;

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    /// 入力が `MAX_SOURCE_BYTES` を超えた。
    #[error("入力が大きすぎます ({actual} バイト。上限は {limit} バイト)")]
    InputTooLarge { actual: usize, limit: usize },
    /// 図の種類を判定できない、または文法エラー。
    #[error("{}", .0.message)]
    Parse(crate::ParseError),
    /// SVG の生成・PNG / PDF への変換に失敗した。
    #[error("描画に失敗しました: {0}")]
    Render(String),
    /// 意味モデルからエディタのデータ形への変換に失敗した (merman の出力形が想定と違う)。
    #[error("{0}")]
    Convert(String),
    #[error(transparent)]
    Output(#[from] OutputPathError),
}
