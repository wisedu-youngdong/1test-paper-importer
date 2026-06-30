import { categoriesPromptBlock, typeRulesPromptBlock, EXPLANATION_FORMAT_GUIDE } from '../lib/categories.js';

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

  const longformTypes = types.filter(t => t.startsWith('장문독해'));
  const normalTypes = types.filter(t => !t.startsWith('장문독해'));

  const prompt = `당신은 한국 수능/모의고사 영어 문제 출제 전문가이자, 실제 문제은행 플랫폼에 업로드되는 표준 포맷을 정확히 따르는 출제자입니다.
아래는 원본 시험지에서 선택된 문항들의 지문 정보입니다. 이 지문들을 기반으로 새로운 변형 문제를 생성해주세요.

[선택된 원본 문항]
${itemsDesc}

[공식 카테고리 체계 — 반드시 이 안에서만 유형을 선택하세요]
${categoriesPromptBlock()}
(듣기 영역은 제외, 읽기/독해 유형만 사용)

[선택된 유형별 출제 문법 규칙 — 반드시 이 형식을 정확히 지키세요]
${typeRulesPromptBlock(types)}

[해설 작성 형식 — 반드시 이 HTML 구조를 따르세요]
${EXPLANATION_FORMAT_GUIDE}

[생성 조건]
- 각 원본 문항마다 ${multiplier}개씩 새로운 문제를 생성하세요
- 난이도: ${difficulty}
- 적용할 문제 유형: ${types.join(', ')} 중에서 다양하게 섞어서 출제하세요 (반드시 위 공식 카테고리 명칭 그대로 사용)
- 원본 지문의 주제와 어휘 수준을 참고하되, 표현은 새롭게 작성하세요 (원문 그대로 베끼지 마세요)
- 빈칸추론은 본문 안에 "__________________"(밑줄 20개)로 빈칸을 표시하세요
- 무관한문장찾기/문맥속어법(밑줄형)/문맥속어휘(밑줄형)/문장삽입은 본문 안에 ①②③④⑤ 번호를 직접 삽입하세요
- 글의순서배열/장문독해는 본문 안에 (A)(B)(C)(D) 단락 마커와 <br><br>로 단락을 구분하세요
- 각 문제는 5지선다 객관식으로 작성하세요 (한국 수능 표준)
- question 필드에는 지시문 한 문장만, content 필드에는 지문 본문만 넣으세요. 절대 섞지 마세요
- content 안에서 문장이 바뀌거나 단락이 나뉠 때는 반드시 <br> 또는 <br><br> 태그를 넣으세요 (줄바꿈 없이 텍스트가 한 덩어리로 이어지면 안 됩니다)
${longformTypes.length > 0 ? `
[장문독해 특별 규칙]
- "장문독해(1지문3문항)" 선택 시: (A)(B)(C)(D) 4단락 서사 지문 하나를 만들고, 그 지문 하나로 3문항(순서배열/지칭추론/내용일치)을 세트로 생성하세요
  - 지칭추론 문제는 본문 속 5개 대명사에 (a)~(e) 표시를 하고 <u>밑줄</u>처리하며, 그 중 가리키는 대상이 다른 것 1개를 정답으로 합니다
- "장문독해(1지문2문항)" 선택 시: (A)(B) 2단락 서사 지문 하나로 2문항 세트를 생성하세요
- 이 경우 groupSize와 mode를 questions 배열 안에 함께 표시하세요
` : ''}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 설명 없이:
{
  "questions": [
    {
      "sourceNumber": 41,
      "type": "공식 카테고리의 정확한 유형명",
      "groupId": "다문항 세트인 경우 같은 그룹ID 공유, 단일문항이면 null",
      "groupSize": 1,
      "mode": null,
      "question": "문제 지시문 한 줄만 (예: '다음 글의 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.') — 절대 지문 내용을 포함하지 마세요",
      "content": "지문 본문만 (지시문 제외). 문장 사이 줄바꿈은 반드시 <br> 태그로 표시하세요",
      "options": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"],
      "answer": "정답 선택지 내용 그대로",
      "explanation": "위 해설 형식을 따른 HTML 문자열"
    }
  ]
}

groupSize/mode 규칙: 단일 문항은 groupSize=1, mode=null. 다문항 세트(장문독해)는 groupSize=2 또는 3, mode="Composite"이며 같은 groupId를 공유합니다.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 24576 }
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
