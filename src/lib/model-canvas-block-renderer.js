/*
 * Model-driven Canvas renderer for the new UI block workspace.
 *
 * Blockly remains responsible for the block graph, events, serialization,
 * undo/redo, connection matching and gestures. Ordinary blocks in a Canvas
 * workspace never create SVG DOM (or an in-memory SVG facsimile): geometry is
 * derived directly from the block model and painted only when it intersects
 * the viewport. The flyout deliberately remains the native SVG renderer.
 */

const VIEWPORT_MARGIN = 192;
const SPATIAL_CELL_SIZE = 256;
const STACK_HEIGHT = 48;
const REPORTER_HEIGHT = 40;
const HAT_HEIGHT = 24;
const CANVAS_TOP_PADDING = HAT_HEIGHT + 4;
const BLOCK_PADDING_X = 12;
const STATEMENT_INDENT = 16;
const NOTCH_X = 16;
const NOTCH_WIDTH = 32;
const NOTCH_DEPTH = 8;
// Keep layout work in the animation frame, but use a larger quantum so large
// scripts do not need hundreds of nearly-empty frames to finish. The deadline
// is still checked inside processLayoutTask, so a slow native block cannot
// consume an unbounded frame.
import canvasLayoutWorkerMain from './canvas-layout-worker';

const LAYOUT_FRAME_BUDGET = 12;
const LAYOUT_SINGLE_ROOT_BUDGET = 10;
const LAYOUT_MULTI_ROOT_BUDGET = 6;
const LAYOUT_FAST_FRAME_BUDGET = 16;
const LAYOUT_FAST_ROOT_BUDGET = 14;
const LAYOUT_FAST_MULTI_ROOT_BUDGET = 8;
const LAYOUT_MAX_RATE = 16;
const PROJECTION_WORKER_MIN_BLOCKS = 48;
const VIRTUAL_UNLOAD_SCREENS = 2;
const VIRTUAL_UNLOAD_DELAY_MS = 20000;
const TEXT_METRICS_CACHE_LIMIT = 4096;
const SVG_NS = 'http://www.w3.org/2000/svg';
const BLOCK_TEXT_FONT = '500 16px "Helvetica Neue", Helvetica, sans-serif';
const BLOCK_TEXT_FONT_SIZE = '12pt';

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
const numberOr = (value, fallback = 0) => {
    const number = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const textMetricsCache = new Map();

const measureTextCached = (context, font, text) => {
    const value = String(text || '');
    const key = `${font}\u0000${value}`;
    const cached = textMetricsCache.get(key);
    if (typeof cached !== 'undefined') return cached;
    context.font = font;
    const width = context.measureText(value).width;
    if (textMetricsCache.size >= TEXT_METRICS_CACHE_LIMIT) {
        const oldest = textMetricsCache.keys().next().value;
        if (typeof oldest !== 'undefined') textMetricsCache.delete(oldest);
    }
    textMetricsCache.set(key, width);
    return width;
};

const rectsIntersect = (a, b) => !(
    a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom
);

const rectDistance = (a, b) => {
    const dx = a.right < b.left ? b.left - a.right :
        a.left > b.right ? a.left - b.right : 0;
    const dy = a.bottom < b.top ? b.top - a.bottom :
        a.top > b.bottom ? a.top - b.bottom : 0;
    return dx + dy;
};

const unionRect = (a, b) => {
    if (!a) return Object.assign({}, b);
    return {
        left: Math.min(a.left, b.left),
        top: Math.min(a.top, b.top),
        right: Math.max(a.right, b.right),
        bottom: Math.max(a.bottom, b.bottom)
    };
};

const parseWorkspaceTransform = workspace => {
    const canvas = workspace && workspace.getCanvas && workspace.getCanvas();
    const value = canvas && canvas.getAttribute ? String(canvas.getAttribute('transform') || '') : '';
    const translate = /translate\(\s*([-+\d.e]+)(?:[, ]+)([-+\d.e]+)\)?/.exec(value);
    const scaleMatch = /scale\(\s*([-+\d.e]+)/.exec(value);
    return {
        x: translate ? numberOr(translate[1]) : 0,
        y: translate ? numberOr(translate[2]) : 0,
        scale: workspace && workspace.scale ? workspace.scale : (scaleMatch ? numberOr(scaleMatch[1], 1) : 1)
    };
};

const parseTranslate = value => {
    const match = /translate\(\s*([-+\d.e]+)(?:[, ]+)\s*([-+\d.e]+)/.exec(String(value || ''));
    return match ? {x: numberOr(match[1]), y: numberOr(match[2])} : null;
};

const parseTransformScale = value => {
    const match = /scale\(\s*([-+\d.e]+)(?:[, ]+\s*([-+\d.e]+))?\)/.exec(String(value || ''));
    if (!match) return {x: 1, y: 1};
    return {
        x: numberOr(match[1], 1),
        y: numberOr(match[2], numberOr(match[1], 1))
    };
};

const makeClassList = invalidate => {
    const names = new Set();
    return {
        add: (...items) => {
            items.forEach(item => names.add(item));
            invalidate();
        },
        remove: (...items) => {
            items.forEach(item => names.delete(item));
            invalidate();
        },
        contains: item => names.has(item),
        toggle: (item, force) => {
            const add = typeof force === 'boolean' ? force : !names.has(item);
            if (add) names.add(item);
            else names.delete(item);
            invalidate();
            return add;
        },
        set: value => {
            names.clear();
            String(value || '')
                .split(/\s+/)
                .filter(Boolean)
                .forEach(item => names.add(item));
            invalidate();
        },
        toString: () => Array.from(names).join(' ')
    };
};

// Blockly and several addons still read svgGroup_/svgPath_. In Canvas mode
// these properties point to lightweight model nodes only. They are never DOM
// nodes, never enter an SVG tree and never trigger browser SVG layout.
class CanvasModelNode {
    constructor (owner, kind, getRect) {
        this.__02CanvasModelNode = true;
        this.owner = owner;
        this.kind = kind;
        this.getRect = getRect;
        this.attributes = Object.create(null);
        this.childNodes = [];
        this.children = this.childNodes;
        this.parentNode = null;
        this.parentElement = null;
        this.nodeType = 1;
        this.tagName = ['circle', 'g', 'image', 'line', 'path', 'rect', 'text'].includes(kind) ? kind : 'g';
        this.nodeName = this.tagName;
        this.ownerDocument = typeof document === 'undefined' ? null : document;
        this.dataset = Object.create(null);
        this.className = {baseVal: '', animVal: ''};
        this.classList = makeClassList(() => this.invalidatePaint());
        this.styleValues = Object.create(null);
        this.style = new Proxy(this.styleValues, {
            set: (target, key, value) => {
                target[key] = String(value);
                this.invalidatePaint();
                return true;
            },
            get: (target, key) => {
                if (key === 'setProperty') {
                    return (name, value) => {
                        target[name.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())] = String(value);
                        this.invalidatePaint();
                    };
                }
                if (key === 'getPropertyValue') return name => target[name] || '';
                if (key === 'removeProperty') {
                    return name => {
                        delete target[name];
                        this.invalidatePaint();
                    };
                }
                return target[key] || '';
            }
        });
        this.textContent = '';
    }
    invalidate () {
        const block = this.owner && (this.owner.sourceBlock_ || this.owner);
        const renderer = block && block.workspace && block.workspace.canvasBlockRenderer;
        if (renderer && !renderer.renderingNative) renderer.invalidateBlock(block);
    }
    invalidatePaint () {
        const block = this.owner && (this.owner.sourceBlock_ || this.owner);
        const renderer = block && block.workspace && block.workspace.canvasBlockRenderer;
        if (renderer && !renderer.renderingNative) renderer.scheduleDraw();
    }
    setAttribute (name, value) {
        const text = String(value);
        this.attributes[name] = text;
        if (name === 'class') {
            this.className.baseVal = text;
            this.className.animVal = text;
            this.classList.set(text);
        } else if (name === 'data-id') {
            this.dataset.id = text;
        } else if (name === 'transform' && this.kind === 'block') {
            const match = /translate\(\s*([-+\d.e]+)(?:[, ]+)([-+\d.e]+)\)?/.exec(text);
            if (match && this.owner) {
                this.owner.__02CanvasPosition = {x: numberOr(match[1]), y: numberOr(match[2])};
            }
        } else if (name === 'style') {
            for (const declaration of text.split(';')) {
                const separator = declaration.indexOf(':');
                if (separator < 0) continue;
                const property = declaration.slice(0, separator)
                    .trim()
                    .replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
                this.styleValues[property] = declaration.slice(separator + 1).trim();
            }
        }
        if (['class', 'fill', 'stroke', 'stroke-width', 'opacity', 'filter',
            'visibility', 'display', 'style'].includes(name)) {
            this.invalidatePaint();
        } else if (name === 'transform' && this.kind === 'block') {
            const block = this.owner && (this.owner.sourceBlock_ || this.owner);
            const renderer = block && block.workspace && block.workspace.canvasBlockRenderer;
            const root = block && block.getRootBlock ? block.getRootBlock() : block;
            if (renderer && !renderer.renderingNative) renderer.invalidatePosition(root);
        } else {
            this.invalidate();
        }
    }
    setAttributeNS (namespace, name, value) {
        this.setAttribute(name, value);
    }
    getAttribute (name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }
    getAttributeNS (namespace, name) {
        return this.getAttribute(name);
    }
    removeAttribute (name) {
        delete this.attributes[name];
        if (['class', 'fill', 'stroke', 'stroke-width', 'opacity', 'filter',
            'visibility', 'display', 'style'].includes(name)) this.invalidatePaint();
        else this.invalidate();
    }
    appendChild (child) {
        if (!child) return child;
        if (child.parentNode && child.parentNode !== this && child.parentNode.removeChild) {
            child.parentNode.removeChild(child);
        }
        if (!this.childNodes.includes(child)) this.childNodes.push(child);
        if (child.__02CanvasModelNode) {
            child.parentNode = this;
            child.parentElement = this;
        }
        this.syncTextContent();
        return child;
    }
    insertBefore (child, reference) {
        if (!child) return child;
        if (child.parentNode && child.parentNode !== this && child.parentNode.removeChild) {
            child.parentNode.removeChild(child);
        }
        const existingIndex = this.childNodes.indexOf(child);
        if (existingIndex >= 0) this.childNodes.splice(existingIndex, 1);
        const index = this.childNodes.indexOf(reference);
        if (index < 0) return this.appendChild(child);
        this.childNodes.splice(index, 0, child);
        if (child.__02CanvasModelNode) {
            child.parentNode = this;
            child.parentElement = this;
        }
        this.syncTextContent();
        return child;
    }
    removeChild (child) {
        const index = this.childNodes.indexOf(child);
        if (index >= 0) this.childNodes.splice(index, 1);
        if (child && child.__02CanvasModelNode) {
            child.parentNode = null;
            child.parentElement = null;
        }
        this.syncTextContent();
        return child;
    }
    remove () {
        if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this);
    }
    hasAttribute (name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name);
    }
    contains (child) {
        if (child === this) return true;
        return this.childNodes.some(candidate => candidate === child ||
            (candidate && typeof candidate.contains === 'function' && candidate.contains(child)));
    }
    get firstChild () {
        return this.childNodes[0] || null;
    }
    get lastChild () {
        return this.childNodes[this.childNodes.length - 1] || null;
    }
    get nextSibling () {
        const siblings = this.parentNode && this.parentNode.childNodes;
        if (!siblings) return null;
        const index = siblings.indexOf(this);
        return index < 0 ? null : (siblings[index + 1] || null);
    }
    get previousSibling () {
        const siblings = this.parentNode && this.parentNode.childNodes;
        if (!siblings) return null;
        const index = siblings.indexOf(this);
        return index <= 0 ? null : siblings[index - 1];
    }
    syncTextContent () {
        // FieldLabelSerializable appends a real DOM Text node to the model
        // text element. Keep the same textContent contract as SVG so Blockly's
        // native field measurement can see that text in Canvas mode.
        if (this.kind !== 'text' && this.tagName !== 'text') return;
        this.textContent = this.childNodes.map(child => {
            if (!child) return '';
            if (typeof child.textContent === 'string') return child.textContent;
            if (typeof child.nodeValue === 'string') return child.nodeValue;
            return '';
        }).join('');
    }
    matches (selector) {
        return String(selector || '')
            .split(',')
            .some(part => {
                let value = part.trim();
                if (!value) return false;
                value = value.replace(/^:scope\s*>?\s*/, '');
                const attributes = [];
                value = value.replace(/\[([^\]]+)\]/g, (match, expression) => {
                    const attribute = /^([^~*^$|=\s]+)\s*(?:([*^$|~]?=)\s*["']?([^"']*)["']?)?$/.exec(
                        expression.trim()
                    );
                    if (attribute) attributes.push(attribute.slice(1));
                    return '';
                });
                const classes = [];
                value = value.replace(/\.([\w-]+)/g, (match, className) => {
                    classes.push(className);
                    return '';
                });
                const tag = value.trim().toLowerCase();
                if (tag && tag !== '*' && tag !== String(this.tagName || '').toLowerCase()) return false;
                if (classes.some(className => !this.classList.contains(className))) return false;
                return attributes.every(([name, operator, expected]) => {
                    const actual = this.getAttribute(name);
                    if (actual === null) return false;
                    if (!operator) return true;
                    if (operator === '*=') return actual.includes(expected);
                    if (operator === '^=') return actual.startsWith(expected);
                    if (operator === '$=') return actual.endsWith(expected);
                    if (operator === '~=') return actual.split(/\s+/).includes(expected);
                    return actual === expected;
                });
            });
    }
    querySelectorAll (selector) {
        const matches = [];
        const visit = node => {
            for (const child of node.childNodes || []) {
                if (child.matches && child.matches(selector)) matches.push(child);
                visit(child);
            }
        };
        visit(this);
        return matches;
    }
    querySelector (selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
    getElementsByClassName (className) {
        const firstClass = String(className || '').trim()
            .split(/\s+/)[0];
        return this.querySelectorAll(`.${firstClass}`);
    }
    getElementsByTagName (tagName) {
        return this.querySelectorAll(String(tagName || '*'));
    }
    closest (selector) {
        let node = this;
        while (node) {
            if (node.matches && node.matches(selector)) return node;
            node = node.parentNode;
        }
        return null;
    }
    getRootNode () {
        let node = this;
        while (node && node.parentNode) node = node.parentNode;
        return node;
    }
    get ownerSVGElement () {
        return null;
    }
    addEventListener () {}
    removeEventListener () {}
    focus () {}
    blur () {}
    getModelClientRect () {
        const owner = this.owner;
        const block = owner && (owner.sourceBlock_ || owner.block_ || owner);
        const renderer = block && block.workspace && block.workspace.canvasBlockRenderer;
        if (!renderer) return null;
        if (this.kind === 'icon' && owner.block_) {
            return renderer.getIconClientRect(owner);
        }
        if (!owner.sourceBlock_) return null;
        const fieldRect = renderer.getFieldClientRect(owner);
        if (!fieldRect) return null;
        if (this.kind === 'field') return fieldRect;
        const nodeOffset = renderer.getFieldNodePaintOffset(owner, this);
        const scale = renderer.getTransform().scale;
        const x = nodeOffset.x;
        const y = nodeOffset.y;
        let width = numberOr(this.getAttribute('width'));
        let height = numberOr(this.getAttribute('height'));
        if (this.kind === 'text') {
            const fontSize = numberOr(
                this.getAttribute('font-size') || this.style.fontSize,
                16
            );
            const textWidth = this.getComputedTextLength();
            const anchor = this.getAttribute('text-anchor');
            const left = anchor === 'middle' ? x - (textWidth / 2) :
                (anchor === 'end' ? x - textWidth : x);
            return {
                left: fieldRect.left + (left * scale),
                top: fieldRect.top + ((y - fontSize) * scale),
                right: fieldRect.left + ((left + textWidth) * scale),
                bottom: fieldRect.top + (y * scale),
                width: textWidth * scale,
                height: fontSize * scale
            };
        }
        if (!width) width = fieldRect.width / scale;
        if (!height) height = fieldRect.height / scale;
        return {
            left: fieldRect.left + (x * scale),
            top: fieldRect.top + (y * scale),
            right: fieldRect.left + ((x + width) * scale),
            bottom: fieldRect.top + ((y + height) * scale),
            width: width * scale,
            height: height * scale
        };
    }
    getBoundingClientRect () {
        const modelRect = this.getModelClientRect();
        if (modelRect) return modelRect;
        const rect = this.getRect ? this.getRect() : null;
        return rect || {left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0};
    }
    getBBox () {
        const owner = this.owner;
        const block = owner && (owner.sourceBlock_ || owner.block_ || owner);
        const renderer = block && block.workspace && block.workspace.canvasBlockRenderer;
        if (renderer && block.id) {
            const geometry = renderer.blockGeometry.get(block.id);
            if (geometry) {
                if (this.kind === 'block' || this === block.svgPath_) {
                    return {
                        x: 0,
                        y: geometry.isHat ? -HAT_HEIGHT : 0,
                        width: geometry.width,
                        height: geometry.height + (geometry.isHat ? HAT_HEIGHT : 0)
                    };
                }
                if (this.kind === 'field' || this.kind.indexOf('field-') === 0) {
                    const field = owner.sourceBlock_ ? owner : null;
                    const fieldGeometry = field && renderer.fieldGeometry.get(field);
                    if (fieldGeometry) {
                        return {
                            x: 0,
                            y: 0,
                            width: fieldGeometry.width,
                            height: fieldGeometry.height
                        };
                    }
                }
            }
        }
        const x = numberOr(this.getAttribute('x'));
        const y = numberOr(this.getAttribute('y'));
        if (this.kind === 'text') {
            const fontSize = numberOr(
                this.getAttribute('font-size') || this.style.fontSize,
                16
            );
            return {
                x,
                y: y - fontSize,
                width: this.getComputedTextLength(),
                height: fontSize
            };
        }
        if (['circle', 'image', 'line', 'rect'].includes(this.kind)) {
            const radius = numberOr(this.getAttribute('r'));
            const x1 = numberOr(this.getAttribute('x1'));
            const x2 = numberOr(this.getAttribute('x2'));
            const y1 = numberOr(this.getAttribute('y1'));
            const y2 = numberOr(this.getAttribute('y2'));
            const width = this.kind === 'line' ? Math.abs(x2 - x1) :
                numberOr(this.getAttribute('width'), radius * 2);
            const height = this.kind === 'line' ? Math.abs(y2 - y1) :
                numberOr(this.getAttribute('height'), radius * 2);
            return {
                x: this.kind === 'circle' ? numberOr(this.getAttribute('cx')) - radius :
                    (this.kind === 'line' ? Math.min(x1, x2) : x),
                y: this.kind === 'circle' ? numberOr(this.getAttribute('cy')) - radius :
                    (this.kind === 'line' ? Math.min(y1, y2) : y),
                width,
                height
            };
        }
        const rect = this.getBoundingClientRect();
        const parentRect = this.parentNode && this.parentNode.getBoundingClientRect ?
            this.parentNode.getBoundingClientRect() : null;
        return {
            x: parentRect ? rect.left - parentRect.left : 0,
            y: parentRect ? rect.top - parentRect.top : 0,
            width: rect.width || 0,
            height: rect.height || 0
        };
    }
    getClientRects () {
        return [this.getBoundingClientRect()];
    }
    getComputedTextLength () {
        const owner = this.owner;
        const block = owner && (owner.sourceBlock_ || owner.block_ || owner);
        const renderer = block && block.workspace && block.workspace.canvasBlockRenderer;
        if (renderer && renderer.context) {
            renderer.context.save();
            const fontSize = this.getAttribute('font-size') || this.style.fontSize || '16px';
            const fontWeight = this.getAttribute('font-weight') || this.style.fontWeight || '500';
            const fontFamily = this.getAttribute('font-family') || this.style.fontFamily ||
                '"Helvetica Neue", Helvetica, sans-serif';
            const width = measureTextCached(
                renderer.context,
                `${fontWeight} ${fontSize} ${fontFamily}`,
                this.textContent
            );
            renderer.context.restore();
            return width;
        }
        return String(this.textContent || '').length * 9;
    }
    cloneNode () {
        return new CanvasModelNode(this.owner, this.kind, this.getRect);
    }
}

const isCanvasWorkspace = workspace => !!(
    workspace && !workspace.isFlyout && (
        workspace.__02CanvasRendererEnabled || workspace.canvasBlockRenderer ||
        (workspace.options && workspace.options.canvasRenderer)
    )
);

const rootOf = block => (block && block.getRootBlock ? block.getRootBlock() : block);

const blockGraphDepth = block => {
    let depth = 0;
    let current = block;
    const seen = new Set();
    while (current && current.getParent && current.getParent() && !seen.has(current.id)) {
        seen.add(current.id);
        depth++;
        current = current.getParent();
    }
    return depth;
};

const prepareCanvasIcon = icon => {
    if (!icon || icon.iconGroup_ || !icon.block_) return;
    const block = icon.block_;
    const rect = () => {
        const renderer = block.workspace && block.workspace.canvasBlockRenderer;
        return renderer ? renderer.getIconClientRect(icon) : null;
    };
    // Icon.createIcon creates a real SVG group with a null parent. Build the
    // same small model tree directly so icon drawing stays on Canvas.
    icon.iconGroup_ = new CanvasModelNode(icon, 'icon', rect);
    icon.iconGroup_.setAttribute('class', 'blocklyIconGroup');
    if (block.isInFlyout) icon.iconGroup_.classList.add('blocklyIconGroupReadonly');
    if (typeof icon.drawIcon_ === 'function') icon.drawIcon_(icon.iconGroup_);
    if (typeof icon.updateEditable === 'function') icon.updateEditable();
    block.svgGroup_.appendChild(icon.iconGroup_);
};

const getRootPosition = root => {
    const value = root && (root.__02CanvasDragPosition || root.__02CanvasPosition || root.deferredXY_ || root.xy_);
    return {x: numberOr(value && value.x), y: numberOr(value && value.y)};
};

const fieldText = field => {
    if (!field) return '';
    if (field.getDisplayText_) return String(field.getDisplayText_()).replace(/[\u202a\u202b\u202c\u00a0]/g, ' ');
    if (field.getText) return String(field.getText() || '');
    return String(field.text_ || '');
};

const resolveImageSource = field => {
    let source = field && field.src_;
    if (!source && field && field.imageJson_) source = field.imageJson_.src;
    if (typeof source !== 'string') return null;
    if (source.indexOf('media://') === 0 && field.sourceBlock_) {
        source = field.sourceBlock_.workspace.options.pathToMedia + source.slice('media://'.length);
    }
    return source;
};

const installBlocklyCanvasMode = ScratchBlocks => {
    if (!ScratchBlocks || ScratchBlocks.__02ModelCanvasInstalled) return;
    ScratchBlocks.__02ModelCanvasInstalled = true;

    const blockProto = ScratchBlocks.BlockSvg && ScratchBlocks.BlockSvg.prototype;
    if (!blockProto) return;

    const utils = ScratchBlocks.utils;
    let canvasCreationOwner = null;
    if (utils && !utils.__02CanvasModelNodePatched && utils.createSvgElement) {
        const originalCreateSvgElement = utils.createSvgElement;
        utils.createSvgElement = function (name, attrs, parent) {
            if (parent && parent.__02CanvasModelNode) {
                const node = new CanvasModelNode(parent.owner, name, parent.getRect);
                Object.keys(attrs || {}).forEach(key => node.setAttribute(key, attrs[key]));
                parent.appendChild(node);
                return node;
            }
            if (!parent && canvasCreationOwner) {
                const node = new CanvasModelNode(canvasCreationOwner, name, null);
                Object.keys(attrs || {}).forEach(key => node.setAttribute(key, attrs[key]));
                return node;
            }
            return originalCreateSvgElement.call(this, name, attrs, parent);
        };
        utils.__02CanvasModelNodePatched = true;
    }

    const inputProto = ScratchBlocks.Input && ScratchBlocks.Input.prototype;
    if (inputProto && inputProto.init && !inputProto.__02CanvasInputInitPatched) {
        const originalInputInit = inputProto.init;
        inputProto.init = function () {
            const block = this.sourceBlock_;
            if (!isCanvasWorkspace(block && block.workspace)) return originalInputInit.call(this);
            if (!block.workspace || !block.workspace.rendered) return;
            for (const field of this.fieldRow || []) {
                if (!field || field.fieldGroup_ || field.textElement_) continue;
                field.sourceBlock_ = block;
                canvasCreationOwner = field;
                try {
                    field.init(block);
                } finally {
                    canvasCreationOwner = null;
                }
            }
        };
        inputProto.__02CanvasInputInitPatched = true;
    }

    const flyoutProto = ScratchBlocks.Flyout && ScratchBlocks.Flyout.prototype;
    if (flyoutProto && flyoutProto.placeNewBlock_ && !flyoutProto.__02CanvasPlaceNewBlockPatched) {
        const originalPlaceNewBlock = flyoutProto.placeNewBlock_;
        flyoutProto.placeNewBlock_ = function (...args) {
            const block = originalPlaceNewBlock.apply(this, args);
            const workspace = this.targetWorkspace_;
            const renderer = workspace && workspace.canvasBlockRenderer;
            if (renderer && block) {
                // The gesture starts dragging immediately after placeNewBlock_
                // returns. Build this one new stack synchronously so its first
                // Canvas frame and connection coordinates exist before the
                // BlockDragger snapshots them.
                renderer.materializeBlock(block.id, true);
            }
            return block;
        };
        flyoutProto.__02CanvasPlaceNewBlockPatched = true;
    }

    const originalCreateSvgElements = blockProto.createSvgElements_;
    blockProto.createSvgElements_ = function () {
        if (!isCanvasWorkspace(this.workspace)) return originalCreateSvgElements.call(this);
        if (this.svgGroup_ && this.svgGroup_.__02CanvasModelNode) return;
        const rect = () => {
            const renderer = this.workspace && this.workspace.canvasBlockRenderer;
            return renderer ? renderer.getBlockClientRect(this) : null;
        };
        this.svgGroup_ = new CanvasModelNode(this, 'block', rect);
        this.svgGroup_.setAttribute('class', 'blocklyDraggable');
        this.svgGroup_.setAttribute('data-id', this.id || '');
        this.svgPath_ = new CanvasModelNode(this, 'path', rect);
        this.svgPath_.setAttribute('class', 'blocklyPath blocklyBlockBackground');
        this.svgGroup_.appendChild(this.svgPath_);
        this.useDragSurface_ = false;
    };

    const originalGetHeightWidth = blockProto.getHeightWidth;
    if (originalGetHeightWidth && !blockProto.__02CanvasGetHeightWidthPatched) {
        blockProto.getHeightWidth = function (...args) {
            if (!isCanvasWorkspace(this.workspace)) {
                return originalGetHeightWidth.apply(this, args);
            }
            const renderer = this.workspace.canvasBlockRenderer;
            return renderer ? renderer.getEstimatedHeightWidth(this) :
                originalGetHeightWidth.apply(this, args);
        };
        blockProto.__02CanvasGetHeightWidthPatched = true;
    }

    const prepareField = field => {
        if (!field) return;
        const wasPrepared = !!field.__02CanvasPrepared;
        field.__02CanvasPrepared = true;
        const fieldNodeNames = [
            'fieldGroup_', 'textElement_', 'box_', 'arrow_', 'imageElement_', 'checkElement_'
        ];
        const rect = () => {
            const block = field.sourceBlock_;
            const renderer = block && block.workspace && block.workspace.canvasBlockRenderer;
            return renderer ? renderer.getFieldClientRect(field) : null;
        };
        const nodeKind = name => ({
            fieldGroup_: 'field',
            textElement_: 'text',
            box_: 'field-box',
            arrow_: 'field-arrow',
            imageElement_: 'field-image',
            checkElement_: 'field-checkbox'
        }[name] || 'g');
        const convertNode = (node, owner, kind) => {
            if (!node) return null;
            if (node.__02CanvasModelNode) {
                node.getRect = rect;
                for (const child of node.childNodes || []) convertNode(child, owner, child.kind);
                return node;
            }
            const model = new CanvasModelNode(owner, kind || String(node.tagName || 'g').toLowerCase(), rect);
            for (const attribute of Array.from(node.attributes || [])) {
                model.setAttribute(attribute.name, attribute.value);
            }
            if (node.getAttribute && node.getAttribute('style')) {
                model.setAttribute('style', node.getAttribute('style'));
            }
            model.textContent = node.textContent || '';
            for (const child of Array.from(node.childNodes || [])) {
                const childModel = convertNode(child, owner, String(child.tagName || 'g').toLowerCase());
                if (childModel) model.appendChild(childModel);
            }
            return model;
        };

        // Some fields create detached SVG nodes after their first init/render.
        // Convert those nodes on every preparation pass, while preserving the
        // Field instance, value, validator and event wrapper.
        const hasDetachedSvg = fieldNodeNames.some(name => field[name] && !field[name].__02CanvasModelNode);
        if (hasDetachedSvg && !wasPrepared && field.mouseDownWrapper_ && ScratchBlocks.unbindEvent_) {
            if (field.mouseDownWrapper_ && ScratchBlocks.unbindEvent_) {
                ScratchBlocks.unbindEvent_(field.mouseDownWrapper_);
            }
            field.mouseDownWrapper_ = null;
        }
        if (!wasPrepared) {
            canvasCreationOwner = field;
            try {
                // Running the normal field initializer preserves specialized field
                // behavior (dropdown arrows, image fields, checkboxes, validators)
                // while createSvgElement is redirected to model nodes above.
                if (typeof field.init === 'function') field.init(field.sourceBlock_);
                else if (field.initModel) field.initModel();
            } finally {
                canvasCreationOwner = null;
            }
        }
        for (const name of fieldNodeNames) {
            if (field[name] && !field[name].__02CanvasModelNode) {
                field[name] = convertNode(field[name], field, nodeKind(name));
            }
        }
        if (field.fieldGroup_ && field.fieldGroup_.__02CanvasModelNode) {
            field.fieldGroup_.kind = 'field';
        }
        // Keep equivalent handles for field implementations which only expose
        // part of their SVG state after initialization.
        if (!field.fieldGroup_) field.fieldGroup_ = new CanvasModelNode(field, 'field', rect);
        if (!field.textElement_) field.textElement_ = new CanvasModelNode(field, 'text', rect);
        if (!field.box_ && (field.getOptions || field.positionArrow)) {
            field.box_ = new CanvasModelNode(field, 'field-box', rect);
        }
        if (!field.arrow_ && (field.getOptions || field.positionArrow)) {
            field.arrow_ = new CanvasModelNode(field, 'field-arrow', rect);
        }
        if (!field.imageElement_ && typeof field.src_ !== 'undefined') {
            field.imageElement_ = new CanvasModelNode(field, 'field-image', rect);
        }
        if (!field.checkElement_ && typeof field.state_ !== 'undefined') {
            field.checkElement_ = new CanvasModelNode(field, 'field-checkbox', rect);
        }
        // Field.init creates some nodes with a null SVG parent (notably
        // FieldLabel and FieldDropdown). Give every model node in that field's
        // tree the same live geometry callback so Blockly's native popup and
        // input widgets receive real screen coordinates.
        const visited = new Set();
        const bindRect = node => {
            if (!node || visited.has(node)) return;
            visited.add(node);
            if (node.__02CanvasModelNode) node.getRect = rect;
            for (const child of node.childNodes || []) bindRect(child);
        };
        bindRect(field.fieldGroup_);
        bindRect(field.textElement_);
        bindRect(field.box_);
        bindRect(field.arrow_);
        bindRect(field.imageElement_);
        bindRect(field.checkElement_);
    };
    ScratchBlocks.__02PrepareCanvasField = prepareField;

    const originalInitSvg = blockProto.initSvg;
    blockProto.initSvg = function () {
        if (!isCanvasWorkspace(this.workspace)) return originalInitSvg.call(this);
        this.createSvgElements_();
        if (this.deferredXY_) {
            this.__02CanvasPosition = {
                x: numberOr(this.deferredXY_.x),
                y: numberOr(this.deferredXY_.y)
            };
            this.deferredXY_ = null;
        }
        for (const input of this.inputList || []) {
            // Preserve Blockly's complete field and empty-input initialization.
            // createSvgElement redirects these nodes to CanvasModelNode, so this
            // does not create SVG DOM in the main workspace.
            if (typeof input.init === 'function') input.init();
            if (typeof input.initOutlinePath === 'function') input.initOutlinePath(this.svgGroup_);
            for (const field of input.fieldRow || []) {
                field.sourceBlock_ = this;
                prepareField(field);
            }
        }
        for (const icon of this.getIcons ? this.getIcons() : []) prepareCanvasIcon(icon);
        this.updateColour();
        this.updateMovable();
        this.eventsInit_ = true;
        this.rendered = true;
        const renderer = this.workspace.canvasBlockRenderer;
        // initSvg is also used by the Canvas shape compiler. Model-node
        // creation during that pass is an implementation detail, not a
        // workspace mutation; invalidating here would cancel and restart the
        // active layout task once for every newly materialized block.
        if (renderer && !renderer.renderingNative) renderer.invalidateBlock(this);
    };

    const originalRender = blockProto.render;
    blockProto.render = function (optBubble) {
        if (!isCanvasWorkspace(this.workspace)) return originalRender.call(this, optBubble);
        if (!this.svgGroup_) this.initSvg();
        this.rendered = true;
        const renderer = this.workspace.canvasBlockRenderer;
        if (renderer && !renderer.renderingNative) {
            renderer.invalidateBlock(this);
            // ScratchBlockComment.setCommentText() calls render() and then
            // immediately opens the bubble. Canvas rendering is normally
            // deferred, so a newly-created comment has no iconXY_ yet and
            // ScratchBlockComment.autoPosition_ would dereference null.
            // Materialize this block synchronously before the native bubble
            // code continues. Existing comments keep the normal deferred path.
            if (this.comment && typeof this.comment.getIconLocation === 'function' &&
                !this.comment.getIconLocation()) {
                renderer.materializeBlock(this.id, true);
            }
            // InsertionMarkerManager reads this block's connection offsets in
            // the same call stack as render(). Ordinary Canvas layout may be
            // deferred, but a marker must be measured synchronously or its
            // preview is positioned at the workspace origin on the first drag.
            if (this.isInsertionMarker && this.isInsertionMarker()) {
                renderer.materializeBlock(this.id, true);
            }
        }
        return this;
    };

    // XML loading can create a block comment before the workspace SVG and its
    // bubble canvas are ready. Keep the graph/comment data, but do not let
    // Blockly construct a bubble in the middle of an async import.
    const originalSetCommentText = blockProto.setCommentText;
    if (originalSetCommentText && !blockProto.__02CanvasSetCommentTextPatched) {
        blockProto.setCommentText = function (...args) {
            if (!isCanvasWorkspace(this.workspace) || !this.workspace.__02CanvasXmlLoading) {
                return originalSetCommentText.apply(this, args);
            }
            // ScratchBlockComment extends Blockly.Icon. Its constructor
            // appends the icon group to block.getSvgRoot(), even when the
            // block is not rendered. During async XML import a new block has
            // no root yet, so initialize the Canvas model node first. This is
            // model-only in Canvas mode and does not create SVG DOM.
            if (!this.svgGroup_ && typeof this.initSvg === 'function') this.initSvg();
            const wasRendered = this.rendered;
            this.rendered = false;
            try {
                return originalSetCommentText.apply(this, args);
            } finally {
                this.rendered = wasRendered;
            }
        };
        blockProto.__02CanvasSetCommentTextPatched = true;
    }

    const commentProto = ScratchBlocks.ScratchBlockComment &&
        ScratchBlocks.ScratchBlockComment.prototype;
    if (commentProto && commentProto.setVisible && !commentProto.__02CanvasSetVisiblePatched) {
        const originalCommentSetVisible = commentProto.setVisible;
        commentProto.setVisible = function (visible) {
            const workspace = this.block_ && this.block_.workspace;
            // A comment can outlive its renderer briefly while a target is
            // being switched. Blockly's native implementation immediately
            // constructs ScratchBubble and appends it to getBubbleCanvas(),
            // which is no longer valid after renderer disposal. The graph is
            // disposed with the workspace, so there is nothing useful to
            // render during this lifecycle transition.
            if (workspace && (workspace.__02CanvasRendererDisposing ||
                workspace.__02CanvasRendererDisposed)) {
                this.__02CanvasPendingVisible = !!visible;
                return;
            }
            if (visible && isCanvasWorkspace(workspace)) {
                const bubbleCanvas = workspace.getBubbleCanvas && workspace.getBubbleCanvas();
                if (workspace.__02CanvasXmlLoading || !bubbleCanvas || !bubbleCanvas.parentNode) {
                    this.__02CanvasPendingVisible = true;
                    return;
                }
            }
            try {
                const result = originalCommentSetVisible.call(this, visible);
                this.__02CanvasPendingVisible = false;
                return result;
            } catch (error) {
                // A workspace switch can detach the old SVG between the
                // readiness check and ScratchBubble's appendChild call.
                // Defer that one visibility transition until the new layer is
                // attached instead of breaking the whole workspace update.
                if (visible && isCanvasWorkspace(workspace) &&
                    error && /appendChild|parentNode|undefined|null/i.test(String(error.message))) {
                    this.__02CanvasPendingVisible = true;
                    return;
                }
                if (workspace && (workspace.__02CanvasRendererDisposing ||
                    workspace.__02CanvasRendererDisposed)) {
                    this.__02CanvasPendingVisible = !!visible;
                    return;
                }
                throw error;
            }
        };
        commentProto.__02CanvasSetVisiblePatched = true;
    }

    // BlockSvg.setParent normally moves the block's SVG root between the
    // workspace canvas and its new parent. Canvas workspaces deliberately use
    // model nodes instead of DOM nodes, so that final appendChild would throw
    // during unplug/reconnect and leave Blockly's gesture stuck in dragging.
    const originalSetParent = blockProto.setParent;
    if (originalSetParent && !blockProto.__02CanvasSetParentPatched) {
        blockProto.setParent = function (newParent) {
            if (!isCanvasWorkspace(this.workspace)) {
                return originalSetParent.call(this, newParent);
            }
            const oldParent = this.parentBlock_;
            if (newParent === oldParent) return;
            const renderer = this.workspace.canvasBlockRenderer;
            // SVG setParent preserves a child block's absolute position when
            // it is unplugged. Canvas has no SVG parent to translate, so save
            // that position before Blockly changes the graph.
            const detachedPosition = !newParent && oldParent && renderer ?
                renderer.getBlockWorkspacePosition(this) : null;
            const Field = ScratchBlocks.Field;
            if (Field && Field.startCache) Field.startCache();
            try {
                // Keep Blockly's authoritative graph bookkeeping. This is the
                // part needed by connections, serialization, undo and VM sync.
                if (ScratchBlocks.Block && ScratchBlocks.Block.prototype.setParent) {
                    ScratchBlocks.Block.prototype.setParent.call(this, newParent);
                } else {
                    this.parentBlock_ = newParent || null;
                }
            } finally {
                if (Field && Field.stopCache) Field.stopCache();
            }
            if (newParent && this.isShadow && this.isShadow() &&
                newParent.getColourTertiary && this.setColour) {
                this.setColour(
                    this.getColour(),
                    this.getColourSecondary(),
                    newParent.getColourTertiary(),
                    this.getColourQuaternary()
                );
            }
            if (!newParent && oldParent && detachedPosition) {
                this.__02CanvasPosition = {
                    x: detachedPosition.x,
                    y: detachedPosition.y
                };
                this.__02CanvasDragPosition = null;
                this.deferredXY_ = null;
            }
            if (renderer) renderer.invalidateBlock(this);
        };
        blockProto.__02CanvasSetParentPatched = true;
    }

    const originalShowContextMenu = blockProto.showContextMenu_;
    blockProto.showContextMenu_ = function (event) {
        if (!isCanvasWorkspace(this.workspace)) return originalShowContextMenu.call(this, event);
        if (typeof originalShowContextMenu === 'function') {
            return originalShowContextMenu.call(this, event);
        }
    };

    const workspaceProto = ScratchBlocks.WorkspaceSvg && ScratchBlocks.WorkspaceSvg.prototype;
    if (workspaceProto && workspaceProto.getSvgXY && !workspaceProto.__02CanvasGetSvgXYPatched) {
        const originalGetSvgXY = workspaceProto.getSvgXY;
        workspaceProto.getSvgXY = function (element) {
            if (!isCanvasWorkspace(this) || !element || !element.__02CanvasModelNode) {
                return originalGetSvgXY.call(this, element);
            }
            const renderer = this.canvasBlockRenderer;
            const owner = element.owner;
            const block = owner && (owner.sourceBlock_ || owner);
            if (renderer && block && block.id) {
                const root = rootOf(block);
                const rootPosition = getRootPosition(root);
                const geometry = renderer.blockGeometry.get(block.id);
                if (geometry) {
                    return new ScratchBlocks.goog.math.Coordinate(
                        rootPosition.x + geometry.x,
                        rootPosition.y + geometry.y
                    );
                }
                return new ScratchBlocks.goog.math.Coordinate(rootPosition.x, rootPosition.y);
            }
            return new ScratchBlocks.goog.math.Coordinate(0, 0);
        };
        workspaceProto.__02CanvasGetSvgXYPatched = true;
    }
    if (workspaceProto && workspaceProto.startDragWithFakeEvent &&
        !workspaceProto.__02CanvasFakeDragPatched) {
        const originalStartDragWithFakeEvent = workspaceProto.startDragWithFakeEvent;
        workspaceProto.startDragWithFakeEvent = function (event, block) {
            const renderer = this.canvasBlockRenderer;
            if (renderer && block) {
                renderer.materializeBlock(block.id, true);
                renderer.prepareBlockDrag(block);
            }
            return originalStartDragWithFakeEvent.call(this, event, block);
        };
        workspaceProto.__02CanvasFakeDragPatched = true;
    }

    const originalGetRelative = blockProto.getRelativeToSurfaceXY;
    blockProto.getRelativeToSurfaceXY = function () {
        if (!isCanvasWorkspace(this.workspace)) return originalGetRelative.call(this);
        const renderer = this.workspace.canvasBlockRenderer;
        if (renderer) return renderer.getBlockWorkspacePosition(this);
        const Coordinate = ScratchBlocks.goog && ScratchBlocks.goog.math &&
            ScratchBlocks.goog.math.Coordinate;
        const position = getRootPosition(rootOf(this));
        return Coordinate ? new Coordinate(position.x, position.y) : position;
    };

    const originalTranslate = blockProto.translate;
    blockProto.translate = function (x, y) {
        if (!isCanvasWorkspace(this.workspace)) return originalTranslate.call(this, x, y);
        const root = rootOf(this);
        if (root === this) {
            this.__02CanvasPosition = {x, y};
            this.__02CanvasDragPosition = null;
            this.deferredXY_ = null;
        }
        const renderer = this.workspace.canvasBlockRenderer;
        if (renderer) renderer.invalidatePosition(root);
    };

    const originalMoveDuringDrag = blockProto.moveDuringDrag;
    blockProto.moveDuringDrag = function (location) {
        if (!isCanvasWorkspace(this.workspace)) return originalMoveDuringDrag.call(this, location);
        const root = rootOf(this);
        root.__02CanvasDragPosition = {x: location.x, y: location.y};
        const renderer = this.workspace.canvasBlockRenderer;
        if (renderer) renderer.invalidatePosition(root);
    };

    const originalMoveToDragSurface = blockProto.moveToDragSurface_;
    blockProto.moveToDragSurface_ = function () {
        if (!isCanvasWorkspace(this.workspace)) return originalMoveToDragSurface.call(this);
    };

    const originalMoveOffDragSurface = blockProto.moveOffDragSurface_;
    blockProto.moveOffDragSurface_ = function (location) {
        if (!isCanvasWorkspace(this.workspace)) return originalMoveOffDragSurface.call(this, location);
        this.translate(location.x, location.y);
        const renderer = this.workspace && this.workspace.canvasBlockRenderer;
        if (renderer) renderer.invalidatePosition(rootOf(this));
    };

    const originalPositionNewBlock = blockProto.positionNewBlock;
    if (originalPositionNewBlock && !blockProto.__02CanvasPositionNewBlockPatched) {
        blockProto.positionNewBlock = function (newBlock, newConnection, existingConnection) {
            if (!isCanvasWorkspace(this.workspace)) {
                return originalPositionNewBlock.call(this, newBlock, newConnection, existingConnection);
            }
            if (!newBlock || !newConnection || !existingConnection ||
                newConnection.type !== ScratchBlocks.NEXT_STATEMENT) return;

            // positionNewBlock normally calls moveBy(), whose DOM-based
            // getRelativeToSurfaceXY cannot see a Canvas model node. Apply the
            // same connection delta directly to the model position instead.
            const current = getRootPosition(rootOf(newBlock));
            const dx = numberOr(existingConnection.x_) - numberOr(newConnection.x_);
            const dy = numberOr(existingConnection.y_) - numberOr(newConnection.y_);
            newBlock.translate(current.x + dx, current.y + dy);
            if (typeof newBlock.moveConnections_ === 'function') {
                newBlock.moveConnections_(dx, dy);
            }
            const renderer = this.workspace.canvasBlockRenderer;
            if (renderer) {
                renderer.materializeBlock(newBlock.id, true);
                renderer.scheduleDraw();
            }
        };
        blockProto.__02CanvasPositionNewBlockPatched = true;
    }

    // Blockly's flyout creates a block in the target workspace and then lets
    // BlockDragger move it through the SVG drag-surface lifecycle. Canvas
    // workspaces intentionally have no SVG drag surface, so keep the same
    // lifecycle but notify the Canvas renderer on every drag phase.
    const draggerProto = ScratchBlocks.BlockDragger && ScratchBlocks.BlockDragger.prototype;
    const gestureProto = ScratchBlocks.Gesture && ScratchBlocks.Gesture.prototype;
    if (gestureProto && gestureProto.startDraggingBlock_ &&
        !gestureProto.__02CanvasDragPreparationPatched) {
        const originalStartDraggingBlock = gestureProto.startDraggingBlock_;
        gestureProto.startDraggingBlock_ = function (...args) {
            // BlockDragger constructs InsertionMarkerManager before its start
            // method runs. Make sure that manager snapshots the exact model
            // coordinates for the complete dragged stack, including blocks
            // which are currently outside the Canvas viewport.
            const renderer = this.startWorkspace_ && this.startWorkspace_.canvasBlockRenderer;
            if (renderer && this.targetBlock_) {
                renderer.prepareBlockDrag(this.targetBlock_);
            }
            return originalStartDraggingBlock.apply(this, args);
        };
        gestureProto.__02CanvasDragPreparationPatched = true;
    }
    if (draggerProto && !draggerProto.__02CanvasDragPatched) {
        const originalStart = draggerProto.startBlockDrag;
        const originalDrag = draggerProto.dragBlock;
        const originalEnd = draggerProto.endBlockDrag;
        draggerProto.startBlockDrag = function (...args) {
            const renderer = this.workspace_ && this.workspace_.canvasBlockRenderer;
            if (renderer && this.draggingBlock_) {
                // Populate the native connection baseline from the cheap graph
                // projection before the dragger snapshots it. This avoids
                // forcing a complete native shape pass for a long stack.
                renderer.prepareDragConnections(this.draggingBlock_);
            }
            const connectionSnapshot = renderer &&
                renderer.captureDragConnectionPositions(this.draggedConnectionManager_);
            const sourceRoot = renderer && this.draggingBlock_ ?
                rootOf(this.draggingBlock_) : null;
            const sourceParent = renderer && this.draggingBlock_ &&
                this.draggingBlock_.getParent ? this.draggingBlock_.getParent() : null;
            const result = originalStart.apply(this, args);
            if (renderer && this.draggingBlock_) {
                // The native method has now completed unplug/translate. The
                // dragged root must be measured after that graph transition.
                renderer.prepareBlockDrag(this.draggingBlock_);
                renderer.beginBlockDrag(this.draggingBlock_, sourceRoot, sourceParent);
                // Canvas layout owns painting coordinates, while Blockly's
                // insertion manager owns drag coordinates. During a native
                // drag the latter must remain at its start snapshot because
                // InsertionMarkerManager adds currentDragDeltaXY_ to it.
                renderer.restoreDragConnectionPositions(connectionSnapshot);
            }
            if (renderer) renderer.scheduleDraw();
            return result;
        };
        draggerProto.dragBlock = function (...args) {
            const result = originalDrag.apply(this, args);
            const renderer = this.workspace_ && this.workspace_.canvasBlockRenderer;
            if (renderer) renderer.scheduleDraw();
            return result;
        };
        draggerProto.endBlockDrag = function (...args) {
            const result = originalEnd.apply(this, args);
            const renderer = this.workspace_ && this.workspace_.canvasBlockRenderer;
            if (renderer) {
                renderer.endBlockDrag(this.draggingBlock_);
                renderer.scheduleDraw();
            }
            return result;
        };
        draggerProto.__02CanvasDragPatched = true;
    }

    const originalBringToFront = blockProto.bringToFront;
    blockProto.bringToFront = function () {
        if (!isCanvasWorkspace(this.workspace)) return originalBringToFront.call(this);
        const renderer = this.workspace.canvasBlockRenderer;
        if (renderer) renderer.bringToFront(rootOf(this));
    };

    const originalDispose = blockProto.dispose;
    blockProto.dispose = function (...args) {
        const renderer = isCanvasWorkspace(this.workspace) && this.workspace.canvasBlockRenderer;
        // BlockAnimations.disposeUiEffect expects a real SVG Node and calls
        // goog.dom.contains on it. Canvas model nodes deliberately are not
        // DOM nodes, so keep the graph disposal but skip that SVG-only effect.
        if (renderer && args.length > 1 && args[1]) args[1] = false;
        const root = rootOf(this);
        const result = originalDispose.apply(this, args);
        if (renderer) renderer.invalidateBlock(root);
        return result;
    };

    const originalLazyMethods = [
        'createLazySvgPlaceholder', 'removeLazySvgPlaceholder',
        'updateLazySvgPlaceholder', 'updateLazySvgPlaceholderPosition_',
        'dematerializeLazySvg', 'rematerializeLazySvg'
    ];
    for (const name of originalLazyMethods) {
        const original = blockProto[name];
        if (!original) continue;
        blockProto[name] = function (...args) {
            if (isCanvasWorkspace(this.workspace)) return name.indexOf('materialize') >= 0 ? false : null;
            return original.apply(this, args);
        };
    }

    const connectionProto = ScratchBlocks.RenderedConnection && ScratchBlocks.RenderedConnection.prototype;
    if (connectionProto) {
        const originalTighten = connectionProto.tighten_;
        connectionProto.tighten_ = function () {
            const block = this.sourceBlock_;
            if (!isCanvasWorkspace(block && block.workspace)) return originalTighten.call(this);
            const renderer = block.workspace.canvasBlockRenderer;
            if (renderer && !renderer.renderingNative && !renderer.updatingConnections) {
                renderer.invalidateBlock(block);
            }
        };
        const originalHighlight = connectionProto.highlight;
        connectionProto.highlight = function () {
            const block = this.sourceBlock_;
            if (!isCanvasWorkspace(block && block.workspace)) return originalHighlight.call(this);
            const renderer = block.workspace.canvasBlockRenderer;
            if (renderer) renderer.setHighlightedConnection(this);
        };
        const originalUnhighlight = connectionProto.unhighlight;
        connectionProto.unhighlight = function () {
            const block = this.sourceBlock_;
            if (!isCanvasWorkspace(block && block.workspace)) return originalUnhighlight.call(this);
            const renderer = block.workspace.canvasBlockRenderer;
            if (renderer) renderer.setHighlightedConnection(null);
        };
    }

    const fieldProto = ScratchBlocks.Field && ScratchBlocks.Field.prototype;
    if (fieldProto) {
        const originalGetSize = fieldProto.getSize;
        fieldProto.getSize = function () {
            const block = this.sourceBlock_;
            if (!isCanvasWorkspace(block && block.workspace)) return originalGetSize.call(this);
            // Keep Blockly's original measurement implementation available to
            // the Canvas renderer. It updates textElement_, box_, arrow_ and
            // specialized field state exactly as the SVG renderer does.
            this.__02CanvasOriginalGetSize = originalGetSize;
            prepareField(this);
            const renderer = block.workspace.canvasBlockRenderer;
            return renderer ? renderer.measureField(this) : this.size_;
        };
        const originalAbsolute = fieldProto.getAbsoluteXY_;
        fieldProto.getAbsoluteXY_ = function () {
            const block = this.sourceBlock_;
            if (!isCanvasWorkspace(block && block.workspace)) return originalAbsolute.call(this);
            // Native Blockly uses the whole reporter as the click target when
            // it contains one text field. Respect that contract so the HTML
            // editor covers a shadow reporter instead of starting at its
            // internally padded text position.
            const clickTarget = this.getClickTarget_ && this.getClickTarget_();
            const rect = clickTarget && clickTarget.__02CanvasModelNode &&
                clickTarget.getBoundingClientRect ? clickTarget.getBoundingClientRect() :
                block.workspace.canvasBlockRenderer.getFieldClientRect(this);
            return {x: rect.left, y: rect.top};
        };
        const originalForce = fieldProto.forceRerender;
        fieldProto.forceRerender = function () {
            const block = this.sourceBlock_;
            if (!isCanvasWorkspace(block && block.workspace)) return originalForce.call(this);
            const renderer = block.workspace.canvasBlockRenderer;
            this.size_.width = 0;
            // Invalidating only the block leaves the model field one render
            // behind. Re-render the field model before laying out its block.
            if (typeof this.render_ === 'function') this.render_();
            if (renderer && !renderer.renderingNative) renderer.invalidateBlock(block);
        };
    }
};

class ModelCanvasBlockRenderer {
    static enableBlocklyCanvasMode (ScratchBlocks) {
        installBlocklyCanvasMode(ScratchBlocks);
    }

    constructor (workspace, ScratchBlocks) {
        this.workspace = workspace;
        this.ScratchBlocks = ScratchBlocks;
        this.rootLayouts = new Map();
        this.nativeBlockCache = new Map();
        this.fieldGeometry = new WeakMap();
        this.blockGeometry = new Map();
        this.imageCache = new Map();
        this.pathCache = new Map();
        this.hitContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
        this.enabled = false;
        this.layoutSuspended = false;
        this.pendingDraw = false;
        this.frame = null;
        this.layoutFrame = null;
        this.layoutTasks = new Map();
        this.projectionWorker = null;
        this.projectionWorkerURL = null;
        this.projectionWorkerDisabled = false;
        this.projectionRequestCounter = 0;
        this.renderingNative = false;
        this.loadingIndicatorStartedAt = 0;
        this.resizeObserver = null;
        this.highlightedConnection = null;
        this.zCounter = 1;
        this.draggingRoot = null;
        this.dragSourceRoot = null;
        this.dragSourceParent = null;
        this.dragStarted = false;
        this.lastDrawDuration = 0;
        this.lastLayoutDuration = 0;
        this.performanceTimer = null;
        this.performance = {
            startedAt: now(),
            draws: 0,
            drawTime: 0,
            drawMax: 0,
            layouts: 0,
            layoutTime: 0,
            layoutMax: 0,
            layoutBlocks: 0,
            nativeMeasurements: 0,
            nativeTime: 0,
            nativeMax: 0,
            projections: 0,
            projectionTime: 0,
            projectionMax: 0,
            projectionBlocks: 0,
            nativeReasons: {
                dirty: 0,
                notReady: 0,
                procedureHeader: 0,
                fieldNodes: 0
            },
            errors: 0
        };
        this.visibleBlockCount = 0;
        // Production rendering stays viewport-cropped. The isolated test page
        // can enable this flag to measure a complete scene in one pass.
        this.renderAllBlocks = false;
        this.deferFullRenderDraw = false;
        this.loadingWorkPending = false;
        // Use continuous batches while idle, then yield to animation frames
        // as soon as the user interacts with the workspace.
        this.loadingMode = 'adaptive';
        this.loadingRate = LAYOUT_SINGLE_ROOT_BUDGET;
        this.lastInteractionAt = 0;
        this.loadingPanel = null;
        this.loadingPanelStatus = null;
        this.loadingTimer = null;
        this.benchmarkWaitFrame = null;
        this.estimateCache = new Map();
        this.activeLayoutTask = null;
        this.viewportKey = null;
        this.workspaceMethodRestores = [];
        this.forceMaterializedIds = new Set();
        this.handleChange = this.handleChange.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);
        this.handleDocumentPaint = this.handleDocumentPaint.bind(this);
    }

    attach () {
        if (!this.workspace || this.workspace.isFlyout) return;
        // Blockly.Options does not preserve arbitrary properties reliably.
        // Keep the renderer mode on the workspace instance so every block
        // created after injection takes the model-only path.
        this.workspace.__02CanvasRendererEnabled = true;
        const injection = this.workspace.getInjectionDiv && this.workspace.getInjectionDiv();
        if (!injection) return;
        this.injection = injection;
        injection.classList.add('blocklyCanvasWorkspace');
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'blocklyCanvasRenderCanvas';
        Object.assign(this.canvas.style, {
            position: 'absolute',
            left: '0',
            right: '0',
            top: `${-CANVAS_TOP_PADDING}px`,
            height: `calc(100% + ${CANVAS_TOP_PADDING}px)`,
            width: '100%',
            display: 'block',
            pointerEvents: 'none',
            // Above the main SVG background, below Blockly's flyout (20),
            // scrollbars and drag surface. This keeps the toolbox interactive
            // when a workspace block is panned underneath it.
            zIndex: '1'
        });
        injection.appendChild(this.canvas);
        this.attachCommentLayer();
        this.context = this.canvas.getContext('2d', {alpha: true, desynchronized: true});
        this.workspace.canvasBlockRenderer = this;
        this.workspace.ensureBlockRendered = blockId => this.materializeBlock(blockId);
        this.workspace.ensureScriptRendered = blockId => this.materializeBlock(blockId);
        this.workspace.addChangeListener(this.handleChange);
        this.patchWorkspaceViewportMethods();
        injection.addEventListener('mousedown', this.handleMouseDown, true);
        injection.addEventListener('contextmenu', this.handleContextMenu, true);
        document.addEventListener('mousemove', this.handleDocumentPaint, true);
        document.addEventListener('mouseup', this.handleDocumentPaint, true);
        this.boundResize = () => this.scheduleDraw();
        window.addEventListener('resize', this.boundResize, {passive: true});
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(this.boundResize);
            this.resizeObserver.observe(injection);
        }
        this.setEnabled(true);
        this.startPerformanceMonitor();
    }

    startPerformanceMonitor () {
        if (this.performanceTimer || typeof setInterval !== 'function') return;
        this.performanceTimer = setInterval(() => {
            if (!this.workspace || !this.performance) return;
            const metrics = this.performance;
            const elapsed = Math.max(1, now() - metrics.startedAt);
            const snapshot = {
                elapsed: Math.round(elapsed),
                fps: Number((metrics.draws * 1000 / elapsed).toFixed(1)),
                draws: metrics.draws,
                drawMs: Number(metrics.drawTime.toFixed(1)),
                drawMaxMs: Number(metrics.drawMax.toFixed(1)),
                layouts: metrics.layouts,
                layoutMs: Number(metrics.layoutTime.toFixed(1)),
                layoutMaxMs: Number(metrics.layoutMax.toFixed(1)),
                layoutBlocks: metrics.layoutBlocks,
                nativeMeasurements: metrics.nativeMeasurements,
                nativeMs: Number(metrics.nativeTime.toFixed(1)),
                nativeMaxMs: Number(metrics.nativeMax.toFixed(1)),
                projections: metrics.projections,
                projectionMs: Number(metrics.projectionTime.toFixed(1)),
                projectionMaxMs: Number(metrics.projectionMax.toFixed(1)),
                projectionBlocks: metrics.projectionBlocks,
                nativeReasons: metrics.nativeReasons,
                visibleBlocks: this.visibleBlockCount,
                queue: this.layoutTasks.size,
                errors: metrics.errors
            };
            if (typeof console !== 'undefined' && console.info) {
                console.info('[02CanvasPerf]', JSON.stringify(snapshot));
            }
            this.updateTuningPanel();
        }, 1000);
    }

    recordPerformance (kind, duration, count = 0) {
        const metrics = this.performance;
        if (!metrics || !Number.isFinite(duration)) return;
        if (kind === 'draw') {
            metrics.draws++;
            metrics.drawTime += duration;
            metrics.drawMax = Math.max(metrics.drawMax, duration);
        } else if (kind === 'layout') {
            metrics.layouts++;
            metrics.layoutTime += duration;
            metrics.layoutMax = Math.max(metrics.layoutMax, duration);
            metrics.layoutBlocks += count;
        } else if (kind === 'native') {
            metrics.nativeMeasurements++;
            metrics.nativeTime += duration;
            metrics.nativeMax = Math.max(metrics.nativeMax, duration);
        } else if (kind === 'projection') {
            metrics.projections++;
            metrics.projectionTime += duration;
            metrics.projectionMax = Math.max(metrics.projectionMax, duration);
            metrics.projectionBlocks += count;
        }
    }

    recordNativeReason (reason) {
        if (this.performance && this.performance.nativeReasons &&
            Object.prototype.hasOwnProperty.call(this.performance.nativeReasons, reason)) {
            this.performance.nativeReasons[reason]++;
        }
    }

    resetPerformance () {
        if (!this.performance) return;
        this.performance.startedAt = now();
        this.performance.draws = 0;
        this.performance.drawTime = 0;
        this.performance.drawMax = 0;
        this.performance.layouts = 0;
        this.performance.layoutTime = 0;
        this.performance.layoutMax = 0;
        this.performance.layoutBlocks = 0;
        this.performance.nativeMeasurements = 0;
        this.performance.nativeTime = 0;
        this.performance.nativeMax = 0;
        this.performance.projections = 0;
        this.performance.projectionTime = 0;
        this.performance.projectionMax = 0;
        this.performance.projectionBlocks = 0;
        this.performance.errors = 0;
        for (const reason of Object.keys(this.performance.nativeReasons || {})) {
            this.performance.nativeReasons[reason] = 0;
        }
    }

    attachCommentLayer () {
        const bubbleCanvas = this.workspace && this.workspace.getBubbleCanvas &&
            this.workspace.getBubbleCanvas();
        const originalParent = bubbleCanvas && bubbleCanvas.parentNode;
        const originalNextSibling = bubbleCanvas && bubbleCanvas.nextSibling;
        if (!bubbleCanvas || !originalParent || !this.injection || this.commentLayer) return;

        const layer = document.createElementNS(SVG_NS, 'svg');
        layer.setAttribute('class', 'blocklyCanvasCommentLayer');
        layer.setAttribute('x', '0');
        layer.setAttribute('y', '0');
        layer.setAttribute('width', '100%');
        layer.setAttribute('height', '100%');
        layer.setAttribute('preserveAspectRatio', 'none');
        Object.assign(layer.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            width: '100%',
            height: '100%',
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: '2'
        });
        bubbleCanvas.style.pointerEvents = 'auto';
        this.injection.appendChild(layer);
        layer.appendChild(bubbleCanvas);
        this.commentLayer = layer;
        this.commentLayerBubbleCanvas = bubbleCanvas;
        this.commentLayerOriginalParent = originalParent;
        this.commentLayerOriginalNextSibling = originalNextSibling;
    }

    restoreCommentLayer () {
        const bubbleCanvas = this.commentLayerBubbleCanvas;
        const originalParent = this.commentLayerOriginalParent;
        if (bubbleCanvas && originalParent && bubbleCanvas.parentNode !== originalParent) {
            const nextSibling = this.commentLayerOriginalNextSibling;
            if (nextSibling && nextSibling.parentNode === originalParent) {
                originalParent.insertBefore(bubbleCanvas, nextSibling);
            } else {
                originalParent.appendChild(bubbleCanvas);
            }
        }
        if (bubbleCanvas) bubbleCanvas.style.pointerEvents = '';
        if (this.commentLayer) this.commentLayer.remove();
        this.commentLayer = null;
        this.commentLayerBubbleCanvas = null;
        this.commentLayerOriginalParent = null;
        this.commentLayerOriginalNextSibling = null;
    }

    createTuningPanel () {
        if (!this.injection || this.loadingPanel) return;
        const panel = document.createElement('div');
        panel.className = 'blocklyCanvasLoadingTuning';
        Object.assign(panel.style, {
            position: 'absolute',
            left: '8px',
            top: '8px',
            zIndex: '3',
            padding: '7px 9px',
            minWidth: '190px',
            color: '#575e75',
            background: 'rgba(255, 255, 255, .94)',
            border: '1px solid rgba(87, 94, 117, .25)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, .16)',
            font: '12px sans-serif',
            pointerEvents: 'auto'
        });
        const injectionRect = this.injection.getBoundingClientRect();
        const toolboxRight = Array.from(this.injection.querySelectorAll(
            '.blocklyToolboxDiv, .blocklyFlyout'
        )).reduce((right, element) => Math.max(right, element.getBoundingClientRect().right),
            injectionRect.left);
        panel.style.left = `${Math.max(8, toolboxRight - injectionRect.left + 8)}px`;
        const title = document.createElement('strong');
        title.textContent = 'Canvas loading';
        title.style.display = 'block';
        title.style.marginBottom = '5px';
        panel.appendChild(title);

        const modeLabel = document.createElement('label');
        modeLabel.textContent = 'Mode ';
        const mode = document.createElement('select');
        mode.innerHTML = '<option value="adaptive">Adaptive (idle fast)</option>' +
            '<option value="frame">Batched frames</option>' +
            '<option value="continuous">Continuous batches</option>' +
            '<option value="sync">Fast loading (responsive)</option>';
        mode.value = this.loadingMode;
        mode.style.maxWidth = '135px';
        mode.addEventListener('change', () => {
            this.loadingMode = mode.value;
            this.scheduleLayoutWork();
            this.scheduleDraw();
            this.updateTuningPanel();
        });
        modeLabel.appendChild(mode);
        panel.appendChild(modeLabel);

        const rateLabel = document.createElement('label');
        rateLabel.style.display = 'block';
        rateLabel.style.marginTop = '5px';
        const rateText = document.createElement('span');
        const rate = document.createElement('input');
        rate.type = 'range';
        rate.min = '2';
        rate.max = String(LAYOUT_MAX_RATE);
        rate.step = '1';
        rate.value = String(this.loadingRate);
        rate.style.width = '105px';
        rate.addEventListener('input', () => {
            this.loadingRate = Math.min(
                LAYOUT_MAX_RATE,
                Math.max(1, Number(rate.value) || LAYOUT_SINGLE_ROOT_BUDGET)
            );
            this.updateTuningPanel();
        });
        rateLabel.append('Rate ', rate, rateText);
        panel.appendChild(rateLabel);

        const status = document.createElement('div');
        status.style.marginTop = '5px';
        status.style.lineHeight = '1.3';
        panel.appendChild(status);
        const metrics = document.createElement('div');
        metrics.style.marginTop = '5px';
        metrics.style.lineHeight = '1.3';
        metrics.style.opacity = '0.8';
        panel.appendChild(metrics);
        this.injection.appendChild(panel);
        this.loadingPanel = panel;
        this.loadingPanelMode = mode;
        this.loadingPanelRate = rate;
        this.loadingPanelRateText = rateText;
        this.loadingPanelStatus = status;
        this.loadingPanelMetrics = metrics;
        this.updateTuningPanel();
    }

    updateTuningPanel (completed, total) {
        if (!this.loadingPanel) return;
        const active = this.activeLayoutTask || this.layoutTasks.values().next().value;
        const workerPending = Array.from(this.rootLayouts.values())
            .some(layout => layout.projectionPending);
        const done = typeof completed === 'number' ? completed : this.lastLoadingCompleted || 0;
        const all = typeof total === 'number' ? total : this.lastLoadingTotal || 0;
        const percent = all ? Math.round((done / all) * 100) : 100;
        const phase = active ? active.phase :
            (workerPending ? 'worker' : (this.loadingWorkPending ? 'queued' : 'idle'));
        const root = active && active.root ? `${active.root.type || 'block'}:${active.root.id}` : '-';
        const nativeProgress = active && active.phase === 'native' ?
            ` | native ${active.nativeIndex}/${active.nativeBlocks.length}` : '';
        this.loadingPanelRateText.textContent = `${this.loadingRate} ms/slice`;
        this.loadingPanelStatus.textContent = `${phase} ${percent}%${nativeProgress} | ` +
            `${this.layoutTasks.size} queue | ${root}`;
        if (this.loadingPanelMetrics && this.performance) {
            const metrics = this.performance;
            this.loadingPanelMetrics.textContent = [
                `draw ${this.lastDrawDuration.toFixed(1)}ms / ${this.visibleBlockCount}`,
                `layout ${this.lastLayoutDuration.toFixed(1)}ms`,
                `native ${metrics.nativeMeasurements} (${metrics.nativeTime.toFixed(1)}ms)`,
                `projection ${metrics.projections} (${metrics.projectionTime.toFixed(1)}ms)`
            ].join(' | ');
        }
    }

    restorePendingComments () {
        const pending = this.workspace && this.workspace.__02CanvasPendingComments;
        if (!pending || !pending.length || !this.workspace) return;
        this.workspace.__02CanvasPendingComments = [];
        const roots = new Set();
        for (const item of pending) {
            const block = item && item.block;
            if (this.isLiveBlock(block) && block.comment) roots.add(rootOf(block));
        }
        for (const root of roots) {
            if (root) this.ensureExactDragLayout(root);
        }
        for (const item of pending) {
            const block = item && item.block;
            const comment = block && block.comment;
            if (!this.isLiveBlock(block) || !comment || !comment.setVisible) continue;
            if (item.visible === false) {
                if (comment.isVisible && comment.isVisible()) comment.setVisible(false);
            } else {
                comment.setVisible(true);
            }
        }
        this.scheduleDraw();
    }

    patchWorkspaceViewportMethods () {
        const workspace = this.workspace;
        if (!workspace || workspace.__02CanvasViewportMethodsPatched) return;
        const renderer = this;
        const patch = (name, replacement) => {
            const original = workspace[name];
            if (typeof original !== 'function') return;
            workspace[name] = function (...args) {
                return replacement.call(this, original, args);
            };
            renderer.workspaceMethodRestores.push(() => {
                if (workspace[name]) workspace[name] = original;
            });
        };

        // The native workspace calls this after scrolling and during XML
        // loading. Canvas owns block visibility, so route the notification to
        // the viewport compiler instead of asking Blockly to materialize SVG.
        patch('renderVisibleTopBlocks', () => {
            renderer.ensureLayoutsAsync(renderer.getVisibleWorldBounds());
            renderer.scheduleDraw();
        });
        patch('ensureTopBlockRendered_', (original, args) => {
            const block = args[0];
            if (block && block.id) renderer.materializeBlock(block.id, true);
            return block || original.apply(workspace, args);
        });
        patch('translate', (original, args) => {
            const result = original.apply(workspace, args);
            renderer.scheduleDraw();
            return result;
        });
        patch('setScale', (original, args) => {
            const result = original.apply(workspace, args);
            renderer.scheduleDraw();
            return result;
        });
        workspace.__02CanvasViewportMethodsPatched = true;
        this.workspaceMethodRestores.push(() => {
            delete workspace.__02CanvasViewportMethodsPatched;
        });
    }

    getEstimateKey (block, ignoreFields, stack = false) {
        return `${block.id}:${ignoreFields ? 'no-fields' : 'fields'}${stack ? ':stack' : ''}`;
    }

    invalidateEstimateCacheForBlock (block) {
        if (!block || !block.id) return;
        this.estimateCache.delete(this.getEstimateKey(block, false));
        this.estimateCache.delete(this.getEstimateKey(block, true));
        this.estimateCache.delete(this.getEstimateKey(block, false, true));
        this.estimateCache.delete(this.getEstimateKey(block, true, true));
    }

    getEstimatedBaseSize (block, ignoreFields = false) {
        if (!block) return {width: 64, height: STACK_HEIGHT};
        const BlockSvg = this.ScratchBlocks.BlockSvg || {};
        let width = numberOr(block.width);
        let height = numberOr(block.height);
        if (width <= 0) {
            width = block.outputConnection ?
                numberOr(BlockSvg.MIN_BLOCK_X_OUTPUT, 48) :
                numberOr(BlockSvg.MIN_BLOCK_X, 96);
        }
        if (height <= 0) {
            height = block.outputConnection ?
                numberOr(BlockSvg.FIELD_HEIGHT, REPORTER_HEIGHT) :
                numberOr(BlockSvg.MIN_BLOCK_Y, STACK_HEIGHT);
        }

        if (!ignoreFields) {
            for (const input of block.inputList || []) {
                if (input.isVisible && !input.isVisible()) continue;
                let rowWidth = 0;
                let rowHeight = 0;
                for (const field of input.fieldRow || []) {
                    const size = field && field.size_;
                    const fieldWidth = numberOr(size && size.width) ||
                        Math.max(16, (fieldText(field).length * 8) + 16);
                    const fieldHeight = numberOr(size && size.height) ||
                        numberOr(BlockSvg.FIELD_HEIGHT, REPORTER_HEIGHT);
                    rowWidth += fieldWidth + numberOr(BlockSvg.SEP_SPACE_X, 8);
                    rowHeight = Math.max(rowHeight, fieldHeight);
                }
                width = Math.max(width, rowWidth + (BLOCK_PADDING_X * 2));
                height = Math.max(height, rowHeight);
            }
        }
        return {width, height};
    }

    getEstimatedBlockSize (block, ignoreFields = false, seen = new Set()) {
        if (!block) return {width: 64, height: STACK_HEIGHT};
        const key = this.getEstimateKey(block, ignoreFields);
        if (this.estimateCache.has(key)) return this.estimateCache.get(key);

        // A malformed or partially constructed workspace must not make the
        // recursive estimator loop forever. The base size is still a useful
        // conservative value for the edge that closes the cycle.
        if (seen.has(block.id)) return this.getEstimatedBaseSize(block, ignoreFields);
        seen.add(block.id);

        // Once Blockly has measured a clean block, width/height already include
        // all inline and statement inputs for that block. Re-walking those
        // children here both double-counts them and turns a large nested graph
        // into repeated recursive work.
        const nativeState = this.nativeBlockCache.get(block.id);
        if (nativeState && !nativeState.dirty && numberOr(block.width) > 0 && numberOr(block.height) > 0) {
            const measured = {width: numberOr(block.width), height: numberOr(block.height)};
            seen.delete(block.id);
            this.estimateCache.set(key, measured);
            return measured;
        }

        const BlockSvg = this.ScratchBlocks.BlockSvg || {};
        const base = this.getEstimatedBaseSize(block, ignoreFields);
        let width = base.width;
        let height = base.height;
        let currentRowHeight = 0;
        let currentRowWidth = numberOr(BlockSvg.SEP_SPACE_X, 8);
        let currentRowType = null;
        let lastInputType = null;
        let rowCount = 0;
        let totalRowHeight = 0;
        let hasStatement = false;
        let lastRowWasStatement = false;

        const finishInlineRow = () => {
            if (currentRowType === 'inline') {
                width = Math.max(width, currentRowWidth + numberOr(BlockSvg.SEP_SPACE_X, 8));
            }
            if (currentRowType) totalRowHeight += currentRowHeight;
            currentRowHeight = 0;
            currentRowWidth = numberOr(BlockSvg.SEP_SPACE_X, 8);
            currentRowType = null;
        };

        for (const input of block.inputList || []) {
            if (input.isVisible && !input.isVisible()) continue;
            const connection = input.connection;
            const isStatement = connection && connection.type === this.ScratchBlocks.NEXT_STATEMENT;
            const rowType = isStatement ? 'statement' : 'inline';
            const startsNewRow = isStatement || !currentRowType || lastInputType === this.ScratchBlocks.NEXT_STATEMENT;
            if (startsNewRow) {
                finishInlineRow();
                currentRowType = rowType;
                rowCount++;
                currentRowHeight = 0;
                currentRowWidth = numberOr(BlockSvg.SEP_SPACE_X, 8);
            }
            lastRowWasStatement = isStatement;

            let fieldWidth = 0;
            let fieldHeight = 0;
            if (!ignoreFields) {
                for (const field of input.fieldRow || []) {
                    const size = field && field.size_;
                    fieldWidth += numberOr(size && size.width) ||
                        Math.max(16, (fieldText(field).length * 8) + 16);
                    fieldWidth += numberOr(BlockSvg.SEP_SPACE_X, 8);
                    fieldHeight = Math.max(fieldHeight,
                        numberOr(size && size.height, numberOr(BlockSvg.FIELD_HEIGHT, REPORTER_HEIGHT)));
                }
            }
            currentRowWidth += fieldWidth;
            currentRowHeight = Math.max(currentRowHeight, fieldHeight,
                isStatement ? numberOr(BlockSvg.MIN_STATEMENT_INPUT_HEIGHT, STACK_HEIGHT) :
                    numberOr(BlockSvg.MIN_BLOCK_Y, STACK_HEIGHT));

            const child = connection && connection.targetBlock && connection.targetBlock();
            if (child) {
                const childSize = isStatement ?
                    this.getEstimatedHeightWidth(child, ignoreFields, seen) :
                    this.getEstimatedBlockSize(child, ignoreFields, seen);
                if (isStatement) {
                    hasStatement = true;
                    const canUseNotch = !child.lastConnectionInStack || child.lastConnectionInStack();
                    const childHeight = childSize.height - (canUseNotch ?
                        numberOr(BlockSvg.NOTCH_HEIGHT, NOTCH_DEPTH) : 0);
                    currentRowHeight = Math.max(currentRowHeight, childHeight);
                    width = Math.max(width,
                        currentRowWidth + numberOr(BlockSvg.STATEMENT_INPUT_EDGE_WIDTH, STATEMENT_INDENT) +
                            childSize.width);
                } else if (connection.type === this.ScratchBlocks.INPUT_VALUE) {
                    currentRowWidth += childSize.width + numberOr(BlockSvg.SEP_SPACE_X, 8);
                    currentRowHeight = Math.max(currentRowHeight,
                        childSize.height + (2 * numberOr(BlockSvg.INLINE_PADDING_Y, 4)));
                }
            } else if (connection && connection.type === this.ScratchBlocks.INPUT_VALUE) {
                currentRowWidth += numberOr(BlockSvg.INPUT_SHAPE_ROUND_WIDTH, 44) +
                    numberOr(BlockSvg.SEP_SPACE_X, 8);
            }

            if (isStatement) {
                finishInlineRow();
            }
            lastInputType = input.type;
        }
        finishInlineRow();
        height = Math.max(height, totalRowHeight);
        if (lastRowWasStatement && rowCount && block.type !== this.ScratchBlocks.PROCEDURES_DEFINITION_BLOCK_TYPE) {
            height = Math.max(height, totalRowHeight + numberOr(BlockSvg.EXTRA_STATEMENT_ROW_Y, 16));
        }
        if (hasStatement) {
            width = Math.max(width, numberOr(BlockSvg.MIN_BLOCK_X_WITH_STATEMENT, width));
        }
        seen.delete(block.id);
        const result = {width, height};
        this.estimateCache.set(key, result);
        return result;
    }

    getProjectionBlockSize (block) {
        if (!block) return {width: 64, height: STACK_HEIGHT};
        const state = this.nativeBlockCache.get(block.id);
        if (state && !state.dirty && numberOr(block.width) > 0 && numberOr(block.height) > 0) {
            return {width: numberOr(block.width), height: numberOr(block.height)};
        }
        // Projection only needs a conservative rectangle. Calling the full
        // stack estimator here would walk every NEXT link before the first
        // visible block can paint in a large project.
        return this.getEstimatedBaseSize(block, false);
    }

    getEstimatedHeightWidth (block, ignoreFields = false, seen = new Set()) {
        if (!block) return {width: 64, height: STACK_HEIGHT};
        const key = this.getEstimateKey(block, ignoreFields, true);
        if (this.estimateCache.has(key)) return this.estimateCache.get(key);
        if (seen.has(block.id)) return this.getEstimatedBaseSize(block, ignoreFields);

        // Long Scratch scripts regularly contain thousands of NEXT links.
        // Compute that chain bottom-up so stack dimensions are linear and do
        // not depend on the JavaScript recursion limit.
        const chain = [];
        const visited = new Set(seen);
        let current = block;
        let accumulated = null;
        while (current && !visited.has(current.id)) {
            const currentKey = this.getEstimateKey(current, ignoreFields, true);
            if (this.estimateCache.has(currentKey)) {
                accumulated = this.estimateCache.get(currentKey);
                break;
            }
            visited.add(current.id);
            chain.push(current);
            current = current.getNextBlock && current.getNextBlock();
        }
        if (current && !accumulated) {
            accumulated = this.getEstimatedBaseSize(current, ignoreFields);
        }
        const notchHeight = numberOr(
            this.ScratchBlocks.BlockSvg && this.ScratchBlocks.BlockSvg.NOTCH_HEIGHT,
            NOTCH_DEPTH
        );
        for (let index = chain.length - 1; index >= 0; index--) {
            const currentBlock = chain[index];
            const own = this.getEstimatedBlockSize(currentBlock, ignoreFields, new Set(seen));
            const result = accumulated ? {
                width: Math.max(own.width, accumulated.width),
                height: Math.max(own.height, own.height + accumulated.height - notchHeight)
            } : own;
            this.estimateCache.set(this.getEstimateKey(currentBlock, ignoreFields, true), result);
            accumulated = result;
        }
        return accumulated || this.getEstimatedBaseSize(block, ignoreFields);
    }

    dispose () {
        if (!this.workspace) return;
        // Invalidate comment and rendering callbacks before detaching any DOM
        // owned by this renderer. The old workspace may still receive a final
        // Blockly event while React is mounting the next target.
        this.workspace.__02CanvasRendererDisposing = true;
        this.workspace.removeChangeListener(this.handleChange);
        for (const restore of this.workspaceMethodRestores) restore();
        this.workspaceMethodRestores = [];
        if (this.injection) this.injection.removeEventListener('mousedown', this.handleMouseDown, true);
        if (this.injection) this.injection.removeEventListener('contextmenu', this.handleContextMenu, true);
        document.removeEventListener('mousemove', this.handleDocumentPaint, true);
        document.removeEventListener('mouseup', this.handleDocumentPaint, true);
        window.removeEventListener('resize', this.boundResize);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        if (this.loadingTimer !== null) clearTimeout(this.loadingTimer);
        if (this.benchmarkWaitFrame !== null) cancelAnimationFrame(this.benchmarkWaitFrame);
        this.benchmarkWaitFrame = null;
        this.deferFullRenderDraw = false;
        if (this.performanceTimer !== null) clearInterval(this.performanceTimer);
        this.performanceTimer = null;
        this.restoreCommentLayer();
        if (this.loadingPanel) this.loadingPanel.remove();
        if (this.canvas) this.canvas.remove();
        delete this.workspace.canvasBlockRenderer;
        delete this.workspace.__02CanvasRendererEnabled;
        delete this.workspace.ensureBlockRendered;
        delete this.workspace.ensureScriptRendered;
        this.pathCache.clear();
        this.nativeBlockCache.clear();
        this.estimateCache.clear();
        textMetricsCache.clear();
        if (this.projectionWorker) this.projectionWorker.terminate();
        if (this.projectionWorkerURL) URL.revokeObjectURL(this.projectionWorkerURL);
        this.projectionWorker = null;
        this.projectionWorkerURL = null;
        this.forceMaterializedIds.clear();
        this.draggingRoot = null;
        this.dragSourceRoot = null;
        this.dragSourceParent = null;
        this.dragStarted = false;
        this.layoutTasks.clear();
        if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
        this.workspace.__02CanvasRendererDisposed = true;
        delete this.workspace.__02CanvasRendererDisposing;
        this.workspace = null;
    }

    setEnabled (enabled) {
        this.enabled = !!enabled && !!this.context;
        if (this.enabled) this.invalidateAll();
        else this.clear();
    }

    setRenderAllBlocks (enabled) {
        this.renderAllBlocks = enabled === true;
        this.viewportKey = null;
        for (const task of this.layoutTasks.values()) {
            task.layout.inProgress = false;
            task.layout.processing = false;
            if (task.layout.pendingScene === task.scene) task.layout.pendingScene = null;
        }
        this.layoutTasks.clear();
        this.invalidateAll();
    }

    materializeAllBlocksForBenchmark () {
        if (!this.workspace || this.layoutSuspended) return Promise.resolve(false);
        this.renderAllBlocks = true;
        this.deferFullRenderDraw = true;
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
        if (this.loadingTimer !== null) clearTimeout(this.loadingTimer);
        this.frame = null;
        this.layoutFrame = null;
        this.loadingTimer = null;
        for (const task of this.layoutTasks.values()) {
            task.layout.inProgress = false;
            task.layout.processing = false;
            if (task.layout.pendingScene === task.scene) task.layout.pendingScene = null;
        }
        this.layoutTasks.clear();
        this.invalidateAll();

        // Keep the benchmark on the same yielding queue as the editor. The
        // previous implementation called layoutRoot(..., Infinity), which
        // made a large procedure script monopolize the event loop and made
        // the page appear frozen even though the work was finite.
        return new Promise(resolve => {
            const deadline = now() + 180000;
            const waitForLayouts = () => {
                this.benchmarkWaitFrame = null;
                if (!this.enabled || now() >= deadline) {
                    this.deferFullRenderDraw = false;
                    resolve(false);
                    return;
                }
                const roots = this.workspace.getTopBlocks ?
                    this.workspace.getTopBlocks(false) : [];
                const layouts = roots.map(root => this.rootLayouts.get(root.id)).filter(Boolean);
                const complete = layouts.length === roots.length && layouts.every(layout => {
                    const projectedCount = layout.projectedBlocks ? layout.projectedBlocks.size : 0;
                    return !layout.projectionPending && !layout.inProgress &&
                        !layout.dirty && layout.geometries.length >= projectedCount;
                });
                if (complete && this.layoutTasks.size === 0) {
                    this.deferFullRenderDraw = false;
                    this.pendingDraw = false;
                    this.draw();
                    resolve(true);
                    return;
                }
                this.scheduleDraw();
                this.benchmarkWaitFrame = requestAnimationFrame(waitForLayouts);
            };
            // Seed the queue once. Subsequent slices intentionally do not
            // repaint the growing full scene until every layout is complete.
            this.draw();
            this.benchmarkWaitFrame = requestAnimationFrame(waitForLayouts);
        });
    }

    captureDragConnectionPositions (connectionManager) {
        const topBlock = connectionManager && connectionManager.topBlock_;
        if (!topBlock || typeof topBlock.getDescendants !== 'function') return null;
        const connections = new Set();
        for (const block of topBlock.getDescendants(false)) {
            if (!block || typeof block.getConnections_ !== 'function') continue;
            for (const connection of block.getConnections_(false)) connections.add(connection);
        }
        return Array.from(connections)
            .filter(connection => connection && Number.isFinite(connection.x_) &&
                Number.isFinite(connection.y_))
            .map(connection => ({connection, x: connection.x_, y: connection.y_}));
    }

    restoreDragConnectionPositions (snapshot) {
        if (!snapshot) return;
        for (const item of snapshot) {
            const connection = item.connection;
            if (!connection || typeof connection.moveTo !== 'function') continue;
            connection.moveTo(item.x, item.y);
        }
    }

    beginBlockDrag (block, sourceRoot = null, sourceParent = null) {
        const root = rootOf(block);
        this.draggingRoot = root && root.id ? root : null;
        this.dragSourceRoot = sourceRoot && sourceRoot !== root ? sourceRoot : null;
        this.dragSourceParent = sourceParent && sourceParent !== root ? sourceParent : null;
        this.dragStarted = false;
        if (!root || !this.workspace) return;
        // Keep the dragged root paintable outside the old viewport. Descendants
        // still participate in Blockly's graph and connection calculations,
        // but painting every descendant made starting a drag of a large stack
        // an O(N) synchronous operation. The normal viewport dependency pass
        // adds only the visible inline children.
        if (root.id) this.forceMaterializedIds.add(root.id);
        this.materializeBlock(root.id, true);
        this.dragStarted = true;
    }

    prepareBlockDrag (block, startPosition = null) {
        if (!this.isLiveBlock(block) || this.layoutSuspended) return;
        const root = rootOf(block);
        // Flyout placement uses SVG surface origins to derive startXY_. The
        // model-only root position does not inherit that DOM transform, so use
        // BlockDragger's authoritative start coordinate before connection
        // matching begins. Existing workspace drags already have equal values.
        if (startPosition && root === block) {
            root.__02CanvasPosition = {x: startPosition.x, y: startPosition.y};
            root.__02CanvasDragPosition = null;
            this.invalidatePosition(root);
        }
        // The insertion manager snapshots the dragged connections before the
        // first drag frame. Project the complete graph and update only its
        // connection coordinates. Native shape compilation remains viewport
        // driven and can continue asynchronously after the gesture starts.
        this.prepareDragConnections(root);
        const layout = root && this.rootLayouts.get(root.id);
        if (layout) this.updateConnectionPositions(layout);
    }

    prepareDragConnections (block) {
        if (!this.isLiveBlock(block) || this.layoutSuspended) return;
        const root = rootOf(block);
        const layout = this.getRootLayout(root);
        this.ensureProjection(layout);
        this.updateProjectedConnectionPositions(layout);
    }

    ensureExactDragLayout (root) {
        if (!this.isLiveBlock(root) || this.layoutSuspended) return;
        const layout = this.getRootLayout(root);
        this.ensureProjection(layout);
        const projectedCount = layout.projectedBlocks.size;
        const materializedCount = layout.geometries.reduce((count, geometry) =>
            count + (geometry && this.isLiveBlock(geometry.block) ? 1 : 0), 0);
        if (layout.dirty || layout.inProgress || materializedCount < projectedCount) {
            // Comments only need the current projected position. Do not turn
            // restoring one comment into a synchronous native render of the
            // entire script; the normal viewport task will refine its shape.
            this.updateVisibleProjection(layout, this.getVisibleWorldBounds());
            this.scheduleDraw();
        } else {
            this.updateConnectionPositions(layout);
        }
    }

    updateProjectedConnectionPositions (layout) {
        if (!layout || !this.isLiveBlock(layout.root) ||
            !layout.projectedPositions || !layout.projectedBlocks) return;
        const rootPosition = getRootPosition(layout.root);
        this.updatingConnections = true;
        try {
            for (const [id, block] of layout.projectedBlocks) {
                if (!this.isLiveBlock(block)) continue;
                const position = layout.projectedPositions.get(id);
                if (!position) continue;
                const topLeft = {
                    x: rootPosition.x + position.x,
                    y: rootPosition.y + position.y
                };
                for (const connection of block.getConnections_ ? block.getConnections_(true) : []) {
                    if (connection && connection.moveToOffset) connection.moveToOffset(topLeft);
                }
            }
        } finally {
            this.updatingConnections = false;
        }
    }

    endBlockDrag (block) {
        // The native end phase may connect the dragged block before this
        // renderer callback runs. In that case rootOf(block) is already the
        // destination stack, not the root that was protected during drag.
        const draggedRoot = this.draggingRoot || rootOf(block);
        const sourceRoot = this.dragSourceRoot;
        const sourceParent = this.dragSourceParent;
        const destinationRoot = rootOf(block);
        this.draggingRoot = null;
        this.dragSourceRoot = null;
        this.dragSourceParent = null;
        this.dragStarted = false;
        if (draggedRoot && draggedRoot.id) this.forceMaterializedIds.delete(draggedRoot.id);
        // Refresh both sides after a substack is removed or inserted. The
        // source root is kept separately because rootOf(block) now points at
        // the detached or destination stack after Blockly finishes the drag.
        if (sourceParent) this.invalidateBlock(sourceParent);
        if (sourceRoot && sourceRoot !== destinationRoot) this.invalidateBlock(sourceRoot);
        if (draggedRoot) this.invalidateBlock(draggedRoot);
        if (destinationRoot && destinationRoot !== draggedRoot) {
            this.invalidateBlock(destinationRoot);
        }
    }

    setLoading (loading) {
        this.layoutSuspended = !!loading;
        if (this.layoutSuspended) {
            this.pendingDraw = true;
            if (this.frame !== null) {
                cancelAnimationFrame(this.frame);
                this.frame = null;
            }
            if (this.layoutFrame !== null) {
                cancelAnimationFrame(this.layoutFrame);
                this.layoutFrame = null;
            }
            if (this.loadingTimer !== null) {
                clearTimeout(this.loadingTimer);
                this.loadingTimer = null;
            }
            this.layoutTasks.clear();
            for (const layout of this.rootLayouts.values()) {
                layout.inProgress = false;
                layout.processing = false;
            }
            this.clear();
            return;
        }
        if (this.pendingDraw) {
            this.pendingDraw = false;
            this.invalidateAll();
        }
    }

    reset () {
        this.resetPerformance();
        this.deferFullRenderDraw = false;
        if (this.layoutFrame !== null) {
            cancelAnimationFrame(this.layoutFrame);
            this.layoutFrame = null;
        }
        if (this.loadingTimer !== null) {
            clearTimeout(this.loadingTimer);
            this.loadingTimer = null;
        }
        this.layoutTasks.clear();
        this.draggingRoot = null;
        this.dragSourceRoot = null;
        this.dragSourceParent = null;
        this.dragStarted = false;
        this.lastInteractionAt = 0;
        this.rootLayouts.clear();
        this.nativeBlockCache.clear();
        this.blockGeometry.clear();
        this.fieldGeometry = new WeakMap();
        this.estimateCache.clear();
        this.loadingIndicatorStartedAt = 0;
        this.loadingWorkPending = false;
        this.lastLoadingCompleted = 0;
        this.lastLoadingTotal = 0;
        this.viewportKey = null;
        textMetricsCache.clear();
        if (this.layoutSuspended) this.pendingDraw = true;
        else this.invalidateAll();
    }

    invalidateStyles () {
        textMetricsCache.clear();
        this.invalidateAll();
    }

    invalidateAll () {
        // Estimate entries have mode and stack suffixes in their keys. A
        // bare block id never matched those keys, so stale nested dimensions
        // survived imports and later field/mutation changes.
        this.estimateCache.clear();
        // Dropping the measurement cache is equivalent to marking every entry
        // dirty, without a synchronous getAllBlocks() walk on a huge target.
        this.nativeBlockCache.clear();
        for (const layout of this.rootLayouts.values()) {
            layout.dirty = true;
            layout.projectionDirty = true;
            layout.cachedRootBounds = null;
            layout.projectionBounds = null;
            layout.projectionWorkerFailed = false;
            layout.version = numberOr(layout.version) + 1;
            if (layout.inProgress) {
                layout.inProgress = false;
                layout.processing = false;
                this.layoutTasks.delete(layout.root.id);
                layout.pendingScene = null;
            }
        }
        const roots = this.workspace && this.workspace.getTopBlocks ? this.workspace.getTopBlocks(false) : [];
        for (const root of roots) this.getRootLayout(root).dirty = true;
        this.scheduleDraw();
    }

    invalidateBlock (block) {
        if (!block) return;
        // XML import can attach thousands of descendants. The complete Canvas
        // state is reset when loading finishes, so maintaining partial root
        // layouts here only adds quadratic work without producing a frame.
        if (this.layoutSuspended) {
            this.pendingDraw = true;
            return;
        }
        if (this.isDraggedBlock(block)) {
            this.invalidatePosition(this.draggingRoot);
            return;
        }
        let current = block;
        while (current) {
            const state = this.nativeBlockCache.get(current.id) || {dirty: true};
            state.dirty = true;
            this.nativeBlockCache.set(current.id, state);
            this.invalidateEstimateCacheForBlock(current);
            current = current.getParent && current.getParent();
        }
        const root = rootOf(block);
        if (root && root.id) {
            const layout = this.getRootLayout(root);
            layout.dirty = true;
            layout.projectionDirty = true;
            layout.cachedRootBounds = null;
            layout.projectionBounds = null;
            layout.projectionWorkerFailed = false;
            layout.version = numberOr(layout.version) + 1;
            // A structure or field change invalidates the partial task. Let
            // the next frame build a fresh graph instead of committing a
            // layout computed from stale connections.
            if (layout.inProgress) {
                layout.inProgress = false;
                layout.processing = false;
                this.layoutTasks.delete(root.id);
                layout.pendingScene = null;
            }
        }
        this.scheduleDraw();
    }

    invalidatePosition (root) {
        if (root && root.id) this.getRootLayout(root).positionDirty = true;
        this.scheduleDraw();
    }

    isDraggedBlock (block) {
        return !!(this.dragStarted && this.draggingRoot && block &&
            rootOf(block) === this.draggingRoot);
    }

    isUserInteracting () {
        return !!(this.draggingRoot ||
            (this.workspace && this.workspace.currentGesture_) ||
            now() - this.lastInteractionAt < 150);
    }

    handleChange (event) {
        const eventType = String((event && event.type) || '').toLowerCase();
        const block = event && event.blockId && this.workspace.getBlockById(event.blockId);
        if (eventType === 'move' && (event.oldParentId || event.newParentId)) {
            // Disconnecting or inserting a stack changes both sides of the
            // graph. Looking up blockId after Blockly applies the event only
            // finds its new root, so the old script used to keep stale
            // projection/geometry until another unrelated edit refreshed it.
            // Invalidate the direct parents as well as their roots: a C-shaped
            // parent derives its height from the removed child, and invalidating
            // only the root does not dirty that parent's native measurement.
            const affectedBlocks = new Set();
            const addBlock = candidate => {
                if (this.isLiveBlock(candidate)) affectedBlocks.add(candidate);
            };
            addBlock(block);
            addBlock(event.oldParentId && this.workspace.getBlockById(event.oldParentId));
            addBlock(event.newParentId && this.workspace.getBlockById(event.newParentId));
            for (const affectedBlock of affectedBlocks) this.invalidateBlock(affectedBlock);
            this.lastInteractionAt = now();
            return;
        }
        if (block && eventType === 'move' &&
            this.isDraggedBlock(block)) {
            this.lastInteractionAt = now();
            // Pointer movement changes only the root transform. Blockly's
            // dragger still owns graph changes; defer shape invalidation until
            // the gesture ends so each mouse event cannot restart layout work.
            this.invalidatePosition(this.draggingRoot);
            return;
        }
        if (block && eventType === 'move' &&
            !event.oldParentId && !event.newParentId) this.invalidatePosition(rootOf(block));
        else if (block) this.invalidateBlock(block);
        else if (!event || !event.type || [
            'create', 'delete', 'change', 'move', 'finished_loading'
        ].includes(eventType)) this.invalidateAll();
        else this.scheduleDraw();
    }

    materializeBlock (blockId, immediate = false) {
        const block = this.workspace && this.workspace.getBlockById(blockId);
        if (this.isLiveBlock(block)) {
            this.ensureBlockModel(block);
            this.forceMaterializedIds.add(block.id);
            this.invalidateBlock(block);
            if (immediate && !this.layoutSuspended) {
                const root = rootOf(block);
                const layout = this.getRootLayout(root);
                layout.dirty = true;
                this.layoutTasks.delete(root.id);
                this.ensureLayoutsForRoot(this.getVisibleWorldBounds(), root);
                this.forceMaterializedIds.delete(block.id);
                this.bringToFront(root);
                // A newly-created flyout block must be visible in the same
                // event turn in which Blockly starts its drag.
                this.draw();
            }
        }
        return block;
    }

    ensureBlockModel (block) {
        if (!this.isLiveBlock(block)) return block;
        // initSvg is intercepted above for Canvas workspaces. It initializes
        // fields and compatibility handles without invoking native SVG code.
        if (!(block.svgGroup_ && block.svgGroup_.__02CanvasModelNode) &&
            typeof block.initSvg === 'function') block.initSvg();
        if (!(block.svgGroup_ && block.svgGroup_.__02CanvasModelNode)) return block;

        // Mutation blocks and blocks created by XML import can acquire inputs
        // after their first initSvg call. Native Blockly initializes those
        // fields during its next render; Canvas must do the same before reading
        // their model nodes or dimensions.
        for (const input of block.inputList || []) {
            if (typeof input.init === 'function') input.init();
            if (!input.outlinePath && typeof input.initOutlinePath === 'function') {
                input.initOutlinePath(block.svgGroup_);
            }
            for (const field of input.fieldRow || []) {
                field.sourceBlock_ = block;
                const prepareField = this.ScratchBlocks.__02PrepareCanvasField;
                if (prepareField) prepareField(field);
            }
        }
        for (const icon of block.getIcons ? block.getIcons() : []) prepareCanvasIcon(icon);
        return block;
    }

    isLiveBlock (block) {
        if (!this.workspace || !block || block.workspace !== this.workspace || !block.id) return false;
        return !this.workspace.getBlockById || this.workspace.getBlockById(block.id) === block;
    }

    bringToFront (root) {
        root.__02CanvasZ = ++this.zCounter;
        this.scheduleDraw();
    }

    setHighlightedConnection (connection) {
        this.highlightedConnection = connection;
        this.scheduleDraw();
    }

    getRootLayout (root) {
        let layout = this.rootLayouts.get(root.id);
        if (!layout) {
            layout = {
                root,
                dirty: true,
                projectionDirty: true,
                version: 0,
                positionDirty: false,
                geometries: [],
                fields: [],
                buckets: new Map(),
                bounds: null,
                pendingScene: null,
                processing: false,
                skippedIds: new Set(),
                skippedVersion: -1,
                projectionBounds: null,
                cachedRootBounds: null,
                projectedPositions: new Map(),
                projectedPaintBounds: new Map(),
                projectedBuckets: new Map(),
                projectedBlocks: new Map(),
                visibleIds: new Set(),
                lastNearAt: now(),
                lastViewportDistance: Infinity,
                projectionBuiltAt: 0,
                projectionPending: false,
                projectionRequestId: 0,
                projectionRequestVersion: -1,
                projectionSnapshotBlocks: null,
                projectionWorkerFailed: false
            };
            this.rootLayouts.set(root.id, layout);
        }
        layout.root = root;
        return layout;
    }

    needsNativeMeasurement (block) {
        if (!this.isLiveBlock(block)) return false;
        if (typeof block.renderCompute_ !== 'function' ||
            typeof block.renderDraw_ !== 'function') {
            this.recordNativeReason('notReady');
            return false;
        }
        const state = this.nativeBlockCache.get(block.id);
        if (!state || state.dirty || !block.rendered || !block.svgPath_ ||
            !block.svgPath_.getAttribute('d')) {
            this.recordNativeReason('dirty');
            return true;
        }
        if (block.type === this.ScratchBlocks.PROCEDURES_DEFINITION_BLOCK_TYPE) {
            const customBlockInput = block.getInput && block.getInput('custom_block');
            const prototype = customBlockInput && customBlockInput.connection &&
                customBlockInput.connection.targetBlock &&
                customBlockInput.connection.targetBlock();
            if (!prototype || prototype === block) return false;
            const headerSignature = [
                prototype.id,
                numberOr(prototype.width),
                numberOr(prototype.height),
                prototype.svgPath_ && prototype.svgPath_.getAttribute('d')
            ].join(':');
            if (state.procedureHeaderSignature !== headerSignature) {
                this.recordNativeReason('procedureHeader');
                return true;
            }
            return false;
        }
        for (const input of block.inputList || []) {
            for (const field of input.fieldRow || []) {
                if (!field.fieldGroup_ && !field.textElement_) {
                    this.recordNativeReason('fieldNodes');
                    return true;
                }
            }
        }
        return false;
    }

    renderNativeBlock (block) {
        if (!this.isLiveBlock(block)) return;
        const state = this.nativeBlockCache.get(block.id) || {dirty: true};
        if (!this.needsNativeMeasurement(block)) return;
        const beforeMeasurement = this.getBlockMeasurementSignature(block);
        const wasRenderingNative = this.renderingNative;
        this.renderingNative = true;
        try {
            // Field and model-node initialization must be inside the native
            // compilation guard. Those lightweight nodes intentionally call
            // invalidate() when addons mutate them outside this pass.
            this.ensureBlockModel(block);
            if (!this.isLiveBlock(block)) return;
            const hasUninitializedField = (block.inputList || []).some(input =>
                (input.fieldRow || []).some(field => !field.fieldGroup_ && !field.textElement_)
            );
            // A definition hat derives its right edge from the connected
            // procedure prototype. Track that dependency explicitly: some
            // procedure mutations invalidate the prototype before Blockly has
            // emitted a parent event, so a clean cached hat can otherwise keep
            // its old width and field colour/layout until the next click.
            if (block.type === this.ScratchBlocks.PROCEDURES_DEFINITION_BLOCK_TYPE) {
                const customBlockInput = block.getInput && block.getInput('custom_block');
                const prototype = customBlockInput && customBlockInput.connection &&
                    customBlockInput.connection.targetBlock &&
                    customBlockInput.connection.targetBlock();
                if (prototype && prototype !== block) {
                    this.renderNativeModel(prototype, new Set([block.id]));
                    const headerSignature = [
                        prototype.id,
                        numberOr(prototype.width),
                        numberOr(prototype.height),
                        prototype.svgPath_ && prototype.svgPath_.getAttribute('d')
                    ].join(':');
                    if (state.procedureHeaderSignature !== headerSignature) {
                        state.dirty = true;
                        state.procedureHeaderSignature = headerSignature;
                    }
                }
            }
            if (!state.dirty && !hasUninitializedField && block.svgPath_ &&
                block.svgPath_.getAttribute('d')) return;
            if (typeof block.renderCompute_ !== 'function' || typeof block.renderDraw_ !== 'function') return;
            // A custom block-shape addon can change FIELD_HEIGHT and padding
            // without changing the field value. Force ordinary fields through
            // Blockly's normal render_ path so cached dimensions do not survive a
            // style refresh and make the following blocks jump on first click.
            for (const input of block.inputList || []) {
                for (const field of input.fieldRow || []) {
                    if (!field.size_) continue;
                    if (!Number.isFinite(field.width_) || !Number.isFinite(field.height_)) {
                        field.size_.width = 0;
                    }
                }
            }
            let cursorX = this.ScratchBlocks.BlockSvg.SEP_SPACE_X || 0;
            if (block.RTL) cursorX = -cursorX;
            let scratchCommentIcon = null;
            for (const icon of block.getIcons ? block.getIcons() : []) {
                prepareCanvasIcon(icon);
                if (this.ScratchBlocks.ScratchBlockComment &&
                    icon instanceof this.ScratchBlocks.ScratchBlockComment) {
                    scratchCommentIcon = icon;
                } else if (typeof icon.renderIcon === 'function') {
                    cursorX = icon.renderIcon(cursorX);
                }
            }
            cursorX += block.RTL ?
                this.ScratchBlocks.BlockSvg.SEP_SPACE_X : -this.ScratchBlocks.BlockSvg.SEP_SPACE_X;
            if (block.isScratchExtension && block.outputConnection) {
                cursorX += block.RTL ?
                    -this.ScratchBlocks.BlockSvg.GRID_UNIT : this.ScratchBlocks.BlockSvg.GRID_UNIT;
            }
            const inputRows = block.renderCompute_(cursorX);
            block.renderDraw_(cursorX, inputRows);
            // FieldDropdown and several custom fields create their presentation
            // nodes during renderDraw_. Normalize that late-created state before
            // Canvas reads attributes or addons query the field handles.
            const prepareCanvasField = this.ScratchBlocks.__02PrepareCanvasField;
            if (prepareCanvasField) {
                for (const input of block.inputList || []) {
                    for (const field of input.fieldRow || []) prepareCanvasField(field);
                }
            }
            // render() normally updates connection offsets between drawing and
            // layout. Canvas skips the native render() wrapper, so do that part
            // explicitly or every child would be laid out at (0, 0).
            if (typeof block.renderMoveConnections_ === 'function') {
                block.renderMoveConnections_();
            }
            if (typeof block.renderClassify_ === 'function') block.renderClassify_();
            if (scratchCommentIcon && typeof scratchCommentIcon.renderIcon === 'function') {
                const firstRow = inputRows && inputRows[0];
                const iconX = block.RTL ? -inputRows.rightEdge : inputRows.rightEdge;
                scratchCommentIcon.renderIcon(iconX, firstRow ? firstRow.height / 2 : STACK_HEIGHT / 2);
            }
            block.rendered = true;
        } finally {
            this.renderingNative = wasRenderingNative;
        }
        state.dirty = false;
        this.nativeBlockCache.set(block.id, state);
        // Replace any pre-render estimate made earlier in this layout pass with
        // Blockly's authoritative own-block dimensions. Stack dimensions are
        // recomputed from these cached O(1) entries.
        this.estimateCache.set(this.getEstimateKey(block, false), {
            width: numberOr(block.width),
            height: numberOr(block.height)
        });
        this.estimateCache.set(this.getEstimateKey(block, true), {
            width: numberOr(block.width),
            height: numberOr(block.height)
        });
        this.estimateCache.delete(this.getEstimateKey(block, false, true));
        this.estimateCache.delete(this.getEstimateKey(block, true, true));
        const afterMeasurement = this.getBlockMeasurementSignature(block);
        if (beforeMeasurement !== afterMeasurement) {
            this.invalidateAncestorMeasurements(block);
            if (this.activeLayoutTask) this.activeLayoutTask.measurementChanged = true;
        }
    }

    getBlockMeasurementSignature (block) {
        if (!block) return '';
        const connections = block.getConnections_ ? block.getConnections_(true) : [];
        const connectionSignature = connections.map(connection => [
            connection && connection.type,
            numberOr(connection && connection.offsetInBlock_ && connection.offsetInBlock_.x),
            numberOr(connection && connection.offsetInBlock_ && connection.offsetInBlock_.y)
        ].join(',')).join(';');
        return [
            numberOr(block.width),
            numberOr(block.height),
            block.svgPath_ && block.svgPath_.getAttribute && block.svgPath_.getAttribute('d'),
            connectionSignature
        ].join('|');
    }

    invalidateAncestorMeasurements (block) {
        let parent = block && block.getParent && block.getParent();
        while (parent) {
            const state = this.nativeBlockCache.get(parent.id) || {dirty: true};
            state.dirty = true;
            this.nativeBlockCache.set(parent.id, state);
            // Native blocks are rendered child-first. If an ancestor has
            // already been rendered in this pass, it really does need a
            // second measurement; ancestors that have not run yet will see
            // the child's final dimensions in their first render.
            if (this.activeLayoutTask && this.activeLayoutTask.renderedNativeIds &&
                this.activeLayoutTask.renderedNativeIds.has(parent.id)) {
                this.activeLayoutTask.remeasureIds.add(parent.id);
            }
            this.invalidateEstimateCacheForBlock(parent);
            parent = parent.getParent && parent.getParent();
        }
    }

    renderNativeModel (block, seen = new Set()) {
        if (!this.isLiveBlock(block)) return;
        // Render children before parents because renderCompute_ uses child
        // dimensions. An explicit stack avoids recursion limits on very long
        // Scratch scripts.
        const stack = [{block, expanded: false}];
        while (stack.length) {
            const frame = stack.pop();
            const current = frame.block;
            if (!this.isLiveBlock(current)) continue;
            if (frame.expanded) {
                this.renderNativeBlock(current);
                continue;
            }
            if (seen.has(current.id)) continue;
            seen.add(current.id);
            stack.push({block: current, expanded: true});
            const children = [];
            for (const input of current.inputList || []) {
                const child = input.connection && input.connection.targetBlock && input.connection.targetBlock();
                if (child) children.push(child);
            }
            const next = current.getNextBlock && current.getNextBlock();
            if (next) children.push(next);
            for (let index = children.length - 1; index >= 0; index--) {
                if (!seen.has(children[index].id)) stack.push({block: children[index], expanded: false});
            }
        }
    }

    measureField (field) {
        const BlockSvg = this.ScratchBlocks.BlockSvg;
        if (!field.size_) field.size_ = {width: 0, height: BlockSvg.FIELD_HEIGHT || 32};
        // Use the original Blockly implementation rather than duplicating its
        // width rules. FieldDropdown, FieldImage, custom fields and addons may
        // all override part of the measurement/render pipeline. The original
        // method is safe here because its SVG nodes are CanvasModelNodes.
        const originalGetSize = field.__02CanvasOriginalGetSize;
        if (originalGetSize) {
            const wasRenderingNative = this.renderingNative;
            this.renderingNative = true;
            try {
                return originalGetSize.call(field);
            } finally {
                this.renderingNative = wasRenderingNative;
            }
        }
        return field.size_;
    }

    indexGeometry (layout, geometry) {
        layout.bounds = unionRect(layout.bounds, geometry.paintBounds);
        const minX = Math.floor(geometry.paintBounds.left / SPATIAL_CELL_SIZE);
        const maxX = Math.floor(geometry.paintBounds.right / SPATIAL_CELL_SIZE);
        const minY = Math.floor(geometry.paintBounds.top / SPATIAL_CELL_SIZE);
        const maxY = Math.floor(geometry.paintBounds.bottom / SPATIAL_CELL_SIZE);
        const index = layout.geometries.length - 1;
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = `${x}:${y}`;
                if (!layout.buckets.has(key)) layout.buckets.set(key, []);
                layout.buckets.get(key).push(index);
            }
        }
    }

    createProjectionSnapshot (root) {
        const blocks = [];
        const indexes = new Map();
        const pending = [];
        const addBlock = block => {
            if (!this.isLiveBlock(block)) return -1;
            if (indexes.has(block.id)) return indexes.get(block.id);
            const index = blocks.length;
            indexes.set(block.id, index);
            blocks.push(block);
            pending.push(block);
            return index;
        };
        addBlock(root);
        const nodes = [];
        while (pending.length) {
            const block = pending.pop();
            if (!this.isLiveBlock(block)) continue;
            const index = indexes.get(block.id);
            const size = this.getProjectionBlockSize(block);
            const edges = [];
            const addEdge = (child, connection, fallback, childConnection) => {
                if (!this.isLiveBlock(child)) return;
                const childIndex = addBlock(child);
                const connectionOffset = this.getConnectionOffset(connection, fallback);
                const childOffset = this.getConnectionOffset(childConnection, {x: 0, y: 0});
                edges.push([
                    childIndex,
                    numberOr(connectionOffset.x) - numberOr(childOffset.x),
                    numberOr(connectionOffset.y) - numberOr(childOffset.y)
                ]);
            };
            for (const input of block.inputList || []) {
                const connection = input.connection;
                const child = connection && connection.targetBlock &&
                    connection.targetBlock();
                if (!child) continue;
                if (connection.type === this.ScratchBlocks.NEXT_STATEMENT) {
                    addEdge(child, connection, {
                        x: STATEMENT_INDENT,
                        y: size.height - NOTCH_DEPTH
                    }, child.previousConnection || child.outputConnection);
                } else if (connection.type === this.ScratchBlocks.INPUT_VALUE) {
                    addEdge(child, connection, {
                        x: BLOCK_PADDING_X,
                        y: size.height / 2
                    }, child.outputConnection || child.previousConnection);
                }
            }
            const next = block.getNextBlock && block.getNextBlock();
            if (next) {
                addEdge(next, block.nextConnection, {
                    x: NOTCH_X,
                    y: size.height - NOTCH_DEPTH
                }, next.previousConnection || next.outputConnection);
            }
            nodes[index] = {
                width: size.width,
                height: size.height,
                startHat: !!block.startHat_,
                edges
            };
        }
        return {
            blocks,
            nodes,
            rootIndex: indexes.get(root && root.id)
        };
    }

    getProjectionWorker () {
        if (this.projectionWorker || this.projectionWorkerDisabled) return this.projectionWorker;
        if (typeof Worker === 'undefined' || typeof Blob === 'undefined' ||
            typeof URL === 'undefined' || !URL.createObjectURL) {
            this.projectionWorkerDisabled = true;
            return null;
        }
        try {
            const source = `(${canvasLayoutWorkerMain.toString()})()`;
            this.projectionWorkerURL = URL.createObjectURL(new Blob([source], {
                type: 'text/javascript'
            }));
            this.projectionWorker = new Worker(this.projectionWorkerURL);
            this.projectionWorker.onmessage = event => this.handleProjectionWorkerMessage(event);
            this.projectionWorker.onerror = () => this.disableProjectionWorker();
        } catch (error) {
            this.disableProjectionWorker();
        }
        return this.projectionWorker;
    }

    disableProjectionWorker () {
        this.projectionWorkerDisabled = true;
        if (this.projectionWorker) this.projectionWorker.terminate();
        if (this.projectionWorkerURL) URL.revokeObjectURL(this.projectionWorkerURL);
        this.projectionWorker = null;
        this.projectionWorkerURL = null;
        for (const layout of this.rootLayouts.values()) {
            layout.projectionPending = false;
            layout.projectionSnapshotBlocks = null;
        }
        this.scheduleDraw();
    }

    handleProjectionWorkerMessage (event) {
        const result = event && event.data;
        if (!result || (result.type !== 'projected' && result.type !== 'error')) return;
        const layout = this.rootLayouts.get(result.rootId);
        if (!layout || !layout.projectionPending ||
            layout.projectionRequestId !== result.requestId ||
            layout.projectionRequestVersion !== result.version) return;
        layout.projectionPending = false;
        if (layout.projectionStartedAt) {
            this.recordPerformance(
                'projection',
                now() - layout.projectionStartedAt,
                (layout.projectionSnapshotBlocks || []).length
            );
            layout.projectionStartedAt = 0;
        }
        const blocks = layout.projectionSnapshotBlocks || [];
        layout.projectionSnapshotBlocks = null;
        if (result.type === 'error') {
            layout.projectionWorkerFailed = true;
            this.scheduleDraw();
            return;
        }
        const positions = new Map();
        const projectedBlocks = new Map();
        const projectedPaintBounds = new Map();
        const projectedBuckets = new Map();
        for (const item of result.positions || []) {
            const block = blocks[item[0]];
            if (!this.isLiveBlock(block)) continue;
            positions.set(block.id, {x: numberOr(item[1]), y: numberOr(item[2])});
            projectedBlocks.set(block.id, block);
        }
        for (const item of result.paintBounds || []) {
            const block = blocks[item[0]];
            if (!this.isLiveBlock(block)) continue;
            projectedPaintBounds.set(block.id, {
                left: numberOr(item[1]),
                top: numberOr(item[2]),
                right: numberOr(item[3]),
                bottom: numberOr(item[4])
            });
        }
        for (const item of result.buckets || []) {
            const ids = (item[1] || []).map(index => blocks[index])
                .filter(block => this.isLiveBlock(block))
                .map(block => block.id);
            projectedBuckets.set(item[0], ids);
        }
        layout.projectedPositions = positions;
        layout.projectedBlocks = projectedBlocks;
        layout.projectedPaintBounds = projectedPaintBounds;
        layout.projectedBuckets = projectedBuckets;
        layout.projectionBounds = result.bounds || null;
        layout.cachedRootBounds = result.bounds ? Object.assign({}, result.bounds) : null;
        layout.projectionDirty = false;
        layout.projectionBuiltAt = now();
        layout.projectionWorkerFailed = false;
        this.updateVisibleProjection(layout, this.getVisibleWorldBounds());
        this.ensureLayoutsAsync(this.getVisibleWorldBounds());
        this.scheduleDraw();
    }

    requestProjection (layout) {
        if (!layout || !this.isLiveBlock(layout.root) || layout.projectionWorkerFailed) return false;
        const worker = this.getProjectionWorker();
        if (!worker) return false;
        if (layout.projectionPending && layout.projectionRequestVersion === layout.version) return true;
        const projectionStarted = now();
        const snapshot = this.createProjectionSnapshot(layout.root);
        if (snapshot.blocks.length < PROJECTION_WORKER_MIN_BLOCKS) return false;
        const requestId = ++this.projectionRequestCounter;
        layout.projectionPending = true;
        layout.projectionRequestId = requestId;
        layout.projectionRequestVersion = layout.version;
        layout.projectionSnapshotBlocks = snapshot.blocks;
        layout.projectionStartedAt = projectionStarted;
        try {
            worker.postMessage({
                type: 'project',
                requestId,
                rootId: layout.root.id,
                version: layout.version,
                rootIndex: snapshot.rootIndex,
                cellSize: SPATIAL_CELL_SIZE,
                nodes: snapshot.nodes
            });
        } catch (error) {
            layout.projectionPending = false;
            layout.projectionSnapshotBlocks = null;
            layout.projectionWorkerFailed = true;
            return false;
        }
        return true;
    }

    getConnectionOffset (connection, fallback) {
        return connection && connection.offsetInBlock_ ? connection.offsetInBlock_ : fallback;
    }

    projectBlockPositions (root, worldBounds = null) {
        const positions = new Map();
        const blocks = new Map();
        const projectedPaintBounds = new Map();
        const projectedBuckets = new Map();
        const visibleIds = new Set();
        let bounds = null;
        const rootPosition = getRootPosition(root);
        const localWorldBounds = worldBounds && {
            left: worldBounds.left - rootPosition.x,
            top: worldBounds.top - rootPosition.y,
            right: worldBounds.right - rootPosition.x,
            bottom: worldBounds.bottom - rootPosition.y
        };
        const stack = [{block: root, x: 0, y: 0}];
        while (stack.length) {
            const current = stack.pop();
            const block = current.block;
            if (!this.isLiveBlock(block) || positions.has(block.id)) continue;
            positions.set(block.id, {x: current.x, y: current.y});
            blocks.set(block.id, block);
            const size = this.getProjectionBlockSize(block);
            const paintBounds = {
                left: current.x - 4,
                top: current.y - (block.startHat_ ? HAT_HEIGHT + 4 : 4),
                right: current.x + size.width + 4,
                bottom: current.y + size.height + 4
            };
            projectedPaintBounds.set(block.id, paintBounds);
            const minX = Math.floor(paintBounds.left / SPATIAL_CELL_SIZE);
            const maxX = Math.floor(paintBounds.right / SPATIAL_CELL_SIZE);
            const minY = Math.floor(paintBounds.top / SPATIAL_CELL_SIZE);
            const maxY = Math.floor(paintBounds.bottom / SPATIAL_CELL_SIZE);
            for (let bucketX = minX; bucketX <= maxX; bucketX++) {
                for (let bucketY = minY; bucketY <= maxY; bucketY++) {
                    const key = `${bucketX}:${bucketY}`;
                    if (!projectedBuckets.has(key)) projectedBuckets.set(key, []);
                    projectedBuckets.get(key).push(block.id);
                }
            }
            bounds = unionRect(bounds, paintBounds);
            if (!localWorldBounds || rectsIntersect(paintBounds, localWorldBounds) ||
                this.forceMaterializedIds.has(block.id)) visibleIds.add(block.id);

            const childLayouts = [];
            for (const input of block.inputList || []) {
                const child = input.connection && input.connection.targetBlock &&
                    input.connection.targetBlock();
                if (!child) continue;
                if (input.connection.type === this.ScratchBlocks.NEXT_STATEMENT) {
                    const connectionOffset = this.getConnectionOffset(input.connection, {
                        x: STATEMENT_INDENT,
                        y: size.height - NOTCH_DEPTH
                    });
                    const childConnection = child.previousConnection || child.outputConnection;
                    const childOffset = this.getConnectionOffset(childConnection, {x: 0, y: 0});
                    childLayouts.push({
                        block: child,
                        x: current.x + connectionOffset.x - childOffset.x,
                        y: current.y + connectionOffset.y - childOffset.y
                    });
                } else if (input.connection.type === this.ScratchBlocks.INPUT_VALUE) {
                    const connectionOffset = this.getConnectionOffset(input.connection, {
                        x: BLOCK_PADDING_X,
                        y: size.height / 2
                    });
                    const childConnection = child.outputConnection || child.previousConnection;
                    const childOffset = this.getConnectionOffset(childConnection, {x: 0, y: 0});
                    childLayouts.push({
                        block: child,
                        x: current.x + connectionOffset.x - childOffset.x,
                        y: current.y + connectionOffset.y - childOffset.y
                    });
                }
            }
            const next = block.getNextBlock && block.getNextBlock();
            if (next) {
                const connectionOffset = this.getConnectionOffset(block.nextConnection, {
                    x: NOTCH_X,
                    y: size.height - NOTCH_DEPTH
                });
                const nextConnection = next.previousConnection || next.outputConnection;
                const nextOffset = this.getConnectionOffset(nextConnection, {x: 0, y: 0});
                childLayouts.push({
                    block: next,
                    x: current.x + connectionOffset.x - nextOffset.x,
                    y: current.y + connectionOffset.y - nextOffset.y
                });
            }
            for (let index = childLayouts.length - 1; index >= 0; index--) {
                stack.push(childLayouts[index]);
            }
        }
        return {positions, blocks, projectedPaintBounds, projectedBuckets, visibleIds, bounds};
    }

    ensureProjection (layout) {
        if (!layout || !this.isLiveBlock(layout.root)) return;
        if (!layout.projectionDirty && layout.projectedPositions.size) return;
        layout.projectionPending = false;
        layout.projectionSnapshotBlocks = null;
        const projectionStarted = now();
        const projection = this.projectBlockPositions(layout.root);
        layout.projectedPositions = projection.positions;
        layout.projectedBlocks = projection.blocks;
        layout.projectedPaintBounds = projection.projectedPaintBounds;
        layout.projectedBuckets = projection.projectedBuckets;
        layout.projectionBounds = projection.bounds;
        layout.cachedRootBounds = projection.bounds ? Object.assign({}, projection.bounds) : null;
        layout.projectionDirty = false;
        layout.projectionBuiltAt = now();
        this.recordPerformance('projection', now() - projectionStarted, projection.blocks.size);
    }

    updateVisibleProjection (layout, worldBounds) {
        this.ensureProjection(layout);
        const visibleIds = new Set();
        const rootPosition = getRootPosition(layout.root);
        const localWorldBounds = worldBounds && {
            left: worldBounds.left - rootPosition.x,
            top: worldBounds.top - rootPosition.y,
            right: worldBounds.right - rootPosition.x,
            bottom: worldBounds.bottom - rootPosition.y
        };
        if (localWorldBounds) {
            const candidateIds = new Set();
            const minX = Math.floor(localWorldBounds.left / SPATIAL_CELL_SIZE);
            const maxX = Math.floor(localWorldBounds.right / SPATIAL_CELL_SIZE);
            const minY = Math.floor(localWorldBounds.top / SPATIAL_CELL_SIZE);
            const maxY = Math.floor(localWorldBounds.bottom / SPATIAL_CELL_SIZE);
            for (let bucketX = minX; bucketX <= maxX; bucketX++) {
                for (let bucketY = minY; bucketY <= maxY; bucketY++) {
                    const bucket = layout.projectedBuckets.get(`${bucketX}:${bucketY}`);
                    if (bucket) bucket.forEach(id => candidateIds.add(id));
                }
            }
            for (const id of candidateIds) {
                const paintBounds = layout.projectedPaintBounds.get(id);
                if (paintBounds && rectsIntersect(paintBounds, localWorldBounds)) visibleIds.add(id);
            }
        } else {
            for (const id of layout.projectedPaintBounds.keys()) visibleIds.add(id);
        }
        // Forced blocks are normally just the root currently being dragged or
        // one block requested by a compatibility API. Add them directly rather
        // than scanning all projected blocks on every viewport frame.
        for (const id of this.forceMaterializedIds) {
            if (layout.projectedBlocks.has(id)) visibleIds.add(id);
        }

        // A visible inline expression must be complete. Testing each nested
        // reporter against an approximate rectangle independently can omit a
        // third-level input until a later zoom or click. Add only INPUT_VALUE
        // dependencies here; statement stacks keep their normal viewport
        // culling and do not get materialized as a side effect of a visible C
        // block.
        const pending = Array.from(visibleIds);
        while (pending.length) {
            const id = pending.pop();
            const block = layout.projectedBlocks.get(id);
            if (!this.isLiveBlock(block)) continue;
            for (const input of block.inputList || []) {
                if (!input.connection) continue;
                // The custom_block statement of a procedure definition is part
                // of its visible header. It must be measured with the header,
                // while ordinary C-block statement children remain deferred.
                if (input.connection.type !== this.ScratchBlocks.INPUT_VALUE &&
                    !this.isProcedureHeaderBlock(block)) continue;
                const child = input.connection.targetBlock && input.connection.targetBlock();
                if (!this.isLiveBlock(child) || visibleIds.has(child.id)) continue;
                visibleIds.add(child.id);
                pending.push(child.id);
            }
        }
        layout.visibleIds = visibleIds;
        return visibleIds;
    }

    isProcedureHeaderBlock (block) {
        if (!block) return false;
        return [
            this.ScratchBlocks.PROCEDURES_DEFINITION_BLOCK_TYPE,
            this.ScratchBlocks.PROCEDURES_PROTOTYPE_BLOCK_TYPE,
            'procedures_declaration'
        ].includes(block.type);
    }

    layoutRoot (root, worldBounds = null) {
        const started = now();
        const task = this.createLayoutTask(root, worldBounds);
        if (!task) return this.getRootLayout(root);
        let completed = false;
        while (!completed) {
            completed = this.processLayoutTask(task, Number.POSITIVE_INFINITY);
        }
        this.lastLayoutDuration = now() - started;
        this.layoutTasks.delete(root.id);
        return task.layout;
    }

    collectPostOrder (root) {
        const result = [];
        const seen = new Set();
        const stack = [{block: root, expanded: false}];
        while (stack.length) {
            const frame = stack.pop();
            const block = frame.block;
            if (!this.isLiveBlock(block)) continue;
            if (frame.expanded) {
                result.push(block);
                continue;
            }
            if (seen.has(block.id)) continue;
            seen.add(block.id);
            stack.push({block, expanded: true});
            const children = [];
            for (const input of block.inputList || []) {
                const child = input.connection && input.connection.targetBlock && input.connection.targetBlock();
                if (child) children.push(child);
            }
            const next = block.getNextBlock && block.getNextBlock();
            if (next) children.push(next);
            for (let index = children.length - 1; index >= 0; index--) {
                if (!seen.has(children[index].id)) stack.push({block: children[index], expanded: false});
            }
        }
        return result;
    }

    collectMeasurementBlocks (blocks) {
        // Exact inline child widths are needed before their visible parent is
        // drawn. Statement stack sizes are supplied by the cached
        // getEstimatedHeightWidth path, so do not materialize every descendant
        // under a visible C block.
        const result = new Map();
        const pending = blocks.slice();
        while (pending.length) {
            const block = pending.pop();
            if (!this.isLiveBlock(block) || result.has(block.id)) continue;
            result.set(block.id, block);
            for (const input of block.inputList || []) {
                if (!input.connection) continue;
                if (input.connection.type !== this.ScratchBlocks.INPUT_VALUE &&
                    !this.isProcedureHeaderBlock(block)) continue;
                const child = input.connection && input.connection.targetBlock &&
                    input.connection.targetBlock();
                if (child && !result.has(child.id)) pending.push(child);
            }
        }
        return Array.from(result.values());
    }

    createLayoutScene (layout, rebuilding) {
        const scene = {
            root: layout.root,
            visibleIds: new Set(layout.visibleIds),
            geometries: [],
            fields: [],
            buckets: new Map(),
            bounds: null
        };
        if (!rebuilding) {
            for (const geometry of layout.geometries) {
                if (!geometry || !this.isLiveBlock(geometry.block) ||
                    (!scene.visibleIds.has(geometry.block.id) &&
                    !this.forceMaterializedIds.has(geometry.block.id))) continue;
                scene.geometries.push(geometry);
                scene.fields.push(...(geometry.fields || []));
                this.indexGeometry(scene, geometry);
            }
        }
        return scene;
    }

    resetLayoutScene (scene, visibleIds) {
        scene.visibleIds = new Set(visibleIds || []);
        scene.geometries = [];
        scene.fields = [];
        scene.buckets = new Map();
        scene.bounds = null;
    }

    commitLayoutScene (layout, scene) {
        for (const geometry of layout.geometries || []) {
            if (this.blockGeometry.get(geometry.block && geometry.block.id) === geometry) {
                this.blockGeometry.delete(geometry.block.id);
            }
        }
        layout.geometries = scene.geometries;
        layout.fields = scene.fields;
        layout.buckets = scene.buckets;
        layout.bounds = scene.bounds;
        layout.pendingScene = null;
        for (const geometry of layout.geometries) {
            this.blockGeometry.set(geometry.block.id, geometry);
            for (const field of geometry.fields || []) this.fieldGeometry.set(field.field, field);
        }
    }

    createLayoutTask (root, worldBounds = null) {
        if (!this.isLiveBlock(root)) return null;
        const layout = this.getRootLayout(root);
        this.updateVisibleProjection(layout, worldBounds);
        if (layout.skippedVersion !== layout.version) {
            layout.skippedIds.clear();
            layout.skippedVersion = layout.version;
        }
        const rebuilding = !!layout.dirty;
        const scene = this.createLayoutScene(layout, rebuilding);
        const existingIds = new Set(scene.geometries.map(geometry => geometry.block && geometry.block.id));
        const targetIds = Array.from(layout.visibleIds).filter(id =>
            !layout.skippedIds.has(id) && (rebuilding || !existingIds.has(id)));
        const viewportCenter = worldBounds ? {
            x: (worldBounds.left + worldBounds.right) / 2,
            y: (worldBounds.top + worldBounds.bottom) / 2
        } : null;
        const distanceToViewport = id => {
            if (!viewportCenter) return 0;
            const bounds = layout.projectedPaintBounds.get(id);
            if (!bounds) return 0;
            const rootPosition = getRootPosition(layout.root);
            const x = (((bounds.left + bounds.right) / 2) + rootPosition.x) - viewportCenter.x;
            const y = (((bounds.top + bounds.bottom) / 2) + rootPosition.y) - viewportCenter.y;
            return (x * x) + (y * y);
        };
        // Materialize the blocks closest to the user's view first. This only
        // changes Canvas scheduling; the Blockly graph and connection order
        // remain authoritative.
        targetIds.sort((a, b) => distanceToViewport(a) - distanceToViewport(b));
        let nativeBlocks = targetIds
            .map(id => layout.projectedBlocks.get(id))
            .filter(block => this.isLiveBlock(block));
        nativeBlocks = this.collectMeasurementBlocks(nativeBlocks)
            .filter(block => this.needsNativeMeasurement(block));
        // Child dimensions are needed before a parent is laid out. Sorting the
        // dependency closure by graph depth preserves that dependency while
        // keeping unrelated roots out of the native shape compiler.
        const depthCache = new Map();
        const depth = block => {
            if (depthCache.has(block.id)) return depthCache.get(block.id);
            let value = 0;
            let current = block;
            while (current && current.getParent && current.getParent()) {
                value++;
                current = current.getParent();
            }
            depthCache.set(block.id, value);
            return value;
        };
        nativeBlocks.sort((a, b) => depth(b) - depth(a) ||
            distanceToViewport(a.id) - distanceToViewport(b.id));
        layout.inProgress = true;
        layout.pendingScene = scene;
        return {
            root,
            layout,
            // Bilup's deferred renderer prioritizes scripts nearest the
            // viewport. Keep that priority on the task so queue insertion
            // order cannot make a distant large script block the visible one.
            priority: this.draggingRoot === root ? 0 : this.getRootViewportDistance(root, worldBounds),
            version: layout.version,
            viewportKey: this.viewportKey,
            scene,
            nativeBlocks,
            nativeIndex: 0,
            pendingPositions: targetIds.map(id => ({
                block: layout.projectedBlocks.get(id),
                ...(layout.projectedPositions.get(id) || {x: 0, y: 0})
            })),
            worldBounds,
            reprojected: false,
            measurementChanged: false,
            measurementPasses: 0,
            failedNativeBlocks: new Set(),
            renderedNativeIds: new Set(),
            remeasureIds: new Set(),
            seen: new Set(),
            onlyVisible: true,
            phase: 'native',
            started: now(),
            errorCount: 0
        };
    }

    scheduleLayoutWork () {
        if (this.layoutFrame !== null || this.loadingTimer !== null || !this.layoutTasks.size) return;
        const continuousMode = this.loadingMode === 'continuous' ||
            (this.loadingMode === 'adaptive' && !this.isUserInteracting());
        const run = () => {
            this.layoutFrame = null;
            this.loadingTimer = null;
            const frameStarted = now();
            const fastMode = this.loadingMode === 'sync';
            const fullSceneMode = this.renderAllBlocks && this.deferFullRenderDraw;
            // Even the fastest mode yields at the end of a bounded frame.
            // The old sync path used an infinite deadline and could freeze
            // the browser for tens of seconds on one large script.
            const deadline = frameStarted + (fullSceneMode ? 40 : (fastMode ?
                LAYOUT_FAST_FRAME_BUDGET : LAYOUT_FRAME_BUDGET));
            const maxSlices = fullSceneMode ?
                Math.max(this.layoutTasks.size, 8) :
                (this.layoutTasks.size > 1 ? Math.max(this.layoutTasks.size, 2) : 16);
            let processedSlices = 0;
            while (this.layoutTasks.size && processedSlices < maxSlices &&
                now() < deadline) {
                let nextEntry = null;
                for (const entry of this.layoutTasks.entries()) {
                    if (!nextEntry || entry[1].priority < nextEntry[1].priority) {
                        nextEntry = entry;
                    }
                }
                if (!nextEntry) break;
                const [id, task] = nextEntry;
                this.layoutTasks.delete(id);
                const remaining = Math.max(1, deadline - now());
                const defaultRate = fullSceneMode ? 24 : (this.layoutTasks.size > 0 ?
                    (fastMode ? LAYOUT_FAST_MULTI_ROOT_BUDGET : LAYOUT_MULTI_ROOT_BUDGET) :
                    (fastMode ? LAYOUT_FAST_ROOT_BUDGET : LAYOUT_SINGLE_ROOT_BUDGET));
                const preferredBudget = Math.max(1, this.loadingRate || defaultRate);
                const taskBudget = Math.min(fullSceneMode ?
                    Math.max(preferredBudget, defaultRate) : preferredBudget, remaining);
                let completed = false;
                task.layout.processing = true;
                try {
                    completed = this.processLayoutTask(task, taskBudget);
                } catch (error) {
                    // A malformed/custom block must not strand the task in
                    // an inProgress state. The task has already advanced its
                    // cursor before invoking each expensive operation, so it
                    // can safely continue on the next frame.
                    task.layout.inProgress = true;
                    task.layout.dirty = true;
                    task.layout.pendingScene = task.scene;
                    task.errorCount = numberOr(task.errorCount) + 1;
                    task.errorMessage = error && error.message;
                    this.performance.errors++;
                    // Repeated errors are contained below so a malformed
                    // custom block cannot permanently occupy the queue.
                    if (task.errorCount >= 3) {
                        task.nativeBlocks = [];
                        task.nativeIndex = 0;
                        task.pendingPositions.length = 0;
                        // Treat this viewport slice as complete after the
                        // retry limit. The committed scene remains intact;
                        // marking its attempted IDs skipped prevents the
                        // loading indicator from re-queueing the same broken
                        // slice forever.
                        for (const skippedId of task.layout.visibleIds) {
                            task.layout.skippedIds.add(skippedId);
                        }
                        task.layout.dirty = false;
                        task.layout.pendingScene = null;
                        completed = true;
                    }
                }
                task.layout.processing = false;
                if (completed) {
                    task.layout.inProgress = false;
                } else {
                    this.layoutTasks.set(id, task);
                }
                // Paint every completed slice. Without this, a large target
                // stays blank until its whole viewport task finishes, which
                // makes the editor look frozen even though work is progressing.
                this.scheduleDraw();
                this.updateTuningPanel();
                processedSlices++;
            }
            if (this.layoutTasks.size) this.scheduleLayoutWork();
            else this.updateTuningPanel();
        };
        if (continuousMode) {
            this.loadingTimer = setTimeout(run, 0);
        } else {
            this.layoutFrame = requestAnimationFrame(run);
        }
    }

    processLayoutTask (task, budget = 4) {
        if (!task || !this.isLiveBlock(task.root) ||
            this.rootLayouts.get(task.root.id) !== task.layout) {
            if (task && task.layout) {
                task.layout.inProgress = false;
                if (task.layout.pendingScene === task.scene) task.layout.pendingScene = null;
            }
            return true;
        }
        if (task.version !== task.layout.version || task.viewportKey !== this.viewportKey) {
            task.layout.dirty = true;
            task.layout.inProgress = false;
            if (task.layout.pendingScene === task.scene) task.layout.pendingScene = null;
            return true;
        }
        const started = now();
        if (task.phase === 'native') {
            const Field = this.ScratchBlocks.Field;
            this.activeLayoutTask = task;
            if (Field && Field.startCache) Field.startCache();
            try {
                while (task.nativeIndex < task.nativeBlocks.length && now() - started < budget) {
                    const block = task.nativeBlocks[task.nativeIndex++];
                    if (!this.isLiveBlock(block) || task.failedNativeBlocks.has(block.id)) continue;
                    const shouldMeasure = this.needsNativeMeasurement(block);
                    const measurementStarted = now();
                    try {
                        this.renderNativeBlock(block);
                        task.renderedNativeIds.add(block.id);
                    } catch (error) {
                        // Keep the graph walk and the rest of the viewport
                        // usable when one custom field/shape cannot be
                        // compiled. The geometry pass will use its estimate.
                        task.lastError = error && error.message;
                        task.failedNativeBlocks.add(block.id);
                        task.layout.skippedIds.add(block.id);
                        this.performance.errors++;
                    } finally {
                        if (shouldMeasure) {
                            this.recordPerformance('native', now() - measurementStarted);
                        }
                    }
                }
            } finally {
                if (Field && Field.stopCache) Field.stopCache();
                this.activeLayoutTask = null;
            }
            if (task.nativeIndex < task.nativeBlocks.length) return false;
            // The first pass resolves cheap estimates. A second pass is
            // required after that projection because rendering a child can
            // change the measured size of its C-shaped parent. If that second
            // pass still changes a measurement, perform one final bounded
            // convergence pass instead of committing stale geometry.
            if (!task.reprojected || task.measurementChanged) {
                if (task.reprojected) task.measurementChanged = false;
                // Native measurement may have replaced several estimates in a
                // nested C stack. Rebuild the projection before assigning
                // Canvas geometry, otherwise visible children keep the old
                // coordinates until an unrelated zoom or pan.
                task.layout.projectionDirty = true;
                this.ensureProjection(task.layout);
                this.updateVisibleProjection(task.layout, task.worldBounds);
                this.resetLayoutScene(task.scene, task.layout.visibleIds);
                const visibleBlocks = Array.from(task.layout.visibleIds)
                    .map(id => task.layout.projectedBlocks.get(id))
                    .filter(block => this.isLiveBlock(block) &&
                        !task.failedNativeBlocks.has(block.id));
                task.nativeBlocks = this.collectMeasurementBlocks(visibleBlocks)
                    .filter(block => task.remeasureIds.has(block.id) &&
                        this.needsNativeMeasurement(block));
                task.nativeIndex = 0;
                const pendingIds = Array.from(task.layout.visibleIds)
                    .filter(id => !task.layout.skippedIds.has(id) &&
                        !task.failedNativeBlocks.has(id));
                task.pendingPositions = pendingIds.map(id => ({
                    block: task.layout.projectedBlocks.get(id),
                    ...(task.layout.projectedPositions.get(id) || {x: 0, y: 0})
                }));
                task.seen = new Set();
                task.reprojected = true;
                task.remeasureIds.clear();
                if (task.nativeBlocks.length) {
                    // Avoid an unstable addon repeatedly restarting a large
                    // script forever. The last pass still commits the latest
                    // complete measurements and the next invalidation can
                    // request another bounded refresh.
                    task.measurementPasses = task.measurementPasses ?
                        task.measurementPasses + 1 : 1;
                    if (task.measurementPasses <= 2) return false;
                    task.nativeBlocks = [];
                }
            }
            task.phase = 'layout';
        }

        while (task.pendingPositions.length && now() - started < budget) {
            const position = task.pendingPositions.pop();
            this.layoutModelBlock(
                position.block,
                position.x,
                position.y,
                task.scene,
                task.seen,
                task.pendingPositions,
                task.onlyVisible
            );
        }
        if (task.pendingPositions.length) return false;
        if (task.version !== task.layout.version || task.viewportKey !== this.viewportKey) {
            task.layout.dirty = true;
            task.layout.inProgress = false;
            if (task.layout.pendingScene === task.scene) task.layout.pendingScene = null;
            return true;
        }
        this.commitLayoutScene(task.layout, task.scene);
        task.layout.dirty = false;
        task.layout.positionDirty = false;
        task.layout.inProgress = false;
        // A full-scene benchmark does not perform a gesture or connection
        // search. Re-indexing every connection after each root would dominate
        // the result for a large project. Production viewport layouts still
        // update Blockly's connection database normally.
        if (!this.deferFullRenderDraw) this.updateConnectionPositions(task.layout);
        this.lastLayoutDuration = now() - task.started;
        this.recordPerformance('layout', this.lastLayoutDuration, task.scene.geometries.length);
        return true;
    }

    ensureLayoutsAsync (worldBounds = null) {
        if (!this.workspace) return [];
        const transform = this.getTransform();
        const rect = this.getWorkspaceRect();
        const viewportKey = rect ? [
            rect.width,
            rect.height,
            transform.x,
            transform.y,
            transform.scale,
            worldBounds && worldBounds.left,
            worldBounds && worldBounds.top,
            worldBounds && worldBounds.right,
            worldBounds && worldBounds.bottom
        ].join(':') : null;
        if (viewportKey !== this.viewportKey) {
            this.viewportKey = viewportKey;
            for (const task of this.layoutTasks.values()) {
                task.layout.inProgress = false;
                task.layout.processing = false;
                if (task.layout.pendingScene === task.scene) task.layout.pendingScene = null;
            }
            this.layoutTasks.clear();
        }
        const roots = this.workspace.getTopBlocks ? this.workspace.getTopBlocks(false) : [];
        const live = new Set(roots.map(root => root.id));
        for (const key of this.rootLayouts.keys()) {
            if (!live.has(key)) {
                const stale = this.rootLayouts.get(key);
                for (const geometry of (stale && stale.geometries) || []) {
                    this.blockGeometry.delete(geometry.block && geometry.block.id);
                }
                this.rootLayouts.delete(key);
                this.layoutTasks.delete(key);
            }
        }
        for (const root of roots) {
            const layout = this.getRootLayout(root);
            const timestamp = now();
            const isForcedRoot = this.draggingRoot === root || this.isRootSelected(root) ||
                this.forceMaterializedIds.has(root.id);
            const nearViewport = isForcedRoot || this.rootMayIntersect(root, worldBounds);
            layout.lastViewportDistance = this.getRootViewportDistance(root, worldBounds);
            // A failed animation-frame callback or an interrupted navigation
            // can leave a layout marked inProgress without a queue entry.
            // Clear that orphaned state so the next draw can recreate the
            // task instead of leaving the loading indicator frozen forever.
            if (layout.inProgress && !layout.processing && !this.layoutTasks.has(root.id)) {
                layout.inProgress = false;
            }
            if (!nearViewport) {
                // Do not build a full projection or native shape scene for a
                // distant root. Its complete Blockly graph remains available
                // for serialization and connection matching; only the Canvas
                // paint cache is allowed to go cold.
                layout.visibleIds.clear();
                layout.projectionPending = false;
                layout.projectionSnapshotBlocks = null;
                if (layout.inProgress && !layout.processing) {
                    layout.inProgress = false;
                    layout.pendingScene = null;
                    this.layoutTasks.delete(root.id);
                }
                this.evictOffscreenProjection(layout, worldBounds, timestamp);
                continue;
            }
            layout.lastNearAt = timestamp;
            // Build the cheap graph projection off the main thread. Keep the
            // previous committed scene visible while it is pending; the
            // native Blockly measurement task starts as soon as the result
            // arrives instead of waiting for a complete script pass here.
            if (layout.projectionDirty) {
                if (!layout.projectionPending && !this.requestProjection(layout)) {
                    this.ensureProjection(layout);
                }
                if (layout.projectionPending) continue;
                if (layout.projectionDirty && !layout.projectedPositions.size) continue;
            }
            this.updateVisibleProjection(layout, worldBounds);
            const materialized = new Set(layout.geometries.map(geometry => geometry.block && geometry.block.id));
            const hasMissingVisible = Array.from(layout.visibleIds).some(id =>
                !materialized.has(id) && !layout.skippedIds.has(id));
            if ((layout.dirty || hasMissingVisible) && !layout.inProgress &&
                this.rootMayIntersect(root, worldBounds)) {
                const task = this.createLayoutTask(root, worldBounds);
                if (task) this.layoutTasks.set(root.id, task);
            }
        }
        this.scheduleLayoutWork();
        return roots.map(root => this.getRootLayout(root));
    }

    layoutModelBlock (block, x, y, layout, seen, pendingPositions = null, onlyVisible = false) {
        if (!this.isLiveBlock(block) || seen.has(block.id)) return {width: 0, height: 0};
        seen.add(block.id);
        const shouldPaint = !layout.visibleIds || layout.visibleIds.has(block.id) ||
            this.forceMaterializedIds.has(block.id);
        if (shouldPaint) this.ensureBlockModel(block);
        const isReporter = !!block.outputConnection;
        const isHat = !!block.startHat_ || (!isReporter && !block.previousConnection);
        const valueInputs = [];
        const fields = [];
        const childLayouts = [];
        // Visible blocks use Blockly's measured dimensions. Offscreen blocks
        // retain only a cheap estimate so they can still provide positions to
        // the graph walk without creating field models or model SVG nodes.
        const estimated = this.getEstimatedBlockSize(block);
        const width = shouldPaint && numberOr(block.width) > 0 ? numberOr(block.width) : estimated.width;
        const ownHeight = shouldPaint && numberOr(block.height) > 0 ? numberOr(block.height) : estimated.height;

        for (const input of block.inputList || []) {
            if (input.isVisible && !input.isVisible()) continue;
            const isStatement = input.connection && input.connection.type === this.ScratchBlocks.NEXT_STATEMENT;
            if (isStatement) {
                const child = input.connection.targetBlock && input.connection.targetBlock();
                if (child) {
                    const childConnection = child.previousConnection || child.outputConnection;
                    const childOffset = (childConnection && childConnection.offsetInBlock_) || {x: 0, y: 0};
                    const connectionOffset = input.connection.offsetInBlock_ || {
                        x: STATEMENT_INDENT,
                        y: ownHeight - NOTCH_DEPTH
                    };
                    childLayouts.push({
                        block: child,
                        x: x + connectionOffset.x - childOffset.x,
                        y: y + connectionOffset.y - childOffset.y
                    });
                }
                continue;
            }

            if (shouldPaint) {
                for (const field of input.fieldRow || []) {
                    field.sourceBlock_ = block;
                    if (field.isVisible && !field.isVisible()) continue;
                    const size = this.measureField(field);
                    const fieldRoot = field.getSvgRoot && field.getSvgRoot();
                    const nativePosition = parseTranslate(
                        (fieldRoot && fieldRoot.getAttribute && fieldRoot.getAttribute('transform')) ||
                        (field.fieldGroup_ && field.fieldGroup_.getAttribute('transform'))
                    );
                    const fieldGeometry = {
                        field,
                        block,
                        x: x + (nativePosition ? nativePosition.x : BLOCK_PADDING_X),
                        y: y + (nativePosition ? nativePosition.y : Math.max(
                            8, (ownHeight - size.height) / 2
                        )),
                        // renderCompute_ stores the exact width consumed by
                        // renderFields_. This is authoritative for procedure
                        // labels and argument reporters whose visual width can
                        // differ from a plain text measurement.
                        width: numberOr(field.renderWidth, size.width),
                        height: size.height
                    };
                    fields.push(fieldGeometry);
                    layout.fields.push(fieldGeometry);
                }
            }

            if (input.connection && input.connection.type === this.ScratchBlocks.INPUT_VALUE) {
                const child = input.connection.targetBlock && input.connection.targetBlock();
                if (child) {
                    const connectionOffset = input.connection.offsetInBlock_ || {
                        x: BLOCK_PADDING_X,
                        y: ownHeight / 2
                    };
                    const childConnection = child.outputConnection || child.previousConnection;
                    const childOffset = (childConnection && childConnection.offsetInBlock_) || {x: 0, y: 0};
                    childLayouts.push({
                        block: child,
                        x: x + connectionOffset.x - childOffset.x,
                        y: y + connectionOffset.y - childOffset.y
                    });
                } else {
                    const inputPosition = parseTranslate(
                        input.outlinePath && input.outlinePath.getAttribute('transform')
                    );
                    valueInputs.push({
                        x: x + (inputPosition ? inputPosition.x : BLOCK_PADDING_X),
                        y: y + (inputPosition ? inputPosition.y : Math.max(
                            4, (STACK_HEIGHT - REPORTER_HEIGHT) / 2
                        )),
                        width: 44,
                        height: REPORTER_HEIGHT,
                        shape: input.connection.getOutputShape ? input.connection.getOutputShape() : null,
                        pathData: input.outlinePath && input.outlinePath.getAttribute('d'),
                        outlineNode: input.outlinePath
                    });
                }
            }
        }
        if (shouldPaint) {
            block.__02CanvasLocal = {x, y};
            const geometry = {
                block,
                x,
                y,
                width,
                height: ownHeight,
                fields,
                valueInputs,
                icons: (block.getIcons ? block.getIcons() : []).map(icon => {
                    const position = parseTranslate(icon.iconGroup_ && icon.iconGroup_.getAttribute('transform'));
                    return {
                        icon,
                        x: x + (position ? position.x : 0),
                        y: y + (position ? position.y : 0),
                        width: numberOr(icon.SIZE, 17),
                        height: numberOr(icon.SIZE, 17)
                    };
                }),
                isReporter,
                isHat,
                outputShape: block.getOutputShape ? block.getOutputShape() : null,
                depth: blockGraphDepth(block),
                pathData: block.svgPath_ && block.svgPath_.getAttribute('d'),
                paintBounds: {
                    left: x - 4,
                    // Scratch's START_HAT_PATH reaches 22px above the block's
                    // model origin. Keep a small additional margin for custom
                    // hats and anti-aliasing at the Canvas clip edge.
                    top: y - (isHat ? HAT_HEIGHT + 4 : 4),
                    right: x + width + 4,
                    bottom: y + ownHeight + 4
                }
            };
            layout.geometries.push(geometry);
            this.indexGeometry(layout, geometry);
        }

        const next = block.getNextBlock && block.getNextBlock();
        if (next) {
            const connectionOffset = (block.nextConnection && block.nextConnection.offsetInBlock_) || {
                x: NOTCH_X,
                y: ownHeight - NOTCH_DEPTH
            };
            const nextConnection = next.previousConnection || next.outputConnection;
            const nextOffset = (nextConnection && nextConnection.offsetInBlock_) || {x: 0, y: 0};
            childLayouts.push({
                block: next,
                x: x + connectionOffset.x - nextOffset.x,
                y: y + connectionOffset.y - nextOffset.y
            });
        }
        if (pendingPositions && !onlyVisible) {
            for (let index = childLayouts.length - 1; index >= 0; index--) {
                pendingPositions.push(childLayouts[index]);
            }
        } else if (!onlyVisible) {
            for (const childLayout of childLayouts) {
                this.layoutModelBlock(childLayout.block, childLayout.x, childLayout.y, layout, seen, null, false);
            }
        }
        return {width, height: ownHeight};
    }

    updateConnectionPositions (layout) {
        if (!layout || !this.isLiveBlock(layout.root)) return;
        // Native Blockly keeps the dragged connections at their drag-start
        // coordinates. InsertionMarkerManager applies the current pointer
        // delta to those coordinates on every move. Canvas paints the moving
        // root through __02CanvasDragPosition, so updating the connection
        // database here would replace the native baseline with the current
        // visual position and make the next delta count twice.
        if (this.draggingRoot === layout.root) return;
        const rootPosition = getRootPosition(layout.root);
        for (const geometry of layout.geometries) {
            const block = geometry.block;
            if (!this.isLiveBlock(block)) continue;
            const topLeft = {x: rootPosition.x + geometry.x, y: rootPosition.y + geometry.y};
            for (const connection of block.getConnections_ ? block.getConnections_(true) : []) {
                if (connection.moveToOffset) connection.moveToOffset(topLeft);
            }
        }
    }

    getPath (pathData) {
        if (!pathData) return null;
        if (this.pathCache.has(pathData)) return this.pathCache.get(pathData);
        let path = null;
        try {
            path = new Path2D(pathData);
        } catch (error) {
            path = null;
        }
        this.pathCache.set(pathData, path);
        return path;
    }

    getEstimatedRootBounds (root) {
        const layout = this.rootLayouts.get(root && root.id);
        if (layout && !layout.projectionDirty && layout.projectionBounds) {
            const position = getRootPosition(root);
            return {
                left: layout.projectionBounds.left + position.x,
                top: layout.projectionBounds.top + position.y,
                right: layout.projectionBounds.right + position.x,
                bottom: layout.projectionBounds.bottom + position.y
            };
        }
        if (layout && layout.cachedRootBounds) {
            const position = getRootPosition(root);
            return {
                left: layout.cachedRootBounds.left + position.x,
                top: layout.cachedRootBounds.top + position.y,
                right: layout.cachedRootBounds.right + position.x,
                bottom: layout.cachedRootBounds.bottom + position.y
            };
        }
        const position = getRootPosition(root);
        const measuredWidth = numberOr(root.width);
        const measuredHeight = numberOr(root.height);
        const estimatedWidth = measuredWidth > 0 ? measuredWidth :
            numberOr(root.lazyEstimatedWidth_, 320);
        const estimatedHeight = measuredHeight > 0 ? measuredHeight :
            numberOr(root.lazyEstimatedHeight_, 160);
        const width = Math.max(
            160,
            estimatedWidth
        );
        const height = Math.max(
            STACK_HEIGHT,
            estimatedHeight
        );
        return {
            left: position.x - 4,
            top: position.y - HAT_HEIGHT - 4,
            right: position.x + width + 4,
            bottom: position.y + height + 4
        };
    }

    rootMayIntersect (root, worldBounds) {
        if (!worldBounds) return true;
        return rectsIntersect(this.getEstimatedRootBounds(root), worldBounds);
    }

    getRootViewportDistance (root, worldBounds) {
        if (!worldBounds) return 0;
        return rectDistance(this.getEstimatedRootBounds(root), worldBounds);
    }

    isRootSelected (root) {
        const selected = this.ScratchBlocks && this.ScratchBlocks.selected;
        return !!(selected && selected.workspace === this.workspace &&
            selected.getRootBlock && selected.getRootBlock() === root);
    }

    evictOffscreenProjection (layout, worldBounds, timestamp) {
        if (!layout || !worldBounds || layout.projectionDirty ||
            !layout.projectedPositions.size || layout.root === this.draggingRoot ||
            this.isRootSelected(layout.root) || this.forceMaterializedIds.has(layout.root.id)) {
            return;
        }
        const viewportSpan = Math.max(
            1,
            (worldBounds.right - worldBounds.left) +
            (worldBounds.bottom - worldBounds.top)
        );
        const distance = this.getRootViewportDistance(layout.root, worldBounds);
        if (distance <= viewportSpan * VIRTUAL_UNLOAD_SCREENS ||
            timestamp - layout.lastNearAt < VIRTUAL_UNLOAD_DELAY_MS) return;

        // Keep an exact wake-up rectangle but release the Canvas-only index.
        // The Blockly graph and all fields remain alive for addons, comments,
        // serialization and connection matching.
        if (layout.projectionBounds) {
            layout.cachedRootBounds = Object.assign({}, layout.projectionBounds);
        }
        // Release only Canvas-derived geometry. Blockly's block graph, fields,
        // variables, comments and connections remain untouched, so returning
        // to this root can rebuild its paint scene without changing project
        // semantics or serialization.
        for (const geometry of layout.geometries) {
            if (geometry && geometry.block &&
                this.blockGeometry.get(geometry.block.id) === geometry) {
                this.blockGeometry.delete(geometry.block.id);
            }
        }
        layout.geometries = [];
        layout.fields = [];
        layout.buckets = new Map();
        layout.bounds = null;
        layout.projectedPositions.clear();
        layout.projectedPaintBounds.clear();
        layout.projectedBuckets.clear();
        layout.projectedBlocks.clear();
        layout.visibleIds.clear();
        layout.projectionDirty = true;
        layout.projectionBuiltAt = 0;
    }

    ensureLayouts (worldBounds = null) {
        return this.ensureLayoutsForRoot(worldBounds, null);
    }

    ensureLayoutsForRoot (worldBounds = null, requestedRoot = null) {
        const roots = this.workspace.getTopBlocks ? this.workspace.getTopBlocks(false) : [];
        const live = new Set(roots.map(root => root.id));
        for (const key of this.rootLayouts.keys()) {
            if (!live.has(key)) {
                const stale = this.rootLayouts.get(key);
                for (const geometry of (stale && stale.geometries) || []) {
                    this.blockGeometry.delete(geometry.block && geometry.block.id);
                }
                this.rootLayouts.delete(key);
                this.layoutTasks.delete(key);
            }
        }
        for (const root of roots) {
            if (requestedRoot && root !== requestedRoot) continue;
            const layout = this.getRootLayout(root);
            this.updateVisibleProjection(layout, worldBounds);
            const materialized = new Set(layout.geometries.map(geometry => geometry.block && geometry.block.id));
            const hasMissingVisible = Array.from(layout.visibleIds).some(id =>
                !materialized.has(id) && !layout.skippedIds.has(id));
            if ((layout.dirty || hasMissingVisible) &&
                (requestedRoot === root || this.rootMayIntersect(root, worldBounds))) {
                this.layoutTasks.delete(root.id);
                this.layoutRoot(root, worldBounds);
                this.updateConnectionPositions(layout);
            }
        }
        return roots.map(root => this.getRootLayout(root));
    }

    getBlockWorkspacePosition (block) {
        const root = rootOf(block);
        const rootPosition = getRootPosition(root);
        const geometry = this.blockGeometry.get(block.id);
        // During the first native pass a nested block may not have a committed
        // Canvas geometry yet. Blockly still asks for its connection position
        // while constructing insertion markers, so use the cheap projected
        // graph position instead of treating it as the root at (0, 0). This
        // keeps flyout and nested-block snapping aligned with native Blockly.
        const layout = this.rootLayouts.get(root && root.id);
        const projected = layout && layout.projectedPositions &&
            layout.projectedPositions.get(block.id);
        const x = rootPosition.x + (geometry ? geometry.x : (projected ? projected.x : 0));
        const y = rootPosition.y + (geometry ? geometry.y : (projected ? projected.y : 0));
        const Coordinate = this.ScratchBlocks.goog && this.ScratchBlocks.goog.math &&
            this.ScratchBlocks.goog.math.Coordinate;
        return Coordinate ? new Coordinate(x, y) : {x, y};
    }

    getWorkspaceRect () {
        return this.injection && this.injection.getBoundingClientRect ? this.injection.getBoundingClientRect() : null;
    }

    getTransform () {
        return parseWorkspaceTransform(this.workspace);
    }

    workspaceToClient (x, y) {
        const rect = this.getWorkspaceRect() || {left: 0, top: 0};
        const transform = this.getTransform();
        return {
            x: rect.left + transform.x + (x * transform.scale),
            y: rect.top + transform.y + (y * transform.scale)
        };
    }

    ensureBlockGeometry (block) {
        if (!this.isLiveBlock(block)) return null;
        let geometry = this.blockGeometry.get(block.id);
        if (geometry || this.renderingNative || this.layoutSuspended) return geometry || null;

        const root = rootOf(block);
        const layout = this.getRootLayout(root);
        this.ensureProjection(layout);
        const projected = layout.projectedPositions.get(block.id);
        // Compatibility APIs frequently ask for one model node's rectangle.
        // Materialize only that block and its inline value dependencies. The
        // complete graph projection is cheap and remains available for
        // connection math, but native Blockly rendering of the whole root is
        // not required to answer a single rectangle query.
        geometry = this.materializeSingleBlock(block, layout, projected);
        return geometry || null;
    }

    materializeSingleBlock (block, layout, projected) {
        if (!this.isLiveBlock(block) || !layout || !projected) return null;
        const ids = new Set([block.id]);
        const pending = [block];
        while (pending.length) {
            const current = pending.pop();
            for (const input of current.inputList || []) {
                if (!input.connection ||
                    (input.connection.type !== this.ScratchBlocks.INPUT_VALUE &&
                    !this.isProcedureHeaderBlock(current))) continue;
                const child = input.connection.targetBlock && input.connection.targetBlock();
                if (this.isLiveBlock(child) && !ids.has(child.id)) {
                    ids.add(child.id);
                    pending.push(child);
                }
            }
        }

        const previousVisible = layout.visibleIds;
        layout.visibleIds = new Set(previousVisible);
        for (const id of ids) layout.visibleIds.add(id);
        const scene = this.createLayoutScene(layout, false);
        const nativeBlocks = this.collectMeasurementBlocks([block])
            .filter(candidate => this.needsNativeMeasurement(candidate));
        nativeBlocks.sort((a, b) => {
            const depth = candidate => {
                let value = 0;
                let current = candidate;
                while (current && current.getParent && current.getParent()) {
                    value++;
                    current = current.getParent();
                }
                return value;
            };
            return depth(b) - depth(a);
        });
        const wasRenderingNative = this.renderingNative;
        this.renderingNative = true;
        try {
            for (const candidate of nativeBlocks) this.renderNativeBlock(candidate);
        } finally {
            this.renderingNative = wasRenderingNative;
        }

        const seen = new Set(scene.geometries.map(geometry => geometry.block && geometry.block.id));
        this.layoutModelBlock(
            block,
            projected.x,
            projected.y,
            scene,
            seen,
            null,
            true
        );
        this.commitLayoutScene(layout, scene);
        this.updateConnectionPositions(layout);
        this.scheduleDraw();
        return this.blockGeometry.get(block.id) || null;
    }

    getBlockClientRect (block) {
        const geometry = this.ensureBlockGeometry(block);
        if (!geometry) return {left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0};
        const rootPosition = getRootPosition(rootOf(block));
        const start = this.workspaceToClient(rootPosition.x + geometry.x, rootPosition.y + geometry.y);
        const scale = this.getTransform().scale;
        const width = geometry.width * scale;
        const height = geometry.height * scale;
        return {left: start.x, top: start.y, right: start.x + width, bottom: start.y + height, width, height};
    }

    getFieldClientRect (field) {
        this.ensureBlockGeometry(field && field.sourceBlock_);
        const geometry = this.fieldGeometry.get(field);
        if (!geometry) return {left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0};
        const rootPosition = getRootPosition(rootOf(geometry.block));
        const start = this.workspaceToClient(rootPosition.x + geometry.x, rootPosition.y + geometry.y);
        const scale = this.getTransform().scale;
        const width = geometry.width * scale;
        const height = geometry.height * scale;
        return {left: start.x, top: start.y, right: start.x + width, bottom: start.y + height, width, height};
    }

    getFieldNodePaintOffset (field, node) {
        const root = field && (
            (typeof field.getSvgRoot === 'function' && field.getSvgRoot()) ||
            field.fieldGroup_ ||
            field.textElement_
        );
        if (!node) return {x: 0, y: 0};
        let current = node;
        let x = 0;
        let y = 0;
        while (current) {
            // x/y are local drawing coordinates for text, image and rect
            // nodes. A field root's transform is the field's block position and
            // is already represented by fieldGeometry, so exclude that
            // transform but keep the root's own drawing coordinates.
            x += numberOr(current.getAttribute && current.getAttribute('x'));
            y += numberOr(current.getAttribute && current.getAttribute('y'));
            if (current === root) {
                break;
            }
            const transform = parseTranslate(current.getAttribute && current.getAttribute('transform'));
            if (transform) {
                x += transform.x;
                y += transform.y;
            }
            current = current.parentNode;
        }
        // Detached compatibility nodes have no parent chain. Their own
        // attributes are still useful, but must remain relative to the field.
        return {x, y};
    }

    getTextNodeStyle (node) {
        const getValue = (name, fallback = '') => {
            const attribute = node && node.getAttribute && node.getAttribute(name);
            if (attribute !== null && attribute !== '') return attribute;
            const style = node && node.style;
            if (style) {
                const value = style[name] || (style.getPropertyValue && style.getPropertyValue(name));
                if (value) return value;
            }
            return fallback;
        };
        const className = String((node && node.getAttribute && node.getAttribute('class')) || '');
        return {
            fontSize: getValue('font-size', className.includes('blocklyTextTruncated') ? '11pt' : BLOCK_TEXT_FONT_SIZE),
            fontFamily: getValue('font-family', '"Helvetica Neue", Helvetica, sans-serif'),
            fontWeight: getValue('font-weight', '500'),
            textAnchor: getValue('text-anchor', 'start'),
            dominantBaseline: getValue('dominant-baseline', 'alphabetic'),
            dy: numberOr(getValue('dy', 0)),
            fill: getValue('fill', '')
        };
    }

    getCanvasTextValue (field, node) {
        // The model node contains Blockly's already formatted display value
        // (ellipsis, NBSP and RTL markers included). Using it keeps Canvas
        // text width and position identical to the native SVG text node.
        if (node && typeof node.textContent === 'string' && node.textContent.length) {
            return node.textContent;
        }
        return fieldText(field);
    }

    drawSvgText (context, value, x, y, style) {
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        context.textAlign = style.textAnchor === 'middle' ? 'center' :
            (style.textAnchor === 'end' ? 'right' : 'left');
        const baseline = String(style.dominantBaseline || 'alphabetic').toLowerCase();
        if (baseline === 'middle' || baseline === 'central') {
            // Blockly's block fields use dominant-baseline="middle". Let the
            // browser use the same Canvas middle baseline for every field,
            // rather than mixing font-metric corrections that move ordinary
            // labels and editable/dropdown fields in opposite directions.
            context.textBaseline = 'middle';
            context.fillText(value, x, y + style.dy);
            return;
        }
        context.textBaseline = baseline === 'hanging' ? 'hanging' :
            (baseline === 'ideographic' ? 'ideographic' : 'alphabetic');
        context.fillText(value, x, y + style.dy);
    }

    getVisibleWorldBounds () {
        const rect = this.getWorkspaceRect();
        if (!rect) return null;
        const transform = this.getTransform();
        return {
            left: (-transform.x / transform.scale) - VIEWPORT_MARGIN,
            top: (-transform.y / transform.scale) - VIEWPORT_MARGIN,
            right: ((rect.width - transform.x) / transform.scale) + VIEWPORT_MARGIN,
            bottom: ((rect.height - transform.y) / transform.scale) + VIEWPORT_MARGIN
        };
    }

    getIconClientRect (icon) {
        const block = icon && icon.block_;
        const blockRect = block ? this.getBlockClientRect(block) : null;
        if (!blockRect) return null;
        const location = icon && icon.getIconLocation && icon.getIconLocation();
        const size = numberOr(icon && icon.SIZE, 17) * this.getTransform().scale;
        if (!location) return blockRect;
        const center = this.workspaceToClient(location.x, location.y);
        return {
            left: center.x - (size / 2),
            top: center.y - (size / 2),
            right: center.x + (size / 2),
            bottom: center.y + (size / 2),
            width: size,
            height: size
        };
    }

    isBroadcastMenuField (field, block) {
        return !!field && !!block &&
            field.name === 'BROADCAST_OPTION' &&
            block.type === 'event_broadcast_menu';
    }

    fieldHitContains (candidate, localX, localY, geometry = null) {
        if (!candidate) return false;
        const inField = localX >= candidate.x &&
            localX <= candidate.x + candidate.width &&
            localY >= candidate.y &&
            localY <= candidate.y + candidate.height;
        if (inField) return true;

        // The field used by event_broadcast is inside an output shadow block.
        // Some Blockly versions do not expose the shadow field's final
        // translate until its parent block has rendered. The shadow block
        // geometry is still authoritative, so use it as a narrow fallback for
        // this field only. Do not broaden ordinary field hit boxes.
        return this.isBroadcastMenuField(candidate.field, candidate.block) &&
            !!geometry && localX >= geometry.x &&
            localX <= geometry.x + geometry.width &&
            localY >= geometry.y &&
            localY <= geometry.y + geometry.height;
    }

    queryLayout (layout, worldBounds) {
        if (!worldBounds) {
            return layout.geometries.slice()
                .filter(geometry => geometry && this.isLiveBlock(geometry.block))
                .sort((a, b) => a.depth - b.depth);
        }
        const position = getRootPosition(layout.root);
        const local = {
            left: worldBounds.left - position.x,
            top: worldBounds.top - position.y,
            right: worldBounds.right - position.x,
            bottom: worldBounds.bottom - position.y
        };
        const indices = new Set();
        const minX = Math.floor(local.left / SPATIAL_CELL_SIZE);
        const maxX = Math.floor(local.right / SPATIAL_CELL_SIZE);
        const minY = Math.floor(local.top / SPATIAL_CELL_SIZE);
        const maxY = Math.floor(local.bottom / SPATIAL_CELL_SIZE);
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const bucket = layout.buckets.get(`${x}:${y}`);
                if (bucket) bucket.forEach(index => indices.add(index));
            }
        }
        return Array.from(indices)
            .map(index => layout.geometries[index])
            .filter(geometry => rectsIntersect(geometry.paintBounds, local))
            // Parent shapes form the background of inline and statement
            // children. Async materialization may append geometries in any
            // order, so enforce the same back-to-front order as native SVG.
            .sort((a, b) => a.depth - b.depth);
    }

    pointIntersectsGeometry (geometry, x, y) {
        if (x < geometry.paintBounds.left || x > geometry.paintBounds.right ||
            y < geometry.paintBounds.top || y > geometry.paintBounds.bottom) return false;
        const path = this.getPath(geometry.pathData);
        if (!path || !this.hitContext) {
            return x >= geometry.x && x <= geometry.x + geometry.width &&
                y >= geometry.y - (geometry.isHat ? HAT_HEIGHT : 0) &&
                y <= geometry.y + geometry.height;
        }
        const pathNode = geometry.block && geometry.block.svgPath_;
        const pathScale = parseTransformScale(pathNode && pathNode.getAttribute &&
            pathNode.getAttribute('transform'));
        const localX = (x - geometry.x) / pathScale.x;
        const localY = (y - geometry.y) / pathScale.y;
        return this.hitContext.isPointInPath(path, localX, localY, 'evenodd');
    }

    blockPath (context, geometry) {
        const {x, y, width, height, isReporter, isHat, outputShape, statementInputs = []} = geometry;
        const path = new Path2D();
        if (isReporter) {
            if (outputShape === this.ScratchBlocks.OUTPUT_SHAPE_HEXAGONAL) {
                const point = height / 2;
                path.moveTo(x + point, y);
                path.lineTo(x + width - point, y);
                path.lineTo(x + width, y + point);
                path.lineTo(x + width - point, y + height);
                path.lineTo(x + point, y + height);
                path.lineTo(x, y + point);
                path.closePath();
            } else if (outputShape === this.ScratchBlocks.OUTPUT_SHAPE_SQUARE) {
                path.roundRect(x, y, width, height, 4);
            } else {
                path.roundRect(x, y, width, height, height / 2);
            }
            return path;
        }

        path.moveTo(x + 4, y);
        if (isHat) {
            path.bezierCurveTo(x + 29, y - 22, x + 75, y - 22, x + 100, y);
        } else if (geometry.block.previousConnection) {
            path.lineTo(x + NOTCH_X, y);
            path.lineTo(x + NOTCH_X + 6, y + 4);
            path.lineTo(x + NOTCH_X + 10, y + NOTCH_DEPTH);
            path.lineTo(x + NOTCH_X + NOTCH_WIDTH - 10, y + NOTCH_DEPTH);
            path.lineTo(x + NOTCH_X + NOTCH_WIDTH - 6, y + 4);
            path.lineTo(x + NOTCH_X + NOTCH_WIDTH, y);
        }
        path.lineTo(x + width - 4, y);
        path.quadraticCurveTo(x + width, y, x + width, y + 4);
        path.lineTo(x + width, y + height - 4);
        path.quadraticCurveTo(x + width, y + height, x + width - 4, y + height);
        if (geometry.block.nextConnection) {
            path.lineTo(x + NOTCH_X + NOTCH_WIDTH, y + height);
            path.lineTo(x + NOTCH_X + NOTCH_WIDTH - 6, y + height + 4);
            path.lineTo(x + NOTCH_X + NOTCH_WIDTH - 10, y + height + NOTCH_DEPTH);
            path.lineTo(x + NOTCH_X + 10, y + height + NOTCH_DEPTH);
            path.lineTo(x + NOTCH_X + 6, y + height + 4);
            path.lineTo(x + NOTCH_X, y + height);
        }
        path.lineTo(x + 4, y + height);
        path.quadraticCurveTo(x, y + height, x, y + height - 4);
        path.lineTo(x, y + 4);
        path.quadraticCurveTo(x, y, x + 4, y);
        path.closePath();
        for (const statement of statementInputs) {
            const cavityTop = y + statement.top;
            const cavityBottom = cavityTop + statement.height;
            path.moveTo(x + STATEMENT_INDENT, cavityTop);
            path.lineTo(x + width + 2, cavityTop);
            path.lineTo(x + width + 2, cavityBottom);
            path.lineTo(x + STATEMENT_INDENT, cavityBottom);
            path.closePath();
        }
        return path;
    }

    drawField (context, fieldGeometry) {
        const {field, x, y, width, height, block} = fieldGeometry;
        const isHidden = node => !!(
            node && (
                (node.getAttribute && (node.getAttribute('display') === 'none' ||
                    node.getAttribute('visibility') === 'hidden')) ||
                (node.style && (node.style.display === 'none' || node.style.visibility === 'hidden'))
            )
        );
        if (isHidden(field.fieldGroup_) || isHidden(field.textElement_)) return;

        const drawImageNode = (node, fallbackSource, fallbackWidth, fallbackHeight) => {
            if (!node && !fallbackSource) return false;
            const source = fallbackSource || (node.getAttribute && (
                node.getAttribute('href') || node.getAttribute('xlink:href')
            ));
            if (!source) return false;
            let image = this.imageCache.get(source);
            if (!image && typeof Image !== 'undefined') {
                image = new Image();
                image.onload = () => this.scheduleDraw();
                image.src = source;
                this.imageCache.set(source, image);
            }
            if (!image || !image.complete || !image.naturalWidth) return true;
            const nodeOffset = node && this.getFieldNodePaintOffset(field, node);
            const size = parseTransformScale(node && node.getAttribute && node.getAttribute('transform'));
            const imageX = x + (nodeOffset ? nodeOffset.x : 0);
            const imageY = y + (nodeOffset ? nodeOffset.y : 0);
            const imageWidth = numberOr(node && node.getAttribute && node.getAttribute('width'), fallbackWidth);
            const imageHeight = numberOr(node && node.getAttribute && node.getAttribute('height'), fallbackHeight);
            context.save();
            context.translate(imageX, imageY);
            context.scale(size.x, size.y);
            context.drawImage(image, 0, 0, imageWidth, imageHeight);
            context.restore();
            return true;
        };

        const source = resolveImageSource(field);
        if (source) {
            drawImageNode(field.imageElement_, source, width, height);
            return;
        }
        if (typeof field.state_ !== 'undefined') {
            const checkNode = field.checkElement_;
            if (!isHidden(checkNode)) {
                const checkOffset = checkNode && this.getFieldNodePaintOffset(field, checkNode);
                const checkX = checkOffset ? checkOffset.x : -3;
                const checkY = checkOffset ? checkOffset.y : height / 2;
                context.fillStyle = '#fff';
                context.font = BLOCK_TEXT_FONT;
                context.textBaseline = 'middle';
                context.textAlign = 'left';
                context.fillText(field.state_ ? '\u2713' : '',
                    x + checkX,
                    y + checkY);
            }
            return;
        }
        const editable = !!field.EDITABLE;
        const dropdown = !!(field.getOptions || field.positionArrow);
        const box = field.box_;
        if (box && !isHidden(box)) {
            const boxOffset = this.getFieldNodePaintOffset(field, box);
            const boxX = x + boxOffset.x;
            const boxY = y + boxOffset.y;
            const boxWidth = numberOr(box.getAttribute && box.getAttribute('width'), width);
            const boxHeight = numberOr(box.getAttribute && box.getAttribute('height'), height);
            const radius = numberOr(box.getAttribute && box.getAttribute('rx'), 4);
            context.fillStyle = (box.getAttribute && box.getAttribute('fill')) ||
                (block.getColour ? block.getColour() : '#4c97ff');
            context.strokeStyle = (box.getAttribute && box.getAttribute('stroke')) ||
                (block.getColourTertiary ? block.getColourTertiary() : 'rgba(0,0,0,.2)');
            context.lineWidth = 1;
            context.beginPath();
            context.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
            context.fill();
            context.stroke();
        } else if (editable && !block.isShadow()) {
            context.fillStyle = block.getColour ? block.getColour() : '#4c97ff';
            context.strokeStyle = block.getColourTertiary ? block.getColourTertiary() : 'rgba(0,0,0,.18)';
            context.lineWidth = 1;
            context.beginPath();
            context.roundRect(x, y, width, height, Math.min(16, height / 2));
            context.fill();
            context.stroke();
        }
        const textNode = field.textElement_;
        const textStyle = this.getTextNodeStyle(textNode);
        const Colours = this.ScratchBlocks.Colours || {};
        const textClasses = [
            textNode && textNode.getAttribute && textNode.getAttribute('class'),
            field.fieldGroup_ && field.fieldGroup_.getAttribute && field.fieldGroup_.getAttribute('class'),
            field.className_
        ].join(' ');
        const isArgumentReporter = block.type === 'argument_reporter_boolean' ||
            block.type === 'argument_reporter_string_number';
        if (isArgumentReporter || textClasses.includes('blocklyDropdownText') ||
            textClasses.includes('blocklyEditableLabel')) {
            context.fillStyle = Colours.text || '#fff';
        } else if (textClasses.includes('blocklyNonEditableText') ||
            textClasses.includes('blocklyEditableText')) {
            context.fillStyle = Colours.textFieldText || '#575e75';
        } else if (block.isShadow && block.isShadow()) {
            context.fillStyle = Colours.textFieldText || '#575e75';
        } else {
            context.fillStyle = textStyle.fill || Colours.text || '#fff';
        }
        const textOffset = textNode && this.getFieldNodePaintOffset(field, textNode);
        this.drawSvgText(context, this.getCanvasTextValue(field, textNode),
            x + (textOffset ? textOffset.x : width / 2),
            y + (textOffset ? textOffset.y : height / 2), textStyle);

        // Blockly positions the real dropdown image with arrowX_/arrowY_.
        // Reusing those values avoids the old fixed `width - 12` placement,
        // which was wrong for custom padding, RTL and long labels.
        if (dropdown && !drawImageNode(field.arrow_, null, field.arrowSize_ || 12, field.arrowSize_ || 12)) {
            const arrowX = numberOr(field.arrowX_, width - 12);
            const arrowY = numberOr(field.arrowY_, (height - 4) / 2);
            context.beginPath();
            context.moveTo(x + arrowX, y + arrowY);
            context.lineTo(x + arrowX + 6, y + arrowY);
            context.lineTo(x + arrowX + 3, y + arrowY + 4);
            context.closePath();
            context.fill();
        }
    }

    getFieldModelNodes (block) {
        const nodes = new Set();
        const add = node => {
            if (!node || nodes.has(node)) return;
            nodes.add(node);
            for (const child of node.childNodes || []) add(child);
        };
        for (const input of block.inputList || []) {
            for (const field of input.fieldRow || []) {
                add(field.fieldGroup_);
                add(field.textElement_);
                add(field.box_);
                add(field.arrow_);
                add(field.imageElement_);
                add(field.checkElement_);
            }
        }
        return nodes;
    }

    drawModelDecorations (context, geometry) {
        const root = geometry.block && geometry.block.svgGroup_;
        if (!root || !root.childNodes) return;
        const block = geometry.block;
        const fieldNodes = this.getFieldModelNodes(block);
        const drawNode = node => {
            if (!node || node === block.svgPath_) return;
            const isFieldNode = node.__02CanvasModelNode &&
                ['field', 'field-box', 'field-arrow', 'input'].includes(node.kind);
            if (fieldNodes.has(node) || isFieldNode) return;
            const tagName = String(node.tagName || '').toLowerCase();
            context.save();
            const transform = parseTranslate(node.getAttribute && node.getAttribute('transform'));
            if (transform) context.translate(transform.x, transform.y);
            const scale = /scale\(\s*([-+\d.e]+)(?:[, ]+\s*([-+\d.e]+))?/.exec(
                String((node.getAttribute && node.getAttribute('transform')) || '')
            );
            if (scale) context.scale(numberOr(scale[1], 1), numberOr(scale[2], numberOr(scale[1], 1)));
            const style = node.style || {};
            const stroke = (node.getAttribute && node.getAttribute('stroke')) || style.stroke;
            const fill = (node.getAttribute && node.getAttribute('fill')) || style.fill;
            const strokeWidth = numberOr(
                (node.getAttribute && node.getAttribute('stroke-width')) || style.strokeWidth,
                1
            );
            context.lineWidth = strokeWidth;
            context.lineCap = (node.getAttribute && node.getAttribute('stroke-linecap')) || 'butt';
            context.lineJoin = (node.getAttribute && node.getAttribute('stroke-linejoin')) || 'miter';
            if (tagName === 'path') {
                const pathData = node.getAttribute && node.getAttribute('d');
                if (pathData) {
                    const path = this.getPath(pathData);
                    if (path) {
                        if (fill && fill !== 'none') {
                            context.fillStyle = fill;
                            context.fill(path);
                        }
                        if (stroke && stroke !== 'none') {
                            context.strokeStyle = stroke;
                            context.stroke(path);
                        }
                    }
                }
            } else if (tagName === 'line' && stroke && stroke !== 'none') {
                context.beginPath();
                context.strokeStyle = stroke;
                context.moveTo(
                    numberOr(node.getAttribute && node.getAttribute('x1')),
                    numberOr(node.getAttribute && node.getAttribute('y1'))
                );
                context.lineTo(
                    numberOr(node.getAttribute && node.getAttribute('x2')),
                    numberOr(node.getAttribute && node.getAttribute('y2'))
                );
                context.stroke();
            } else if (tagName === 'circle' || tagName === 'rect') {
                const x = numberOr(node.getAttribute && node.getAttribute('x'));
                const y = numberOr(node.getAttribute && node.getAttribute('y'));
                const width = numberOr(node.getAttribute && node.getAttribute('width'),
                    numberOr(node.getAttribute && node.getAttribute('r')) * 2);
                const height = numberOr(node.getAttribute && node.getAttribute('height'), width);
                const cx = numberOr(node.getAttribute && node.getAttribute('cx'), x + (width / 2));
                const cy = numberOr(node.getAttribute && node.getAttribute('cy'), y + (height / 2));
                context.beginPath();
                if (tagName === 'circle') context.arc(cx, cy, width / 2, 0, Math.PI * 2);
                else context.rect(x, y, width, height);
                if (fill && fill !== 'none') {
                    context.fillStyle = fill;
                    context.fill();
                }
                if (stroke && stroke !== 'none') {
                    context.strokeStyle = stroke;
                    context.stroke();
                }
            } else if (tagName === 'image') {
                const source = node.getAttribute && (
                    node.getAttribute('href') || node.getAttribute('xlink:href')
                );
                if (source) {
                    let image = this.imageCache.get(source);
                    if (!image && typeof Image !== 'undefined') {
                        image = new Image();
                        image.onload = () => this.scheduleDraw();
                        image.src = source;
                        this.imageCache.set(source, image);
                    }
                    if (image && image.complete && image.naturalWidth) {
                        context.drawImage(
                            image,
                            numberOr(node.getAttribute('x')),
                            numberOr(node.getAttribute('y')),
                            numberOr(node.getAttribute('width')),
                            numberOr(node.getAttribute('height'))
                        );
                    }
                }
            }
            for (const child of node.childNodes || []) drawNode(child);
            context.restore();
        };
        context.save();
        context.translate(geometry.x, geometry.y);
        for (const node of root.childNodes) drawNode(node);
        context.restore();
    }

    hasReplacementGlow (node) {
        if (!node) return false;
        const filter = node.getAttribute && node.getAttribute('filter');
        return !!filter || !!(node.classList && node.classList.contains('blocklyReplaceable'));
    }

    drawReplacementGlow (context, path) {
        if (!path) return;
        const colours = this.ScratchBlocks.Colours || {};
        context.save();
        context.globalAlpha *= numberOr(colours.replacementGlowOpacity, 1);
        context.strokeStyle = colours.replacementGlow || '#fff';
        context.lineWidth = Math.max(2, numberOr(colours.replacementGlowSize, 2) * 2);
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke(path);
        context.restore();
    }

    drawGeometry (context, geometry, rootPosition) {
        if (!geometry || !this.isLiveBlock(geometry.block)) return;
        context.save();
        context.translate(rootPosition.x, rootPosition.y);
        const block = geometry.block;
        const pathNode = block.svgPath_;
        const groupNode = block.svgGroup_;
        const isHidden = node => !!(
            node && node.getAttribute && (
                node.getAttribute('display') === 'none' ||
                node.getAttribute('visibility') === 'hidden' ||
                node.getAttribute('visibility') === 'collapse'
            )
        );
        // Blockly hides insertion markers with SVG visibility. Canvas has no
        // browser SVG layout to do this for us, so honor the same model state.
        // Without this guard an unused marker is painted at its initial (0, 0)
        // position and looks like a grey block in the workspace corner.
        if (isHidden(groupNode) || isHidden(pathNode)) {
            context.restore();
            return;
        }
        // InsertionMarkerManager creates marker blocks as ordinary top-level
        // blocks and only sets visibility when a connection preview is active.
        // A Canvas model node has no native SVG/CSS default, so treat the
        // missing visibility attribute as hidden to avoid painting the marker
        // at its initial (0, 0) position during the first flyout drag.
        if (block.isInsertionMarker && block.isInsertionMarker() &&
            (!groupNode || groupNode.getAttribute('visibility') !== 'visible')) {
            context.restore();
            return;
        }
        let fill = block.getColour ? block.getColour() : '#4c97ff';
        const styleFill = pathNode && (
            (pathNode.getAttribute && pathNode.getAttribute('fill')) ||
            (pathNode.style && pathNode.style.fill)
        );
        if (styleFill) fill = styleFill;
        context.fillStyle = fill;
        const styleStroke = pathNode && (
            (pathNode.getAttribute && pathNode.getAttribute('stroke')) ||
            (pathNode.style && pathNode.style.stroke)
        );
        context.strokeStyle = styleStroke ||
            (block.getColourTertiary ? block.getColourTertiary() : 'rgba(0,0,0,.2)');
        const styleOpacity = pathNode && (
            (pathNode.getAttribute && pathNode.getAttribute('opacity')) ||
            (pathNode.style && pathNode.style.opacity)
        );
        const blockAlpha = context.globalAlpha;
        if (styleOpacity) context.globalAlpha *= Math.max(0, Math.min(1, numberOr(styleOpacity, 1)));
        const styleStrokeWidth = pathNode && (
            (pathNode.getAttribute && pathNode.getAttribute('stroke-width')) ||
            (pathNode.style && pathNode.style.strokeWidth)
        );
        if (styleStrokeWidth) context.lineWidth = numberOr(styleStrokeWidth, context.lineWidth);
        const isSelected = this.ScratchBlocks.selected === block ||
            (groupNode && groupNode.classList && groupNode.classList.contains('blocklySelected'));
        context.lineWidth = isSelected ? 3 : 1;
        if (styleStrokeWidth) context.lineWidth = numberOr(styleStrokeWidth, context.lineWidth);
        if (block.disabled) context.globalAlpha = 0.5;
        if (groupNode && groupNode.classList && groupNode.classList.contains('blocklyDraggingDelete')) {
            context.globalAlpha *= 0.35;
        }
        if (block.isInsertionMarker && block.isInsertionMarker()) context.globalAlpha = 0.35;
        const nativePath = this.getPath(geometry.pathData);
        if (nativePath) {
            context.save();
            context.translate(geometry.x, geometry.y);
            const pathScale = parseTransformScale(pathNode && pathNode.getAttribute &&
                pathNode.getAttribute('transform'));
            context.scale(pathScale.x, pathScale.y);
            if (this.hasReplacementGlow(pathNode)) this.drawReplacementGlow(context, nativePath);
            context.fill(nativePath, 'evenodd');
            context.stroke(nativePath);
            context.restore();
        } else {
            const path = this.blockPath(context, geometry);
            if (this.hasReplacementGlow(pathNode)) this.drawReplacementGlow(context, path);
            context.fill(path, geometry.statementInputs && geometry.statementInputs.length ? 'evenodd' : 'nonzero');
            context.stroke(path);
        }
        context.globalAlpha = blockAlpha;
        this.drawModelDecorations(context, geometry);
        for (const input of geometry.valueInputs) {
            context.save();
            context.fillStyle = block.getColourQuaternary ? block.getColourQuaternary() : '#fff';
            context.strokeStyle = block.getColourTertiary ? block.getColourTertiary() : 'rgba(0,0,0,.2)';
            const inputPath = this.getPath(input.pathData);
            context.translate(input.x, input.y);
            if (inputPath) {
                if (this.hasReplacementGlow(input.outlineNode)) {
                    this.drawReplacementGlow(context, inputPath);
                }
                context.fill(inputPath);
                context.stroke(inputPath);
            } else {
                const fallbackPath = new Path2D();
                if (input.shape === this.ScratchBlocks.OUTPUT_SHAPE_HEXAGONAL) {
                    const point = input.height / 2;
                    fallbackPath.moveTo(point, 0);
                    fallbackPath.lineTo(input.width - point, 0);
                    fallbackPath.lineTo(input.width, point);
                    fallbackPath.lineTo(input.width - point, input.height);
                    fallbackPath.lineTo(point, input.height);
                    fallbackPath.lineTo(0, point);
                    fallbackPath.closePath();
                } else {
                    fallbackPath.roundRect(0, 0, input.width, input.height, input.height / 2);
                }
                if (this.hasReplacementGlow(input.outlineNode)) {
                    this.drawReplacementGlow(context, fallbackPath);
                }
                context.fill(fallbackPath);
                context.stroke(fallbackPath);
            }
            context.restore();
        }
        for (const field of geometry.fields) this.drawField(context, field);
        context.restore();
    }

    drawConnectionHighlight (context) {
        const connection = this.highlightedConnection;
        if (!connection || !connection.sourceBlock_) return;
        const block = connection.sourceBlock_;
        const root = rootOf(block);
        const position = getRootPosition(root);
        const geometry = this.blockGeometry.get(block.id);
        if (!geometry) return;
        const x = position.x + geometry.x + numberOr(connection.offsetInBlock_ && connection.offsetInBlock_.x);
        const y = position.y + geometry.y + numberOr(connection.offsetInBlock_ && connection.offsetInBlock_.y);
        context.save();
        context.strokeStyle = '#fff200';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(x - 18, y);
        context.lineTo(x + 22, y);
        context.stroke();
        context.restore();
    }

    drawLoadingIndicator (context, rect, completed, total) {
        if (!total || completed >= total) {
            this.loadingIndicatorStartedAt = 0;
            return;
        }
        if (!this.loadingIndicatorStartedAt) this.loadingIndicatorStartedAt = now();
        // Normal edits commonly need one layout frame. Avoid flashing a status
        // card for those fast paths while still reporting genuinely slow loads.
        if (now() - this.loadingIndicatorStartedAt < 120) return;
        const width = Math.min(240, Math.max(160, rect.width * 0.28));
        const height = 30;
        const x = Math.max(8, rect.width - width - 14);
        // The Canvas extends above the injection for hat blocks. Screen-space
        // UI starts below that extension rather than being clipped above the
        // workspace's top edge.
        const y = CANVAS_TOP_PADDING + 12;
        const progress = Math.max(0, Math.min(1, completed / total));
        const message = (this.ScratchBlocks.Msg &&
            (this.ScratchBlocks.Msg.BLOCKS_LOADING || this.ScratchBlocks.Msg.LOADING)) ||
            'Loading blocks';
        context.save();
        context.fillStyle = 'rgba(255, 255, 255, 0.94)';
        context.strokeStyle = 'rgba(0, 186, 173, 0.55)';
        context.lineWidth = 1;
        context.beginPath();
        context.roundRect(x, y, width, height, 6);
        context.fill();
        context.stroke();
        context.fillStyle = '#00a99d';
        context.font = '500 12px "Helvetica Neue", Helvetica, sans-serif';
        context.textBaseline = 'middle';
        context.textAlign = 'left';
        context.fillText(`${message} ${Math.round(progress * 100)}%`, x + 10, y + 11);
        context.fillStyle = 'rgba(0, 186, 173, 0.18)';
        context.beginPath();
        context.roundRect(x + 10, y + 20, width - 20, 4, 2);
        context.fill();
        context.fillStyle = '#00baad';
        context.beginPath();
        context.roundRect(x + 10, y + 20, (width - 20) * progress, 4, 2);
        context.fill();
        context.restore();
    }

    clipZoomControls (context, rect) {
        const zoomControls = this.injection && this.injection.querySelector &&
            this.injection.querySelector('.blocklyZoom');
        if (!zoomControls || !zoomControls.getBoundingClientRect) return false;
        const canvasRect = this.canvas && this.canvas.getBoundingClientRect();
        const controlRect = zoomControls.getBoundingClientRect();
        if (!canvasRect || controlRect.width <= 0 || controlRect.height <= 0) return false;
        // Keep the native SVG controls visible and clickable without moving
        // them or placing a second control layer over Blockly. The controls
        // are circular, so punch out one circular hole per button instead of
        // the old rectangular gap around the whole group.
        context.beginPath();
        context.rect(0, 0, rect.width, rect.height + CANVAS_TOP_PADDING);
        const buttons = Array.from(zoomControls.querySelectorAll('image'))
            .map(button => button.getBoundingClientRect())
            .filter(buttonRect => buttonRect.width > 0 && buttonRect.height > 0);
        if (buttons.length) {
            for (const buttonRect of buttons) {
                const centerX = buttonRect.left - canvasRect.left + (buttonRect.width / 2);
                const centerY = buttonRect.top - canvasRect.top + (buttonRect.height / 2);
                const radius = (Math.max(buttonRect.width, buttonRect.height) / 2) + 2;
                context.moveTo(centerX + radius, centerY);
                context.arc(centerX, centerY, radius, 0, Math.PI * 2);
            }
        } else {
            const left = Math.max(0, controlRect.left - canvasRect.left - 2);
            const top = Math.max(0, controlRect.top - canvasRect.top - 2);
            const width = Math.min(rect.width, controlRect.right - canvasRect.left + 2) - left;
            const height = Math.min(
                rect.height + CANVAS_TOP_PADDING,
                controlRect.bottom - canvasRect.top + 2
            ) - top;
            if (width <= 0 || height <= 0) return false;
            context.roundRect(left, top, width, height, Math.min(width, height) / 2);
        }
        context.clip('evenodd');
        return true;
    }

    resizeCanvas () {
        if (!this.canvas) return false;
        const rect = this.injection.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(rect.width * ratio));
        const height = Math.max(1, Math.round((rect.height + CANVAS_TOP_PADDING) * ratio));
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
        return true;
    }

    scheduleDraw () {
        if (!this.enabled) return;
        if (this.layoutSuspended) {
            this.pendingDraw = true;
            return;
        }
        if (this.deferFullRenderDraw) {
            this.pendingDraw = true;
            if (this.frame !== null) return;
            // Full-scene benchmarks defer paint, not state progression. A
            // projection worker completion still needs a frame to consume its
            // result and create the next native/layout task.
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                if (this.enabled && !this.layoutSuspended) this.ensureLayoutsAsync(null);
            });
            return;
        }
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.draw();
        });
    }

    draw () {
        if (!this.enabled || this.layoutSuspended || !this.context || !this.resizeCanvas()) return;
        const started = now();
        const rect = this.getWorkspaceRect();
        const transform = this.getTransform();
        const visible = this.renderAllBlocks ? null : this.getVisibleWorldBounds();
        const layouts = this.ensureLayoutsAsync(visible).sort((a, b) =>
            numberOr(a.root.__02CanvasZ) - numberOr(b.root.__02CanvasZ));
        this.context.clearRect(0, 0, rect.width, rect.height + CANVAS_TOP_PADDING);
        this.context.save();
        this.clipZoomControls(this.context, rect);
        // The Canvas is extended above the injection by the hat height. This
        // keeps negative hat-path coordinates visible without changing the
        // workspace coordinate system used by Blockly and addons.
        this.context.translate(transform.x, transform.y + CANVAS_TOP_PADDING);
        this.context.scale(transform.scale, transform.scale);
        this.visibleBlockCount = 0;
        let loadingTotal = 0;
        let loadingCompleted = 0;
        for (const layout of layouts) {
            if (layout.projectionPending) {
                // Keep the loading state visible while the worker builds the
                // geometry snapshot. The previous committed scene, if any,
                // is still painted below without waiting for this result.
                loadingTotal += Math.max(1, layout.visibleIds.size);
                this.loadingWorkPending = true;
            }
            const position = getRootPosition(layout.root);
            const bounds = layout.projectionBounds || layout.bounds;
            if (visible && layout.root !== this.draggingRoot && bounds) {
                const positionedBounds = {
                    left: bounds.left + position.x,
                    top: bounds.top + position.y,
                    right: bounds.right + position.x,
                    bottom: bounds.bottom + position.y
                };
                if (!rectsIntersect(positionedBounds, visible)) continue;
            }
            // Keep the last committed scene visible while an edit or zoom is
            // being recalculated. A brand-new workspace has no committed
            // scene, so it may paint the progressively-built staging scene.
            const paintScene = layout.geometries.length ? layout : (layout.pendingScene || layout);
            const geometries = this.queryLayout(paintScene, visible);
            const paintedIds = new Set();
            for (const geometry of geometries) {
                if (!this.isLiveBlock(geometry.block)) continue;
                this.drawGeometry(this.context, geometry, position);
                paintedIds.add(geometry.block.id);
                this.visibleBlockCount++;
            }
            const materializedIds = new Set((paintScene.geometries || [])
                .map(geometry => geometry && geometry.block && geometry.block.id)
                .filter(Boolean));
            const missingVisible = Array.from(layout.visibleIds)
                .filter(id => !materializedIds.has(id) && !layout.skippedIds.has(id));
            loadingTotal += layout.visibleIds.size;
            loadingCompleted += layout.visibleIds.size - missingVisible.length;
            if (layout.dirty || layout.inProgress || missingVisible.length) {
                this.loadingWorkPending = true;
            }
        }
        this.drawConnectionHighlight(this.context);
        this.context.restore();
        if (!this.loadingWorkPending) {
            loadingCompleted = loadingTotal;
        }
        this.lastLoadingCompleted = loadingCompleted;
        this.lastLoadingTotal = loadingTotal;
        this.updateTuningPanel(loadingCompleted, loadingTotal);
        this.drawLoadingIndicator(this.context, rect, loadingCompleted, loadingTotal);
        this.loadingWorkPending = false;
        this.lastDrawDuration = now() - started;
        this.recordPerformance('draw', this.lastDrawDuration);
    }

    clear () {
        if (this.context && this.canvas) this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    hitTest (event) {
        if (!this.canvas) return null;
        const rect = this.getWorkspaceRect() || this.canvas.getBoundingClientRect();
        if (!rect) return null;
        const transform = this.getTransform();
        const worldX = (event.clientX - rect.left - transform.x) / transform.scale;
        const worldY = (event.clientY - rect.top - transform.y) / transform.scale;
        const layouts = this.ensureLayoutsAsync(this.getVisibleWorldBounds());
        // Never synchronously compile a dirty root from a pointer event. The
        // old path could block for tens of seconds while hit-testing a block
        // in a large script. Keep the last committed scene interactive while
        // the async task catches up; newly visible blocks become clickable on
        // the next frame after their geometry is committed.
        const readyLayouts = layouts.filter(layout =>
            layout.geometries.length && !layout.processing);
        const orderedLayouts = readyLayouts.sort((a, b) =>
            numberOr(a.root.__02CanvasZ) - numberOr(b.root.__02CanvasZ));

        // A broadcast block stores its menu in a shadow reporter below an
        // INPUT_VALUE. That field is not part of the parent block's outline,
        // so outline-first hit testing could let the parent consume the click
        // before the FieldVariable saw it. Test materialized fields directly
        // first. This also keeps dynamically-created dropdowns consistent
        // with ordinary variable fields.
        for (let layoutIndex = orderedLayouts.length - 1; layoutIndex >= 0; layoutIndex--) {
            const layout = orderedLayouts[layoutIndex];
            const position = getRootPosition(layout.root);
            const fields = (layout.fields || []).slice().sort((a, b) =>
                blockGraphDepth(b.block) - blockGraphDepth(a.block) ||
                (a.width * a.height) - (b.width * b.height));
            for (const candidate of fields) {
                const field = candidate && candidate.field;
                const block = candidate && candidate.block;
                if (!field || !this.isLiveBlock(block)) continue;
                const isBroadcastMenuField = this.isBroadcastMenuField(field, block);
                if (!layout.visibleIds.has(block.id) &&
                    !this.forceMaterializedIds.has(block.id) && !isBroadcastMenuField) continue;
                const interactive = !!field.EDITABLE ||
                    typeof field.getOptions === 'function' ||
                    typeof field.positionArrow === 'function' ||
                    (typeof field.showEditor_ === 'function' && typeof field.state_ !== 'undefined');
                if (!interactive) continue;
                const localX = worldX - position.x;
                const localY = worldY - position.y;
                if (this.fieldHitContains(candidate, localX, localY,
                    this.blockGeometry.get(block.id))) {
                    return {block, field, icon: null};
                }
            }
        }
        for (let i = orderedLayouts.length - 1; i >= 0; i--) {
            const layout = orderedLayouts[i];
            const position = getRootPosition(layout.root);
            const localX = worldX - position.x;
            const localY = worldY - position.y;
            const key = `${Math.floor(localX / SPATIAL_CELL_SIZE)}:${Math.floor(localY / SPATIAL_CELL_SIZE)}`;
            const indices = layout.buckets.get(key) || [];
            const geometries = indices
                .map(index => layout.geometries[index])
                .filter(Boolean)
                .sort((a, b) => b.depth - a.depth ||
                    (a.width * a.height) - (b.width * b.height));
            for (const geometry of geometries) {
                let field = null;
                for (const candidate of geometry.fields) {
                    const isInteractive = candidate.field.isCurrentlyEditable &&
                        candidate.field.isCurrentlyEditable();
                    const hasEditor = candidate.field.EDITABLE !== false &&
                        typeof candidate.field.showEditor_ === 'function';
                    if (this.fieldHitContains(candidate, localX, localY, geometry) &&
                        (isInteractive || hasEditor || typeof candidate.field.state_ !== 'undefined')) {
                        field = candidate.field;
                        break;
                    }
                }
                // Resolve fields before testing the block outline. The outline
                // is a paint path, not an interaction mask: custom shapes and
                // insertion markers can legitimately omit the field area from
                // their path while the field remains clickable in Blockly.
                if (field) return {block: geometry.block, field, icon: null};
                if (!this.pointIntersectsGeometry(geometry, localX, localY)) continue;
                let icon = null;
                for (const candidate of geometry.icons || []) {
                    if (localX >= candidate.x && localX <= candidate.x + candidate.width &&
                        localY >= candidate.y && localY <= candidate.y + candidate.height) {
                        icon = candidate.icon;
                        break;
                    }
                }
                return {block: geometry.block, field, icon};
            }
        }
        return null;
    }

    handleMouseDown (event) {
        if (!this.isMainWorkspaceEvent(event)) return;
        if (typeof event.button !== 'undefined' && event.button !== 0 && event.button !== 2) return;
        // Native block mousedown handlers are installed through
        // bindEventWithChecks_, which captures the active mouse/touch stream.
        // Canvas hit testing bypasses that wrapper, so capture it here before
        // Blockly binds document move/up handlers. Without this, every move
        // and mouseup is rejected and the workspace is left with a stuck
        // gesture that cannot click fields or drag blocks.
        const Touch = this.ScratchBlocks.Touch;
        if (Touch && typeof Touch.shouldHandleEvent === 'function' && !Touch.shouldHandleEvent(event)) return;
        const hit = this.hitTest(event);
        if (!hit) return;
        if (hit.icon && typeof hit.icon.iconClick_ === 'function') {
            hit.icon.iconClick_(event);
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const gesture = this.workspace.getGesture(event);
        if (!gesture) return;
        if (hit.field) gesture.setStartField(hit.field);
        gesture.handleBlockStart(event, hit.block);
        gesture.handleWsStart(event, this.workspace);
        event.preventDefault();
        event.stopPropagation();
    }

    handleContextMenu (event) {
        if (!this.isMainWorkspaceEvent(event)) return;
        // Right-click mousedown is routed through Gesture.handleWsStart above.
        // That keeps currentGesture_ alive while ContextMenu.show runs, which
        // is required by addon context-menu callbacks and duplicate-and-drag.
        // The later browser contextmenu event must only suppress the native
        // menu; calling showContextMenu_ directly here loses that gesture.
        event.preventDefault();
        event.stopPropagation();
    }

    isMainWorkspaceEvent (event) {
        const target = event && event.target;
        if (!target || !this.injection || !this.injection.contains(target)) return false;
        if (!target.closest) return true;
        return !target.closest([
            '.blocklyFlyout',
            '.blocklyToolboxDiv',
            '.blocklyScrollbarVertical',
            '.blocklyScrollbarHorizontal',
            '.blocklyZoom',
            '.blocklyWidgetDiv',
            '.blocklyDropDownDiv',
            '.blocklyTooltipDiv'
        ].join(','));
    }

    handleDocumentPaint () {
        if (this.workspace && this.workspace.currentGesture_) {
            this.lastInteractionAt = now();
            this.scheduleDraw();
        }
    }

    captureBlockCanvas (block, scale = 1) {
        const root = rootOf(block);
        // Interactive layouts retain only viewport geometry. Export is an
        // explicit operation, so synchronously materialize the complete script.
        this.ensureLayoutsForRoot(null, root);
        const layout = this.getRootLayout(root);
        if (!layout.bounds) return null;
        const width = Math.max(1, Math.ceil(layout.bounds.right - layout.bounds.left));
        const height = Math.max(1, Math.ceil(layout.bounds.bottom - layout.bounds.top));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const context = canvas.getContext('2d');
        context.scale(scale, scale);
        context.translate(-layout.bounds.left, -layout.bounds.top);
        const geometries = layout.geometries.slice().sort((a, b) => a.depth - b.depth);
        for (const geometry of geometries) this.drawGeometry(context, geometry, {x: 0, y: 0});
        return canvas;
    }

    captureBlock (block, scale = 1) {
        const canvas = this.captureBlockCanvas(block, scale);
        return canvas ? canvas.toDataURL('image/png') : null;
    }

    captureWorkspaceCanvas (scale = 1) {
        const layouts = this.ensureLayouts();
        let bounds = null;
        for (const layout of layouts) {
            if (!layout.bounds) continue;
            const position = getRootPosition(layout.root);
            bounds = unionRect(bounds, {
                left: layout.bounds.left + position.x,
                top: layout.bounds.top + position.y,
                right: layout.bounds.right + position.x,
                bottom: layout.bounds.bottom + position.y
            });
        }
        if (!bounds) return null;
        const width = Math.max(1, Math.ceil(bounds.right - bounds.left));
        const height = Math.max(1, Math.ceil(bounds.bottom - bounds.top));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const context = canvas.getContext('2d');
        context.scale(scale, scale);
        context.translate(-bounds.left, -bounds.top);
        for (const layout of layouts) {
            const position = getRootPosition(layout.root);
            const geometries = layout.geometries.slice().sort((a, b) => a.depth - b.depth);
            for (const geometry of geometries) this.drawGeometry(context, geometry, position);
        }
        return canvas;
    }

    getStats () {
        return {
            lastDrawDuration: this.lastDrawDuration,
            lastLayoutDuration: this.lastLayoutDuration,
            visibleBlockCount: this.visibleBlockCount,
            layoutCount: this.rootLayouts.size
        };
    }
}

export {CanvasModelNode, installBlocklyCanvasMode};
export default ModelCanvasBlockRenderer;
