import { ChannelType, SlashCommandBuilder } from "discord.js";
import { commandLocalizations } from "../../i18n/i18n.js";

function withDesc<T extends { setDescription(description: string): T; setDescriptionLocalizations(localizations: Record<string, string>): T }>(
  builder: T,
  ko: string,
  en: string,
  zh: string
): T {
  const value = commandLocalizations(ko, en, zh);
  return builder.setDescription(value.description).setDescriptionLocalizations(value.localizations);
}

export const dgitCommand = withDesc(
  new SlashCommandBuilder().setName("dgit"),
  "Discord 서버 설정을 Git처럼 버전 관리합니다",
  "Discord-native Git-inspired guild version control",
  "Discord 原生的 Git 风格服务器版本控制"
)
  .addSubcommand((sub) =>
    withDesc(sub.setName("init"), "저장소 채널을 초기화합니다", "Initialize a repository channel", "初始化仓库频道")
      .addChannelOption((opt) =>
        withDesc(opt.setName("channel"), "비공개 저장소 채널", "Private repository channel", "私有仓库频道")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) => withDesc(sub.setName("status"), "현재 서버 상태와 HEAD를 비교합니다", "Compare live guild state with HEAD", "比较当前服务器状态与 HEAD"))
  .addSubcommand((sub) =>
    withDesc(sub.setName("commit"), "현재 서버 상태를 커밋합니다", "Commit current guild state", "提交当前服务器状态")
      .addStringOption((opt) => withDesc(opt.setName("message"), "커밋 메시지", "Commit message", "提交信息").setRequired(true).setMaxLength(256))
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("log"), "커밋 기록을 표시합니다", "Show commit history", "显示提交历史")
      .addStringOption((opt) => withDesc(opt.setName("branch"), "브랜치 이름", "Branch name", "分支名称"))
      .addIntegerOption((opt) => withDesc(opt.setName("limit"), "최대 커밋 수", "Max commits", "最大提交数").setMinValue(1).setMaxValue(25))
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("diff"), "상세 diff를 표시합니다", "Show detailed diff", "显示详细 diff")
      .addStringOption((opt) => withDesc(opt.setName("from"), "커밋, 브랜치 또는 태그", "Commit, branch, or tag", "提交、分支或标签"))
      .addStringOption((opt) => withDesc(opt.setName("to"), "커밋, 브랜치 또는 태그", "Commit, branch, or tag", "提交、分支或标签"))
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("restore"), "커밋 스냅샷 복원을 미리봅니다", "Preview restoring a commit snapshot", "预览恢复提交快照")
      .addStringOption((opt) => withDesc(opt.setName("commit"), "커밋 해시, 브랜치 또는 태그", "Commit hash, branch, or tag", "提交哈希、分支或标签").setRequired(true))
  )
  .addSubcommand((sub) => withDesc(sub.setName("verify"), "저장소 무결성을 검사합니다", "Verify repository integrity", "验证仓库完整性"))
  .addSubcommand((sub) => withDesc(sub.setName("check-permission"), "봇 권한을 점검합니다", "Check bot permissions", "检查机器人权限"));

export const dgitBranchCommand = withDesc(
  new SlashCommandBuilder().setName("dgit-branch"),
  "DGit 브랜치를 관리합니다",
  "Manage DGit branches",
  "管理 DGit 分支"
)
  .addSubcommand((sub) =>
    withDesc(sub.setName("create"), "브랜치를 생성합니다", "Create a branch", "创建分支")
      .addStringOption((opt) => withDesc(opt.setName("name"), "브랜치 이름", "Branch name", "分支名称").setRequired(true))
      .addStringOption((opt) => withDesc(opt.setName("from"), "선택 커밋 또는 ref", "Optional commit/ref", "可选提交/ref"))
  )
  .addSubcommand((sub) => withDesc(sub.setName("list"), "브랜치 목록을 표시합니다", "List branches", "列出分支"))
  .addSubcommand((sub) =>
    withDesc(sub.setName("checkout"), "브랜치 HEAD를 서버에 적용하고 현재 브랜치를 변경합니다", "Apply branch HEAD and change current branch", "应用分支 HEAD 并切换当前分支")
      .addStringOption((opt) => withDesc(opt.setName("branch"), "브랜치 이름", "Branch name", "分支名称").setRequired(true))
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("apply"), "브랜치 HEAD 적용을 미리봅니다", "Preview applying branch HEAD", "预览应用分支 HEAD")
      .addStringOption((opt) => withDesc(opt.setName("branch"), "브랜치 이름", "Branch name", "分支名称").setRequired(true))
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("delete"), "브랜치를 삭제합니다", "Delete a branch", "删除分支")
      .addStringOption((opt) => withDesc(opt.setName("branch"), "브랜치 이름", "Branch name", "分支名称").setRequired(true))
  );

export const dgitIgnoreCommand = withDesc(
  new SlashCommandBuilder().setName("dgit-ignore"),
  "DGit ignore 규칙을 관리합니다",
  "Manage DGit ignore rules",
  "管理 DGit ignore 规则"
)
  .addSubcommand((sub) =>
    withDesc(sub.setName("add"), "ignore 규칙을 추가합니다", "Add ignore rule", "添加 ignore 规则")
      .addStringOption((opt) =>
        withDesc(opt.setName("type"), "규칙 타입", "Rule type", "规则类型")
          .setRequired(true)
          .addChoices(
            { name: "channel", value: "channel" },
            { name: "role", value: "role" },
            { name: "objectType", value: "objectType" },
            { name: "pattern", value: "pattern" }
          )
      )
      .addStringOption((opt) => withDesc(opt.setName("value"), "규칙 값", "Rule value", "规则值").setRequired(true))
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("remove"), "ignore 규칙을 제거합니다", "Remove ignore rule", "移除 ignore 规则")
      .addStringOption((opt) =>
        withDesc(opt.setName("type"), "규칙 타입", "Rule type", "规则类型")
          .setRequired(true)
          .addChoices(
            { name: "channel", value: "channel" },
            { name: "role", value: "role" },
            { name: "objectType", value: "objectType" },
            { name: "pattern", value: "pattern" }
          )
      )
      .addStringOption((opt) => withDesc(opt.setName("value"), "규칙 값", "Rule value", "规则值").setRequired(true))
  )
  .addSubcommand((sub) => withDesc(sub.setName("list"), "ignore 규칙 목록을 표시합니다", "List ignore rules", "列出 ignore 规则"));

export const dgitMergeCommand = withDesc(
  new SlashCommandBuilder().setName("dgit-merge"),
  "DGit 브랜치를 병합합니다",
  "Merge DGit branches",
  "合并 DGit 分支"
)
  .addSubcommand((sub) =>
    withDesc(sub.setName("run"), "브랜치를 병합합니다", "Merge branches", "合并分支")
      .addStringOption((opt) => withDesc(opt.setName("from"), "소스 브랜치", "Source branch", "源分支").setRequired(true))
      .addStringOption((opt) => withDesc(opt.setName("to"), "대상 브랜치", "Target branch", "目标分支").setRequired(true))
  );

export const dgitTagCommand = withDesc(
  new SlashCommandBuilder().setName("dgit-tag"),
  "DGit 태그를 관리합니다",
  "Manage DGit tags",
  "管理 DGit 标签"
)
  .addSubcommand((sub) =>
    withDesc(sub.setName("create"), "태그를 생성합니다", "Create a tag", "创建标签")
      .addStringOption((opt) => withDesc(opt.setName("name"), "태그 이름", "Tag name", "标签名称").setRequired(true))
      .addStringOption((opt) => withDesc(opt.setName("commit"), "선택 커밋/ref", "Optional commit/ref", "可选提交/ref"))
  )
  .addSubcommand((sub) => withDesc(sub.setName("list"), "태그 목록을 표시합니다", "List tags", "列出标签"))
  .addSubcommand((sub) =>
    withDesc(sub.setName("delete"), "태그를 삭제합니다", "Delete a tag", "删除标签")
      .addStringOption((opt) => withDesc(opt.setName("name"), "태그 이름", "Tag name", "标签名称").setRequired(true))
  );

export const dgitRepoCommand = withDesc(
  new SlashCommandBuilder().setName("dgit-repo"),
  "DGit 저장소 기능",
  "DGit repository tools",
  "DGit 仓库工具"
)
  .addSubcommand((sub) =>
    withDesc(sub.setName("repair"), "저장소 매니페스트를 복구합니다", "Repair repository manifest", "修复仓库 manifest")
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("export"), "스냅샷을 내보냅니다", "Export a snapshot", "导出快照")
      .addStringOption((opt) => withDesc(opt.setName("commit"), "선택 커밋/ref", "Optional commit/ref", "可选提交/ref"))
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("history"), "객체 변경 이력을 표시합니다", "Show object history", "显示对象历史")
      .addStringOption((opt) => withDesc(opt.setName("target"), "대상 타입", "Target type", "目标类型").setRequired(true).addChoices(
        { name: "channel", value: "channel" },
        { name: "role", value: "role" },
        { name: "guild", value: "guild" }
      ))
      .addStringOption((opt) => withDesc(opt.setName("id"), "선택 ID", "Optional ID", "可选 ID"))
  )
  .addSubcommand((sub) =>
    withDesc(sub.setName("blame"), "필드별 마지막 변경 커밋을 표시합니다", "Show latest commit per field", "显示每个字段的最新提交")
      .addStringOption((opt) => withDesc(opt.setName("target"), "대상 타입", "Target type", "目标类型").setRequired(true).addChoices(
        { name: "channel", value: "channel" },
        { name: "role", value: "role" },
        { name: "guild", value: "guild" }
      ))
      .addStringOption((opt) => withDesc(opt.setName("id"), "선택 ID", "Optional ID", "可选 ID"))
  );

export const dgitAdminCommand = withDesc(
  new SlashCommandBuilder().setName("dgit-admin"),
  "DGit 관리자 기능",
  "DGit admin tools",
  "DGit 管理工具"
)
  .addSubcommandGroup((group) =>
    withDesc(group.setName("watch"), "변경 감시 설정", "Watch settings", "监听设置")
      .addSubcommand((sub) => withDesc(sub.setName("enable"), "watch를 켭니다", "Enable watch", "启用监听"))
      .addSubcommand((sub) => withDesc(sub.setName("disable"), "watch를 끕니다", "Disable watch", "禁用监听"))
  )
  .addSubcommandGroup((group) =>
    withDesc(group.setName("autocommit"), "자동 커밋 설정", "Autocommit settings", "自动提交设置")
      .addSubcommand((sub) => withDesc(sub.setName("enable"), "autocommit을 켭니다", "Enable autocommit", "启用自动提交"))
      .addSubcommand((sub) => withDesc(sub.setName("disable"), "autocommit을 끕니다", "Disable autocommit", "禁用自动提交"))
  )
  .addSubcommandGroup((group) =>
    withDesc(group.setName("maintenance"), "점검 모드", "Maintenance mode", "维护模式")
      .addSubcommand((sub) => withDesc(sub.setName("on"), "점검 모드 적용을 미리봅니다", "Preview maintenance mode", "预览维护模式"))
      .addSubcommand((sub) => withDesc(sub.setName("off"), "점검 모드를 끕니다", "Disable maintenance mode", "禁用维护模式"))
  );

export const commands = [dgitCommand, dgitBranchCommand, dgitIgnoreCommand, dgitMergeCommand, dgitTagCommand, dgitRepoCommand, dgitAdminCommand].map((command) => command.toJSON());
