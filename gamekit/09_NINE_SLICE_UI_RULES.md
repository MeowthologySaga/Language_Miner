# Nine-Slice UI Rules

이 문서는 게임 UI용 버튼, 패널, 칩, 슬롯 프레임을 스프라이트로 만들 때 깨지지 않게 쓰기 위한 일반 규칙입니다.

## 언제 사용하나

9-slice UI는 다음 요소에 우선 사용합니다.

- 크기가 여러 개로 늘어나는 버튼
- 메뉴 패널과 팝업 프레임
- 재화/스탯 칩
- 장비 슬롯, 카드 슬롯, 리스트 행
- 텍스트 길이에 따라 폭이 달라지는 UI

고정 크기 아이콘, 작은 심볼, 일러스트, 캐릭터 스프라이트에는 9-slice를 쓰지 않습니다.

## 제작 원칙

- 모서리는 장식과 하이라이트를 담고, 크기 변경 시 늘어나지 않게 한다.
- 상단/하단/좌우 가장자리는 반복 또는 균일 스트레치가 가능해야 한다.
- 중앙 영역은 텍스트가 올라가도 읽히는 낮은 대비 배경으로 둔다.
- 프레임 안쪽 여백은 CSS padding으로 확보하고, 텍스트가 장식 위에 올라가지 않게 한다.
- 버튼 상태는 최소 `default`, `primary`, `danger`, `disabled`를 구분한다.
- 같은 UI 세트 안에서는 모서리 크기, 선 두께, 하이라이트 위치를 통일한다.

## 권장 파일 구조

```txt
assets/sprites/ui/nine-slice/
  panel-frame.png
  button-primary.png
  button-secondary.png
  button-danger.png
  chip-frame.png
  slot-frame.png
  nine-slice-meta.json
  prompt-used.txt
```

## CSS 적용 규칙

브라우저 게임에서는 `border-image`를 기본 방식으로 사용합니다.

```css
.ui-panel {
  border: 20px solid transparent;
  border-image-source: url("../assets/sprites/ui/nine-slice/panel-frame.png");
  border-image-slice: 30 fill;
  border-image-width: 20px;
  border-image-repeat: stretch;
  background: rgba(20, 13, 7, 0.72);
}
```

버튼은 높이와 폭이 달라져도 상단 장식이 어긋나지 않아야 합니다. 버튼 안쪽 선, 보석 장식, 중앙 하이라이트가 텍스트 길이에 따라 찌그러지는 경우 통과시키지 않습니다.

## 생성 프롬프트 기준

9-slice 원본 이미지를 생성할 때는 다음 조건을 명시합니다.

- 정면 UI 프레임
- 투명 또는 단색 크로마키 배경
- 모서리 장식이 네 귀퉁이에 정확히 분리됨
- 중앙은 비어 있거나 낮은 대비
- 상단/하단 가장자리는 수평 반복 가능
- 좌우 가장자리는 수직 반복 가능
- 텍스트, 숫자, 아이콘을 이미지 안에 넣지 않음

## 검수 체크리스트

AI는 최종 패키징 전 다음을 확인합니다.

- 1280x720에서 버튼/패널 상단 장식이 어긋나지 않는가?
- 긴 한글 텍스트가 프레임 장식과 겹치지 않는가?
- 작은 버튼과 큰 버튼 모두 같은 프레임 규칙으로 자연스럽게 보이는가?
- `disabled` 상태가 클릭 가능 상태와 충분히 구분되는가?
- 좁은 비율에서도 텍스트가 프레임 밖으로 나가지 않는가?
- 이미지 로드 실패 시 CSS 배경색/테두리 fallback으로 UI를 읽을 수 있는가?

## 금지

- 버튼 텍스트를 스프라이트 이미지에 직접 박아 넣기
- 한 장짜리 버튼 이미지를 단순 확대해서 모서리까지 늘리기
- 패널 안에 또 다른 장식 패널을 과하게 중첩하기
- 특정 게임 세계관, 고유 아이템명, 고유 재화명을 프레임 파일명이나 문서 예시에 넣기
