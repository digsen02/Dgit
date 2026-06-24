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

## v1 Hardening 안전 모델

DGit v1은 Discord 채널 자체를 저장소로 사용하므로, 데이터베이스 트랜잭션 대신 manifest sequence, 첨부 파일 해시, 권한 정책, apply 전 확인 절차로 안전성을 확보합니다.

### 권한 정책

읽기 전용 명령은 일반 멤버도 사용할 수 있습니다.

- `/dgit status`
- `/dgit log`
- `/dgit diff`
- `/dgit verify`
- `/dgit check-permission`
- `/dgit-branch list`
- `/dgit-ignore list`
- `/dgit-repo export|history|blame`

저장소나 서버 상태를 바꾸는 명령은 `Manage Guild` 또는 `Administrator` 권한을 요구합니다. 서버 구조를 실제로 적용하거나 삭제할 수 있는 더 위험한 작업은 `Administrator` 권한을 요구합니다.

저장소 채널은 비공개여야 합니다. `@everyone`이 저장소 채널을 보거나, 메시지를 보내거나, 파일을 첨부할 수 있으면 `/dgit init`은 실패합니다. bot은 저장소 채널에서 `View Channel`, `Send Messages`, `Read Message History`, `Attach Files`, `Manage Messages` 권한이 필요합니다.

### Dangerous confirmation

`restore`, branch `apply`, maintenance `on/off`는 먼저 dry-run 계획을 보여줍니다.

계획에 dangerous change가 없으면 확인 버튼만으로 적용할 수 있습니다. 계획에 dangerous change가 하나라도 있으면 버튼 클릭만으로는 적용되지 않습니다. 추가 modal에서 다음 단어를 직접 입력해야 합니다.

- `/dgit restore`: `RESTORE`
- branch apply 또는 maintenance apply: `APPLY`

이 절차는 실수로 역할, 채널, permission overwrite, guild 설정을 삭제하거나 덮어쓰는 일을 줄이기 위한 장치입니다.

### Safety backup

restore/apply/maintenance 계획을 실제 적용하기 직전에 DGit은 live server state와 현재 branch HEAD를 비교합니다.

차이가 없으면 그대로 적용합니다. 차이가 있으면 먼저 현재 live state를 새 커밋으로 저장합니다.

```text
Safety backup before restore <shortHash>
Safety backup before branch apply <branch> <shortHash>
Safety backup before maintenance on <shortHash>
Safety backup before maintenance off <shortHash>
```

이 백업 커밋은 적용 직전의 서버 상태를 보존합니다. 따라서 restore/apply/maintenance 직후에는 manifest sequence가 하나 더 증가할 수 있고, 저장소 채널에 백업 commit/snapshot/diff 첨부 메시지가 추가될 수 있습니다.

### Restore/apply 후 상태 의미

DGit의 apply는 Discord API 작업을 순서대로 실행합니다. Discord 권한, managed role, bot role 위치, 저장소 채널 보호, API 실패 때문에 일부 step이 skipped 또는 failed가 될 수 있습니다.

적용 결과에 failed 또는 skipped가 있으면 live server는 target snapshot과 완전히 같지 않을 수 있습니다. 이 경우 working tree는 dirty 상태로 남을 수 있으며, `/dgit status`로 실제 차이를 확인해야 합니다.

`/dgit-branch checkout`은 branch HEAD를 먼저 적용하고, 모든 step이 성공했을 때만 `currentBranch`를 바꿉니다. 일부 step이 실패하거나 skipped 되면 `currentBranch`는 기존 branch에 남고, 응답에 실패 또는 skip 사유가 표시됩니다.

### Manifest concurrency와 해시 검증

manifest는 `manifestSequence`를 사용해 optimistic concurrency를 수행합니다. commit 또는 merge 중에는 commit/snapshot/diff 객체를 업로드하기 직전에 현재 manifest sequence를 다시 확인합니다. 이 재확인은 conflict가 이미 보이는 경우 orphan commit object 생성을 줄이기 위한 best-effort guard입니다.

최종 권위 있는 guard는 manifest 저장 시점의 `expectedSequence` 확인입니다. 다른 명령이 먼저 manifest를 갱신했다면 DGit은 `Repository changed while this command was running. Reload and retry.` 오류를 반환하고 재시도를 요구합니다.

현재 manifest 메시지는 `sha256` 라인을 포함합니다. manifest 첨부 파일을 읽을 때 이 해시가 맞지 않으면 검증 실패로 처리합니다. 오래된 manifest처럼 `sha256` 라인이 없는 경우에는 legacy/unverified 상태로 표시됩니다.

### Verify/repair 복구 흐름

운영 중 저장소 상태가 의심되면 먼저 `/dgit verify`를 실행합니다. verify는 저장소 채널 탐색, manifest schema, manifest hash, branch head, commit/snapshot/diff 첨부 파일을 확인합니다.

권장 복구 순서는 다음과 같습니다.

1. `/dgit verify`로 실패 지점을 확인합니다.
2. 저장소 채널 권한과 pin 상태를 확인합니다. 저장소 채널은 bot이 읽고 쓸 수 있어야 하며, 현재 manifest 메시지가 pin 되어 있어야 합니다.
3. manifest가 손상되었거나 commit index가 맞지 않으면 `/dgit-repo repair`를 실행합니다.
4. repair는 저장소 채널의 `[DGIT:COMMIT:<hash>]` 메시지를 다시 스캔해 manifest commit index를 재구성합니다.
5. repair 후 `/dgit verify`를 다시 실행해 branch head와 첨부 파일 검증 결과를 확인합니다.
6. live server와 HEAD 차이가 남아 있으면 `/dgit status`와 `/dgit diff`로 working tree 상태를 확인한 뒤 필요한 경우 새 commit 또는 restore를 수행합니다.

repair는 저장소 채널에 남아 있는 commit/snapshot/diff 첨부 파일을 기준으로 manifest를 재구성합니다. Discord 메시지나 첨부 파일 자체가 삭제된 commit은 복구할 수 없습니다.

### 수동 Discord 테스트 체크리스트

릴리스 전 실제 Discord 개발 서버에서 다음 흐름을 한 번씩 확인합니다.

- `/dgit init channel:#dgit-repository`가 비공개 저장소 채널에서 성공하는지 확인합니다.
- `@everyone`에게 저장소 채널 `View Channel`, `Send Messages`, `Attach Files` 중 하나를 열어 둔 상태에서 `/dgit init`이 실패하는지 확인합니다.
- `/dgit check-permission` 출력이 bot guild 권한과 저장소 채널 권한을 구분해서 보여주는지 확인합니다.
- `/dgit status`, `/dgit diff`, `/dgit commit message:"..."`, `/dgit log` 기본 흐름을 확인합니다.
- `/dgit restore commit:<hash>`가 dry-run을 먼저 보여주고, dangerous plan이면 `RESTORE` typed modal 없이는 적용되지 않는지 확인합니다.
- `/dgit-branch apply branch:<name>`와 `/dgit-admin maintenance on|off`가 dangerous plan에서 `APPLY` typed modal을 요구하는지 확인합니다.
- restore/apply/maintenance 직전 live state가 HEAD와 다를 때 `Safety backup before ...` 커밋이 생성되는지 확인합니다.
- `/dgit-branch checkout branch:<name>`에서 적용 성공 후에만 current branch가 변경되는지 확인합니다.
- managed role, bot보다 높은 role, 저장소 채널 변경이 skipped로 보고되는지 확인합니다.
- `/dgit verify`가 정상 저장소에서 성공 항목을 표시하는지 확인합니다.
- manifest 또는 commit index 복구가 필요한 상황에서 `/dgit-repo repair` 후 `/dgit verify`를 다시 실행해 복구 상태를 확인합니다.

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
