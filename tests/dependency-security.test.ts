// Regression guard for the 2026-10-25 dependency security fix.
// Run with: npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { z } from "zod"

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"))
const pkgs: Record<string, { version: string }> = lock.packages

function atLeast(version: string, min: string): boolean {
  const a = version.split(".").map(Number)
  const b = min.split(".").map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

// Every installed copy (including nested ones) must be on a patched release.
const MINIMUMS: Record<string, string> = {
  next: "15.5.28",
  nodemailer: "10.1.4",
  "@azure/msal-node": "7.1.0",
  zod: "4.6.6",
  postcss: "8.5.23",
  uuid: "11.1.1",
}

for (const [name, min] of Object.entries(MINIMUMS)) {
  test(`every installed ${name} is >= ${min}`, () => {
    const copies = Object.entries(pkgs).filter(([path]) => path.endsWith(`node_modules/${name}`))
    assert.ok(copies.length > 0, `${name} not found in package-lock.json`)
    for (const [path, info] of copies) {
      assert.ok(atLeast(info.version, min), `${path} is ${info.version}, needs >= ${min}`)
    }
  })
}

// zod 4 renamed required_error/errorMap to `error`; the forms rely on these messages.
test("zod 4 custom messages surface for missing enum and literal fields", () => {
  const schema = z.object({
    rating: z.enum(["excellent", "average", "not_acceptable"], { error: "Rating required" }),
    attestation: z.literal("on", { error: "You must agree to attend the full session" }),
  })
  const result = schema.safeParse({})
  assert.equal(result.success, false)
  const fieldErrors = result.error!.flatten().fieldErrors
  assert.deepEqual(fieldErrors.rating, ["Rating required"])
  assert.deepEqual(fieldErrors.attestation, ["You must agree to attend the full session"])
})
