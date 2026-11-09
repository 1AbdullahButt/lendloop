// Admin Listings: live listings in the table, removed ones in the collapsed section, and one
// removed on this visit stays in the table so its result shows where the admin clicked.
import { expect, test } from "vitest";
import { splitListings } from "../../lib/adminListings";

const tools = [
  { _id: "a", name: "Drill" },
  { _id: "b", name: "QA drill", removedAt: 1 },
  { _id: "c", name: "Ladder" },
  { _id: "d", name: "Old ladder", removedAt: 2 },
];

test("removed listings go to their own list, order kept", () => {
  const { active, removed } = splitListings(tools);
  expect(active.map((t) => t._id)).toEqual(["a", "c"]);
  expect(removed.map((t) => t._id)).toEqual(["b", "d"]);
});

test("a listing removed on this visit stays in the main table", () => {
  const { active, removed } = splitListings(tools, new Set(["b"]));
  expect(active.map((t) => t._id)).toEqual(["a", "b", "c"]);
  expect(removed.map((t) => t._id)).toEqual(["d"]);
});

test("nothing removed: the collapsed list is empty", () => {
  expect(splitListings([tools[0]]).removed).toEqual([]);
});
