// Google Cloud Console での準備手順（qa-087）。Google Cloud を触ったことがない人が、
// 上から順に1つずつ進めれば「接続情報」を用意できる粒度で書く。画面名は日本語表示を基準に、英語表示の名前を括弧で添える
import { type ReactNode, useState } from "react";
import { useToast } from "../../components/Toast";

const CONSOLE = "https://console.cloud.google.com";

interface Step {
  title: string;
  links?: { href: string; label: string }[];
  items: ReactNode[];
  /** ここまでできたら次へ進んでよい、という目印 */
  done: ReactNode;
  note?: ReactNode;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden">（新しいタブで開きます）</span>
    </a>
  );
}

function steps(redirectUri: string, copyButton: ReactNode): Step[] {
  return [
    {
      title: "Google Cloud Console を開く",
      links: [{ href: `${CONSOLE}/`, label: "Google Cloud Console を開く" }],
      items: [
        "リンクを押すと、新しいタブで Google Cloud Console が開きます。",
        "ログインを求められたら、連携したい YouTube チャンネルを持っている Google アカウントでログインします。",
        "初めて開いたときは「利用規約」の画面が出ます。国に「日本」を選び、利用規約のチェックを入れて「同意して続行（Agree and continue）」を押します。",
      ],
      done: "画面の左上に「Google Cloud」のロゴが出ていれば、次へ進みます。",
      note: "料金はかかりません。この手順ではクレジットカードの登録（お支払い情報）は不要です。求められても登録せずに進めます。",
    },
    {
      title: "プロジェクトを作る",
      links: [{ href: `${CONSOLE}/projectcreate`, label: "プロジェクトの作成画面を開く" }],
      items: [
        <>
          「プロジェクト名（Project name）」に <code>YouTube分析</code>{" "}
          と入力します（名前は自由です）。
        </>,
        "「場所（Location）」は「組織なし（No organization）」のままで構いません。",
        "「作成（Create）」を押し、30秒ほど待ちます。",
        "画面上部のプロジェクト名の欄（「プロジェクトを選択」と出ている場合もあります）を押し、今作ったプロジェクトを選びます。",
      ],
      done: "画面上部のプロジェクト名の欄に、作ったプロジェクトの名前が出ていれば次へ進みます。",
      note: "この後のリンクは、画面上部で選んでいるプロジェクトに対して開きます。別の名前が出ていたら、作ったプロジェクトに切り替えてから操作します。",
    },
    {
      title: "YouTube の API を3つ有効にする",
      links: [
        {
          href: `${CONSOLE}/apis/library/youtube.googleapis.com`,
          label: "YouTube Data API v3",
        },
        {
          href: `${CONSOLE}/apis/library/youtubeanalytics.googleapis.com`,
          label: "YouTube Analytics API",
        },
        {
          href: `${CONSOLE}/apis/library/youtubereporting.googleapis.com`,
          label: "YouTube Reporting API",
        },
      ],
      items: [
        "上の3つのリンクを1つずつ開きます。",
        "それぞれのページで、青い「有効にする（Enable）」ボタンを押します。",
        "数秒で画面が切り替わります。3つとも同じ操作をします。",
      ],
      done: "3つのリンクを開き直したとき、どれも「有効にする」ではなく「管理（Manage）」ボタンが出ていれば次へ進みます。",
    },
    {
      title: "アプリの情報を入れる（OAuth 同意画面）",
      links: [{ href: `${CONSOLE}/auth/overview`, label: "Google Auth Platform を開く" }],
      items: [
        "「開始（Get started）」ボタンを押します（すでに設定済みの画面が出たら、この手順は飛ばします）。",
        <>
          「アプリ情報（App information）」: 「アプリ名（App name）」に <code>YouTube分析</code>{" "}
          と入力し、「ユーザー サポートメール（User support
          email）」で自分のメールアドレスを選んで「次へ（Next）」を押します。
        </>,
        "「対象（Audience）」: 「外部（External）」を選んで「次へ」を押します。",
        "「連絡先情報（Contact information）」: 自分のメールアドレスを入力して「次へ」を押します。",
        "「終了（Finish）」: 「Google API サービスのユーザーデータに関するポリシーに同意します」にチェックを入れ、「続行（Continue）」→「作成（Create）」を押します。",
      ],
      done: "「OAuth の概要（OAuth Overview）」の画面が出れば次へ進みます。",
      note: "「データアクセス（Data Access）」でスコープを追加する必要はありません（必要な許可は、連携のときにこのアプリが Google に求めます）。",
    },
    {
      title: "公開ステータスを「本番環境」にする",
      links: [{ href: `${CONSOLE}/auth/audience`, label: "「対象」の画面を開く" }],
      items: [
        "「公開ステータス（Publishing status）」が「テスト（Testing）」になっていることを確かめます。",
        "「アプリを公開（Publish app）」を押し、確認の画面で「確認（Confirm）」を押します。",
      ],
      done: "「公開ステータス」が「本番環境（In production）」になっていれば次へ進みます。",
      note: "「テスト」のままだと、連携の許可が7日で切れて、毎週「要再連携」になります。自分のチャンネルに使うだけなら、Google の審査を受ける必要はありません。",
    },
    {
      title: "OAuth クライアントを作る",
      links: [{ href: `${CONSOLE}/auth/clients`, label: "「クライアント」の画面を開く" }],
      items: [
        "「クライアントを作成（Create client）」を押します。",
        "「アプリケーションの種類（Application type）」で「ウェブ アプリケーション（Web application）」を選びます。",
        <>
          「名前（Name）」に <code>YouTube分析</code> と入力します（名前は自由です）。
        </>,
        "「承認済みの JavaScript 生成元（Authorized JavaScript origins）」は空のままにします。",
        <>
          「承認済みのリダイレクト URI（Authorized redirect URIs）」の「URI を追加（Add
          URI）」を押し、次の値を貼り付けます。
          <span className="guide-copy">
            <code>{redirectUri}</code>
            {copyButton}
          </span>
          前後に空白を入れず、最後に <code>/</code>{" "}
          を足さないでください。1文字でも違うと連携できません。
        </>,
        "「作成（Create）」を押します。",
      ],
      done: "「OAuth クライアントを作成しました」という画面が出たら、その画面を閉じずに次へ進みます。",
    },
    {
      title: "クライアント ID とシークレットをこの画面に入れる",
      items: [
        "前の手順の画面に出ている「クライアント ID（Client ID）」をコピーし、このページの上の「クライアントID」欄に貼り付けます。",
        "同じ画面の「クライアント シークレット（Client secret）」をコピーし、「クライアントシークレット」欄に貼り付けます。",
        "念のため「JSON をダウンロード（Download JSON）」で保存しておきます。このファイルとシークレットは、他の人に渡さないでください。",
        "このページの上にある「登録」ボタンを押して保存します（変更のときは「変更を保存」）。",
      ],
      done: "上のバッジが「登録済み」に変われば次へ進みます。",
      note: "シークレットは作成したときにしか表示されません。コピーする前に画面を閉じてしまったら、「クライアント」の画面でそのクライアントを開いてシークレットを追加するか、手順6からクライアントを作り直します。",
    },
    {
      title: "YouTube と連携する",
      items: [
        "このページの下にある「YouTubeと連携」を押します。",
        "Google のアカウント選択画面で、連携したいチャンネルのアカウントを選びます（ブランドアカウントのチャンネルは、そのチャンネルを選びます）。",
        "「このアプリは Google で確認されていません」と出たら、左下の「詳細（Advanced）」→「YouTube分析（安全ではないページ）に移動」を押します。自分で作ったアプリなので問題ありません。",
        "許可の画面で「続行（Continue）」を押します。",
        "このページに戻ったら、表示されたチャンネルを選んで連携します。",
      ],
      done: "「YouTube連携」にチャンネル名と「正常」が出れば完了です。",
    },
  ];
}

const TROUBLES: { error: string; fix: ReactNode }[] = [
  {
    error: "エラー 400: redirect_uri_mismatch",
    fix: "手順6のリダイレクト URI が、この画面の値と完全に同じか確かめます。直した後、反映まで数分かかることがあります。",
  },
  {
    error: "「アクセスをブロック」「このアプリはテスト中です」",
    fix: "手順5の公開ステータスが「本番環境」になっているか確かめます。",
  },
  {
    error: "「Googleが登録済みのクライアントIDまたはシークレットを受け付けませんでした」",
    fix: "クライアント ID かシークレットのコピーが欠けています。「変更」から貼り直します。",
  },
  {
    error: "API が有効になっていない、というエラー",
    fix: "手順3の3つの API が、作ったプロジェクトで有効になっているか確かめます。",
  },
];

/** Google Cloud Console での準備手順（初めての人向け）。未登録のときは最初から開いておく */
export function GoogleCloudSetupGuide({
  redirectUri,
  defaultOpen,
}: {
  redirectUri: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toast = useToast();
  const copyButton = (
    <button
      type="button"
      className="button"
      onClick={() => {
        void navigator.clipboard?.writeText(redirectUri);
        toast("リダイレクト URI をコピーしました。");
      }}
    >
      URI をコピー
    </button>
  );

  return (
    <details className="guide" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>初めての方へ: Google Cloud Console での準備手順（約15分・無料）</summary>
      <p className="small muted">
        パソコンのブラウザで、上から順に進めてください。各手順の「✓」の状態になったら次の手順へ進みます。
        Google Cloud の画面が英語で表示される場合は、括弧内の英語の名前を探してください。
      </p>
      <ol className="guide-steps">
        {steps(redirectUri, copyButton).map((step) => (
          <li key={step.title}>
            <h4>{step.title}</h4>
            {step.links && (
              <ul className="guide-links">
                {step.links.map((link) => (
                  <li key={link.href}>
                    <ExternalLink href={link.href}>{link.label}</ExternalLink>
                  </li>
                ))}
              </ul>
            )}
            <ol className="guide-items">
              {step.items.map((item, index) => (
                // 手順の文は固定で並びが変わらないので、位置を key にしてよい
                // biome-ignore lint/suspicious/noArrayIndexKey: 静的な手順リスト
                <li key={index}>{item}</li>
              ))}
            </ol>
            <p className="guide-done">
              <span aria-hidden="true">✓ </span>
              {step.done}
            </p>
            {step.note && <p className="small muted">{step.note}</p>}
          </li>
        ))}
      </ol>
      <h4>うまくいかないとき</h4>
      <dl className="guide-trouble">
        {TROUBLES.map((trouble) => (
          <div key={trouble.error}>
            <dt>{trouble.error}</dt>
            <dd>{trouble.fix}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
