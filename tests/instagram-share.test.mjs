import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const source = readFileSync(new URL("../app/captions/instagram-share.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

for (const mobile of [false, true]) {
  test(`Instagram opens Home and prepares the selected caption and JPG on ${mobile ? "mobile" : "desktop"}`, async () => {
    const copied = [], downloaded = [], shared = [], state = [];
    const file = new File(["jpeg"], "furframe-frame.jpg", { type: "image/jpeg" });
    const photo = { file, href: "/captions/frame/instagram-photo" };
    const caption = "Practicing my audition for Floor Decoration Number 5.";
    let hook = 0;
    let controls = [];
    function capture(type, props) {
      if (type === "a" || type === "button") controls.push({ type, ...props });
      return jsxRuntime.jsx(type, props);
    }
    const modules = {
      react: { useState(initial) {
        const index = hook++;
        state[index] ??= initial;
        return [state[index], (value) => { state[index] = value; }];
      } },
      "react/jsx-runtime": { ...jsxRuntime, jsx: capture, jsxs: capture },
      "./captions.module.css": { default: {} },
    };
    const exports = {};
    vm.runInNewContext(compiled, {
      exports, require: (name) => modules[name],
      navigator: {
        clipboard: { writeText: async (text) => copied.push(text) },
        canShare: ({ files }) => files[0] === file,
        share: async ({ files }) => shared.push(files[0]),
      },
      window: { matchMedia: () => ({ matches: mobile }), setTimeout() {} },
      URL: { createObjectURL: () => "blob:test-photo" },
      document: {
        createElement: () => ({ click() { downloaded.push(this.download); }, remove() {} }),
        body: { append() {} },
      },
    });

    function render() {
      hook = 0;
      controls = [];
      exports.InstagramShare({ photo, caption });
    }
    const home = "https://www.instagram.com/";
    render();
    assert.equal(controls.length, 1);
    assert.equal(controls[0].type, "a");
    assert.equal(controls[0].href, home);
    assert.equal(controls[0].target, "_blank");
    controls[0].onClick({ preventDefault() { assert.fail("Instagram navigation was cancelled"); } });
    await Promise.resolve();
    render();
    assert.deepEqual(copied, [caption]);
    assert.deepEqual(downloaded, [file.name]);
    assert.deepEqual(shared, []);
    assert.equal(controls.filter((c) => c.type === "a" && c.href === home && c.target === "_blank").length, 2);
    assert.ok(controls.some((c) => c.href === photo.href && c.download));
    const share = controls.find((c) => c.type === "button" && c.children === "Share photo");
    assert.equal(Boolean(share), mobile);
    if (mobile) {
      share.onClick();
      assert.deepEqual(shared, [file]);
    }
  });
}
