import * as util from './util'

figma.showUI(__html__, { width: 540, height: 600 });

let temporaryNodes:SceneNode[] = [];
let dataById:{[id:string]:util.IOverrideData};
let comparedNodeCount:number = 0;
let hasOverrides:util.IOverrideData[] = [];

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
    // let start = new Date().getTime();
    if (targetNode.type !== sourceNode.type) {
        util.log(recursionLevel, "Can't compare ", sourceNode.type, " to ", targetNode.type);
        return [];
    }
    let overrides = [];
    let targetProps = util.getPropsFromNode(targetNode);
    let sourceProps = util.getPropsFromNode(sourceNode);
    for (const key in targetProps) {
        if (!util.checkEquality(key, targetProps[key], sourceProps[key])) {
            overrides.push({
                key: key,
                sourceValue: util.formatOverrideProp(key, sourceProps[key]),
                targetValue: util.formatOverrideProp(key, targetProps[key]),
            });
        }
    }
    return overrides;
}

// Recursive
function compareProps(
    sourceData: util.IOverrideData,
    targetData: util.IOverrideData,
    recursionLevel: number
) {
    sourceData.overriddenProps = []; // Clear in case of swap
    targetData.overriddenProps = getOverridesForNode(
        sourceData.associatedNode,
        targetData.associatedNode,
        recursionLevel + 1
    );
    const targetNode:any = targetData.associatedNode;
    if (targetData.overriddenProps.length > 0) {
        hasOverrides.push(targetData);
    }
    /*
    If the target's masterComponent has changed, we need to compare against an instance
    of that master rather than the original component
    TODO: make this toggleable?
    */
    let hasNewMaster:boolean;
    targetData.overriddenProps.forEach((prop) => {
        if (prop.key === 'masterComponent') hasNewMaster = true;
    });
    if (hasNewMaster) {
        let component = ((targetData.associatedNode as InstanceNode).masterComponent as ComponentNode);
        if (component.remote) {
            util.log(recursionLevel + 1, "Remote component detected. Key:", component.key);
        }
        try {
            let newSourceNode:SceneNode = component.createInstance();
            let newSourceData:util.IOverrideData = util.createDataWrapperForNode(newSourceNode);
            util.log(recursionLevel, 'New Master', newSourceNode.name, newSourceData);
            sourceData = newSourceData;
            temporaryNodes.push(newSourceNode);
        } catch(e) {
            util.log(recursionLevel + 1, "Couldn't create an instance. Is this a nested master component?", e);
            return;
        }
    }

    if (util.supportsChildren(targetNode)) {
        const nodeChildren = targetNode.children;
        let childData = [];
        for (let i = 0, n = nodeChildren.length; i < n; i++) {
            const targetChild = nodeChildren[i] as SceneNode;
            const targetChildData = util.createDataWrapperForNode(targetChild);
            targetChildData.parentId = targetData.id;
            const sourceNode:any = sourceData.associatedNode;
            if (util.supportsChildren(sourceNode)) {
                const sourceChild = (sourceNode as any).children[i];
                if (sourceChild === undefined) {
                    util.log(recursionLevel + 1, 'sourceChild at ', i, 'is undefined in', sourceNode.children);
                    break;
                }
                const sourceChildData = util.createDataWrapperForNode(sourceChild);
                sourceChildData.parentId = sourceData.id;
                compareProps(sourceChildData, targetChildData, recursionLevel + 1);
                childData.push(targetChildData);
            } else {
                util.log(recursionLevel + 1, "Original node " + sourceData.name + " has no matching children.");
            }
        }
        targetData.childData = childData.length > 0 ? childData : null;
    }

    comparedNodeCount++;
    dataById[targetData.id] = targetData;
}

function cleanUpTemporaryNodes() {
    temporaryNodes.forEach(node => {
        node.remove();
    });
    temporaryNodes = [];
}

function getSourceAndTargetFromSelection(selection: SceneNode[]):any {
    let targetNode: SceneNode, sourceNode: SceneNode;
    let targetData: util.IOverrideData, sourceData: util.IOverrideData;
    if (selection.length === 1) {
        targetNode = selection[0];
        if (targetNode.type === "INSTANCE") {
            targetNode = selection[0] as InstanceNode;
            targetData = util.createDataWrapperForNode(targetNode);
            sourceNode = targetNode.masterComponent.createInstance();
            sourceData = util.createDataWrapperForNode(sourceNode);
            sourceData.name = "Master";
            sourceData.type = "COMPONENT";
            util.log(0, "Comparing master ", sourceData, " to target ", targetData);
            temporaryNodes.push(sourceData.associatedNode);
        } else {
            util.log(0, "Selection must be an Instance.");
        }
    } else if (selection.length == 2) {
        // note that order is reversed
        sourceNode = selection[0];
        sourceData = util.createDataWrapperForNode(sourceNode);
        targetNode = selection[1];
        targetData = util.createDataWrapperForNode(targetNode);
    } else {
        util.log(0, "Cannot compare more than two selected items.");
    }
    return {targetData, sourceData}
}

// Recursive (in reverse)
function expandParents(data:util.IOverrideData) {
    data.isCollapsed = false;
    if (data.parentId) {
        const parent = dataById[data.parentId];
        // if the parent has already been expanded, stop here
        if (parent.isCollapsed) expandParents(parent);
    }
}


function getOverrideDataForNodes(sourceData:util.IOverrideData, targetData:util.IOverrideData) {
    hasOverrides = [];
    dataById = {};
    compareProps(sourceData, targetData, 1);
    hasOverrides.forEach((data) => expandParents(data));
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
    // util.log(0, "fop", key, prop);
    let textProps:any[] = [];
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
        // For these text props, we must async load the font first.
        // Applying them should be almost synchronous once the font has been loaded.
        case "fontName":
            let textNode = target as TextNode;
            let fontName:FontName = prop as FontName;
            figma.loadFontAsync(fontName).then((data) => {
                (textNode as any).fontName = fontName;
            });
            return false;
        case "characters":
        case "fontSize":
        case "letterSpacing":
        case "lineHeight":
        case "paragraphIndent":
        case "paragraphSpacing":
        case "paragraphSpacing":
        case "textAlignHorizontal":
        case "textAlignVertical":
        case "textAutoResize":
        case "textCase":
        case "textDecoration":
        case "textStyleId":
            //TODO: Send UI notifications for errors
            if (key in target) {
                if (typeof prop === "symbol") {
                    util.log(0, "Multiple font attributes detected within ", prop);
                    return false;
                }
                let textNode = target as TextNode;
                if (textNode.hasMissingFont) {
                    util.log(0, "Text field has missing font. Can't edit properties.");
                    return false;
                }
                textProps.push({key, prop});
                let fontName = textNode.fontName;
                if (typeof fontName === "symbol") {
                    util.log(0, "Multiple font attributes detected within ", target.name);
                    return false;
                }
                figma.loadFontAsync(fontName).then((data) => {
                    (textNode as any)[key] = prop;
                });
            }
            return false;
        //TODO: Only call resize() once
        case "width":
            target.resize(prop, target.height);
            return false;
        case "height":
            target.resize(target.width, prop);
            return false;
        case "x":
        case "y":
            const hasAutoLayout = (util.supportsAutoLayout(target) && (target as any).layoutAlign !== "NONE");
            if (!hasAutoLayout && !isRoot) {
                target[key] = prop;
            }
        default:
            target[key] = prop;
            return false;
    }
}

// Recursive
function applyOverridesToNode(
    data: util.IOverrideData,
    target: any,
    recursionLevel: number
) {
    const isRoot = recursionLevel === 1;
    util.log(recursionLevel, 'applyOverridesToNode', data.name);
    data.overriddenProps.forEach((prop) => {
        // util.log(recursionLevel, ">>>>>> override", prop);
        try {
            if (prop.key in target) {
                applyOverrideProp(prop.key, prop.targetValue, target, isRoot)
            }
        } catch (e) {
            util.log(0, "Cannot apply prop", prop, e);
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
                util.log(0, "Error", e, "in applyOverridesToNode.");
                util.log(0, "   targetChild:", targetChild);
                util.log(0, "   in", target.children, "at", i, "on parent", target);
            }
        }
    }
}

/*******************************************************
 * Handle UI
 *******************************************************/

async function validateClientStorage() {
    const data = await figma.clientStorage.getAsync("copiedOverrides");
    const isValid = data !== undefined;
    if (isValid) {
        figma.ui.postMessage({
            type: "client-storage-validated"
        });
    }
    return isValid;
}

figma.on("selectionchange", () => {
    const selection: SceneNode[] = Array.from(figma.currentPage.selection);
    const validation = util.validateSelection(selection);
    validateClientStorage().then((isValid) => {
        figma.ui.postMessage({
            type: "selection-validation",
            validation,
            clientStorageIsValid: isValid
        })
    }).catch(() => {
        // TODO: Notify client
        figma.ui.postMessage({
            type: "selection-validation",
            validation,
            clientStorageIsValid: false
        })
    });;
});

figma.ui.onmessage = (msg) => {
    if (msg.type === "initial-render") {
        const selection: SceneNode[] = Array.from(figma.currentPage.selection);
        figma.ui.postMessage({
            type: "selection-validation",
            validation: util.validateSelection(selection),
        });
        validateClientStorage();
    }

    if (msg.type === "compare-selected") {
        const selection: SceneNode[] = Array.from(figma.currentPage.selection);
        let start = new Date().getTime();
        let { sourceData, targetData } = getSourceAndTargetFromSelection(selection);
        let { source, target } = getOverrideDataForNodes(sourceData, targetData);
        let end = new Date().getTime();
        util.log(0, "Finished inspecting selected nodes.", target, end - start);
        figma.ui.postMessage({
            type: "comparison-finished",
            payload: { source, target },
        });
    }

    if (msg.type === "copy-overrides") {
        util.log(0, "Received override data. Saving...", msg);
        let data: util.IOverrideData = msg.data;
        figma.clientStorage.setAsync("copiedOverrides", data);
        figma.ui.postMessage({ type: "copy-confirmation" });
    }

    if (msg.type === "paste-overrides") {
        util.log(0, "Received paste request. Getting node...", msg);
        let target:SceneNode;
        if (figma.currentPage.selection.length === 1) {
            target = figma.currentPage.selection[0] as SceneNode;
        } else {
            if (msg.data.targetId) {
                target = figma.getNodeById(msg.data.targetId) as SceneNode;
            }
        }
        if (target === undefined) {
            target = figma.currentPage.selection[0] as SceneNode;
        }
        figma.clientStorage.getAsync("copiedOverrides")
            .then((data) => {
                util.log(0, "got async data", data, "target", target);
                applyOverridesToNode(data, target, 1);
            })
            .catch((error) => {
                // TODO: post notification
                util.log(0, "ERROR: async", error);
            })
            .finally(() => {});
    }

    if (msg.type === "swap-selected") {
        util.log(0, "Swapping symbols", msg);
        let originalTarget: util.IOverrideData = util.createDataWrapperForNode(figma.getNodeById(msg.data.targetId) as SceneNode);
        let originalSource: util.IOverrideData = util.createDataWrapperForNode(figma.getNodeById(msg.data.sourceId) as SceneNode);
        let {source, target} = getOverrideDataForNodes(originalTarget, originalSource);
        util.log(0, "Finished inspecting swapped nodes.", target);
        figma.ui.postMessage({
            type: "comparison-finished",
            payload: {source, target},
        });
    }

    if (msg.type === "expand-ui") {
        figma.ui.resize(540, 100);
    }

    if (msg.type === "collapse-ui") {
        figma.ui.resize(540, 600);
    }
};

