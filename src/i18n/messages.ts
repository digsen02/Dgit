export type SupportedLocale = "ko" | "en" | "zh";

export type MessageKey =
  | "guildOnly"
  | "error"
  | "restoreCancelled"
  | "restoreExpired"
  | "restoreWrongGuild"
  | "restoreForbidden"
  | "restoreFinished"
  | "repositoryMustBeText"
  | "initialized"
  | "warnings"
  | "statusTitle"
  | "branch"
  | "head"
  | "workingTree"
  | "clean"
  | "dirty"
  | "changes"
  | "viewDiff"
  | "commit"
  | "commitMessage"
  | "refresh"
  | "createdCommit"
  | "commitModalTitle"
  | "noCommits"
  | "diffTitle"
  | "restoreDryRunTitle"
  | "noChanges"
  | "dangerousChanges"
  | "steps"
  | "confirmRestore"
  | "cancel"
  | "createdBranch"
  | "deletedBranch"
  | "cannotDeleteDefaultBranch"
  | "cannotDeleteCurrentBranch"
  | "currentBranchChanged"
  | "liveServerNotModified"
  | "channels"
  | "roles"
  | "types"
  | "patterns"
  | "none"
  | "added"
  | "removed"
  | "ignoreRule"
  | "adminRequired"
  | "manageGuildRequired"
  | "inactiveConfirmation"
  | "emptyCommitMessage"
  | "workingTreeClean"
  | "commitHashCollision"
  | "unknownBranch"
  | "invalidBranchName"
  | "branchAlreadyExists"
  | "branchHasNoHead"
  | "unknownCommitOrRef"
  | "noCommitToExport"
  | "checkoutPartial"
  | "checkoutSuccess"
  | "branchApplyPreview"
  | "mergeConflicts"
  | "mergeSucceeded"
  | "createdTag"
  | "deletedTag"
  | "repairComplete"
  | "exportedFile"
  | "watchEnabled"
  | "watchDisabled"
  | "autocommitEnabled"
  | "autocommitDisabled"
  | "maintenancePreview"
  | "permissionBotMemberUnavailable"
  | "permissionViewChannel"
  | "permissionSendMessages"
  | "permissionReadMessageHistory"
  | "permissionAttachFiles"
  | "repositoryBotMemberUnavailable"
  | "repositoryChannelPermissionsRequired"
  | "repositoryChannelPubliclyAccessible"
  | "repositoryChangedRetry"
  | "repositoryDiscoveryWarning"
  | "permissionManageMessages"
  | "permissionManageChannels"
  | "permissionManageRoles"
  | "permissionManageGuild"
  | "permissionViewAuditLog"
  | "permissionRepositoryVisible"
  | "permissionRepositorySendMessages"
  | "permissionRepositoryReadHistory"
  | "permissionRepositoryAttachFiles"
  | "permissionRepositoryManageMessages"
  | "permissionRepositoryEveryoneView"
  | "permissionRepositoryEveryoneSend"
  | "permissionRepositoryEveryoneAttach"
  | "permissionBotRoleManaged"
  | "permissionBotRoleMovable"
  | "verifyRepositoryLocated"
  | "verifyManifestLoaded"
  | "verifyManifestHashVerified"
  | "verifyManifestLegacyUnverified"
  | "verifyBranchHeadExists"
  | "verifyBranchMissingHead"
  | "verifyBranchNoCommits"
  | "verifyCommitAttachmentsVerified"
  | "verifyCommitFailed"
  | "verifyCommitMissingParent"
  | "unknownTag"
  | "tagAlreadyExists"
  | "invalidTagName"
  | "noCommitAvailableToTag"
  | "unknownTagName"
  | "unknownCommit"
  | "mergeBaseNotFound"
  | "mergeProducedNothing"
  | "repositoryNotFound"
  | "failedDownloadAttachment";

export const messages: Record<SupportedLocale, Record<MessageKey, string>> = {
  ko: {
    guildOnly: "DGit 명령은 서버 안에서만 사용할 수 있습니다.",
    error: "DGit 오류: {message}",
    restoreCancelled: "복원이 취소되었습니다.",
    restoreExpired: "복원 확인 시간이 만료되었습니다. `/dgit restore`를 다시 실행하세요.",
    restoreWrongGuild: "이 복원 확인은 다른 서버용입니다.",
    restoreForbidden: "요청자 또는 관리자만 이 복원을 확인할 수 있습니다.",
    restoreFinished: "복원 적용 완료. 성공: {success}. 건너뜀: {skipped}. 실패: {failed}.{details}",
    repositoryMustBeText: "저장소는 텍스트 채널이어야 합니다.",
    initialized: "{channel}에 DGit을 초기화했습니다. 초기 커밋: {hash}.{warnings}",
    warnings: "\n경고:\n{warnings}",
    statusTitle: "DGit 상태",
    branch: "브랜치",
    head: "HEAD",
    workingTree: "작업 트리",
    clean: "깨끗함",
    dirty: "변경 있음",
    changes: "변경",
    viewDiff: "Diff 보기",
    commit: "커밋",
    commitMessage: "커밋 메시지",
    refresh: "새로고침",
    createdCommit: "{branch}에 커밋 {hash}를 생성했습니다: {summary}",
    commitModalTitle: "DGit 커밋 생성",
    noCommits: "커밋이 없습니다.",
    diffTitle: "DGit Diff",
    restoreDryRunTitle: "DGit 복원 미리보기",
    noChanges: "변경 사항이 없습니다.",
    dangerousChanges: "위험한 변경",
    steps: "단계",
    confirmRestore: "복원 확인",
    cancel: "취소",
    createdBranch: "{name} 브랜치를 {hash}에서 생성했습니다.",
    deletedBranch: "{name} 브랜치를 삭제했습니다.",
    cannotDeleteDefaultBranch: "기본 브랜치 {name}은(는) 삭제할 수 없습니다.",
    cannotDeleteCurrentBranch: "현재 브랜치 {name}은(는) 삭제할 수 없습니다. 다른 브랜치로 체크아웃한 뒤 다시 시도하세요.",
    currentBranchChanged: "현재 브랜치를 {branch}(으)로 변경했습니다. {note}",
    liveServerNotModified: "실제 서버는 수정하지 않았습니다.",
    channels: "채널",
    roles: "역할",
    types: "타입",
    patterns: "패턴",
    none: "없음",
    added: "추가됨",
    removed: "삭제됨",
    ignoreRule: "ignore 규칙 {type}:{value}",
    adminRequired: "이 작업에는 관리자 권한이 필요합니다.",
    manageGuildRequired: "이 작업에는 서버 관리 또는 관리자 권한이 필요합니다.",
    inactiveConfirmation: "이 확인 토큰은 더 이상 활성 상태가 아닙니다. 새 dry-run 미리보기를 생성하려면 명령을 다시 실행하세요.",
    emptyCommitMessage: "커밋 메시지는 비어 있을 수 없습니다.",
    workingTreeClean: "작업 트리가 깨끗합니다. 커밋이 생성되지 않았습니다.",
    commitHashCollision: "커밋 해시 충돌이 감지되었습니다. 다시 시도하세요.",
    unknownBranch: "알 수 없는 브랜치입니다: {branch}",
    invalidBranchName: "브랜치 이름은 1-64자여야 하며 문자, 숫자, 점, 밑줄, 슬래시 또는 대시만 포함할 수 있습니다.",
    branchAlreadyExists: "브랜치 {name}이(가) 이미 존재합니다.",
    branchHasNoHead: "브랜치 {name}에 HEAD 커밋이 없습니다.",
    unknownCommitOrRef: "알 수 없는 커밋 또는 참조: {ref}",
    noCommitToExport: "내보낼 커밋이 없습니다.",
    checkoutPartial: "{branch} 브랜치로 이동했습니다. 다만 서버 적용은 부분적으로만 완료되어 working tree가 dirty일 수 있습니다. 현재 브랜치: {currentBranch}. 계획: {steps}. 성공: {success}. 건너뜀: {skipped}. 실패: {failed}.",
    checkoutSuccess: "{branch}을(를) 체크아웃했습니다. 적용: {success}/{steps}. 현재 브랜치는 {currentBranch}입니다.",
    branchApplyPreview: "브랜치 적용 미리보기: {branch}\n위험: {dangerous}\n\n{lines}",
    mergeConflicts: "병합에 {count}개의 충돌이 있습니다. 충돌 파일이 저장소에 저장되었습니다: {mergeId}.\n{details}",
    mergeSucceeded: "{source}을(를) {target}(으)로 병합했습니다: {hash} {summary}",
    createdTag: "태그 {name}을(를) 생성했습니다 -> {hash}",
    deletedTag: "태그 {name}을(를) 삭제했습니다.",
    repairComplete: "복구 완료. 스캔: {scanned}. 커밋 인덱스: {commits}. 매니페스트 시퀀스: {sequence}.",
    exportedFile: "{filename}을(를) 내보냈습니다.",
    watchEnabled: "Watch가 활성화되었습니다.",
    watchDisabled: "Watch가 비활성화되었습니다.",
    autocommitEnabled: "Autocommit이 활성화되었습니다.",
    autocommitDisabled: "Autocommit이 비활성화되었습니다.",
    maintenancePreview: "점검 미리보기. 단계: {steps}. 위험: {dangerous}.\n{lines}",
    permissionBotMemberUnavailable: "봇 멤버 정보를 가져올 수 없습니다: 실패했습니다.",
    permissionViewChannel: "채널 보기",
    permissionSendMessages: "메시지 전송",
    permissionReadMessageHistory: "메시지 기록 읽기",
    permissionAttachFiles: "파일 첨부",
    repositoryBotMemberUnavailable: "봇 길드 멤버 정보를 사용할 수 없습니다.",
    repositoryChannelPermissionsRequired: "저장소 채널에 필요한 봇 권한이 없습니다: 채널 보기, 메시지 전송, 메시지 기록 읽기, 파일 첨부, 메시지 관리.",
    repositoryChannelPubliclyAccessible: "저장소 채널은 @everyone에게 보이거나 쓰기 가능하면 안 됩니다. 채널 보기, 메시지 전송, 파일 첨부 권한을 비공개로 설정하세요.",
    repositoryChangedRetry: "저장소가 다른 명령으로 변경되었습니다. 최신 상태에서 다시 시도하세요.",
    repositoryDiscoveryWarning: "Manage Channels 권한이 없으므로 채널 이름과 고정된 매니페스트에 따라 저장소를 검색합니다.",
    permissionManageMessages: "메시지 관리",
    permissionManageChannels: "채널 관리",
    permissionManageRoles: "역할 관리",
    permissionManageGuild: "길드 관리",
    permissionViewAuditLog: "감사 로그 보기",
    permissionRepositoryVisible: "저장소 채널 표시 가능",
    permissionRepositorySendMessages: "저장소 채널 메시지 전송",
    permissionRepositoryReadHistory: "저장소 채널 메시지 기록 읽기",
    permissionRepositoryAttachFiles: "저장소 채널 파일 첨부",
    permissionRepositoryManageMessages: "저장소 채널 메시지 관리",
    permissionRepositoryEveryoneView: "@everyone 저장소 채널 보기 차단",
    permissionRepositoryEveryoneSend: "@everyone 저장소 채널 메시지 전송 차단",
    permissionRepositoryEveryoneAttach: "@everyone 저장소 채널 파일 첨부 차단",
    permissionBotRoleManaged: "봇 최고 역할이 관리되는 중입니다",
    permissionBotRoleMovable: "봇 최고 역할을 이동/관리할 수 있습니다",
    verifyRepositoryLocated: "[x] 저장소 채널 찾음",
    verifyManifestLoaded: "[x] 매니페스트 로드 및 스키마 유효성 검사 완료",
    verifyManifestHashVerified: "[x] 현재 매니페스트 hash 검증 완료",
    verifyManifestLegacyUnverified: "[ ] 현재 매니페스트에 sha256 라인이 없어 legacy/unverified 상태입니다",
    verifyBranchHeadExists: "[x] 브랜치 {branch}의 HEAD가 존재합니다",
    verifyBranchMissingHead: "[ ] 브랜치 {branch}의 HEAD가 없습니다",
    verifyBranchNoCommits: "[x] 브랜치 {branch}에 커밋이 없습니다",
    verifyCommitAttachmentsVerified: "[x] 커밋 {hash} 첨부파일 확인 완료",
    verifyCommitFailed: "[ ] 커밋 {hash} 실패: {message}",
    verifyCommitMissingParent: "[ ] 커밋 {hash}에 부모 {parent}가 없습니다",
    unknownTag: "알 수 없는 태그입니다: {name}",
    tagAlreadyExists: "태그 {name}이(가) 이미 존재합니다.",
    invalidTagName: "태그 이름은 1-64자여야 하며 문자, 숫자, 점, 밑줄, 슬래시 또는 대시만 포함할 수 있습니다.",
    noCommitAvailableToTag: "태그를 지정할 커밋이 없습니다.",
    unknownTagName: "알 수 없는 태그입니다: {name}",
    unknownCommit: "알 수 없는 커밋입니다: {ref}",
    mergeBaseNotFound: "{source}과(와) {target} 간의 병합 기반을 찾을 수 없습니다.",
    mergeProducedNothing: "병합에서 스냅샷이나 충돌이 생성되지 않았습니다.",
    repositoryNotFound: "DGit 저장소를 찾을 수 없습니다. `/dgit init channel:#channel`을 실행하세요.",
    failedDownloadAttachment: "첨부 파일을 다운로드하지 못했습니다: {status}"
  },
  en: {
    guildOnly: "DGit commands must be used in a guild.",
    error: "DGit error: {message}",
    restoreCancelled: "Restore cancelled.",
    restoreExpired: "Restore confirmation expired. Run `/dgit restore` again.",
    restoreWrongGuild: "Restore confirmation is for a different guild.",
    restoreForbidden: "Only the requester or an administrator can confirm this restore.",
    restoreFinished: "Restore apply finished. Success: {success}. Skipped: {skipped}. Failed: {failed}.{details}",
    repositoryMustBeText: "Repository must be a text channel.",
    initialized: "Initialized DGit in {channel} at {hash}.{warnings}",
    warnings: "\nWarnings:\n{warnings}",
    statusTitle: "DGit Status",
    branch: "Branch",
    head: "HEAD",
    workingTree: "Working tree",
    clean: "clean",
    dirty: "dirty",
    changes: "Changes",
    viewDiff: "View Diff",
    commit: "Commit",
    commitMessage: "Commit message",
    refresh: "Refresh",
    createdCommit: "Created commit {hash} on {branch}: {summary}",
    commitModalTitle: "Create DGit Commit",
    noCommits: "No commits.",
    diffTitle: "DGit Diff",
    restoreDryRunTitle: "DGit Restore Dry Run",
    noChanges: "No changes.",
    dangerousChanges: "Dangerous changes",
    steps: "Steps",
    confirmRestore: "Confirm Restore",
    cancel: "Cancel",
    createdBranch: "Created branch {name} at {hash}.",
    deletedBranch: "Deleted branch {name}.",
    cannotDeleteDefaultBranch: "Cannot delete the default branch {name}.",
    cannotDeleteCurrentBranch: "Cannot delete the current branch {name}. Check out another branch first.",
    currentBranchChanged: "Current branch changed to {branch}. {note}",
    liveServerNotModified: "Live server was not modified.",
    channels: "Channels",
    roles: "Roles",
    types: "Types",
    patterns: "Patterns",
    none: "none",
    added: "Added",
    removed: "Removed",
    ignoreRule: "ignore rule {type}:{value}",
    adminRequired: "Administrator permission is required for this operation.",
    manageGuildRequired: "Manage Server or Administrator permission is required for this operation.",
    inactiveConfirmation: "This confirmation token is no longer active. Run the command again to generate a fresh dry-run preview.",
    emptyCommitMessage: "Commit message cannot be empty.",
    workingTreeClean: "Working tree clean. No commit created.",
    commitHashCollision: "Commit hash collision detected; retry the commit.",
    unknownBranch: "Unknown branch {branch}.",
    invalidBranchName: "Branch name must be 1-64 characters and contain only letters, numbers, dot, underscore, slash, or dash.",
    branchAlreadyExists: "Branch {name} already exists.",
    branchHasNoHead: "Branch {name} has no HEAD commit.",
    unknownCommitOrRef: "Unknown commit or ref: {ref}.",
    noCommitToExport: "No commit available to export.",
    checkoutPartial: "Checked out {branch}. Server apply completed partially, so the working tree may be dirty. Current branch: {currentBranch}. Planned: {steps}. Success: {success}. Skipped: {skipped}. Failed: {failed}.",
    checkoutSuccess: "Checked out {branch}. Applied: {success}/{steps}. Current branch is now {currentBranch}.",
    branchApplyPreview: "Branch apply preview: {branch}\nDangerous: {dangerous}\n\n{lines}",
    mergeConflicts: "Merge has {count} conflict(s). Conflict file stored in repository as {mergeId}.\n{details}",
    mergeSucceeded: "Merged {source} into {target}: {hash} {summary}",
    createdTag: "Created tag {name} -> {hash}",
    deletedTag: "Deleted tag {name}.",
    repairComplete: "Repair complete. Scanned: {scanned}. Commits indexed: {commits}. Manifest sequence: {sequence}.",
    exportedFile: "Exported {filename}.",
    watchEnabled: "Watch enabled.",
    watchDisabled: "Watch disabled.",
    autocommitEnabled: "Autocommit enabled.",
    autocommitDisabled: "Autocommit disabled.",
    maintenancePreview: "Maintenance preview. Steps: {steps}. Dangerous: {dangerous}.\n{lines}",
    permissionBotMemberUnavailable: "Bot member unavailable: failed.",
    permissionViewChannel: "View Channel",
    permissionSendMessages: "Send Messages",
    permissionReadMessageHistory: "Read Message History",
    permissionAttachFiles: "Attach Files",
    repositoryBotMemberUnavailable: "Bot guild member is not available.",
    repositoryChannelPermissionsRequired: "Repository channel is missing required bot permissions: View Channel, Send Messages, Read Message History, Attach Files, Manage Messages.",
    repositoryChannelPubliclyAccessible: "Repository channel must not be visible or writable by @everyone. Disable View Channel, Send Messages, and Attach Files for @everyone.",
    repositoryChangedRetry: "Repository changed while this command was running. Reload and retry.",
    repositoryDiscoveryWarning: "Missing Manage Channels; repository discovery will rely on channel name and pinned manifest.",
    permissionManageMessages: "Manage Messages",
    permissionManageChannels: "Manage Channels",
    permissionManageRoles: "Manage Roles",
    permissionManageGuild: "Manage Guild",
    permissionViewAuditLog: "View Audit Log",
    permissionRepositoryVisible: "Repository channel visible",
    permissionRepositorySendMessages: "Repository channel send messages",
    permissionRepositoryReadHistory: "Repository channel read history",
    permissionRepositoryAttachFiles: "Repository channel attach files",
    permissionRepositoryManageMessages: "Repository channel manage messages",
    permissionRepositoryEveryoneView: "@everyone cannot view repository channel",
    permissionRepositoryEveryoneSend: "@everyone cannot send repository messages",
    permissionRepositoryEveryoneAttach: "@everyone cannot attach repository files",
    permissionBotRoleManaged: "Bot highest role is managed",
    permissionBotRoleMovable: "Bot highest role is movable/manageable",
    verifyRepositoryLocated: "[x] Repository channel located",
    verifyManifestLoaded: "[x] Manifest loaded and schema-valid",
    verifyManifestHashVerified: "[x] Current manifest hash verified",
    verifyManifestLegacyUnverified: "[ ] Current manifest is legacy/unverified because the sha256 line is missing",
    verifyBranchHeadExists: "[x] Branch {branch} head exists",
    verifyBranchMissingHead: "[ ] Branch {branch} missing head",
    verifyBranchNoCommits: "[x] Branch {branch} has no commits",
    verifyCommitAttachmentsVerified: "[x] Commit {hash} attachments verified",
    verifyCommitFailed: "[ ] Commit {hash} failed: {message}",
    verifyCommitMissingParent: "[ ] Commit {hash} missing parent {parent}",
    unknownTag: "Unknown tag {name}",
    tagAlreadyExists: "Tag {name} already exists.",
    invalidTagName: "Tag name must be 1-64 characters and contain only letters, numbers, dot, underscore, slash, or dash.",
    noCommitAvailableToTag: "No commit available to tag.",
    unknownTagName: "Unknown tag {name}",
    unknownCommit: "Unknown commit {ref}",
    mergeBaseNotFound: "No merge base found for {source} and {target}.",
    mergeProducedNothing: "Merge produced neither snapshot nor conflicts.",
    repositoryNotFound: "DGit repository not found. Run /dgit init channel:#channel.",
    failedDownloadAttachment: "Failed to download attachment: {status}"
  },
  zh: {
    guildOnly: "DGit 命令只能在服务器中使用。",
    error: "DGit 错误：{message}",
    restoreCancelled: "恢复已取消。",
    restoreExpired: "恢复确认已过期。请重新运行 `/dgit restore`。",
    restoreWrongGuild: "此恢复确认属于另一个服务器。",
    restoreForbidden: "只有请求者或管理员可以确认此恢复。",
    restoreFinished: "恢复应用完成。成功：{success}。跳过：{skipped}。失败：{failed}。{details}",
    repositoryMustBeText: "仓库必须是文本频道。",
    initialized: "已在 {channel} 初始化 DGit，初始提交：{hash}。{warnings}",
    warnings: "\n警告：\n{warnings}",
    statusTitle: "DGit 状态",
    branch: "分支",
    head: "HEAD",
    workingTree: "工作区",
    clean: "干净",
    dirty: "有变更",
    changes: "变更",
    viewDiff: "查看 Diff",
    commit: "提交",
    commitMessage: "提交信息",
    refresh: "刷新",
    createdCommit: "已在 {branch} 创建提交 {hash}：{summary}",
    commitModalTitle: "创建 DGit 提交",
    noCommits: "没有提交。",
    diffTitle: "DGit Diff",
    restoreDryRunTitle: "DGit 恢复预览",
    noChanges: "没有变更。",
    dangerousChanges: "危险变更",
    steps: "步骤",
    confirmRestore: "确认恢复",
    cancel: "取消",
    createdBranch: "已创建分支 {name}，基于 {hash}。",
    deletedBranch: "已删除分支 {name}。",
    cannotDeleteDefaultBranch: "不能删除默认分支 {name}。",
    cannotDeleteCurrentBranch: "不能删除当前分支 {name}。请先检出其他分支。",
    currentBranchChanged: "当前分支已切换到 {branch}。{note}",
    liveServerNotModified: "实际服务器未被修改。",
    channels: "频道",
    roles: "角色",
    types: "类型",
    patterns: "模式",
    none: "无",
    added: "已添加",
    removed: "已移除",
    ignoreRule: "ignore 规则 {type}:{value}",
    adminRequired: "此操作需要管理员权限。",
    manageGuildRequired: "此操作需要管理服务器或管理员权限。",
    inactiveConfirmation: "此确认令牌不再有效。请重新运行命令生成新的 dry-run 预览。",
    emptyCommitMessage: "提交信息不能为空。",
    workingTreeClean: "工作区已清理。未创建提交。",
    commitHashCollision: "检测到提交哈希冲突；请重试提交。",
    unknownBranch: "未知分支：{branch}",
    invalidBranchName: "分支名称必须为 1-64 个字符，并且仅包含字母、数字、点、下划线、斜杠或破折号。",
    branchAlreadyExists: "分支 {name} 已存在。",
    branchHasNoHead: "分支 {name} 没有 HEAD 提交。",
    unknownCommitOrRef: "未知提交或引用：{ref}。",
    noCommitToExport: "没有可导出的提交。",
    checkoutPartial: "已检出 {branch}。服务器应用仅部分完成，working tree 可能为 dirty。当前分支：{currentBranch}。计划：{steps}。成功：{success}。跳过：{skipped}。失败：{failed}。",
    checkoutSuccess: "已检出 {branch}。已应用：{success}/{steps}。当前分支为 {currentBranch}。",
    branchApplyPreview: "分支应用预览：{branch}\n危险：{dangerous}\n\n{lines}",
    mergeConflicts: "合并有 {count} 个冲突。冲突文件已存储为 {mergeId}。\n{details}",
    mergeSucceeded: "已将 {source} 合并到 {target}：{hash} {summary}",
    createdTag: "已创建标签 {name} -> {hash}",
    deletedTag: "已删除标签 {name}。",
    repairComplete: "修复完成。扫描：{scanned}。索引提交：{commits}。Manifest 序列：{sequence}。",
    exportedFile: "已导出 {filename}。",
    watchEnabled: "已启用 Watch。",
    watchDisabled: "已禁用 Watch。",
    autocommitEnabled: "已启用 Autocommit。",
    autocommitDisabled: "已禁用 Autocommit。",
    maintenancePreview: "维护预览。步骤：{steps}。危险：{dangerous}。\n{lines}",
    permissionBotMemberUnavailable: "无法获取机器人成员信息：失败。",
    permissionViewChannel: "查看频道",
    permissionSendMessages: "发送消息",
    permissionReadMessageHistory: "读取消息历史",
    permissionAttachFiles: "附加文件",
    repositoryBotMemberUnavailable: "机器人公会成员不可用。",
    repositoryChannelPermissionsRequired: "仓库频道缺少所需的机器人权限：查看频道、发送消息、读取消息历史、附加文件、管理消息。",
    repositoryChannelPubliclyAccessible: "仓库频道不能被 @everyone 查看或写入。请为 @everyone 禁用查看频道、发送消息和附加文件。",
    repositoryChangedRetry: "仓库在命令运行期间已变更。请重新加载后重试。",
    repositoryDiscoveryWarning: "缺少管理频道权限；仓库发现将依赖频道名称和置顶的 manifest。",
    permissionManageMessages: "管理消息",
    permissionManageChannels: "管理频道",
    permissionManageRoles: "管理角色",
    permissionManageGuild: "管理服务器",
    permissionViewAuditLog: "查看审核日志",
    permissionRepositoryVisible: "仓库频道可见",
    permissionRepositorySendMessages: "仓库频道可发送消息",
    permissionRepositoryReadHistory: "仓库频道可读取历史",
    permissionRepositoryAttachFiles: "仓库频道可附加文件",
    permissionRepositoryManageMessages: "仓库频道可管理消息",
    permissionRepositoryEveryoneView: "@everyone 不能查看仓库频道",
    permissionRepositoryEveryoneSend: "@everyone 不能发送仓库消息",
    permissionRepositoryEveryoneAttach: "@everyone 不能附加仓库文件",
    permissionBotRoleManaged: "机器人最高角色受管理",
    permissionBotRoleMovable: "机器人最高角色可移动/管理",
    verifyRepositoryLocated: "[x] 找到仓库频道",
    verifyManifestLoaded: "[x] 已加载并验证 manifest 模式",
    verifyManifestHashVerified: "[x] 当前 manifest hash 已验证",
    verifyManifestLegacyUnverified: "[ ] 当前 manifest 缺少 sha256 行，处于 legacy/unverified 状态",
    verifyBranchHeadExists: "[x] 分支 {branch} 的 HEAD 存在",
    verifyBranchMissingHead: "[ ] 分支 {branch} 缺少 HEAD",
    verifyBranchNoCommits: "[x] 分支 {branch} 没有提交",
    verifyCommitAttachmentsVerified: "[x] 已验证提交 {hash} 的附件",
    verifyCommitFailed: "[ ] 提交 {hash} 失败：{message}",
    verifyCommitMissingParent: "[ ] 提交 {hash} 缺少父提交 {parent}",
    unknownTag: "未知标签：{name}",
    tagAlreadyExists: "标签 {name} 已存在。",
    invalidTagName: "标签名称必须为 1-64 个字符，并且仅包含字母、数字、点、下划线、斜杠或破折号。",
    noCommitAvailableToTag: "没有可用于标记的提交。",
    unknownTagName: "未知标签：{name}",
    unknownCommit: "未知提交：{ref}",
    mergeBaseNotFound: "无法找到 {source} 和 {target} 的合并基准。",
    mergeProducedNothing: "合并未生成快照或冲突。",
    repositoryNotFound: "找不到 DGit 仓库。运行 /dgit init channel:#channel。",
    failedDownloadAttachment: "下载附件失败：{status}"
  }
};
