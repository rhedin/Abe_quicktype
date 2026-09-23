// Coverage for the `module-system` renderer option added to the JavaScript
// target. `common-js` (the default) is unchanged from before this option
// existed; `es6` swaps `module.exports = {...}` for a named `export {...}`
// list, and swaps the usage comment's `const Convert = require(...)` for
// `import * as Convert from ...`.
//
// Like javascript-all-objects-exports.test.ts (a regression test for a
// past bug in this same method, emitModuleExports()), a round-trip fixture
// cannot exercise the es6 branch: the fixture driver
// (test/fixtures/javascript/main.js) hardcodes `require()`, which cannot
// load `export {}` output. This test generates the module directly and
// inspects its source instead, the same way that one does. 
// (rmh) Claude wrote this test, and it is very, very good.  But frankly, 
// (rmh) it's too dense and too concise for me.  I couldn't follow it. 
// (rmh) I asked Clause to make a pseudocoded version, with explanations. 
// (rmh) I will include that file in the repository, but I am going to 
// (rmh) insert my own "boilings down" when I think it's useful. 
// (rmh) 
// (rmh) This test doesn't provide a JSON Schema.  It provides a JSON 
// (rmh) document, and asks Quicktype to infer the structure from it. 

import {
    InputData,
    jsonInputForTargetLanguage,
    quicktype,
} from "quicktype-core";
import { describe, expect, test } from "vitest";

// A schema with a nested object (`data123`) so `converters: all-objects`
// produces more than one converter pair -- enough to tell "the export list
// is right" apart from "the export list merely has one name in it".
const sample = JSON.stringify({ data123: { name: "quicktype" } });

// (rmh) Takes a sample document (always the same) and a set of options,  
// (rmh) either Es6 modules or Common JS modules, and either all objects
// (rmh) or just the top level of objects, sets things up according to 
// (rmh) Quicktype's rules, and then asks Quicktype for the corresponding 
// (rmh) Javascript file.  Returns one long string.  Different lines are 
// (rmh) separated by newlines. 
async function renderJavaScript(
    rendererOptions: Record<string, string>,
): Promise<string> {
    const jsonInput = jsonInputForTargetLanguage("js");
    await jsonInput.addSource({ name: "TopLevel", samples: [sample] });
    const inputData = new InputData();
    inputData.addInput(jsonInput);

    const result = await quicktype({
        inputData,
        lang: "js",
        rendererOptions: { "acronym-style": "pascal", ...rendererOptions },
    });
    return result.lines.join("\n");
}

// The `module.exports = { ... };` object literal at the bottom of the module.
// (rmh) Uses a regex to determine whether result file contains 
// (rmh) something like: 
// (rmh)    module.exports = {
// (rmh)        "personToJson": personToJson,
// (rmh)        "toPerson": toPerson,
// (rmh)    };
// (rmh) (This example is taken from a different case)
// (rmh) Returns either what's between the braces as a string, 
// (rmh) or undefined if there was no match. 
function commonJSExportsBlock(source: string): string | undefined {
    return source.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/)?.[1];
}

// The `export { ... };` named-export list at the bottom of the module.
// Anchored to the start of a line: emitModuleExports() runs at the top
// level (indent 0), so this is never a false match on indented text.
// (rmh) Uses a regex to determine whether result file contains 
// (rmh) something like: 
// (rmh)    export {
// (rmh)        personToJson,
// (rmh)        toPerson,
// (rmh)    };
function es6ExportsBlock(source: string): string | undefined {
    return source.match(/^export\s*\{([\s\S]*?)\};/m)?.[1];
}

// Every converter the module defines -- `function to<Name>(json)` and
// `function <name>ToJson(value)`. The module's helpers (cast, uncast,
// transform, ...) have different signatures and are intentionally not
// matched. (Copied from javascript-all-objects-exports.test.ts.)
// (rmh) Finds all occurrences of functions like these: 
// (rmh)    function toPerson(json) {
// (rmh)        return cast(JSON.parse(json), r("Person"));
// (rmh)    }
// (rmh)    function personToJson(value) {
// (rmh)        return JSON.stringify(uncast(value, r("Person")), null, 2);
// (rmh)    }
// (rmh) And returns just the function names in a list. 
// (rmh)    ["toPerson", "personToJson"]

function definedConverters(source: string): string[] {
    return [
        ...source.matchAll(/^function (to[A-Z]\w*)\(json\)/gm),
        ...source.matchAll(/^function (\w+ToJson)\(value\)/gm),
    ].map((m) => m[1]);
}

// (rmh) I was noticing that there were four tests, and they seem 
// (rmh) to form a 2x2 matrix.  Where the two dimensions are 
// (rmh) top-level or all-objects, and CommonJS modules or 
// (rmh) Es6 modules.  Claude confirmed this, and kindly made 
// (rmh) me a tidy matrix.  (Presto!  You're a tidy matrix!)
// (rmh)    +-----------+--------------+----------------+
// (rmh)    |           |  top-level   |  all-objects   |
// (rmh)    +-----------+--------------+----------------+
// (rmh)    | common-js |   Test 4     |    Test 1      |
// (rmh)    | es6       |   Test 3     |    Test 2      |
// (rmh)    +-----------+--------------+----------------+
// (rmh) Claude pointed out that test 3 didn't check the 
// (rmh) export block, but he said that was okay because 
// (rmh) we had tested that case manually.  Well, that's 
// (rmh) not really good enough.  What if we change the 
// (rmh) code, run the tests, and conclude "Well, we didn't 
// (rmh) break anything?"  But this test is already much 
// (rmh) better than anything I would have produced, and 
// (rmh) has consumed a lot of time, so I am deciding 
// (rmh) that it's good enough.  Here is Claude's matrix 
// (rmh) taking note of the non-uniformity among tests. 
// (rmh)    +-----------+--------------+----------------+
// (rmh)    |           |  top-level   |  all-objects   |
// (rmh)    +-----------+--------------+----------------+
// (rmh)    | common-js |   Test 4     |    Test 1      |
// (rmh)    |           | (checks the  |  (checks the   |
// (rmh)    |           |  export      |   export       |
// (rmh)    |           |  block)      |   block)       |
// (rmh)    +-----------+--------------+----------------+
// (rmh)    | es6       |   Test 3     |    Test 2      |
// (rmh)    |           | (checks the  |  (checks the   |
// (rmh)    |           |  usage       |   export       |
// (rmh)    |           |  comment,    |   block)       |
// (rmh)    |           |  NOT the     |                |
// (rmh)    |           |  export      |                |
// (rmh)    |           |  block)      |                |
// (rmh)    +-----------+--------------+----------------+
// (rmh) I hope that beyond that, the description in each test, 
// (rmh) and the collection of expect calls, will be enough to 
// (rmh) understand.  The javascript-module-system.WALKTHROUGH.md 
// (rmh) file, that I plan to put right beside this file 
// (rmh) in the repository, has more information / Claude's 
// (rmh) take on these tests. 
// (rmh) 
// (rmh) Claude said this. 
// (rmh)    If you ever do want to close it, it's small.  Add 
// (rmh)       const exportsBlock = es6ExportsBlock(source); 
// (rmh)       expect(exportsBlock).toContain("toTopLevel") 
// (rmh)       expect(exportsBlock).not.toContain("toData123") 
// (rmh)    to test 3, mirroring test 4.
describe("JavaScript module-system option", () => {
    test("common-js (the default) is unchanged: module.exports, require()", async () => {
        const source = await renderJavaScript({ converters: "all-objects" });
        const converters = definedConverters(source);
        const exportsBlock = commonJSExportsBlock(source);

        // Sanity, same as the pre-existing all-objects-exports test.
        expect(converters).toContain("toData123");
        expect(exportsBlock).toBeDefined();
        for (const name of converters) {
            expect(
                exportsBlock,
                `converter ${name} is defined but not in module.exports`,
            ).toContain(name);
        }

        // The new option must not change common-js output when it's left
        // at its default.
        expect(source).not.toMatch(/^export\s*\{/m);
        expect(source).toContain('require("./file")');
    });

    test("es6 emits a named export list instead of module.exports", async () => {
        const source = await renderJavaScript({
            converters: "all-objects",
            "module-system": "es6",
        });
        const converters = definedConverters(source);
        const exportsBlock = es6ExportsBlock(source);

        // Sanity: the module-system switch changes only *how* things are
        // exported, not *what* gets generated -- the nested-object
        // converter pair should still be there.
        expect(converters).toContain("toData123");
        expect(converters).toContain("data123ToJson");

        expect(source).not.toContain("module.exports");
        expect(exportsBlock).toBeDefined();
        for (const name of converters) {
            expect(
                exportsBlock,
                `converter ${name} is defined but not in the export list`,
            ).toContain(name);
        }
    });

    test("es6 usage comment imports the namespace instead of require()", async () => {
        const source = await renderJavaScript({ "module-system": "es6" });

        expect(source).toContain('import * as Convert from "./file";');
        expect(source).not.toContain("require(");
        // The per-type usage lines still read `Convert.toX(json)` --
        // that's only valid because the import above is a *namespace*
        // import (`import * as Convert`), not a named one. If a future
        // change switched this to a named import, this line would still
        // pass syntactically but the generated usage example would be
        // wrong; that's the whole reason this method deliberately keeps
        // emitUsageComments() untouched. See NOTES.md.
        expect(source).toContain("Convert.toTopLevel(json)");
    });

    test("common-js top-level mode is unaffected by the new option existing", async () => {
        const source = await renderJavaScript({ converters: "top-level" });
        const exportsBlock = commonJSExportsBlock(source);

        expect(exportsBlock).toContain("toTopLevel");
        expect(exportsBlock).not.toContain("toData123");
    });
});
