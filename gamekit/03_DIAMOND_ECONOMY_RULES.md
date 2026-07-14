# Diamond Economy Rules

Language Miner의 다이아는 사용자가 학습 활동으로 얻는 로컬 보상입니다. Game Pack은 다이아를 만들거나 잔액을 직접 바꿀 수 없고, manifest에 미리 선언한 소비만 Host에 요청할 수 있습니다.

## 절대 규칙

- 게임은 다이아를 지급·판매·환전하거나 실제 돈처럼 표현하지 않습니다.
- 게임 저장값이나 `localStorage`를 다이아 잔액의 기준으로 삼지 않습니다.
- 가능한 소비를 `manifest.json`의 `economy.diamondActions`에 선언합니다.
- 런타임은 금액이나 사유를 보내지 않고 action `id`만 요청합니다.
- Host가 manifest의 금액과 사유를 다시 읽고 사용자 확인창을 표시합니다.
- 선언되지 않은 action은 `action_not_allowed`로 거부됩니다.
- 반복 가능한 action은 같은 구매 의도에 같은 `idempotencyKey`를 사용해 중복 차감을 막습니다.
- 차감 성공 뒤에만 게임 보상을 지급하고 즉시 저장합니다.

## 올바른 소비 흐름

```text
게임 UI에서 다이아 버튼 클릭
→ 게임이 action id와 idempotency key로 Host에 요청
→ Host가 설치·검증된 manifest에서 금액과 사유 확인
→ 사용자 확인창 표시
→ 사용자가 승인
→ Host가 원자적으로 차감
→ 게임에 성공 결과와 새 잔액 전달
→ 게임이 보상을 지급하고 저장
```

## 게임 코드 예시

```js
const purchaseKey = `character-gacha-1:${save.purchaseCounter + 1}`;
const result = await window.LEM_GAME_HOST_API.wallet.spend({
  id: "character-gacha-1",
  idempotencyKey: purchaseKey
});

if (result.ok) {
  grantCharacterGachaResult();
  save.purchaseCounter += 1;
  const saveResult = await window.LEM_GAME_HOST_API.save.write(save);
  if (saveResult?.ok === false) {
    showError(saveResult.message);
  }
} else {
  showError(result.message);
}
```

Host 요청은 reject 대신 `{ ok: false, code, message }`로 끝날 수 있으므로 저장 결과도 확인합니다. manifest action은 최대 64개이며, `id`는 1–80자의 안전한 문자, `amount`는 1–1,000,000 정수, `reason`은 1–160자입니다. `repeatable: true`인 action에는 idempotency key가 필수이고, 반복 불가 action은 Host가 한 번만 차감합니다.

금지 예시:

```js
// 금지: 런타임이 임의 금액이나 사유를 정하지 않습니다.
window.LEM_GAME_HOST_API.wallet.spend({
  id: "character-gacha-1",
  amount: 1,
  reason: "숨겨진 가격"
});
```

## 좋은 다이아 소비처

다이아 없이도 기본 게임이 재미있어야 합니다. 선택형 스킨, 확정 아이템, 추가 입장, 시간 단축, 편의 슬롯, 명확한 부활 같은 소비처를 권장합니다.

랜덤박스·도박형 보상, 자동 반복 차감, 저장 기능 유료화, 다이아 없이는 진행할 수 없는 구조, 이해하기 어려운 가격은 사용하지 않습니다.

## manifest 예시

```json
{
  "permissions": {
    "walletSpend": true,
    "storage": true,
    "network": false,
    "externalLinks": false,
    "cardRead": false
  },
  "economy": {
    "diamondActions": [
      {
        "id": "character-gacha-1",
        "amount": 100,
        "reason": "캐릭터 1회 소환",
        "repeatable": true
      }
    ]
  }
}
```
