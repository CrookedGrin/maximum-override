import * as React from 'react'
import * as ReactDOM from 'react-dom'
import './ui.scss'
import '../dist/ui.css'
import '../node_modules/figma-plugin-ds/dist/figma-plugin-ds.css';
import { 
    ISelectionValidation,
    SelectionValidation,
    IColor,
    IOverrideData,
    IOverrideProp,
    IBoxCorners,
    IBoxSides,
    rgbaToHex,
    formatRgbaColor,
    createCssGradient,
    truncate,
    deCamel,
    flattenData
} from './util'
declare function require(path: string): any

interface IProps {}

interface IState {
    inspectEnabled: boolean;
    inspectMessage: string;
    copyEnabled: boolean;
    pasteEnabled: boolean;
    swapEnabled: boolean;
    selectionValidation: ISelectionValidation;
    diffCollapsed: boolean;
    data?: IOverrideData;
    copyButtonMessage: string;
    clientStorageValidated: boolean;
    totalNodeCount: number;
    comparedNodeCount: number;
    comparisonInProgress: boolean;
    propToggleStates: any;
}


class App extends React.Component<IProps, IState> {

    /**********************************
     * State management
     **********************************/

    state: IState = {
        diffCollapsed: false,
        inspectMessage: '',
        inspectEnabled: false,
        copyEnabled: false,
        pasteEnabled: false,
        swapEnabled: false,
        selectionValidation: undefined,
        data: undefined,
        copyButtonMessage: "Copy overrides",
        clientStorageValidated: false,
        totalNodeCount: 0,
        comparedNodeCount: 0,
        comparisonInProgress: false,
        propToggleStates: undefined
    };

    // Recursive
    initPropToggleStates = (nodeData:IOverrideData) => {
        let a = {
            props: {},
            children: {}
        };
        if (!nodeData) return a;
        if (nodeData.overriddenProps) {
            let props = nodeData.overriddenProps;
            props.map(prop => {
                a.props[prop.key] = prop.isApplied;
            })
        }
        if (nodeData.children) {
            nodeData.children.map(childData => {
                a.children[childData.id] = this.initPropToggleStates(childData);
            });
        }
        return a;
    }

    getPropToggleStates = () => {
        let s = {};
        return s;
    }

    /**********************************
     * Lifecycle
     **********************************/

    componentDidMount = () => {
        window.addEventListener("message", (event) => {
            const message = event.data.pluginMessage;
            const payload = message.payload;
            switch (message.type) {
                case "selection-validation":
                    const validation:ISelectionValidation = message.validation;
                    let inspectMessage:string;
                    let canPaste: boolean = false;
                    switch (validation.reason) {
                        case SelectionValidation.IS_INSTANCE:
                            inspectMessage = "Compare instance to main";
                            canPaste = true;
                            break;
                        case SelectionValidation.IS_TWO:
                            inspectMessage = "Compare selected";
                            canPaste = true;
                            break;
                        case SelectionValidation.IS_NODE:
                            inspectMessage = "Select an instance";
                            canPaste = true;
                            break;
                        default:
                            inspectMessage = "Select items to compare";
                            break;
                    }
                    let canSwap:boolean = (validation.reason === SelectionValidation.IS_TWO) && (this.state.data !== undefined);
                    this.setState({
                        inspectEnabled: validation.isValid,
                        selectionValidation: validation,
                        pasteEnabled: canPaste && message.clientStorageIsValid,
                        inspectMessage,
                        totalNodeCount: validation.childCount,
                        swapEnabled: canSwap
                    });
                    break;
                case "client-storage-validated":
                    this.setState({
                        clientStorageValidated: true
                    });
                    break;
                case "comparison-finished":
                    this.setState({
                        data: payload,
                        copyEnabled: true,
                        swapEnabled: this.state.selectionValidation.reason === SelectionValidation.IS_TWO,
                        copyButtonMessage: "Copy overrides",
                        inspectEnabled: false,
                        comparisonInProgress: false,
                        propToggleStates: flattenData(payload)
                    });
                    break;
                case "copy-confirmation":
                    this.setState({
                        copyButtonMessage: "Overrides copied",
                        copyEnabled: false,
                        pasteEnabled: true
                    });
                    break;
            }
        });
        // Request selection validation
        parent.postMessage({ 
            pluginMessage: { type: 'initial-render' } 
        }, '*');

        // TEST - compare on initial load (assumes selection)
        // parent.postMessage({
        //     pluginMessage: {
        //         type: 'compare-selected'
        //     }
        // }, '*')
    }


    /**********************************
     * Button handlers
     **********************************/

    onInspect = () => {
        this.setState({
            comparisonInProgress: true
        }, () => {
            this.forceUpdate(() => {
                parent.postMessage({
                    pluginMessage: {
                        type: 'compare-selected'
                    }
                }, '*')
            });
        });
    }

    onSwap = () => {
        parent.postMessage({
            pluginMessage: {
                type: 'swap-selected',
                data: {
                    // Figma won't pass the whole object, so just send the ids
                    targetId: this.state.data.targetNode.id,
                    sourceId: this.state.data.sourceNode.id
                }
            }
        }, '*')
    }

    onCopy = () => {
        parent.postMessage({
            pluginMessage: {
                type: 'copy-overrides',
                data: this.state.data,
            }
        }, '*')
    }

    onPaste = () => {
        parent.postMessage({
            pluginMessage: {
                type: 'paste-overrides',
                // If there are 2 nodes selected, paste back from target onto source
                data: {
                    targetId: this.state.data ? this.state.data.targetNode.id : undefined
                }
            }
        }, '*')
    }

    onExpandCollapse = () => {
        this.setState({diffCollapsed: !this.state.diffCollapsed})
        if (this.state.diffCollapsed) {
            parent.postMessage({
                pluginMessage: {
                    type: 'collapse-ui'
                }
            }, '*')
        } else {
            parent.postMessage({
                pluginMessage: {
                    type: 'expand-ui'
                }
            }, '*')
        }
    }

    onPropClick = (e) => {
        debugger;
        const dataset = e.currentTarget.dataset;
        const id = `${dataset.nodeid}--${dataset.propid}`;
        const prop:IOverrideProp = this.state.propToggleStates[id];
        prop.isApplied = !prop.isApplied;
    }


    /**********************************
     * Rendering
     **********************************/

    renderEmptyBlock = () => {
       return (
           <span className="color">
               <span className="rgbColor rgbColor--none"/>
               <span>(None)</span>
           </span>
       )
    }

    renderSolidBlock = (color:IColor) => {
       let formatted:IColor = formatRgbaColor(color);
       let toolTip:string = `RGB:\u00A0${formatted.r},\u00A0${formatted.g},\u00A0${formatted.b}`;
       let hexString:string = rgbaToHex(formatted);
       let rgbString:string = `rgb(${formatted.r}, ${formatted.g}, ${formatted.b})`
       return (
            <span className="color">
                <span
                    className="rgbColor hasTooltip"
                    style={{backgroundColor: rgbString}}
                    data-tooltip={toolTip}
                />
                <span>{hexString}</span>
            </span>
       )
    }

    renderGradientBlock = (paint:GradientPaint) => {
        let toolTip:string = "";
        paint.gradientStops.forEach(stop => {
            let color = formatRgbaColor(stop.color);
            let str = rgbaToHex(color);
            toolTip += str + ", "
        });
        toolTip = toolTip.slice(0, -2);
        let gradient:string = createCssGradient(paint);
        return (
            <span className="color">
                <span
                    className="rgbColor rgbColor--gradient hasTooltip"
                    style={{background: gradient}}
                    data-tooltip={toolTip}
                />
                <span>Gradient</span>
            </span>
        )
    }

    renderImageBlock = () => {
        return (
            <span className="color">
                <span className="rgbColor rgbColor--image" />
                <span>Image</span>
            </span>
        )
    }

    renderColor = (paint: any) => {
        if (paint === undefined) {
            paint = {
                type: "NONE", 
                color: {r: 1, g: 1, b: 1}
            };
        }
        switch (paint.type) {
            case "SOLID":
                return this.renderSolidBlock(paint.color);
            case "IMAGE":
                return this.renderImageBlock();
            case "GRADIENT_LINEAR":
            case "GRADIENT_RADIAL":
            case "GRADIENT_ANGULAR":
            case "GRADIENT_DIAMOND":
                return this.renderGradientBlock(paint);
            case "NONE":
            default:
                return this.renderEmptyBlock();
        }
    }

    renderCorners = (corners:IBoxCorners) => {
        return (
            <span className="value value--corners">
                <span>{corners.topLeft}</span>
                <span className="right">{corners.topRight}</span>
                <span>{corners.bottomLeft}</span>
                <span className="right">{corners.bottomRight}</span>
            </span>
        )
    }

    renderPadding = (sides:IBoxSides) => {
        return (
            <span className="value value--padding">
                <span>{sides.left}</span>
                <span className="middle">
                    <span>{sides.top}</span>
                    <span>{sides.bottom}</span>
                </span>
                <span className="right">{sides.right}</span>
            </span>
        )
    }

    renderLineValue = (value: any) => {
        if (typeof value === 'string') {
            return <span className="value">{value}</span>
        }
        return <span className="value">{value.value} {value.unit.toLowerCase()}</span>
    }

    renderFontValue = (value: any) => {
        if (typeof value === 'string') {
            return <span className="value">{value}</span>
        }
        return <span className="value">{value.family} {value.style}</span>
    }

    renderDefaultValue = (value: any) => {
        if (typeof value === 'object') {
            return (
                <span className="value value--object">
                    {Object.keys(value).map(key => {
                        return (
                            <span className="sub-prop">
                                <span className="sub-key">{deCamel(key)}:</span>
                                <span className="sub-value">{truncate(value[key], 4)}</span>
                            </span>
                        );
                    })}
                </span>
            );
        }
        if (typeof value === 'symbol') {
            return <span className="value">(Mixed)</span>
        }
        return <span className="value">{value.toString()}</span>
    }

    renderOverrideProp = (prop: IOverrideProp) => {
        const { key, sourceValue, targetValue } = prop;
        switch (key) {
            case 'effects':
            case 'fills':
            case 'strokes':
                /* Only display the first in the array for these */
                return (
                    <span className="prop-inner prop--inline">
                        <span className="key">{key}:</span>
                        <span>{this.renderColor(sourceValue[0])}</span>
                        <span className="arrow">→</span>
                        <span>{this.renderColor(targetValue[0])}</span>
                    </span>
                )
            case "mainComponent":
                return (
                    <div className="prop-inner">
                        <span className="key">Main:</span>
                        <span className="value">
                            <span 
                                className="string hasTooltip" 
                                data-tooltip={sourceValue.name}>
                                    {sourceValue.name}
                                </span>
                            </span>
                        <span className="arrow">→</span>
                        <span className="value">
                            <span 
                                className="string hasTooltip" 
                                data-tooltip={targetValue.name}>
                                    {targetValue.name}
                                </span>
                            </span>
                    </div>
                )
            case "name":
            case "characters":
                const source = sourceValue.toString();
                const target = targetValue.toString();
                //TODO: tooltips are useless on these unless they don't run off the page
                // const showSourceTT = source.length > 100;
                // const showTargetTT = target.length > 100;
                // const sourceTT = source.substring(0, 400);
                // const targetTT = target.substring(0, 400);
                return (
                    <div className="prop-inner">
                        <span className="key">{key}:</span>
                        <span className="value">
                            {/* <span className={`string ${showSourceTT ? 'hasTooltip' : ''}`} data-tooltip={sourceTT}> */}
                            <span className={`string`}>
                                {sourceValue}
                            </span>
                        </span>
                        <span className="arrow">→</span>
                        <span className="value">
                            {/* <span className={`string ${showTargetTT ? 'hasTooltip' : ''}`} data-tooltip={targetTT}> */}
                            <span className={`string`}>
                                {target}
                            </span>
                        </span>
                    </div>
                )
            case "fontName":
                return (
                    <div className="prop-inner">
                        <span className="key">{deCamel(key)}:</span>
                        {this.renderFontValue(sourceValue)}
                        <span className="arrow">→</span>
                        {this.renderFontValue(targetValue)}
                    </div>
                )
            case "letterSpacing":
            case "lineHeight":
                return (
                    <div className="prop-inner">
                        <span className="key">{deCamel(key)}:</span>
                        {this.renderLineValue(sourceValue)}
                        <span className="arrow">→</span>
                        {this.renderLineValue(targetValue)}
                    </div>
                )
            case "corners":
                return (
                    <div className="prop-inner">
                        <span className="key">Corners:</span>
                        {this.renderCorners(sourceValue)}
                        <span className="arrow">→</span>
                        {this.renderCorners(targetValue)}
                    </div>
                )
            case "padding":
                return (
                    <div className="prop-inner">
                        <span className="key">Padding:</span>
                        {this.renderPadding(sourceValue)}
                        <span className="arrow">→</span>
                        {this.renderPadding(targetValue)}
                    </div>
                )
            default:
                return (
                    <span className="prop-inner">
                        <span className="key">{deCamel(key)}:</span>
                        {this.renderDefaultValue(sourceValue)}
                        <span className="arrow">→</span>
                        {this.renderDefaultValue(targetValue)}
                    </span>
                )
        }
    }

    renderOverrideProps = (props: any[], nodeId: string) => {
        const doNotRender = [
            'backgrounds',
            'backgroundStyleId',
            'effectStyleId',
            'fillStyleId',
            'strokeStyleId',
            'paddingLeft',
            'paddingRight',
            'paddingTop',
            'paddingBottom',
            'topLeftRadius',
            'topRightRadius',
            'bottomLeftRadius',
            'bottomRightRadius',
            'cornerRadius',
        ]
        return (
            <div className="props">
                {
                    props.map(prop => {
                        if (doNotRender.includes(prop.key)) return false;
                        return (
                            <div
                                className={`prop ${prop.key === 'fills' ? 'selected' : ''} `}
                                key={prop.key}
                                data-propid={prop.key}
                                data-nodeid={nodeId}
                                onClick={this.onPropClick}
                            >
                                {this.renderOverrideProp(prop)}
                            </div>
                        )
                    })
                }
            </div>
        )
    }

    renderNodeIcon = (type: string) => {
        let iconText: string = "";
        let iconType = type.toLowerCase();
        switch (type) {
            case "TEXT":
                iconText = "T";
                break;
            case "VECTOR":
                iconText = "▱";
                break;
            case "ELLIPSE":
                iconText = "○";
                break;
            case "RECTANGLE":
                iconText = "▭";
                break;
            case "LINE":
                iconText = "─";
                break;
        }
        let iconClass = `icon icon--purple icon--${iconType}`;
        return <div className={iconClass}>{iconText}</div>
    }

    toggleNode = (nodeData: IOverrideData) => {
        nodeData.isCollapsed = !nodeData.isCollapsed;
        this.forceUpdate();
    }

    // Recursive
    renderDiff = (nodeData: IOverrideData, isTop: boolean) => {
        let classes = isTop ? "node node--top" : "node";
        const isCollapsible = nodeData.children || nodeData.overriddenProps.length > 0;
        const titleClasses = isCollapsible ? "title title--collapsible" : "title";
        return (
            <div className={classes} key={nodeData.id.toString()}>
                <span className={titleClasses} onClick={() => this.toggleNode(nodeData)}>
                    {isCollapsible &&
                        this.renderCaret(nodeData.isCollapsed)
                    }
                    {this.renderNodeIcon(nodeData.type)}
                    <span className="node-name">{nodeData.sourceName}</span>
                </span>
                {!nodeData.isCollapsed && (
                    <>
                        {nodeData.overriddenProps &&
                            this.renderOverrideProps(nodeData.overriddenProps, nodeData.id)
                        }
                        {nodeData.children &&
                            nodeData.children.map(child => {
                                return this.renderDiff(child, false);
                            })
                        }
                    </>
                )}
            </div>
        )
    }

    renderCaret(isCollapsed:boolean) {
        return (
            <div className="expand-collapse">
                {isCollapsed &&
                    <div className="icon icon--caret-right" />
                }
                {!isCollapsed &&
                    <div className="icon icon--caret-down" />
                }
            </div>
        )
    }

    renderHeader() {
        let {data, comparisonInProgress} = this.state;
        if (comparisonInProgress) {
            return (
                <div className="header header--loading">
                    <span>Comparing {this.state.totalNodeCount} nodes...</span>
                </div>
            )
        }
        if (data === undefined) return <div className="header" />
        return (
            <div className="header" onClick={this.onExpandCollapse}>
                {this.renderCaret(this.state.diffCollapsed)}
                <span>{this.renderNodeIcon(data.type)}</span>
                <span className="compare-node">{data.sourceName}</span>
                <span className="arrow">→</span>
                <span>{this.renderNodeIcon(data.type)}</span>
                <span className="compare-node">{data.targetName}</span>
            </div>
        )
    }


    render() {
        const diffClasses = this.state.diffCollapsed ? "diff diff--collapsed" : "diff";
        return (
            <>
                <div className="MaximumOverride">
                    <div className="buttons">
                        <button
                            className="button button--secondary"
                            id="inspect"
                            onClick={this.onInspect}
                            disabled={!this.state.inspectEnabled}>
                            {this.state.inspectMessage}
                        </button>
                        <button
                            className="button button--secondary"
                            id="swap"
                            onClick={this.onSwap}
                            disabled={!this.state.swapEnabled}>
                            Swap
                        </button>
                        <button
                            className="button button--secondary"
                            id="copy"
                            onClick={this.onCopy}
                            disabled={!this.state.copyEnabled}>
                            {this.state.copyButtonMessage}
                        </button>
                        <button
                            className="button button--secondary"
                            id="paste"
                            onClick={this.onPaste}
                            disabled={!this.state.pasteEnabled}>
                            Paste overrides
                        </button>
                    </div>
                    <div className="content">
                        {this.renderHeader()}
                        <div className={diffClasses}>
                            <div className="nodes">
                                {this.state.data === undefined &&
                                    <div className="emptyState">
                                        <div className="logo" />
                                        <p>Select one <strong>component instance</strong> to compare it against its main component</p>
                                        <p className="centered"><strong>OR</strong></p>
                                        <p>Select <strong>two items</strong> of any type to compare them to each other.</p>
                                    </div>
                                }
                                {this.state.data && 
                                    this.renderDiff(this.state.data, true)
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </>
        )
    }
}


ReactDOM.render(<App />, document.getElementById('react-page'))