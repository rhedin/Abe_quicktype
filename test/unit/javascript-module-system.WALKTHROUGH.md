# Walkthrough: `javascript-module-system.test.ts`

Same file, same order, with the reasoning spelled out between the pieces.
Nothing here changes the real test — this is just for reading alongside it.

## First: what kind of input is this test actually using?

This is worth flagging up front because it's easy to miss. Every CLI run
you've done by hand has used `--src-lang schema`, feeding quicktype an
actual `.schema` file with explicit `"type"`/`"properties"`. This test does
**not** do that. Look at the imports and the `renderJavaScript` helper:

```typescript
import {
    InputData,
    jsonInputForTargetLanguage,
    quicktype,
} from "quicktype-core";
```

`jsonInputForTargetLanguage` + `.addSource({ name, samples })` is
quicktype's *sample-inference* pipeline — the one used when you don't have
a schema at all, just example JSON, and want quicktype to guess the shape.
Pseudocode for what happens:

```
GIVEN sample = '{"data123":{"name":"quicktype"}}'   (one JSON document, as a string)

jsonInput = an input source that infers types from JSON samples
jsonInput.addSource(name: "TopLevel", samples: [sample])
    -> tells quicktype: "here is one example of the document
       I want you to call 'TopLevel'. Look at its shape and
       infer types for it and anything nested inside it."

inputData = new InputData()
inputData.addInput(jsonInput)

result = quicktype({ inputData, lang: "js", rendererOptions })
    -> runs type inference + the JavaScript renderer, returns
       the generated source as an array of lines
return result.lines.join("\n")   // one big string of generated JS
```

From that one sample, quicktype's inference engine works out two object
shapes, not one:

- **`TopLevel`** — an object with one property, `data123`, whose value is
  itself an object. (`TopLevel` is the name you gave `addSource`, not
  inferred from anything — same `givenName` mechanism we traced through
  `JSONSchemaInput.ts` a few messages back, just via the JSON path instead
  of the schema path this time.)
- **`Data123`** — an object with one property, `name`, a string. The name
  `Data123` isn't given explicitly anywhere; quicktype infers it from the
  *property name* that held this nested object (`data123`), then
  PascalCases it. That's the same naming chain as before — this is the
  "context-inferred from property name" branch of it.

## Your question: should "name" show up somewhere in what we verify?

Short answer: no, and that's intentional, not an oversight. Here's why.

`"name": "quicktype"` isn't there to be *tested* — it's there to make
`data123` a real object with actual structure, rather than an empty `{}`.
If the sample were `{ data123: {} }`, quicktype might not bother generating
a distinct `Data123` type worth its own converter pair at all (an empty
object doesn't need a shape). By giving `data123` one property, the sample
guarantees "yes, this is a genuine second object type, worth catching if
`all-objects` mode misses it." The comment right above the sample says
almost exactly this:

```typescript
// A schema with a nested object (`data123`) so `converters: all-objects`
// produces more than one converter pair -- enough to tell "the export list
// is right" apart from "the export list merely has one name in it".
```

So `"name"` is scaffolding for the *test's own construction*, not part of
what any `expect(...)` call checks. If you search the file for the string
`"name"` outside that one sample line, you won't find it — every assertion
in this file is about **function names** (`toData123`, `data123ToJson`) and
**export-list contents**, never about individual properties. Property-level
fidelity (does the generated code actually round-trip a `name` field
correctly?) is exactly what the *fixture* tests (the round-trip ones, via
`test/fixtures/javascript/main.js`) are for — this unit test deliberately
stays one level up from that, checking only the export/converter plumbing
your `module-system` change touches.

(If you want to actually *see* where `"name"` lands in the generated
output, skip to the bottom of this file — there's a command you can run
yourself.)

## The two "find the export block" helpers

```typescript
function commonJSExportsBlock(source: string): string | undefined {
    return source.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/)?.[1];
}
```

Pseudocode:

```
FIND in source: literal text "module.exports = {"
    followed by (capture group) any characters, including newlines,
        as few as possible ("[\s\S]*?" = lazy/non-greedy)
    followed by literal text "};"
RETURN the captured group (the stuff between the braces), or undefined
       if there's no such block at all
```

The "as few as possible" (`*?` instead of `*`) matters: without it, if the
file had two `};`-terminated blocks later on, a greedy match could swallow
everything up to the *last* `};` in the whole file instead of stopping at
the first one that closes `module.exports`.

```typescript
function es6ExportsBlock(source: string): string | undefined {
    return source.match(/^export\s*\{([\s\S]*?)\};/m)?.[1];
}
```

Same idea, but for `export { ... };`, and anchored to the start of a line
(`^` with the `/m` multiline flag) rather than searchable anywhere. Why the
anchor here and not above? Because `export` is a word that could plausibly
appear indented, mid-sentence, inside a comment (`// see the export
above`), whereas `module.exports =` is unambiguous enough on its own not to
need it. Anchoring to line-start specifically targets the one place
`emitModuleExports()` actually writes this block: the top level of the
file, at zero indentation.

## Finding every converter function that got generated

```typescript
function definedConverters(source: string): string[] {
    return [
        ...source.matchAll(/^function (to[A-Z]\w*)\(json\)/gm),
        ...source.matchAll(/^function (\w+ToJson)\(value\)/gm),
    ].map((m) => m[1]);
}
```

Pseudocode:

```
FIND every line starting with "function to" + an uppercase letter
    + more word characters + "(json)"
    -> this matches "function toTopLevel(json)", "function toData123(json)", etc.
    -> it would NOT match "function to123abc(json)" (lowercase after "to")
       or "function total(json)" -- the [A-Z] right after "to" is doing
       real work, distinguishing a deserializer's name from an unrelated
       word that happens to start with "to"

FIND every line starting with "function " + word characters + "ToJson(value)"
    -> matches "function topLevelToJson(value)", "function data123ToJson(value)"

COMBINE both lists, keep only the captured name (drop "function"/"(json)"/etc)
RETURN that list of names, e.g. ["toTopLevel", "toData123",
                                  "topLevelToJson", "data123ToJson"]
```

For your `{ data123: { name: "quicktype" } }` sample specifically, with
`converters: all-objects`, this should find all four of those names — one
deserializer + one serializer, for each of the two object types quicktype
inferred. With the default `converters: top-level`, it should find only
`toTopLevel` and `topLevelToJson` — the `Data123` pair still exists as a
type, but no converter functions get generated for it at all in that mode
(different from the `all-objects` case, where the functions exist but
might not be *exported* — that distinction is exactly bug #1655, the one
the sibling test `javascript-all-objects-exports.test.ts` regression-tests
for).

## The four `test(...)` blocks, one at a time

**Test 1 — common-js default is unchanged**

```
RENDER with rendererOptions = { converters: "all-objects" }
        (module-system NOT mentioned -> defaults to "common-js")

converters = every function name found (should include "toData123")
exportsBlock = whatever's between module.exports = { ... };

CHECK: "toData123" is in converters               (sanity: all-objects still works)
CHECK: exportsBlock exists at all
CHECK: every name in converters also appears inside exportsBlock
       (i.e. nothing got generated but left out of the export list)

CHECK: the source does NOT contain a line starting with "export {"
       (this is the new-option-must-not-leak-es6-syntax check)
CHECK: the source DOES contain require("./file")
       (the usage comment still says require(), not import)
```

This test is really saying: "turn `all-objects` on, but leave
`module-system` at its default — prove the new option is invisible when
unused." It's the direct check for what you and I called "byte-identical
when unflagged," just scoped to this one converters mode.

**Test 2 — es6 emits `export { ... }` instead**

```
RENDER with rendererOptions = { converters: "all-objects",
                                 "module-system": "es6" }

converters = every function name found
exportsBlock = whatever's between export { ... };

CHECK: "toData123" and "data123ToJson" are both in converters
       (sanity: turning ON es6 doesn't turn OFF all-objects --
        the nested-object pair still gets *generated*)

CHECK: the source does NOT contain the literal text "module.exports"
       anywhere at all
CHECK: exportsBlock exists
CHECK: every name in converters also appears inside exportsBlock
       (this is the actual point of your whole change: the es6 branch
        of emitModuleExports() has to list every converter that got
        generated, for every converters mode, not just top-level ones)
```

**Test 3 — the usage comment**

```
RENDER with rendererOptions = { "module-system": "es6" }
        (converters left at its default: "top-level")

CHECK: source contains exactly: import * as Convert from "./file";
CHECK: source does NOT contain "require("
CHECK: source still contains: Convert.toTopLevel(json)
```

That last check is the one the comment in the real file explains at
length: it only passes *because* the import is a namespace import
(`import * as Convert`) rather than a named one. That was a deliberate
design choice from when we wrote `emitUsageImportComment()` — we changed
the `import`/`require` line but left `emitUsageComments()` (the part that
writes `Convert.toX(json)`) completely untouched, and namespace-import is
what makes that safe.

**Test 4 — sanity check that top-level mode still works at all**

```
RENDER with rendererOptions = { converters: "top-level" }
        (module-system left at its default too)

exportsBlock = whatever's between module.exports = { ... };

CHECK: exportsBlock contains "toTopLevel"
CHECK: exportsBlock does NOT contain "toData123"
```

This one doesn't even touch `module-system` — it's making sure that just
having the new option *exist* in the codebase didn't accidentally change
`converters`'s own default behavior for something unrelated.

## Where does "name" actually show up, concretely?

I can't run quicktype in my own sandbox (network's blocked to npm's
registry here), so I won't hand you a made-up transcript and call it
verified — but based on reading `JavaScriptRenderer.ts` directly, `"name"`
would land inside the runtime type-descriptor object the renderer builds
for `Data123` (the block `emitTypeMap()` writes, keyed by JSON property
name), something in the rough shape of:

```javascript
const typeMap = {
    "Data123": o([
        { json: "name", js: "name", typ: "" },
    ], false),
    ...
};
```

— i.e. `"name"` shows up as data *inside* a generated object literal, not
as part of any function name or export list, which is exactly why none of
this test's regexes ever look for it.

If you want the real, verified version of that instead of my sketch, this
is a good one to just run yourself — you already have a working build:

```bash
echo '{"data123":{"name":"quicktype"}}' > /tmp/data123.json
quicktype --lang javascript --src-lang json --converters all-objects \
    -o /tmp/data123.js /tmp/data123.json
cat /tmp/data123.js
```

That'll show you, in real generated output, exactly where `name` ends up
relative to `toData123`/`data123ToJson` and the export list — the ground
truth behind everything above.
