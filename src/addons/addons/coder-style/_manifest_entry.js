const manifest = {
  editorOnly: true,
  name: "Coder Style",
  description: "Ultra-minimalist block style: colored text only, no visible borders, parentheses style for inputs",
  credits: [
    {
      name: "02engine"
    }
  ],
  dynamicDisable: true,
  userscripts: [
    {
      url: "userscript.js"
    }
  ],
  userstyles: [
    {
      url: "coder-style.css"
    }
  ],
  settings: [
    {
      dynamic: true,
      name: "Block opacity",
      id: "block-opacity",
      type: "number",
      default: 0.02,
      min: 0.01,
      max: 0.1,
      step: 0.01
    },
    {
      dynamic: true,
      name: "C-shape block opacity",
      id: "c-shape-opacity",
      type: "number",
      default: 0.08,
      min: 0.01,
      max: 0.2,
      step: 0.01
    },
    {
      dynamic: true,
      name: "Boolean block opacity",
      id: "boolean-opacity",
      type: "number",
      default: 0.15,
      min: 0.05,
      max: 0.3,
      step: 0.01
    },
    {
      dynamic: true,
      name: "Input block opacity",
      id: "input-opacity",
      type: "number",
      default: 0.12,
      min: 0.05,
      max: 0.3,
      step: 0.01
    }
  ],
  tags: ["theme", "blocks"],
  enabledByDefault: false
};
export default manifest;