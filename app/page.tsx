'use client'

import React, {JSX, useCallback, useEffect, useRef, useState} from "react";
import Graph, {GraphData, LineStyle, LineStyleClone, LineStyleDefault, VertexStyleDefault} from "@/app/data/Graph";
import {Vertex, VertexStyle, VertexStyleClone} from "@/app/data/Vertex";
import Vector2 from "@/app/data/Vector2";
import {DateToLocalWithTime} from "@/app/util/DateUtils";
import {ArrayContainsAll, ArrayEquals} from "@/app/util/ArrayUtils";
import {ColorHexSetTransparency} from "@/app/util/ColorUtils";
import {HexColorPicker} from "react-colorful";
import useClickOutside from "@/app/hooks/useClickOutside";
import {PromiseWait} from "@/app/util/PromiseUtils";
import {EventKeyboardCanFire} from "@/app/util/EventUtils";

import {LatexTypeset, ViewBoxGet} from "@/app/util/LatexUtils";

export interface SaveData {
    graphIdActive: number;
    graphIdForbidden: number;
    graphIdMax: number;
    graphs: GraphData[];
}

export type WindowType = "main" | "forbidden";

export interface GraphEditorProps {
    windowType: WindowType;
    height: number;
    graph: Graph;
    saveData: SaveData;
    saveDataSave: () => void;

    update?: Date;
    updateSet: (d: Date) => void;

    setGraphActive: (g: Graph) => void;
}

const buttonClass = "text-body bg-neutral-secondary-medium box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-sm px-3 py-1.5 focus:outline-none rounded";

export default function GraphWindow() {
    const [update, updateSet] = useState<Date>();
    const [saveData, saveDataSet] = useState<SaveData>();
    const [graph, graphSet] = useState<Graph>();
    const [forbidden, forbiddenSet] = useState<Graph>();

    // load save data from local storage
    useEffect(() => {
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
        if (!saveData.graphIdForbidden) saveData.graphIdForbidden = 2;

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
        if (!forbidden) {
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
        if (!graph || !forbidden || !saveData) return;

        // look for the active graph
        for (let i = 0; i < saveData.graphs.length; ++i) {
            const g = saveData.graphs[i];
            if (g.id !== graph.id) continue;
            saveData.graphs[i] = graph.saveToData();
            break;
        }

        // look for the forbidden graph
        for (let i = 0; i < saveData.graphs.length; ++i) {
            const g = saveData.graphs[i];
            if (g.id !== forbidden.id) continue;
            saveData.graphs[i] = forbidden.saveToData();
            break;
        }
        console.log('saved', saveData);

        // save to localStorage
        localStorage.setItem('save-data', JSON.stringify(saveData));
    }, [saveData, graph]);

    const setGraphActive = useCallback((g: Graph) => {
        if (!saveData) return;

        // set graphs as not active
        if (graph) graph.active = false;
        if (forbidden) forbidden.active = false;

        // set graph as active
        g.active = true;
    }, [saveData, graph, forbidden]);

    const getForbiddenSubgraphs = useCallback(() => {
        if (!graph || !forbidden) return;
        const components = forbidden.getSubgraphWithoutDisabled().getComponents();
        console.log('forbidden subgraphs:', components);

        let activeGraph = graph;
        if (graph.activeVertices.length > 0) activeGraph = graph.getSubgraph(graph.activeVertices);

        // find induced forbidden subgraphs
        const timeStartLook = new Date();
        Graph.timeCheckingEdges = 0;
        Graph.timeGettingSubgraphSearch = 0;
        Graph.timeGettingSubgraphCheck = 0;
        const inducedForbidden: number[][] = [];
        for (const forbidden of components) {
            inducedForbidden.push(...activeGraph.inducedSubgraphs(forbidden));
            console.log('inducedForbidden:', inducedForbidden.length, ' in miliseconds: ', new Date()-timeStartLook);
        }
        graph.forbiddenInduced = inducedForbidden;
        ++graph.forbiddenVersion;
        console.log('found inducedForbidden:', inducedForbidden.length, ' in miliseconds: ', new Date()-timeStartLook + "\n",
            `Graph.timeCheckingEdges: ${Graph.timeCheckingEdges} ms\n`,
            `Graph.timeGettingSubgraphSearch: ${Graph.timeGettingSubgraphSearch} ms\n`,
            `Graph.timeGettingSubgraphCheck: ${Graph.timeGettingSubgraphCheck} ms\n`,
        );
        console.log('################################################');

        // mark the induced forbidden subgraphs with red edges
        graph.edgesForbidden.clear();
        for (const subgraph of inducedForbidden) {
            for (const vId of subgraph) {
                const v = graph.vertexGet(vId);
                if(!v) continue;
                ++v.version;
                for (const v2 of v.neighbors) {
                    if(!subgraph.includes(v2)) continue;

                    if (!graph.edgesForbidden.has(v.id)) graph.edgesForbidden.set(v.id, new Set<number>());
                    graph.edgesForbidden.get(v.id)?.add(v2);
                }
            }
        }

        updateSet(new Date());
    }, [forbidden, updateSet]);

    // keyboard, prevent Ctrl+mouse wheel zoom
    useEffect(() => {
        const onWheelPrevent = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (!graph || !graph.active) return;
            // console.log(e.key, e.ctrlKey, e.shiftKey)

            // find forbidden subgraphs
            if (e.key === "f") {
                if(!EventKeyboardCanFire(e)) return;
                if (!e.shiftKey && !e.ctrlKey) getForbiddenSubgraphs();
            }
            // prevent window closing
            else if (e.key === "w" || e.key === "W") {
                if(e.ctrlKey) e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKey, {passive: false});
        document.addEventListener("wheel", onWheelPrevent, {passive: false});
        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("wheel", onWheelPrevent);
        }
    }, [getForbiddenSubgraphs]);

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            <div className="flex gap-2 p-2 border-b border-r ml-3">
                <button className="tooltip" onClick={getForbiddenSubgraphs}>
                    <kbd>F</kbd>
                    <div className="tooltiptext" style={{zIndex: 99999, width: "300px"}}>
                        <kbd>F</kbd> Find induced forbidden subgraphs in the selection.
                        <br/><br/>
                        The left (big) window is the main window containing the graph.
                        The right (smaller) window contains the forbidden subgraphs - every component is
                        one forbidden subgraph.
                    </div>
                </button>
                <button className="tooltip" onClick={getForbiddenSubgraphs}>
                    <kbd>C</kbd>
                    <div className="tooltiptext" style={{zIndex: 99999, width: "300px"}}>
                        <kbd>F</kbd> Find maximal cliques in the selection using Bron-Kerbosch adapted by [Eppstein et al 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time].
                    </div>
                </button>
            </div>
            <div className="flex flex-row h-screen">
                {graph && saveData &&
                    <GraphEditor windowType="main" height={75} graph={graph} saveData={saveData}
                                 saveDataSave={saveDataSave}
                                 update={update} updateSet={updateSet} setGraphActive={setGraphActive}/>}
                {forbidden && saveData &&
                    <GraphEditor windowType="forbidden" height={25} graph={forbidden} saveData={saveData}
                                 saveDataSave={saveDataSave}
                                 update={update} updateSet={updateSet} setGraphActive={setGraphActive}/>}

            </div>
        </div>
    );
}

interface PanningData {
    mouseStart: Vector2;
    panStart: Vector2;
}

interface BoxSelectionData {
    shift: boolean;
    ctrl: boolean;
    activeVertices: number[];
    from: Vector2;
    to: Vector2;
}

interface ClipboardData {
    graph: Graph;
    mouseWorld: Vector2;
}

interface PointerData {
    screen: Vector2;
}

interface ViewData {
    zoom: number;
    pan: Vector2;
    gridSize: number;
}

interface VertexDragData {
    mouseStartOffset?: Vector2;
    vertex: number;
    ctrlKey: boolean;
}

interface PropertyData {
    /** also includes a line style for edges */
    vertexStyle: VertexStyle;
}

export function GraphEditor({
                                windowType,
                                height,
                                graph,
                                saveDataSave,
                                update,
                                updateSet,
                                setGraphActive
                            }: GraphEditorProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const worldRef = useRef<SVGGElement | null>(null);

    const [properties, propertiesSet] = useState<PropertyData>({vertexStyle: VertexStyleDefault()});

    const [view, viewSet] = useState<ViewData>({zoom: 1, pan: new Vector2(0, 0), gridSize: 1});
    const [panning, panningSet] = useState<PanningData>();
    const [mouseLast, mouseLastSet] = useState<PointerData>({screen: new Vector2(0, 0)});

    // const [activeVertices, activeVerticesSet] = useState<number[]>([]);
    const [dragVertex, dragVertexSet] = useState<VertexDragData>();

    const [boxSelect, boxSelectSet] = useState<BoxSelectionData>();

    const [clipboard, clipboardSet] = useState<ClipboardData>();

    const [showOverlappingForbidden, showOverlappingForbiddenSet] = useState(true);
    const [overlappingData, _] = useState<{
        activeVertices: number[],
        forbidden: number[][],
        forbiddenNot: number[][],
        forbiddenVersion: number,
        cliques: Set<number>[],
        cliquesNot: Set<number>[],
        cliquesVersion: number,
    }>({
        activeVertices: [],
        forbidden: [],
        forbiddenNot: [],
        forbiddenVersion: 0,
        cliques: [],
        cliquesNot: [],
        cliquesVersion: 0,
    });

    /** =========================
     * Utilities
     * ========================= */
    const screenToWorldCalculation = useCallback((pan: Vector2, zoom: number, pos: Vector2) => {
        return new Vector2((pos.x - pan.x) / zoom, (pos.y - pan.y) / zoom);
    }, []);

    const screenToWorld = useCallback((pos: Vector2) => {
        return screenToWorldCalculation(view.pan, view.zoom, pos);
    }, [view, screenToWorldCalculation]);

    const getMousePositionScreen = useCallback((e: React.MouseEvent) => {
        const rect = svgRef.current!.getBoundingClientRect();
        return new Vector2(e.clientX - rect.left, e.clientY - rect.top);
    }, [svgRef]);

    const getMousePositionWorld = useCallback((e: React.MouseEvent) => {
        const screenPos = getMousePositionScreen(e);
        return screenToWorld(screenPos);
    }, [screenToWorld, getMousePositionScreen]);

    ///////////////////////////////////////////////////
    // region keyboard
    const keyboardDeleteSelection = useCallback((graph: Graph) => {
        if (graph.activeVertices.length > 0) {
            for (const vId of graph.activeVertices) {
                const v = graph.vertexGet(vId);
                if (!v) continue;
                graph.vertexRemove(v);
                ++v.version;
            }
            graph.activeVertices = [];
            updateSet(new Date());
        }
    }, []);

    const exportSelection = useCallback((svg: SVGSVGElement, graph: Graph, selectedVertices: number[]) => {
        if (!svg) return;
        let filename = graph.name;

        // clone SVG
        const clone = svg.cloneNode(true) as SVGSVGElement;

        // SVG namespace
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

        // filter vertices and edges: only selected (active) vertices
        if (selectedVertices.length > 0) {
            filename += '-subgraph-' + selectedVertices.join(',');

            // remove vertices not selected
            clone.querySelectorAll("[data-vertex]").forEach(el => {
                const id = Number(el.getAttribute("data-vertex"));
                if (!selectedVertices.includes(id)) {
                    el.remove();
                }
            });

            // remove edges not fully inside selection
            clone.querySelectorAll("[data-edge-from]").forEach(el => {
                const from = Number(el.getAttribute("data-edge-from"));
                const to = Number(el.getAttribute("data-edge-to"));

                if (!selectedVertices.includes(from) || !selectedVertices.includes(to)) {
                    el.remove();
                }
            });
        }

        // remove UI
        clone.querySelectorAll("[data-ui]").forEach(el => el.remove());

        // serialize SVG
        const serializer = new XMLSerializer();
        const source = serializer.serializeToString(clone);

        const blob = new Blob([source], {
            type: "image/svg+xml;charset=utf-8",
        });

        // trigger save dialog
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    const keyboardFunctionEdgesToggle = useCallback((graph: Graph, from: Vertex, to: Vertex) => {
        if (graph.edgeHas(from, to)) {
            graph.edgeRemove(from, to);
            ++from.version;
            ++to.version;
        }
        else {
            graph.edgeAdd(from, to);
            ++from.version;
            ++to.version;
        }
    }, []);
    const keyboardFunctionEdgesAdd = useCallback((graph: Graph, from: Vertex, to: Vertex) => {
        if (!graph.edgeHas(from, to)) {
            graph.edgeAdd(from, to);
            ++from.version;
            ++to.version;
        }
    }, []);

    const keyboardEdges = useCallback((e?: KeyboardEvent, graph?: Graph) => {
        if (!graph) return;

        let pairFunction: (g: Graph, f: Vertex, t: Vertex) => void;

        // Ctrl+(Shift)+E: toggle (+Shift: add) edges from active -> last selected vertex.
        if (e && e.ctrlKey) {
            const edgeFunction = e.shiftKey ? keyboardFunctionEdgesAdd : keyboardFunctionEdgesToggle;

            const last = graph.activeVertices.length > 0 ? graph.activeVertices[graph.activeVertices.length - 1] : -1;
            pairFunction = (g: Graph, from: Vertex, to: Vertex) => {
                if (to.id !== last && from.id !== last) return;
                edgeFunction(g, from, to);
            };
        }
        // Alt+(Shift)+E: toggle (+Shift: add) edges from active -> last selected vertex.
        else if (e && e.altKey) {
            const edgeFunction = e.shiftKey ? keyboardFunctionEdgesAdd : keyboardFunctionEdgesToggle;
            pairFunction = (g: Graph, from: Vertex, to: Vertex) => {
                let found = false;
                for (let i = 0; i < graph.activeVertices.length; ++i) {
                    const v1 = graph.activeVertices[i];
                    const v2 = graph.activeVertices[(i + 1) % graph.activeVertices.length];
                    if (
                        (from.id === v1 && to.id === v2)
                        || (from.id === v2 && to.id === v1)
                    ) {
                        found = true;
                        break;
                    }
                }
                if (!found) return;
                edgeFunction(g, from, to);
            };
        }
        // Shift+E: add edges in selection
        else if (e && e.shiftKey) {
            pairFunction = keyboardFunctionEdgesAdd;
        }
        // E: toggle edges in selection
        else {
            pairFunction = keyboardFunctionEdgesToggle;
        }

        for (const fromId of graph.activeVertices) {
            const from = graph.vertexGet(fromId);
            if (!from) continue;

            for (const toId of graph.activeVertices) {
                if (fromId >= toId) continue;
                const to = graph.vertexGet(toId);
                if (!to) continue;

                pairFunction(graph, from, to);
            }
        }
        updateSet(new Date());
    }, [keyboardFunctionEdgesAdd, keyboardFunctionEdgesToggle]);

    const keyboardDisableSelection = useCallback((graph: Graph) => {
        for (const vId of graph.activeVertices) {
            const vertex = graph.vertexGet(vId);
            if (!vertex) continue;
            vertex.disabled = !vertex.disabled;
            ++vertex.version;
        }
        updateSet(new Date());
    }, []);

    const keyboardToggleShowOverlappingForbidden = useCallback(() => {
        showOverlappingForbiddenSet(v => !v);
    }, []);

    const keyboardMaximalCliques = useCallback((graph: Graph) => {
        const now = new Date();
        graph.cliquesMaximal = graph.getSubgraphAlgorithm(graph.activeVertices).getMaximalCliques();
        ++graph.cliquesVersion;
        const duration = new Date() - now;

        // remove number of cliques in selection
        for(const vId of graph.activeVertices) {
            graph.cliqueVertexCounts.delete(vId);
        }

        // count number of cliques per vertex
        for(const subgraph of graph.cliquesMaximal) {
            for(const vId of subgraph) {
                graph.cliqueVertexCounts.set(vId, (graph.cliqueVertexCounts.get(vId) ?? 0) + 1);
            }
        }

        // update version: updated number of cliques
        graph.activeVerticesIncrementVersion();

        console.log('found maximal cliques: ', graph.cliquesMaximal.length, ` in time ${duration} ms`)
        updateSet(new Date());
    }, []);

    // keyboard functions without any dependencies except graph
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!graph || !graph.active) return;
            // console.log(e.key, e.ctrlKey, e.shiftKey)

            // delete currently selected vertices / edges
            if (e.key === "Delete" || e.key === "x") {
                if(!EventKeyboardCanFire(e)) return;
                keyboardDeleteSelection(graph);
                saveDataSave();
            }
            // clear selection
            else if (e.key === "Escape") {
                graph.activeVerticesIncrementVersion();
                graph.activeVertices = [];
                updateSet(new Date());
            }
            // export / save
            else if (e.key === "s" || e.key === "S") {
                if(!EventKeyboardCanFire(e)) return;
                if (e.ctrlKey && e.shiftKey) {
                    exportSelection(svgRef.current!, graph, graph.activeVertices);
                    e.preventDefault();
                } else if (e.ctrlKey) {
                    e.preventDefault();
                }
            }
            // "e": toggle/add edges in selection
            else if (e.key === "e" || e.key === "E") {
                if(!EventKeyboardCanFire(e)) return;
                keyboardEdges(e, graph);
                e.preventDefault();
                saveDataSave();
            }
            // "d": disable selection
            else if (e.key === "d") {
                if(!EventKeyboardCanFire(e)) return;
                keyboardDisableSelection(graph);
                e.preventDefault();
                saveDataSave();
            }
            // "shift+F": toggle showing overlapping
            else if (e.key === "F") {
                if(!EventKeyboardCanFire(e)) return;
                keyboardToggleShowOverlappingForbidden();
                e.preventDefault();
            }
            // "C": find maximal cliques
            else if (e.key === "c" || e.key === "C") {
                if(!EventKeyboardCanFire(e)) return;
                if(e.ctrlKey) return;
                keyboardMaximalCliques(graph);
                e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [graph, saveDataSave,
        keyboardDeleteSelection, exportSelection, keyboardEdges, keyboardDisableSelection,
        keyboardToggleShowOverlappingForbidden
    ]);

    const keyboardAddVertex = useCallback((graph: Graph) => {
        const v = graph.vertexAdd(Vertex.Vertex(screenToWorld(mouseLast.screen)));
        graph.activeVertices.push(v.id);
        updateSet(new Date());
    }, [mouseLast, screenToWorld]);

    const zoomChange = useCallback((e: React.MouseEvent | undefined, zoomIn: boolean, mouseScreenPosition?: Vector2) => {
        viewSet(view => {
            // different deltas depending on the current zoom
            let delta = 0.25;
            if (view.zoom <= 0.51 && !zoomIn) {
                delta = 0.05;
            } else if (view.zoom < 0.49) {
                delta = 0.05;
            }
            const zoomNew = Math.min(2, Math.max(0.05, view.zoom + delta * (zoomIn ? 1 : -1)));

            // change pan so that mouse / screen center stays at the same world position
            const rect = svgRef.current!.getBoundingClientRect();
            const screenX = e ? e.clientX - rect.left : (mouseScreenPosition?.x ?? rect.width / 2);
            const screenY = e ? e.clientY - rect.top : (mouseScreenPosition?.y ?? rect.height / 2);

            // screenToWorldCalculation(pan, zoom, x, y) = new Vector2((x - pan.x) / zoom, (y - pan.y) / zoom);
            const screenCenterNow = screenToWorldCalculation(view.pan, view.zoom, new Vector2(screenX, screenY));

            // screenCenterNew = screenToWorldCalculation(panNew, zoomNew, x,y) = new Vector2((x - panNew.x) / zoomNew, (y - panNew.y) / zoomNew);
            // solving for panNew.x: (x - panNew.x) / zoomNew = screenCenterNow.x
            // solving for panNew.x: panNew.x = x - screenCenterNow * zoomNew
            return {
                ...view,
                zoom: zoomNew,
                pan: new Vector2(screenX - screenCenterNow.x * zoomNew, screenY - screenCenterNow.y * zoomNew)
            };
        });
    }, [svgRef, screenToWorldCalculation]);

    // keyboard functions depending on mouse
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!graph || !graph.active) return;
            // console.log(e.key, e.ctrlKey, e.shiftKey)

            // copy
            if (e.key === "c") {
                if (e.ctrlKey) {
                    clipboardSet({
                        graph: graph.getSubgraph(graph.activeVertices),
                        mouseWorld: screenToWorld(mouseLast.screen),
                    });
                }
            }
            // paste / add vertex
            else if (e.key === "v") {
                if (e.ctrlKey) {
                    if (clipboard) {
                        graph.activeVerticesIncrementVersion();
                        graph.activeVertices = graph.addSubgraph(clipboard.graph, clipboard.mouseWorld, screenToWorld(mouseLast.screen));
                        graph.activeVerticesIncrementVersion();

                        updateSet(new Date());
                        e.preventDefault();
                        saveDataSave();
                    }
                }
                // add vertex
                else {
                    if(!EventKeyboardCanFire(e)) return;
                    keyboardAddVertex(graph);
                    e.preventDefault();
                    saveDataSave();
                }
            }
            // "+": zoom in
            else if (e.key === "+") {
                if(e.ctrlKey) {
                    zoomChange(undefined, true, mouseLast.screen);
                    e.preventDefault();
                }
            }
            // "-": zoom in
            else if (e.key === "-") {
                if(e.ctrlKey) {
                    zoomChange(undefined, false, mouseLast.screen);
                    e.preventDefault();
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [graph, saveDataSave, screenToWorld, mouseLast, clipboard,
        keyboardAddVertex, zoomChange
    ]);


    const keyboardFunctionPropertiesPick = useCallback((graph: Graph) => {
        if (!graph || graph.activeVertices.length === 0) return;
        const last = graph.activeVertices[graph.activeVertices.length - 1];
        const vertex = graph.vertexGet(last);
        if (!vertex) return;
        propertiesSet(p => {
            return {...p, vertexStyle: VertexStyleClone(vertex.style)};
        });
    }, [propertiesSet]);
    const keyboardFunctionPropertiesSet = useCallback((graph: Graph, properties: PropertyData) => {
        if (!graph) return;
        for (const vId of graph.activeVertices) {
            const vertex = graph.vertexGet(vId);
            if (!vertex) continue;
            vertex.style = VertexStyleClone(properties.vertexStyle);
            ++vertex.version;
        }
        updateSet(new Date());
    }, []);
    const keyboardFunctionPropertiesEdgePick = useCallback((graph: Graph) => {
        if (!graph) return;

        // pick the first we find
        for (const fromId of graph.activeVertices) {
            for (const toId of graph.activeVertices) {
                if (fromId >= toId) continue;
                if (!graph.vertexGet(fromId)?.neighbors.has(toId)) continue;

                const lineStyle = graph.edgeStyle.get(fromId)?.get(toId) ?? LineStyleDefault();
                propertiesSet(p => {
                    return {...p, vertexStyle: {...p.vertexStyle, lineStyle: LineStyleClone(lineStyle)}};
                });
                return;
            }
        }
    }, [propertiesSet]);
    const keyboardFunctionPropertiesEdgeSet = useCallback((graph: Graph, properties: PropertyData) => {
        if (!graph) return;
        for (const fromId of graph.activeVertices) {
            const from = graph.vertexGet(fromId);
            if (!from) continue;

            for (const toId of graph.activeVertices) {
                if (fromId >= toId) continue;
                const to = graph.vertexGet(fromId);
                if (!to) continue;

                if (!graph.edgeStyle.has(fromId)) graph.edgeStyle.set(fromId, new Map<number, LineStyle>());
                graph.edgeStyle.get(fromId)?.set(toId, LineStyleClone(properties.vertexStyle.lineStyle));
            }

            ++from.version;
        }
        updateSet(new Date());
    }, []);

    // keyboard functions depending on properties
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!graph || !graph.active) return;
            // console.log(e.key, e.ctrlKey, e.shiftKey)

            // "q": properties
            if (e.key === "q" || e.key === "Q") {
                if(e.ctrlKey) return;
                if(!EventKeyboardCanFire(e)) return;

                // affect vertices
                if(!e.altKey) {
                    // apply properties
                    if(e.shiftKey) {
                        keyboardFunctionPropertiesSet(graph, properties);
                    }
                    // pick properties
                    else {
                        keyboardFunctionPropertiesPick(graph);
                    }
                }
                // affect edges
                else {
                    // apply properties
                    if(e.shiftKey) {
                        keyboardFunctionPropertiesEdgeSet(graph, properties);
                    }
                    // pick properties
                    else {
                        keyboardFunctionPropertiesEdgePick(graph);
                    }
                }
                e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [graph, saveDataSave, properties,
        keyboardFunctionPropertiesPick, keyboardFunctionPropertiesSet, keyboardFunctionPropertiesEdgePick, keyboardFunctionPropertiesEdgeSet
    ]);

    // endregion keyboard

    ///////////////////////////////////////////////////
    // region canvas interactions
    const updateTransform = useCallback((view: ViewData) => {
        if (!worldRef.current || !('setAttribute' in worldRef.current)) return;
        worldRef.current.setAttribute(
            "transform",
            `translate(${view.pan.x}, ${view.pan.y}) scale(${view.zoom})`
        );
    }, []);

    const onMouseDownCanvas = useCallback((e: React.MouseEvent) => {
        // left click on canvas = box select / deselect
        if (e.button === 0) {
            let activeVerticesStart = [...graph.activeVertices];

            // no shift / ctrl key: clear selection
            if (!e.ctrlKey && !e.shiftKey) {
                graph.activeVerticesIncrementVersion();
                activeVerticesStart = [];
                graph.activeVertices = [];
            }

            const screenPos = getMousePositionScreen(e);
            boxSelectSet({
                shift: e.shiftKey,
                ctrl: e.ctrlKey,
                activeVertices: activeVerticesStart,
                from: screenPos,
                to: screenPos
            });
            return;
        }
        // middle click = pan
        else if (e.button === 1) {
            panningSet({panStart: view.pan, mouseStart: new Vector2(e.clientX, e.clientY)});
        }
    }, [view, getMousePositionScreen, graph]);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!graph) return;

        // pan view
        if (panning) {
            view.pan = new Vector2(
                panning.panStart.x + e.clientX - panning.mouseStart.x,
                panning.panStart.y + e.clientY - panning.mouseStart.y
            );
            updateTransform(view);
        }

        // box select: move end point
        if (boxSelect) {
            boxSelect.to = getMousePositionScreen(e);

            const worldFromUnsorted = screenToWorld(boxSelect.from);
            const worldToUnsorted = screenToWorld(boxSelect.to);

            const worldFrom = new Vector2(
                Math.min(worldFromUnsorted.x, worldToUnsorted.x),
                Math.min(worldFromUnsorted.y, worldToUnsorted.y)
            );
            const worldTo = new Vector2(
                Math.max(worldFromUnsorted.x, worldToUnsorted.x),
                Math.max(worldFromUnsorted.y, worldToUnsorted.y)
            );

            const active = [...boxSelect.activeVertices];
            for (const vertex of graph.vertices.values()) {
                const style = vertex.style ?? VertexStyleDefault();
                const slack = style.radius;

                // check bounding box
                if (
                    worldFrom.x - slack <= vertex.position.x && vertex.position.x <= worldTo.x + slack
                    && worldFrom.y - slack <= vertex.position.y && vertex.position.y <= worldTo.y + slack
                ) {
                    // add to selection
                    if (!e.ctrlKey || e.shiftKey) {
                        if (!active.includes(vertex.id)) {
                            active.push(vertex.id);
                            continue;
                        }
                    }
                    // ctrl: remove from selection
                    if (e.ctrlKey) {
                        const index = active.indexOf(vertex.id);
                        if (index >= 0) active.splice(index, 1);
                    }
                }
            }

            if (!ArrayEquals(graph.activeVertices, active)) {
                graph.activeVerticesIncrementVersion();
                graph.activeVertices = active;
                graph.activeVerticesIncrementVersion();
                updateSet(new Date());
            }
            // boxSelectSet({...boxSelect, to: getMousePositionScreen(e)});
        }

        // move active vertex
        if (dragVertex) {
            const v = graph.vertexGet(dragVertex.vertex);
            if (v) {
                const mouseWorld = getMousePositionWorld(e);
                if(!dragVertex.mouseStartOffset) {
                    dragVertex.mouseStartOffset = v.position.minus(mouseWorld);
                }

                const pos = mouseWorld.plus(dragVertex.mouseStartOffset).grid(view.gridSize);

                // move other selected vertices relative to v's current position
                if (!dragVertex.ctrlKey) {
                    for (const vId of graph.activeVertices) {
                        const vertex = graph.vertexGet(vId);
                        if (!vertex || vertex.id === v.id) continue;
                        vertex.position = new Vector2(pos.x + vertex.position.x - v.position.x, pos.y + vertex.position.y - v.position.y);
                        ++vertex.version;
                    }
                }

                v.position = pos;
                ++v.version;
                updateSet(new Date());
            }
        }

        // mouseLast.screen = getMousePositionScreen(e);
        mouseLastSet({...mouseLast, screen: getMousePositionScreen(e)});
        setGraphActive(graph);
    }, [panning, view, mouseLast, dragVertex, graph, getMousePositionScreen, getMousePositionWorld, boxSelect]);

    const onMouseUp = useCallback((_: React.MouseEvent) => {
        if (!graph) return;

        if (!panning && !boxSelect) saveDataSave();

        panningSet(undefined);
        boxSelectSet(undefined);
        dragVertexSet(undefined);
    }, [graph, screenToWorld, saveDataSave, panning, boxSelect]);

    const onWheel = useCallback((e: React.WheelEvent) => {
        // zoom
        if (e.ctrlKey) zoomChange(e, e.deltaY < 0);
        // pan left/right
        else if (e.shiftKey) {
            viewSet(v => {
                return {...v, pan: new Vector2(v.pan.x - 0.5 * e.deltaY / Math.sqrt(v.zoom), v.pan.y)};
            });
        }
        // pan up/down
        else {
            viewSet(v => {
                return {...v, pan: new Vector2(v.pan.x, v.pan.y - 0.5 * e.deltaY / Math.sqrt(v.zoom))};
            });
        }
    }, [zoomChange, view]);

    // endregion canvas interactions

    const vertexClick = useCallback((e: React.MouseEvent, v: Vertex, active: boolean) => {
        if (e.button !== 0) return;

        // shift: toggle selection
        if (e.shiftKey) {
            // add to selection
            if (!active) {
                graph.activeVertices.push(v.id);
                ++v.version;
            }
            // remove from selection
            else {
                const copy = [...graph.activeVertices];
                const index = copy.indexOf(v.id);
                if (index >= 0) {
                    copy.splice(index, 1);
                }
                graph.activeVertices = copy;
                ++v.version;
            }
        }
        // no shift
        else {
            // if not already active: reset selection
            if (!active) {
                graph.activeVerticesIncrementVersion();
                graph.activeVertices = [v.id];
                ++v.version;
            }
            dragVertexSet({vertex: v.id, mouseStartOffset: undefined, ctrlKey: e.ctrlKey});
        }

        e.stopPropagation();
        e.preventDefault();
        updateSet(new Date());
    }, [graph]);

    const renderOverlappingForbidden = useCallback((graph: Graph) => {
        if (!graph || !showOverlappingForbidden) return [];
        const activeVertices = graph.activeVertices;
        const activeVerticesString = activeVertices.join(',');

        // update filtered graphs if selection changed
        if (
            !ArrayEquals(graph.activeVertices, overlappingData.activeVertices)
            || overlappingData.forbiddenVersion !== graph.forbiddenVersion
            || overlappingData.cliquesVersion !== graph.cliquesVersion
        ) {
            overlappingData.activeVertices = [...graph.activeVertices];

            overlappingData.forbidden = [];
            overlappingData.forbiddenNot = [];

            overlappingData.cliques = [];
            overlappingData.cliquesNot = [];

            if(activeVertices.length > 0) {
                for(const g of graph.forbiddenInduced) {
                    if(ArrayContainsAll(g, activeVertices)) {
                        overlappingData.forbidden.push(g);
                    } else {
                        overlappingData.forbiddenNot.push(g);
                    }
                }

                for(const g of graph.cliquesMaximal) {
                    if(ArrayContainsAll(Array.from(g), activeVertices)) {
                        overlappingData.cliques.push(g);
                    } else {
                        overlappingData.cliquesNot.push(g);
                    }
                }
            }
            else {
                overlappingData.forbidden = graph.forbiddenInduced;
                overlappingData.cliques = graph.cliquesMaximal;
            }
        }

        return {
            forbidden: overlappingData.forbidden.map((ownVertices: number[], index: number) => {
                return <button key={index} className="block border-b w-full cursor" onClick={() => {
                    graph.activeVerticesIncrementVersion();
                    graph.activeVertices = ownVertices;
                    graph.activeVerticesIncrementVersion();
                    updateSet(new Date());
                }}>
                    <span className="font-bold mr-2">{activeVerticesString}</span>
                    <span>{ownVertices.filter(v => !activeVertices.includes(v)).join(',')}</span>
                </button>
            }),
            forbiddenNot: overlappingData.forbiddenNot.map((ownVertices: number[], index: number) => {
                return <button key={index} className="block border-b w-full cursor" onClick={() => {
                    graph.activeVerticesIncrementVersion();
                    graph.activeVertices = ownVertices;
                    graph.activeVerticesIncrementVersion();
                    updateSet(new Date());
                }}>
                    <span>{ownVertices.join(',')}</span>
                </button>
            }),
            cliques: overlappingData.cliques.map((set, index: number) => {
                const ownVertices = Array.from(set);
                return <button key={index} className="block border-b w-full cursor" onClick={() => {
                    graph.activeVerticesIncrementVersion();
                    graph.activeVertices = ownVertices;
                    graph.activeVerticesIncrementVersion();
                    updateSet(new Date());
                }}>
                    <span className="font-bold mr-2">{activeVerticesString}</span>
                    <span>{ownVertices.filter(v => !activeVertices.includes(v)).join(',')}</span>
                </button>
            }),
            cliquesNot: overlappingData.cliquesNot.map((set, index: number) => {
                const ownVertices = Array.from(set);
                return <button key={index} className="block border-b w-full cursor" onClick={() => {
                    graph.activeVerticesIncrementVersion();
                    graph.activeVertices = ownVertices;
                    graph.activeVerticesIncrementVersion();
                    updateSet(new Date());
                }}>
                    <span>{ownVertices.join(',')}</span>
                </button>
            }),
        }
    }, [update, overlappingData, showOverlappingForbidden]);

    const renderEdges = useCallback((graph: Graph) => {
        const lines: JSX.Element[] = [];
        if (!graph) return lines;

        for (const v of graph.vertices.values()) {
            for (const nId of v.neighbors) {
                if (v.id >= nId) continue;
                const n = graph.vertexGet(nId);
                if (!n) continue;

                lines.push(<EdgeRender key={v.id+"-"+n.id} graph={graph} from={v} to={n} versionFrom={v.version} versionTo={n.version} />)
            }
        }
        return lines;
    }, []);

    let overlapping = undefined;
    if(windowType === 'main') {
        overlapping = renderOverlappingForbidden(graph);
    }

    return (
        <div className="flex flex-col border-r" style={{width: height + "vw"}}>
            <div className="flex gap-2 p-2 border-b">
                {/* Helper Hover */ windowType === 'main' && <div className="pt-1 mx-2">
                    <button className="mr-1 tooltip">
                        <kbd>?</kbd>
                        <div className="tooltiptext p-3" style={{width: "400px", zIndex: 99999}}>
                            <div className="p-2 border-b">
                                <h2 className="font-bold">Graph Editor</h2>
                                <ul>
                                    <li>Create a graph by adding <kbd>V</kbd> vertices.</li>
                                    <li><kbd>Shift+Click</kbd>: to select multiple vertices.</li>
                                    <li><kbd>Drag&Drop</kbd>: to move selected vertices. Start
                                        holding <kbd>Ctrl</kbd> to only move one single vertex.
                                    </li>
                                    <li><kbd>E</kbd>: to toggle edges between selected vertices.</li>
                                    <li><kbd>Click+Drag</kbd>: on the canvas for box selecting multiple vertices.
                                        Add <kbd>Shift</kbd> to add to the selection. Use <kbd>Ctrl</kbd> to remove
                                        from the selection.
                                    </li>
                                    <li>
                                        Use <kbd>Ctrl+C</kbd> to copy and <kbd>Ctrl+V</kbd> paste selected vertices.
                                    </li>
                                    <li>
                                        Use <kbd>Enter</kbd> to set a vertex label. Start a vertex label with the $ dollar sign e.g. "$C_v"
                                        to render LateX math formulas.
                                    </li>
                                </ul>
                            </div>
                            <div className="p-2 border-b">
                                <h2 className="font-bold">Navigation</h2>
                                <ul>
                                    <li>Press and hold <kbd>Middle Mouse</kbd> to pan the view.
                                        Or <kbd>Scroll</kbd> up down on the trackpad - use <kbd>Shift+Scroll</kbd> to
                                        scroll to the side.
                                    </li>
                                    <li>Use <kbd>Ctrl+Mouse Wheel</kbd> to zoom in our out</li>
                                </ul>
                            </div>
                        </div>
                    </button>
                </div>}

                <button type="button" className="tooltip"
                        onClick={() => zoomChange(undefined, false)}>
                    <kbd>-</kbd>
                    <div className="tooltiptext p-3" style={{zIndex: 99999}}>
                        <kbd>Ctrl</kbd>+<kbd>-</kbd> Zoom out
                    </div>
                </button>
                <button type="button" className={buttonClass}
                        onClick={() => viewSet({...view, zoom: 1})}>{Math.round(view.zoom * 100)}%
                </button>
                <button type="button" className="tooltip"
                        onClick={() => zoomChange(undefined, true)}>
                    <kbd>+</kbd>
                    <div className="tooltiptext p-3" style={{zIndex: 99999}}>
                        <kbd>Ctrl</kbd>+<kbd>+</kbd> Zoom in
                    </div>
                </button>

                {/* keyboard shortcuts */ windowType === 'main' && <div className="pt-1">
                    <button className="mr-1 tooltip" onClick={() => keyboardAddVertex(graph)}>
                        <kbd>V</kbd>
                        <div className="tooltiptext p-3" style={{zIndex: 99999}}>
                            <kbd>V</kbd> Add a vertex at the current mouse position.
                        </div>
                    </button>

                    <button className="mr-1 tooltip" onClick={() => keyboardEdges(undefined, graph)}>
                        <kbd>E</kbd>
                        <div className="tooltiptext p-3" style={{width: "400px"}}>
                            <div className="p-2 border-b">
                                <kbd>E</kbd> Edit Edges in selection<br/>
                            </div>
                            <div className="p-2 border-b">
                                <h2 className="font-bold">Control the type of edits with <kbd>Shift</kbd></h2>
                                <ul>
                                    <li>No shift: Toggle edges</li>
                                    <li><kbd>Shift</kbd>: Only Add edges.</li>
                                </ul>
                            </div>
                            <div className="p-2">
                                <h2 className="font-bold">Filter edges:</h2>
                                <ul>
                                    <li><kbd>Ctrl</kbd>: Only consider edges to the last selected vertex</li>
                                    <li><kbd>Alt</kbd>: Only consider edges in a cycle in the order of the selected
                                        vertices
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </button>

                    <button className="mr-1 tooltip" onClick={() => keyboardDeleteSelection(graph)}>
                        <kbd>X</kbd>
                        <div className="tooltiptext p-3">
                            <kbd>X</kbd> or <kbd>Del</kbd>: Delete selected vertices.
                        </div>
                    </button>

                    <button className="mr-1 tooltip" onClick={() => keyboardDisableSelection(graph)}>
                        <kbd>D</kbd>
                        <div className="tooltiptext p-3" style={{width: "400px"}}>
                            <kbd>D</kbd> Disable selected vertices. Disabled vertices in the forbidden subgraph window
                            (smaller
                            window) are ignored.
                        </div>
                    </button>

                    <button className="ml-4 tooltip">
                        <kbd>Q</kbd>
                        <div className="tooltiptext" style={{width: "300px"}}>
                            <kbd>Q</kbd> Pick properties (line width, line color, line type,...) of the currently
                            selected vertices.<br/><br/>
                            <kbd>Shift+Q</kbd> Apply current properties to the currently
                            selected vertices.<br/><br/>
                            Use <kbd>Alt</kbd> to pick and apply to selected edges.<br/><br/>
                        </div>
                    </button>
                </div>}

                {/*properties display*/ properties && <div className="flex-row">
                    <PropertiesDisplay graph={graph} properties={properties} updateGraph={() => updateSet(new Date())} />
                </div>}
            </div>
            <div className="flex-1 relative bg-gray-50 overflow-hidden"
                 onMouseDown={onMouseDownCanvas}
                 onMouseMove={onMouseMove}
                 onMouseUp={onMouseUp}
                 onWheel={onWheel}
            >
                <svg
                    ref={svgRef}
                    className="relative h-full w-full"
                >
                    <style>
                        {".katex-html {display: none;}"}
                    </style>

                    <g ref={worldRef} transform={`translate(${view.pan.x}, ${view.pan.y}) scale(${view.zoom})`}>
                        {renderEdges(graph)}
                        {graph.vertices.values().toArray().map(v =>
                            <VertexRender key={v.id} graph={graph} vertex={v} version={v.version}
                                          vertexClick={vertexClick}/>)}
                    </g>

                    {/* mouse position */ <text
                        className="select-none"
                        data-ui="true"
                        x={10} y="100%" dy={-10}
                        fontSize={12}
                        fill="#333"
                        pointerEvents="none"
                    >
                        {`${screenToWorld(mouseLast.screen).toStringFraction(0)}`}
                    </text>}

                    {/* Selected vertices */ <text
                        className="select-none"
                        data-ui="true"
                        x="100%" y="100%" dx={-10} dy={-24}
                        fontSize={10}
                        fill="#333"
                        pointerEvents="none"
                        textAnchor="end" dominantBaseline="bottom"
                    >
                        Selected {graph.activeVertices.length} Vertices
                    </text>}

                    {/* last save */ graph?.savedLast && <text
                        className="select-none"
                        data-ui="true"
                        x="100%" y="100%" dx={-10} dy={-10}
                        fontSize={10}
                        fill="#333"
                        pointerEvents="none"
                        textAnchor="end" dominantBaseline="bottom"
                    >
                        Last save: {DateToLocalWithTime(new Date(graph.savedLast))}
                    </text>}

                    {/* box select */ boxSelect && <rect
                        data-ui="true"
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

                {windowType === 'main' &&
                    <div className="" style={{position: 'absolute', left: "5px", top: "5px"}}>
                        <button className="tooltip absolute" onClick={keyboardToggleShowOverlappingForbidden}
                                style={{
                                    minWidth: "20px",
                                    left: 0,
                                    padding: 0,
                                    border: 'none'
                                }}>
                            <kbd>Shift+F</kbd>
                            <div className="tooltiptext">
                                <kbd>Shift+F</kbd> Toggle visibility of the list of forbidden subgraphs in the
                                selection.
                            </div>
                        </button>

                        <div className="tooltiptext"
                             style={{
                                 width: "100px",
                                 visibility: showOverlappingForbidden ? 'visible' : 'hidden',
                                 top: 0,
                                 left: 0,
                                 padding: 0
                             }}>
                            <button className="block w-full mt-1 tooltip"
                                    onClick={keyboardToggleShowOverlappingForbidden}
                                    style={{
                                        padding: 0,
                                        border: 'none'
                                    }}>
                                <kbd>Shift+F</kbd>
                                <div className="tooltiptext">
                                    <kbd>Shift+F</kbd> Toggle visibility of the list of forbidden subgraphs in the
                                    selection.
                                </div>
                            </button>
                            {overlappingData.forbidden.length} forbidden in selection
                            <div className="overflow-y-auto border-y"
                                 style={{
                                     maxHeight: "160px"
                                 }}>
                                {overlapping && overlapping.forbidden}
                                {overlapping && overlapping.forbiddenNot}
                            </div>

                            {overlappingData.cliques.length} maximal cliques in selection
                            <div className="overflow-y-auto border-y"
                                 style={{
                                     maxHeight: "160px"
                                 }}>
                                {overlapping && overlapping.cliques}
                                {overlapping && overlapping.cliquesNot}
                            </div>
                        </div>
                    </div>}
            </div>
        </div>
    );
}

type PropertyDataFieldName =
    'lineColor' | 'bgColor' | 'textColor' // color fields
    | 'radius' | 'textSize' | 'lineWidth' // number fields
;

function VertexGetterByPropertyDataFieldName(c: PropertyDataFieldName | undefined): undefined | ((vertex: Vertex) => string | number) {
    switch (c) {
        case 'lineColor':
            return v => v.style.lineStyle.color;
        case 'bgColor':
            return v => v.style.bgColor;
        case 'textColor':
            return v => v.style.textColor;
        case 'textSize':
            return v => v.style.textSize;
        case 'radius':
            return v => v.style.radius;
        case 'lineWidth':
            return v => v.style.lineStyle.weight;
        case undefined:
            return undefined;
        default:
            console.error("property data color unknown: ", c);
            return undefined;
    }
}

function VertexSetterByPropertyDataFieldName(c: PropertyDataFieldName | undefined): undefined | ((vertex: Vertex, value: string | number) => void) {
    switch (c) {
        case 'lineColor':
            return (v, value) => v.style.lineStyle.color = '' + value;
        case 'bgColor':
            return (v, value) => v.style.bgColor = '' + value;
        case 'textColor':
            return (v, value) => v.style.textColor = '' + value;
        case 'textSize':
            return (v, value) => v.style.textSize = +value;
        case 'radius':
            return (v, value) => v.style.radius = +value;
        case 'lineWidth':
            return (v, value) => v.style.lineStyle.weight = +value;
        case undefined:
            return undefined;
        default:
            console.error("property data color unknown: ", c);
            return undefined;
    }
}

function EdgeSetterByPropertyDataFieldName(c: PropertyDataFieldName | undefined): undefined | ((style: LineStyle, value: string | number) => void) {
    switch (c) {
        case 'lineColor':
            return (style, value) => style.color = '' + value;
        case 'lineWidth':
            return (style, value) => style.weight = +value;
        case undefined:
            return undefined;
        default:
            console.error("property data unknown (or not applicable): ", c);
            return undefined;
    }
}

function EdgeGetterByPropertyDataFieldName(c: PropertyDataFieldName | undefined): undefined | ((style: LineStyle) => string | number) {
    switch (c) {
        case 'lineColor':
            return style => style.color;
        case 'lineWidth':
            return style => style.weight;
        case undefined:
            return undefined;
        default:
            console.error("property data unknown (or not applicable): ", c);
            return undefined;
    }
}

const PropertiesDisplay = React.memo((props: {
    graph: Graph,
    properties: PropertyData,
    updateGraph: () => void,
}) => {
    const [_, updateSet] = useState<Date>(new Date());

    const propertiesChanged = useCallback(() => {
        // called after every property value change
        // could use for e.g. setting the current selection values BUT
        // no way to know vertex / edges -> did not do that option
    }, [props.graph, props.properties]);

    const popover = useRef<HTMLDivElement | null>(null);
    const [colorOpen, colorOpenSet] = useState<PropertyDataFieldName>();
    const [numberOpen, numberOpenSet] = useState<PropertyDataFieldName>();

    const colorOpenSetWithWait = useCallback(async (current: PropertyDataFieldName|undefined, c: PropertyDataFieldName) => {
        if(current === c) return;
        await PromiseWait(3)
        colorOpenSet(c);
    }, [colorOpenSet]);
    const numberOpenSetWithWait = useCallback(async (current: PropertyDataFieldName|undefined, c: PropertyDataFieldName) => {
        if(current === c) return;
        await PromiseWait(3)
        numberOpenSet(c);
    }, [numberOpenSet]);

    const doClose = useCallback(() => {
        colorOpenSet(undefined);
        numberOpenSet(undefined);
    }, [colorOpenSet]);
    useClickOutside(popover, doClose);

    const titleGet = useCallback((c: PropertyDataFieldName|undefined) => {
        switch (c) {
            case 'lineColor':
                return <span>Line Color</span>
            case 'bgColor':
                return <span>Vertex Fill Color</span>
            case 'textColor':
                return <span>Text Color</span>
            case 'textSize':
                return <span>Text Size</span>
            case 'radius':
                return <span>Vertex Radius</span>
            case 'lineWidth':
                return <span>Line Width</span>
            case undefined:
                break;
            default:
                console.error("property data color unknown: ", c);
                break;
        }
        return <></>
    }, []);
    const propertyGet = useCallback((p: PropertyData, c: PropertyDataFieldName|undefined) => {
        switch (c) {
            case 'lineColor':
                return p.vertexStyle.lineStyle.color;
            case 'bgColor':
                return p.vertexStyle.bgColor;
            case 'textColor':
                return p.vertexStyle.textColor;
            case 'textSize':
                return p.vertexStyle.textSize;
            case 'radius':
                return p.vertexStyle.radius;
            case 'lineWidth':
                return p.vertexStyle.lineStyle.weight;
            case undefined:
                break;
            default:
                console.error("property data color unknown: ", c);
                break;
        }
        return '#000000';
    }, []);
    const propertySet = useCallback((p: PropertyData, c: PropertyDataFieldName|undefined, v: string) => {
        switch (c) {
            case 'lineColor':
                p.vertexStyle.lineStyle.color = v;
                break;
            case 'bgColor':
                p.vertexStyle.bgColor = v;
                break;
            case 'textColor':
                p.vertexStyle.textColor = v;
                break;

            case 'textSize':
                p.vertexStyle.textSize = +v;
                break;
            case 'radius':
                p.vertexStyle.radius = +v;
                break;
            case 'lineWidth':
                p.vertexStyle.lineStyle.weight = +v;
                break;
            case undefined:
                break;
            default:
                console.error("property data color unknown: ", c);
                break;
        }
        propertiesChanged();
    }, [propertiesChanged]);

    const keyboardApplySinglePropertyToSelection = useCallback((graph: Graph, p: PropertyData, c: PropertyDataFieldName|undefined) => {
        if(!graph) return;
        const value = propertyGet(p, c);

        const vertexSetter = VertexSetterByPropertyDataFieldName(c);
        if(!vertexSetter) return;

        for(const vId of graph.activeVertices) {
            const vertex = graph.vertexGet(vId);
            if(!vertex) continue;
            vertex.style ??= VertexStyleDefault();
            vertexSetter(vertex, value);
            ++vertex.version;
        }

        props.updateGraph();
    }, [props.updateGraph]);
    const keyboardApplySinglePropertyToSelectionEdges = useCallback((graph: Graph, p: PropertyData, c: PropertyDataFieldName|undefined) => {
        if(!graph) return;
        const value = propertyGet(p, c);

        const edgeSetter = EdgeSetterByPropertyDataFieldName(c);
        if(!edgeSetter) return;

        for(const fromId of graph.activeVertices) {
            const vertex = graph.vertexGet(fromId);
            if(!vertex) continue;
            for(const toId of vertex.neighbors) {
                if(fromId >= toId) continue;
                if(!graph.activeVertices.includes(toId)) continue;

                if(!graph.edgeStyle.has(fromId)) graph.edgeStyle.set(fromId, new Map<number, LineStyle>());
                const style = graph.edgeStyle.get(fromId)?.get(toId) ?? LineStyleDefault();
                edgeSetter(style, value);
                graph.edgeStyle.get(fromId)?.set(toId, style);
            }
            ++vertex.version;
        }

        props.updateGraph();
    }, [props.updateGraph]);

    const keyboardFunctionPropertiesPickSingle = useCallback((graph: Graph, p: PropertyData, c: PropertyDataFieldName|undefined) => {
        if (!graph || graph.activeVertices.length === 0) return;
        const last = graph.activeVertices[graph.activeVertices.length - 1];
        const vertex = graph.vertexGet(last);
        if (!vertex) return;
        const getter = VertexGetterByPropertyDataFieldName(c);
        if(!getter) return;
        propertySet(p, c, ''+getter(vertex));
        updateSet(new Date());
    }, []);
    const keyboardFunctionPropertiesEdgePickSingle = useCallback((graph: Graph, p: PropertyData, c: PropertyDataFieldName|undefined) => {
        if (!graph) return;

        const getter = EdgeGetterByPropertyDataFieldName(c);
        if(!getter) return;

        // pick the first we find
        for (const fromId of graph.activeVertices) {
            for (const toId of graph.activeVertices) {
                if (fromId >= toId) continue;
                if (!graph.vertexGet(fromId)?.neighbors.has(toId)) continue;

                const lineStyle = graph.edgeStyle.get(fromId)?.get(toId) ?? LineStyleDefault();
                propertySet(p, c, ''+getter(lineStyle));

                updateSet(new Date());
                return;
            }
        }
    }, []);

    const keyboardFocusVertexLabel = useCallback(async () => {
        await PromiseWait(1);
        document.getElementById('vertex-label-input')?.focus();
    }, []);

    // keyboard functions depending on properties
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!props.graph || !props.graph.active) return;
            // console.log(e.key, e.ctrlKey, e.shiftKey)

            // "q": properties
            if (e.key === "q" || e.key === "Q") {
                // only do ctrl here
                if(!e.ctrlKey) return;
                if(!EventKeyboardCanFire(e)) return;

                // affect vertices
                if(!e.altKey) {
                    // apply properties
                    if(e.shiftKey) {
                        keyboardApplySinglePropertyToSelection(props.graph, props.properties, colorOpen ?? numberOpen);
                    }
                    else {
                        keyboardFunctionPropertiesPickSingle(props.graph, props.properties, colorOpen ?? numberOpen);
                    }
                }
                // affect edges
                else {
                    // apply properties
                    if(e.shiftKey) {
                        keyboardApplySinglePropertyToSelectionEdges(props.graph, props.properties, colorOpen ?? numberOpen);
                    }
                    else {
                        keyboardFunctionPropertiesEdgePickSingle(props.graph, props.properties, colorOpen ?? numberOpen);
                    }
                }
                e.preventDefault();
            }
            // change numerical values
            else if(e.key === '-') {
                if(e.ctrlKey || e.shiftKey) return;
                if(!numberOpen) return;
                propertySet(props.properties, numberOpen, Math.min(50, (+propertyGet(props.properties, numberOpen)) - 1) + '');
                updateSet(new Date());
                e.preventDefault();
            }
            else if(e.key === '+') {
                if(e.ctrlKey || e.shiftKey) return;
                if(!numberOpen) return;
                propertySet(props.properties, numberOpen, Math.min(50, (+propertyGet(props.properties, numberOpen)) + 1) + '');
                updateSet(new Date());
                e.preventDefault();
            }
            // open vertex text box
            else if(e.key === 'Enter') {
                numberOpenSet(undefined);
                colorOpenSet('textColor');
                keyboardFocusVertexLabel().then();
                e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [props.graph, props.properties, colorOpen, numberOpen,
        keyboardApplySinglePropertyToSelection, keyboardFocusVertexLabel]);

    const colorValue = propertyGet(props.properties, colorOpen);
    const numberValue = propertyGet(props.properties, numberOpen);

    return <>
        <div className="relative">
            <button className="swatch text-outline font-bold mr-2"
                    style={{
                        color: props.properties.vertexStyle.bgColor,
                        backgroundColor: props.properties.vertexStyle.bgColor,
                    }}
                    onClick={() => colorOpenSetWithWait(colorOpen, 'bgColor')}
            >
                BG
            </button>
            <button className="swatch font-bold mr-2"
                    style={{color: props.properties.vertexStyle.lineStyle.color}}
                    onClick={() => colorOpenSetWithWait(colorOpen, 'lineColor')}
            >
                Li
            </button>
            <button className="swatch font-bold"
                    style={{color: props.properties.vertexStyle.textColor}}
                    onClick={() => colorOpenSetWithWait(colorOpen, 'textColor')}
            >
                T
            </button>

            <span className="mx-2">|</span>

            <button className="swatch px-1 mr-2" style={{width: 'unset'}}
                    onClick={() => numberOpenSetWithWait(numberOpen, 'textSize')}
            >
                t:{props.properties.vertexStyle.textSize}
            </button>
            <button className="swatch px-1 mr-2" style={{width: 'unset'}}
                    onClick={() => numberOpenSetWithWait(numberOpen, 'lineWidth')}
            >
                w:{props.properties.vertexStyle.lineStyle.weight}
            </button>
            <button className="swatch px-1 mr-2" style={{width: 'unset'}}
                    onClick={() => numberOpenSetWithWait(numberOpen, 'radius')}
            >
                r:{props.properties.vertexStyle.radius}
            </button>

            {/* color picker */}
            <div ref={popover} className="popover bg-white"
                 style={{display: colorOpen || numberOpen ? 'block' : 'none'}}>
                {/* color editor */ colorOpen && <>
                    <h4 className="text-center p-1">
                        {titleGet(colorOpen)}
                    </h4>
                    <HexColorPicker color={colorValue + ''} onChange={v => {
                        propertySet(props.properties, colorOpen, v);
                        updateSet(new Date());
                    }}/>
                    <div className="text-center">
                        <input className='mt-2 text-center' type='text' value={colorValue}
                               onChange={v => {
                                   propertySet(props.properties, colorOpen, v.target.value);
                                   updateSet(new Date());
                               }}/>
                    </div>
                </>}
                {/* number editor */ numberOpen && <>
                    <h4 className="text-center p-1">
                        {titleGet(numberOpen)}
                    </h4>
                    <div className="text-center px-3">
                    <kbd onClick={() => {
                            propertySet(props.properties, numberOpen, ((+numberValue) - 1) + '');
                            updateSet(new Date());
                        }}>-</kbd>
                        <input className="text-center" type='number' min={0} max={50}
                               value={+numberValue} onChange={v => {
                            propertySet(props.properties, numberOpen, v.target.value);
                            updateSet(new Date());
                        }}/>
                        <kbd onClick={() => {
                            propertySet(props.properties, numberOpen, Math.min(50, (+numberValue) + 1) + '');
                            updateSet(new Date());
                        }}>+</kbd>
                    </div>
                </>}

                <div className="text-center my-3">
                    <button className="tooltip"
                            onClick={() => keyboardApplySinglePropertyToSelection(props.graph, props.properties, colorOpen ?? numberOpen)}>
                        <kbd>Ctrl+Q</kbd>
                        <div className="tooltiptext" style={{width: "300px"}}>
                            <kbd>Ctrl+Q</kbd> Pick only this property value in the selection.
                            <br/><br/>
                            Add <kbd>Shift</kbd> to apply to the selection instead.
                            <br/><br/>
                            Add <kbd>Alt</kbd> to pick from edges.
                            <br/><br/>
                            Note: only works while the property window is open.
                        </div>
                    </button>

                    {colorOpen === "textColor" && props.graph.activeVertices.length>0 && <>
                        <div className="mt-3">Vertex Label</div>
                        <textarea id="vertex-label-input"
                            className='mb-2 text-center border rounded' value={props.graph.vertexGet(props.graph.activeVertices[0])?.label ?? ''}
                            placeholder="Label"
                            style={{minHeight: "50px"}}
                            onChange={v => {
                                for(const vId of props.graph.activeVertices) {
                                    const vertex = props.graph.vertexGet(vId);
                                    if(!vertex) continue;
                                    vertex.label = v.target.value;
                                    ++vertex.version;
                                }
                                updateSet(new Date());
                                props.updateGraph();
                            }}>
                        </textarea>
                    </>}
                </div>
            </div>
        </div>
    </>;
})

const EdgeRender = React.memo((props: {
    graph: Graph,
    from: Vertex,
    to: Vertex,
    versionFrom: number,
    versionTo: number
}) => {
    // console.log('edge re-render', props.from.id, props.to.id);

    const graph = props.graph;
    const v = props.from;
    const n = props.to;

    /*const active = activeEdge && (
        (v.id === activeEdge.x && nId === activeEdge.y)
        || (v.id === activeEdge.y && nId === activeEdge.x)
    );*/
    const active = false;

    const fromActive = graph.activeVertices.includes(v.id);
    const toActive = graph.activeVertices.includes(n.id);
    const endpointActive = fromActive || toActive;
    const endpointBothActive = fromActive && toActive;

    const lineStyle = graph.edgeStyle.get(v.id)?.get(n.id) ?? LineStyleDefault();
    const forbidden = graph.edgesForbidden.get(v.id)?.has(n.id);

    const color = forbidden ? '#ff0000' : lineStyle.color;
    return <>
        <line
            data-ui="true"
            x1={v.position.x} y1={v.position.y}
            x2={n?.position.x} y2={n?.position.y}
            stroke={active ? 'orange' : '#ffffff02'}
            strokeWidth={(active ? 0 : 16) + (!isNaN(lineStyle.weight) ? lineStyle.weight : 1)}
            strokeDasharray={lineStyle.type === "dashed" ? "6,4" : lineStyle.type === "dotted" ? "2,4" : undefined}
        />
        <line
            data-edge-from={v.id} data-edge-to={n.id}
            x1={v.position.x} y1={v.position.y}
            x2={n?.position.x} y2={n?.position.y}
            stroke={endpointActive ? ColorHexSetTransparency(color, endpointBothActive ? 'a0' : '80') : color + '40'}
            strokeWidth={(endpointActive ? (endpointBothActive ? 2 : 1) : 0) + lineStyle.weight}
            strokeDasharray={(endpointActive && !endpointBothActive) || lineStyle.type === "dashed" ? "6,8" : lineStyle.type === "dotted" ? "2,4" : undefined}
        />
    </>;
});

const VertexRender = React.memo((props: {
    graph: Graph,
    vertex: Vertex,
    version: number,
    vertexClick: (e: React.MouseEvent, vertex: Vertex, active: boolean) => void,
}) => {
    // console.log('vertex re-render', props.vertex.id);
    const [svg, svgSet] = useState<{
        width: number,
        height: number,
        element: React.ReactElement,
    }>();

    const getSvg = useCallback(async () => {
        const v = props.vertex;
        if(!v) return;

        const promise = v.label?.startsWith('$') ? LatexTypeset(v.label.substring(1)) : undefined;
        if(!promise) return;
        let svgRender = await promise;

        // find viewbox as string
        const viewBox = ViewBoxGet(svgRender);
        const element = <g dangerouslySetInnerHTML={{__html: svgRender}}></g>;

        svgSet({
            width: viewBox.width,
            height: viewBox.height,
            element,
        });
    }, [props.vertex.label]);

    useEffect(() => {
        getSvg().then();
    }, [props.vertex.label]);

    const v = props.vertex;

    const active = props.graph.activeVertices.includes(v.id);
    const style = v.style ?? VertexStyleDefault();
    const scale = (active ? 0.25 : 0) + style.textSize / 14;

    const cliqueAmount = props.graph.cliqueVertexCounts.get(v.id);

    return <>
        <g data-vertex={v.id}
           x={v.position.x} y={v.position.y}
           onMouseDown={e => props.vertexClick(e, v, active)}
        >
            <circle
                cx={v.position.x} cy={v.position.y}
                r={style.radius}
                fill={style.bgColor}
                stroke={style.lineStyle.color}
                strokeWidth={(active ? 1.5 : 0) + (!isNaN(style.lineStyle.weight) ? style.lineStyle.weight : 1)}
                strokeDasharray={v.disabled || style.lineStyle.type === "dashed" ? "6,8" : style.lineStyle.type === "dotted" ? "2,4" : undefined}
            />
            {svg ?
                <g transform={`translate(${v.position.x - scale * svg.width / 2}, ${v.position.y - scale * svg.height / 2}) scale(${scale})`}>
                    <rect
                        x={-scale * svg.width * 0.25}
                        y={-scale * svg.height * 0.25}
                        fill="#ffffff05"
                        width={scale * svg.width}
                        height={scale * svg.height}
                    />

                    {svg.element}
                </g> :
                <text className="select-none"
                      x={v.position.x} y={v.position.y}
                      fill={style.textColor}
                      fontSize={style.textSize}
                      fontWeight={active && style.radius<3 ? 'bold' : undefined}
                      textAnchor="middle"
                      dominantBaseline="middle"
            >
                {v.label ? v.label : v.id}
            </text>
        }
        {cliqueAmount && <>
            <circle
                cx={v.position.x} cy={v.position.y - style.radius - 1}
                r={8}
                fill={style.bgColor}
            />
            <text
                className="select-none"
                x={v.position.x} y={v.position.y}
                    dy={-style.radius-1}
                    fill={style.textColor}
                    fontSize={style.textSize}
                    textAnchor="middle"
                    dominantBaseline="middle"
                >
                    {cliqueAmount}
                </text>
            </>}
        </g>
    </>;
});
