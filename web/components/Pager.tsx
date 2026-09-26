import type { ReactNode } from "react";

/** 前へ／次へのページ送り。position は今どこを見ているか（例: 「2ページ」「101〜200行目」） */
export function Pager({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  position,
  prevText = "前へ",
  nextText = "次へ",
  className,
}: {
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  position?: ReactNode;
  prevText?: string;
  nextText?: string;
  className?: string;
}) {
  return (
    <div className={className ? `row ${className}` : "row"}>
      <button className="button" type="button" disabled={prevDisabled} onClick={onPrev}>
        {prevText}
      </button>
      {position && <span className="small muted">{position}</span>}
      <button className="button" type="button" disabled={nextDisabled} onClick={onNext}>
        {nextText}
      </button>
    </div>
  );
}
