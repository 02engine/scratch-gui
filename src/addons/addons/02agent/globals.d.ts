// Type-only declarations for non-TS module imports used by this addon.
declare module "*.less";
declare module "*.css";
declare module "*.svg" {
    const content: string;
    export default content;
}