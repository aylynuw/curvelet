import type { Lang } from '../i18n';

const en = {
  open: 'Draw or use a photo',
  close: 'Hide drawing and photo',
  modes: 'Input',
  draw: 'Draw',
  photo: 'Photo',
  pad: 'Drawing pad: write math with a finger, pen or mouse',
  padHint: 'Write one line, symbols side by side. Write powers small and raised, fractions over a bar, roots with a long top.',
  undo: 'Undo stroke',
  clear: 'Clear',
  choose: 'Choose or take a photo',
  photoHint: 'A clear photo of one line of math, printed or handwritten, on light paper. Drag over the picture to read just part of it.',
  photoAlt: 'The photo, with the part being read outlined',
  reading: 'Reading…',
  nothing: 'Nothing recognised yet.',
  check: 'Check it and fix anything misread, then add it.',
  result: 'Recognised',
  add: 'Add as a line',
  unreadable: 'This doesn’t read as math yet. Fix it in the field above before adding.',
  badImage: 'That file couldn’t be opened as a picture.',
  stays: 'Your drawings and photos stay on this device; nothing is uploaded.',
};

export type InkStrings = typeof en;

const ko: InkStrings = {
  open: '손글씨 또는 사진으로 입력',
  close: '손글씨와 사진 닫기',
  modes: '입력 방법',
  draw: '손글씨',
  photo: '사진',
  pad: '필기 패드: 손가락, 펜, 마우스로 수식을 쓰세요',
  padHint: '한 줄로 기호를 나란히 쓰세요. 거듭제곱은 작게 위로, 분수는 가로줄 위아래로, 루트는 윗줄을 길게 씁니다.',
  undo: '획 지우기',
  clear: '모두 지우기',
  choose: '사진 고르기 또는 찍기',
  photoHint: '밝은 종이 위 수식 한 줄(인쇄 또는 손글씨)을 선명하게 찍어 주세요. 사진 위를 끌면 그 부분만 읽습니다.',
  photoAlt: '사진과 읽는 부분 표시',
  reading: '읽는 중…',
  nothing: '아직 알아본 것이 없습니다.',
  check: '잘못 읽은 곳을 고친 뒤 추가하세요.',
  result: '알아본 식',
  add: '줄로 추가',
  unreadable: '아직 수식으로 읽히지 않습니다. 위 칸에서 고친 뒤 추가하세요.',
  badImage: '이 파일을 그림으로 열 수 없습니다.',
  stays: '손글씨와 사진은 이 기기에만 남고 어디에도 올라가지 않습니다.',
};

export const INK: Record<Lang, InkStrings> = { en, ko };
