// Test-env-only Babel plugin: rewrite dynamic `import(x)` to
// `Promise.resolve(require(x))`.
//
// Our source uses dynamic import() purely to keep platform-specific native
// modules (expo-pdf-text-extract, expo-text-extractor) and the web-only
// pdfjs-dist build out of the *other* platform's bundle. Under Metro this is
// left as a real import() and code-split correctly. Under jest, however,
// import() reaches Node's ESM loader and throws "A dynamic import callback was
// invoked without --experimental-vm-modules". Tests always jest.mock() those
// modules, so a CommonJS require() resolves to the mock — this transform makes
// import() behave like require() in the test environment only (see
// babel.config.js, applied under env==='test').
module.exports = function dynamicImportToRequire({ template }) {
  const buildRequire = template.expression('Promise.resolve(require(SOURCE))')
  return {
    name: 'dynamic-import-to-require',
    visitor: {
      // `Import` is the callee node of an `import(...)` CallExpression.
      Import(path) {
        const call = path.parentPath
        const source = call.node.arguments[0]
        call.replaceWith(buildRequire({ SOURCE: source }))
      },
    },
  }
}
