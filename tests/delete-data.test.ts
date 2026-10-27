import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockService, getUser, deleteCalls } = vi.hoisted(() => {
  const from = vi.fn();
  const getUser = vi.fn();
  const deleteCalls = [] as { col: string; val: unknown }[];
  return { mockService: { from }, getUser, deleteCalls };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceClient: () => mockService,
}));

function makeService() {
  mockService.from.mockImplementation(() => ({
    delete: () => ({
      eq: (col: string, val: unknown) => ({
        select: async () => {
          deleteCalls.push({ col, val });
          return { data: [{ id: "j1" }, { id: "j2" }], error: null };
        },
      }),
    }),
  }));
}

describe("POST /api/account/delete-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteCalls.length = 0;
    makeService();
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/account/delete-data/route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockService.from).not.toHaveBeenCalled();
  });

  it("deletes only the user's ai_jobs scoped by user_id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/account/delete-data/route");
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.deleted).toBe(2);
    // Scope is exactly the requesting user's rows.
    expect(deleteCalls).toEqual([{ col: "user_id", val: "u1" }]);
  });

  it("returns 500 on database error", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockService.from.mockImplementation(() => ({
      delete: () => ({
        eq: () => ({
          select: async () => ({ data: null, error: { message: "db down" } }),
        }),
      }),
    }));
    const { POST } = await import("@/app/api/account/delete-data/route");
    const res = await POST();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
