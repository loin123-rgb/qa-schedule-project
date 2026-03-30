import fs from 'node:fs/promises';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const workspaceDir = process.cwd();
const inputPath = path.join(workspaceDir, 'artifacts', 'bsmi', 'run-all-a.json');
const outputPath = process.argv[2] || path.join(workspaceDir, 'artifacts', 'bsmi', '計量技術人員考試_完整刷題解析.pptx');

function stripHtml(text = '') {
  return text
    .replace(/<sup>(.*?)<\/sup>/gi, '^$1')
    .replace(/<sub>(.*?)<\/sub>/gi, '_$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function choiceLetter(value) {
  const index = Number(value) - 1;
  return Number.isFinite(index) && index >= 0 ? String.fromCharCode(65 + index) : '?';
}

function optionText(option, index) {
  const text = stripHtml(option?.text || '');
  if (text) return text;
  if (option?.attachment?.filename) return `附圖選項（${option.attachment.filename}）`;
  return `選項 ${String.fromCharCode(65 + index)}`;
}

function shortTopic(questionText) {
  const cleaned = stripHtml(questionText).replace(/[？?。．、，,]/g, ' ');
  return cleaned.slice(0, 24).trim();
}

function buildExplanation(item) {
  const questionText = stripHtml(item.text);
  const correctValue = item.correct_answer?.[0] || '';
  const correctLetter = choiceLetter(correctValue);
  const correctOption = item.options?.[Number(correctValue) - 1];
  const correctText = optionText(correctOption, Number(correctValue) - 1);

  if (item.type === 1) {
    return correctLetter === 'A'
      ? '題幹敘述符合相關法規、定義或計量原則，因此判定為「是」。'
      : '題幹敘述與相關法規、定義或計量原則不符，因此判定為「否」。';
  }

  if (/何者非|為非|不是|不包括|有誤/.test(questionText)) {
    return `題目要求找出不符合條件的選項；只有「${correctText}」不屬於題幹所述範圍，因此答案為 ${correctLetter}。`;
  }

  if (/最適合|最為正確|最恰當/.test(questionText)) {
    return `本題是在比較選項的適切性；依題意最符合的是「${correctText}」，因此答案為 ${correctLetter}。`;
  }

  if (/以下組合|組合何者|何者正確/.test(questionText)) {
    return `依題幹列出的條件逐一判斷後，符合題意的組合是「${correctText}」，因此答案為 ${correctLetter}。`;
  }

  return `本題重點是「${shortTopic(questionText)}」；符合題意或規定的選項是「${correctText}」，因此答案為 ${correctLetter}。`;
}

function addWrappedText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x,
    y,
    w,
    h,
    margin: 0.04,
    fontFace: 'Microsoft JhengHei',
    color: '1F2937',
    breakLine: false,
    fit: 'shrink',
    valign: 'top',
    ...opts,
  });
}

async function main() {
  const raw = await fs.readFile(inputPath, 'utf8');
  const data = JSON.parse(raw);
  const resultData = data.result?.data;
  const quiz = resultData?.quiz || [];
  const history = data.selectedHistory || {};
  const correctCount = quiz.filter((item) => JSON.stringify(item.correct_answer) === JSON.stringify(item.user_answer)).length;
  const wrongCount = quiz.length - correctCount;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'OpenAI Codex';
  pptx.company = 'OpenAI';
  pptx.subject = 'BSMI 計量技術人員考試刷題解析';
  pptx.title = '計量技術人員考試_完整刷題解析';
  pptx.lang = 'zh-TW';
  pptx.theme = {
    headFontFace: 'Microsoft JhengHei',
    bodyFontFace: 'Microsoft JhengHei',
    lang: 'zh-TW',
  };

  const cover = pptx.addSlide();
  cover.background = { color: 'F7FBFC' };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.8, fill: { color: '0EA5A8' }, line: { color: '0EA5A8' } });
  addWrappedText(cover, '乙級計量技術人員考試', 0.65, 1.05, 5.8, 0.5, { fontSize: 24, bold: true, color: '0F172A' });
  addWrappedText(cover, '全選 A 刷題結果與解析', 0.65, 1.58, 5.8, 0.4, { fontSize: 16, color: '0EA5A8', bold: true });
  addWrappedText(cover, `本次成績：${history.score ?? '-'} 分`, 0.75, 2.45, 2.8, 0.35, { fontSize: 18, bold: true, color: '0F172A' });
  addWrappedText(cover, `作答題數：${quiz.length} 題`, 0.75, 2.9, 2.8, 0.3, { fontSize: 12 });
  addWrappedText(cover, `答對題數：${correctCount} 題`, 0.75, 3.22, 2.8, 0.3, { fontSize: 12 });
  addWrappedText(cover, `答錯題數：${wrongCount} 題`, 0.75, 3.54, 2.8, 0.3, { fontSize: 12 });
  addWrappedText(cover, `開始時間：${history.answer_start_time ?? '-'}`, 0.75, 4.05, 4.2, 0.3, { fontSize: 11, color: '475569' });
  addWrappedText(cover, `交卷時間：${history.answer_close_time ?? '-'}`, 0.75, 4.35, 4.2, 0.3, { fontSize: 11, color: '475569' });
  addWrappedText(cover, '說明：本檔依平台回傳結果整理，正解以平台查詢結果為準；解析為方便複習的精簡筆記。', 0.75, 5.05, 8.8, 0.55, { fontSize: 12, color: '334155' });

  quiz.forEach((item, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.55, fill: { color: '0EA5A8' }, line: { color: '0EA5A8' } });
    addWrappedText(slide, `第 ${index + 1} 題`, 0.45, 0.12, 1.1, 0.25, { fontSize: 22, bold: true, color: 'FFFFFF' });
    addWrappedText(slide, item.type === 1 ? '是非題' : '選擇題', 11.45, 0.14, 1.2, 0.22, { fontSize: 12, bold: true, color: 'E6FFFB', align: 'right' });

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.45, y: 0.78, w: 12.4, h: 1.15,
      rectRadius: 0.08,
      fill: { color: 'F8FAFC' },
      line: { color: 'CBD5E1', pt: 1 },
    });
    addWrappedText(slide, stripHtml(item.text), 0.7, 1.0, 11.9, 0.72, { fontSize: 18, bold: true });

    const optionBaseY = 2.15;
    const optionGap = item.options.length <= 2 ? 0.9 : 0.72;
    item.options.forEach((option, optionIndex) => {
      const optionValue = String(optionIndex + 1);
      const letter = choiceLetter(optionValue);
      const isCorrect = (item.correct_answer || []).includes(optionValue);
      const isChosen = (item.user_answer || []).includes(optionValue);
      const y = optionBaseY + optionIndex * optionGap;
      const fillColor = isCorrect ? 'DCFCE7' : isChosen ? 'FEF3C7' : 'F8FAFC';
      const lineColor = isCorrect ? '22C55E' : isChosen ? 'F59E0B' : 'CBD5E1';
      const label = `${letter}. ${optionText(option, optionIndex)}`;

      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.75, y, w: 11.8, h: optionGap - 0.14,
        rectRadius: 0.05,
        fill: { color: fillColor },
        line: { color: lineColor, pt: 1.2 },
      });

      addWrappedText(slide, label, 1.0, y + 0.09, 10.8, optionGap - 0.25, {
        fontSize: 15,
        bold: isCorrect || isChosen,
        color: '111827',
      });

      if (isCorrect) {
        addWrappedText(slide, '正解', 11.6, y + 0.1, 0.65, 0.22, { fontSize: 11, bold: true, color: '15803D', align: 'center' });
      } else if (isChosen) {
        addWrappedText(slide, '作答', 11.6, y + 0.1, 0.65, 0.22, { fontSize: 11, bold: true, color: 'B45309', align: 'center' });
      }
    });

    const boxY = item.options.length <= 2 ? 4.2 : 5.15;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.7, y: boxY, w: 12.0, h: 1.6,
      rectRadius: 0.06,
      fill: { color: 'EFF6FF' },
      line: { color: '93C5FD', pt: 1 },
    });

    const userLetter = choiceLetter(item.user_answer?.[0] || '');
    const correctLetter = choiceLetter(item.correct_answer?.[0] || '');
    addWrappedText(
      slide,
      `你的答案：${userLetter || '-'}    正確答案：${correctLetter || '-'}    本題得分：${item.user_score ?? 0} / ${item.quiz_score ?? 0}`,
      0.95, boxY + 0.14, 11.2, 0.22,
      { fontSize: 13, bold: true, color: '1D4ED8' },
    );
    addWrappedText(slide, `解析：${buildExplanation(item)}`, 0.95, boxY + 0.5, 11.1, 0.72, { fontSize: 14, color: '1E293B' });
  });

  await pptx.writeFile({ fileName: outputPath });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
