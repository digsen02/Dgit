# DGit

DGit은 Discord 길드/서버 설정을 Discord 안에서 버전 관리하기 위한 Git-inspired 봇입니다. 일반 Git 저장소가 아니며 `.git` 디렉터리나 파일 트리를 만들지 않습니다. 저장소 데이터는 관리자가 지정한 비공개 Discord 텍스트 채널의 메시지와 첨부 파일에 저장됩니다.

DGit은 현재 코드 기준으로 길드 설정, 역할, 채널, permission overwrite, 스냅샷, diff, 커밋, 브랜치, 태그, 3-way merge와 충돌 파일, ignore 규칙, maintenance mode, watch mode, autocommit, 선택적 message backup/archive 기능을 다룹니다.

## 저장소 모델

저장소 채널은 비공개 텍스트 채널이어야 합니다. `/dgit init`은 채널에 저장소 마커를 남기고, 봇이 `Manage Channels` 권한을 가진 경우 채널 topic에 `DGIT_REPOSITORY:guild=<guildId>;repoVersion=1` 마커를 추가합니다. 이후 저장소 탐색은 topic 마커를 우선 사용하고, 없으면 `dgit-repository`, `server-git`, `git-store` 채널 이름을 찾습니다.

저장소 채널에는 다음 메시지 형식이 사용됩니다.

| 메시지 | 의미 |
|---|---|
| `[DGIT:REPOSITORY]` | 저장소 초기화 마커 |
| `[DGIT:MANIFEST:CURRENT]` | 현재 manifest 메시지입니다. pin 처리됩니다. |
| `[DGIT:MANIFEST:OLD]` | 이전 manifest 메시지입니다. 새 manifest가 올라오면 기존 current가 old로 바뀝니다. |
| `[DGIT:COMMIT:<shortHash>]` | 커밋 객체와 관련 첨부 파일을 담는 메시지입니다. |
| `[DGIT:CONFLICT:<mergeId>]` | merge 충돌 결과를 담는 메시지입니다. |

주요 첨부 파일은 gzip 압축 JSON입니다.

| 파일 | 의미 |
|---|---|
| `manifest.json.gz` | 브랜치, 태그, 커밋 인덱스, ignore, 설정, manifest sequence |
| `commit-<shortHash>.json.gz` | 커밋 메타데이터 |
| `snapshot-<shortHash>.json.gz` | 해당 커밋의 길드 구조 스냅샷 |
| `diff-<shortHash>.json.gz` | 이전 상태와의 구조 diff |
| `conflicts-<mergeId>.json.gz` | merge 충돌 목록 |
| `message-archive-<shortHash>.json.gz` | message backup이 활성화된 커밋의 메시지 아카이브 |
| `dgit-message-archive-<shortHash>.json.gz` | `/dgit-repo export-message-archive` 응답 첨부 파일 |

Manifest 메시지는 `sha256:` 라인을 포함하며, 첨부 파일 읽기 시 해시 검증을 시도합니다. 오래된 manifest처럼 해시 라인이 없으면 legacy/unverified 상태로 처리됩니다.

## 설치와 실행

`package.json` 기준 Node.js 요구 버전은 `>=20`입니다.

```bash
npm install
```

사용 가능한 npm scripts는 다음과 같습니다.

| script | 명령 | 용도 |
|---|---|---|
| `dev` | `tsx watch src/index.ts` | 개발 모드 실행 |
| `build` | `tsc -p tsconfig.json` | TypeScript 빌드 |
| `start` | `node dist/index.js` | 빌드 결과 실행 |
| `test` | `vitest run` | 테스트 실행 |
| `register` | `tsx src/discord/registerCommands.ts` | `COMMAND_SCOPE` 기준 명령 등록 |
| `register:guild` | `tsx src/discord/registerCommands.ts guild` | 개발 guild 명령 등록 |
| `register:global` | `tsx src/discord/registerCommands.ts global` | global 명령 등록 |
| `commands:clear:guild` | `tsx src/discord/registerCommands.ts clear:guild` | 개발 guild 명령 삭제 |
| `commands:clear:global` | `tsx src/discord/registerCommands.ts clear:global` | global 명령 삭제 |

일반적인 실행 순서:

```bash
npm install
npm run build
npm run register:guild
npm run start
```

개발 중에는 다음을 사용할 수 있습니다.

```bash
npm run dev
```

Global slash command 등록은 Discord 전파에 시간이 걸릴 수 있습니다. 빠른 테스트에는 guild 등록을 권장합니다.

## 환경 변수

`src/config/env.ts` 기준 환경 변수는 다음과 같습니다.

| 변수 | 필수 | 기본값 | 설명 |
|---|---:|---|---|
| `DISCORD_TOKEN` | 예 | 없음 | Discord 봇 토큰 |
| `DISCORD_CLIENT_ID` | 예 | 없음 | Discord application/client ID |
| `DEV_GUILD_ID` | guild 등록/삭제 시 필요 | 없음 | 개발 guild ID |
| `NODE_ENV` | 아니요 | `development` | 런타임 환경 문자열 |
| `COMMAND_SCOPE` | 아니요 | `guild` | `register` 실행 시 `guild` 또는 `global` |
| `COMMAND_REPLACE_SCOPE` | 아니요 | `false` | `true`이면 선택한 범위 등록 후 반대 범위 명령을 비웁니다. |
| `ENABLE_MESSAGE_CONTENT_INTENT` | 아니요 | `false` | `true`이면 Discord client에 `MessageContent` intent를 추가합니다. 메시지 백업 내용 품질에 영향을 줄 수 있습니다. |
| `BOT_LOCALE` | 아니요 | `ko` | 기본 응답 언어입니다. `ko`, `en`, `zh` 중 하나입니다. |

예시:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
DEV_GUILD_ID=your-dev-guild-id
COMMAND_SCOPE=guild
COMMAND_REPLACE_SCOPE=false
ENABLE_MESSAGE_CONTENT_INTENT=false
BOT_LOCALE=ko
```

## 권한 모델

Slash command 정의와 런타임 체크가 함께 적용됩니다. 런타임 체크가 최종 기준입니다.

| 구분 | 명령 |
|---|---|
| 읽기 전용, 별도 런타임 권한 체크 없음 | `/dgit status`, `/dgit log`, `/dgit diff`, `/dgit verify`, `/dgit check-permission`, `/dgit-branch list`, `/dgit-ignore list`, `/dgit-tag list`, `/dgit-repo export`, `/dgit-repo history`, `/dgit-repo blame` |
| `Manage Guild` 또는 `Administrator` 필요 | `/dgit commit`, `/dgit-branch create`, `/dgit-ignore add`, `/dgit-ignore remove`, `/dgit-tag create`, `/dgit-tag delete`, status 화면의 commit 버튼 |
| `Administrator` 필요 | `/dgit init`, `/dgit restore`, `/dgit-branch checkout`, `/dgit-branch apply`, `/dgit-branch delete`, `/dgit-merge run`, `/dgit-repo repair`, `/dgit-repo archive-info`, `/dgit-repo export-message-archive`, 모든 `/dgit-admin` 하위 명령 |
| Discord 기본 관리자 권한으로 노출 제한 | `/dgit-merge`, `/dgit-admin` |
| Slash command 정의는 열려 있지만 런타임에서 보호 | `/dgit init`, `/dgit commit`, `/dgit restore`, `/dgit-branch create/checkout/apply/delete`, `/dgit-ignore add/remove`, `/dgit-tag create/delete`, `/dgit-repo repair/archive-info/export-message-archive` |

저장소 채널에서 봇은 `View Channel`, `Send Messages`, `Read Message History`, `Attach Files`, `Manage Messages` 권한이 필요합니다. `/dgit init`은 `@everyone`이 저장소 채널을 보거나 메시지를 보내거나 파일을 첨부할 수 있으면 실패합니다. Topic 마커 설정에는 봇의 `Manage Channels` 권한이 필요하지만, 없으면 경고만 남깁니다.

## 명령 Reference

### `/dgit`

| 하위 명령 | Options | 필요 권한 | 동작 | 안전 참고 |
|---|---|---|---|---|
| `init` | `channel` 필수 텍스트 채널 | `Administrator` | 저장소 채널을 초기화하고 initial commit을 만듭니다. | 저장소 채널 권한과 공개 노출을 검사합니다. |
| `status` | 없음 | 없음 | 현재 서버 상태와 HEAD snapshot을 비교합니다. | diff 보기, commit, refresh 버튼을 제공합니다. commit 버튼은 `Manage Guild` 또는 `Administrator`가 필요합니다. |
| `commit` | `message` 필수 | `Manage Guild` 또는 `Administrator` | 현재 서버 상태를 현재 브랜치에 커밋합니다. | 구조 변경이 없고 message backup도 새 변경이 없으면 실패합니다. |
| `log` | `branch` 선택, `limit` 선택 1-25 | 없음 | 브랜치 커밋 이력을 표시합니다. | 기본 브랜치는 현재 브랜치입니다. |
| `diff` | `from` 선택, `to` 선택 | 없음 | 두 ref 또는 HEAD/live 상태 사이의 diff를 표시합니다. | `to`가 없으면 `from` 또는 HEAD와 현재 서버 상태를 비교합니다. |
| `restore` | `commit` 필수, `message-mode` 선택 | `Administrator` | 지정 커밋/브랜치/태그 snapshot으로 복원 계획을 미리 보여줍니다. | 확인 버튼 후 적용됩니다. 위험 변경이 있으면 `RESTORE` 입력 모달이 추가로 필요합니다. |
| `verify` | 없음 | 없음 | 저장소 manifest, 브랜치 head, 커밋 첨부 파일, message archive 첨부 파일을 검증합니다. | corrupt commit은 여기서 실패 행으로 표시됩니다. |
| `check-permission` | 없음 | 없음 | 봇 권한과 저장소 채널 권한 보고서를 보여줍니다. | 실제 적용 가능성 진단용입니다. |

`restore`의 `message-mode` 선택지는 `structureOnly`, `archiveOnly`, `renderAsAppMessages`입니다.

### `/dgit-branch`

| 하위 명령 | Options | 필요 권한 | 동작 | 안전 참고 |
|---|---|---|---|---|
| `create` | `name` 필수, `from` 선택 | `Manage Guild` 또는 `Administrator` | 새 브랜치를 만듭니다. | 이름은 `[a-zA-Z0-9._/-]` 1-64자만 허용됩니다. |
| `list` | 없음 | 없음 | 브랜치 목록과 현재 브랜치를 표시합니다. | 읽기 전용입니다. |
| `checkout` | `branch` 필수 | `Administrator` | 브랜치 HEAD를 서버에 적용한 뒤 성공 시 현재 브랜치를 변경합니다. | apply step이 실패하거나 skip되면 현재 브랜치를 바꾸지 않습니다. 현재 구현은 별도 확인 모달 없이 즉시 적용합니다. |
| `apply` | `branch` 필수 | `Administrator` | 브랜치 HEAD 적용 계획을 미리 보여줍니다. | 확인 버튼 후 적용됩니다. 위험 변경이 있으면 `APPLY` 입력 모달이 필요합니다. |
| `delete` | `branch` 필수 | `Administrator` | 브랜치를 삭제합니다. | 기본 브랜치와 현재 브랜치는 삭제할 수 없습니다. |

### `/dgit-ignore`

| 하위 명령 | Options | 필요 권한 | 동작 | 안전 참고 |
|---|---|---|---|---|
| `add` | `type` 필수, `value` 필수 | `Manage Guild` 또는 `Administrator` | ignore 규칙을 추가합니다. | `type`은 `channel`, `role`, `objectType`, `pattern` 중 하나입니다. |
| `remove` | `type` 필수, `value` 필수 | `Manage Guild` 또는 `Administrator` | ignore 규칙을 제거합니다. | 일치하는 값만 제거합니다. |
| `list` | 없음 | 없음 | ignore 규칙 목록을 표시합니다. | 초기 manifest는 `types: ["messages"]`를 기본 ignore로 둡니다. |

### `/dgit-merge`

| 하위 명령 | Options | 필요 권한 | 동작 | 안전 참고 |
|---|---|---|---|---|
| `run` | `from` 필수, `to` 필수 | `Administrator` | source 브랜치를 target 브랜치에 3-way merge합니다. | 충돌이 있으면 target을 바꾸지 않고 `[DGIT:CONFLICT:<mergeId>]`와 `conflicts-<mergeId>.json.gz`를 저장합니다. 충돌이 없으면 target 브랜치에 merge commit을 만듭니다. |

### `/dgit-tag`

| 하위 명령 | Options | 필요 권한 | 동작 | 안전 참고 |
|---|---|---|---|---|
| `create` | `name` 필수, `commit` 선택 | `Manage Guild` 또는 `Administrator` | 태그를 생성합니다. | `commit`이 없으면 현재 HEAD를 태그합니다. 이름은 `[a-zA-Z0-9._/-]` 1-64자만 허용됩니다. |
| `list` | 없음 | 없음 | 태그 목록을 표시합니다. | 읽기 전용입니다. |
| `delete` | `name` 필수 | `Manage Guild` 또는 `Administrator` | 태그를 삭제합니다. | 저장된 커밋은 삭제하지 않습니다. |

### `/dgit-repo`

| 하위 명령 | Options | 필요 권한 | 동작 | 안전 참고 |
|---|---|---|---|---|
| `repair` | 없음 | `Administrator` | 저장소 채널의 commit 메시지를 다시 스캔해 manifest commit index를 재구성합니다. | corrupt commit 메시지는 건너뛰고 `[DGIT:VERIFY:<time>]` 메시지로 기록합니다. |
| `export` | `commit` 선택 | 없음 | snapshot을 `dgit-export-<shortHash>.json.gz`로 내보냅니다. | 기본값은 HEAD입니다. |
| `archive-info` | `commit` 선택 | `Administrator` | 커밋의 message archive 메타데이터를 표시합니다. | archive가 없으면 없다고 표시합니다. |
| `export-message-archive` | `commit` 선택 | `Administrator` | message archive를 `dgit-message-archive-<shortHash>.json.gz`로 내보냅니다. | 내보낸 파일에는 메시지 내용이 포함될 수 있습니다. |
| `history` | `target` 필수, `id` 선택 | 없음 | 특정 guild/channel/role 변경 이력을 표시합니다. | `target`은 `guild`, `channel`, `role` 중 하나입니다. |
| `blame` | `target` 필수, `id` 선택 | 없음 | 필드별 마지막 변경 커밋을 표시합니다. | diff 파일을 읽을 수 없는 커밋은 건너뜁니다. |

### `/dgit-admin`

| 하위 명령 | Options | 필요 권한 | 동작 | 안전 참고 |
|---|---|---|---|---|
| `watch enable` | 없음 | `Administrator` | watch mode를 켭니다. | 변경 이벤트 후 autocommit이 꺼져 있으면 저장소 채널에 `[DGIT:WATCH]` 알림을 남깁니다. |
| `watch disable` | 없음 | `Administrator` | watch mode를 끕니다. | 설정만 변경합니다. |
| `autocommit enable` | 없음 | `Administrator` | autocommit을 켭니다. | 변경 이벤트 후 debounce 뒤 자동 커밋합니다. |
| `autocommit disable` | 없음 | `Administrator` | autocommit을 끕니다. | watch가 켜져 있으면 알림만 남길 수 있습니다. |
| `maintenance on` | 없음 | `Administrator` | text channel의 `@everyone` `SendMessages` deny 계획을 미리 보여줍니다. | 확인 후 적용됩니다. 위험 변경이 있으면 `APPLY` 입력 모달이 필요합니다. |
| `maintenance off` | 없음 | `Administrator` | 현재 브랜치 HEAD snapshot으로 복원하는 계획을 미리 보여줍니다. | 확인 후 적용됩니다. 위험 변경이 있으면 `APPLY` 입력 모달이 필요합니다. |
| `message-backup enable` | 없음 | `Administrator` | message backup 설정을 켭니다. | 이후 커밋에서 eligible message를 archive로 수집합니다. |
| `message-backup disable` | 없음 | `Administrator` | message backup 설정을 끕니다. | 기존 archive는 삭제하지 않습니다. |
| `message-backup status` | 없음 | `Administrator` | message backup 설정을 표시합니다. | 민감 정보 공유 주의 문구가 포함됩니다. |
| `message-backup restore-mode` | `mode` 필수 | `Administrator` | 기본 message restore mode를 설정합니다. | `none`은 기본 restore mode를 제거합니다. |
| `message-backup include-channel` | `channel` 필수 | `Administrator` | 백업 포함 채널 목록을 지정합니다. | 현재 구현은 전달된 채널 하나로 include 목록을 대체합니다. |
| `message-backup exclude-channel` | `channel` 필수 | `Administrator` | 백업 제외 채널 목록을 지정합니다. | 현재 구현은 전달된 채널 하나로 exclude 목록을 대체합니다. |
| `message-backup clear-channels` | 없음 | `Administrator` | include/exclude 채널 필터를 제거합니다. | enabled 상태와 restore mode는 유지됩니다. |

## 일반 Workflow

### 첫 설정

1. 비공개 텍스트 채널을 만듭니다.
2. 봇에 저장소 채널 권한을 부여합니다.
3. `/dgit init channel:#dgit-repository`를 실행합니다.
4. `/dgit status`로 상태를 확인합니다.
5. 변경이 있으면 `/dgit commit message:"..."`로 커밋합니다.

### 변경 확인

1. `/dgit status`를 실행합니다.
2. status 응답의 diff 버튼 또는 `/dgit diff`를 사용합니다.

### 브랜치 생성과 사용

1. `/dgit-branch create name:<branch>`
2. `/dgit-branch list`
3. 서버에 바로 적용하려면 `/dgit-branch apply branch:<branch>`를 사용합니다.
4. 적용과 현재 브랜치 전환을 함께 하려면 `/dgit-branch checkout branch:<branch>`를 사용합니다.

### 이전 상태 복원

1. `/dgit log`로 커밋을 찾습니다.
2. `/dgit restore commit:<hash-or-ref>`로 복원 계획을 확인합니다.
3. 위험 변경을 검토한 뒤 확인합니다.
4. 위험 변경이 있으면 모달에 `RESTORE`를 입력합니다.

### 태그 생성

1. `/dgit-tag create name:<tag> commit:<hash-or-ref>`
2. `/dgit-tag list`

### 저장소 메타데이터 복구

1. `/dgit verify`로 실패 지점을 확인합니다.
2. `/dgit-repo repair`를 실행합니다.
3. `/dgit verify`를 다시 실행합니다.

### Watch와 autocommit 활성화

1. `/dgit-admin watch enable`
2. `/dgit-admin autocommit enable`

`AutoCommitWatcher`는 channel create/update/delete, role create/update/delete, guild update 이벤트를 감지합니다. 기본 debounce는 5초입니다. autocommit이 켜져 있으면 `Auto-commit server changes <ISO time>` 메시지로 커밋합니다. autocommit이 꺼져 있고 watch가 켜져 있으면 저장소 채널에 `[DGIT:WATCH]` 알림을 남깁니다.

### Message backup 활성화

1. `/dgit-admin message-backup enable`
2. 필요하면 `/dgit-admin message-backup include-channel` 또는 `exclude-channel`을 설정합니다.
3. `/dgit-admin message-backup status`로 설정을 확인합니다.
4. 커밋 후 `/dgit-repo archive-info`로 archive 메타데이터를 확인합니다.
5. `/dgit-repo export-message-archive`로 archive를 내보냅니다.

## 안전 동작

Restore, branch apply, maintenance on/off는 먼저 apply plan을 보여줍니다. 위험 변경이 없는 경우 확인 버튼으로 적용할 수 있고, 위험 변경이 하나라도 있으면 추가 확인 모달이 뜹니다. `/dgit restore`는 `RESTORE`, branch apply와 maintenance apply는 `APPLY`를 입력해야 합니다.

`applyRestorePlan`을 사용하는 restore/apply/maintenance 경로는 적용 직전에 live server가 현재 HEAD와 다르면 safety backup commit을 만듭니다. 백업 커밋 메시지는 `Safety backup before <reason>` 형식입니다.

커밋과 merge는 commit object를 업로드하기 전 manifest sequence를 다시 확인하고, manifest 저장 시 expected sequence를 검사합니다. 다른 명령이 먼저 manifest를 바꾸면 `Repository changed while this command was running. Reload and retry.` 계열 오류가 발생할 수 있습니다.

`/dgit verify`는 manifest schema, manifest hash, branch head, commit/snapshot/diff 첨부 파일, message archive 첨부 파일을 확인합니다. `/dgit-repo repair`는 저장소 채널의 commit 메시지를 스캔하며, 손상된 commit 메시지는 건너뜁니다.

## Message Backup과 Archive

Message backup은 `/dgit-admin message-backup enable`로 켭니다. 이후 커밋 생성 시 구조 snapshot과 별도로 message archive 첨부 파일을 만들 수 있습니다. archive는 `DGitSnapshot`에 직접 포함되지 않고 별도 `message-archive-*.json.gz` 첨부 파일로 저장됩니다.

현재 collector는 `GuildText`, `GuildAnnouncement`, public/private thread, announcement thread에서 메시지를 가져올 수 있는 채널을 대상으로 합니다. 채널별 기본 최대 수집량은 100개 메시지입니다. 봇이 채널을 볼 수 있고 `Read Message History` 권한을 가져야 합니다. `ENABLE_MESSAGE_CONTENT_INTENT=true`와 Discord Developer Portal의 Message Content Intent 설정 여부에 따라 메시지 내용 수집 품질이 달라질 수 있습니다.

필터 동작:

| 설정 | 동작 |
|---|---|
| include channels | 설정되어 있으면 해당 채널만 수집합니다. |
| exclude channels | 해당 채널을 수집하지 않습니다. |
| ignore channels | ignore에 등록된 채널은 수집하지 않습니다. |
| ignore patterns | 채널 이름이 pattern과 맞으면 수집하지 않습니다. `*` wildcard를 지원합니다. |
| ignore types | `message` 또는 `messages`가 있으면 메시지를 수집하지 않습니다. 초기 manifest는 `messages`를 ignore합니다. |

Restore mode:

| mode | 현재 동작 |
|---|---|
| `structureOnly` | 서버 구조만 복원합니다. 대상 커밋에 message archive가 있으면 적용하지 않는다는 warning을 추가합니다. |
| `archiveOnly` | archive export step만 plan에 추가합니다. Discord 메시지를 보내거나 삭제하거나 수정하지 않습니다. |
| `renderAsAppMessages` | archive 메시지를 앱/봇 메시지 형태로 렌더링하는 apply step을 포함합니다. 적용 결과에 rendered/skipped/failed 수가 표시됩니다. |
| `none` | slash command 선택지는 아니며 기본 restore mode 설정에서만 사용합니다. 설정된 기본 restore mode를 제거합니다. |

`/dgit-repo export-message-archive`로 내보낸 파일에는 메시지 내용, 작성자 표시 이름, 첨부 파일 메타데이터 등이 포함될 수 있습니다. 승인된 운영자에게만 공유해야 합니다.

## 제한과 알려진 위험

- Discord API 권한, 봇 role 위치, managed role, rate limit 때문에 apply/restore step이 실패하거나 skip될 수 있습니다.
- Global command 등록은 전파에 시간이 걸릴 수 있습니다.
- 저장소 채널은 비공개로 유지해야 하며 수동 편집하면 manifest나 첨부 파일 검증이 깨질 수 있습니다.
- Restore, branch checkout, branch apply, maintenance는 실제 Discord 서버 구조를 변경할 수 있습니다.
- `/dgit-branch checkout`은 현재 코드에서 미리보기 확인 없이 바로 apply를 실행합니다.
- Message content backup은 Discord intents, 권한, 접근 불가 채널, 삭제된 메시지, 첨부 파일 크기, 구현상 채널당 100개 메시지 제한의 영향을 받습니다.
- Message archive의 실제 메시지 재생성 품질은 Discord API 제한과 `GuildStateApplier` 구현에 의존합니다.
- 이 봇은 일반 Git이 아니므로 Git CLI, remote, `.git` object database, 파일 단위 diff와 호환되지 않습니다.

## 개발 참고

테스트:

```bash
npm run build
npm run test
```

명령 등록:

```bash
npm run register:guild
npm run register:global
npm run commands:clear:guild
npm run commands:clear:global
```

소스에서 주요 진입점:

| 파일 | 역할 |
|---|---|
| `src/discord/commands/dgitCommand.ts` | Slash command 정의 |
| `src/discord/interactions/interactionRouter.ts` | 명령 라우팅, 런타임 권한 체크, 확인 모달 |
| `src/dgit/DGitService.ts` | 저장소, 커밋, diff, branch, merge, tag, archive 서비스 |
| `src/dgit/AutoCommitWatcher.ts` | watch/autocommit 이벤트 처리 |
| `src/config/env.ts` | 환경 변수 schema |
| `src/dgit/storage/DiscordRepositoryStorage.ts` | Discord 메시지/첨부 파일 기반 저장소 I/O |
