import {
  IOverrideData,
  IOverrideProp,
  checkEquality,
  createOverrideData,
  formatOverrideValue,
  getPropsFromNode,
  log,
  supportsAutoLayout,
  supportsChildren,
  validateSelection,
} from "./util";

figma.showUI(__html__, { title: "Maximum Override", width: 540, height: 600 });

let temporaryNodes: SceneNode[] = [];
let dataById: { [id: string]: IOverrideData };
let comparedNodeCount: number = 0;
let hasOverrides: IOverrideData[] = [];

/**
 * @param data The node that's being recursively introspected
 * @param recursionLevel Integer for indenting output strings
 */
function getOverridesForData(
  data:IOverrideData,
  recursionLevel: number
):IOverrideData {
  let {sourceNode, targetNode} = data;
  // let start = new Date().getTime();
  if (targetNode.type !== sourceNode.type) {
    log(recursionLevel, `Can't compare ${sourceNode.type} to ${targetNode.type}`);
    return null;
  }
  let overriddenProps = [];
  let targetProps = getPropsFromNode(targetNode);
  let sourceProps = getPropsFromNode(sourceNode);
  for (const key in targetProps) {
    if (!checkEquality(key, targetProps[key], sourceProps[key])) {
      let prop: IOverrideProp = {
        key: key,
        sourceValue: formatOverrideValue(key, sourceProps[key]),
        targetValue: formatOverrideValue(key, targetProps[key]),
        isApplied: true,
      };
      overriddenProps.push(prop);
    }
  }
  data.overriddenProps = overriddenProps;
  return data;
}

// Recursive
function compareProps(
  data: IOverrideData,
  recursionLevel: number
):IOverrideData {
  data.overriddenProps = []; // Clear in case of swap
  data = getOverridesForData(data, recursionLevel + 1);
  if (data.overriddenProps.length > 0) {
    hasOverrides.push(data);
  }
  const targetNode:any = data.targetNode;
  /*
    If the target's mainComponent has changed, we need to compare against an instance
    of that main rather than the original component. Note that this only applies to
    nested instances within the target, not the root level, hence recursionLevel > 1.
    TODO: make this toggleable?
    */
  let hasNewMain: boolean;
  data.overriddenProps.forEach((prop) => {
    if (prop.key === "mainComponent" && recursionLevel > 1) {
      hasNewMain = true;
    }
  });
  if (hasNewMain) {
    let component = (data.targetNode as InstanceNode).mainComponent as ComponentNode;
    if (component.remote) {
      log(recursionLevel + 1, "Remote component detected. Key:", component.key);
    }
    try {
      let newSourceNode: SceneNode = component.createInstance();
      let newSourceData: IOverrideData = createOverrideData(newSourceNode, targetNode);
      log(recursionLevel, "New Main", newSourceNode.name, newSourceData);
      temporaryNodes.push(newSourceNode);
    } catch (e) {
      log(recursionLevel + 1, "Couldn't create an instance. Is this a nested main component?", e );
      return;
    }
  }

  if (supportsChildren(targetNode)) {
    const targetChildren = targetNode.children;
    let dataChildren:IOverrideData[] = [];
    for (let i = 0, n = targetChildren.length; i < n; i++) {
      const targetChild = targetChildren[i] as SceneNode;
      const sourceNode:any = data.sourceNode;
      if (supportsChildren(sourceNode)) {
        const sourceChild = (sourceNode as any).children[i];
        if (sourceChild === undefined) {
          log(recursionLevel + 1, `sourceChild at ${i} is undefined in ${sourceNode.children}`);
          break;
        }
        const childData = createOverrideData(sourceChild, targetChild);
        childData.parentId = data.id;
        dataChildren.push(compareProps(childData, recursionLevel + 1));
      } else {
        log(recursionLevel + 1, `Original node ${data.sourceName} has no matching children.`);
      }
    }
    data.children = dataChildren.length > 0 ? dataChildren : null;
  }

  comparedNodeCount++;
  dataById[data.id] = data;
  return data;
}

function cleanUpTemporaryNodes() {
  temporaryNodes.forEach((node) => {
    node.remove();
  });
  temporaryNodes = [];
}

function getDataFromSelection(selection: SceneNode[]): any {
  let targetNode: SceneNode, sourceNode: SceneNode;
  let data: IOverrideData;
  if (selection.length === 1) {
    targetNode = selection[0];
    if (targetNode.type === "INSTANCE") {
      targetNode = selection[0] as InstanceNode;
      sourceNode = targetNode.mainComponent.createInstance();
      data = createOverrideData(sourceNode, targetNode);
      data.sourceName = "Main";
      log(0, `Comparing main ${data.sourceName} to target ${data.targetName}`);
      temporaryNodes.push(data.sourceNode);
    } else {
      log(0, "Selection must be an Instance.");
    }
  } else if (selection.length == 2) {
    // note that order is reversed
    sourceNode = selection[0];
    targetNode = selection[1];
    data = createOverrideData(sourceNode, targetNode);
  } else {
    log(0, "Cannot compare more than two selected items.");
  }
  return data;
}

// Recursive (in reverse)
function expandParents(data: IOverrideData) {
  data.isCollapsed = false;
  if (data.parentId) {
    const parent = dataById[data.parentId];
    // if the parent has already been expanded, stop here
    if (parent.isCollapsed) expandParents(parent);
  }
}

function getOverrides(
  data: IOverrideData
) {
  hasOverrides = [];
  dataById = {};
  data = compareProps(data, 1);
  hasOverrides.forEach((data) => expandParents(data));
  cleanUpTemporaryNodes();
  return data;
}

/******************************************
 *  Apply overrides
 ******************************************/

/**
 * @param key Override property key as string
 * @param prop The prop data object
 * @param target The Figma node to apply the prop to
 * @param isRoot Whether this is the top-level parent
 * @returns true if we're updating the main component
 */
function applyOverrideProp(
  key: string,
  prop: any,
  target: SceneNode,
  isRoot: boolean
): boolean {
  let textProps: any[] = [];
  switch (key) {
    case "backgrounds":
    case "fills":
    case "strokes":
      if (Array.isArray(prop)) {
        target[key] = prop;
      }
      return false;
    case "mainComponent":
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
      let fontName: FontName = prop as FontName;
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
          log(0, "Multiple font attributes detected within ", prop);
          return false;
        }
        let textNode = target as TextNode;
        if (textNode.hasMissingFont) {
          log(0, "Text field has missing font. Can't edit properties.");
          return false;
        }
        textProps.push({ key, prop });
        let fontName = textNode.fontName;
        if (typeof fontName === "symbol") {
          log(0, "Multiple font attributes detected within ", target.name);
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
      const hasAutoLayout =
        supportsAutoLayout(target) && (target as any).layoutAlign !== "NONE";
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
  data: IOverrideData,
  target: any,
  recursionLevel: number
) {
  const isRoot = recursionLevel === 1;
  log(recursionLevel, "applyOverridesToNode", data.targetName);
  data.overriddenProps.forEach((prop) => {
    try {
      if (prop.key in target) {
        if (prop.isApplied) {
          applyOverrideProp(prop.key, prop.sourceValue, target, isRoot);
        }
      }
    } catch (e) {
      log(0, "Cannot apply prop", prop, e);
    }
  });
  // recursion
  if (data.children) {
    for (let i: number = 0; i < data.children.length; i++) {
      const childData = data.children[i];
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
 * Handle UI
 *******************************************************/

async function validateClientStorage() {
  const data = await figma.clientStorage.getAsync("copiedOverrides");
  const isValid = data !== undefined;
  if (isValid) {
    figma.ui.postMessage({
      type: "client-storage-validated",
    });
  }
  return isValid;
}

figma.on("selectionchange", () => {
  const selection: SceneNode[] = Array.from(figma.currentPage.selection);
  const validation = validateSelection(selection);
  validateClientStorage()
    .then((isValid) => {
      figma.ui.postMessage({
        type: "selection-validation",
        validation,
        clientStorageIsValid: isValid,
      });
    })
    .catch(() => {
      // TODO: Notify client
      figma.ui.postMessage({
        type: "selection-validation",
        validation,
        clientStorageIsValid: false,
      });
    });
});

figma.ui.onmessage = (msg) => {
  if (msg.type === "initial-render") {
    const selection: SceneNode[] = Array.from(figma.currentPage.selection);
    figma.ui.postMessage({
      type: "selection-validation",
      validation: validateSelection(selection),
    });
    validateClientStorage();
  }

  if (msg.type === "compare-selected") {
    const selection: SceneNode[] = Array.from(figma.currentPage.selection);
    let start = new Date().getTime();
    log(0, "Started inspecting selected nodes...")
    let data = getDataFromSelection(selection);
    let diff = getOverrides(data);
    let end = new Date().getTime();
    log(1, "Finished inspecting selected nodes.", data.id, end - start);
    figma.ui.postMessage({
      type: "comparison-finished",
      payload: diff,
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
    let target: SceneNode;
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
    figma.clientStorage
      .getAsync("copiedOverrides")
      .then((data) => {
        log(0, "got async data", data, "target", target);
        applyOverridesToNode(data, target, 1);
      })
      .catch((error) => {
        // TODO: post notification
        log(0, "ERROR: async", error);
      })
      .finally(() => {});
  }

  if (msg.type === "swap-selected") {
    log(0, "Swapping symbols", msg);
    let originalData:IOverrideData = createOverrideData(
      figma.getNodeById(msg.data.targetId) as SceneNode,
      figma.getNodeById(msg.data.sourceId) as SceneNode
    );
    let diff = getOverrides(
      originalData,
    );
    log(0, "Finished inspecting swapped nodes.", originalData.id);
    figma.ui.postMessage({
      type: "comparison-finished",
      payload: diff,
    });
  }

  if (msg.type === "expand-ui") {
    figma.ui.resize(540, 100);
  }

  if (msg.type === "collapse-ui") {
    figma.ui.resize(540, 600);
  }

  if (msg.type === "prop-click") {
    log(0, `Prop "${msg.propId}" clicked on node ${msg.nodeId}`);
  }
};
