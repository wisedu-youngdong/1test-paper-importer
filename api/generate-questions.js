export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다' });
  }

  const { items, multiplier, difficulty, types } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '생성할 문항(items)이 없습니다' });
  }

  const itemsDesc = items.map(it =>
    `- ${it.number}번 (원래 유형: ${it.type || '미상'}): "${it.passagePreview || ''} ..." (약 ${it.wordCount || '?'}단어)`
  ).join('\n');

  const prompt = `당신은 한국 수능/모의고사 영어 문제 출제 전문가입니다.
아래는 원본 시험지에서 선택된 문항들의 지문 정보입니다. 이 지문들을 기반으로 새로운 변형 문제를 생성해주세요.

[선택된 원본 문항]
${itemsDesc}

[생성 조건]
- 각 원본 문항마다 ${multiplier}개씩 새로운 문제를 생성하세요
- 난이도: ${difficulty}
- 적용할 문제 유형: ${types.join(', ')} 중에서 다양하게 섞어서 출제하세요
- 원본 지문의 주제와 어휘 수준을 참고하되, 표현은 새롭게 작성하세요 (원문 그대로 베끼지 마세요)
- 각 문제는 4지선다 객관식으로 작성하세요 (단, 영작/순서배열 유형은 예외적으로 다른 형식 가능)
- 정답과 함께 한 줄 해설(인과관계 중심)을 포함하세요

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 설명 없이:
{
  "questions": [
    {
      "sourceNumber": 41,
      "type": "빈칸 완성",
      "question": "문제 본문 (지문 포함 가능)",
      "options": ["선택지1", "선택지2", "선택지3", "선택지4"],
      "answer": "정답 선택지 번호 또는 내용",
      "explanation": "정답인 이유에 대한 간단한 해설"
    }
  ]
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 16384 }
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
