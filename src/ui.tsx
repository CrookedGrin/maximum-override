import * as React from 'react'
import * as ReactDOM from 'react-dom'
import './ui.scss'
import '../dist/ui.css'
import '../node_modules/figma-plugin-ds/dist/figma-plugin-ds.css';
import * as MO from './code'
import { ISelectionValidation, SelectionValidation } from './util'

declare function require(path: string): any

interface IProps { }

interface IState {
    inspectEnabled: boolean;
    inspectMessage: string;
    copyEnabled: boolean;
    pasteEnabled: boolean;
    headerContent?: any;
    diffContent?: any;
    targetData?: MO.IOverrideData;
    sourceData?: MO.IOverrideData;
    copyButtonMessage: string;
}

interface IColor {
    r: number;
    g: number;
    b: number;
}

class App extends React.Component<IProps, IState> {
    state: IState = {
        diffContent: '',
        inspectMessage: '',
        headerContent: <div></div>,
        inspectEnabled: false,
        copyEnabled: false,
        pasteEnabled: false,
        targetData: undefined,
        copyButtonMessage: "Copy overrides",
    };

    componentDidMount = () => {
        window.addEventListener("message", (event) => {
            const message = event.data.pluginMessage;
            const payload = message.payload;
            // console.log('Message receieved at UI', message);
            switch (message.type) {
                case "selection-validation":
                    const validation: ISelectionValidation = message.validation;
                    let inspectMessage: string;
                    switch (validation.reason) {
                        case SelectionValidation.IS_INSTANCE:
                            inspectMessage = "Compare instance to master";
                            break;
                        case SelectionValidation.IS_TWO:
                            inspectMessage = "Compare selected items";
                            break;
                        default:
                            inspectMessage = "Select items to compare";
                            break;
                    }
                    this.setState({
                        inspectEnabled: validation.isValid,
                        inspectMessage
                    });
                    break;
                case "data-verified":
                    this.setState({ pasteEnabled: true });
                    break;
                case "inspected-data":
                    this.setState({
                        diffContent: this.renderNodeData(payload.target, true),
                        headerContent: this.renderHeader(payload.source, payload.target),
                        targetData: payload.target,
                        sourceData: payload.source,
                        copyEnabled: true,
                        copyButtonMessage: "Copy overrides",
                        inspectEnabled: false
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
        parent.postMessage({ pluginMessage: { type: 'initial-render' } }, '*');
    }

    RGBToHex = (color: IColor) => {
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
            toolTip = this.RGBToHex(converted).toUpperCase();
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
            case 'strokes':
            case 'fills':
            case 'backgrounds':
                return (
                    <span className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span>{this.renderRGBColor(sourceValue[0])}</span>
                        <span className="arrow">→</span>
                        <span>{this.renderRGBColor(targetValue[0])}</span>
                    </span>
                )
            case "masterComponent":
                return (
                    <span className="prop" key={key}>
                        <span className="key">Master:</span>
                        <span className="hasTooltip" data-tooltip={sourceValue.name}>
                            <span className="value">{sourceValue.name}</span>
                        </span>
                        <span className="arrow">→</span>
                        <span className="hasTooltip" data-tooltip={targetValue.name}>
                            <span className="value">{targetValue.name}</span>
                        </span>
                    </span>
                )
            case "name":
            case "characters":
                return (
                    <span className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span className="hasTooltip" data-tooltip={sourceValue.toString()}>
                            <span className="value">{sourceValue.toString()}</span>
                        </span>
                        <span className="arrow">→</span>
                        <span className="hasTooltip" data-tooltip={targetValue.toString()}>
                            <span className="value">{targetValue.toString()}</span>
                        </span>
                    </span>
                )
            default:
                return (
                    <span className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span className="value">{sourceValue.toString()}</span>
                        <span className="arrow">→</span>
                        <span className="value">{targetValue.toString()}</span>
                    </span>
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
        if (type === "TEXT") {
            iconText = "T";
        }
        if (type === "VECTOR") {
            iconType = "minus"
        }
        let iconClass = `icon icon--purple icon--${iconType}`;
        return <div className={iconClass}>{iconText}</div>
    }

    // Recursive
    renderNodeData = (nodeData: MO.IOverrideData, isTop: boolean) => {
        const classes = isTop ? "node node--top" : "node";
        return (
            <div className={classes} key={nodeData.id.toString()}>
                <span className="title">
                    {this.renderNodeIcon(nodeData.type)}
                    {nodeData.name}
                </span>
                {nodeData.overriddenProps && this.renderOverrideProps(nodeData.overriddenProps)}
                {nodeData.childData &&
                    nodeData.childData.map(child => {
                        return this.renderNodeData(child, false);
                    })
                }
            </div>
        )
    }

    renderHeader(sourceData: MO.IOverrideData, targetData: MO.IOverrideData) {
        return (
            <>
                <span>{this.renderNodeIcon(sourceData.type)}</span>
                <span className="compare-node">{sourceData.name}</span>
                <span className="arrow">→</span>
                <span>{this.renderNodeIcon(targetData.type)}</span>
                <span className="compare-node">{targetData.name}</span>
            </>
        )
    }

    onInspect = () => {
        parent.postMessage({
            pluginMessage: {
                type: 'inspect-selected'
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

    render() {
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
                    <div className="header">
                        {this.state.headerContent}
                    </div>
                    <div className="diff">
                        <div className="nodes">
                            {this.state.targetData === undefined &&
                                <div className="emptyState">
                                    <div className="logo" />
                                    <p>Select one <strong>component instance</strong> to compare it against its master component</p>
                                    <p className="centered"><strong>OR</strong></p>
                                    <p>Select <strong>two items</strong> of any type to compare them to each other.</p>
                                </div>
                            }
                            {this.state.diffContent}
                        </div>
                    </div>
                </div>
            </>
        )
    }
}


ReactDOM.render(<App />, document.getElementById('react-page'))