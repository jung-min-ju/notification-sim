# 냉장고 구성원 내보내기 흐름

방장이 공유 냉장고에서 구성원을 내보낼 때, 구성원 상태와 알림과 화면 신호가 어떤 순서로 바뀌는지 보여 주는 시뮬레이터다. 가상 데이터만 쓰고, 실제 서비스나 알림에는 연결하지 않는다.

- 종류: 흐름 추적 (단계형 뼈대. 요점이 "무엇이 어떤 순서로 바뀌나"라서 단계형을 골랐다)
- 바로 보기(배포 뒤): https://jung-min-ju.github.io/notification-sim/member-kick-flow/
- 삽입 모드: `?embed&s=<상황>` (상황: `basic`, `kafka`)
- 만든 도구: `kit/backend-simulator/` (PR #10)

## 코드 사실 (KTB4-5th-BE `dev`, 커밋 `ad6550f`, 2026-11-19 확인)

- 방장이 `DELETE /api/v1/refrigerators/{refrigeratorId}/members/{targetUserId}`를 부르면 `MembershipService.kick()`이 처리한다. 클래스 전체가 `@Transactional`이다.
- 내보내기는 다음 순서로 한 트랜잭션 안에서 처리된다.
  1. 방장과 대상 사용자를 잠근다.
  2. 관련 냉장고 행을 ID 순서로 잠근다. 교착을 막으려는 것이다.
  3. 대상의 공유 참여를 끝내고, 대상의 개인 냉장고를 다시 선택한다.
- 그 뒤 `MembershipNotificationService.kicked()`를 부른다. 이때 당사자를 뺀 모든 활성 구성원이 알림 수신자가 된다. 방장도 포함된다.
  - **Kafka 경로가 꺼져 있으면(기본값)**: 알림과 수신자를 바로 저장한다. 수신자를 저장하면 `NotificationChanged` 사건이 발행된다.
  - **Kafka 경로가 켜져 있으면**: 알림을 만들지 않는다. 대신 냉장고별 순번이 붙은 변경 기록을 참여 행에 남긴다.
- 마지막으로 `MemberKicked` 사건을 발행한다.
- 커밋이 끝나면 `NotificationRedisPubSub`이 두 사건을 Redis 채널로 보낸다.
  - `NotificationChanged` → `fridgely:notifications:changed`
  - `MemberKicked` → `fridgely:members:kicked`
  - 각 서버는 이 신호를 받아 자기가 가진 SSE 연결에 전달한다. 추방 당사자의 그 냉장고 연결에는 `kicked` 이벤트(빈 JSON)를 보낸다.
- Kafka 경로가 켜져 있을 때 이어지는 일:
  - **구성원 전송 담당**(`MembershipKafkaSender`)이 1초마다 보낼 기록을 찾는다. 찾은 기록은 냉장고 ID를 키로 Kafka 트랜잭션에 담아 보낸다. 커밋이 확인된 뒤에만 전송 위치를 기록한다.
  - **알림 리스너**(`MembershipKafkaListener` → `MembershipNotificationProcessor`)는 받은 메시지가 원본 기록·순번과 맞는지 확인한다. 맞으면 알림, 수신자, 처리 위치를 한 트랜잭션에 저장한다. 이미 처리한 순번은 건너뛴다.
- 설정 기본값(`application.yml:260~264`):
  - `membership.kafka.enabled` = `false`
  - `transport-enabled` = `false`
  - `poll-interval` = `1s`
  - `batch-size` = `100`

## 상황

| 상황 | 요청 안에서 끝나는 일 | 나중에 하는 일 | 차이 |
|---|---|---|---|
| 기본 흐름 (`basic`) | 잠금, 구성원 상태 변경, 알림 저장 | 커밋 뒤 Redis → SSE 신호 | 알림이 요청과 함께 커밋된다 |
| Kafka 경로 켜짐 (`kafka`) | 잠금, 구성원 상태 변경, 변경 기록 | 추방 신호(바로), Kafka 전송, 리스너의 알림 저장 | 추방 신호는 바로 가고, 알림은 나중에 도착한다 |

## 근거 코드

화면에는 코드를 두지 않는다. 단계마다 근거를 여기에 적는다. 기준 커밋은 모두 `ad6550f`다.

| 상황 | 단계 | 근거 파일:줄 | 무엇을 확인했나 |
|---|---|---|---|
| 공통 | 내보내기 요청 | `MembershipController.java:62` | DELETE 요청 경로 |
| 공통 | 잠금 | `MembershipService.java:85` | 사용자 잠금, 냉장고 ID 순 잠금(`:132` 주석) |
| 공통 | 개인 냉장고로 복귀 | `MembershipService.java:96`, `:112` | 공유 참여 종료, 개인 관계 활성화 |
| 기본 | 알림 저장 | `MembershipNotificationService.java:66` | 알림과 수신자 저장 |
| 기본 | Redis 신호 | `NotificationRedisPubSub.java:25`, `:35` | 커밋 뒤 두 채널로 발행 |
| 기본 | 기기 알림 | `NotificationSseConnection.java:88` | 당사자 연결에 `kicked` |
| 기본 | 정리 | `MembershipService.java:31` | 클래스 전체 `@Transactional` |
| Kafka | 변경 기록 | `MembershipNotificationService.java:59`, `:78` | 켜져 있으면 알림 대신 기록 |
| Kafka | 추방 신호 | `MembershipService.java:98` | Kafka와 상관없이 발행 |
| Kafka | Kafka 전송 | `MembershipKafkaSender.java:54`, `:106`, `:125` | 1초 주기, 트랜잭션, 키 = 냉장고 ID |
| Kafka | 전송 위치 | `MembershipKafkaSender.java:119` | 커밋 확인 뒤 기록 |
| Kafka | 리스너 | `MembershipKafkaListener.java:20`, `MembershipNotificationProcessor.java:34`, `:63` | 원본 확인, 순번 중복 건너뜀, 알림 저장 |
| Kafka | 정리 | `application.yml:260` | 두 설정 기본값 꺼짐 |

## 시뮬레이션 가정

- 사람은 셋이다: 방장, 내보내진 구성원 M, 남은 구성원 U2. 방장도 알림을 받지만 그림에서는 U2의 알림만 따라간다.
- 요청은 서버 S1이 받고, M과 U2의 기기는 서버 S2에 SSE로 연결돼 있다고 뒀다. 실제로는 기기가 어느 서버에 연결될지 정해져 있지 않다.
- 알림 리스너는 서버 S2 안에서 돈다고 그렸다. 실제로는 소비자 그룹 안의 아무 서버나 받을 수 있다.
- "구성원 테이블"은 참여 행과 전송 위치 테이블을 묶어서 그린 것이다. 알림 테이블의 "처리 위치"는 알림 처리 진행 테이블이다.
- 실측이 없어서 초 단위 숫자는 쓰지 않았다.

## 확인 못 한 것

- 프론트가 `kicked`를 받은 뒤 화면을 어떻게 바꾸는지. 프론트 저장소는 보지 않았다.
- 구성원 전송 담당의 소유권 잠금(`ensureOwnership`) 세부 동작. 그림에서는 "담당 하나가 보낸다"까지만 보여 준다.
- 사파리, 실제 블로그에 넣은 화면

## 검사 (`kit/backend-simulator/scripts/check.js`, 2026-11-19)

- 통과 19 / 전체 19
- iframe 높이(블로그 본문 폭 720):

| 상황 | 높이 |
|---|---:|
| basic | 491 |
| kafka | 491 |
