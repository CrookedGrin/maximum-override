import equal from "deep-equal";

figma.showUI(__html__, { width: 600, height: 600 });

export interface IOverrideData {
    name: string;
    type: string;
    id?: string;
    associatedNode?: SceneNode;
    overriddenProps?: any[];
    childData?: IOverrideData[];
}

function checkEquality(key: string, sourceValue: any, targetValue: any) {
    switch (key) {
       case "masterComponent":
           return sourceValue.id === targetValue.id;
       default:
           return equal(sourceValue, targetValue);
    }
}

function formatOverrideProp(key: string, prop: any) {
    // console.log("fop", key, prop);
    switch (key) {
       case "backgrounds":
       case "fills":
       case "strokes":
           if (!Array.isArray(prop) || !prop[0]) {
              // console.log(key, "is not an array.", prop);
              return [];
           }
           break;
       case "masterComponent":
           return { name: prop.name, id: prop.id };
    }
    return prop;
}

/**
 * @param target The node that's being recursively introspected
 * @param source The node we're comparing against (an instance of master for single selection)
 * @param recursionLevel Integer for indenting output strings
 */
function getOverridesForNode(
    source: SceneNode,
    target: SceneNode,
    recursionLevel: number
) {
    let indent = "├" + "─".repeat(recursionLevel - 1) + " ";
    let logMessage = indent;
    let overrides = [];
    if (!checkEquality(target.type, target, source)) {
       logMessage += target.type + " " + target.name;
    }
    overridableProps.forEach((key) => {
       if (key in target && key in source) {
           if (!checkEquality(key, target[key], source[key])) {
              overrides.push({
                  key: key,
                  from: formatOverrideProp(key, source[key]),
                  to: formatOverrideProp(key, target[key]),
              });
           }
       }
    });

    const numOverrides = overrides.length;
    if (numOverrides > 0) {
       logMessage += " ::: " + numOverrides + " overrides: ";
       logMessage += Object.keys(overrides).toString().replace(/,/g, ", ");
    }

    return overrides;

    // console.log(logMessage);
    // printDiff(source, target, indent);
}

// recursion
function compareOverrides(
    source: IOverrideData,
    target: IOverrideData,
    recursionLevel: number
) {
    target.overriddenProps = getOverridesForNode(
       source.associatedNode,
       target.associatedNode,
       recursionLevel
    );
    let indent = "├" + "─".repeat(recursionLevel - 1) + " ";

    if (
       "children" in target.associatedNode &&
       target.associatedNode.children.length
    ) {
       const nodeChildren = target.associatedNode.children;
       let childData = [];
       for (let i = 0; i < nodeChildren.length; i++) {
           const targetChild = nodeChildren[i] as SceneNode;
           // console.log(indent, " within loop, targetChild:", targetChild);
           const targetChildData = createDataWrapperForNode(targetChild);
           if ("children" in source.associatedNode) {
              const sourceChild = source.associatedNode.children[i] as SceneNode;
              const sourceChildData = createDataWrapperForNode(sourceChild);
              compareOverrides(sourceChildData, targetChildData, recursionLevel + 1);
              childData.push(targetChildData);
           } else {
              console.log(
                  "Original node " + source.name + " has no matching children."
              );
           }
       }
       target.childData = childData.length > 0 ? childData : null;
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

function getOverrideDataForSelection(selection: SceneNode[]) {
    let targetNode: SceneNode, sourceNode: SceneNode;
    let target: IOverrideData, source: IOverrideData;
    let cleanUpInstance = false;
    if (selection.length === 1) {
       targetNode = selection[0];
       if (targetNode.type === "INSTANCE") {
           targetNode = selection[0] as InstanceNode;
           target = createDataWrapperForNode(targetNode);
           sourceNode = targetNode.masterComponent.createInstance();
           source = createDataWrapperForNode(sourceNode);
           source.name = "Master";
           source.type = "COMPONENT";
           console.log("Comparing master ", source, " to target ", target);
           cleanUpInstance = true;
       } else {
           console.log("Selection must be an Instance.");
       }
    } else if (selection.length == 2) {
       // note that order is reversed
       sourceNode = selection[0];
       source = createDataWrapperForNode(sourceNode);
       targetNode = selection[1];
       target = createDataWrapperForNode(targetNode);
    } else {
       console.log("Cannot compare more than two selected items.");
    }

    compareOverrides(source, target, 1);

    let returnData = {
       source,
       target,
    };
    if (cleanUpInstance) {
       source.associatedNode.remove();
    }
    return returnData;
}

function applyOverrideProp(
    key: string,
    prop: any,
    target: SceneNode,
    isRoot: boolean
) {
    // console.log("fop", key, prop);
    switch (key) {
        case "backgrounds":
        case "fills":
        case "strokes":
            if (Array.isArray(prop)) {
                target[key] = prop;
            }
            break;
        case "backgroundStyleId":
        case "fillStyleId":
        case "strokeStyleId":
            // ignore these
            break;
        case "masterComponent":
            // don't apply this one at the root level
            if (!isRoot) {
                //TODO: Add checkbox for "don't rename layers"
                // target["autoRename"] = false;
                target[key] = prop;
            }
            break;
        case "characters":
            // must load font first
            console.log("================= TEXT", (target as TextNode).fontName);
            if ("fontName" in target) {
                let textNode = (target as TextNode);
                let fontName = textNode.fontName as FontName;
                figma.loadFontAsync(fontName).then(data => {
                    textNode.characters = prop;
                });
            }
            break;
        default:
            target[key] = prop;
            break;
    }
}

function applyOverridesToNode(
    overrides: IOverrideData,
    target: any,
    recursionLevel: number
) {
    const isRoot = recursionLevel === 1;
    const indent = "--".repeat(recursionLevel);
    console.log(indent, overrides.name, overrides, target);
    overrides.overriddenProps.forEach((prop) => {
    //    console.log(indent, ">>>>>> override", prop);
       try {
           if (prop.key in target) {
              applyOverrideProp(prop.key, prop.to, target, isRoot);
           }
       } catch (e) {
           console.log(indent, "no", e, prop);
       }
    });
    // recursion
    if (overrides.childData) {
       for (let i: number = 0; i < overrides.childData.length; i++) {
           const childData = overrides.childData[i];
           // find child element by corresponding position in hierarchy
           //TODO: allow search by layer name instead
           let targetChild: SceneNode;
           try {
              targetChild = target.children[i] as SceneNode;
              applyOverridesToNode(childData, targetChild, recursionLevel + 1);
           } catch (e) {
              console.log(e, targetChild, i, target);
           }
       }
    }
}

/**
 * Handle UI messages
 */
figma.ui.onmessage = (msg) => {
    if (msg.type === "inspect-selected") {
       const selection: SceneNode[] = Array.from(figma.currentPage.selection);
       let { source, target } = getOverrideDataForSelection(selection);
       console.log("Finished inspecting selected nodes.", target.overriddenProps);
       figma.ui.postMessage({
           type: "inspected-data",
           payload: { source, target },
       });
    }

    if (msg.type === "save-overrides") {
       console.log("Received override data. Saving...", msg);
       let data: IOverrideData = msg.data;
       figma.clientStorage.setAsync("savedOverrides", data);
       figma.ui.postMessage({ type: "save-confirmation" });
    }

    if (msg.type === "apply-overrides") {
       console.log("Received apply request. Getting node...", msg);
       const selection: SceneNode[] = Array.from(figma.currentPage.selection);
       const target: SceneNode = selection[0];
       figma.clientStorage
           .getAsync("savedOverrides")
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

    // figma.closePlugin();
};

const overridableProps = [
    "masterComponent",
    "name",
    "locked",
    "opacity",
    "visible",
    "backgrounds",
    "blendMode",
    "clipsContent",
    "effects",
    "fills", // array
    "strokes",
    "strokeAlign",
    "strokeCap",
    "strokeJoin",
    "dashPattern",
    "cornerRadius",
    "cornerSmoothing",
    // text
    "characters",
    "textAlignHorizontal",
    "textAlignVertical",
    "paragraphIndent",
    "paragraphSpacing",
];


// Text properties that can be overriden on individual characters
const charOverridableProps = [
    "fills",
    "fillStyleId",
    "fontSize",
    "fontName",
    "textCase",
    "textDecoration",
    "letterSpacing",
    "lineHeight",
    "textStyleId",
];
