import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = path.join(process.cwd(), 'artifacts', 'bsmi');
const examId = 151;

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(outDir);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);
  if (!page) throw new Error('No Chrome page found.');

  const payload = await page.evaluate(async (currentExamId) => {
    async function api(url) {
      const response = await fetch(url, { credentials: 'include' });
      const text = await response.text();
      return JSON.parse(text);
    }

    const list = await api('/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0');
    const exam = list.data.list.find((item) => item.exam_id === currentExamId);
    if (!exam) throw new Error('Exam entry not found.');

    const histories = [];
    for (const history of exam.history) {
      if (!history.answer_close_time) continue;
      const result = await api(`/exam/api/v1/evaluation/examinee/practice/${currentExamId}/${history.time_id}/result`);
      histories.push({
        history,
        result: result.data,
      });
    }

    return {
      exam,
      histories,
    };
  }, examId);

  await fs.writeFile(path.join(outDir, 'all-histories.json'), JSON.stringify(payload, null, 2), 'utf8');
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
