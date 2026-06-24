import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { hasManageGuildPermission } from "../discord/interactions/interactionRouter.js";
import { repositoryExposure } from "../dgit/storage/RepositoryLocator.js";

function permissions(bits: bigint[]) {
  return {
    has(permission: bigint) {
      return bits.includes(permission);
    }
  };
}

describe("authorization helpers", () => {
  it("allows Administrator for repository mutation", () => {
    expect(hasManageGuildPermission(permissions([PermissionFlagsBits.Administrator]))).toBe(true);
  });

  it("allows ManageGuild for repository mutation", () => {
    expect(hasManageGuildPermission(permissions([PermissionFlagsBits.ManageGuild]))).toBe(true);
  });

  it("rejects normal members for repository mutation", () => {
    expect(hasManageGuildPermission(permissions([]))).toBe(false);
  });

  it("handles missing permissions as not authorized", () => {
    expect(hasManageGuildPermission(null)).toBe(false);
    expect(hasManageGuildPermission(undefined)).toBe(false);
  });
});

describe("repositoryExposure", () => {
  it("reports @everyone repository access bits", () => {
    const channel = {
      guild: { roles: { everyone: { id: "guild1" } } },
      permissionsFor: () => permissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.AttachFiles])
    };

    expect(repositoryExposure(channel as never)).toEqual({
      everyoneCanView: true,
      everyoneCanSend: false,
      everyoneCanAttach: true
    });
  });

  it("treats missing channel permissions as private", () => {
    const channel = {
      guild: { roles: { everyone: { id: "guild1" } } },
      permissionsFor: () => null
    };

    expect(repositoryExposure(channel as never)).toEqual({
      everyoneCanView: false,
      everyoneCanSend: false,
      everyoneCanAttach: false
    });
  });
});
