import { describe, expect, it } from "vitest";
import { formatUploadReceipt } from "../src/receipts.js";

describe("SDK receipt formatting", () => {
  it("formats upload receipts without secret-bearing fields", () => {
    expect(
      formatUploadReceipt({
        ok: true,
        changed: true,
        receipt: {
          context_id: "ctx_8f31",
          org: "acme",
          project: "checkout",
          title: "Auth UI Login Contract",
          source_workstream: "frontend",
          target_workstreams: ["backend"],
          domain: "auth",
          code_areas: ["login", "session"],
          context_type: "ui_contract",
          status: "active",
          version: 1,
          created_at: "2026-05-16T12:04:22Z",
          content_hash: "sha256:91ab"
        }
      })
    ).toBe(`Context uploaded

ID: ctx_8f31
Org: acme
Project: checkout
Title: Auth UI Login Contract
From: frontend
To: backend
Domain: auth
Code areas: login, session
Type: ui_contract
Status: active
Version: 1
Created at: 2026-05-16T12:04:22Z
Hash: sha256:91ab`);
  });
});
