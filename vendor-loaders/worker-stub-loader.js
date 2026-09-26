module.exports = function workerStubLoader() {
    this.cacheable && this.cacheable();
    return "module.exports = class ViteVendorExtensionWorker { constructor() { throw new Error('Sandboxed extension worker is not supported in the Vite vendor build.'); } };";
};
