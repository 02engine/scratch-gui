import * as acorn from 'acorn';

export let runtime = {};
export function setRuntime(rt) {
    runtime = rt;
}

let getBlockInfoTool = null;
export function setGetBlockInfoTool(fn) {
    getBlockInfoTool = typeof fn === "function" ? fn : null;
}

const AllBlockInfo = {
    "control_repeat": "重复执行 [TIMES] 次（TIMES：number）",
    "control_repeat_until": "重复执行直到 [CONDITION]（CONDITION：Boolean）",
    "control_while": "当 [CONDITION] 重复执行（CONDITION：Boolean）",
    "control_for_each": "对 [VARIABLE] 遍历 [VALUE]（VARIABLE：string, VALUE：string）",
    "control_forever": "重复执行",
    "control_wait": "等待 [DURATION] 秒（DURATION：number）",
    "control_wait_until": "等待直到 [CONDITION]（CONDITION：Boolean）",
    "control_if": "如果 [CONDITION] 那么（CONDITION：Boolean）",
    "control_if_else": "如果 [CONDITION] 那么 否则（CONDITION：Boolean）",
    "control_stop": "停止 [STOP_OPTION]（STOP_OPTION：string）",
    "control_create_clone_of": "克隆 [CLONE_OPTION]（CLONE_OPTION：string）",
    "control_delete_this_clone": "删除此克隆体",
    "control_get_counter": "计数器",
    "control_incr_counter": "计数器加 1",
    "control_clear_counter": "计数器归零",
    "control_all_at_once": "一口气执行",
    "event_whentouchingobject": "当碰到 [TOUCHINGOBJECTMENU]（TOUCHINGOBJECTMENU：string）",
    "event_broadcast": "广播 [BROADCAST_INPUT]（BROADCAST_INPUT：string）",
    "event_broadcastandwait": "广播 [BROADCAST_INPUT] 并等待（BROADCAST_INPUT：string）",
    "event_whengreaterthan": "当 [WHENGREATERTHANMENU] > [VALUE]（WHENGREATERTHANMENU：string, VALUE：number）",
    "looks_say": "说 [MESSAGE]（MESSAGE：string）",
    "looks_sayforsecs": "说 [MESSAGE] [SECS] 秒（MESSAGE：string, SECS：number）",
    "looks_think": "思考 [MESSAGE]（MESSAGE：string）",
    "looks_thinkforsecs": "思考 [MESSAGE] [SECS] 秒（MESSAGE：string, SECS：number）",
    "looks_show": "显示",
    "looks_hide": "隐藏",
    "looks_hideallsprites": "隐藏所有角色",
    "looks_switchcostumeto": "换成造型 [COSTUME]（COSTUME：string）",
    "looks_switchbackdropto": "换成背景 [BACKDROP]（BACKDROP：string）",
    "looks_switchbackdroptoandwait": "换成背景 [BACKDROP] 并等待（BACKDROP：string）",
    "looks_nextcostume": "下一个造型",
    "looks_nextbackdrop": "下一个背景",
    "looks_changeeffectby": "将 [EFFECT] 特效增加 [CHANGE]（EFFECT：string, CHANGE：number）",
    "looks_seteffectto": "将 [EFFECT] 特效设为 [VALUE]（EFFECT：string, VALUE：number）",
    "looks_cleargraphiceffects": "清除图形特效",
    "looks_changesizeby": "将大小增加 [CHANGE]（CHANGE：number）",
    "looks_setsizeto": "将大小设为 [SIZE]（SIZE：number）",
    "looks_changestretchby": "将伸缩增加 [CHANGE]（CHANGE：number）",
    "looks_setstretchto": "将伸缩设为 [STRETCH]（STRETCH：number）",
    "looks_gotofrontback": "移到最 [FRONT_BACK]（FRONT_BACK：string）",
    "looks_goforwardbackwardlayers": "向 [FORWARD_BACKWARD] 移动 [NUM] 层（FORWARD_BACKWARD：string, NUM：number）",
    "looks_size": "大小",
    "looks_costumenumbername": "造型 [NUMBER_NAME]（NUMBER_NAME：string）",
    "looks_backdropnumbername": "背景 [NUMBER_NAME]（NUMBER_NAME：string）",
    "motion_movesteps": "移动 [STEPS] 步（STEPS：number）",
    "motion_movegrids": "移动 [STEPS] 格（STEPS：number）",
    "motion_gotoxy": "移到 x:[X] y:[Y]（X：number, Y：number）",
    "motion_goto": "移到 [TO]（TO：string）",
    "motion_turnright": "右转 [DEGREES] 度（DEGREES：number）",
    "motion_turnleft": "左转 [DEGREES] 度（DEGREES：number）",
    "motion_pointindirection": "面向 [DIRECTION] 度（DIRECTION：number）",
    "motion_pointtowards": "面向 [TOWARDS]（TOWARDS：string）",
    "motion_glidesecstoxy": "在 [SECS] 秒内滑行到 x:[X] y:[Y]（SECS：number, X：number, Y：number）",
    "motion_glideto": "在 [SECS] 秒内滑行到 [TO]（SECS：number, TO：string）",
    "motion_ifonedgebounce": "碰到边缘就反弹",
    "motion_setrotationstyle": "将旋转方式设为 [STYLE]（STYLE：string）",
    "motion_changexby": "将 x 增加 [DX]（DX：number）",
    "motion_setx": "将 x 设为 [X]（X：number）",
    "motion_changeyby": "将 y 增加 [DY]（DY：number）",
    "motion_sety": "将 y 设为 [Y]（Y：number）",
    "motion_xposition": "x 坐标",
    "motion_yposition": "y 坐标",
    "motion_direction": "方向",
    "motion_scroll_right": "向右滚动 [DISTANCE]（DISTANCE：number）",
    "motion_scroll_up": "向上滚动 [DISTANCE]（DISTANCE：number）",
    "motion_align_scene": "对齐场景 [ALIGNMENT]（ALIGNMENT：string）",
    "motion_xscroll": "场景 x 滚动",
    "motion_yscroll": "场景 y 滚动",
    "operator_add": "[NUM1] + [NUM2]（NUM1：number, NUM2：number）",
    "operator_subtract": "[NUM1] - [NUM2]（NUM1：number, NUM2：number）",
    "operator_multiply": "[NUM1] * [NUM2]（NUM1：number, NUM2：number）",
    "operator_divide": "[NUM1] / [NUM2]（NUM1：number, NUM2：number）",
    "operator_lt": "[OPERAND1] < [OPERAND2]（OPERAND1：null, OPERAND2：null）",
    "operator_equals": "[OPERAND1] = [OPERAND2]（OPERAND1：null, OPERAND2：null）",
    "operator_gt": "[OPERAND1] > [OPERAND2]（OPERAND1：null, OPERAND2：null）",
    "operator_and": "[OPERAND1] 且 [OPERAND2]（OPERAND1：Boolean, OPERAND2：Boolean）",
    "operator_or": "[OPERAND1] 或 [OPERAND2]（OPERAND1：Boolean, OPERAND2：Boolean）",
    "operator_not": "不成立 [OPERAND]（OPERAND：Boolean）",
    "operator_random": "在 [FROM] 到 [TO] 之间取随机数（FROM：number, TO：number）",
    "operator_join": "连接 [STRING1] 和 [STRING2]（STRING1：string, STRING2：string）",
    "operator_letter_of": "[STRING] 的第 [LETTER] 个字符（STRING：string, LETTER：number）",
    "operator_length": "[STRING] 的长度（STRING：string）",
    "operator_contains": "[STRING1] 包含 [STRING2]？（STRING1：string, STRING2：string）",
    "operator_mod": "[NUM1] 除以 [NUM2] 的余数（NUM1：number, NUM2：number）",
    "operator_round": "四舍五入 [NUM]（NUM：number）",
    "operator_mathop": "[OPERATOR] [NUM]（OPERATOR：string, NUM：number）",
    "sound_play": "播放声音 [SOUND_MENU]（SOUND_MENU：string）",
    "sound_playuntildone": "播放声音 [SOUND_MENU] 等待播放完成（SOUND_MENU：string）",
    "sound_stopallsounds": "停止所有声音",
    "sound_seteffectto": "将 [EFFECT] 音效设为 [VALUE]（EFFECT：string, VALUE：number）",
    "sound_changeeffectby": "将 [EFFECT] 音效增加 [VALUE]（EFFECT：string, VALUE：number）",
    "sound_cleareffects": "清除音效",
    "sound_sounds_menu": "声音 [SOUND_MENU]（SOUND_MENU：string）",
    "sound_beats_menu": "节拍 [BEATS]（BEATS：number）",
    "sound_effects_menu": "音效 [EFFECT]（EFFECT：string）",
    "sound_setvolumeto": "将音量设为 [VOLUME]（VOLUME：number）",
    "sound_changevolumeby": "将音量增加 [VOLUME]（VOLUME：number）",
    "sound_volume": "音量",
    "sensing_touchingobject": "碰到 [TOUCHINGOBJECTMENU]？（TOUCHINGOBJECTMENU：string）",
    "sensing_touchingcolor": "碰到颜色 [COLOR]？（COLOR：string）",
    "sensing_coloristouchingcolor": "颜色 [COLOR] 碰到 [COLOR2]？（COLOR：string, COLOR2：string）",
    "sensing_distanceto": "到 [DISTANCETOMENU] 的距离（DISTANCETOMENU：string）",
    "sensing_timer": "计时器",
    "sensing_resettimer": "计时器归零",
    "sensing_of": "[OBJECT] 的 [PROPERTY]（OBJECT：string, PROPERTY：string）",
    "sensing_mousex": "鼠标 x",
    "sensing_mousey": "鼠标 y",
    "sensing_setdragmode": "将拖动方式设为 [DRAG_MODE]（DRAG_MODE：string）",
    "sensing_mousedown": "鼠标按下？",
    "sensing_keypressed": "按下 [KEY_OPTION] 键？（KEY_OPTION：string）",
    "sensing_current": "当前 [CURRENTMENU]（CURRENTMENU：string）",
    "sensing_dayssince2000": "距 2000 年的天数",
    "sensing_loudness": "响度",
    "sensing_loud": "响吗？",
    "sensing_askandwait": "询问 [QUESTION] 并等待（QUESTION：string）",
    "sensing_answer": "回答",
    "sensing_username": "用户名",
    "sensing_userid": "用户 id",
    "data_variable": "变量 [VARIABLE]（VARIABLE：variable）",
    "data_setvariableto": "将 [VARIABLE] 设为 [VALUE]（VARIABLE：variable, VALUE：string）",
    "data_changevariableby": "将 [VARIABLE] 增加 [VALUE]（VARIABLE：variable, VALUE：number）",
    "data_hidevariable": "隐藏变量 [VARIABLE]（VARIABLE：variable）",
    "data_showvariable": "显示变量 [VARIABLE]（VARIABLE：variable）",
    "data_listcontents": "列表 [LIST]（LIST：list）",
    "data_addtolist": "将 [ITEM] 加入列表 [LIST]（ITEM：string, LIST：list）",
    "data_deleteoflist": "删除列表 [LIST] 的第 [INDEX] 项（LIST：list, INDEX：string）",
    "data_deletealloflist": "删除列表 [LIST] 的全部项目（LIST：list）",
    "data_insertatlist": "在列表 [LIST] 的第 [INDEX] 项前插入 [ITEM]（LIST：list, INDEX：string, ITEM：string）",
    "data_replaceitemoflist": "将列表 [LIST] 的第 [INDEX] 项替换为 [ITEM]（LIST：list, INDEX：string, ITEM：string）",
    "data_itemoflist": "列表 [LIST] 的第 [INDEX] 项（LIST：list, INDEX：string）",
    "data_itemnumoflist": "[ITEM] 在列表 [LIST] 中的编号（ITEM：string, LIST：list）",
    "data_lengthoflist": "列表 [LIST] 的长度（LIST：list）",
    "data_listcontainsitem": "列表 [LIST] 包含 [ITEM]？（LIST：list, ITEM：string）",
    "data_hidelist": "隐藏列表 [LIST]（LIST：list）",
    "data_showlist": "显示列表 [LIST]（LIST：list）",
    "procedures_definition": "自定义积木定义",
    "procedures_call": "调用自定义积木 [PROCEDURE]（PROCEDURE：string）",
    "procedures_call_with_return": "调用自定义积木 [PROCEDURE] 并返回（PROCEDURE：string）",
};

function getBlockInfo(opcode, rt) {
    const activeRuntime = rt || runtime;

    if (typeof getBlockInfoTool === "function") {
        return getBlockInfoTool(opcode, activeRuntime);
    }

    // Fallback before tool resolver is registered.
    const result = {
        opcode: opcode,
        found: false,
        type: null,
        blockType: null,
        fields: {},
        inputs: {},
        substacks: [],
        text: null,
        extensionId: null,
    };
    if (activeRuntime && activeRuntime._primitives && activeRuntime._primitives[opcode]) {
        result.found = true;
    }
    if (AllBlockInfo[opcode]) {
        result.found = true;
        result.blockType = "command";
        result.text = AllBlockInfo[opcode];
    }
    result.type = result.found ? (result.blockType || "command") : null;
    return result;
}
export function callGetBlockInfo(opcode, rt) {
    return getBlockInfo(opcode, rt);
}

function getExpectedShadowType(opcode, inputName, rt) {
    const menuInfo = getExpectedShadowInfo(opcode, inputName, rt);
    if (menuInfo) return menuInfo.opcode;
    const info = getBlockInfo(opcode, rt);
    const argInfo = info?.inputs?.[inputName] || info?.fields?.[inputName];
    if (!info.found || !argInfo) return 'text';

    const t = String(argInfo.type).toLowerCase();
    if (t === 'number' || t === 'n') return 'math_number';
    if (t === 'boolean' || t === 'b' || t === 'bool') return null;
    return 'text';
}

function getExpectedShadowInfo(opcode, inputName, rt) {
    const info = getBlockInfo(opcode, rt);
    if (inputName === 'BROADCAST_INPUT' && (opcode === 'event_broadcast' || opcode === 'event_broadcastandwait')) {
        return { opcode: 'event_broadcast_menu', fieldName: 'BROADCAST_OPTION' };
    }
    const argInfo = info?.inputs?.[inputName] || info?.fields?.[inputName];
    if (argInfo && argInfo.menu) {
        const activeRuntime = rt || runtime;
        const namespace = String(opcode).includes('_') ? String(opcode).split('_')[0] : '';
        const lowerInput = String(inputName || '').toLowerCase();
        const lowerInputNoUnderscore = lowerInput.replace(/_/g, '');
        const lowerMenu = String(argInfo.menu || '').toLowerCase();
        const lowerMenuNoUnderscore = lowerMenu.replace(/_/g, '');
        const optionBase = lowerInput.endsWith('_option') ? lowerInput.slice(0, -'_option'.length) : null;
        const menuBase = lowerMenu.endsWith('_menu') ? lowerMenu.slice(0, -'_menu'.length) : null;
        const candidates = [
            `${opcode}_menu`,
            namespace ? `${namespace}_menu_${argInfo.menu}` : '',
            `${argInfo.menu}_menu`,
            argInfo.menu,
            namespace ? `${namespace}_${lowerInput}` : '',
            namespace ? `${namespace}_${lowerInputNoUnderscore}` : '',
            namespace && optionBase ? `${namespace}_${optionBase}options` : '',
            namespace && menuBase ? `${namespace}_${menuBase}menu` : '',
            namespace && menuBase ? `${namespace}_${menuBase.replace(/_/g, '')}menu` : '',
            namespace && lowerMenu ? `${namespace}_${lowerMenu}` : '',
            namespace && lowerMenuNoUnderscore ? `${namespace}_${lowerMenuNoUnderscore}` : ''
        ].filter(Boolean);
        const candidate = candidates.find(item => Boolean(
            (activeRuntime && activeRuntime._primitives && activeRuntime._primitives[item]) ||
            (activeRuntime && activeRuntime.scratchBlocks && activeRuntime.scratchBlocks.Blocks && activeRuntime.scratchBlocks.Blocks[item]) ||
            (typeof window !== 'undefined' && window.ScratchBlocks && window.ScratchBlocks.Blocks && window.ScratchBlocks.Blocks[item])
        ));
        if (candidate) {
            return {
                opcode: candidate,
                fieldName: getMenuShadowFieldName(candidate, inputName, argInfo.menu)
            };
        }
    }
    return null;
}

function getMenuShadowFieldName(menuOpcode, inputName, menuName) {
    if (menuOpcode === 'event_broadcast_menu') return 'BROADCAST_OPTION';
    if (menuOpcode === 'pen_menu_colorParam') return 'colorParam';
    return inputName || menuName;
}

function isEventHatOpcode(opcode) {
    const normalized = String(opcode || '');
    return /^event_when/.test(normalized) || normalized === 'control_start_as_clone';
}

function normalizeDslArgKey(opcode, key) {
    const normalizedOpcode = String(opcode || '');
    const normalizedKey = String(key || '');
    const aliases = {
        operator_add: { OPERAND1: 'NUM1', OPERAND2: 'NUM2', VALUE1: 'NUM1', VALUE2: 'NUM2' },
        operator_subtract: { OPERAND1: 'NUM1', OPERAND2: 'NUM2', VALUE1: 'NUM1', VALUE2: 'NUM2' },
        operator_multiply: { OPERAND1: 'NUM1', OPERAND2: 'NUM2', VALUE1: 'NUM1', VALUE2: 'NUM2' },
        operator_divide: { OPERAND1: 'NUM1', OPERAND2: 'NUM2', VALUE1: 'NUM1', VALUE2: 'NUM2' },
        operator_mod: { OPERAND1: 'NUM1', OPERAND2: 'NUM2', VALUE1: 'NUM1', VALUE2: 'NUM2' },
        operator_gt: { NUM1: 'OPERAND1', NUM2: 'OPERAND2', VALUE1: 'OPERAND1', VALUE2: 'OPERAND2' },
        operator_lt: { NUM1: 'OPERAND1', NUM2: 'OPERAND2', VALUE1: 'OPERAND1', VALUE2: 'OPERAND2' },
        operator_equals: { NUM1: 'OPERAND1', NUM2: 'OPERAND2', VALUE1: 'OPERAND1', VALUE2: 'OPERAND2' },
        operator_and: { CONDITION1: 'OPERAND1', CONDITION2: 'OPERAND2' },
        operator_or: { CONDITION1: 'OPERAND1', CONDITION2: 'OPERAND2' },
    };
    return aliases[normalizedOpcode]?.[normalizedKey] || normalizedKey;
}

// Generate a random Scratch-like ID
function generateId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = '';
    for (let i = 0; i < 20; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

/**
 * Stage A: JSON -> JS Code
 */
export function jsonToJs(jsonArray) {
    const options = arguments.length > 1 && arguments[1] && typeof arguments[1] === 'object' ? arguments[1] : {};
    const includeShadows = options.includeShadows === true;
    const includeBlockIds = options.includeBlockIds === true;
    const includePosition = options.includePosition === true;
    const commentsByBlockId = options.commentsByBlockId || {};
    const blocks = {};
    jsonArray.forEach(b => blocks[b.id] = b);

    let jsCode = '';
    function getCommentTextForBlock(block) {
        const direct = block && typeof block.commentText === 'string' ? block.commentText : null;
        const fromMap = block && commentsByBlockId ? commentsByBlockId[block.id] : null;
        const text = direct !== null
            ? direct
            : (typeof fromMap === 'string' ? fromMap : (fromMap && typeof fromMap.text === 'string' ? fromMap.text : null));
        return typeof text === 'string' && text.trim() ? text : '';
    }
    function renderLeadingComment(text, indent) {
        return String(text)
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map(line => `${indent}// ${line}`)
            .join('\n') + '\n';
    }
    function safeGetBlockInfoForJsonToJs(opcode) {
        try {
            return callGetBlockInfo(opcode, runtime);
        } catch {
            return { opcode, found: false, fields: {}, inputs: {}, substacks: [], extensionId: null };
        }
    }
    function resolveVariableFieldValueForJs(fieldKey, fieldObj) {
        if (!fieldObj || !fieldObj.id) return fieldObj ? fieldObj.value : undefined;
        const inferredType =
            typeof fieldObj.variableType === 'string'
                ? fieldObj.variableType
                : (fieldKey === 'LIST' || fieldKey === 'LIST_MENU' ? 'list' : (fieldKey === 'VARIABLE' ? '' : null));
        if (inferredType === null) return fieldObj.value;

        const targets = Array.isArray(runtime?.targets) ? runtime.targets : [];
        for (const target of targets) {
            const variables = target?.variables || {};
            const direct = variables[fieldObj.id];
            if (direct && (direct.type || '') === inferredType && typeof direct.name === 'string') {
                return direct.name;
            }
            const matched = Object.values(variables).find(variable =>
                variable && variable.id === fieldObj.id && (variable.type || '') === inferredType && typeof variable.name === 'string'
            );
            if (matched) {
                return matched.name;
            }
        }
        return fieldObj.value;
    }
    function escapeProccodeForDefine(s) {
        return String(s)
            .replace(/\//g, '//')
            .replace(/\[/g, '/[')
            .replace(/\]/g, '/]');
    }

    function buildDefineCompactProccode(proccode, argumentNames) {
        const names = Array.isArray(argumentNames) ? argumentNames : [];
        let nameIdx = 0;
        let out = '';
        for (let i = 0; i < String(proccode).length; ) {
            const ch = proccode[i];
            if (ch === '%' && i + 1 < proccode.length) {
                const t = proccode[i + 1];
                if (t === 's' || t === 'n' || t === 'b') {
                    const name = names[nameIdx++];
                    out += '%' + t;
                    if (name !== undefined) {
                        out += '[' + escapeProccodeForDefine(name) + ']';
                    }
                    i += 2;
                    continue;
                }
            }
            out += escapeProccodeForDefine(ch);
            i += 1;
        }
        return out;
    }

    function parseStack(startId, indent = '') {
        let code = '';
        let currentId = startId;
        while (currentId) {
            const block = blocks[currentId];
            if (!block) break;

            const commentText = getCommentTextForBlock(block);
            if (commentText) {
                code += renderLeadingComment(commentText, indent);
            }

            if (isEventHatOpcode(block.opcode) || block.opcode === 'procedures_definition') {
                // Wrap the rest of the stack inside the event's callback
                const nextId = block.next;
                const innerCode = nextId ? parseStack(nextId, indent + '    ') : '';
                if (block.opcode === 'procedures_definition') {
                    const blockCode = parseBlock(block, indent, true);
                    code += indent + blockCode.substring(0, blockCode.length - 1) + `, () => {\n${innerCode}${indent}})${includeBlockIds ? ` // blockId: ${block.id}` : ''};\n`;
                } else {
                    const blockCode = parseBlock(block, indent);
                    if (blockCode.endsWith('()')) {
                        code += indent + blockCode.substring(0, blockCode.length - 1) + `() => {\n${innerCode}${indent}})${includeBlockIds ? ` // blockId: ${block.id}` : ''};\n`;
                    } else {
                        code += indent + blockCode.substring(0, blockCode.length - 1) + `, () => {\n${innerCode}${indent}})${includeBlockIds ? ` // blockId: ${block.id}` : ''};\n`;
                    }
                }
                break; // Stop iterating this stack level because the rest is inside the callback
            } else {
                code += indent + parseBlock(block, indent) + `${includeBlockIds ? ` // blockId: ${block.id}` : ''};\n`;
            }
            currentId = block.next;
        }
        return code;
    }

    function parseBlock(block, indent, isEvent = false) {
        // Handle shadow/primitive blocks inline
        if (block.opcode === 'math_number') {
            const v = block.fields && block.fields.NUM ? block.fields.NUM.value : '';
            return (v !== undefined && v !== null && String(v).length > 0) ? String(v) : 0;
        }
        if (block.opcode === 'text') {
            return JSON.stringify(block.fields && block.fields.TEXT ? block.fields.TEXT.value : '');
        }

        // Special simplified syntax for custom block definitions
        if (block.opcode === 'procedures_definition' && block.inputs.custom_block && block.inputs.custom_block.block) {
            const protoBlock = blocks[block.inputs.custom_block.block];
            if (protoBlock && protoBlock.opcode === 'procedures_prototype') {
                const m = protoBlock.mutation || {};
                let argNames = [];
                if (m.argumentnames && m.argumentnames !== "[]") {
                    try { argNames = JSON.parse(m.argumentnames); } catch (e) {}
                }
                const compactProccode = buildDefineCompactProccode(m.proccode || "", argNames);
                const simplified = { proccode: compactProccode };

                const info = [];
                if (m.warp === "true") info.push("warp");
                if (m.isglobal === "true") info.push("global");
                if (m.isreporter === "true") info.push("reporter");
                if (info.length) simplified.info = info;

                // The callback content (SUBSTACK equivalent for events) is handled by parseStack because it's a topLevel event wrapper
                return `define(${JSON.stringify(simplified)})`;
            }
        }

        let namespace = 'unknown';
        let method = block.opcode;
        if (block.opcode.includes('_')) {
            const idx = block.opcode.indexOf('_');
            namespace = block.opcode.substring(0, idx);
            method = block.opcode.substring(idx + 1);
        }

        // Replace any dots in namespace or method with a safe character ($) to form valid JS identifiers
        // Also replace hyphens (-) which are not valid JS identifiers
        namespace = namespace.replace(/\./g, '$dot$').replace(/-/g, '$dash$');
        method = method.replace(/\./g, '$dot$').replace(/-/g, '$dash$');

        const args = [];

        // 1. Fields
        for (const [key, fieldObj] of Object.entries(block.fields || {})) {
            const valStr = JSON.stringify(resolveVariableFieldValueForJs(key, fieldObj));
            const finalKey = `$field_${key}`;
            if (/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(finalKey)) {
                args.push(`${finalKey}: ${valStr}`);
            } else {
                args.push(`"${finalKey}": ${valStr}`);
            }
        }

        // 2. Mutation
        let customBlockArgIds = [];
        if (block.mutation) {
            const m = block.mutation;
            // Filter out default values to simplify
            const simplified = { proccode: m.proccode };
            // DO NOT export argumentids to JS, but keep them for reference when parsing inputs
            if (m.argumentids && m.argumentids !== "[]") {
                try {
                    customBlockArgIds = JSON.parse(m.argumentids);
                } catch (e) {}
            }
            if (m.argumentnames && m.argumentnames !== "[]") {
                try {
                    simplified.argumentnames = JSON.parse(m.argumentnames);
                } catch (e) {
                    simplified.argumentnames = m.argumentnames;
                }
            }
            if (m.argumentdefaults && m.argumentdefaults !== "[]") {
                try {
                    simplified.argumentdefaults = JSON.parse(m.argumentdefaults);
                } catch (e) {
                    simplified.argumentdefaults = m.argumentdefaults;
                }
            }
            if (m.warp && m.warp !== "false") simplified.warp = m.warp;
            if (m.isreporter && m.isreporter !== "false") simplified.isreporter = m.isreporter;
            if (m.isglobal && m.isglobal !== "false") simplified.isglobal = m.isglobal;
            if (m.type) simplified.type = m.type;

            args.push(`$mutation: ${JSON.stringify(simplified)}`);
        }

        // 3. TopLevel Coordinates (x, y)
        if (includePosition && block.topLevel && (block.x !== undefined || block.y !== undefined)) {
            const coords = {};
            if (block.x !== undefined) coords.x = block.x;
            if (block.y !== undefined) coords.y = block.y;
            args.push(`$xy: ${JSON.stringify(coords)}`);
        }

        // 4. Inputs
        const inputArgs = [];
        const customArgs = []; // Array for procedures_call positional arguments
        const bInfo = safeGetBlockInfoForJsonToJs(block.opcode);

        for (const [key, inputObj] of Object.entries(block.inputs || {})) {
            if (!inputObj.block) continue;

            // Substack (C-blocks) -> arrow function
            if (key.startsWith('SUBSTACK')) {
                const innerCode = parseStack(inputObj.block, indent + '    ');
                inputArgs.push(`${key}: () => {\n${innerCode}${indent}}`);
            } else {
                const innerBlock = blocks[inputObj.block];
                if (innerBlock) {
                    const fieldSpec = bInfo ? ((bInfo.fields && bInfo.fields[key]) || (bInfo.inputs && bInfo.inputs[key])) : null;
                    const menuType = fieldSpec && fieldSpec.menuType ? String(fieldSpec.menuType) : null;
                    const hasAnyRealInput = innerBlock.inputs && Object.values(innerBlock.inputs).some(v => v && v.block);
                    const menuField = innerBlock.fields && (innerBlock.fields[key] || Object.values(innerBlock.fields)[0]);
                    const looksLikeMenu =
                        innerBlock.shadow === true &&
                        innerBlock.fields &&
                        menuField &&
                        !hasAnyRealInput &&
                        (String(innerBlock.opcode).endsWith('_menu') || String(innerBlock.opcode).includes('menu') || String(innerBlock.opcode).endsWith('options'));
                    const shouldCompressToField = fieldSpec && (fieldSpec.menu || menuType === 'placeable') && looksLikeMenu;
                    if (shouldCompressToField) {
                        const valStr = JSON.stringify(menuField.value);
                        const finalKey = key === 'BROADCAST_INPUT' ? key : `$field_${key}`;
                        if (/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(finalKey)) {
                            inputArgs.push(`${finalKey}: ${valStr}`);
                        } else {
                            inputArgs.push(`"${finalKey}": ${valStr}`);
                        }
                        continue;
                    }
                    const val = parseBlock(innerBlock, indent);

                    // Check if this input is actually a custom block argument
                    const argIndex = customBlockArgIds.indexOf(key);
                    if (argIndex !== -1) {
                        customArgs[argIndex] = val;
                    } else {
                        // Regular input
                        if (/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(key)) {
                            inputArgs.push(`${key}: ${val}`);
                        } else {
                            inputArgs.push(`"${key}": ${val}`);
                        }
                        if (includeShadows && inputObj.shadow && inputObj.shadow !== inputObj.block) {
                            const shadowBlock = blocks[inputObj.shadow];
                            if (shadowBlock) {
                                const shadowVal = parseBlock(shadowBlock, indent);
                                const shadowKey = `$shadow_${key}`;
                                if (/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(shadowKey)) {
                                    inputArgs.push(`${shadowKey}: ${shadowVal}`);
                                } else {
                                    inputArgs.push(`"${shadowKey}": ${shadowVal}`);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Add custom block positional arguments as an array if they exist
        if (customArgs.length > 0) {
            // Fill empty slots with null just in case
            for (let i = 0; i < customArgs.length; i++) {
                if (customArgs[i] === undefined) customArgs[i] = "null";
            }
            inputArgs.push(`$args: [${customArgs.join(', ')}]`);
        }

        args.push(...inputArgs);

        // Object formatting
        let argStr = '';
        if (args.length > 0) {
            argStr = `{ ${args.join(', ')} }`;
        }

        return isEvent ? `${namespace}.${method}` : `${namespace}.${method}(${argStr})`;
    }

    const topLevels = jsonArray.filter(b => b.topLevel);
    for (const top of topLevels) {
        jsCode += parseStack(top.id, '') + '\n';
    }

    return jsCode.trim();
}

/**
 * Stage B: JS Code -> JSON
 */
export function jsToJson(jsCode) {
    const options = arguments.length > 1 && arguments[1] && typeof arguments[1] === 'object' ? arguments[1] : {};
    const activeRuntime = options.runtime || runtime;
    const parsedComments = [];
    const ast = acorn.parse(jsCode, { ecmaVersion: 2020, locations: true, onComment: parsedComments });
    const blocks = [];
    let topLevelIndex = 0;
    const procArgIdsByProccode = new Map();
    const procArgTypesByProccode = new Map();
    const scratchIdChars = '!#%()*+,-./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~';
    const fieldIdByTypeAndName = new Map();

    function decodeIdFromJs(b64url) {
        if (typeof b64url !== 'string') return null;
        let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4;
        if (pad) b64 += '='.repeat(4 - pad);
        try {
            if (typeof atob === 'function') {
                const binary = atob(b64);
                const bytes = Array.from(binary, ch => ch.charCodeAt(0));
                if (typeof TextDecoder === 'function') {
                    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
                }
                return decodeURIComponent(bytes.map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''));
            }
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(b64, 'base64').toString('utf-8');
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function stableScratchId(seedString) {
        const text = String(seedString);
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            h ^= code & 0xff;
            h = Math.imul(h, 0x01000193) >>> 0;
            h ^= (code >>> 8) & 0xff;
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        let x = h || 1;
        let out = '';
        for (let i = 0; i < 20; i++) {
            x ^= (x << 13) >>> 0;
            x ^= (x >>> 17);
            x ^= (x << 5) >>> 0;
            x = x >>> 0;
            out += scratchIdChars.charAt(x % scratchIdChars.length);
        }
        return out;
    }

    function randomScratchId() {
        let out = '';
        for (let i = 0; i < 20; i++) {
            out += scratchIdChars.charAt(Math.floor(Math.random() * scratchIdChars.length));
        }
        return out;
    }

    function randomFieldId(variableType, name) {
        const prefix = variableType === 'list'
            ? 'list'
            : (variableType === 'broadcast_msg' ? 'broadcast' : 'var');
        const key = prefix + ':' + String(name);
        const existing = fieldIdByTypeAndName.get(key);
        if (existing) return existing;
        const id = stableScratchId(key);
        fieldIdByTypeAndName.set(key, id);
        return id;
    }

    function unescapeDefineProccode(s) {
        const str = String(s);
        let out = '';
        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (ch === '/' && i + 1 < str.length) {
                const n = str[i + 1];
                if (n === '/' || n === '[' || n === ']') {
                    out += n;
                    i += 1;
                    continue;
                }
            }
            out += ch;
        }
        return out;
    }

    function parseDefineCompactProccode(s) {
        const src = String(s);
        const proccodeOut = [];
        const argNames = [];
        const argTypes = [];
        for (let i = 0; i < src.length; ) {
            const ch = src[i];
            if (ch === '/' && i + 1 < src.length) {
                const n = src[i + 1];
                if (n === '/' || n === '[' || n === ']') {
                    proccodeOut.push(n);
                    i += 2;
                    continue;
                }
            }
            if (ch === '%' && i + 1 < src.length) {
                const t = src[i + 1];
                if (t === 's' || t === 'n' || t === 'b') {
                    proccodeOut.push('%' + t);
                    argTypes.push(t);
                    i += 2;
                    if (i < src.length && src[i] === '[') {
                        i += 1;
                        let nameRaw = '';
                        while (i < src.length) {
                            const c = src[i];
                            if (c === '/' && i + 1 < src.length) {
                                const nn = src[i + 1];
                                if (nn === '/' || nn === '[' || nn === ']') {
                                    nameRaw += nn;
                                    i += 2;
                                    continue;
                                }
                            }
                            if (c === ']') {
                                i += 1;
                                break;
                            }
                            nameRaw += c;
                            i += 1;
                        }
                        argNames.push(nameRaw);
                    } else {
                        argNames.push(undefined);
                    }
                    continue;
                }
            }
            proccodeOut.push(ch);
            i += 1;
        }
        return {
            proccode: proccodeOut.join(''),
            argNames,
            argTypes
        };
    }

    function defaultForArgType(t) {
        if (t === 'b') return false;
        if (t === 'n') return 0;
        return "";
    }

    function ensureProcArgIds(proccode, count) {
        if (!proccode || typeof proccode !== 'string') return null;
        const existing = procArgIdsByProccode.get(proccode);
        if (existing && existing.length >= count) return existing;
        const next = existing ? [...existing] : [];
        while (next.length < count) {
            next.push("arg_" + generateId().substring(0, 10));
        }
        procArgIdsByProccode.set(proccode, next);
        return next;
    }

    // Helper to evaluate simple literal AST nodes
    function evaluateLiteral(node) {
        if (node.type === 'Literal') return node.value;
        if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal') {
            return -node.argument.value;
        }
        if (node.type === 'ObjectExpression') {
            const obj = {};
            for (const prop of node.properties) {
                obj[prop.key.name || prop.key.value] = evaluateLiteral(prop.value);
            }
            return obj;
        }
        if (node.type === 'ArrayExpression') {
            return node.elements.map(evaluateLiteral);
        }
        return null;
    }

    function isMetaComment(text) {
        const normalized = String(text || '').trim();
        return (
            /^@script\b/i.test(normalized) ||
            /^blockId\s*:/i.test(normalized) ||
            /^@scratch-target\b/i.test(normalized) ||
            /^path\s*:/i.test(normalized) ||
            /^targetId\s*:/i.test(normalized) ||
            /^targetName\s*:/i.test(normalized) ||
            /^targetType\s*:/i.test(normalized) ||
            /^This is a virtual Scratch file/i.test(normalized)
        );
    }

    function getLeadingCommentText(stmt) {
        if (!options.includeComments || !stmt || typeof stmt.start !== 'number') return '';
        const leading = [];
        let cursor = stmt.start;

        for (let i = parsedComments.length - 1; i >= 0; i--) {
            const comment = parsedComments[i];
            if (!comment || typeof comment.end !== 'number' || comment.end > cursor) continue;
            const between = jsCode.slice(comment.end, cursor);
            if (!/^[\s;]*$/.test(between)) break;

            const text = String(comment.value || '').trim();
            if (text && !isMetaComment(text)) {
                leading.unshift(text);
            }
            cursor = comment.start;
        }

        return leading.join('\n').trim();
    }

    for (const stmt of ast.body) {
        if (stmt.type !== 'ExpressionStatement') continue;
        const expr = stmt.expression;
        if (!expr || expr.type !== 'CallExpression') continue;
        if (expr.callee.type !== 'Identifier' || expr.callee.name !== 'define') continue;
        const args0 = expr.arguments?.[0];
        if (!args0 || args0.type !== 'ObjectExpression') continue;

        let proccode = null;
        let argCount = null;
        for (const prop of args0.properties) {
            const key = prop.key.name || prop.key.value;
            if (key === 'proccode' && prop.value.type === 'Literal') {
                proccode = prop.value.value;
            } else if (key === '$args' && prop.value.type === 'ArrayExpression') {
                argCount = prop.value.elements.length;
            }
        }
        if (proccode) {
            const parsed = parseDefineCompactProccode(proccode);
            const base = unescapeDefineProccode(parsed.proccode);
            const cnt = (typeof argCount === 'number') ? argCount : parsed.argTypes.length;
            if (cnt > 0) {
                ensureProcArgIds(base, cnt);
                procArgTypesByProccode.set(base, parsed.argTypes);
            }
        }
    }

    function createShadowFromNode(node, parentId) {
        if (!node) return null;
        if (node.type === 'Literal' || (node.type === 'UnaryExpression' && node.operator === '-')) {
            const val = evaluateLiteral(node);
            const shadowId = generateId();
            const isNumber = typeof val === 'number';
            blocks.push({
                id: shadowId,
                opcode: isNumber ? 'math_number' : 'text',
                inputs: {},
                fields: isNumber
                    ? { NUM: { name: 'NUM', value: String(val) } }
                    : { TEXT: { name: 'TEXT', value: String(val) } },
                next: null,
                topLevel: false,
                parent: parentId,
                shadow: true,
                hidden: false,
                locked: false,
                collapsed: false
            });
            return shadowId;
        }
        if (node.type === 'CallExpression' || node.type === 'MemberExpression') {
            const shadowFirstId = parseBlockStatement([{ type: 'ExpressionStatement', expression: node }], parentId, false);
            const shadowBlock = blocks.find(b => b.id === shadowFirstId);
            if (shadowBlock) shadowBlock.shadow = true;
            return shadowFirstId;
        }
        return null;
    }

    function getDefaultMenuValue(fieldName, fieldSpec) {
        if (!fieldSpec || typeof fieldSpec !== 'object') return '';
        if (fieldSpec.defaultValue !== undefined && fieldSpec.defaultValue !== null) {
            return fieldSpec.defaultValue;
        }
        const options = Array.isArray(fieldSpec.menuOptions) ? fieldSpec.menuOptions : null;
        if (options && options.length > 0) {
            const optionWithValue = options.find(option => option && typeof option === 'object' && Object.prototype.hasOwnProperty.call(option, 'value'));
            if (optionWithValue) return optionWithValue.value;
            return options[0];
        }
        const normalizedFieldName = String(fieldName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedMenuName = String(fieldSpec.menu || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedFieldName === 'colorparam' || normalizedMenuName === 'colorparam') return 'color';
        return '';
    }

    function addPlaceableMenuField(block, fieldName, value) {
        const menuInfo = getExpectedShadowInfo(block.opcode, fieldName, activeRuntime);
        if (!menuInfo?.opcode) {
            block.fields[fieldName] = { name: fieldName, value: String(value ?? '') };
            return;
        }

        const menuId = generateId();
        blocks.push({
            id: menuId,
            opcode: menuInfo.opcode,
            inputs: {},
            fields: { [menuInfo.fieldName]: { name: menuInfo.fieldName, value: String(value ?? '') } },
            next: null,
            topLevel: false,
            parent: block.id,
            shadow: true,
            hidden: false,
            locked: false,
            collapsed: false
        });
        block.inputs[fieldName] = { name: fieldName, block: menuId, shadow: menuId };
    }

    function addMissingMenuDefaults(block, blockInfo) {
        if (!block || !blockInfo || !blockInfo.fields) return;

        for (const [fieldName, fieldSpec] of Object.entries(blockInfo.fields)) {
            if (!fieldSpec || typeof fieldSpec !== 'object') continue;

            const fieldType = String(fieldSpec.type || '').toLowerCase();
            if (fieldType === 'variable' || fieldType === 'list') continue;

            const hasMenu = Boolean(fieldSpec.menu || fieldSpec.menuType || Array.isArray(fieldSpec.menuOptions));
            if (!hasMenu) continue;
            if (Object.prototype.hasOwnProperty.call(block.fields || {}, fieldName)) continue;
            if (Object.prototype.hasOwnProperty.call(block.inputs || {}, fieldName)) continue;

            const value = getDefaultMenuValue(fieldName, fieldSpec);
            if (fieldSpec.menuType === 'placeable') {
                addPlaceableMenuField(block, fieldName, value);
            } else {
                block.fields[fieldName] = { name: fieldName, value: String(value ?? '') };
            }
        }
    }

    // Helper to evaluate member expression chain to string
    function evaluateMemberExpression(node) {
        if (node.type === 'Identifier') return node.name;
        if (node.type === 'MemberExpression') {
            return evaluateMemberExpression(node.object) + '.' + node.property.name;
        }
        return '';
    }

    // Process a block statement (e.g. function body or top-level program)
    function parseBlockStatement(statements, parentId, isTopLevel = false) {
        let firstId = null;
        let prevId = null;
        const linkStatements = !isTopLevel;
        for (const stmt of statements) {
            if (stmt.type === 'EmptyStatement') continue;
            if (stmt.type !== 'ExpressionStatement') {
                throw new Error(`unsupported_statement: ${stmt.type}. Scratch virtual JS only supports block calls; use data.setvariableto/data.variable instead of JS variables or control flow.`);
            }
            if (stmt.expression.type !== 'CallExpression' && stmt.expression.type !== 'MemberExpression') {
                throw new Error(`unsupported_expression: ${stmt.expression.type}. Each statement must be one Scratch block call.`);
            }

            // In case of an event wrapper without arguments (if any), the callee is just a MemberExpression
            const expr = stmt.expression.type === 'CallExpression' ? stmt.expression : { callee: stmt.expression, arguments: [] };
            const blockId = generateId();
            const leadingCommentText = getLeadingCommentText(stmt);

            if (!firstId) firstId = blockId;

            // Link previous block to current block
            if (linkStatements && prevId) {
                const prevBlock = blocks.find(b => b.id === prevId);
                if (prevBlock) prevBlock.next = blockId;
            }

            const block = {
                id: blockId,
                opcode: '',
                inputs: {},
                fields: {},
                next: null,
                topLevel: isTopLevel,
                parent: isTopLevel ? null : (prevId !== null ? prevId : parentId),
                shadow: false,
                hidden: false,
                locked: false,
                collapsed: false
            };
            if (leadingCommentText) {
                block.commentText = leadingCommentText;
            }
            if (isTopLevel) {
                block.x = 50;
                block.y = 50 + topLevelIndex * 200;
                topLevelIndex++;
            }

            // Extract namespace and method
            if (expr.callee.type === 'MemberExpression') {
                // To support arbitrary depths like a.b.c.d
                const fullPath = evaluateMemberExpression(expr.callee);
                // split by the last dot to separate namespace and method
                const lastDot = fullPath.lastIndexOf('.');
                if (lastDot !== -1) {
                    let namespace = fullPath.substring(0, lastDot);
                    let method = fullPath.substring(lastDot + 1);
                    // Restore original dots and dashes
                    namespace = namespace.replace(/\$dot\$/g, '.').replace(/\$dash\$/g, '-');
                    method = method.replace(/\$dot\$/g, '.').replace(/\$dash\$/g, '-');
                    block.opcode = `${namespace}_${method}`;
                } else {
                    let method = fullPath.replace(/\$dot\$/g, '.').replace(/\$dash\$/g, '-');
                    block.opcode = method;
                }
            } else if (expr.callee.type === 'Identifier') {
                block.opcode = expr.callee.name.replace(/\$dot\$/g, '.').replace(/\$dash\$/g, '-');
            }

            let blockInfo = null;
            try {
                blockInfo = getBlockInfo(block.opcode, activeRuntime);
            } catch (e) {
                blockInfo = { opcode: block.opcode, found: false, fields: {}, inputs: {}, substacks: [], extensionId: null };
            }
            const allowedFieldNames = new Set(Object.keys(blockInfo?.fields || {}));
            const allowedInputNames = new Set(Object.keys(blockInfo?.inputs || {}));
            const allowedSubstacks = Array.isArray(blockInfo?.substacks) ? [...blockInfo.substacks] : [];
            const usedSubstacks = new Set();

            // Parse arguments
            let hasCallback = false;
            let argsObject = null;
            let callbackNode = null;
            const pendingShadows = {};
            let eventBodyKey = null;

            if (expr.arguments.length > 0) {
                const lastArg = expr.arguments[expr.arguments.length - 1];
                if (lastArg.type === 'ArrowFunctionExpression') {
                    callbackNode = lastArg;
                }

                if (expr.arguments[0].type === 'ObjectExpression') {
                    argsObject = expr.arguments[0];
                }

                // Check if it's an event wrapper or definition wrapper with a callback
                if ((isEventHatOpcode(block.opcode) || block.opcode === 'define') && callbackNode) {
                    hasCallback = true;
                    const valNode = callbackNode;
                    const subStatements = valNode.body.type === 'BlockStatement' ? valNode.body.body : [ { type: 'ExpressionStatement', expression: valNode.body } ];
                    const subFirstId = parseBlockStatement(subStatements, blockId, false);
                    block.next = subFirstId;
                }
            }

            if (!hasCallback && isEventHatOpcode(block.opcode) && argsObject) {
                for (const prop of argsObject.properties) {
                    const key = prop.key.name || prop.key.value;
                    const valNode = prop.value;
                    if (valNode && valNode.type === 'ArrowFunctionExpression') {
                        eventBodyKey = key;
                        const subStatements = valNode.body.type === 'BlockStatement'
                            ? valNode.body.body
                            : [{ type: 'ExpressionStatement', expression: valNode.body }];
                        const subFirstId = parseBlockStatement(subStatements, blockId, false);
                        block.next = subFirstId;
                        hasCallback = true;
                        break;
                    }
                }
            }

            // Special unrolling for 'define' macro
            if (block.opcode === 'define') {
                block.opcode = 'procedures_definition';
                const protoId = generateId();
                block.inputs.custom_block = {
                    name: "custom_block",
                    block: protoId,
                    shadow: protoId
                };

                const protoBlock = {
                    id: protoId,
                    opcode: 'procedures_prototype',
                    inputs: {},
                    fields: {},
                    next: null,
                    topLevel: false,
                    parent: blockId,
                    shadow: true,
                    hidden: false,
                    locked: false,
                    collapsed: false,
                    mutation: {
                        tagName: "mutation",
                        children: [],
                        proccode: "",
                        argumentids: "[]",
                        argumentnames: "[]",
                        argumentdefaults: "[]",
                        warp: "false",
                        isreporter: "false",
                        isglobal: "false",
                        targetid: "null"
                    }
                };

                if (argsObject) {
                    let customArgsArray = null;
                    let infoArray = null;
                    let rawProccode = null;
                    let compactParsed = null;
                    for (const prop of argsObject.properties) {
                        const key = prop.key.name || prop.key.value;
                        if (key === '$args') {
                            customArgsArray = prop.value;
                        } else if (key === 'info') {
                            const val = evaluateLiteral(prop.value);
                            if (Array.isArray(val)) infoArray = val.map(String);
                        } else if (key === '$xy') {
                            const coords = evaluateLiteral(prop.value);
                            if (coords && typeof coords === 'object') {
                                if (coords.x !== undefined) block.x = coords.x;
                                if (coords.y !== undefined) block.y = coords.y;
                            }
                        } else {
                            const valNode = prop.value;
                            const val = evaluateLiteral(valNode);
                            if (val !== null) {
                                if (key === 'argumentnames' || key === 'argumentdefaults') {
                                    protoBlock.mutation[key] = Array.isArray(val) ? JSON.stringify(val) : String(val);
                                } else {
                                    if (key === 'proccode') rawProccode = String(val);
                                    protoBlock.mutation[key] = String(val);
                                }
                            }
                        }
                    }

                    if (rawProccode) {
                        compactParsed = parseDefineCompactProccode(rawProccode);
                        protoBlock.mutation.proccode = unescapeDefineProccode(compactParsed.proccode);
                    }

                    if (infoArray) {
                        if (infoArray.includes('warp')) protoBlock.mutation.warp = "true";
                        if (infoArray.includes('global')) protoBlock.mutation.isglobal = "true";
                        if (infoArray.includes('reporter')) protoBlock.mutation.isreporter = "true";
                    }

                    // For definitions, type is only set if it's a reporter, otherwise it's just standard
                    if (protoBlock.mutation.isreporter === "true") {
                        protoBlock.mutation.type = "procedures_prototype";
                    }

                    // Process prototype args
                    if (customArgsArray && customArgsArray.type === 'ArrayExpression') {
                        const proccode = protoBlock.mutation.proccode;
                        const shared = proccode ? ensureProcArgIds(proccode, customArgsArray.elements.length) : null;
                        const argIds = shared
                            ? [...shared]
                            : Array.from({ length: customArgsArray.elements.length }, () => "arg_" + generateId().substring(0, 10));
                        protoBlock.mutation.argumentids = JSON.stringify(argIds);

                        for (let i = 0; i < customArgsArray.elements.length; i++) {
                            const argNode = customArgsArray.elements[i];
                            const argId = argIds[i];
                            if (!argNode) continue;

                            if (argNode.type === 'CallExpression' || argNode.type === 'MemberExpression') {
                                const subBlockId = parseBlockStatement([{ type: 'ExpressionStatement', expression: argNode }], protoId, false);
                                protoBlock.inputs[argId] = {
                                    name: argId,
                                    block: subBlockId,
                                    shadow: subBlockId
                                };
                                const innerBlock = blocks.find(b => b.id === subBlockId);
                                if (innerBlock) innerBlock.shadow = true;
                            }
                        }
                    } else if (compactParsed && compactParsed.argTypes.length > 0) {
                        const names = compactParsed.argNames.map((n, idx) => (n === undefined ? `参数${idx + 1}` : n));
                        const defaults = compactParsed.argTypes.map(defaultForArgType);
                        protoBlock.mutation.argumentnames = JSON.stringify(names);
                        protoBlock.mutation.argumentdefaults = JSON.stringify(defaults);
                        const proccode = protoBlock.mutation.proccode;
                        const shared = proccode ? ensureProcArgIds(proccode, compactParsed.argTypes.length) : null;
                        const argIds = shared
                            ? [...shared]
                            : Array.from({ length: compactParsed.argTypes.length }, () => "arg_" + generateId().substring(0, 10));
                        protoBlock.mutation.argumentids = JSON.stringify(argIds);

                        for (let i = 0; i < compactParsed.argTypes.length; i++) {
                            const t = compactParsed.argTypes[i];
                            const argId = argIds[i];
                            const reporterId = generateId();
                            const reporterOpcode = t === 'b' ? 'argument_reporter_boolean' : 'argument_reporter_string_number';
                            blocks.push({
                                id: reporterId,
                                opcode: reporterOpcode,
                                inputs: {},
                                fields: { VALUE: { name: 'VALUE', value: String(names[i]) } },
                                next: null,
                                topLevel: false,
                                parent: protoId,
                                shadow: true,
                                hidden: false,
                                locked: false,
                                collapsed: false
                            });
                            protoBlock.inputs[argId] = {
                                name: argId,
                                block: reporterId,
                                shadow: reporterId
                            };
                        }
                    }
                }

                blocks.push(protoBlock);
                blocks.push(block);
                prevId = linkStatements ? blockId : null;
                continue; // Skip the rest of the generic parsing for 'define'
            }

            if (argsObject) {
                for (const prop of argsObject.properties) {
                    const rawKey = String(prop.key.name || prop.key.value);
                    const key = rawKey.startsWith('$') ? rawKey : normalizeDslArgKey(block.opcode, rawKey);
                    const valNode = prop.value;

                    if (eventBodyKey !== null && key === eventBodyKey && valNode && valNode.type === 'ArrowFunctionExpression') {
                        continue;
                    }

                    if (key.startsWith('$shadow_')) {
                        const shadowKey = key.replace('$shadow_', '');
                        pendingShadows[normalizeDslArgKey(block.opcode, shadowKey)] = valNode;
                        continue;
                    }

                    if (!key.startsWith('$') && valNode && valNode.type === 'ArrowFunctionExpression') {
                        const targetKey = key;
                        if (allowedSubstacks.length > 0 && !allowedSubstacks.includes(targetKey)) {
                            throw new Error(JSON.stringify({
                                error: 'invalid_substack_key',
                                opcode: block.opcode,
                                blockId,
                                inputKey: key,
                                expectedSubstacks: allowedSubstacks,
                                blockInfo
                            }));
                        }
                        if (allowedSubstacks.length === 0 && blockInfo && blockInfo.found && !blockInfo.extensionId && !String(targetKey).startsWith('SUBSTACK')) {
                            throw new Error(JSON.stringify({
                                error: 'missing_substack_info',
                                opcode: block.opcode,
                                blockId,
                                inputKey: key,
                                blockInfo
                            }));
                        }
                        if (allowedSubstacks.length === 0 || allowedSubstacks.includes(targetKey)) {
                            const subStatements = valNode.body.type === 'BlockStatement'
                                ? valNode.body.body
                                : [{ type: 'ExpressionStatement', expression: valNode.body }];
                            const subFirstId = parseBlockStatement(subStatements, blockId, false);
                            block.inputs[targetKey] = { name: targetKey, block: subFirstId, shadow: null };
                            if (allowedSubstacks.includes(targetKey)) usedSubstacks.add(targetKey);
                            continue;
                        }
                    }

                    // 1. Fields
                    if (key.startsWith('$field_')) {
                        const actualKey = key.replace('$field_', '');
                        const literalValueOrObj = evaluateLiteral(valNode);
                        const literalValue = (literalValueOrObj && typeof literalValueOrObj === 'object' && !Array.isArray(literalValueOrObj) && ('value' in literalValueOrObj))
                            ? literalValueOrObj.value
                            : literalValueOrObj;
                        const explicitVarType = (literalValueOrObj && typeof literalValueOrObj === 'object' && !Array.isArray(literalValueOrObj))
                            ? literalValueOrObj.variableType
                            : undefined;
                        const explicitId = (literalValueOrObj && typeof literalValueOrObj === 'object' && !Array.isArray(literalValueOrObj))
                            ? (literalValueOrObj.id_b64 ? decodeIdFromJs(literalValueOrObj.id_b64) : (literalValueOrObj.id || null))
                            : null;

                        const fieldSpec = blockInfo && blockInfo.fields ? blockInfo.fields[actualKey] : null;
                        if (fieldSpec && fieldSpec.menuType === 'placeable' && (typeof literalValue === 'string' || typeof literalValue === 'number')) {
                            const menuInfo = getExpectedShadowInfo(block.opcode, actualKey, activeRuntime);
                            const menuOpcode = menuInfo?.opcode || `${block.opcode}_menu`;
                            const menuFieldName = menuInfo?.fieldName || actualKey;
                            const menuId = generateId();
                            blocks.push({
                                id: menuId,
                                opcode: menuOpcode,
                                inputs: {},
                                fields: { [menuFieldName]: { name: menuFieldName, value: String(literalValue) } },
                                next: null,
                                topLevel: false,
                                parent: blockId,
                                shadow: true,
                                hidden: false,
                                locked: false,
                                collapsed: false
                            });
                            block.inputs[actualKey] = { name: actualKey, block: menuId, shadow: menuId };
                            continue;
                        }

                        let vType = null;
                        if (fieldSpec && fieldSpec.type === 'list') vType = 'list';
                        else if (fieldSpec && fieldSpec.type === 'broadcast') vType = 'broadcast_msg';
                        else if (fieldSpec && fieldSpec.type === 'variable') vType = '';
                        else if (actualKey === 'BROADCAST_OPTION') vType = 'broadcast_msg';
                        if (explicitVarType !== undefined) vType = explicitVarType;

                        block.fields[actualKey] = {
                            name: actualKey,
                            value: literalValue
                        };

                        if (vType !== null) { // Note: vType can be empty string now
                            block.fields[actualKey].variableType = vType;
                            if (explicitId) {
                                block.fields[actualKey].id = explicitId;
                            } else {
                                block.fields[actualKey].id = randomFieldId(vType, literalValue);
                            }
                        }
                    }
                    else if (!key.startsWith('$') && allowedFieldNames.has(key) && valNode && valNode.type === 'Literal') {
                        const actualKey = key;
                        const literalValue = valNode.value;
                        const fieldSpec = blockInfo && blockInfo.fields ? blockInfo.fields[actualKey] : null;
                        let vType = null;
                        if (fieldSpec && fieldSpec.type === 'list') vType = 'list';
                        else if (fieldSpec && fieldSpec.type === 'broadcast') vType = 'broadcast_msg';
                        else if (fieldSpec && fieldSpec.type === 'variable') vType = '';
                        block.fields[actualKey] = { name: actualKey, value: literalValue };
                        if (vType !== null) {
                            block.fields[actualKey].variableType = vType;
                            block.fields[actualKey].id = randomFieldId(vType, literalValue);
                        }
                    }
                    // 2. Mutation
                    else if (key === '$mutation') {
                        const m = evaluateLiteral(valNode);
                        if (block.opcode === 'procedures_call') {
                            block.mutation = {
                                tagName: "mutation",
                                children: [],
                                proccode: m.proccode,
                                argumentids: m.argumentids || "[]",
                                warp: m.warp || "false"
                            };
                        } else {
                            block.mutation = {
                                tagName: "mutation",
                                children: [],
                                proccode: m.proccode,
                                argumentids: m.argumentids || "[]",
                                argumentnames: m.argumentnames ? (Array.isArray(m.argumentnames) ? JSON.stringify(m.argumentnames) : m.argumentnames) : "[]",
                                argumentdefaults: m.argumentdefaults ? (Array.isArray(m.argumentdefaults) ? JSON.stringify(m.argumentdefaults) : m.argumentdefaults) : "[]",
                                warp: m.warp || "false",
                                isreporter: m.isreporter || "false",
                                isglobal: m.isglobal || "false",
                                targetid: m.targetid || "null",
                                type: m.type || undefined
                            };
                            if (!block.mutation.type) delete block.mutation.type;
                        }
                    }
                    // 2.5. Custom Block Positional Arguments ($args)
                    else if (key === '$args') {
                        const argsArray = evaluateLiteral(valNode);
                        if (Array.isArray(argsArray)) {
                            // If argumentids is empty or not set in mutation yet, generate them based on proccode
                            let argIds = [];
                            const proccode = block.mutation?.proccode;
                            if (block.opcode === 'procedures_call' && proccode) {
                                const shared = ensureProcArgIds(proccode, argsArray.length);
                                if (shared) argIds = [...shared];
                            }
                            if (argIds.length === 0 && block.mutation && block.mutation.argumentids && block.mutation.argumentids !== "[]") {
                                try { argIds = JSON.parse(block.mutation.argumentids); } catch (e) {}
                            }

                            // Ensure we have enough IDs
                            while (argIds.length < argsArray.length) {
                                argIds.push("arg_" + generateId().substring(0, 10));
                            }

                            // Update mutation
                            if (!block.mutation) {
                                block.mutation = { tagName: "mutation", children: [], proccode: "", argumentids: "[]", warp: "false", isreporter: "false", isglobal: "false", targetid: "null" };
                            }
                            block.mutation.argumentids = JSON.stringify(argIds);
                            if (block.opcode === 'procedures_call' && proccode) {
                                procArgIdsByProccode.set(proccode, [...argIds]);
                            }

                            // Now parse the arguments and attach them to inputs using the generated/existing IDs
                            for (let i = 0; i < argsArray.length; i++) {
                                const argVal = argsArray[i];
                                const argId = argIds[i];

                                // We need the AST node for this argument, which we can find in the ObjectExpression
                                const argNode = valNode.elements[i];
                                 if (!argNode) continue;

                                 if (argNode.type === 'Literal' || (argNode.type === 'UnaryExpression' && argNode.operator === '-')) {
                                     const val = evaluateLiteral(argNode);
                                     const shadowId = generateId();
                                     const isNumber = typeof val === 'number';
                                     const shadowBlock = {
                                         id: shadowId,
                                         opcode: isNumber ? 'math_number' : 'text',
                                         inputs: {},
                                         fields: isNumber
                                             ? { NUM: { name: 'NUM', value: String(val) } }
                                             : { TEXT: { name: 'TEXT', value: String(val) } },
                                         next: null,
                                         topLevel: false,
                                         parent: blockId,
                                         shadow: true,
                                         hidden: false,
                                         locked: false,
                                         collapsed: false
                                     };
                                     blocks.push(shadowBlock);

                                     // For prototypes, literal arguments are shadows of themselves
                                     block.inputs[argId] = {
                                         name: argId,
                                         block: shadowId,
                                         shadow: shadowId
                                     };
                                 } else if (argNode.type === 'CallExpression' || argNode.type === 'MemberExpression') {
                                     // Treat like a nested block
                                     const subBlockId = parseBlockStatement([{ type: 'ExpressionStatement', expression: argNode }], blockId, false);

                                     // ALWAYS generate a default shadow block so the input field doesn't disappear when the nested block is removed
                                     let expectedType = 'text';
                                     if (block.opcode === 'procedures_call' && proccode) {
                                         const argTypes = procArgTypesByProccode.get(proccode);
                                         if (argTypes && argTypes[i]) {
                                             const t = argTypes[i];
                                             if (t === 'n') expectedType = 'math_number';
                                             else if (t === 'b') expectedType = null;
                                         }
                                     }

                                     let shadowId = null;
                                     if (expectedType) {
                                         shadowId = generateId();
                                         blocks.push({
                                             id: shadowId,
                                             opcode: expectedType,
                                             inputs: {},
                                             fields: expectedType === 'math_number'
                                                 ? { NUM: { name: 'NUM', value: "" } }
                                                 : { TEXT: { name: 'TEXT', value: "" } },
                                             next: null,
                                             topLevel: false,
                                             parent: blockId,
                                             shadow: true,
                                             hidden: false,
                                             locked: false,
                                             collapsed: false
                                         });
                                     }

                                     block.inputs[argId] = {
                                         name: argId,
                                         block: subBlockId,
                                         shadow: shadowId
                                     };
                                 }
                            }
                        }
                    }
                    // 3. TopLevel Coordinates ($xy)
                    else if (key === '$xy') {
                        const coords = evaluateLiteral(valNode);
                        if (coords.x !== undefined) block.x = coords.x;
                        if (coords.y !== undefined) block.y = coords.y;
                    }
                    // 3. Inputs (Substack)
                    else if (valNode.type === 'ArrowFunctionExpression') {
                        const subStatements = valNode.body.type === 'BlockStatement' ? valNode.body.body : [ { type: 'ExpressionStatement', expression: valNode.body } ];
                        const subFirstId = parseBlockStatement(subStatements, blockId, false);
                        block.inputs[key] = {
                            name: key,
                            block: subFirstId,
                            shadow: null
                        };
                    }
                    // 4. Inputs (Primitive -> Shadow Block)
                    else if (valNode.type === 'Literal' || (valNode.type === 'UnaryExpression' && valNode.operator === '-')) {
                        const val = evaluateLiteral(valNode);
                        const shadowId = generateId();
                        const expectedShadowInfo = getExpectedShadowInfo(block.opcode, key, activeRuntime);
                        const expectedType = getExpectedShadowType(block.opcode, key, activeRuntime);
                        const v = val === null || val === undefined ? "" : String(val);
                        if (expectedType === null) {
                            throw new Error(JSON.stringify({
                                error: 'invalid_boolean_literal',
                                opcode: block.opcode,
                                blockId,
                                inputKey: key,
                                value: val,
                                blockInfo
                            }));
                        } else if (expectedType === 'event_broadcast_menu') {
                            blocks.push({
                                id: shadowId,
                                opcode: 'event_broadcast_menu',
                                inputs: {},
                                fields: {
                                    BROADCAST_OPTION: {
                                        name: 'BROADCAST_OPTION',
                                        value: v,
                                        variableType: 'broadcast_msg',
                                        id: randomFieldId('broadcast_msg', v)
                                    }
                                },
                                next: null,
                                topLevel: false,
                                parent: blockId,
                                shadow: true,
                                hidden: false,
                                locked: false,
                                collapsed: false
                            });
                        } else if (expectedType && expectedType.endsWith('_menu')) {
                            const menuFieldName = expectedShadowInfo?.fieldName || key;
                            blocks.push({
                                id: shadowId,
                                opcode: expectedType,
                                inputs: {},
                                fields: {
                                    [menuFieldName]: { name: menuFieldName, value: v }
                                },
                                next: null,
                                topLevel: false,
                                parent: blockId,
                                shadow: true,
                                hidden: false,
                                locked: false,
                                collapsed: false
                            });
                        } else {
                            const isNumber = expectedType === 'math_number';
                            blocks.push({
                                id: shadowId,
                                opcode: isNumber ? 'math_number' : 'text',
                                inputs: {},
                                fields: isNumber
                                    ? { NUM: { name: 'NUM', value: v } }
                                    : { TEXT: { name: 'TEXT', value: v } },
                                next: null,
                                topLevel: false,
                                parent: blockId,
                                shadow: true,
                                hidden: false,
                                locked: false,
                                collapsed: false
                            });
                        }
                        block.inputs[key] = {
                            name: key,
                            block: shadowId,
                            shadow: shadowId
                        };
                    }
                    // 5. Inputs (Nested Block)
                    else if (valNode.type === 'CallExpression' || valNode.type === 'MemberExpression') {
                        const subBlockId = parseBlockStatement([{ type: 'ExpressionStatement', expression: valNode }], blockId, false);

                        let shadowId = null;
                        if (pendingShadows[key]) {
                            shadowId = createShadowFromNode(pendingShadows[key], blockId);
                            delete pendingShadows[key];
                        } else {
                            const innerBlock = blocks.find(b => b.id === subBlockId);
                            const shadowLike = innerBlock && (innerBlock.opcode === 'text' || innerBlock.opcode.startsWith('math_') || innerBlock.opcode === 'looks_costume' || innerBlock.opcode === 'event_broadcast_menu');
                            if (shadowLike) {
                                innerBlock.shadow = true;
                                shadowId = subBlockId;
                            } else if (block.opcode !== 'procedures_prototype' && block.opcode !== 'procedures_definition') {
                                const expectedShadowInfo = getExpectedShadowInfo(block.opcode, key, activeRuntime);
                                const expectedType = getExpectedShadowType(block.opcode, key, activeRuntime);
                                if (expectedType) {
                                    shadowId = generateId();
                                    if (expectedType === 'event_broadcast_menu') {
                                        blocks.push({
                                            id: shadowId,
                                            opcode: expectedType,
                                            inputs: {},
                                            fields: {
                                                BROADCAST_OPTION: {
                                                    name: 'BROADCAST_OPTION',
                                                    value: "",
                                                    variableType: 'broadcast_msg',
                                                    id: randomFieldId('broadcast_msg', "")
                                                }
                                            },
                                            next: null,
                                            topLevel: false,
                                            parent: blockId,
                                            shadow: true,
                                            hidden: false,
                                            locked: false,
                                            collapsed: false
                                        });
                                    } else if (expectedType.endsWith('_menu')) {
                                        const menuFieldName = expectedShadowInfo?.fieldName || key;
                                        blocks.push({
                                            id: shadowId,
                                            opcode: expectedType,
                                            inputs: {},
                                            fields: {
                                                [menuFieldName]: { name: menuFieldName, value: "" }
                                            },
                                            next: null,
                                            topLevel: false,
                                            parent: blockId,
                                            shadow: true,
                                            hidden: false,
                                            locked: false,
                                            collapsed: false
                                        });
                                    } else {
                                        blocks.push({
                                            id: shadowId,
                                            opcode: expectedType,
                                            inputs: {},
                                            fields: expectedType === 'math_number'
                                                ? { NUM: { name: 'NUM', value: "" } }
                                                : { TEXT: { name: 'TEXT', value: "" } },
                                            next: null,
                                            topLevel: false,
                                            parent: blockId,
                                            shadow: true,
                                            hidden: false,
                                            locked: false,
                                            collapsed: false
                                        });
                                    }
                                }
                            }
                        }

                        // For procedures_definition, the input is custom_block and it SHOULD have a shadow pointing to the prototype itself
                        // in original Scratch JSON, definition's custom_block input has shadow = block
                        let shadowVal = shadowId;
                        if (block.opcode === 'procedures_definition' && key === 'custom_block') {
                            shadowVal = subBlockId;

                            // The nested prototype block MUST have shadow = true
                            const protoBlock = blocks.find(b => b.id === subBlockId);
                            if (protoBlock) {
                                protoBlock.shadow = true;
                            }
                        }

                        // DO NOT set topLevel to true for procedures_prototype
                        if (block.opcode === 'procedures_definition' && key === 'custom_block') {
                             const protoBlock = blocks.find(b => b.id === subBlockId);
                             if (protoBlock) protoBlock.topLevel = false;
                        }

                        block.inputs[key] = {
                            name: key,
                            block: subBlockId,
                            shadow: shadowVal
                        };
                    }
                }

                for (const [k, node] of Object.entries(pendingShadows)) {
                    const shadowId = createShadowFromNode(node, blockId);
                    if (shadowId) {
                        block.inputs[k] = {
                            name: k,
                            block: shadowId,
                            shadow: shadowId
                        };
                    }
                }
            }

            if (!hasCallback) {
                const singleCallbackArg = expr.arguments.length === 1 && expr.arguments[0].type === 'ArrowFunctionExpression';
                const secondCallbackArg = expr.arguments.length > 1 && expr.arguments[1].type === 'ArrowFunctionExpression';
                if (expr.arguments.length === 1 && expr.arguments[0].type === 'ArrowFunctionExpression' && allowedSubstacks.length > 0) {
                    throw new Error(JSON.stringify({
                        error: 'invalid_cblock_call_form',
                        opcode: block.opcode,
                        blockId,
                        expectedSubstacks: allowedSubstacks,
                        blockInfo
                    }));
                } else if ((singleCallbackArg || secondCallbackArg) && blockInfo && blockInfo.found && allowedSubstacks.length === 0) {
                    throw new Error(JSON.stringify({
                        error: 'invalid_callback_for_command',
                        opcode: block.opcode,
                        blockId,
                        message: 'This block is not an event hat or C-block. Put following statements after it instead of inside a callback.',
                        blockInfo
                    }));
                } else if (expr.arguments.length === 1 && expr.arguments[0].type === 'ArrowFunctionExpression') {
                    const fnNode = expr.arguments[0];
                    const subStatements = fnNode.body.type === 'BlockStatement' ? fnNode.body.body : [ { type: 'ExpressionStatement', expression: fnNode.body } ];
                    const firstChildId = parseBlockStatement(subStatements, blockId, false);
                    block.next = firstChildId;
                } else if (expr.arguments.length > 1 && expr.arguments[1].type === 'ArrowFunctionExpression') {
                    const fnNode = expr.arguments[1];
                    const subStatements = fnNode.body.type === 'BlockStatement' ? fnNode.body.body : [ { type: 'ExpressionStatement', expression: fnNode.body } ];
                    const firstChildId = parseBlockStatement(subStatements, blockId, false);
                    block.next = firstChildId;
                }
            }

            addMissingMenuDefaults(block, blockInfo);
            blocks.push(block);
            prevId = linkStatements ? blockId : null;
        }

        return firstId;
    }

    // Start parsing from top-level Program body.
    if (options.linkTopLevelStatements === true) {
        const firstTopLevelId = parseBlockStatement(ast.body, null, false);
        const firstTopLevelBlock = blocks.find(b => b.id === firstTopLevelId);
        if (firstTopLevelBlock) {
            firstTopLevelBlock.topLevel = true;
            firstTopLevelBlock.parent = null;
            if (firstTopLevelBlock.x === undefined) firstTopLevelBlock.x = 50;
            if (firstTopLevelBlock.y === undefined) firstTopLevelBlock.y = 50;
        }
    } else {
        parseBlockStatement(ast.body, null, true);
    }

    const originalOrder = new Map();
    for (let i = 0; i < blocks.length; i++) originalOrder.set(blocks[i].id, i);

    const byId = new Map();
    for (const b of blocks) byId.set(b.id, b);

    function validateBlocks() {
        const errors = [];
        const infoCache = new Map();
        const getInfoCached = (opcode) => {
            const k = String(opcode);
            const hit = infoCache.get(k);
            if (hit) return hit;
            let info = null;
            try {
                info = getBlockInfo(k, activeRuntime);
            } catch (e) {
                info = { opcode: k, found: false, fields: {}, inputs: {}, substacks: [] };
            }
            infoCache.set(k, info);
            return info;
        };

        for (const b of blocks) {
            if (b.next && !byId.has(b.next)) errors.push(`missing next: ${b.opcode} ${b.id} -> ${b.next}`);
            if (b.parent && !byId.has(b.parent)) errors.push(`missing parent: ${b.opcode} ${b.id} -> ${b.parent}`);
            for (const inp of Object.values(b.inputs || {})) {
                if (inp && inp.block && !byId.has(inp.block)) errors.push(`missing input block: ${b.opcode} ${b.id} ${inp.name} -> ${inp.block}`);
                if (inp && inp.shadow && !byId.has(inp.shadow)) errors.push(`missing input shadow: ${b.opcode} ${b.id} ${inp.name} -> ${inp.shadow}`);
            }
            if (errors.length > 50) break;
        }

        for (const b of blocks) {
            if (typeof b.opcode === 'string' && b.opcode.endsWith('_menu')) continue;
            const info = getInfoCached(b.opcode);
            if (!info || !info.found) continue;
            const allowedFields = new Set(Object.keys(info.fields || {}));
            const allowedInputs = new Set(Object.keys(info.inputs || {}));
            if (allowedFields.size > 0) {
                for (const k of Object.keys(b.fields || {})) {
                    if (!allowedFields.has(k)) errors.push(`unexpected field: ${b.opcode} ${b.id} ${k}`);
                    if (errors.length > 50) break;
                }
            }
            if (allowedInputs.size > 0) {
                for (const k of Object.keys(b.inputs || {})) {
                    if (!allowedInputs.has(k)) {
                        if (String(k).startsWith('SUBSTACK')) continue;
                        if (b.opcode === 'procedures_call') continue;
                        const f = info && info.fields ? info.fields[k] : null;
                        if (f && f.menuType === 'placeable') continue;
                        errors.push(`unexpected input: ${b.opcode} ${b.id} ${k}`);
                    }
                    if (errors.length > 50) break;
                }
            }
            if (errors.length > 50) break;
        }

        if (errors.length > 0) {
            const msg = errors.slice(0, 50).join('\n');
            const first = errors[0] || '';
            const parts = String(first).split(/\s+/);
            const opcode = parts.length >= 3 ? parts[2] : null;
            const info = opcode ? getInfoCached(opcode) : null;
            throw new Error(`invalid_blocks\n${msg}\nblockInfo:${info ? JSON.stringify(info) : 'null'}`);
        }
    }

    const depthCache = new Map();
    function getDepth(id, visiting = new Set()) {
        if (depthCache.has(id)) return depthCache.get(id);
        if (visiting.has(id)) return 0;
        visiting.add(id);
        const b = byId.get(id);
        const p = b && typeof b.parent === 'string' ? b.parent : null;
        const d = p && byId.has(p) ? getDepth(p, visiting) + 1 : 0;
        visiting.delete(id);
        depthCache.set(id, d);
        return d;
    }

    blocks.sort((a, b) => {
        const da = getDepth(a.id);
        const db = getDepth(b.id);
        if (da !== db) return da - db;
        return (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0);
    });

    if (options.validate !== false) {
        validateBlocks();
    }

    return blocks;
}

export function jsToJsonWithComments(jsCode) {
    const options = arguments.length > 1 && arguments[1] && typeof arguments[1] === 'object' ? arguments[1] : {};
    const blocks = jsToJson(jsCode, { ...options, includeComments: true });
    return {
        blocks,
        comments: blocks
            .filter(block => typeof block.commentText === 'string' && block.commentText.trim())
            .map(block => ({
                blockId: block.id,
                text: block.commentText,
                minimized: false,
                width: 200,
                height: 160,
                x: typeof block.x === 'number' ? block.x + 32 : 32,
                y: typeof block.y === 'number' ? block.y + 32 : 32
            }))
    };
}
