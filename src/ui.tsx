import * as React from 'react'
import * as ReactDOM from 'react-dom'
import './ui.scss'
import '../dist/ui.css'
import '../node_modules/figma-plugin-ds/dist/figma-plugin-ds.css';
import {IOverrideData} from './code'

declare function require(path: string): any

interface IProps {}

interface IState {
    headerContent?:any;
    diffContent?:any;
    currentTargetData?:IOverrideData;
}

interface IColor {
    r:number;
    g:number;
    b:number;
}

class App extends React.Component<IProps, IState> {
    state:IState = {
        diffContent: <div>{`Select one instance to compare to the master component. Select two items to compare against each other.`}</div>,
        headerContent: <div></div>,
        currentTargetData: null
    };

    componentDidMount = () => {
        window.addEventListener("message", (event) => {
            const message = event.data.pluginMessage;
            const payload = message.payload;
            console.log('message receieved at UI', message);
            switch (message.type) {
                case "inspected-data":
                    this.setState({
                        diffContent: this.renderNodeData(payload.target, true),
                        headerContent: this.renderHeader(payload.source, payload.target),
                        currentTargetData: payload.target
                    });
                    break;
                case "save-confirmation":
                    console.log("Save confirmation message received");
                    break;
            }
        });
        parent.postMessage({ pluginMessage: { type: 'inspect-selected' } }, '*');
    }

    RGBToHex = (color:IColor) => {
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

    renderRGBColor = (paint) => {
        let color:IColor;
        const isNone = paint.type === "NONE";
        if (isNone) {
            color = {r:1, g:1, b:1};
        } else {
            color = paint.color;
        }
        let converted:IColor = {
            r: Math.round(color.r * 255),
            g: Math.round(color.g * 255),
            b: Math.round(color.b * 255)
        }
        let toolTip:string;
        if (isNone) {
            toolTip = '(None)';
        } else {
            toolTip = this.RGBToHex(converted).toUpperCase();
        }
        let rgbString = `rgb(${converted.r}, ${converted.g}, ${converted.b})`
        let classes = isNone ? "rgbColor rgbColor--none" : "rgbColor";
        return (
            <span
                className={classes}
                style={{backgroundColor: rgbString}}
                data-content={toolTip}>
            </span>
        )
    }

    renderOverrideProp = (prop:any) => {
        const {key, from, to} = prop;
        switch (key) {
            case 'strokes':
            case 'fills':
            case 'backgrounds':
                return (
                    <span className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span>{this.renderRGBColor(from[0])}</span>
                        <span className="arrow">→</span>
                        <span>{this.renderRGBColor(to[0])}</span>
                    </span>
                )
            case "backgroundStyleId":
            case "fillStyleId":
            case "strokeStyleId":
                // Ignore these for output
                return false;
            case "masterComponent":
                return (
                    <span className="prop" key={key}>
                        <span className="key">Master:</span>
                        <span>{from.name}</span>
                        <span className="arrow">→</span>
                        <span>{to.name}</span>
                    </span>
                )
            default:
                return (
                    <span className="prop" key={key}>
                        <span className="key">{key}:</span>
                        <span>{from.toString()}</span>
                        <span className="arrow">→</span>
                        <span>{to.toString()}</span>
                    </span>
                )

        }
    }

    renderOverrideProps = (props:any[]) => {
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

    renderNodeIcon = (type:string) => {
        let iconText:string = "";
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
    renderNodeData = (nodeData:IOverrideData, isTop:boolean) => {
        // console.log("renderOverrideData", data, isTop);
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

    renderHeader(sourceData:IOverrideData, targetData:IOverrideData) {
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
        parent.postMessage({ pluginMessage: { type: 'inspect-selected' } }, '*')
    }

    onSave = () => {
        parent.postMessage({ pluginMessage: { 
            type: 'save-overrides',
            data: this.state.currentTargetData,
        }}, '*')
    }

    onApply = () => {
        parent.postMessage({ pluginMessage: { 
            type: 'apply-overrides'
        }}, '*')
    }

    render() {
        return (
            <div className="maximumOverride">
                <div className="buttons">
                    <button className="button button--secondary" id="inspect" onClick={this.onInspect}>Inspect selection</button>
                    <button className="button button--secondary" id="save" onClick={this.onSave}>Save overrides</button>
                    <button className="button button--secondary" id="apply" onClick={this.onApply}>Apply overrides</button>
                </div>
                <div className="header">
                    {this.state.headerContent}
                </div>
                <div className="diff">
                    <div className="nodes">
                        {this.state.diffContent}
                    </div>
                </div>
            </div>
        )
    }
}


ReactDOM.render(<App />, document.getElementById('react-page'))