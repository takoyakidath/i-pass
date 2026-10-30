import { choiceLabel } from '../format.js';
import type { Question } from '../questions.js';

export const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function layout(title: string, csrf: string, inner: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - ITパスポート出題Bot</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;line-height:1.5}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:.4rem;text-align:left;vertical-align:top}
input[type=text],textarea,select{width:100%;box-sizing:border-box}nav a{margin-right:1rem}.err{color:#b00020}</style></head><body>
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
    .join('<br>');
  const options = [0, 1, 2, 3]
    .map((i) => `<option value="${i}"${q?.answer === i ? ' selected' : ''}>${choiceLabel(i as 0)}</option>`)
    .join('');
  return `${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="${esc(action)}">${hidden(csrf)}
<p><label>問題文<textarea name="body" rows="4" required>${esc(q?.body ?? '')}</textarea></label></p>
<p>${choiceInputs}</p>
<p><label>正解 <select name="answer">${options}</select></label></p>
<p><label>解説<textarea name="explanation" rows="4">${esc(q?.explanation ?? '')}</textarea></label></p>
<p><label>出典(確認済みにするには必須)<input type="text" name="source" value="${esc(q?.source ?? '')}"></label></p>
<p><label>分野<input type="text" name="category" value="${esc(q?.category ?? '')}"></label></p>
<button>保存</button></form>`;
}

export function questionList(csrf: string, questions: Question[]): string {
  const rows = questions
    .map(
      (q) => `<tr><td>${q.id}</td><td>${esc(q.status)}</td><td>${esc(q.body.slice(0, 60))}</td><td>${esc(q.source)}</td>
<td><a href="/admin/questions/${q.id}">編集</a>
<form method="post" action="/admin/questions/${q.id}/status" style="display:inline">${hidden(csrf)}
<input type="hidden" name="status" value="${q.status === 'draft' ? 'confirmed' : 'draft'}">
<button>${q.status === 'draft' ? '確認済みにする' : '下書きに戻す'}</button></form></td></tr>`,
    )
    .join('');
  return `<p><a href="/admin/questions/new">問題を追加</a></p>
<table><tr><th>ID</th><th>状態</th><th>問題文</th><th>出典</th><th></th></tr>${rows}</table>`;
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
<td><form method="post" action="/admin/queue/${e.id}/delete">${hidden(csrf)}<button>取り消し</button></form></td></tr>`,
    )
    .join('');
  const options = confirmed.map((q) => `<option value="${q.id}">${q.id}: ${esc(q.body.slice(0, 40))}</option>`).join('');
  return `${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/admin/queue">${hidden(csrf)}
<select name="questionId" required>${options}</select> <input type="date" name="date" required> <button>予約</button></form>
<table><tr><th>日付</th><th>問題</th><th></th></tr>${rows}</table>`;
}
