import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpRepo } from "../helpers/env.js";
import { apiSurfaceChanges } from "../../src/modules/lawbook/api-surface.js";

function git(root: string, ...args: string[]): void {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function write(root: string, rel: string, body: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}

/** A repo on `main` with a controller and a DTO, then a feature branch. */
function repo(t: Parameters<typeof tmpRepo>[0]): string {
  const root = tmpRepo(t);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  write(
    root,
    "src/orders.controller.ts",
    `@Controller("orders")\nexport class OrdersController {\n  @Get()\n  list() {\n    return [];\n  }\n}\n`,
  );
  write(root, "src/dto/order.dto.ts", "export class OrderDto {\n  id!: string;\n}\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  git(root, "checkout", "-qb", "feat/x");
  return root;
}

test("a new route in a controller is an API change; its body alone is not", (t) => {
  const root = repo(t);
  const file = path.join(root, "src", "orders.controller.ts");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("return [];", "return [1];"));
  assert.deepEqual(apiSurfaceChanges(root, ["src/orders.controller.ts"]), []);

  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace("  list()", `  @Put(":id/payables")\n  pay() {}\n  list()`),
  );
  const hits = apiSurfaceChanges(root, ["src/orders.controller.ts"]);
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0]!.lines, ['@Put(":id/payables")']);
});

test("a DTO's code is the contract; its comments are not", (t) => {
  const root = repo(t);
  const file = path.join(root, "src", "dto", "order.dto.ts");
  fs.writeFileSync(file, `/** An order. */\n${fs.readFileSync(file, "utf8")}`);
  assert.deepEqual(apiSurfaceChanges(root, ["src/dto/order.dto.ts"]), []);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("id!: string;", "id!: number;"));
  assert.equal(apiSurfaceChanges(root, ["src/dto/order.dto.ts"]).length, 1);
});

test("new route files, handlers and contract files count; tests never do", (t) => {
  const root = repo(t);
  write(
    root,
    "web/app/api/health/route.ts",
    "export async function GET() {\n  return Response.json({});\n}\n",
  );
  write(root, "server/routes.js", 'router.post("/pay", handler);\n');
  write(root, "api/openapi.yaml", "openapi: 3.0.0\n");
  write(root, "api/main.py", '@app.get("/items")\ndef items():\n    return []\n');
  write(root, "src/orders.controller.spec.ts", '@Controller("x")\nclass Fake {}\n');
  write(root, "src/util.ts", "export const x = 1;\n");
  const files = [
    "web/app/api/health/route.ts",
    "server/routes.js",
    "api/openapi.yaml",
    "api/main.py",
    "src/orders.controller.spec.ts",
    "src/util.ts",
  ];
  assert.deepEqual(
    apiSurfaceChanges(root, files).map((h) => h.file),
    ["web/app/api/health/route.ts", "server/routes.js", "api/openapi.yaml", "api/main.py"],
  );
});

test("removing a route is an API change too", (t) => {
  const root = repo(t);
  const file = path.join(root, "src", "orders.controller.ts");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("  @Get()\n", ""));
  assert.equal(apiSurfaceChanges(root, ["src/orders.controller.ts"]).length, 1);
});

test("a mention is not a route: strings, regexes and client calls", (t) => {
  const root = repo(t);
  write(
    root,
    "src/detector.ts",
    [
      "const re = /@(Controller|Get)\\s*\\(/;",
      'const s = "@Get(\\"x\\")";',
      'api.get("/users");',
      'app.get("port");',
    ].join("\n") + "\n",
  );
  assert.deepEqual(apiSurfaceChanges(root, ["src/detector.ts"]), []);
});

test("a path with a space is still read from the diff", (t) => {
  const root = repo(t);
  write(root, "src/my routes/orders.controller.ts", "export class X {}\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "space");
  const file = path.join(root, "src", "my routes", "orders.controller.ts");
  fs.writeFileSync(file, '@Controller("x")\nexport class X {}\n');
  assert.equal(apiSurfaceChanges(root, ["src/my routes/orders.controller.ts"]).length, 1);
});
