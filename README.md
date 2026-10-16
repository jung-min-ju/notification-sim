# notification-sim

다먹자(KTB4) 알림 구조를 움직이는 그림으로 보여 주는 시뮬레이터 모음이다. 모두 가상 데이터로 동작하고, 실제 서비스나 알림에는 영향을 주지 않는다.

## 한눈에 보기

| 시뮬레이터 | 주소 | 다룬 범위 | 상태 |
|---|---|---|---|
| `legacy.html` | [열기](https://jung-min-ju.github.io/notification-sim/legacy.html) | 현재 단일 인스턴스 정상 흐름 (08시 배치, 푸시 작업 상태, 폴링, 03시 정리) | 보관. `notification-v2`의 ① 화면으로 그대로 쓰인다 |
| `index.html` | [열기](https://jung-min-ju.github.io/notification-sim/) | `legacy.html`과 같은 범위. 티스토리 2번 글(교체 전 「알림 설계서 v1」)에 넣었던 페이지 | 보관 |
| `index2.html` | [열기](https://jung-min-ju.github.io/notification-sim/index2.html) | ①~④: 단일·다중 인스턴스 문제와 대응, V2 개선 구조 선택 A·B | 예전판. `notification-v2`가 대체 |
| `notification-v2/` | [열기](https://jung-min-ju.github.io/notification-sim/notification-v2/) | ①~⑥: 문제와 대응, V2 이번 구현(DB 워커), SSE 화면 맞추기, 이후 개선(RabbitMQ·Outbox) | 최신 |
| `retry-delay-192/` | [열기](https://jung-min-ju.github.io/notification-sim/retry-delay-192/) | 08시 발송 구조 vs DB 워커, 네 상황(재시작·서버 2대·메모리·재시도 지연) | 최신. 블로그 삽입용 |
| `sse-flow-241/` | [열기](https://jung-min-ju.github.io/notification-sim/sse-flow-241/) | 인앱 알림 SSE: 커밋 후 Redis 발행 → 서버 3대별 연결 목록 → 재조회, 여섯 상황(저장·읽음·롤백·발행 실패·연결 변화·동시 정리) | 최신. BE #241~#245 기준 |

각 폴더의 README에 기준 코드, 관련 PR, 가정을 적어 두었다.

## 버전 흐름

```
legacy.html / index.html   현재 흐름만
        ↓
index2.html                ①~④ 문제·대응·V2 구조 (선택 A·B)
        ↓
notification-v2/           ①~⑥ DB 워커 확정, RabbitMQ는 이후로
        ↘
retry-delay-192/           #192 재시도 지연을 근거로 DB 워커 이점 4가지 비교
        ↘
sse-flow-241/              ⑤ SSE 화면 맞추기를 구현 코드(#241~#245)로 서버별로 펼침
```

## 루트 시뮬레이터의 관련 BE PR (KTB4-5th-BE)

`legacy.html`, `index.html`이 그리는 현재 흐름의 근거 코드다.

| 흐름 | PR |
|---|---|
| 08시 임박·만료 알림 배치 | [#130](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/130) 스케줄러 통합, [#131](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/131) 냉장고별 알림 생성 |
| 푸시 발송 작업 생성·처리 | [#121](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/121) 발송 작업 엔티티, [#124](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/124) 작업 생성, [#125](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/125) 작업 처리, [#126](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/126) 만료 푸시 스케줄러, [#128](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/128) 작업마다 가상 스레드 |
| 외부 푸시 전송 | [#107](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/107) Web Push 전송, [#112](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/112) 전송 서비스, [#118](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/118) 전송 결과 |
| 푸시 구독 등록·갱신·해제 | [#80](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/80) 기기 엔티티, [#81](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/81) 구독 서비스, [#82](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/82) 구독 API |
| 알림 조회·폴링 | [#84](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/84), [#108](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/108) 알림 서비스, [#109](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/109) 알림 API(폴링 응답) |
| 03시 수신자 기록 정리 | [#134](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/134) 사용자·냉장고별 알림 99개 정리 |

## 이 저장소의 PR

| PR | 내용 |
|---|---|
| [#1](https://github.com/jung-min-ju/notification-sim/pull/1) | `index.html`, `index2.html`, `legacy.html` 추가 |
| [#2](https://github.com/jung-min-ju/notification-sim/pull/2) | `retry-delay-192/` 추가 |
| [#3](https://github.com/jung-min-ju/notification-sim/pull/3) | `retry-delay-192/` 상황별 삽입 모드 |
| [#4](https://github.com/jung-min-ju/notification-sim/pull/4) | 삽입 모드에서 두 구조를 위아래로 배치 |
| [#5](https://github.com/jung-min-ju/notification-sim/pull/5) | `notification-v2/` 추가, 시뮬레이터별 README 정리 |
| [#6](https://github.com/jung-min-ju/notification-sim/pull/6) | `sse-flow-241/` 추가 |
