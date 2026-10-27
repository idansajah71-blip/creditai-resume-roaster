import { describe, it, expect, vi, afterEach } from "vitest";
import { hashIp, getClientIp } from "@/lib/demo";

const { mockService } = vi.hoisted(() => ({
  mockService: {
    from: vi.fn(),
    auth: { admin: { createUser: vi.fn() } },
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: () => mockService,
}));

const grantCredits = vi.fn();
vi.mock("@/lib/credits", () => ({ reserveCredit: vi.fn(), consumeReservation: vi.fn(), refundReservation: vi.fn(), grantCredits }));

describe("demo ip salt hardening", () => {
  const realNodeEnv = process.env.NODE_ENV;
  const setNodeEnv = (v: string | undefined) => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = v;
  };

  afterEach(() => {
    delete process.env.DEMO_IP_SALT;
    setNodeEnv(realNodeEnv);
  });

  describe("hashIp", () => {
    it("throws in production when DEMO_IP_SALT is missing", () => {
      setNodeEnv("production");
      delete process.env.DEMO_IP_SALT;
      expect(() => hashIp("1.2.3.4")).toThrow(/DEMO_IP_SALT/);
    });

    it("works in production when a salt is present", () => {
      setNodeEnv("production");
      process.env.DEMO_IP_SALT = "long-random-production-salt";
      const a = hashIp("1.2.3.4");
      const b = hashIp("1.2.3.4");
      expect(a).toBe(b);
      expect(a).toHaveLength(64); // hex hmac
    });

    it("does not use salt-dependent values across differing salts", () => {
      setNodeEnv("production");
      process.env.DEMO_IP_SALT = "salt-one";
      const a = hashIp("1.2.3.4");
      process.env.DEMO_IP_SALT = "salt-two";
      const b = hashIp("1.2.3.4");
      expect(a).not.toBe(b);
    });

    it("falls back outside production without throwing", () => {
      setNodeEnv("development");
      delete process.env.DEMO_IP_SALT;
      expect(() => hashIp("1.2.3.4")).not.toThrow();
      expect(hashIp("1.2.3.4")).toHaveLength(64);
    });
  });

  describe("getClientIp", () => {
    it("prefers x-vercel-forwarded-for over x-forwarded-for and x-real-ip", () => {
      const req = new Request("http://localhost/x", {
        headers: {
          "x-vercel-forwarded-for": "203.0.113.9",
          "x-forwarded-for": "10.0.0.1",
          "x-real-ip": "10.0.0.2",
        },
      });
      expect(getClientIp(req)).toBe("203.0.113.9");
    });

    it("still uses x-forwarded-for when vercel header is absent", () => {
      const req = new Request("http://localhost/x", {
        headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2", "x-real-ip": "10.0.0.2" },
      });
      expect(getClientIp(req)).toBe("10.0.0.1");
    });
  });

  describe("route /api/demo/session", () => {
    it("returns 500 with a clear log line when hashIp throws in production", async () => {
      setNodeEnv("production");
      delete process.env.DEMO_IP_SALT;
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { POST } = await import("@/app/api/demo/session/route");
        const req = new Request("http://localhost/api/demo/session", {
          method: "POST",
          headers: { "x-forwarded-for": "1.2.3.4" },
        });
        const res = await POST(req);
        expect(res.status).toBe(500);
        expect(errSpy).toHaveBeenCalledWith("[demo] session refused:", expect.stringMatching(/DEMO_IP_SALT/));
        expect(mockService.auth.admin.createUser).not.toHaveBeenCalled();
      } finally {
        errSpy.mockRestore();
      }
    });

    it("does not throw for a normal request in test env", async () => {
      delete process.env.DEMO_IP_SALT;
      let calls = 0;
      mockService.from.mockImplementation(() => ({
        select: () => ({
          eq: () => ({ gte: () => Promise.resolve({ count: 0, error: null }) }),
          gte: () => Promise.resolve({ count: 0, error: null }),
        }),
        insert: async () => ({ error: null }),
      }));
      mockService.auth.admin.createUser.mockImplementation(async () => {
        calls += 1;
        return { data: { user: { id: "demo-user-1" } }, error: null };
      });
      const { POST } = await import("@/app/api/demo/session/route");
      const req = new Request("http://localhost/api/demo/session", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.5" },
      });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(calls).toBe(1);
    });
  });
});
