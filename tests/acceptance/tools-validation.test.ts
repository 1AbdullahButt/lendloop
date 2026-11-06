// User-requested addition to the ACs (see docs/DECISIONS.md "Tool fields are validated in Convex mutations").
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  ALICE,
  countRows,
  createTool,
  DEFAULT_TOOL,
  expectConvexError,
  getTool,
  newTest,
  signIn,
  useLendLoopEnv,
} from "./_helpers";

useLendLoopEnv();

describe("Tool validation: tools.create", () => {
  test("Tool validation: create trims name and description and stores owner, status and createdAt", async () => {
    const t = newTest();
    const { as: alice, id: aliceId } = await signIn(t, ALICE);
    const toolId = await createTool(alice, { name: "   Lawn mower  ", description: "  Electric, 40cm  " });
    const tool = await getTool(t, toolId);
    expect(tool).toMatchObject({
      name: "Lawn mower",
      description: "Electric, 40cm",
      ownerId: aliceId,
      status: "available",
      category: DEFAULT_TOOL.category,
      condition: DEFAULT_TOOL.condition,
    });
    expect(typeof tool!.createdAt).toBe("number");
    expect(tool!.removedAt).toBeUndefined();
  });

  test("Tool validation: empty and whitespace-only names are INVALID and write nothing", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    await expectConvexError(createTool(alice, { name: "" }), "INVALID", "empty name");
    await expectConvexError(createTool(alice, { name: "    " }), "INVALID", "whitespace name");
    await expectConvexError(createTool(alice, { name: "\t\n " }), "INVALID", "tab/newline name");
    expect(await countRows(t, "tools")).toBe(0);
  });

  test("Tool validation: name of exactly 80 chars (after trim) is accepted, 81 is INVALID", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const eighty = "a".repeat(80);
    const id1 = await createTool(alice, { name: eighty });
    expect((await getTool(t, id1))!.name).toBe(eighty);
    const id2 = await createTool(alice, { name: `  ${eighty}  ` });
    expect((await getTool(t, id2))!.name).toBe(eighty);

    await expectConvexError(createTool(alice, { name: "a".repeat(81) }), "INVALID", "81-char name");
    expect(await countRows(t, "tools")).toBe(2);
  });

  test("Tool validation: description up to 500 chars is accepted (empty allowed), 501 is INVALID", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    await createTool(alice, { description: "" });
    await createTool(alice, { description: "d".repeat(500) });
    await createTool(alice, { description: `  ${"d".repeat(500)}  ` });
    await expectConvexError(createTool(alice, { description: "d".repeat(501) }), "INVALID", "501-char description");
    expect(await countRows(t, "tools")).toBe(3);
  });

  test("Tool validation: category or condition outside the schema lists is rejected and writes nothing", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    await expect(
      alice.mutation(api.tools.create, { ...DEFAULT_TOOL, category: "weapons" as never }),
    ).rejects.toThrow();
    await expect(
      alice.mutation(api.tools.create, { ...DEFAULT_TOOL, condition: "broken" as never }),
    ).rejects.toThrow();
    expect(await countRows(t, "tools")).toBe(0);
  });
});

describe("Tool validation: tools.update", () => {
  test("Tool validation: update trims strings and patches only the given fields", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const toolId = await createTool(alice);
    await alice.mutation(api.tools.update, { toolId, name: "  Hammer drill ", description: " Corded " });
    expect(await getTool(t, toolId)).toMatchObject({
      name: "Hammer drill",
      description: "Corded",
      category: DEFAULT_TOOL.category,
      condition: DEFAULT_TOOL.condition,
    });
    await alice.mutation(api.tools.update, { toolId, category: "hand_tools", condition: "worn" });
    expect(await getTool(t, toolId)).toMatchObject({
      name: "Hammer drill",
      category: "hand_tools",
      condition: "worn",
    });
  });

  test("Tool validation: invalid updates are INVALID / rejected and leave the row unchanged", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const toolId = await createTool(alice);
    const before = await getTool(t, toolId);

    await expectConvexError(alice.mutation(api.tools.update, { toolId, name: "   " }), "INVALID", "blank name");
    await expectConvexError(
      alice.mutation(api.tools.update, { toolId, name: "b".repeat(81) }),
      "INVALID",
      "81-char name",
    );
    await expectConvexError(
      alice.mutation(api.tools.update, { toolId, description: "d".repeat(501) }),
      "INVALID",
      "501-char description",
    );
    await expect(
      alice.mutation(api.tools.update, { toolId, category: "weapons" as never }),
    ).rejects.toThrow();
    await expect(
      alice.mutation(api.tools.update, { toolId, condition: "broken" as never }),
    ).rejects.toThrow();

    expect(await getTool(t, toolId)).toEqual(before);
  });

  test("Tool validation: update accepts an 80-char name and a 500-char description", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const toolId = await createTool(alice);
    await alice.mutation(api.tools.update, { toolId, name: "n".repeat(80), description: "d".repeat(500) });
    expect(await getTool(t, toolId)).toMatchObject({ name: "n".repeat(80), description: "d".repeat(500) });
  });
});
