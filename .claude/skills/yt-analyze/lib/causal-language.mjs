// 因果を断定する言い回し。src/domain/report-schema.ts の CAUSAL_PATTERNS と同じ（一致はテストで確かめる）。
// アプリは summary・conclusion がこれに当たると 422 で拒否する。scripts/skill-analysis/check-no-causal-language.mjs もここを使う。
// このファイルはパターンそのもの（「のせいで」など）を含むので、.mjs を走査するときもこのファイルだけは対象から外す
export const CAUSAL_PATTERNS = [
  /が原因(で|だ|です|である)/,
  /のせいで/,
  /によって(増え|減っ|伸び|下が|上が)/,
  /[たえ](ため|から|ので)(に)?、?(増え|減っ|伸び|下が|上が)/,
  /を引き起こし/,
  /因果関係が(ある|あります|確認)/,
];
