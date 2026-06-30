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
4. 각 문항의 지문 전체 원문을 빠짐없이 그대로 추출하세요 (요약하거나 생략하지 말고 PDF에 적힌 원문 그대로)
   - 원본에 ①②③④⑤ 같은 번호가 단어/구문 앞에 표시되어 있고 그 부분에 밑줄이 그어져 있다면,
     fullPassage 안에서도 해당 단어/구문을 <u>밑줄</u> 태그로 감싸서 원본 그대로 재현하세요
     (예: "Flower" co-categorizes the white and yellow types ①<u>differences</u> 형태)
   - 원본에 빈칸(______ 형태)이 있다면 그대로 빈칸으로 유지하세요
   - 원본에 (A)(B)(C)(D) 단락 마커가 있다면 그대로 유지하세요
   - [매우 중요] fullPassage에는 순수 지문 본문만 넣으세요. 다음은 절대 fullPassage에 포함하지 마세요:
     · 문제 지시문 (예: "다음 빈칸에 들어갈 말로 가장 적절한 것은?")
     · 5지선다 선택지 목록 (예: "① universal ② collective ③ individualist ④ romantic ⑤ capitalist")
     · 문항 번호와 배점 표기 (예: "30. (3점)")
     단, 지문 본문 안에 어법/어휘 문제처럼 ①②③④⑤가 단어 앞에 붙어 밑줄로 표시된 경우는
     그 부분이 지문의 일부이므로 그대로 포함하세요 (이건 "선택지 목록"이 아니라 "지문 속 표시"입니다)
   - [문장요약 유형 전용 규칙] 유형이 "문장요약"인 경우, fullPassage 안에 지문 본문과
     요약문(빈칸 (A)(B) 포함)을 구분자 "[[SUMMARY]]"로 분리해서 넣으세요.
     형식: "지문 본문 전체[[SUMMARY]]요약문 (빈칸 포함)"
   - [각주 처리 규칙] 지문 하단에 *, **, *** 같은 각주(단어 설명)가 있다면,
     본문과 바로 이어붙이지 말고 반드시 <br><br> 두 번으로 충분히 띄운 후 추가하세요
5. 지문 첫 15단어도 별도로 발췌하세요 (목록 미리보기용)
6. 각 지문의 대략적인 영어 단어 수를 추정하세요
7. 각 지문의 읽기 난이도를 추정하세요:
   - Lexile 지수 범위 (예: "900~960L") — 어휘 복잡도, 문장 길이, 구문 난이도 기준
   - AR(Accelerated Reader) 지수 (예: 6.5) — 미국 학년 기준 환산치
   - 난이도 레벨 1~5 (1=가장 쉬움, 5=가장 어려움) — 한국 수능 기준 체감 난이도
   - 예상 오답률 범위 (예: "15~20%") — 난이도 레벨에 비례하여 추정

[중요 — 누락 방지 검증]
JSON을 작성하기 전에, PDF에 등장하는 가장 작은 문항 번호부터 가장 큰 문항 번호까지
빠진 번호가 없는지 반드시 다시 확인하세요. 특히 같은 유형(예: 빈칸추론)의 문항이
연속으로 여러 개 나올 때 누락되기 쉬우니 각 문항을 개별적으로 빠짐없이 처리하세요.
예를 들어 29~36번이 PDF에 있다면 items 배열에 29,30,31,32,33,34,35,36 모두 포함되어야 합니다.

[공식 카테고리 체계]
${categoriesPromptBlock()}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이:
{
  "items": [
    {
      "number": 1,
      "type": "위 카테고리 체계의 정확한 유형명",
      "passagePreview": "지문 첫 15단어...",
      "fullPassage": "지문 전체 원문 (줄바꿈은 <br>, 원본의 밑줄 표시는 <u>태그</u>로 재현, 빈칸/단락마커는 그대로 유지)",
      "wordCount": 90,
      "setGroup": null,
      "lexile": "900~960L",
      "ar": 6.5,
      "difficultyLevel": 2,
      "errorRate": "15~20%"
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 32768 }
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
