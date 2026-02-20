export default {
  "name": "Comment VSCode Sync",
  "description": "Sync comments with VSCode via 02Engine Toolbox Server. Click the VSCode icon on comment top bar to open in VSCode.",
  "credits": [{ "name": "02Engine", "link": "" }],
  "tags": ["editor", "comments"],
  "enabledByDefault": true,
  "userscripts": [
    {
      "url": "userscript.js",
      "matches": ["projects"]
    }
  ],
  "userstyles": [
    {
      "url": "userstyle.css",
      "matches": ["projects"]
    }
  ],
  "l10n": true
};
