import { randomBytes } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type RequestHandler } from 'express';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { jstDate } from '../scheduler.js';
import { dequeue, enqueue, listQueue, ConflictError } from '../queue.js';
import { createQuestion, deleteQuestion, InUseError, getQuestion, listQuestions, postedQuestionIds, setStatus, updateQuestion, type QuestionInput } from '../questions.js';
import { createAuthRouter, requireAdmin, type CodeVerifier } from './auth.js';
import { layout, queuePage, questionForm, questionList } from './views.js';

export type PostNow = (date: string) => Promise<'posted' | 'already' | 'no-stock' | 'failed'>;
export type AdminDeps = { db: Db; cfg: Config; postNow?: PostNow };

const CSRF_COOKIE = 'csrf';

function csrf(cfg: Config): RequestHandler {
  return (req, res, next) => {
    let token: unknown = req.signedCookies?.[CSRF_COOKIE];
    if (typeof token !== 'string') {
      token = randomBytes(16).toString('hex');
      res.cookie(CSRF_COOKIE, token, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: cfg.baseUrl.startsWith('https://'),
      });
    }
    res.locals.csrf = token;
    if (req.method === 'POST' && req.body?._csrf !== token) return res.status(403).send('invalid csrf token');
    next();
  };
}

function readQuestion(body: Record<string, string>): QuestionInput {
  return {
    body: body.body ?? '',
    choices: [body.choice0 ?? '', body.choice1 ?? '', body.choice2 ?? '', body.choice3 ?? ''],
    answer: Number(body.answer) as QuestionInput['answer'],
    explanation: body.explanation ?? '',
    source: body.source ?? '',
    category: body.category ?? '',
  };
}

export function createAdminRouter({ db, cfg, postNow }: AdminDeps, verify?: CodeVerifier, authUrl?: (s: string) => string): express.Router {
  const router = express.Router();
  router.use(cookieParser(cfg.sessionSecret));
  router.use(express.urlencoded({ extended: false }));
  router.use(createAuthRouter(cfg, verify, authUrl));
  router.use(requireAdmin(cfg), csrf(cfg));

  const page = (res: express.Response, title: string, inner: string) =>
    res.send(layout(title, res.locals.csrf, inner));

  router.get('/', (_req, res) => res.redirect('/admin/questions'));

  router.get('/questions', (req, res) => {
    const filter = String(req.query.status ?? '');
    const kw = String(req.query.q ?? '').trim();
    const posted = postedQuestionIds(db);
    const all = listQuestions(db);
    const stock = all.filter((q) => q.status === 'confirmed' && !posted.has(q.id)).length;
    const shown = all.filter(
      (q) =>
        (filter === '' ||
          (filter === 'posted' ? posted.has(q.id) : filter === 'stock' ? q.status === 'confirmed' && !posted.has(q.id) : q.status === filter)) &&
        (kw === '' || q.body.includes(kw) || q.category.includes(kw) || q.source.includes(kw)),
    );
    page(res, '問題一覧', questionList(res.locals.csrf, shown, { posted, stock, total: all.length, filter, kw }));
  });
  router.get('/questions/new', (_req, res) => page(res, '問題を追加', questionForm(res.locals.csrf, '/admin/questions')));

  router.post('/questions', (req, res) => {
    try {
      createQuestion(db, readQuestion(req.body));
      res.redirect('/admin/questions');
    } catch (err) {
      res.status(400);
      page(res, '問題を追加', questionForm(res.locals.csrf, '/admin/questions', undefined, (err as Error).message));
    }
  });

  router.get('/questions/:id', (req, res) => {
    const q = getQuestion(db, Number(req.params.id));
    if (!q) return res.status(404).send('not found');
    page(res, `問題 #${q.id} を編集`, questionForm(res.locals.csrf, `/admin/questions/${q.id}`, q));
  });

  router.post('/questions/:id', (req, res) => {
    const id = Number(req.params.id);
    try {
      updateQuestion(db, id, readQuestion(req.body));
      res.redirect('/admin/questions');
    } catch (err) {
      res.status(400);
      page(res, `問題 #${id} を編集`, questionForm(res.locals.csrf, `/admin/questions/${id}`, undefined, (err as Error).message));
    }
  });

  router.post('/questions/:id/delete', (req, res) => {
    try {
      deleteQuestion(db, Number(req.params.id));
      res.redirect('/admin/questions');
    } catch (err) {
      res.status(err instanceof InUseError ? 409 : 400).send((err as Error).message);
    }
  });

  router.post('/questions/:id/status', (req, res) => {
    const status = req.body.status;
    if (status !== 'draft' && status !== 'confirmed') return res.status(400).send('invalid status');
    try {
      setStatus(db, Number(req.params.id), status);
      res.redirect('/admin/questions');
    } catch (err) {
      res.status(400).send((err as Error).message);
    }
  });

  const renderQueue = (res: express.Response, error?: string) => {
    const posted = postedQuestionIds(db);
    return page(res, '出題予定', queuePage(res.locals.csrf, listQueue(db, jstDate(new Date())), listQuestions(db, { status: 'confirmed' }).filter((q) => !posted.has(q.id)), error));
  };

  router.get('/queue', (_req, res) => renderQueue(res));

  router.post('/queue', (req, res) => {
    try {
      enqueue(db, Number(req.body.questionId), String(req.body.date));
      res.redirect('/admin/queue');
    } catch (err) {
      res.status(err instanceof ConflictError ? 409 : 400);
      renderQueue(res, (err as Error).message);
    }
  });

  router.post('/queue/:id/delete', (req, res) => {
    dequeue(db, Number(req.params.id));
    res.redirect('/admin/queue');
  });

  const STATUS = { posted: 200, already: 409, 'no-stock': 422, failed: 502 } as const;
  router.post('/post-now', async (_req, res) => {
    if (!postNow) return res.status(501).send('manual posting is not configured');
    try {
      const result = await postNow(jstDate(new Date()));
      res.status(STATUS[result]).send(result);
    } catch (err) {
      console.error('manual post failed:', err);
      res.status(502).send('failed');
    }
  });

  return router;
}
