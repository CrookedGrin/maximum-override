import equal from 'deep-equal';

const env = process.env.NODE_ENV;

export function log(indentLevel:number = 0, ...args) {
    if (env !== "development") return;
    let indent:string = "──".repeat(indentLevel) + " ";
    // console.log(indent, ...args);
}

export interface IOverrideData {
    name: string;
    type: string;
    id: string;
    associatedNode: SceneNode;
    overriddenProps?: any[];
    childData?: IOverrideData[];
    isCollapsed?: boolean;
    parentId?: string;
}

export function createDataWrapperForNode(node: SceneNode): IOverrideData {
    let data: IOverrideData = {
        name: node.name,
        type: node.type,
        id: node.id,
        associatedNode: node,
        isCollapsed: true, // collapsed by default; recursively set to false if overrides exist
    };
    return data;
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

export function formatOverrideProp(key: string, prop: any) {
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

export interface IProps {
    width: number;
    height: number;

    backgrounds: Paint[];
    backgroundStyleId: string;
    blendMode: BlendMode;
    clipsContent: boolean;
    cornerRadius: number | PluginAPI["mixed"];
    cornerSmoothing: number;
    counterAxisSizingMode: string;
    dashPattern: number[];
    effects: Effect[];
    effectStyleId: string;
    fills: Paint[] | PluginAPI["mixed"];
    fillStyleId: string | PluginAPI["mixed"];
    horizontalPadding: number;
    itemSpacing: number;
    layoutAlign: string;
    layoutMode: string;
    locked: boolean;
    mainComponent: ComponentNode;
    name: string;
    opacity: number;
    strokeAlign: string;
    strokeCap: string | PluginAPI["mixed"];
    strokeJoin: string | PluginAPI["mixed"];
    strokes: Paint[];
    strokeStyleId: string;
    verticalPadding: number;
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

/**
 * NOTE: Using the explicit property names like this is many, many times
 * faster than an iterated string-based property lookup like node[key].
 */
export function getPropsFromNode(node:any):IProps {
    let props:any = {};

    props.width = node.width;
    props.height = node.height;

    props.backgrounds = node.backgrounds;
    props.backgroundStyleId = node.backgroundStyleId;
    props.blendMode = node.blendMode;
    props.clipsContent = node.clipsContent;
    props.cornerRadius = node.cornerRadius;
    props.cornerSmoothing = node.cornerSmoothing;
    props.counterAxisSizingMode = node.counterAxisSizingMode;
    props.dashPattern = node.dashPattern;
    props.effects = node.effects;
    props.effectStyleId = node.effectStyleId;
    props.fills = node.fills;
    props.fillStyleId = node.fillStyleId;
    props.horizontalPadding = node.horizontalPadding;
    props.itemSpacing = node.itemSpacing;
    props.layoutAlign = node.layoutAlign;
    props.layoutMode = node.layoutMode;
    props.locked = node.locked;
    props.mainComponent = node.mainComponent;
    props.name = node.name;
    props.opacity = node.opacity;
    props.strokeAlign = node.strokeAlign;
    props.strokeCap = node.strokeCap;
    props.strokeJoin = node.strokeJoin;
    props.strokes = node.strokes;
    props.strokeStyleId = node.strokeStyleId;
    props.verticalPadding = node.verticalPadding;
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