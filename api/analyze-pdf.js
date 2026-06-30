import { categoriesPromptBlock } from '../lib/categories.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다' });
  }

  const { pdfBase64 } = req.body;
  if (!pdfBase64) {
    return res.status(400).json({ error: 'pdfBase64 데이터가 없습니다' });
  }

  const prompt = `당신은 한국 수능/모의고사 영어 시험지 분석 전문가입니다.
이 PDF는 영어 시험지입니다. 다음을 정확히 분석해주세요:

1. 각 문항 번호(1번, 2번 등)를 찾아내세요
2. 각 문항의 유형을 아래 [공식 카테고리 체계]에서 정확히 하나를 골라 분류하세요. 목록에 없는 임의 명칭을 만들지 마세요.
3. 한 지문을 여러 문항이 공유하는 "다문항 세트"를 감지하세요 (예: [41~43]번이 같은 지문 사용 → 장문독해 유형)
4. 각 문항의 지문 첫 15단어 정도만 발췌하세요
5. 각 지문의 대략적인 영어 단어 수를 추정하세요

[공식 카테고리 체계]
${categoriesPromptBlock()}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이:
{
  "items": [
    {
      "number": 1,
      "type": "위 카테고리 체계의 정확한 유형명",
      "passagePreview": "지문 첫 15단어...",
      "wordCount": 90,
      "setGroup": null
    }
  ],
  "sets": [
    {
      "groupId": "A",
      "numbers": [41, 42, 43],
      "sharedPassagePreview": "공유 지문 첫 15단어..."
    }
  ]
}

setGroup은 다문항 세트에 속하면 그룹ID(문자열), 아니면 null로 하세요.
sets가 없으면 빈 배열 []로 하세요.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 16384 }
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
