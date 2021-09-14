import equal from 'deep-equal';

const env = process.env.NODE_ENV;

export function log(indentLevel:number = 0, ...args) {
    if (env !== "development") return;
    let indent:string = "──".repeat(indentLevel) + " ";
    console.log(indent, ...args);
}

// Recursive
export function flattenData(data:IOverrideData):{} {
    let flat = {};
    if (!data) return flat;
    if (data.overriddenProps) {
        data.overriddenProps.map(prop => {
            flat[`${data.id}--${prop.key}`] = prop;
        });
    }
    if (data.children) {
        data.children.map(child => {
            flat = Object.assign({}, flat, flattenData(child));
        });
    }
    return flat;
}

// Override data associated with a node and its children
export interface IOverrideData {
    sourceName: string;
    targetName: string;
    type: string;
    id: string; // Combo of source and target IDs
    sourceNode: SceneNode;
    targetNode: SceneNode;
    overriddenProps?: IOverrideProp[];
    children?: IOverrideData[];
    isCollapsed?: boolean;
    parentId?: string;
}

// An individual overridden property on a node. Values can be of many different types (see IProps)
export interface IOverrideProp {
    key: string;
    sourceValue: any;
    targetValue: any;
    isApplied: boolean;
}

export interface IBoxSides {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface IBoxCorners {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
}

export function getCombinedId(source:SceneNode, target:SceneNode):string {
    return `${source.id}__${target.id}`;
}

export function createOverrideData(sourceNode: SceneNode, targetNode: SceneNode): IOverrideData {
    let data: IOverrideData = {
        sourceName: sourceNode.name,
        targetName: targetNode.name,
        type: targetNode.type,
        id: getCombinedId(sourceNode, targetNode),
        sourceNode,
        targetNode,
        isCollapsed: true, // collapsed by default; recursively set to false if overrides exist
    };
    return data;
}

export interface IProps {
    width: number;
    height: number;

    // absoluteTransform: Transform;
    arcData: ArcData;
    // backgrounds: Paint[]; // Deprecated
    // backgroundStyleId: string; // Deprecated
    bottomLeftRadius: number;
    bottomRightRadius: number;
    blendMode: BlendMode;
    clipsContent: boolean;
    constrainProportions: boolean;
    constraints: Constraints;
    cornerRadius: number | PluginAPI["mixed"];
    corners: IBoxCorners; // Special case: constructed from other props
    cornerSmoothing: number;
    counterAxisSizingMode: string;
    counterAxisAlignItems: string;
    dashPattern: number[];
    effects: Effect[];
    effectStyleId: string;
    fills: Paint[] | PluginAPI["mixed"];
    fillStyleId: string | PluginAPI["mixed"];
    itemSpacing: number;
    isMask: boolean;
    layoutAlign: string;
    layoutGrow: number;
    layoutMode: string;
    locked: boolean;
    mainComponent: ComponentNode;
    name: string;
    opacity: number;
    padding: IBoxSides; // Special case: constructed from other props
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    primaryAxisSizingMode: string;
    primaryAxisAlignItems: string;
    // relativeTransform: Transform;
    rotation: number;
    strokeAlign: string;
    strokeCap: string | PluginAPI["mixed"];
    strokeJoin: string | PluginAPI["mixed"];
    strokes: Paint[];
    strokeStyleId: string;
    topLeftRadius: number;
    topRightRadius: number;
    visible: boolean;

    characters: string;
    fontName: FontName | PluginAPI["mixed"];
    fontSize: number | PluginAPI["mixed"];
    letterSpacing: LetterSpacing | PluginAPI["mixed"];
    lineHeight: PluginAPI["mixed"] | any;
    paragraphIndent: number;
    paragraphSpacing: number;
    textAlignHorizontal: string;
    textAlignVertical: string;
    textAutoResize: string;
    textCase: string | PluginAPI["mixed"];
    textDecoration: string | PluginAPI["mixed"];
    textStyleId: string | PluginAPI["mixed"];
}

const parentTypes = [
    'FRAME',
    'GROUP',
    'INSTANCE',
    'COMPONENT',
    'BOOLEAN_OPERATION'
]

export function supportsChildren(node:any):boolean {
    return (parentTypes.indexOf(node.type) > -1);
}

const autoLayoutTypes = [
    'FRAME',
    'INSTANCE',
    'COMPONENT'
]

export function supportsAutoLayout(node:any):boolean {
    return (autoLayoutTypes.indexOf(node.type) > -1);
}

export function checkEquality(key: string, sourceValue: any, targetValue: any) {
    if (sourceValue === undefined && targetValue === undefined) return true;
    switch (key) {
        case "mainComponent":
            return sourceValue.id === targetValue.id;
        default:
            return equal(sourceValue, targetValue);
    }
}

export function formatOverrideValue(key: string, prop: any) {
    switch (key) {
        case "backgrounds":
        case "fills":
        case "strokes":
            if (!Array.isArray(prop) || !prop[0]) {
                return [];
            }
            break;
        case "mainComponent":
            return { name: prop.name, id: prop.id };
    }
    if (typeof prop === 'symbol') return '(Mixed)';
    return prop;
}

export function countChildren(node:any):number {
    let counter:number = 0;
    if (node.children) {
        node.children.forEach((child) => {
            counter++;
            counter += countChildren(child);
        })
    }
    return counter;
}



/**
 * NOTE: Using the explicit property names like this is many, many times
 * faster than an iterated string-based property lookup like node[key].
 */
export function getPropsFromNode(node:any):IProps {
    let props:any = {};

    props.width = node.width;
    props.height = node.height;

    // props.absoluteTransform = node.absoluteTransform;
    props.arcData = node.arcData;
    // props.backgrounds = node.backgrounds; // Deprecated
    // props.backgroundStyleId = node.backgroundStyleId; // Deprecated
    props.blendMode = node.blendMode;
    props.bottomLeftRadius = node.bottomLeftRadius;
    props.bottomRightRadius = node.bottomRightRadius;
    props.clipsContent = node.clipsContent;
    props.constrainProportions = node.constrainProportions;
    props.constraints = node.constraints;
    props.cornerRadius = node.cornerRadius;
    props.cornerSmoothing = node.cornerSmoothing;
    props.counterAxisSizingMode = node.counterAxisSizingMode;
    props.counterAxisAlignItems = node.counterAxisAlignItems;
    props.dashPattern = node.dashPattern;
    props.effects = node.effects;
    props.effectStyleId = node.effectStyleId;
    props.fills = node.fills;
    props.fillStyleId = node.fillStyleId;
    props.isMask = node.isMask;
    props.itemSpacing = node.itemSpacing;
    props.layoutAlign = node.layoutAlign;
    props.layoutGrow = node.layoutGrow;
    props.layoutMode = node.layoutMode;
    props.locked = node.locked;
    props.mainComponent = node.mainComponent;
    props.name = node.name;
    props.opacity = node.opacity;
    props.paddingBottom = node.paddingBottom;
    props.paddingLeft = node.paddingLeft;
    props.paddingRight = node.paddingRight;
    props.paddingTop = node.paddingTop;
    props.primaryAxisSizingMode = node.primaryAxisSizingMode;
    props.primaryAxisAlignItems = node.primaryAxisAlignItems;
    props.rotation = node.rotation;
    // props.relativeTransform = node.relativeTransform;
    props.strokeAlign = node.strokeAlign;
    props.strokeCap = node.strokeCap;
    props.strokeJoin = node.strokeJoin;
    props.strokes = node.strokes;
    props.strokeStyleId = node.strokeStyleId;
    props.topLeftRadius = node.topLeftRadius;
    props.topRightRadius = node.topRightRadius;
    props.visible = node.visible;

    props.characters = node.characters;
    props.fontName = node.fontName;
    props.fontSize = node.fontSize;
    props.letterSpacing = node.letterSpacing;
    props.lineHeight = node.lineHeight;
    props.paragraphIndent = node.paragraphIndent
    props.paragraphSpacing = node.paragraphSpacing
    props.textAlignHorizontal = node.textAlignHorizontal;
    props.textAlignVertical = node.textAlignVertical;
    props.textAutoResize = node.textAutoResize;
    props.textCase = node.textCase;
    props.textDecoration = node.textDecoration;
    props.textStyleId = node.textStyleId;

    // Construct special-case objects
    props.padding = {
        top: node.paddingTop,
        bottom: node.paddingBottom,
        left: node.paddingLeft,
        right: node.paddingRight
    }

    if (typeof node.cornerRadius === 'symbol') {
        props.corners = {
            topLeft: node.topLeftRadius,
            topRight: node.topRightRadius,
            bottomLeft: node.bottomLeftRadius,
            bottomRight: node.bottomRightRadius
        }
    } else {
        props.corners = {
            topLeft: node.cornerRadius,
            topRight: node.cornerRadius,
            bottomLeft: node.cornerRadius,
            bottomRight: node.cornerRadius
        }
    }

    return props;
}

export enum SelectionValidation {
    NO_SELECTION = "Nothing selected",
    MORE_THAN_TWO = "More than two",
    IS_NODE = "Not an Instance",
    IS_INSTANCE = "One Instance",
    IS_TWO = "Two nodes",
}

export interface ISelectionValidation {
    isValid: boolean;
    reason?: SelectionValidation;
    childCount?: number;
}

export function validateSelection(selection: SceneNode[]): ISelectionValidation {
    if (selection.length === 0) {
        return { isValid: false, reason: SelectionValidation.NO_SELECTION };
    }
    if (selection.length > 2) {
        return { isValid: false, reason: SelectionValidation.MORE_THAN_TWO };
    }
    if (selection.length === 1) {
        let childCount = countChildren(selection[0]);
        if (selection[0].type !== "INSTANCE") {
            return { isValid: false, reason: SelectionValidation.IS_NODE, childCount };
        } else {
            return { isValid: true, reason: SelectionValidation.IS_INSTANCE, childCount };
        }
    }
    if (selection.length === 2) {
        let childCount = countChildren(selection[0]);
        return { isValid: true, reason: SelectionValidation.IS_TWO, childCount };
    }
}

export interface IColor {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export function formatRgbaColor(color: IColor):IColor {
    let converted: IColor = {
        r: Math.round(color.r * 255),
        g: Math.round(color.g * 255),
        b: Math.round(color.b * 255)
    }
    if (color.a !== undefined) {
        converted.a = Math.round(color.a * 255);
    }
    return converted;
}

export function rgbaToHex(color: IColor) {
    let returnString:string;
    let base = 16;
    let r = color.r.toString(base);
    let g = color.g.toString(base);
    let b = color.b.toString(base);
    if (r.length == 1)
        r = "0" + r;
    if (g.length == 1)
        g = "0" + g;
    if (b.length == 1)
        b = "0" + b;
    returnString = "#" + r + g + b;
    if (color.a !== undefined) {
        let a = color.a.toString(base);
        if (a.length == 1)
            a = "0" + a;
        returnString += a;
    }
    return returnString.toUpperCase();
}

export function createCssGradient(paint:GradientPaint) {
    let gradient:string = "";
    switch (paint.type) {
        default:
        case "GRADIENT_LINEAR":
            gradient += "linear-gradient(";
            break;
        case "GRADIENT_RADIAL":
            gradient += "radial-gradient(";
            break;
        case "GRADIENT_ANGULAR":
        case "GRADIENT_DIAMOND":
            gradient += "conic-gradient(";
            break;
    }
    paint.gradientStops.forEach(stop => {
        let formatted = formatRgbaColor(stop.color);
        let stopString:string = rgbaToHex(formatted);
        gradient += stopString + ", "
    })
    gradient = gradient.slice(0, -2);
    gradient += ")";
    return gradient;
}

export function truncate(value:any, chars:number = 0) {
    if (!isNaN(value)) {
        return parseFloat((value as number).toFixed(chars));
    } else {
        return value;
    }
}

export function deCamel(s:string):string {
    const regex = s.replace(/([A-Z]{1,})/g, " $1");
    return regex.charAt(0).toUpperCase() + regex.slice(1);
}
