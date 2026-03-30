import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = path.join(process.cwd(), 'artifacts', 'bsmi');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(outDir);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);

  if (!page) throw new Error('No Chrome page found on debug session.');

  const result = await page.evaluate(async () => {
    const examId = 151;

    async function api(url, options = {}) {
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      });

      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      return {
        ok: response.ok,
        status: response.status,
        url,
        text,
        json,
      };
    }

    const beforeList = await api(`/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
    const examEntry = beforeList.json?.data?.list?.find((item) => item.exam_id === examId);
    const openHistory = examEntry?.history?.find((item) => !item.answer_close_time) || null;

    const simple = await api(`/exam/api/v1/evaluation/examinee/practice/${examId}/quiz`);
    const quizList = simple.json?.data?.quiz || [];

    const questions = [];
    const answerResponses = [];

    for (let index = 0; index < quizList.length; index += 1) {
      const quizId = quizList[index].quiz_id;
      const questionRes = await api(`/exam/api/v1/evaluation/examinee/practice/${examId}/quiz/${quizId}`);
      const question = questionRes.json?.data?.quiz;
      questions.push({
        order: index + 1,
        quizId,
        type: question?.type ?? null,
        text: question?.text ?? '',
        options: (question?.options || []).map((option, optionIndex) => ({
          key: String.fromCharCode(65 + optionIndex),
          value: String(optionIndex + 1),
          text: option.text,
        })),
      });

      const answerRes = await api(`/exam/api/v1/evaluation/examinee/practice/${examId}/quiz/${quizId}/answer`, {
        method: 'POST',
        body: JSON.stringify({
          extend: false,
          used_seconds: index + 1,
          answer: ['1'],
          is_marked: false,
        }),
      });

      answerResponses.push({
        quizId,
        status: answerRes.status,
        ok: answerRes.ok,
        body: answerRes.json ?? answerRes.text,
      });
    }

    const statusAfterAnswers = await api(`/exam/api/v1/evaluation/examinee/practice/${examId}/quiz-card`);

    const completeAttempts = [];
    for (const body of [{}, { extend: false }, { used_seconds: quizList.length }, { extend: false, used_seconds: quizList.length }]) {
      const completeRes = await api(`/exam/api/v1/evaluation/examinee/practice/${examId}/complete`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      completeAttempts.push({
        requestBody: body,
        status: completeRes.status,
        ok: completeRes.ok,
        body: completeRes.json ?? completeRes.text,
      });
      if (completeRes.ok) break;
    }

    const afterList = await api(`/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
    const afterEntry = afterList.json?.data?.list?.find((item) => item.exam_id === examId);
    const history = afterEntry?.history || [];
    const latestHistory = history[0] || null;
    const currentHistory =
      history.find((item) => openHistory && item.time_id === openHistory.time_id) ||
      history.find((item) => item.answer_close_time) ||
      latestHistory;

    let resultRes = null;
    if (currentHistory?.time_id) {
      resultRes = await api(`/exam/api/v1/evaluation/examinee/practice/${examId}/${currentHistory.time_id}/result`);
    }

    return {
      beforeList: beforeList.json ?? beforeList.text,
      simple: simple.json ?? simple.text,
      questions,
      answerResponses,
      statusAfterAnswers: statusAfterAnswers.json ?? statusAfterAnswers.text,
      completeAttempts,
      afterList: afterList.json ?? afterList.text,
      selectedHistory: currentHistory,
      result: resultRes?.json ?? resultRes?.text ?? null,
    };
  });

  await fs.writeFile(path.join(outDir, 'run-all-a.json'), JSON.stringify(result, null, 2), 'utf8');
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
