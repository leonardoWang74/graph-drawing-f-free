'use client'

import React, {JSX, useCallback, useEffect, useRef, useState} from "react";
import Graph, {GraphData, LineStyle, LineStyleDefault, weightToWidth} from "@/app/data/Graph";
import {Vertex} from "@/app/data/Vertex";
import Vector2 from "@/app/data/Vector2";

export interface SaveData {
    graphIdActive: number;
    graphIdForbidden: number;
    graphIdMax: number;
    graphs: GraphData[];
}

export interface GraphEditorProps {
    height: number;
    graph: Graph;
    saveData: SaveData;
    saveDataSave: () => void;
}

const vertexRadius = 18;
const buttonClass = "text-body bg-neutral-secondary-medium box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none rounded";

export default function GraphWindow() {
    const [_, updateSet] = useState<Date>();
    const [saveData, saveDataSet] = useState<SaveData>();
    const [graph, graphSet] = useState<Graph>();
    const [forbidden, forbiddenSet] = useState<Graph>();

    useEffect(() => {
        // load save data from local storage
        const saveString = localStorage.getItem('save-data');
        if (!saveString) {
            const s = {graphs: [], graphIdActive: 1, graphIdForbidden: 2, graphIdMax: 2};
            const graph = Graph.Graph();
            graph.id = 1;
            s.graphs.push(graph.saveToData());

            const forb = Graph.Graph();
            forb.id = 2;
            s.graphs.push(forb.saveToData());

            saveDataSet(s);
            graphSet(graph);
            forbiddenSet(forb);
            saveDataSave();
            return;
        }

        // parse save data
        const saveData = JSON.parse(saveString) as SaveData;
        if(!saveData.graphIdForbidden) saveData.graphIdForbidden = 2;

        // look for the active graph
        let graph: Graph | undefined = undefined;
        for (const g of saveData.graphs) {
            if (g.id !== saveData.graphIdActive) continue;
            graph = Graph.loadFromData(g);
            break;
        }

        // look for the forbidden graph
        let forbidden: Graph | undefined = undefined;
        for (const g of saveData.graphs) {
            if (g.id !== saveData.graphIdForbidden) continue;
            forbidden = Graph.loadFromData(g);
            break;
        }
        if(!forbidden) {
            forbidden = Graph.Graph();
            forbidden.id = saveData.graphIdForbidden ?? 2;
            saveData.graphs.push(forbidden.saveToData());
        }

        console.log('loaded', saveData)
        graphSet(graph);
        forbiddenSet(forbidden);
        saveDataSet(saveData);
    }, []);

    const saveDataSave = useCallback(() => {
        if(!graph || !forbidden || !saveData) return;

        // look for the active graph
        for (let i= 0; i<saveData.graphs.length; ++i) {
            const g = saveData.graphs[i];
            if(g.id !== graph.id) continue;
            saveData.graphs[i] = graph.saveToData();
            break;
        }

        // look for the forbidden graph
        for (let i= 0; i<saveData.graphs.length; ++i) {
            const g = saveData.graphs[i];
            if(g.id !== forbidden.id) continue;
            saveData.graphs[i] = forbidden.saveToData();
            break;
        }
        console.log('saved', saveData);

        // save to localStorage
        localStorage.setItem('save-data', JSON.stringify(saveData));
    }, [saveData, graph]);

    const getForbiddenSubgraphs = useCallback(() => {
        if(!graph || !forbidden) return;
        const components = forbidden.getSubgraphWithoutDisabled().getComponents();
        console.log('forbidden subgraphs:', components);

        // find induced forbidden subgraphs
        const inducedForbidden: Graph[] = [];
        for(const forbidden of components) {
            inducedForbidden.push(...graph.inducedSubgraphs(forbidden));
        }
        console.log('inducedForbidden', inducedForbidden);
        console.log('################################################');
        console.log('################################################');

        // change "red" colors in the graph to black
        for(const map of graph.edgeStyle.values()) {
            for(const style of map.values()) {
                if(style.color === 'red') style.color = 'black';
            }
        }

        // mark the induced forbidden subgraphs with red edges
        for(const subgraph of inducedForbidden) {
            for(const v of subgraph.vertices.values()) {
                for(const v2 of v.neighbors) {
                    if(!graph.edgeStyle.has(v.id)) graph.edgeStyle.set(v.id, new Map<number, LineStyle>());
                    const currentStyle = graph.edgeStyle.get(v.id)?.get(v2) ?? LineStyleDefault();
                    currentStyle.color = 'red';
                    graph.edgeStyle.get(v.id)?.set(v2, currentStyle);
                }
            }
        }

        updateSet(new Date());
    }, [forbidden, updateSet]);

    return (
        <div className="flex flex-col h-screen">
            {graph && saveData &&
                <GraphEditor height={66} graph={graph} saveData={saveData} saveDataSave={saveDataSave}/>}
            {forbidden && saveData &&
                <GraphEditor height={34} graph={forbidden} saveData={saveData} saveDataSave={saveDataSave}/>}

            <div className="flex gap-2 p-2 border-b border-transparent">
                <button type="button" className={buttonClass}
                        onClick={getForbiddenSubgraphs}>Check
                </button>
            </div>
        </div>
    );
}

interface PanningData {
    mouseStart: Vector2;
    panStart: Vector2;
}

interface BoxSelectionData {
    activeVertices: number[];
    from: Vector2;
    to: Vector2;
}

export function GraphEditor({height, graph, saveDataSave}: GraphEditorProps) {
    const [_, updateSet] = useState<Date>();

    const svgRef = useRef<SVGSVGElement | null>(null);

    const [pan, panSet] = useState<Vector2>(new Vector2(0, 0));
    const [zoom, zoomSet] = useState(1);
    const [panning, panningSet] = useState<PanningData>();
    const [lastMouse, lastMouseSet] = useState<Vector2>(new Vector2(0,0));

    const [activeVertices, activeVerticesSet] = useState<number[]>([]);

    // const [activeVertex, setActiveVertex] = useState<number>();
    const [activeEdge, activeEdgeSet] = useState<Vector2>();
    const [dragVertex, dragVertexSet] = useState<number>();

    const [boxSelect, boxSelectSet] = useState<BoxSelectionData>();

    /** =========================
     * Utilities
     * ========================= */
    const screenToWorldCalculation = useCallback((pan: Vector2, zoom: number, pos: Vector2) => {
        return new Vector2((pos.x - pan.x) / zoom, (pos.y - pan.y) / zoom);
    },[]);

    const screenToWorld = useCallback((pos: Vector2) => {
        return screenToWorldCalculation(pan, zoom, pos);
    },[pan, zoom, screenToWorldCalculation]);

    const getMousePositionScreen = useCallback((e: React.MouseEvent) => {
        const rect = svgRef.current!.getBoundingClientRect();
        return new Vector2(e.clientX - rect.left, e.clientY - rect.top);
    },[svgRef]);

    const getMousePositionWorld = useCallback((e: React.MouseEvent) => {
        const screenPos = getMousePositionScreen(e);
        return screenToWorld(screenPos);
    },[screenToWorld, getMousePositionScreen]);

    /** =========================
     * Canvas interactions
     * ========================= */
    const onMouseDownCanvas = useCallback((e: React.MouseEvent) => {
        // left click on canvas = box select / deselect
        if (e.button === 0) {
            // no shift key: clear selection
            let activeVerticesStart = [...activeVertices];
            if(!e.shiftKey) {
                activeVerticesStart = [];
                activeVerticesSet([]);
                activeEdgeSet(null);
            }

            const screenPos = getMousePositionScreen(e);
            boxSelectSet({activeVertices: activeVerticesStart, from: screenPos, to: screenPos});
            return;
        }
        // middle click = pan
        else if (e.button === 1) {
            panningSet({panStart: pan, mouseStart: new Vector2(e.clientX, e.clientY)});
        }
    }, [pan, getMousePositionScreen, activeVertices]);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!graph) return;

        // pan view
        if (panning) {
            panSet(new Vector2(
                panning.panStart.x + e.clientX - panning.mouseStart.x,
                panning.panStart.y + e.clientY - panning.mouseStart.y
            ));
        }

        // box select: move end point
        if (boxSelect) {
            boxSelect.to = getMousePositionScreen(e);

            const worldFromUnsorted = screenToWorld(boxSelect.from);
            const worldToUnsorted = screenToWorld(boxSelect.to);

            const slack = vertexRadius * 0.6;
            const worldFrom = new Vector2(
                Math.min(worldFromUnsorted.x, worldToUnsorted.x) - slack,
                Math.min(worldFromUnsorted.y, worldToUnsorted.y) - slack
            );
            const worldTo = new Vector2(
                Math.max(worldFromUnsorted.x, worldToUnsorted.x) + slack,
                Math.max(worldFromUnsorted.y, worldToUnsorted.y) + slack
            );

            const active = [...boxSelect.activeVertices];
            for(const vertex of graph.vertices.values()) {
                if(active.includes(vertex.id)) continue;

                // check bounding box
                if(
                    worldFrom.x <= vertex.position.x && vertex.position.x <= worldTo.x
                    && worldFrom.y <= vertex.position.y && vertex.position.y <= worldTo.y
                ) {
                    active.push(vertex.id);
                }
            }
            activeVerticesSet(active);
        }

        // move active vertex
        if (dragVertex) {
            const pos = getMousePositionWorld(e);
            const v = graph.vertexGet(dragVertex);
            if (v) {
                // move other selected vertices relative to v's current position
                for(const vId of activeVertices) {
                    const vertex = graph.vertexGet(vId);
                    if(!vertex || vertex.id === v.id) continue;
                    vertex.position = new Vector2(pos.x + vertex.position.x - v.position.x, pos.y + vertex.position.y - v.position.y);
                }

                v.position = new Vector2(pos.x, pos.y);
                updateSet(new Date());
            }
        }

        lastMouseSet( new Vector2(e.clientX, e.clientY));
    }, [panning, lastMouse, dragVertex, graph, getMousePositionScreen, getMousePositionWorld, activeVertices, boxSelect]);

    const onMouseUp = useCallback((_: React.MouseEvent) => {
        if (!graph) return;

        if(!panning && !boxSelect) saveDataSave();

        panningSet(undefined);
        boxSelectSet(undefined);
        dragVertexSet(null);
    }, [graph, screenToWorld, saveDataSave, panning, boxSelect]);

    const onDoubleClick = useCallback((e: React.MouseEvent) => {
        if (!graph || activeVertices.length>0 || activeEdge) return;

        const pos = getMousePositionWorld(e);
        const v = Vertex.Vertex(pos);
        graph.vertexAdd(v);

        updateSet(new Date());
        saveDataSave();
    }, [getMousePositionWorld, graph, updateSet, saveDataSave, activeVertices]);


    /** =========================
     * Zoom
     * ========================= */
    const zoomChange = useCallback((e: React.MouseEvent|undefined, zoomNow: number, zoomIn: boolean) => {
        // different deltas depending on the current zoom
        let delta = 0.25;
        if(zoomNow <= 0.51 && !zoomIn) {
            delta = 0.05;
        }
        else if(zoomNow < 0.49) {
            delta = 0.05;
        }
        const zoomNew = Math.min(2, Math.max(0.05, zoomNow + delta * (zoomIn?1:-1)));

        // change pan so that mouse / screen center stays at the same world position
        const rect = svgRef.current!.getBoundingClientRect();
        const screenX = e ? e.clientX - rect.left : rect.width / 2;
        const screenY = e ? e.clientY - rect.top : rect.height / 2;

        // screenToWorldCalculation(pan, zoom, x, y) = new Vector2((x - pan.x) / zoom, (y - pan.y) / zoom);
        const screenCenterNow = screenToWorldCalculation(pan, zoomNow, new Vector2(screenX, screenY));

        // screenCenterNew = screenToWorldCalculation(panNew, zoomNew, x,y) = new Vector2((x - panNew.x) / zoomNew, (y - panNew.y) / zoomNew);
        // solving for panNew.x: (x - panNew.x) / zoomNew = screenCenterNow.x
        // solving for panNew.x: panNew.x = x - screenCenterNow * zoomNew
        panSet(new Vector2(screenX - screenCenterNow.x * zoomNew, screenY - screenCenterNow.y * zoomNew));

        // return the new zoom for setter
        return zoomNew;
    }, [svgRef, screenToWorldCalculation, pan]);

    const onWheel = useCallback((e: React.WheelEvent) => {
        zoomSet(zoomNow => zoomChange(e, zoomNow, e.deltaY < 0));
    }, [zoomChange]);

    /** =========================
     * Keyboard
     * ========================= */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!graph) return;

            // delete currently selected vertices / edges
            if (e.key === "Delete" || e.key === "x") {
                if (activeVertices.length>0) {
                    for(const vId of activeVertices) {
                        const v = graph.vertexGet(vId);
                        if (v) graph.vertexRemove(v);
                    }
                    activeVerticesSet([]);
                }
                if (activeEdge) {
                    const va = graph.vertexGet(activeEdge.x);
                    const vb = graph.vertexGet(activeEdge.y);
                    if (va && vb) graph.edgeRemove(va, vb);
                    activeEdgeSet(null);
                }
            }
            // "e": toggle edges in selection
            else if (e.key === "e") {
                for(const fromId of activeVertices) {
                    const from = graph.vertexGet(fromId);
                    if(!from) continue;

                    for(const toId of activeVertices) {
                        if(fromId >= toId) continue;
                        const to = graph.vertexGet(toId);
                        if(!to) continue;

                        if(graph.edgeHas(from, to)) graph.edgeRemove(from, to);
                        else graph.edgeAdd(from, to);
                    }
                }
                updateSet(new Date());
            }
            // "f": add edges in selection
            else if (e.key === "f") {
                for(const fromId of activeVertices) {
                    const from = graph.vertexGet(fromId);
                    if(!from) continue;

                    for(const toId of activeVertices) {
                        if(fromId >= toId) continue;
                        const to = graph.vertexGet(toId);
                        if(!to) continue;

                        if(!graph.edgeHas(from, to)) graph.edgeAdd(from, to);
                    }
                }
                updateSet(new Date());
            }
            // "d": disable selection
            else if (e.key === "d") {
                for(const vId of activeVertices) {
                    const vertex = graph.vertexGet(vId);
                    if(!vertex) continue;
                    vertex.disabled = !vertex.disabled;
                }
                updateSet(new Date());
            }

            saveDataSave();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [activeVertices, activeEdge, graph, saveDataSave]);

    /** =========================
     * Rendering helpers
     * ========================= */

    const renderEdges = useCallback(() => {
        if (!graph) return;

        const lines: JSX.Element[] = [];

        for (const v of graph.vertices.values()) {
            for (const nId of v.neighbors) {
                if(v.id >= nId) continue;
                const key = v.id+"-"+nId;

                const n = graph.vertexGet(nId);
                if(!n) continue;

                const active = activeEdge && (
                    (v.id === activeEdge.x && nId === activeEdge.y)
                    || (v.id === activeEdge.y && nId === activeEdge.x)
                );
                const lineStyle = graph.edgeStyle.get(v.id)?.get(nId) ?? LineStyleDefault();
                lines.push(
                    <line
                        key={key+"-bg"}
                        x1={v.position.x}
                        y1={v.position.y}
                        x2={n.position.x}
                        y2={n.position.y}
                        stroke={active ? 'orange' : '#ffffff09'}
                        strokeWidth={(active ? 6 : 16) + weightToWidth[lineStyle.weight]}
                        strokeDasharray={lineStyle.type === "dashed" ? "6,4" : lineStyle.type === "dotted" ? "2,4" : undefined}
                        onClick={e => {
                            if (e.button !== 0) return;
                            activeEdgeSet(new Vector2(v.id, nId));
                            activeVerticesSet([]);
                            e.stopPropagation();
                        }}
                    />
                );
                lines.push(
                    <line
                        key={key}
                        x1={v.position.x}
                        y1={v.position.y}
                        x2={n.position.x}
                        y2={n.position.y}
                        stroke={lineStyle.color}
                        strokeWidth={weightToWidth[lineStyle.weight]}
                        strokeDasharray={lineStyle.type === "dashed" ? "6,4" : lineStyle.type === "dotted" ? "2,4" : undefined}
                        onClick={e => {
                            if (e.button !== 0) return;
                            activeEdgeSet(new Vector2(v.id, nId));
                            activeVerticesSet([]);
                            e.stopPropagation();
                        }}
                    />
                );
            }
        }
        return lines;
    }, [graph, activeEdge]);

    const renderVertices = useCallback(() => {
        if (!graph) return;

        const nodes: JSX.Element[] = [];
        for (const v of graph.vertices.values()) {
            const active = activeVertices.includes(v.id);
            const lineStyle = v.lineStyle ?? LineStyleDefault();
            nodes.push(
                <g key={v.id}
                   onMouseDown={e => {
                       if (e.button !== 0) return;

                       if(e.shiftKey) {
                           if(!active) activeVerticesSet(cv => [v.id, ...cv]);
                           else {
                               activeVerticesSet(cv => {
                                   const copy = [...cv];
                                   const index = copy.indexOf(v.id);
                                   if(index>=0) {
                                       copy.splice(index, 1);
                                   }
                                   return copy
                               });
                           }
                       }
                       else {
                           if(!active) activeVerticesSet([v.id]);
                       }

                       activeEdgeSet(null);
                       dragVertexSet(v.id);

                       e.stopPropagation();
                       e.preventDefault();
                   }}
                >
                    <circle
                        cx={v.position.x}
                        cy={v.position.y}
                        r={vertexRadius}
                        fill={v.color}
                        stroke={active ? 'orange' : v.lineStyle.color}
                        strokeWidth={weightToWidth[lineStyle.weight]}
                        strokeDasharray={v.disabled || lineStyle.type === "dashed" ? "6,4" : lineStyle.type === "dotted" ? "2,4" : undefined}
                    />
                    <text
                        className="select-none"
                        x={v.position.x}
                        y={v.position.y}
                        fontSize={14}
                        textAnchor="middle"
                        dominantBaseline="middle"
                    >
                        {v.label ? `${v.id}:${v.label}` : v.id}
                    </text>
                </g>
            );
        }
        return nodes;
    }, [graph, activeVertices]);

    /** =========================
     * UI
     * ========================= */

    return (
        <div className="flex flex-col border-t" style={{height: height+"vh"}}>
            <div className="flex gap-2 p-2 border-b border-transparent">
                <button type="button" className={buttonClass}
                        onClick={() => zoomSet(z => zoomChange(undefined, z, false))}>-
                </button>
                <button type="button" className={buttonClass}
                        onClick={() => zoomSet(1)}>{Math.round(zoom * 100)}%
                </button>
                <button type="button" className={buttonClass}
                        onClick={() => zoomSet(z => zoomChange(undefined, z, true))}>+
                </button>
                <button type="button" className={buttonClass}
                        onClick={() => panSet(new Vector2(0,0))}>Reset Pan
                </button>

                <span className="text-xs">Last save: {graph?.savedLast.replace('T', ' ')}</span>

                {/*<button onClick={() => setEdgeStyle(s => ({ ...s, style: "solid" }))}>Solid</button>
          <button onClick={() => setEdgeStyle(s => ({ ...s, style: "dashed" }))}>Dashed</button>
          <button onClick={() => setEdgeStyle(s => ({ ...s, style: "dotted" }))}>Dotted</button>
          <button onClick={() => setEdgeStyle(s => ({ ...s, weight: "thin" }))}>Thin</button>
          <button onClick={() => setEdgeStyle(s => ({ ...s, weight: "normal" }))}>Normal</button>
          <button onClick={() => setEdgeStyle(s => ({ ...s, weight: "heavy" }))}>Heavy</button>
          <button onClick={() => setEdgeStyle(s => ({ ...s, weight: "fat" }))}>Fat</button>*/}
            </div>

            <svg
                ref={svgRef}
                className="flex-1 bg-gray-50"
                onMouseDown={onMouseDownCanvas}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onDoubleClick={onDoubleClick}
                onWheel={onWheel}
            >
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {renderEdges()}
                    {renderVertices()}
                </g>

                {/* mouse position */ <text
                    x={10}
                    y="100%"
                    dy={-10}
                    fontSize={12}
                    fill="#333"
                    pointerEvents="none"
                >
                    {`${screenToWorld(lastMouse).toStringFraction(0)}`}
                </text>}

                {/* box select */ boxSelect && <rect
                    x={Math.min(boxSelect.from.x, boxSelect.to.x)}
                    y={Math.min(boxSelect.from.y, boxSelect.to.y)}
                    width={Math.abs(boxSelect.to.x - boxSelect.from.x)}
                    height={Math.abs(boxSelect.to.y - boxSelect.from.y)}
                    fill="transparent"
                    stroke="#555"
                    strokeWidth={1}
                    strokeDasharray="6,4"
                    pointerEvents="none"
                />}
            </svg>
        </div>
    );
}
