module.exports = function plainTextStubLoader() {
    this.cacheable && this.cacheable();
    return "module.exports = '/* Vite vendor stub: iframe extension source unavailable. */';";
};
