import { categoriesPromptBlock } from '../lib/categories.js';

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

  const prompt = `당신은 한국 수능/모의고사 영어 문제 출제 전문가입니다.
아래 원본 지문을 기반으로 새로운 문제 1개를 생성해주세요.

[원본 문항]
- ${sourceItem.number}번: "${sourceItem.passagePreview || ''} ..." (약 ${sourceItem.wordCount || '?'}단어)

[공식 카테고리 체계 — 반드시 이 안에서만 유형을 선택하세요]
${categoriesPromptBlock()}

[생성 조건]
- 문제 유형: ${type} (반드시 이 유형으로 생성)
- 난이도: ${difficulty}
- 원본 지문의 주제와 어휘 수준을 참고하되, 표현은 새롭게 작성하세요
- 4지선다 객관식으로 작성하세요 (글의순서배열/문장삽입 유형은 예외 가능)
- 정답과 함께 한 줄 해설(인과관계 중심)을 포함하세요
${avoidQuestion ? `- 다음 기존 문제와는 다른 새로운 버전으로 만드세요 (같은 지문, 다른 접근): "${avoidQuestion}"` : ''}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 설명 없이:
{
  "sourceNumber": ${sourceItem.number},
  "type": "${type}",
  "question": "문제 본문 (지문 포함 가능)",
  "options": ["선택지1", "선택지2", "선택지3", "선택지4"],
  "answer": "정답 선택지 번호 또는 내용",
  "explanation": "정답인 이유에 대한 간단한 해설"
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096 }
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
