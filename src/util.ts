import equal from 'deep-equal';

const env = process.env.NODE_ENV;

export function log(indentLevel:number = 0, ...args) {
    if (env !== "development") return;
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
    childCount?: number;
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

export function cacheProps(node:any):any {
    let props:any = {};
    for (let i=0, n=overridableProps.length; i < n; i++) {
        const key = overridableProps[i];
        if (key in node) {
            props[key] = node[key];
        }
    }
    if (node.children) {
        for (let j=0, n2=node.children.length; j < n2; j++) {
            const childKey = 'child' + j;
            props[childKey] = cacheProps(node.children[j]);
        };
    }
    return props;
}

export function validateSelection(selection: SceneNode[]): ISelectionValidation {
    if (selection.length === 0) {
        return { isValid: false, reason: SelectionValidation.NO_SELECTION };
    }
    if (selection.length > 2) {
        return { isValid: false, reason: SelectionValidation.MORE_THAN_TWO };
    }
    if (selection.length === 1) {
        let start = new Date().getTime();
        let childCount = countChildren(selection[0]);
        let end = new Date().getTime();
        console.log(end - start);
        
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
