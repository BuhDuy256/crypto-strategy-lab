import { describe, expect, it, vi } from "vitest";
import { RequestIdMiddleware } from "./request-id.middleware.js";
import { StructuredLogger } from "./logger.js";

// Minimal stand-ins for the parts of Express's Request/Response the
// middleware touches.
function fakeReq(headers: Record<string, string | string[] | undefined>) {
  return { headers } as unknown as import("express").Request;
}

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    headers
  } as unknown as import("express").Response & { headers: Record<string, string> };
}

describe("request id propagation to the logger", () => {
  it("makes the resolved request id readable by the logger for the rest of the request", () => {
    const middleware = new RequestIdMiddleware();
    const logger = new StructuredLogger("api", { pretty: false });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const req = fakeReq({ "x-request-id": "propagation-test-id" });
    const res = fakeRes();

    middleware.use(req, res, () => {
      logger.log("inside request handler");
    });

    expect(res.headers["x-request-id"]).toBe("propagation-test-id");
    const [line] = logSpy.mock.calls[0] ?? [];
    logSpy.mockRestore();
    const record = JSON.parse(String(line)) as { requestId: string | null };
    expect(record.requestId).toBe("propagation-test-id");
  });

  it("does not leak a request id into logs emitted outside any request", () => {
    const logger = new StructuredLogger("api", { pretty: false });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logger.log("outside any request");

    const [line] = logSpy.mock.calls[0] ?? [];
    logSpy.mockRestore();
    const record = JSON.parse(String(line)) as { requestId: string | null };
    expect(record.requestId).toBeNull();
  });
});
