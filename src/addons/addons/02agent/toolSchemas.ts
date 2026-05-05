export const scratchToolSchemas = [
  {
    type: "function",
    function: {
      name: "listFiles",
      description: "List virtual Scratch project files, including writable stage/sprite JS files, writable SVG costume files, and read-only docs.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProjectOverview",
      description:
        "Get a compact overview of Scratch targets, stage size/runtime options, virtual file paths, scripts, costumes, variables, and lists. Prefer this before reading full files when orienting.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getScratchGuide",
      description:
        "Get a concise task-oriented Scratch JS DSL guide. Use this instead of reading long docs for common patterns.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Optional topic: quickstart, events, data, control, procedures, custom-args, rendering, menus, pen, patching, debugging. Defaults to quickstart.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBlocks",
      description:
        "Search Scratch blocks by opcode, Chinese/English keyword, or DSL term and return compact JS DSL examples, fields, inputs, menus, and notes.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keyword or opcode, such as pen color, broadcast, start_as_clone, data_replaceitemoflist.",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of matches. Defaults to 12.",
          },
          includeExamples: {
            type: "boolean",
            description: "Whether to include JS DSL examples. Defaults to true.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBlockHelp",
      description:
        "Get exact help for one Scratch opcode, dotted DSL call, or common alias (for example operator.less / pen.down), including JS syntax, fields, inputs, menus, substacks, and a ready-to-copy example.",
      parameters: {
        type: "object",
        properties: {
          opcode: {
            type: "string",
            description: "Opcode or dotted DSL call, for example control_start_as_clone or pen.setPenColorParamTo.",
          },
        },
        required: ["opcode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read a virtual Scratch file. Supports optional 1-based line ranges.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Virtual path such as /stage.js, /sprites/Cat.js, /sprites/Cat/costumes/1-costume.svg, or /docs/scratch-agent.md.",
          },
          startLine: {
            type: "number",
            description: "Optional 1-based start line.",
          },
          endLine: {
            type: "number",
            description: "Optional 1-based end line.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchFiles",
      description: "Search virtual Scratch JS files and read-only docs by keyword.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keyword or opcode to search for.",
          },
          path: {
            type: "string",
            description: "Optional virtual path to restrict the search.",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of matches. Defaults to 50.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "applyPatch",
      description:
        "Apply a Codex-style patch to writable virtual Scratch JS or SVG costume files. Supports standard +/- hunks and full replacement content after Update File. Successful script patches sync to Scratch blocks; successful costume patches update the costume asset. Invalid costume drafts are saved in 02Agent memory for follow-up fixes; invalid script drafts are discarded.",
      parameters: {
        type: "object",
        properties: {
          patch: {
            type: "string",
            description: "Patch text beginning with *** Begin Patch and containing one or more *** Update File hunks.",
          },
        },
        required: ["patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createSpriteWithSvg",
      description: "Create a new Scratch sprite target with one SVG costume asset. Use this only for brand new sprites; it refuses existing sprite names. Set intended default x/y/size/direction/rotationStyle here when known, and call updateSpriteProperties immediately afterward if the new sprite needs any default/current state adjustment. Use addCostumeWithSvg to add a costume to an existing sprite.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Sprite name." },
          costumeName: { type: "string", description: "Costume name. Defaults to costume1." },
          svg: { type: "string", description: "Complete SVG document for the costume." },
          x: { type: "number", description: "Initial x position. Defaults to 0." },
          y: { type: "number", description: "Initial y position. Defaults to 0." },
          size: { type: "number", description: "Initial size percentage. Defaults to 100." },
          direction: { type: "number", description: "Initial direction. Defaults to 90." },
          rotationStyle: { type: "string", description: "Scratch rotation style, for example all around, left-right, or don't rotate." },
          rotationCenterX: { type: "number", description: "SVG rotation center x in SVG canvas coordinates. Defaults to half SVG width; stage backdrops normally use 240 for a 480x360 canvas." },
          rotationCenterY: { type: "number", description: "SVG rotation center y in SVG canvas coordinates. Defaults to half SVG height; stage backdrops normally use 180 for a 480x360 canvas." },
        },
        required: ["svg"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listCostumes",
      description: "List ordered costumes/backdrops for one target or all targets, including their current order and which one is active.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional target name such as Cat or Stage." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateSpriteProperties",
      description: "Update an existing sprite target's initial/current editor state such as x/y, size, direction, rotation style, visibility, or current costume. Stage cannot move/resize/rotate.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional sprite name." },
          x: { type: "number", description: "Sprite x coordinate." },
          y: { type: "number", description: "Sprite y coordinate." },
          size: { type: "number", description: "Sprite size percentage." },
          direction: { type: "number", description: "Sprite direction in degrees." },
          rotationStyle: { type: "string", description: "Scratch rotation style: all around, left-right, or don't rotate." },
          visible: { type: "boolean", description: "Whether the sprite is visible." },
          currentCostumeIndex: { type: "number", description: "Zero-based costume/backdrop index to switch to." },
          currentCostumeName: { type: "string", description: "Costume/backdrop name to switch to." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addCostumeWithSvg",
      description: "Add a new SVG costume/backdrop to a specific existing target without creating a new sprite. Use this when the user wants another costume for an existing sprite/backdrop.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional target name such as Cat or Stage." },
          costumeName: { type: "string", description: "New costume/backdrop name." },
          svg: { type: "string", description: "Complete SVG document." },
          setAsCurrent: { type: "boolean", description: "Whether to switch to the new costume after adding it. Defaults to true." },
          insertIndex: { type: "number", description: "Optional target order index for the new costume." },
          rotationCenterX: { type: "number", description: "Optional SVG rotation center x in SVG canvas coordinates. Defaults to half SVG width; use 240 for full-stage 480x360 backdrops." },
          rotationCenterY: { type: "number", description: "Optional SVG rotation center y in SVG canvas coordinates. Defaults to half SVG height; use 180 for full-stage 480x360 backdrops." },
        },
        required: ["svg"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batchAddCostumesWithSvg",
      description: "Add multiple SVG costumes/backdrops to one existing target in order. Use this for bulk costume creation instead of repeated createSpriteWithSvg calls.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional target name such as Cat or Stage." },
          costumes: {
            type: "array",
            description: "Ordered SVG costumes/backdrops to add.",
            items: {
              type: "object",
              properties: {
                costumeName: { type: "string", description: "New costume/backdrop name." },
                svg: { type: "string", description: "Complete SVG document." },
                insertIndex: { type: "number", description: "Optional target order index for this costume." },
                rotationCenterX: { type: "number", description: "Optional SVG rotation center x in SVG canvas coordinates. Defaults to half SVG width." },
                rotationCenterY: { type: "number", description: "Optional SVG rotation center y in SVG canvas coordinates. Defaults to half SVG height." },
              },
              required: ["svg"],
            },
          },
          setAsCurrent: { type: "boolean", description: "Whether to switch to the last added costume. Defaults to true." },
        },
        required: ["costumes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteCostume",
      description: "Delete a specific costume/backdrop from a target by index or name.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional target name such as Cat or Stage." },
          costumeIndex: { type: "number", description: "Zero-based costume/backdrop index." },
          costumeName: { type: "string", description: "Costume/backdrop name." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batchDeleteCostumes",
      description: "Delete multiple costumes/backdrops from one target by zero-based indices and/or names. A target keeps at least one costume/backdrop.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional target name such as Cat or Stage." },
          costumeIndices: { type: "array", items: { type: "number" }, description: "Zero-based costume/backdrop indices to delete." },
          costumeNames: { type: "array", items: { type: "string" }, description: "Costume/backdrop names to delete." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reorderCostume",
      description: "Move a costume/backdrop to a new index within the target's ordered costume list.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional target name such as Cat or Stage." },
          costumeIndex: { type: "number", description: "Current zero-based costume/backdrop index." },
          costumeName: { type: "string", description: "Current costume/backdrop name." },
          newIndex: { type: "number", description: "New zero-based index to move the costume/backdrop to." },
        },
        required: ["newIndex"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setCostumeOrder",
      description: "Set the complete costume/backdrop order for a target in one call. Provide every costume exactly once by index or by name.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional target name such as Cat or Stage." },
          orderedCostumeIndices: { type: "array", items: { type: "number" }, description: "Full desired zero-based order, containing every current costume index exactly once." },
          orderedCostumeNames: { type: "array", items: { type: "string" }, description: "Full desired order by costume/backdrop names." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteSprite",
      description: "Delete a sprite target by ID or name. Cannot delete the stage.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional sprite name." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDiagnostics",
      description: "Validate current virtual Scratch JS and SVG costume files and report parser/block/SVG diagnostics.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Optional virtual path. If omitted, validates all virtual Scratch JS and SVG costume files.",
          },
        },
      },
    },
  },
];
