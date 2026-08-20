import { beforeEach, describe, expect, it, vi } from "vitest";

// The upload-cleanup safety net: a file must survive while ANY table still
// references it. VetReport is the fourth reference class (amendment A2) —
// without it, vet photos were reaped ~24h after the report was saved.
const mocks = vi.hoisted(() => ({
  findFirst: {
    watch: vi.fn(),
    photo: vi.fn(),
    document: vi.fn(),
    vetReport: vi.fn(),
  },
  deleteStoredFile: vi.fn(),
}));
const { findFirst, deleteStoredFile } = mocks;

vi.mock("./prisma", () => ({
  prisma: {
    watch: { findFirst: mocks.findFirst.watch },
    photo: { findFirst: mocks.findFirst.photo },
    document: { findFirst: mocks.findFirst.document },
    vetReport: { findFirst: mocks.findFirst.vetReport },
  },
}));
vi.mock("./upload", () => ({ deleteStoredFile: mocks.deleteStoredFile }));
vi.mock("./errorLog", () => ({ recordFailure: vi.fn() }));

import { deleteStoredFileIfUnreferenced } from "./uploadReferences";

const URL = "/api/uploads/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.jpg";

describe("deleteStoredFileIfUnreferenced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(findFirst)) fn.mockResolvedValue(null);
  });

  it("keeps a file referenced by a VetReport", async () => {
    findFirst.vetReport.mockResolvedValue({ id: "vr1" });
    await deleteStoredFileIfUnreferenced(URL);
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it("deletes a file no table references", async () => {
    await deleteStoredFileIfUnreferenced(URL);
    expect(deleteStoredFile).toHaveBeenCalledWith(URL);
  });

  it("keeps files referenced by the original three tables", async () => {
    findFirst.photo.mockResolvedValue({ id: "p1" });
    await deleteStoredFileIfUnreferenced(URL);
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });
});
