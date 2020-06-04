import {
    log, 
    checkEquality,
    formatOverrideProp,
    validateSelection
} from './util'

figma.showUI(__html__, { width: 600, height: 600 });

export interface IOverrideData {
    name: string;
    type: string;
    id?: string;
    associatedNode?: SceneNode;
    overriddenProps?: any[];
    childData?: IOverrideData[];
}

let temporaryNodes:SceneNode[] = [];

/**
 * @param targetNode The node that's being recursively introspected
 * @param sourceNode The node we're comparing against (an instance of master for single selection)
 * @param recursionLevel Integer for indenting output strings
 */
function getOverridesForNode(
    sourceNode: SceneNode,
    targetNode: SceneNode,
    recursionLevel: number
) {
    let logMessage = "";
    let overrides = [];
    if (!checkEquality(targetNode.type, targetNode, sourceNode)) {
        logMessage += targetNode.type + " " + targetNode.name;
    }
    overridableProps.forEach((key) => {
        if (key in targetNode && key in sourceNode) {
            if (!checkEquality(key, targetNode[key], sourceNode[key])) {
                overrides.push({
                    key: key,
                    sourceValue: formatOverrideProp(key, sourceNode[key]),
                    targetValue: formatOverrideProp(key, targetNode[key]),
                });
            }
        }
    });

    const numOverrides = overrides.length;
    if (numOverrides > 0) {
        logMessage += " ::: " + numOverrides + " overrides: ";
        logMessage += Object.keys(overrides).toString().replace(/,/g, ", ");
    }

    log(recursionLevel, logMessage);

    return overrides;
}

// recursion
function compareProps(
    sourceData: IOverrideData,
    targetData: IOverrideData,
    recursionLevel: number
) {
    targetData.overriddenProps = getOverridesForNode(
        sourceData.associatedNode,
        targetData.associatedNode,
        recursionLevel
    );

    if ( "children" in targetData.associatedNode && targetData.associatedNode.children.length ) {
        /*
         If the target's masterComponent has changed, we need to compare against an instance
         of that master rather than the original component
         TODO: make this toggleable?
        */
        let newMaster:boolean;
        targetData.overriddenProps.forEach((prop) => {
            if (prop.key === 'masterComponent') newMaster = true;
        });
        if (newMaster) {
            let newSourceNode:SceneNode = ((targetData.associatedNode as InstanceNode).masterComponent as ComponentNode).createInstance();
            let newSourceData:IOverrideData = createDataWrapperForNode(newSourceNode);
            log(recursionLevel, 'New Master', newSourceNode.name, newSourceData);
            sourceData = newSourceData;
            temporaryNodes.push(newSourceNode);
        }
        const nodeChildren = targetData.associatedNode.children;
        let childData = [];
        for (let i = 0; i < nodeChildren.length; i++) {
            const targetChild = nodeChildren[i] as SceneNode;
            // console.log(indent, " within loop, targetChild:", targetChild);
            const targetChildData = createDataWrapperForNode(targetChild);
            if ("children" in sourceData.associatedNode) {
                const sourceChild = sourceData.associatedNode.children[i] as SceneNode;
                if (sourceChild === undefined) {
                    console.log('sourceChild at ', i, 'is undefined in', sourceData.associatedNode.children);
                    break;
                }
                const sourceChildData = createDataWrapperForNode(sourceChild);
                compareProps(sourceChildData, targetChildData, recursionLevel + 1);
                childData.push(targetChildData);
            } else {
                console.log(
                    "Original node " + sourceData.name + " has no matching children."
                );
            }
        }
        targetData.childData = childData.length > 0 ? childData : null;
    }
}

function createDataWrapperForNode(node: SceneNode): IOverrideData {
    let data: IOverrideData = {
        name: node.name,
        type: node.type,
        id: node.id,
        associatedNode: node,
    };
    return data;
}

function cleanUpTemporaryNodes() {
    temporaryNodes.forEach(node => {
        node.remove();
    });
    temporaryNodes = [];
}

function getOverrideDataForSelection(selection: SceneNode[]) {
    let targetNode: SceneNode, sourceNode: SceneNode;
    let targetData: IOverrideData, sourceData: IOverrideData;
    if (selection.length === 1) {
        targetNode = selection[0];
        if (targetNode.type === "INSTANCE") {
            targetNode = selection[0] as InstanceNode;
            targetData = createDataWrapperForNode(targetNode);
            sourceNode = targetNode.masterComponent.createInstance();
            sourceData = createDataWrapperForNode(sourceNode);
            sourceData.name = "Master";
            sourceData.type = "COMPONENT";
            log(0, "Comparing master ", sourceData, " to target ", targetData);
            temporaryNodes.push(sourceData.associatedNode);
        } else {
            console.log("Selection must be an Instance.");
        }
    } else if (selection.length == 2) {
        // note that order is reversed
        sourceNode = selection[0];
        sourceData = createDataWrapperForNode(sourceNode);
        targetNode = selection[1];
        targetData = createDataWrapperForNode(targetNode);
    } else {
        console.log("Cannot compare more than two selected items.");
    }

    compareProps(sourceData, targetData, 1);

    let returnData = {
        source: sourceData,
        target: targetData,
    };
    cleanUpTemporaryNodes();
    return returnData;
}

function applyOverrideProp(
    key: string,
    prop: any,
    target: SceneNode,
    isRoot: boolean
):boolean {
    // console.log("fop", key, prop);
    switch (key) {
        case "backgrounds":
        case "fills":
        case "strokes":
            if (Array.isArray(prop)) {
                target[key] = prop;
            }
            return false;
        case "masterComponent":
            // don't apply this one at the root level
            if (!isRoot) {
                //TODO: Add checkbox for "don't rename layers"
                // target["autoRename"] = false;
                target[key] = prop;
            }
            return true; // Whether to apply a delay before continuing
        case "characters":
        case "fontSize":
        case "fontName":
        case "textStyleId":
        case "textCase":
        case "textDecoration":
        case "letterSpacing":
        case "lineHeight":
            // must load font first
            if (key in target) {
                if (typeof prop === "symbol") {
                    console.log("Multiple font attributes detected within ", prop);
                    return false;
                }
                let textNode = target as TextNode;
                if (textNode.hasMissingFont) {
                    console.log("Text field has missing font. Can't edit properties.");
                    return false;
                }
                let fontName = textNode.fontName;
                if (typeof fontName === "symbol") {
                    console.log("Multiple font attributes detected within ", target.name);
                    return false;
                }
                figma.loadFontAsync(fontName as FontName).then((data) => {
                    (textNode as any)[key] = prop;
                });
            }
            return false;
        default:
            target[key] = prop;
            return false;
    }
}

function applyOverridesToNode(
    data: IOverrideData,
    target: any,
    recursionLevel: number
) {
    const isRoot = recursionLevel === 1;
    let didChangeMasterComponent:boolean = false;
    log(recursionLevel, data.name, data, target);
    data.overriddenProps.forEach((prop) => {
        // log([">>>>>> override", prop], recursionLevel);
        try {
            if (prop.key in target) {
                if (applyOverrideProp(prop.key, prop.targetValue, target, isRoot)) {
                    didChangeMasterComponent = true;
                };
            }
        } catch (e) {
            log(0, "Cannot apply prop", prop, e);
        }
    });
    // recursion
    if (data.childData) {
        for (let i: number = 0; i < data.childData.length; i++) {
            const childData = data.childData[i];
            // find child element by corresponding position in hierarchy
            let targetChild: SceneNode;
            try {
                targetChild = target.children[i] as SceneNode;
                applyOverridesToNode(childData, targetChild, recursionLevel + 1);
            } catch (e) {
                console.log("Error", e, "in applyOverridesToNode.");
                console.log("   targetChild:", targetChild);
                console.log("   in", target.children, "at", i, "on parent", target);
            }
        }
    }
}

/*******************************************************
 * Handle UI messages
 *******************************************************/
figma.ui.onmessage = (msg) => {
    if (msg.type === "initial-render") {
        const selection: SceneNode[] = Array.from(figma.currentPage.selection);
        figma.ui.postMessage({
            type: "selection-validation",
            validation: validateSelection(selection),
        });
        // Check for saved data
        figma.clientStorage.getAsync("copiedOverrides")
            .then((data) => {
                if (data !== undefined) {
                    figma.ui.postMessage({
                        type: "data-verified"
                    });
                }
            })
            .catch((error) => {
                console.log("ERROR: async", error);
            })
            .finally(() => {});
    }

    if (msg.type === "inspect-selected") {
        const selection: SceneNode[] = Array.from(figma.currentPage.selection);
        let { source, target } = getOverrideDataForSelection(selection);
        console.log("Finished inspecting selected nodes.", target.overriddenProps);
        figma.ui.postMessage({
            type: "inspected-data",
            payload: { source, target },
        });
    }

    if (msg.type === "copy-overrides") {
        console.log("Received override data. Saving...", msg);
        let data: IOverrideData = msg.data;
        figma.clientStorage.setAsync("copiedOverrides", data);
        figma.ui.postMessage({ type: "copy-confirmation" });
    }

    if (msg.type === "paste-overrides") {
        console.log("Received paste request. Getting node...", msg);
        const selection: SceneNode[] = Array.from(figma.currentPage.selection);
        const target: SceneNode = selection[0];
        figma.clientStorage.getAsync("copiedOverrides")
            .then((data) => {
                console.log("got async data", data, "target", target);
                applyOverridesToNode(data, target, 1);
                // let data:IOverrideData = data as IOverrideData;
            })
            .catch((error) => {
                console.log("ERROR: async", error);
            })
            .finally(() => {
                console.log("Reached finally");
                // send UI message
            });
    }
};

figma.on("selectionchange", () => {
    console.log("selection changed", figma.currentPage.selection);
    //TODO: store selection order
    const selection: SceneNode[] = Array.from(figma.currentPage.selection);
    figma.ui.postMessage({
        type: "selection-validation",
        validation: validateSelection(selection),
    });
});

const overridableProps = [
    "backgrounds",
    "backgroundStyleId",
    "blendMode",
    "characters",
    "clipsContent",
    "cornerRadius",
    "cornerSmoothing",
    "dashPattern",
    "effects",
    "effectStyleId",
    "fontSize",
    "fontName",
    "fills",
    "fillStyleId",
    "letterSpacing",
    "lineHeight",
    "locked",
    "masterComponent",
    "name",
    "opacity",
    "strokes",
    "strokeAlign",
    "strokeCap",
    "strokeJoin",
    "strokeStyleId",
    "textCase",
    "textDecoration",
    "visible",
];
