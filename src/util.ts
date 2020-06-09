import equal from 'deep-equal';

export function log(indentLevel:number = 0, ...args) {
    let indent:string = "──".repeat(indentLevel) + " ";
    console.log(indent, ...args);
}

export function checkEquality(key: string, sourceValue: any, targetValue: any) {
    switch (key) {
        case "masterComponent":
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
        case "masterComponent":
            return { name: prop.name, id: prop.id };
    }
    return prop;
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
}

export function validateSelection(selection: SceneNode[]): ISelectionValidation {
    if (selection.length === 0) {
        return { isValid: false, reason: SelectionValidation.NO_SELECTION };
    }
    if (selection.length > 2) {
        return { isValid: false, reason: SelectionValidation.MORE_THAN_TWO };
    }
    if (selection.length === 1) {
        if (selection[0].type !== "INSTANCE") {
            return { isValid: false, reason: SelectionValidation.IS_NODE };
        } else {
            return { isValid: true, reason: SelectionValidation.IS_INSTANCE };
        }
    }
    if (selection.length === 2) {
        return { isValid: true, reason: SelectionValidation.IS_TWO };
    }
}

export interface IColor {
    r: number;
    g: number;
    b: number;
}

export function RGBToHex(color: IColor) {
    let r = color.r.toString(16);
    let g = color.g.toString(16);
    let b = color.b.toString(16);
    if (r.length == 1)
        r = "0" + r;
    if (g.length == 1)
        g = "0" + g;
    if (b.length == 1)
        b = "0" + b;
    return "#" + r + g + b;
}

export const overridableProps = [
    // colors
    "backgrounds",
    "backgroundStyleId",
    "effects",
    "effectStyleId",
    "fills",
    "fillStyleId",
    "strokes",
    "strokeStyleId",

    "blendMode",
    "clipsContent",
    "cornerRadius",
    "cornerSmoothing",
    "dashPattern",
    "locked",
    "masterComponent",
    "name",
    "opacity",
    "strokeAlign",
    "strokeCap",
    "strokeJoin",
    "visible",

    // text
    "characters",
    "fontSize",
    "fontName",
    "letterSpacing",
    "lineHeight",
    "textCase",
    "textDecoration",
];
