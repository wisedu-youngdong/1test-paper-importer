import { categoriesPromptBlock, typeRulesPromptBlock, EXPLANATION_FORMAT_GUIDE } from '../lib/categories.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다' });
  }

  const { sourceItem, type, difficulty, avoidQuestion } = req.body;
  if (!sourceItem) {
    return res.status(400).json({ error: '원본 문항(sourceItem) 정보가 없습니다' });
  }

  const prompt = `당신은 한국 수능/모의고사 영어 문제 출제 전문가이자, 실제 문제은행 플랫폼에 업로드되는 표준 포맷을 정확히 따르는 출제자입니다.
아래 원본 지문을 기반으로 새로운 문제 1개를 생성해주세요.

[원본 문항]
- ${sourceItem.number}번: "${sourceItem.passagePreview || ''} ..." (약 ${sourceItem.wordCount || '?'}단어)

[공식 카테고리 체계 — 반드시 이 안에서만 유형을 선택하세요]
${categoriesPromptBlock()}

[이 유형의 출제 문법 규칙 — 반드시 정확히 지키세요]
${typeRulesPromptBlock([type])}

[해설 작성 형식 — 반드시 이 HTML 구조를 따르세요]
${EXPLANATION_FORMAT_GUIDE}

[생성 조건]
- 문제 유형: ${type} (반드시 이 유형으로 생성)
- 난이도: ${difficulty}
- 원본 지문의 주제와 어휘 수준을 참고하되, 표현은 새롭게 작성하세요
- 5지선다 객관식으로 작성하세요 (한국 수능 표준)
- question 필드에는 지시문 한 문장만, content 필드에는 지문 본문만 넣으세요. 절대 섞지 마세요
- content 안에서 문장이 바뀌거나 단락이 나뉠 때는 반드시 <br> 또는 <br><br> 태그를 넣으세요
${avoidQuestion ? `- 다음 기존 문제와는 다른 새로운 버전으로 만드세요 (같은 지문, 다른 접근): "${avoidQuestion}"` : ''}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 설명 없이:
{
  "sourceNumber": ${sourceItem.number},
  "type": "${type}",
  "groupId": null,
  "groupSize": 1,
  "mode": null,
  "question": "문제 지시문 한 줄만 — 절대 지문 내용을 포함하지 마세요",
  "content": "지문 본문만 (지시문 제외). 문장 사이 줄바꿈은 반드시 <br> 태그로 표시하세요",
  "options": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"],
  "answer": "정답 선택지 내용 그대로",
  "explanation": "위 해설 형식을 따른 HTML 문자열"
}`;

  // 장문독해(1지문2~3문항)는 (A)(B)(C)(D) 단락 지문 + 다문항이라 출력량이 훨씬 크므로 한도를 넉넉히 줌
  const isLongform = type.startsWith('장문독해');
  const maxTokens = isLongform ? 12288 : 4096;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens }
        })
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      return res.status(geminiRes.status).json({
        error: errData.error?.message || `Gemini API 오류 (${geminiRes.status})`
      });
    }

    const data = await geminiRes.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      return res.status(502).json({ error: 'Gemini 응답을 JSON으로 해석하지 못했습니다', raw: clean });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: '서버 오류: ' + err.message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
