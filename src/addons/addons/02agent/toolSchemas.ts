export const scratchToolSchemas = [
  {
    type: "function",
    function: {
      name: "listFiles",
      description: "低风险。List virtual Scratch project files, including writable stage/sprite JS files, writable SVG costume files, and read-only docs.",
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
        "低风险。Get a compact overview of Scratch targets, stage size/runtime options, virtual file paths, scripts, costumes, variables, and lists. Prefer this before reading full files when orienting.",
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
        "低风险。Get a concise task-oriented Scratch JS DSL guide. Use this instead of reading long docs for common patterns.",
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
        "低风险。Search Scratch blocks by opcode, Chinese/English keyword, or DSL term and return compact JS DSL examples, fields, inputs, menus, and notes.",
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
        "低风险。Get exact help for one Scratch opcode, dotted DSL call, or common alias (for example operator.less / pen.down), including JS syntax, fields, inputs, menus, substacks, and a ready-to-copy example.",
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
      name: "searchExtensions",
      description:
        "低风险。Search built-in and known remote Scratch/TurboWarp/PenguinMod/Mist/SharkPool extensions by ID, name, keyword, source, or URL stem. Use before installing extension blocks that are not already loaded.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Extension name, ID, keyword, or URL stem, such as pen, music, files, JSON, or text." },
          source: { type: "string", description: "Optional source filter: scratch, 02engine, tw, pm, mist, sharkpool, special, external, or all." },
          scratchCompatibleOnly: { type: "boolean", description: "Only return extensions marked Scratch-compatible. Defaults to false." },
          includeBuiltin: { type: "boolean", description: "Include built-in Scratch/special extensions. Defaults to true." },
          includeRemote: { type: "boolean", description: "Include known remote extension galleries. Defaults to true." },
          includeSpecial: { type: "boolean", description: "Include special non-gallery features such as custom reporters. Defaults to true." },
          maxResults: { type: "number", description: "Maximum number of matches. Defaults to 20." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "installExtension",
      description:
        "高风险（会修改项目）。Install one built-in or known remote extension into the current Scratch VM, then return loaded extension blocks. External direct URLs require allowExternalUrl: true because remote extensions execute unsandboxed.",
      parameters: {
        type: "object",
        properties: {
          extensionId: { type: "string", description: "Known extension ID or name, such as pen, music, or an ID returned by searchExtensions." },
          extensionURL: { type: "string", description: "Known gallery extension URL, or direct URL only when allowExternalUrl is true." },
          query: { type: "string", description: "Search query used only when extensionId/extensionURL are not enough to resolve exactly one extension." },
          source: { type: "string", description: "Optional source filter: scratch, 02engine, tw, pm, mist, sharkpool, special, external, or all." },
          mode: { type: "string", description: "Install mode: auto, builtin, url, or text. Text fetches JS and loads a data URL. Defaults to auto." },
          allowExternalUrl: { type: "boolean", description: "Required to install arbitrary direct extensionURL values outside known registries." },
          forceRefresh: { type: "boolean", description: "Refresh remote extension registries before resolving." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: "低风险。Read a virtual Scratch file. Supports optional 1-based line ranges.",
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
      name: "readVariable",
      description: "低风险。Read one Scratch variable by target/name or variableId. For long string variables, optional startChar/endChar reads a slice.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID. Defaults to current editing target when omitted." },
          targetName: { type: "string", description: "Optional target name such as Stage or a sprite name." },
          variableId: { type: "string", description: "Variable ID from getProjectOverview." },
          name: { type: "string", description: "Variable name from getProjectOverview." },
          startChar: { type: "number", description: "Optional 0-based start character for string variables." },
          endChar: { type: "number", description: "Optional end character for string variables." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readListSlice",
      description: "低风险。Read a bounded slice of one Scratch list by target/name or variableId. Use this for large projects instead of expecting full list values in getProjectOverview.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID. Defaults to current editing target when omitted." },
          targetName: { type: "string", description: "Optional target name such as Stage or a sprite name." },
          variableId: { type: "string", description: "List variable ID from getProjectOverview." },
          name: { type: "string", description: "List name from getProjectOverview." },
          start: { type: "number", description: "0-based start index. Defaults to 0." },
          count: { type: "number", description: "Number of items to read. Capped by the tool to keep responses small." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchList",
      description: "低风险。Search a bounded window of one Scratch list for a string value and return matching indexes with previews.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID. Defaults to current editing target when omitted." },
          targetName: { type: "string", description: "Optional target name such as Stage or a sprite name." },
          variableId: { type: "string", description: "List variable ID from getProjectOverview." },
          name: { type: "string", description: "List name from getProjectOverview." },
          query: { type: "string", description: "Search text, such as NaN or a token." },
          start: { type: "number", description: "0-based index to start searching from. Defaults to 0." },
          limit: { type: "number", description: "Maximum matches. Defaults to 20 and is capped." },
          maxVisited: { type: "number", description: "Maximum items to scan from start. Defaults to the safe cap." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDataSummary",
      description: "低风险。Get compact variable/list summaries and first/last samples for selected targets or names without serializing full large lists.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string", description: "Optional target ID." },
          targetName: { type: "string", description: "Optional target name." },
          names: { type: "array", items: { type: "string" }, description: "Optional variable/list names to include." },
          sampleCount: { type: "number", description: "Number of first/last list items to sample. Capped by the tool." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchFiles",
      description: "低风险。Search virtual Scratch JS files and read-only docs by keyword.",
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
        "高风险（会修改项目）。Apply a Codex-style patch to writable virtual Scratch JS or SVG costume files. Supports standard +/- hunks and full replacement content after Update File. Successful script patches sync to Scratch blocks; successful costume patches update the costume asset. Invalid costume drafts are saved in 02Agent memory for follow-up fixes; invalid script drafts are discarded.",
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
      description: "高风险（会修改项目）。Create a new Scratch sprite target with one SVG costume asset. Use this only for brand new sprites; it refuses existing sprite names. Set intended default x/y/size/direction/rotationStyle here when known, and call updateSpriteProperties immediately afterward if the new sprite needs any default/current state adjustment. Use addCostumeWithSvg to add a costume to an existing sprite.",
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
      description: "低风险。List ordered costumes/backdrops for one target or all targets, including their current order and which one is active.",
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
      description: "高风险（会修改项目）。Update an existing sprite target's initial/current editor state such as x/y, size, direction, rotation style, visibility, or current costume. Stage cannot move/resize/rotate.",
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
      description: "高风险（会修改项目）。Add a new SVG costume/backdrop to a specific existing target without creating a new sprite. Use this when the user wants another costume for an existing sprite/backdrop.",
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
      description: "高风险（会修改项目）。Add multiple SVG costumes/backdrops to one existing target in order. Use this for bulk costume creation instead of repeated createSpriteWithSvg calls.",
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
      description: "高风险（会修改项目）。Delete a specific costume/backdrop from a target by index or name.",
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
      description: "高风险（会修改项目）。Delete multiple costumes/backdrops from one target by zero-based indices and/or names. A target keeps at least one costume/backdrop.",
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
      description: "高风险（会修改项目）。Move a costume/backdrop to a new index within the target's ordered costume list.",
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
      description: "高风险（会修改项目）。Set the complete costume/backdrop order for a target in one call. Provide every costume exactly once by index or by name.",
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
      description: "高风险（会修改项目）。Delete a sprite target by ID or name. Cannot delete the stage.",
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
      name: "runJavaScript",
      description:
        "低风险。Execute model-written JavaScript on the MAIN thread (not sandboxed). The code is the body of an async function: use await for nested tools via sdk.call(name, args) and return a JSON-serializable value. Full access to page globals (fetch, console, timers) and sdk.vm (the live Scratch VM). Use for computation, data transformation, or multi-step tool glue; project mutations still go through the existing validated tools. NOTE: arbitrary code execution with page privileges — only run trusted code. Returns a Promise.race timeout instead of hard termination.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "Async function body. Example: const text = await sdk.call(\"readFile\", { path: \"/stage.js\" }); return { length: text.length };",
          },
          timeoutMs: {
            type: "number",
            description: "Execution timeout in milliseconds. Defaults to 15000, max 60000.",
          },
          description: {
            type: "string",
            description: "Optional short note describing what the code computes.",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDiagnostics",
      description: "低风险。Validate current virtual Scratch JS and SVG costume files and report parser/block/SVG diagnostics.",
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
  {
    type: "function",
    function: {
      name: "sleep",
      description:
        "低风险。Wait for the given number of milliseconds (up to 120000) before continuing. Useful to introduce an intentional delay or pace multi-step work. Read-only; does not change the project.",
      parameters: {
        type: "object",
        properties: {
          ms: {
            type: "number",
            description: "Milliseconds to sleep (clamped to 0..120000).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "httpRequest",
      description:
        "中风险（外部影响，计划模式受限）。Perform an HTTP(S) request from the browser (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS). Returns status, response headers, and the body (auto-parsed as JSON when possible). CORS applies for cross-origin calls. Use for REST APIs or fetching remote data. Does not modify the Scratch project.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full request URL (required)." },
          method: { type: "string", description: "HTTP method, default GET.", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] },
          headers: { oneOf: [{ type: "object", additionalProperties: { type: "string" } }, { type: "string" }], description: "Request headers as an object or JSON string." },
          body: { oneOf: [{ type: "string" }, { type: "object" }], description: "Request body (string or object; objects are JSON-stringified)." },
          timeoutMs: { type: "number", description: "Timeout in ms (0..120000), default 20000." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manageMCPServers",
      description:
        "中风险（外部影响，计划模式受限）。Manage the user's own MCP server settings (设置 → MCP). action=view lists servers; add/update/delete/toggle mutate them. Always view/list first before mutating. Use this when the user asks to configure MCP servers. Does not modify the Scratch project.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "add", "update", "delete", "toggle"], description: "Operation to perform." },
          server: {
            type: "object",
            description: "Server fields, required for add/update (add needs name+url).",
            properties: {
              id: { type: "string", description: "Server id (for update/delete/toggle)." },
              name: { type: "string" },
              url: { type: "string" },
              transport: { type: "string", enum: ["http", "sse"] },
              apiKey: { type: "string" },
              customHeaders: { type: "string", description: "JSON text of extra headers." },
              enabled: { type: "boolean" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manageSkills",
      description:
        "中风险（外部影响，计划模式受限）。Manage the user's own skills (设置 → 技能) that are injected into the system prompt. action=view lists skills; add/update/delete/toggle mutate them. Always view/list first before mutating. Does not modify the Scratch project.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "add", "update", "delete", "toggle"], description: "Operation to perform." },
          skill: {
            type: "object",
            description: "Skill fields, required for add/update (add needs name).",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              content: { type: "string", description: "Markdown instructions injected into the system prompt." },
              enabled: { type: "boolean" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "observeStage",
      description:
        "低风险。读取舞台的实时结构化状态（各目标的 x/y/大小/方向/可见性/当前造型/说话气泡、运行线程数）。含可选 includeVariables 拉取前 8 个变量名及值摘要。这是验证改动是否生效的推荐方式之一。",
      parameters: {
        type: "object",
        properties: { includeVariables: { type: "boolean", description: "默认 false。" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runSubAgent",
      description:
        "后台启动一个子智能体运行（有自己的提示词、无工具、单轮对话），立即返回运行 id，不等待完成。适合拆分研究、审查、测试计划等并行工作；完成后会收到通知，并用 checkSubagentResults 查询总结。不要为等它而结束回合。中风险。",
      parameters: {
        type: "object",
        properties: {
          profile: { type: "string", description: "子智能体角色 id（设置→子智能体 里可自定义；内置: critic / tester / researcher）。默认 researcher。" },
          task: { type: "string", description: "交给子智能体的任务描述（自包含，附上必要上下文）。" },
          context: { type: "string", description: "可选补充上下文（如代码片段、需求摘录）。" },
        },
        required: ["task"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "checkSubagentResults",
      description:
        "低风险。查看后台子智能体运行结果（最近 10 条，completed 含 summary，error 含原因）。启动 runSubAgent 后的下一轮可用它获取结果。",
      parameters: { type: "object", properties: {} },
    },
  },  {
    type: "function",
    function: {
      name: "listSkills",
      description:
        "低风险。列出当前启用的技能（名称+描述）。技能全文不随系统提示词注入——需要遵循某条技能时先用本工具查看，再用 readSkill 读取全文。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "readSkill",
      description: "低风险。按名称（或 id）返回一条技能的完整指令内容，供你遵循执行。",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "技能名称（见 listSkills）。" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createSkill",
      description:
        "中风险（写入技能库，待人工审查）。把一个反复出现的流程/场景沉淀为可复用技能（指令文本），供未来会话使用。仅当同一场景重复出现两次以上且用户未反对时使用；写入后默认禁用，由用户在设置 → 技能 中审查启用。只写指令与选择标准，不写具体项目结论。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "要更新的既有技能 id；留空新建。" },
          name: { type: "string", description: "技能名称（简短、可搜索）。" },
          description: { type: "string", description: "何时使用这条技能（用于技能列表展示与匹配）。" },
          content: { type: "string", description: "技能全文指令（含步骤、边界、注意事项）。" },
        },
        required: ["name", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "discardDraft",
      description:
        "高风险（恢复操作，会同时改虚拟文本与积木）。把某个虚拟文件恢复到它上一次写入前保存的快照（写入来源包括 applyPatch 与造型写入）。先不带 path 调用可查看可用快照列表。一般失败恢复时使用；能用反向补丁保留历史时优先反向补丁。",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "虚拟文件路径（如 /stage.js、/sprites/<名字>.js）。" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateCostumeFromDescription",
      description:
        "中风险（新增造型）。用设置里配置的“生成图像模型”根据文字描述生成位图造型（透明背景提示词已内置），并挂为目标的新造型。未配置图像模型时返回明确指引。若生成结果不合意，可继续用 createSpriteWithSvg/addCostumeWithSvg 修改或删除。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "造型名称。" },
          description: { type: "string", description: "视觉描述（外观、颜色、姿态；不要写文字）。" },
          targetName: { type: "string", description: "目标精灵名（或 targetId）。" },
          targetId: { type: "string", description: "目标 id（二选一）。" },
          size: { type: "string", enum: ["256x256", "512x512", "1024x1024"], description: "默认 1024x1024。" },
        },
        required: ["name", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "startStageRecording",
      description:
        "低风险。开始录制舞台（WebM，默认 10fps）。需要“停止录像”指令场景或用户要求演示回放时使用；stopStageRecording 结束并取回链接。",
      parameters: {
        type: "object",
        properties: { fps: { type: "number", description: "1-30，默认 10。" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stopStageRecording",
      description:
        "低风险。结束舞台录像并返回本页面临时回放链接（blob URL，刷新前有效）。告知用户打开/下载链接；不要在对话里贴视频数据。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "askUser",
      description:
        "低风险。在缺少会改变方案的关键信息时，向用户提出一次（最多 6 个）简短问题并等待结构化回答。只在必要时使用；能自行合理假设时不要问。",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "单问题的快捷写法（与 questions 二选一）。" },
          questions: {
            type: "array",
            maxItems: 6,
            description: "按顺序向用户展示的问题列表。",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "可选的稳定问题 id。" },
                question: { type: "string", description: "简短的问题文本。" },
                questionType: { type: "string", enum: ["choice", "input", "multiChoice"], description: "choice 单选；multiChoice 多选（可勾多个）；input 文本输入。默认 input。" },
                options: { type: "array", items: { type: "string" }, description: "choice 类型时的可选项（2-8 个）。" },
              },
              required: ["question"],
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateTodoList",
      description:
        "低风险。把当前任务的待办清单整体替换为下方列表（会显示给用户，用于追踪多步任务进度）。每次有进展就更新状态：pending 待做 / in_progress 进行中 / completed 已完成 / cancelled 已取消。中风险（只改任务面板，不改项目）。",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "可选稳定 id；保持不变以便跨次更新追踪状态。" },
                title: { type: "string", description: "一句话任务描述。" },
                status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
              },
              required: ["title", "status"],
            },
          },
        },
        required: ["todos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listMemoryBlocks",
      description:
        "低风险。列出长期记忆或当前项目记忆（可用于回忆用户规则、项目约定、已确认的事实），支持按关键词过滤。",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["project", "longTerm"], description: "不填则两者都查。" },
          query: { type: "string", description: "关键词过滤。" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMemoryBlock",
      description: "低风险。按 id 返回一条记忆的原文。",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setMemoryBlock",
      description:
        "中风险（外部影响，计划模式受限）。写入/覆盖一条持久记忆：project 记录对当前项目的理解（如代码约定、数据结构），longTerm 记录用户长期偏好与规则（如『不要加 emoji』）。给已有 id 即更新。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "要更新的记忆 id；留空则新建。" },
          scope: { type: "string", enum: ["project", "longTerm"], description: "默认 project。" },
          title: { type: "string", description: "可选短标题。" },
          text: { type: "string", description: "记忆内容（精炼、包含关键细节）。" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replaceMemoryBlockText",
      description:
        "中风险（外部影响，计划模式受限）。对一条记忆做精确文本替换（只替换 find 的第一次出现），用于小修正而不整块重写。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          find: { type: "string", description: "要替换的原文（需与现有文本完整匹配）。" },
          replacement: { type: "string", description: "替换后的文本；留空表示删除该片段。" },
        },
        required: ["id", "find"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteMemoryBlock",
      description: "中风险（外部影响，计划模式受限）。删除一条不再成立的记忆。",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
];
