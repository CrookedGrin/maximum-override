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
                // console.log(key, "is not an array.", prop);
                return [];
            }
            break;
        // case "backgroundStyleId":
        // case "effectStyleId":
        // case "fillStyleId":
        // case "strokeStyleId":
        //     return prop;
        case "masterComponent":
            return { name: prop.name, id: prop.id };
    }
    return prop;
}

export enum SelectionValidation {
    NO_SELECTION = "Nothing selected",
    MORE_THAN_TWO = "More than two",
    NOT_AN_INSTANCE = "Not an Instance",
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
            return { isValid: false, reason: SelectionValidation.NOT_AN_INSTANCE };
        } else {
            return { isValid: true, reason: SelectionValidation.IS_INSTANCE };
        }
    }
    if (selection.length === 2) {
        return { isValid: true, reason: SelectionValidation.IS_TWO };
    }
}