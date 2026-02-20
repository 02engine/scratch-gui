import _js from "./userscript.js";
import _css from "!css-loader!./userstyle.css";
import _vscodeIcon from "!url-loader!./icons/vscode.svg";

export const resources = {
  "userscript.js": _js,
  "userstyle.css": _css,
  "icons/vscode.svg": _vscodeIcon
};
