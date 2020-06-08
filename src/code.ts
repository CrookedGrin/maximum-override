import {
    log, 
    checkEquality,
    formatOverrideProp,
    validateSelection,
    overridableProps
} from './util'

figma.showUI(__html__, { width: 540, height: 600 });

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
):any[] {
    let logMessage = "getOverridesForNode: ";
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

// Recursive
function compareProps(
    sourceData: IOverrideData,
    targetData: IOverrideData,
    recursionLevel: number
) {
    log(recursionLevel, 'compareProps', sourceData.associatedNode, targetData.associatedNode);

    sourceData.overriddenProps = []; // Clear in case of swap
    targetData.overriddenProps = getOverridesForNode(
        sourceData.associatedNode,
        targetData.associatedNode,
        recursionLevel + 1
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
            let component = ((targetData.associatedNode as InstanceNode).masterComponent as ComponentNode);
            if (component.remote) {
                log(recursionLevel + 1, "Remote component detected. Key:", component.key);
            }
            try {
                let newSourceNode:SceneNode = component.createInstance();
                let newSourceData:IOverrideData = createDataWrapperForNode(newSourceNode);
                log(recursionLevel, 'New Master', newSourceNode.name, newSourceData);
                sourceData = newSourceData;
                temporaryNodes.push(newSourceNode);
            } catch(e) {
                log(recursionLevel + 1, "Couldn't create an instance. Is this a nested master component?", e);
                return;
            }
        }
        const nodeChildren = targetData.associatedNode.children;
        let childData = [];
        for (let i = 0; i < nodeChildren.length; i++) {
            const targetChild = nodeChildren[i] as SceneNode;
            const targetChildData = createDataWrapperForNode(targetChild);
            if ("children" in sourceData.associatedNode) {
                const sourceChild = sourceData.associatedNode.children[i] as SceneNode;
                if (sourceChild === undefined) {
                    log(recursionLevel + 1, 'sourceChild at ', i, 'is undefined in', sourceData.associatedNode.children);
                    break;
                }
                const sourceChildData = createDataWrapperForNode(sourceChild);
                compareProps(sourceChildData, targetChildData, recursionLevel + 1);
                childData.push(targetChildData);
            } else {
                log(recursionLevel + 1, "Original node " + sourceData.name + " has no matching children.");
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

function getSourceAndTargetFromSelection(selection: SceneNode[]):any {
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
            log(0, "Selection must be an Instance.");
        }
    } else if (selection.length == 2) {
        // note that order is reversed
        sourceNode = selection[0];
        sourceData = createDataWrapperForNode(sourceNode);
        targetNode = selection[1];
        targetData = createDataWrapperForNode(targetNode);
    } else {
        log(0, "Cannot compare more than two selected items.");
    }
    return {targetData, sourceData}
}

function getOverrideDataForNodes(sourceData:IOverrideData, targetData:IOverrideData) {
    compareProps(sourceData, targetData, 1);
    let returnData = {
        source: sourceData,
        target: targetData,
    };
    cleanUpTemporaryNodes();
    return returnData;
}


/******************************************
 *  Apply overrides
 ******************************************/

/**
 * @param key Override property key as string
 * @param prop The prop data object
 * @param target The Figma node to apply the prop to
 * @param isRoot Whether this is the top-level parent
 * @returns true if we're updating the master component
 */
function applyOverrideProp(
    key: string,
    prop: any,
    target: SceneNode,
    isRoot: boolean
):boolean {
    // log(0, "fop", key, prop);
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
            return true;
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
                    log(0, "Multiple font attributes detected within ", prop);
                    return false;
                }
                let textNode = target as TextNode;
                if (textNode.hasMissingFont) {
                    log(0, "Text field has missing font. Can't edit properties.");
                    return false;
                }
                let fontName = textNode.fontName;
                if (typeof fontName === "symbol") {
                    log(0, "Multiple font attributes detected within ", target.name);
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

// Recursive
function applyOverridesToNode(
    data: IOverrideData,
    target: any,
    recursionLevel: number
) {
    const isRoot = recursionLevel === 1;
    let didChangeMasterComponent:boolean = false;
    log(recursionLevel, 'applyOverridesToNode', data.name, data, target);
    data.overriddenProps.forEach((prop) => {
        // log(recursionLevel, ">>>>>> override", prop);
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
                log(0, "Error", e, "in applyOverridesToNode.");
                log(0, "   targetChild:", targetChild);
                log(0, "   in", target.children, "at", i, "on parent", target);
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
                log(0, "ERROR: async", error);
            })
            .finally(() => {});
    }

    if (msg.type === "inspect-selected") {
        const selection: SceneNode[] = Array.from(figma.currentPage.selection);
        let { sourceData, targetData } = getSourceAndTargetFromSelection(selection);
        let { source, target } = getOverrideDataForNodes(sourceData, targetData);
        log(0, "Finished inspecting selected nodes.", target);
        figma.ui.postMessage({
            type: "inspected-data",
            payload: { source, target },
        });
    }

    if (msg.type === "copy-overrides") {
        log(0, "Received override data. Saving...", msg);
        let data: IOverrideData = msg.data;
        figma.clientStorage.setAsync("copiedOverrides", data);
        figma.ui.postMessage({ type: "copy-confirmation" });
    }

    if (msg.type === "paste-overrides") {
        log(0, "Received paste request. Getting node...", msg);
        const selection: SceneNode[] = Array.from(figma.currentPage.selection);
        const target: SceneNode = selection[0];
        figma.clientStorage.getAsync("copiedOverrides")
            .then((data) => {
                log(0, "got async data", data, "target", target);
                applyOverridesToNode(data, target, 1);
                // let data:IOverrideData = data as IOverrideData;
            })
            .catch((error) => {
                log(0, "ERROR: async", error);
            })
            .finally(() => {});
    }

    if (msg.type === "swap-selected") {
        log(0, "Swapping symbols", msg);
        let originalTarget: IOverrideData = createDataWrapperForNode(figma.getNodeById(msg.data.targetId) as SceneNode);
        let originalSource: IOverrideData = createDataWrapperForNode(figma.getNodeById(msg.data.sourceId) as SceneNode);
        let { source, target } = getOverrideDataForNodes(originalTarget, originalSource);
        log(0, "Finished inspecting swapped nodes.", target);
        figma.ui.postMessage({
            type: "inspected-data",
            payload: { source, target },
        });
    }

    if (msg.type === "expand-ui") {
        figma.ui.resize(540, 100);
    }

    if (msg.type === "collapse-ui") {
        figma.ui.resize(540, 600);
    }
};

figma.on("selectionchange", () => {
    const selection: SceneNode[] = Array.from(figma.currentPage.selection);
    figma.ui.postMessage({
        type: "selection-validation",
        validation: validateSelection(selection),
    });
});