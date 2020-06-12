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
    RGBToHex
} from './util'

declare function require(path: string): any

interface IProps { }

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
    dataVerified: boolean;
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
        dataVerified: false,
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
                    switch (validation.reason) {
                        case SelectionValidation.IS_INSTANCE:
                            inspectMessage = "Compare instance to master";
                            canPaste = true;
                            break;
                        case SelectionValidation.IS_TWO:
                            inspectMessage = "Compare selected";
                            break;
                        case SelectionValidation.IS_NODE:
                            inspectMessage = "Select an instance";
                            canPaste = true;
                            break;
                        default:
                            inspectMessage = "Select items to compare";
                            break;
                    }
                    this.setState({
                        inspectEnabled: validation.isValid,
                        selectionValidation: validation,
                        pasteEnabled: canPaste && this.state.dataVerified,
                        inspectMessage,
                        totalNodeCount: validation.childCount
                    });
                    break;
                case "data-verified":
                    this.setState({
                        dataVerified: true
                    });
                    break;
                case "comparison-finished":
                    console.log('============== Received comparison-finished');
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
                    console.log("Copy confirmation message received");
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
                type: 'paste-overrides'
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

    renderRGBColor = (paint: any) => {
        let color: IColor;
        const isNone = paint === undefined;
        if (isNone) {
            color = { r: 1, g: 1, b: 1 };
        } else {
            color = paint.color;
        }
        let converted: IColor = {
            r: Math.round(color.r * 255),
            g: Math.round(color.g * 255),
            b: Math.round(color.b * 255)
        }
        let toolTip: string;
        if (isNone) {
            toolTip = '(None)';
        } else {
            toolTip = RGBToHex(converted).toUpperCase();
        }
        let rgbString = `rgb(${converted.r}, ${converted.g}, ${converted.b})`
        let classes = isNone ? "rgbColor rgbColor--none" : "rgbColor hasTooltip";
        return (
            <span
                className={classes}
                style={{ backgroundColor: rgbString }}
                data-tooltip={toolTip}>
            </span>
        )
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
                        <span>{this.renderRGBColor(sourceValue[0])}</span>
                        <span className="arrow">→</span>
                        <span>{this.renderRGBColor(targetValue[0])}</span>
                    </span>
                )
            case 'backgroundStyleId':
            case 'effectStyleId':
            case 'fillStyleId':
            case 'strokeStyleId':
                // Hide these in the UI
                return false;
            case "masterComponent":
                return (
                    <div className="prop" key={key}>
                        <span className="key">Master:</span>
                        <span className="hasTooltip" data-tooltip={sourceValue.name}>
                            <span className="value">{sourceValue.name}</span>
                        </span>
                        <span className="arrow">→</span>
                        <span className="hasTooltip" data-tooltip={targetValue.name}>
                            <span className="value">{targetValue.name}</span>
                        </span>
                    </div>
                )
            case "name":
            case "characters":
                return (
                    <div className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span className="hasTooltip" data-tooltip={sourceValue.toString()}>
                            <span className="value">{sourceValue.toString()}</span>
                        </span>
                        <span className="arrow">→</span>
                        <span className="hasTooltip" data-tooltip={targetValue.toString()}>
                            <span className="value">{targetValue.toString()}</span>
                        </span>
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
        console.log('toggle', nodeData);
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
                    {nodeData.name}
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
                                        <p>Select one <strong>component instance</strong> to compare it against its master component</p>
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