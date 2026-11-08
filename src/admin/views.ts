import { choiceLabel } from '../format.js';
import type { Question } from '../questions.js';

export const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function layout(title: string, csrf: string, inner: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - ITパスポート出題Bot</title>
<style>
:root{--bg:#f6f7f9;--fg:#1f2430;--muted:#667085;--card:#fff;--line:#e4e7ec;--accent:#2563eb;--danger:#b42318;--ok:#067647;--warn:#b54708}
@media(prefers-color-scheme:dark){:root{--bg:#14161b;--fg:#e6e8ec;--muted:#98a2b3;--card:#1c1f26;--line:#2c313b;--accent:#6ea0ff;--danger:#f97066;--ok:#47cd89;--warn:#fdb022}}
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:var(--bg);color:var(--fg);max-width:920px;margin:0 auto;padding:0 1rem 3rem;line-height:1.6}
h1{font-size:1.4rem;margin:1.5rem 0 1rem}
a{color:var(--accent)}
nav{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;padding:.8rem 0;border-bottom:1px solid var(--line)}
nav a{text-decoration:none;font-weight:600;color:var(--fg)}nav a:hover{color:var(--accent)}
nav form{margin:0;display:inline}nav form:first-of-type{margin-left:auto}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem 1.2rem;overflow-x:auto}
table{border-collapse:collapse;width:100%}
th{font-size:.8rem;color:var(--muted);font-weight:600}
td,th{border-bottom:1px solid var(--line);padding:.6rem .5rem;text-align:left;vertical-align:top}
tr:last-child td{border-bottom:0}
td:last-child{white-space:nowrap}
input[type=text],input[type=date],textarea,select{width:100%;padding:.5rem .6rem;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit}
input:focus,textarea:focus,select:focus,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
label{display:block;font-size:.9rem;font-weight:600}
label input,label textarea,label select{margin-top:.25rem;font-weight:400}
button{font:inherit;font-size:.9rem;padding:.4rem .8rem;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
button:hover{border-color:var(--accent)}
form.card>button:last-child,.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.err{color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,transparent);padding:.6rem .8rem;border-radius:6px}
.badge{display:inline-block;padding:.05rem .55rem;border-radius:999px;font-size:.78rem;font-weight:600;border:1px solid currentColor}
.badge.confirmed{color:var(--ok)}.badge.draft{color:var(--warn)}
.empty{color:var(--muted);text-align:center;padding:1.5rem 0}
.actions{display:flex;gap:.6rem;align-items:center}.actions form{margin:0}
.toolbar{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1rem}.toolbar>*{flex:1 1 140px}.toolbar select{flex:3 1 260px}.toolbar button{flex:0 0 auto}
.choices{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}
@media(max-width:600px){.choices{grid-template-columns:1fr}}
.btn{display:inline-block;padding:.4rem .8rem;border-radius:6px;background:var(--accent);color:#fff;text-decoration:none;font-size:.9rem}
</style></head><body>
<nav><a href="/admin/questions">問題</a><a href="/admin/queue">出題予定</a>
<form method="post" action="/admin/logout" style="display:inline"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button>ログアウト</button></form>
<form method="post" action="/admin/post-now" style="display:inline" onsubmit="return confirm('今日の問題を今すぐ出題しますか?')"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button>今すぐ出題</button></form></nav>
<h1>${esc(title)}</h1>${inner}</body></html>`;
}

const hidden = (csrf: string) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

export function questionForm(csrf: string, action: string, q?: Partial<Question>, error?: string): string {
  const c = q?.choices ?? ['', '', '', ''];
  const choiceInputs = [0, 1, 2, 3]
    .map((i) => `<label>${choiceLabel(i as 0)} <input type="text" name="choice${i}" value="${esc(c[i] ?? '')}" required></label>`)
    .join('');
  const options = [0, 1, 2, 3]
    .map((i) => `<option value="${i}"${q?.answer === i ? ' selected' : ''}>${choiceLabel(i as 0)}</option>`)
    .join('');
  return `${error ? `<p class="err">${esc(error)}</p>` : ''}
<form class="card" method="post" action="${esc(action)}">${hidden(csrf)}
<p><label>問題文<textarea name="body" rows="4" required>${esc(q?.body ?? '')}</textarea></label></p>
<div class="choices">${choiceInputs}</div>
<p><label>正解 <select name="answer">${options}</select></label></p>
<p><label>解説<textarea name="explanation" rows="4">${esc(q?.explanation ?? '')}</textarea></label></p>
<p><label>出典(確認済みにするには必須)<input type="text" name="source" value="${esc(q?.source ?? '')}"></label></p>
<p><label>分野<input type="text" name="category" value="${esc(q?.category ?? '')}"></label></p>
<button>保存</button></form>`;
}

export function questionList(csrf: string, questions: Question[]): string {
  const rows = questions
    .map(
      (q) => `<tr><td>${q.id}</td><td><span class="badge ${esc(q.status)}">${esc(q.status)}</span></td><td>${esc(q.body.slice(0, 60))}</td><td>${esc(q.source)}</td>
<td class="actions"><a href="/admin/questions/${q.id}">編集</a>
<form method="post" action="/admin/questions/${q.id}/status">${hidden(csrf)}
<input type="hidden" name="status" value="${q.status === 'draft' ? 'confirmed' : 'draft'}">
<button class="plain">${q.status === 'draft' ? '確認済みにする' : '下書きに戻す'}</button></form></td></tr>`,
    )
    .join('');
  return `<p><a class="btn" href="/admin/questions/new">問題を追加</a></p>
<div class="card"><table><tr><th>ID</th><th>状態</th><th>問題文</th><th>出典</th><th></th></tr>${rows}</table>${
    rows ? '' : '<p class="empty">まだ問題がありません</p>'
  }</div>`;
}

export function queuePage(
  csrf: string,
  entries: { id: number; date: string; question: Question }[],
  confirmed: Question[],
  error?: string,
): string {
  const rows = entries
    .map(
      (e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.question.body.slice(0, 60))}</td>
<td><form method="post" action="/admin/queue/${e.id}/delete">${hidden(csrf)}<button class="plain">取り消し</button></form></td></tr>`,
    )
    .join('');
  const options = confirmed.map((q) => `<option value="${q.id}">${q.id}: ${esc(q.body.slice(0, 40))}</option>`).join('');
  return `${error ? `<p class="err">${esc(error)}</p>` : ''}
<form class="toolbar" method="post" action="/admin/queue">${hidden(csrf)}
<select name="questionId" required>${options}</select><input type="date" name="date" required><button class="primary">予約</button></form>
<div class="card"><table><tr><th>日付</th><th>問題</th><th></th></tr>${rows}</table>${
    rows ? '' : '<p class="empty">予約はありません</p>'
  }</div>`;
}
