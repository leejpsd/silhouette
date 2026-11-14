// Copy this app needs that shared/copy does not have yet. Looked up after shared/copy and the pack
// copy, so once shared/copy has a key, its text is used and the entry here can be removed.

export const LOCAL_COPY = {
  en: {
    'answers.facts.uses': 'This program uses:',
    'leaving.notCompleted': 'Not completed: {count}. Each one is listed below with the reason.',
    'why.metBy': 'Met through: {way}.',
    'why.exception': 'Over this limit, but still possible because of: {what}.',
    'why.capNote': 'This is the limit for a household of {cap} or more.',
  },
  es: {
    'answers.facts.uses': 'Este programa usa:',
    'leaving.notCompleted': 'Sin completar: {count}. Cada una aparece abajo con el motivo.',
    'why.metBy': 'Se cumple por: {way}.',
    'why.exception': 'Por encima de este límite, pero todavía es posible por: {what}.',
    'why.capNote': 'Es el límite para un hogar de {cap} o más personas.',
  },
  ko: {
    'answers.facts.uses': '이 프로그램이 보는 답:',
    'leaving.notCompleted': '완료되지 않음: {count}. 아래에 이유와 함께 있습니다.',
    'why.metBy': '다음으로 충족: {way}.',
    'why.exception': '한도를 넘지만 다음 때문에 아직 가능합니다: {what}.',
    'why.capNote': '{cap}명 이상 가구의 한도입니다.',
  },
} as const;
