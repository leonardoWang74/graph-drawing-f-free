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

const buttonClass = "text-body bg-neutral-secondary-medium box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none";

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
        const components = forbidden.getComponents();
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

interface BoxSelectionData {
    active: boolean;
    from: Vector2;
    to: Vector2;
}

export function GraphEditor({height, graph, saveDataSave}: GraphEditorProps) {
    const [_, updateSet] = useState<Date>();

    const svgRef = useRef<SVGSVGElement | null>(null);

    const [pan, setPan] = useState<Vector2>(new Vector2(0, 0));
    const [zoom, setZoom] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [lastMouse, setLastMouse] = useState<Vector2>();

    const [activeVertices, activeVerticesSet] = useState<number[]>([]);

    // const [activeVertex, setActiveVertex] = useState<number>();
    const [activeEdge, setActiveEdge] = useState<Vector2>();
    const [dragVertex, setDragVertex] = useState<number>();
    const [edgeDragFrom, setEdgeDragFrom] = useState<number>()

    const [boxSelect, boxSelectSet] = useState<BoxSelectionData>({active: false, from: new Vector2(0,0), to: new Vector2(0,0)})

    /** =========================
     * Utilities
     * ========================= */
    const screenToWorld = useCallback(
        (x: number, y: number) => ({
            x: (x - pan.x) / zoom,
            y: (y - pan.y) / zoom,
        }),
        [pan, zoom]
    );


    const getMouse = useCallback(
        (evt: React.MouseEvent) => {
            const rect = svgRef.current!.getBoundingClientRect();
            return screenToWorld(evt.clientX - rect.left, evt.clientY - rect.top);
        },
        [screenToWorld]
    );

    /** =========================
     * Canvas interactions
     * ========================= */
    const onMouseDownCanvas = useCallback((e: React.MouseEvent) => {
        // left click on canvas = box select / deselect
        if (e.button === 0) {
            activeVerticesSet([]);
            setActiveEdge(null);
            return;
        }
        // middle click = pan
        else if (e.button === 1) {
            setIsPanning(true);
            setLastMouse({x: e.clientX, y: e.clientY});
        }
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!graph) return;

        // pan view
        if (isPanning && lastMouse) {
            const dx = e.clientX - lastMouse.x;
            const dy = e.clientY - lastMouse.y;

            setPan(p => ({x: p.x + dx, y: p.y + dy}));
            setLastMouse({x: e.clientX, y: e.clientY});
            return;
        }

        // move active vertex
        if (dragVertex) {
            const pos = getMouse(e);
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
    }, [isPanning, lastMouse, dragVertex, graph, getMouse, activeVertices]);

    const onMouseUp = useCallback((e: React.MouseEvent) => {
        if (!graph) return;

        setIsPanning(false);
        setLastMouse(null);

        if (edgeDragFrom) {
            const vertexFrom = graph.vertexGet(edgeDragFrom);
            if(vertexFrom) {
                const pos = getMouse(e);
                for (const v of graph.vertices.values()) {
                    const dx = v.position.x - pos.x;
                    const dy = v.position.y - pos.y;
                    if (Math.hypot(dx, dy) < 12 && v.id !== edgeDragFrom) {
                        if(!vertexFrom.edgeHas(v)) graph.edgeAdd(vertexFrom, v);
                        else graph.edgeRemove(vertexFrom, v);
                    }
                }
            }
        }

        if(!isPanning) saveDataSave();

        setEdgeDragFrom(null);
        setDragVertex(null);
    }, [edgeDragFrom, graph, getMouse, saveDataSave, isPanning]);

    const onDoubleClick = useCallback((e: React.MouseEvent) => {
        if (!graph || activeVertices.length>0) return;

        const pos = getMouse(e);
        const v = Vertex.Vertex(pos);
        graph.vertexAdd(v);

        updateSet(new Date());
        saveDataSave();
    }, [getMouse, graph, updateSet, saveDataSave, activeVertices]);


    /** =========================
     * Zoom
     * ========================= */
    const onWheel = useCallback((e: React.WheelEvent) => {
        if (!svgRef.current) return;

        const rect = svgRef.current!.getBoundingClientRect();
        const mouseX = 0; // e.clientX - rect.left;
        const mouseY = 0; // e.clientY - rect.top;
        const factor = 0.3;

        setZoom(oldZoom => {
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.min(2, Math.max(0.25, oldZoom * zoomFactor));

            // world position under mouse before zoom
            /*const worldX = (mouseX - pan.x) / oldZoom;
            const worldY = (mouseY - pan.y) / oldZoom;

            // adjust pan so the world point stays under the mouse
            setPan({
                x: mouseX - worldX * newZoom,
                y: mouseY - worldY * newZoom,
            });*/

            return newZoom;
        });
        // setZoom(z => Math.min(4, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    }, [pan]);

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
                    setActiveEdge(null);
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
                            setActiveEdge(new Vector2(v.id, nId));
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
                            setActiveEdge(new Vector2(v.id, nId));
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

                       setActiveEdge(null);
                       setDragVertex(v.id);

                       e.stopPropagation();
                       e.preventDefault();
                   }}
                >
                    <circle
                        cx={v.position.x}
                        cy={v.position.y}
                        r={16}
                        fill={v.color}
                        stroke={active ? 'orange' : v.lineStyle.color}
                        strokeWidth={weightToWidth[lineStyle.weight]}
                        strokeDasharray={lineStyle.type === "dashed" ? "6,4" : lineStyle.type === "dotted" ? "2,4" : undefined}
                    />
                    <text
                        className="select-none"
                        x={v.position.x - 4}
                        y={v.position.y + 4}
                        fontSize={14}
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
                        onClick={() => setZoom(Math.max(0.25, zoom / 1.2))}>-
                </button>
                <button type="button" className={buttonClass}
                        onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%
                </button>
                <button type="button" className={buttonClass}
                        onClick={() => setZoom(Math.min(2, zoom * 1.2))}>+
                </button>
                <button type="button" className={buttonClass}
                        onClick={() => setPan({x: 0, y: 0})}>Reset Pan
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
            </svg>
        </div>
    );
}
