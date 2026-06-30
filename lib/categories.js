// 수능/모의고사 영어 독해 문항 유형 카테고리 체계
// 18~45번 기준 (듣기 제외, 읽기 영역만)

export const QUESTION_CATEGORIES = [
  {
    group: "정보확인형",
    types: ["글의목적", "주장/시사", "일치/불일치(도표자료)", "일치/불일치(내용)", "일치/불일치(실용자료)"]
  },
  {
    group: "내용이해형",
    types: ["심경/분위기", "밑줄함축의미", "요지", "주제", "제목"]
  },
  {
    group: "언어분석형",
    types: ["문맥속어법(밑줄형)", "문맥속어법(선택형)", "문맥속어휘(밑줄형)", "문맥속어휘(선택형)"]
  },
  {
    group: "논리구성형",
    types: ["빈칸추론", "무관한문장찾기", "글의순서배열", "문장삽입", "문장요약"]
  },
  {
    group: "장문독해",
    types: ["장문독해(1지문2문항)", "장문독해(1지문3문항)"]
  }
];

// 평탄화된 전체 유형 리스트 (선택 UI, 프롬프트 주입용)
export const ALL_TYPES = QUESTION_CATEGORIES.flatMap(c => c.types);

// 프롬프트에 주입할 텍스트 블록 생성
export function categoriesPromptBlock() {
  return QUESTION_CATEGORIES
    .map(c => `[${c.group}] ${c.types.join(', ')}`)
    .join('\n');
}

// 유형명 → 그룹명 역매핑 (UI 태그 색상 분류 등에 사용)
export function findGroup(typeName) {
  const found = QUESTION_CATEGORIES.find(c => c.types.includes(typeName));
  return found ? found.group : "기타";
}
