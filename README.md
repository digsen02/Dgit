# DGit

DGit은 Discord 서버 구조와 설정을 Git처럼 버전 관리하는 Discord 봇입니다. 외부 데이터베이스를 사용하지 않고, `/dgit init`으로 지정한 비공개 Discord 저장소 채널의 메시지 첨부파일을 진짜 저장소로 사용합니다.

## 설치 및 사용

```bash
npm install
cp .env.example .env
npm run build
```

`.env` 파일을 열어 필요한 값을 입력합니다.

```bash
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
DEV_GUILD_ID=your-dev-guild-id
NODE_ENV=development
COMMAND_SCOPE=guild
COMMAND_REPLACE_SCOPE=false
BOT_LOCALE=ko
```

설정이 완료되면 slash command를 등록하고 봇을 실행합니다.

```bash
npm run register
npm run start
```

### 명령어 사용 예시

- 저장소 초기화: `/dgit init channel:#dgit-repository`
- 상태 확인: `/dgit status`
- 커밋 생성: `/dgit commit message:"서버 설정 저장"`
- 커밋 기록 보기: `/dgit log`
- diff 보기: `/dgit diff`
- 커밋 복원 미리보기: `/dgit restore commit:<hash>`
- 저장소 무결성 검사: `/dgit verify`
- 권한 점검: `/dgit check-permission`

### 브랜치 및 ignore

- 브랜치 생성: `/dgit-branch create name:feature-1`
- 브랜치 목록: `/dgit-branch list`
- 브랜치 체크아웃: `/dgit-branch checkout branch:feature-1`
- 브랜치 삭제: `/dgit-branch delete branch:feature-1`
- ignore 추가: `/dgit-ignore add type:channel value:#secret`
- ignore 제거: `/dgit-ignore remove type:channel value:#secret`
- ignore 목록: `/dgit-ignore list`

### 개발 모드

```bash
npm run dev
```

개발 중에는 `COMMAND_SCOPE=guild`로 설정하면 명령어 반영이 빠릅니다.

## 환경 변수

- `DISCORD_TOKEN`: 봇 토큰
- `DISCORD_CLIENT_ID`: Discord application client ID
- `DEV_GUILD_ID`: Guild Command를 등록할 개발 서버 ID
- `NODE_ENV`: `development` 또는 `production`
- `COMMAND_SCOPE`: `guild` 또는 `global`
- `COMMAND_REPLACE_SCOPE`: `true`이면 현재 선택한 범위로 등록한 뒤 반대 범위의 명령을 비웁니다
- `BOT_LOCALE`: 기본 응답 언어. `ko`, `en`, `zh` 중 하나

## 다국어 지원

DGit은 한국어, 영어, 중국어 간체 응답을 지원합니다.

```env
BOT_LOCALE=ko
```

지원 값:

- `ko`: 한국어
- `en`: English
- `zh`: 中文

Discord interaction에 사용자 locale이 포함되어 있으면 사용자 locale을 우선합니다. 예를 들어 Discord 클라이언트 언어가 중국어이면 `zh-CN`/`zh-TW` 계열 응답을 중국어로 보냅니다. locale을 알 수 없으면 `.env`의 `BOT_LOCALE`을 사용합니다.

Slash command 설명도 등록 시 다음 locale을 같이 올립니다.

- `ko`
- `en-US`
- `en-GB`
- `zh-CN`
- `zh-TW`

## Slash Command 등록 범위 전환

Discord slash command는 두 방식으로 등록할 수 있습니다.

- `Guild Command`: 특정 서버에만 적용됩니다. 거의 바로 반영됩니다.
- `Global Command`: 봇이 들어간 모든 서버에 적용됩니다. Discord 전파가 느릴 수 있습니다.

### .env로 갈아끼우기

개발 중에는 빠른 반영을 위해 guild를 권장합니다.

```env
COMMAND_SCOPE=guild
COMMAND_REPLACE_SCOPE=false
```

```bash
npm run register
```

배포 시 모든 서버에 적용하려면 global로 바꿉니다.

```env
COMMAND_SCOPE=global
COMMAND_REPLACE_SCOPE=false
```

```bash
npm run register
```

한쪽으로 완전히 갈아끼우고 반대쪽에 남은 명령을 제거하려면:

```env
COMMAND_SCOPE=global
COMMAND_REPLACE_SCOPE=true
```

```bash
npm run register
```

주의: `COMMAND_REPLACE_SCOPE=true`로 global 등록을 선택하면 `DEV_GUILD_ID` 서버의 guild command를 비웁니다. 반대로 guild 등록을 선택하면 global command를 비웁니다.

### npm 스크립트로 직접 선택

```bash
npm run register:guild
npm run register:global
```

남아 있는 명령만 직접 삭제할 수도 있습니다.

```bash
npm run commands:clear:guild
npm run commands:clear:global
```

또는 인자를 직접 넘길 수 있습니다.

```bash
npm run register -- guild
npm run register -- global
npm run register -- clear:guild
npm run register -- clear:global
```

## DGit 저장 방식

DGit은 MongoDB, PostgreSQL, Redis, SQLite, Prisma, TypeORM 같은 외부 저장소를 사용하지 않습니다.

저장소 채널에는 다음 메시지와 첨부파일이 쌓입니다.

- `[DGIT:REPOSITORY]`
- `[DGIT:MANIFEST:CURRENT]` + `manifest.json.gz`
- `[DGIT:COMMIT:<hash>]` + `commit-*.json.gz`, `snapshot-*.json.gz`, `diff-*.json.gz`

모든 JSON은 안정적인 키 정렬 후 gzip 압축되고 SHA-256 해시로 검증됩니다.

## 주요 명령

- `/dgit init channel:#dgit-repository`
- `/dgit status`
- `/dgit commit message:"..."`
- `/dgit log`
- `/dgit diff`
- `/dgit restore commit:<hash>`
- `/dgit verify`
- `/dgit check-permission`
- `/dgit-branch create|list|checkout|apply|delete`
- `/dgit-ignore add|remove|list`
- `/dgit-merge run from:<branch> to:<branch>`
- `/dgit-tag create|list|delete`
- `/dgit-repo export|repair|history|blame`
- `/dgit-admin watch enable|disable`
- `/dgit-admin autocommit enable|disable`
- `/dgit-admin maintenance on|off`

## 필요한 봇 권한

저장소 채널 최소 권한:

- View Channel
- Send Messages
- Read Message History
- Attach Files

복원과 관리 기능에 필요한 권한:

- Manage Channels
- Manage Roles
- Manage Messages
- Manage Guild
- View Audit Log

봇 역할은 관리해야 하는 역할보다 위에 있어야 합니다.

## 개발

```bash
npm run dev
npm run build
npm run test
```

현재 구현은 저장소 초기화, 상태 확인, 커밋, 로그, diff, verify, 권한 점검, restore dry-run과 확인 버튼, 실제 적용형 branch checkout/apply/delete, 3-way merge, conflict file 저장, tag, export, 전체 저장소 메시지 스캔 기반 repo repair, history/blame, watch 알림, autocommit, maintenance on/off preview를 제공합니다.

`/dgit-branch checkout`은 브랜치 HEAD 스냅샷을 서버에 실제 적용합니다. 생성, 수정, 이동, permission overwrite, 삭제를 수행한 뒤 모든 단계가 성공하면 current branch를 해당 브랜치로 변경합니다. 일부 단계가 실패하거나 저장소 채널 보호 등으로 스킵되면 current branch는 변경하지 않고 실패/스킵 사유를 보고합니다.

Merge는 충돌이 없으면 target branch에 merge commit을 만들고, 충돌이 있으면 저장소 채널에 `[DGIT:CONFLICT:<id>]` 파일을 남깁니다.
