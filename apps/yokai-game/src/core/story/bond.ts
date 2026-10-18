// 縁の糸の艶（会話を最後まで話した回数から。04 §3.3）。縁の段階は変えない（F-24）。描画に依存しない。
// 縁帳の糸（ui/cho.ts）と、便りの言い回し（letters.ts）で同じ段を使う。

/** 糸の艶の段（会話を最後まで話した回数から。0〜1回: なし、2〜4回、5〜9回、10回から）。縁の段階は変えない */
export function sheenStep(talks: number): 0 | 1 | 2 | 3 {
  return talks >= 10 ? 3 : talks >= 5 ? 2 : talks >= 2 ? 1 : 0
}

/** 便りの言い回しの段: a＝0〜1段、b＝2段から */
export function sheenTier(talks: number): 'a' | 'b' {
  return sheenStep(talks) >= 2 ? 'b' : 'a'
}
