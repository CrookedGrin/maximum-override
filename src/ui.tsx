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
    rgbaToHex,
    formatRgbaColor,
    createCssGradient
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
    sourceData?: IOverrideData;
    targetData?: IOverrideData;
    copyButtonMessage: string;
    clientStorageValidated: boolean;
    totalNodeCount: number;
    comparedNodeCount: number;
    comparisonInProgress: boolean;
}


class App extends React.Component<IProps, IState> {
    state: IState = {
        diffCollapsed: false,
        inspectMessage: '',
        inspectEnabled: false,
        copyEnabled: false,
        pasteEnabled: false,
        swapEnabled: false,
        selectionValidation: undefined,
        sourceData: undefined,
        targetData: undefined,
        copyButtonMessage: "Copy overrides",
        clientStorageValidated: false,
        totalNodeCount: 0,
        comparedNodeCount: 0,
        comparisonInProgress: false
    };

    componentDidMount = () => {
        window.addEventListener("message", (event) => {
            const message = event.data.pluginMessage;
            const payload = message.payload;
            switch (message.type) {
                case "selection-validation":
                    const validation:ISelectionValidation = message.validation;
                    let inspectMessage:string;
                    let canPaste: boolean = false;
                    // console.log('selection-validation', message.validation, 'dataVerified:', this.state.clientStorageValidated);
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
                    let canSwap:boolean = (validation.reason === SelectionValidation.IS_TWO) && (this.state.targetData !== undefined);
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
                        targetData: payload.target,
                        sourceData: payload.source,
                        copyEnabled: true,
                        swapEnabled: this.state.selectionValidation.reason === SelectionValidation.IS_TWO,
                        copyButtonMessage: "Copy overrides",
                        inspectEnabled: false,
                        comparisonInProgress: false
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
                    targetId: this.state.targetData.id,
                    sourceId: this.state.sourceData.id
                }
            }
        }, '*')
    }

    onCopy = () => {
        parent.postMessage({
            pluginMessage: {
                type: 'copy-overrides',
                data: this.state.targetData,
            }
        }, '*')
    }

    onPaste = () => {
        parent.postMessage({
            pluginMessage: {
                type: 'paste-overrides',
                // If there are 2 nodes selected, paste back from target onto source
                data: {
                    targetId: this.state.sourceData ? this.state.sourceData.id : undefined
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
       let toolTip:string = `RGB: ${formatted.r}, ${formatted.g}, ${formatted.b}`;
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
        // let toolTip = "Image";
        return (
            <span className="color">
                <span
                    className="rgbColor rgbColor--image"
                 //    data-tooltip={toolTip}
                />
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

    renderOverrideProp = (prop: any) => {
        const { key, sourceValue, targetValue } = prop;
        switch (key) {
            case 'backgrounds':
            case 'effects':
            case 'fills':
            case 'strokes':
                return (
                    <span className="prop prop--inline" key={key}>
                        <span className="key">{key}:</span>
                        <span>{this.renderColor(sourceValue[0])}</span>
                        <span className="arrow">→</span>
                        <span>{this.renderColor(targetValue[0])}</span>
                    </span>
                )
            case 'backgroundStyleId':
            case 'effectStyleId':
            case 'fillStyleId':
            case 'strokeStyleId':
                // Hide these in the UI
                return false;
            case "mainComponent":
                return (
                    <div className="prop" key={key}>
                        <span className="key">Main:</span>
                        <span className="value"><span className="string">{sourceValue.name}</span></span>
                        <span className="arrow">→</span>
                        <span className="value"><span className="string">{targetValue.name}</span></span>
                    </div>
                )
            case "name":
            case "characters":
                return (
                    <div className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span className="value"><span className="string">{sourceValue.toString()}</span></span>
                        <span className="arrow">→</span>
                        <span className="value"><span className="string">{targetValue.toString()}</span></span>
                    </div>
                )
            case "fontName":
                return (
                    <div className="prop" key={key}>
                        <span className="key">Font:</span>
                        <span className="value">{sourceValue.family} {sourceValue.style}</span>
                        <span className="arrow">→</span>
                        <span className="value">{targetValue.family} {targetValue.style}</span>
                    </div>
                )
            case "letterSpacing":
            case "lineHeight":
                return (
                    <div className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span className="value">{sourceValue.value} {sourceValue.unit.toLowerCase()}</span>
                        <span className="arrow">→</span>
                        <span className="value">{targetValue.value} {targetValue.unit.toLowerCase()}</span>
                    </div>
                )
            default:
                return (
                    <div className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span className="value">{sourceValue.toString()}</span>
                        <span className="arrow">→</span>
                        <span className="value">{targetValue.toString()}</span>
                    </div>
                )
        }
    }

    renderOverrideProps = (props: any[]) => {
        return (
            <div className="props">
                {
                    props.map(prop => {
                        return this.renderOverrideProp(prop)
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
        const isCollapsible = nodeData.childData || nodeData.overriddenProps.length > 0;
        const titleClasses = isCollapsible ? "title title--collapsible" : "title";
        return (
            <div className={classes} key={nodeData.id.toString()}>
                <span className={titleClasses} onClick={() => this.toggleNode(nodeData)}>
                    {isCollapsible &&
                        this.renderCaret(nodeData.isCollapsed)
                    }
                    {this.renderNodeIcon(nodeData.type)}
                    <span className="node-name">{nodeData.name}</span>
                </span>
                {!nodeData.isCollapsed && (
                    <>
                        {nodeData.overriddenProps &&
                            this.renderOverrideProps(nodeData.overriddenProps)
                        }
                        {nodeData.childData &&
                            nodeData.childData.map(child => {
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
        let {sourceData, targetData, comparisonInProgress} = this.state;
        if (comparisonInProgress) {
            return (
                <div className="header header--loading">
                    <span>Comparing {this.state.totalNodeCount} nodes...</span>
                </div>
            )
        }
        if (sourceData === undefined || targetData === undefined) return <div className="header" />
        return (
            <div className="header" onClick={this.onExpandCollapse}>
                {this.renderCaret(this.state.diffCollapsed)}
                <span>{this.renderNodeIcon(sourceData.type)}</span>
                <span className="compare-node">{sourceData.name}</span>
                <span className="arrow">→</span>
                <span>{this.renderNodeIcon(targetData.type)}</span>
                <span className="compare-node">{targetData.name}</span>
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
                                {this.state.targetData === undefined &&
                                    <div className="emptyState">
                                        <div className="logo" />
                                        <p>Select one <strong>component instance</strong> to compare it against its main component</p>
                                        <p className="centered"><strong>OR</strong></p>
                                        <p>Select <strong>two items</strong> of any type to compare them to each other.</p>
                                    </div>
                                }
                                {this.state.targetData && 
                                    this.renderDiff(this.state.targetData, true)
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