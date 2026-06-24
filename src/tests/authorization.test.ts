import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { hasManageGuildPermission } from "../discord/interactions/interactionRouter.js";

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
});
