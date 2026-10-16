# 알림 SSE 서버별 흐름

알림 상태가 바뀐 뒤 DB 커밋 → Redis Pub/Sub → 서버별 연결 목록 → 브라우저 재조회까지를 서버 3대로 나눠 보여 주는 시뮬레이터다. 같은 Redis 신호가 모든 서버에 가도, 서버마다 가진 연결이 달라서 결과가 달라지는 것을 보는 게 목적이다.

- 바로 보기: https://jung-min-ju.github.io/notification-sim/sse-flow-241/
- 기준 코드: KTB4-5th-BE PR #241~#245 브랜치 `b60bd1c` (2026-10-15)
- 가상 데이터로만 동작한다. 사용자·냉장고·알림 번호와 미읽음 수는 예시다.

## 화면 구성

- 왼쪽 설명: 단계 제목과 실행 중인 서버·스레드, 지금 하는 일, 실제 호출과 코드 위치, 실행 계기, 단계 목록(누르면 그 단계로 이동).
- 위: 서버 1 트랜잭션(저장 → 사건 보관 → 커밋 → afterCommit)과 Redis 채널.
- 아래: 서버 1·2·3. 서버마다 `onMessage`와 `NotificationSseConnections`(Map → `UserSseConnections` → 연결)를 따로 그린다.
- 맨 아래: 서버별로 연결된 기기와 화면의 미읽음 수.
- 상자에 마우스를 올리면 실제 클래스·메서드 카드가 뜬다.
- 재생 속도는 기본 0.5×이고, 0.25× / 1×로 바꿀 수 있다.

## 상황

| 탭 | 보여 주는 것 |
|---|---|
| 알림 저장 | 커밋 전까지 사건 보관 → 수신자마다 PUBLISH → 서버마다 `get(userId)`가 다르고, 같은 사용자라도 다른 냉장고 탭은 `accepts`에서 건너뜀 |
| A만 읽음 | `markRead`가 true일 때만 A의 사건 1개 → A의 화면만 갱신, B 화면은 그대로 |
| 롤백 | 커밋 문에서 사건이 버려져 Redis와 어느 서버로도 신호가 가지 않음 |
| Redis 발행 실패 | DB는 커밋됐고 PUBLISH는 로그만 남김 → 다른 서버에 연결된 화면이 이전 숫자로 남음 |
| 연결 추가·끊김 | 서버 3에서 `compute`로 그룹 생성, 오류 콜백 → `computeIfPresent`로 키 제거 → 다음 신호 결과가 서버 3에서만 달라짐 |
| 동시에 빠지고 들어올 때 | 마지막 연결 제거와 재연결이 겹쳐도 같은 키를 `computeIfPresent`·`compute`로만 다뤄 새 연결이 Map에 남음 |

## 코드 사실

| 단계 | 코드 |
|---|---|
| 알림·수신자 저장 | `ExpirationNotificationService.generate` (`@Transactional`) → `NotificationRecipientService.saveRecipients` (`MANDATORY`) |
| 사건 발행 | 수신자마다 `NotificationChanged(userId, refrigeratorId)`를 `publishEvent` |
| 읽음 | `NotificationService.readNotification` → `NotificationRecipient.markRead`가 true일 때만 발행 |
| 커밋 뒤 발행 | `NotificationRedisPubSub.afterCommit` (`@TransactionalEventListener`, `@Async` 없음) → `StringRedisTemplate.convertAndSend`. 실패하면 `log.warn`만 |
| 채널 | `fridgely:notifications:changed`, 본문 `{"userId":7,"refrigeratorId":17}` |
| 구독 | `NotificationPubSubConfig`가 `RedisMessageListenerContainer`에 채널과 리스너 등록. 실행기는 따로 설정하지 않음 |
| 수신 | `NotificationRedisPubSub.onMessage` → `NotificationSseConnections.notifyChanged` |
| 연결 목록 | `Map<Long, UserSseConnections>` (`ConcurrentHashMap`). 등록 `compute`, 제거 `computeIfPresent`, 빈 그룹 정리 `removeEmptyGroup` |
| 전송 | `UserSseConnections.notifyChanged` → `NotificationSseConnection.sendChanged`. 사용자·냉장고가 둘 다 같을 때만 `notifications-changed` 전송 |
| 연결 | `GET /api/v2/refrigerators/{id}/notifications/stream`, emitter 타임아웃 5분, `connected`의 `retry` 3000ms, heartbeat 25초 |

## 시뮬레이션 가정

- 실측값이 없다. 단계 사이 시간은 보기 좋게 정한 값이고 실제 지연과 관계없다.
- 서버 3대와 기기 배치는 예시다: 서버 1에 A 노트북, 서버 2에 A 휴대폰·A 냉장고 21 탭·B 브라우저, 서버 3에 B 태블릿.
- 스레드 이름은 Spring Data Redis·Lettuce 기본 동작 기준이다. 구독 메시지는 Netty 스레드가 받고, 리스너 컨테이너가 기본 실행기 스레드에서 `onMessage`를 호출한다.
- 「동시에 빠지고 들어올 때」의 "get과 remove를 나눠 했다면"은 비교용 가정 코드다. 실제 코드에는 없다.
- 브라우저 재조회는 백엔드 계약 기준이다. 프론트 구현은 확인하지 않았다.

## 블로그 삽입

`?embed&s=<탭>`으로 넣으면 제목·설명·탭을 숨기고, 화면에 보일 때만 재생한다. 폭이 980px보다 좁으면 설명이 그림 위로 올라가고 그림은 안에서 가로로 스크롤된다.

| s | 탭 | 720px 높이 | 360px 높이 |
|---|---|---:|---:|
| `save` | 알림 저장 | 1,315 | 1,445 |
| `read` | A만 읽음 | 1,247 | 1,377 |
| `rollback` | 롤백 | 1,178 | 1,289 |
| `lost` | Redis 발행 실패 | 1,240 | 1,330 |
| `conn` | 연결 추가·끊김 | 1,281 | 1,411 |
| `race` | 동시에 빠지고 들어올 때 | 1,266 | 1,399 |

```html
<iframe src="https://jung-min-ju.github.io/notification-sim/sse-flow-241/?embed&s=save&v=1" width="100%" height="1330" frameborder="0" scrolling="auto"></iframe>
```

## 검사 (2026-10-15~16, Playwright Chromium)

- 탭 6개를 0.3초 간격으로 돌려 글자 겹침, 그림 밖 글자, 상자 넘침을 확인했다. 정지 화면 기준 문제 없음.
- 폭 360 / 720 / 1,485에서 페이지 가로 스크롤 없음. pageerror 0개.
- 확인하지 못한 것: 실제 휴대폰, 웹 글꼴 적용 상태(검사 환경에서 Google Fonts를 받지 못함).

## 관련 PR

| 구분 | 링크 |
|---|---|
| 기준 BE PR | [#241](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/241) 갱신 사건 등록, [#242](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/242) 사용자·냉장고별 연결 관리, [#243](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/243) Redis 중계, [#244](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/244) V2 SSE API, [#245](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/245) 연동 문서 |
| Redis 설정 | [KTB4-5th-BE #189](https://github.com/100-hours-a-week/KTB4-5th-BE/pull/189) |
