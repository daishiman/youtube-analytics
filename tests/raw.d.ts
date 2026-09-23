// Vite の ?raw 取り込み（ワークフロー定義を文字列として読む A6 用）
declare module "*?raw" {
  const content: string;
  export default content;
}
