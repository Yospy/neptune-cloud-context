import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/commands.js";
import { readConfig, writeConfig } from "../src/config.js";

function stream() {
  let value = "";
  return {
    write(chunk: string) {
      value += chunk;
      return true;
    },
    value() {
      return value;
    }
  };
}

describe("CLI commands", () => {
  it("lists the MCP install command in help", async () => {
    const stdout = stream();

    const code = await runCli(["--help"], { stdout });

    expect(code).toBe(0);
    expect(stdout.value()).toContain("neptune mcp install");
    expect(stdout.value()).toContain("neptune setup");
    expect(stdout.value()).toContain("neptune doctor");
  });

  it("stores login session without printing tokens", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const stderr = stream();

    try {
      const code = await runCli(["login"], {
        configPath,
        stdout,
        stderr,
        env: {
          NEPTUNE_API_URL: "http://127.0.0.1:8787",
          NEPTUNE_SUPABASE_URL: "https://supabase.example.com",
          NEPTUNE_SUPABASE_ANON_KEY: "anon"
        },
        login: vi.fn(async () => ({
          accessToken: "secret-access-token",
          refreshToken: "secret-refresh-token",
          expiresAt: 1800000000,
          tokenType: "bearer",
          user: { id: "user-1", email: "user@example.com" }
        }))
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Logged in as user@example.com.");
      expect(stdout.value()).not.toContain("secret-access-token");
      expect(await readConfig(configPath)).toMatchObject({
        auth: { accessToken: "secret-access-token" }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints auth status without token material", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();

    try {
      await writeConfig(
        {
          auth: {
            accessToken: "secret-access-token",
            refreshToken: "secret-refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1", email: "user@example.com" }
          }
        },
        configPath
      );

      const code = await runCli(["auth", "status"], { configPath, stdout });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Logged in as user@example.com.");
      expect(stdout.value()).not.toContain("secret-access-token");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports auth logout as an alias and clears default org", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          defaultOrg: {
            org_id: "11111111-1111-4111-8111-111111111111",
            org_slug: "acme"
          },
          auth: {
            accessToken: "secret-access-token",
            refreshToken: "secret-refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1", email: "user@example.com" }
          }
        },
        configPath
      );

      const code = await runCli(["auth", "logout"], { configPath, stdout });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Logged out.");
      expect(await readConfig(configPath)).toEqual({ apiUrl: "http://127.0.0.1:8787" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates projects by resolving org slug to org id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [{ id: "11111111-1111-4111-8111-111111111111", slug: "acme", role: "owner" }]
          }),
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            project: {
              id: "22222222-2222-4222-8222-222222222222",
              org_id: "11111111-1111-4111-8111-111111111111",
              slug: "checkout",
              name: "Checkout",
              role: "admin",
              default_workstream: "general",
              created_at: "2026-05-17T00:00:00.000Z"
            }
          }),
        json: async () => ({})
      });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["project", "create", "checkout", "--org", "acme"], {
        configPath,
        stdout,
        fetch
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Created project acme/checkout");
      expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
        org_id: "11111111-1111-4111-8111-111111111111",
        slug: "checkout"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sets and prints the default org", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          orgs: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              slug: "acme",
              name: "Acme",
              role: "owner",
              created_at: "2026-06-29T00:00:00.000Z"
            }
          ]
        })
    });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const useCode = await runCli(["org", "use", "acme"], { configPath, stdout, fetch });
      expect(useCode).toBe(0);
      expect(await readConfig(configPath)).toMatchObject({
        defaultOrg: {
          org_id: "11111111-1111-4111-8111-111111111111",
          org_slug: "acme"
        }
      });

      const currentCode = await runCli(["org", "current"], { configPath, stdout });
      expect(currentCode).toBe(0);
      expect(stdout.value()).toContain("acme\t11111111-1111-4111-8111-111111111111");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates projects inside the default org", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                slug: "acme",
                name: "Acme",
                role: "owner",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            project: {
              id: "22222222-2222-4222-8222-222222222222",
              org_id: "11111111-1111-4111-8111-111111111111",
              slug: "api",
              name: "Api",
              role: "admin",
              default_workstream: "backend",
              created_at: "2026-06-29T00:00:00.000Z"
            }
          })
      });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          defaultOrg: {
            org_id: "11111111-1111-4111-8111-111111111111",
            org_slug: "acme"
          },
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["project", "create", "api", "--workstream", "backend"], {
        configPath,
        stdout,
        fetch
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Created project acme/api");
      expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
        org_id: "11111111-1111-4111-8111-111111111111",
        slug: "api",
        default_workstream: "backend"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("binds, prints, and unbinds the current directory project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const cwd = join(dir, "repo");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                slug: "acme",
                name: "Acme",
                role: "owner",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            projects: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                org_id: "11111111-1111-4111-8111-111111111111",
                slug: "api",
                name: "Api",
                role: "admin",
                default_workstream: "backend",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      });

    try {
      await mkdir(cwd, { recursive: true });
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          defaultOrg: {
            org_id: "11111111-1111-4111-8111-111111111111",
            org_slug: "acme"
          },
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const bindCode = await runCli(["project", "bind", "api"], { configPath, cwd, stdout, fetch });
      expect(bindCode).toBe(0);
      expect(JSON.parse(await readFile(join(cwd, ".neptune", "config.json"), "utf8"))).toMatchObject({
        org_slug: "acme",
        project_slug: "api",
        project_id: "22222222-2222-4222-8222-222222222222",
        default_workstream: "backend"
      });

      const currentCode = await runCli(["project", "current"], { configPath, cwd, stdout });
      expect(currentCode).toBe(0);
      expect(stdout.value()).toContain("acme/api\tbackend\t22222222-2222-4222-8222-222222222222");

      const unbindCode = await runCli(["project", "unbind"], { configPath, cwd, stdout });
      expect(unbindCode).toBe(0);
      await expect(readFile(join(cwd, ".neptune", "config.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("deletes projects after confirmation and removes matching repo binding", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const cwd = join(dir, "repo");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                slug: "acme",
                name: "Acme",
                role: "owner",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            projects: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                org_id: "11111111-1111-4111-8111-111111111111",
                slug: "api",
                name: "Api",
                role: "admin",
                default_workstream: "backend",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true })
      });

    try {
      await mkdir(join(cwd, ".neptune"), { recursive: true });
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          defaultOrg: {
            org_id: "11111111-1111-4111-8111-111111111111",
            org_slug: "acme"
          },
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );
      await writeFile(
        join(cwd, ".neptune", "config.json"),
        JSON.stringify({
          org_slug: "acme",
          project_slug: "api",
          project_id: "22222222-2222-4222-8222-222222222222",
          default_workstream: "backend"
        })
      );

      const code = await runCli(["project", "delete", "api"], {
        configPath,
        cwd,
        stdout,
        fetch,
        prompt: vi.fn(async () => "api")
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Deleted project acme/api");
      expect(String(fetch.mock.calls[2][0])).toContain("/projects/22222222-2222-4222-8222-222222222222");
      expect(fetch.mock.calls[2][1]?.method).toBe("DELETE");
      await expect(readFile(join(cwd, ".neptune", "config.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("cancels project deletion when confirmation does not match", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const stderr = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                slug: "acme",
                name: "Acme",
                role: "owner",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            projects: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                org_id: "11111111-1111-4111-8111-111111111111",
                slug: "api",
                name: "Api",
                role: "admin",
                default_workstream: "backend",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          defaultOrg: {
            org_id: "11111111-1111-4111-8111-111111111111",
            org_slug: "acme"
          },
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["project", "delete", "api"], {
        configPath,
        stdout,
        stderr,
        fetch,
        prompt: vi.fn(async () => "no")
      });

      expect(code).toBe(1);
      expect(stderr.value()).toContain("Project deletion cancelled.");
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses the default org for org members and project list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const projectListResponse = {
      ok: true,
      projects: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          org_id: "11111111-1111-4111-8111-111111111111",
          slug: "api",
          name: "Api",
          role: "admin",
          default_workstream: "backend",
          created_at: "2026-06-29T00:00:00.000Z"
        }
      ]
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                slug: "acme",
                name: "Acme",
                role: "owner",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            members: [
              {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  display_name: null,
                  avatar_url: null,
                  provider: "github",
                  last_seen_at: null,
                  created_at: "2026-06-29T00:00:00.000Z",
                  updated_at: "2026-06-29T00:00:00.000Z"
                },
                role: "owner",
                created_at: "2026-06-29T00:00:00.000Z"
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(projectListResponse)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(projectListResponse)
      });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          defaultOrg: {
            org_id: "11111111-1111-4111-8111-111111111111",
            org_slug: "acme"
          },
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const membersCode = await runCli(["org", "members"], { configPath, stdout, fetch });
      expect(membersCode).toBe(0);
      expect(stdout.value()).toContain("user@example.com\towner\tuser-1");

      const listCode = await runCli(["project", "list"], { configPath, stdout, fetch });
      expect(listCode).toBe(0);
      expect(stdout.value()).toContain("api\tadmin\t22222222-2222-4222-8222-222222222222\tbackend");
      expect(String(fetch.mock.calls[2][0])).toContain("org_id=11111111-1111-4111-8111-111111111111");

      const legacyStdout = stream();
      const legacyCode = await runCli(["projects"], { configPath, stdout: legacyStdout, fetch });
      expect(legacyCode).toBe(0);
      expect(legacyStdout.value()).toBe("api\tadmin\t22222222-2222-4222-8222-222222222222\n");
      expect(String(fetch.mock.calls[3][0])).not.toContain("org_id=");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("derives org slug from a human-readable create name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          org: {
            id: "11111111-1111-4111-8111-111111111111",
            slug: "yash-canvas",
            name: "Yash Canvas",
            role: "owner",
            created_at: "2026-05-21T00:00:00.000Z"
          }
        }),
      json: async () => ({})
    });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["org", "create", "Yash Canvas"], {
        configPath,
        stdout,
        fetch
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Created org yash-canvas");
      expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
        slug: "yash-canvas",
        name: "Yash Canvas"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports create org alias with a human-readable name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          org: {
            id: "11111111-1111-4111-8111-111111111111",
            slug: "tisac",
            name: "Tisac",
            role: "owner",
            created_at: "2026-05-21T00:00:00.000Z"
          }
        }),
      json: async () => ({})
    });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["create", "org", "Tisac"], {
        configPath,
        stdout,
        fetch
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Created org tisac");
      expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
        slug: "tisac",
        name: "Tisac"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("derives project slug from a human-readable create name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [{ id: "11111111-1111-4111-8111-111111111111", slug: "acme", role: "owner" }]
          }),
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            project: {
              id: "22222222-2222-4222-8222-222222222222",
              org_id: "11111111-1111-4111-8111-111111111111",
              slug: "checkout-ui",
              name: "Checkout UI",
              role: "admin",
              default_workstream: "frontend",
              created_at: "2026-05-21T00:00:00.000Z"
            }
          }),
        json: async () => ({})
      });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["project", "create", "Checkout UI", "--org", "acme", "--workstream", "frontend"], {
        configPath,
        stdout,
        fetch
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Created project acme/checkout-ui");
      expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
        slug: "checkout-ui",
        name: "Checkout UI",
        default_workstream: "frontend"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts project org as a second positional human-readable name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                slug: "my-org",
                name: "My Org",
                role: "owner",
                created_at: "2026-05-21T00:00:00.000Z"
              }
            ]
          }),
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            project: {
              id: "22222222-2222-4222-8222-222222222222",
              org_id: "11111111-1111-4111-8111-111111111111",
              slug: "tisac",
              name: "Tisac",
              role: "admin",
              default_workstream: "general",
              created_at: "2026-05-21T00:00:00.000Z"
            }
          }),
        json: async () => ({})
      });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["project", "create", "Tisac", "My Org"], {
        configPath,
        stdout,
        fetch
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Created project my-org/tisac");
      expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
        org_id: "11111111-1111-4111-8111-111111111111",
        slug: "tisac",
        name: "Tisac"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports create project alias with a second positional org name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                slug: "neptune",
                name: "Neptune",
                role: "owner",
                created_at: "2026-05-21T00:00:00.000Z"
              }
            ]
          }),
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            project: {
              id: "22222222-2222-4222-8222-222222222222",
              org_id: "11111111-1111-4111-8111-111111111111",
              slug: "tisac",
              name: "Tisac",
              role: "admin",
              default_workstream: "general",
              created_at: "2026-05-21T00:00:00.000Z"
            }
          }),
        json: async () => ({})
      });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["create", "project", "Tisac", "Neptune"], {
        configPath,
        stdout,
        fetch
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Created project neptune/tisac");
      expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
        org_id: "11111111-1111-4111-8111-111111111111",
        slug: "tisac",
        name: "Tisac"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints the authenticated user profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          user: {
            id: "user-1",
            email: "user@example.com",
            display_name: "Test User",
            avatar_url: null,
            provider: "github",
            last_seen_at: "2026-05-17T00:00:00.000Z",
            created_at: "2026-05-17T00:00:00.000Z",
            updated_at: "2026-05-17T00:00:00.000Z"
          },
          orgs: [],
          projects: []
        }),
      json: async () => ({})
    }));

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["me"], { configPath, stdout, fetch });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("user@example.com\tuser-1");
      expect(stdout.value()).toContain("orgs\t0");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists org members by resolving org slug", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [{ id: "11111111-1111-4111-8111-111111111111", slug: "acme", role: "owner" }]
          }),
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            members: [
              {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  display_name: "Test User",
                  avatar_url: null,
                  provider: "github",
                  last_seen_at: null,
                  created_at: "2026-05-17T00:00:00.000Z",
                  updated_at: "2026-05-17T00:00:00.000Z"
                },
                role: "owner",
                created_at: "2026-05-17T00:00:00.000Z"
              }
            ]
          }),
        json: async () => ({})
      });

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(["org", "members", "--org", "acme"], {
        configPath,
        stdout,
        fetch
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("user@example.com\towner\tuser-1");
      expect(String(fetch.mock.calls[1][0])).toContain(
        "/orgs/11111111-1111-4111-8111-111111111111/members"
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists project members by project id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          members: [
            {
              user: {
                id: "user-1",
                email: null,
                display_name: "Test User",
                avatar_url: null,
                provider: "github",
                last_seen_at: null,
                created_at: "2026-05-17T00:00:00.000Z",
                updated_at: "2026-05-17T00:00:00.000Z"
              },
              role: "admin",
              default_workstream: "backend",
              created_at: "2026-05-17T00:00:00.000Z"
            }
          ]
        }),
      json: async () => ({})
    }));

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        },
        configPath
      );

      const code = await runCli(
        ["project", "members", "--project", "22222222-2222-4222-8222-222222222222"],
        { configPath, stdout, fetch }
      );

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Test User\tadmin\tbackend\tuser-1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("dry-runs Codex and Claude MCP install without writing config or invoking Claude", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const codexConfigPath = join(dir, ".codex", "config.toml");
    const stdout = stream();
    const execFile = vi.fn();

    try {
      const code = await runCli(
        ["mcp", "install", "--target", "all", "--api-url", "https://neptune.example.com", "--dry-run"],
        { codexConfigPath, stdout, execFile }
      );

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Would update Codex MCP config");
      expect(stdout.value()).toContain("[mcp_servers.neptune]");
      expect(stdout.value()).toContain('NEPTUNE_API_URL = "https://neptune.example.com"');
      expect(stdout.value()).toContain("Would update Claude Code MCP config");
      expect(stdout.value()).toContain("claude mcp remove -s user neptune");
      expect(stdout.value()).toContain("claude mcp add --transport stdio --scope user neptune");
      expect(execFile).not.toHaveBeenCalled();
      await expect(stat(codexConfigPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("updates only the Neptune Codex MCP section and is idempotent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const codexConfigPath = join(dir, ".codex", "config.toml");
    const stdout = stream();

    try {
      await mkdir(join(dir, ".codex"), { recursive: true });
      await writeFile(
        codexConfigPath,
        [
          'model = "gpt-5.5"',
          "",
          "[mcp_servers.context7]",
          'url = "https://mcp.context7.com/mcp"',
          "",
          "[mcp_servers.neptune]",
          'command = "old"',
          'args = ["old"]',
          "",
          "[mcp_servers.neptune.env]",
          'NEPTUNE_API_URL = "https://old.example.com"',
          "",
          "[features]",
          "apps = true",
          ""
        ].join("\n")
      );

      const firstCode = await runCli(
        ["mcp", "install", "--api-url", "https://neptune.example.com"],
        { codexConfigPath, stdout }
      );
      const first = await readFile(codexConfigPath, "utf8");
      const secondCode = await runCli(
        ["mcp", "install", "--api-url", "https://neptune.example.com"],
        { codexConfigPath, stdout }
      );
      const second = await readFile(codexConfigPath, "utf8");

      expect(firstCode).toBe(0);
      expect(secondCode).toBe(0);
      expect(second).toBe(first);
      expect(second).toContain('model = "gpt-5.5"');
      expect(second).toContain("[mcp_servers.context7]");
      expect(second).toContain("[features]");
      expect(second).toContain('command = "npx"');
      expect(second).toContain('args = ["-y", "neptune-context-mcp"]');
      expect(second).toContain('NEPTUNE_API_URL = "https://neptune.example.com"');
      expect(second).not.toContain('command = "old"');
      expect(second.match(/\[mcp_servers\.neptune\]/g)).toHaveLength(1);
      expect(second.match(/\[mcp_servers\.neptune\.env\]/g)).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("installs Claude MCP through the Claude CLI", async () => {
    const stdout = stream();
    const execFile = vi.fn(async () => ({ stdout: "", stderr: "" }));

    const code = await runCli(
      ["mcp", "install", "--target", "claude", "--api-url", "https://neptune.example.com"],
      { stdout, execFile }
    );

    expect(code).toBe(0);
    expect(stdout.value()).toContain("Updated Claude Code MCP config");
    expect(execFile).toHaveBeenNthCalledWith(1, "claude", ["mcp", "remove", "-s", "user", "neptune"]);
    expect(execFile).toHaveBeenNthCalledWith(2, "claude", [
      "mcp",
      "add",
      "--transport",
      "stdio",
      "--scope",
      "user",
      "neptune",
      "-e",
      "NEPTUNE_API_URL=https://neptune.example.com",
      "--",
      "npx",
      "-y",
      "neptune-context-mcp"
    ]);
  });

  it("fails clearly when Claude install is requested but the Claude CLI is missing", async () => {
    const stdout = stream();
    const stderr = stream();
    const missing = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    const execFile = vi.fn(async () => {
      throw missing;
    });

    const code = await runCli(["mcp", "install", "--target", "claude"], {
      stdout,
      stderr,
      execFile
    });

    expect(code).toBe(1);
    expect(stderr.value()).toContain("Claude Code CLI not found");
  });

  it("sets up an existing org and project, writes repo binding, and installs Codex MCP", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "home", ".neptune", "config.json");
    const codexConfigPath = join(dir, "home", ".codex", "config.toml");
    const cwd = join(dir, "repo");
    const stdout = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            user: {
              id: "user-1",
              email: "user@example.com",
              display_name: null,
              avatar_url: null,
              provider: "github",
              last_seen_at: null,
              created_at: "2026-05-19T00:00:00.000Z",
              updated_at: "2026-05-19T00:00:00.000Z"
            },
            orgs: [],
            projects: []
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            orgs: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                slug: "acme",
                name: "Acme",
                role: "owner",
                created_at: "2026-05-19T00:00:00.000Z"
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            projects: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                org_id: "11111111-1111-4111-8111-111111111111",
                slug: "checkout",
                name: "Checkout",
                role: "admin",
                default_workstream: "backend",
                created_at: "2026-05-19T00:00:00.000Z"
              }
            ]
          })
      });

    try {
      await mkdir(cwd, { recursive: true });
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "secret-access-token",
            refreshToken: "secret-refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1", email: "user@example.com" }
          }
        },
        configPath
      );

      const code = await runCli(
        ["setup", "--org", "acme", "--project", "checkout", "--target", "codex", "--api-url", "https://neptune.example.com"],
        {
          configPath,
          codexConfigPath,
          cwd,
          stdout,
          fetch,
          env: { NEPTUNE_API_URL: "https://stale.example.com" }
        }
      );

      expect(code).toBe(0);
      expect(stdout.value()).toContain("Setup complete.");
      expect(stdout.value()).toContain("Org: acme");
      expect(stdout.value()).toContain("Project: checkout");
      expect(stdout.value()).not.toContain("secret-access-token");
      expect(await readConfig(configPath)).toMatchObject({ apiUrl: "https://neptune.example.com" });
      expect(String(fetch.mock.calls[0][0])).toContain("https://neptune.example.com/me");
      expect(JSON.parse(await readFile(join(cwd, ".neptune", "config.json"), "utf8"))).toMatchObject({
        org_slug: "acme",
        project_slug: "checkout",
        project_id: "22222222-2222-4222-8222-222222222222",
        default_workstream: "backend"
      });
      expect(await readFile(codexConfigPath, "utf8")).toContain('NEPTUNE_API_URL = "https://neptune.example.com"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("setup logs in and creates missing org and project from flags", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "home", ".neptune", "config.json");
    const codexConfigPath = join(dir, "home", ".codex", "config.toml");
    const cwd = join(dir, "repo");
    const stdout = stream();
    const login = vi.fn(async () => ({
      accessToken: "secret-access-token",
      refreshToken: "secret-refresh-token",
      expiresAt: 1800000000,
      tokenType: "bearer",
      user: { id: "user-1", email: "user@example.com" }
    }));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            user: {
              id: "user-1",
              email: "user@example.com",
              display_name: null,
              avatar_url: null,
              provider: "github",
              last_seen_at: null,
              created_at: "2026-05-19T00:00:00.000Z",
              updated_at: "2026-05-19T00:00:00.000Z"
            },
            orgs: [],
            projects: []
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, orgs: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            org: {
              id: "11111111-1111-4111-8111-111111111111",
              slug: "acme",
              name: "Acme",
              role: "owner",
              created_at: "2026-05-19T00:00:00.000Z"
            }
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, projects: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            project: {
              id: "22222222-2222-4222-8222-222222222222",
              org_id: "11111111-1111-4111-8111-111111111111",
              slug: "checkout",
              name: "Checkout",
              role: "admin",
              default_workstream: "frontend",
              created_at: "2026-05-19T00:00:00.000Z"
            }
          })
      });

    try {
      await mkdir(cwd, { recursive: true });
      const code = await runCli(
        [
          "setup",
          "--org",
          "acme",
          "--project",
          "checkout",
          "--workstream",
          "frontend",
          "--target",
          "codex",
          "--api-url",
          "https://neptune.example.com"
        ],
        {
          configPath,
          codexConfigPath,
          cwd,
          stdout,
          fetch,
          login,
          env: {
            NEPTUNE_SUPABASE_URL: "https://supabase.example.com",
            NEPTUNE_SUPABASE_ANON_KEY: "anon"
          }
        }
      );

      expect(code).toBe(0);
      expect(login).toHaveBeenCalled();
      expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toMatchObject({ slug: "acme" });
      expect(JSON.parse(String(fetch.mock.calls[4][1]?.body))).toMatchObject({
        slug: "checkout",
        default_workstream: "frontend"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("setup rejects invalid target and workstream", async () => {
    const stderr = stream();
    const badTarget = await runCli(["setup", "--target", "vim"], { stderr });
    const badWorkstream = await runCli(["setup", "--target", "codex", "--workstream", "sales"], { stderr });

    expect(badTarget).toBe(1);
    expect(badWorkstream).toBe(1);
    expect(stderr.value()).toContain("Usage: neptune setup");
    expect(stderr.value()).toContain("Invalid workstream: sales");
  });

  it("doctor passes with healthy config, binding, Codex config, and MCP probe", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "home", ".neptune", "config.json");
    const codexConfigPath = join(dir, "home", ".codex", "config.toml");
    const cwd = join(dir, "repo");
    const stdout = stream();
    const mcpProbe = vi.fn(async () => undefined);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            user: {
              id: "user-1",
              email: "user@example.com",
              display_name: null,
              avatar_url: null,
              provider: "github",
              last_seen_at: null,
              created_at: "2026-05-19T00:00:00.000Z",
              updated_at: "2026-05-19T00:00:00.000Z"
            },
            orgs: [],
            projects: []
          })
      });

    try {
      await mkdir(join(cwd, ".neptune"), { recursive: true });
      await mkdir(join(dir, "home", ".codex"), { recursive: true });
      await writeConfig(
        {
          apiUrl: "https://neptune.example.com",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1", email: "user@example.com" }
          }
        },
        configPath
      );
      await writeFile(
        join(cwd, ".neptune", "config.json"),
        JSON.stringify({
          org_slug: "acme",
          project_slug: "checkout",
          project_id: "22222222-2222-4222-8222-222222222222",
          default_workstream: "backend"
        })
      );
      await writeFile(
        codexConfigPath,
        '[mcp_servers.neptune]\ncommand = "npx"\nargs = ["-y", "neptune-context-mcp"]\n'
      );

      const code = await runCli(["doctor", "--target", "codex"], {
        configPath,
        codexConfigPath,
        cwd,
        stdout,
        fetch,
        mcpProbe,
        nodeVersion: "23.11.0"
      });

      expect(code).toBe(0);
      expect(stdout.value()).toContain("PASS node");
      expect(stdout.value()).toContain("PASS auth");
      expect(stdout.value()).toContain("PASS backend");
      expect(stdout.value()).toContain("PASS repo binding");
      expect(stdout.value()).toContain("PASS codex config");
      expect(stdout.value()).toContain("PASS mcp probe");
      expect(mcpProbe).toHaveBeenCalledWith("https://neptune.example.com");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("doctor reports missing auth, binding, bad Node, and missing Claude CLI", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-"));
    const configPath = join(dir, "config.json");
    const stdout = stream();
    const missing = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });

    try {
      await writeConfig({ apiUrl: "https://neptune.example.com" }, configPath);
      const code = await runCli(["doctor", "--target", "claude"], {
        configPath,
        cwd: dir,
        stdout,
        nodeVersion: "18.15.0",
        fetch: vi.fn(async () => ({ ok: false, status: 500, text: async () => "" })),
        execFile: vi.fn(async () => {
          throw missing;
        }),
        mcpProbe: vi.fn(async () => {
          throw new Error("MCP probe failed.");
        })
      });

      expect(code).toBe(1);
      expect(stdout.value()).toContain("FAIL node");
      expect(stdout.value()).toContain("FAIL auth");
      expect(stdout.value()).toContain("FAIL backend");
      expect(stdout.value()).toContain("FAIL repo binding");
      expect(stdout.value()).toContain("FAIL claude config: Claude Code CLI not found.");
      expect(stdout.value()).toContain("FAIL mcp probe: MCP probe failed.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
