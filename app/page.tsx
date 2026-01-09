'use client'

import React, {JSX, useCallback, useEffect, useRef, useState} from "react";
import Graph, {
    GraphData,
    LineStyle,
    LineStyleClone,
    LineStyleDefault,
    VertexStyleDefault,
    weightToWidth
} from "@/app/data/Graph";
import {Vertex, VertexStyle, VertexStyleClone} from "@/app/data/Vertex";
import Vector2 from "@/app/data/Vector2";
import {DateToLocalWithTime} from "@/app/util/DateUtils";
import {ArrayEquals} from "@/app/util/ArrayUtils";
import {ColorHexSetTransparency} from "@/app/util/ColorUtils";
import {HexColorPicker} from "react-colorful";
import useClickOutside from "@/app/hooks/useClickOutside";
import {PromiseWait} from "@/app/util/PromiseUtils";

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
        const inducedForbidden: Graph[] = [];
        for (const forbidden of components) {
            inducedForbidden.push(...activeGraph.inducedSubgraphs(forbidden));
        }
        graph.forbiddenInduced = inducedForbidden;
        console.log('inducedForbidden', inducedForbidden);
        console.log('################################################');

        // mark the induced forbidden subgraphs with red edges
        graph.edgesForbidden.clear();
        for (const subgraph of inducedForbidden) {
            for (const v of subgraph.vertices.values()) {
                for (const v2 of v.neighbors) {
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
                if (!e.shiftKey && !e.ctrlKey) getForbiddenSubgraphs();
            }
            // prevent window closing
            else if (e.key === "w" || e.key === "W") {
                if(e.ctrlKey) e.preventDefault();

                e.preventDefault();
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
            <div className="flex gap-2 p-2 border-b border-r">
                <div className="h-100% pt-1 ml-2">Induced Forbidden Subgraphs</div>

                <button className="tooltip" onClick={getForbiddenSubgraphs}>
                    <kbd>F</kbd>
                    <div className="tooltiptext">Find induced forbidden subgraphs in the selection</div>
                </button>

                <div className="h-100% pt-1 ml-1">Found: {graph?.forbiddenInduced.length ?? 0}</div>
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
    mouseStartOffset: Vector2;
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
    const [overlappingForbidden, _] = useState<{ activeVertices: number[], forbidden: Graph[] }>({
        activeVertices: [],
        forbidden: []
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
                if (v) graph.vertexRemove(v);
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
        if (graph.edgeHas(from, to)) graph.edgeRemove(from, to);
        else graph.edgeAdd(from, to);
    }, []);
    const keyboardFunctionEdgesAdd = useCallback((graph: Graph, from: Vertex, to: Vertex) => {
        if (!graph.edgeHas(from, to)) graph.edgeAdd(from, to);
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
        }
        updateSet(new Date());
    }, []);

    const keyboardToggleShowOverlappingForbidden = useCallback(() => {
        showOverlappingForbiddenSet(v => !v);
    }, []);

    // keyboard functions without any dependencies
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!graph || !graph.active) return;
            // console.log(e.key, e.ctrlKey, e.shiftKey)

            // delete currently selected vertices / edges
            if (e.key === "Delete" || e.key === "x") {
                keyboardDeleteSelection(graph);
                saveDataSave();
            }
            // clear selection
            else if (e.key === "Escape") {
                graph.activeVertices = [];
            }
            // export / save
            else if (e.key === "s" || e.key === "S") {
                if (e.ctrlKey && e.shiftKey) {
                    exportSelection(svgRef.current!, graph, graph.activeVertices);
                    e.preventDefault();
                } else if (e.ctrlKey) {
                    e.preventDefault();
                }
            }
            // "e": toggle/add edges in selection
            else if (e.key === "e" || e.key === "E") {
                keyboardEdges(e, graph);
                e.preventDefault();
                saveDataSave();
            }
            // "d": disable selection
            else if (e.key === "d") {
                keyboardDisableSelection(graph);
                e.preventDefault();
                saveDataSave();
            }
            // "shift+F": toggle showing overlapping
            else if (e.key === "F") {
                keyboardToggleShowOverlappingForbidden();
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
                    e.preventDefault();
                }
            }
            // paste / add vertex
            else if (e.key === "v") {
                if (e.ctrlKey) {
                    if (clipboard) {
                        graph.activeVertices = graph.addSubgraph(clipboard.graph, clipboard.mouseWorld, screenToWorld(mouseLast.screen));

                        updateSet(new Date());
                        e.preventDefault();
                        saveDataSave();
                    }
                }
                // add vertex
                else {
                    keyboardAddVertex(graph);
                    e.preventDefault();
                    saveDataSave();
                }
            }
            // "+": zoom in
            else if (e.key === "+") {
                zoomChange(undefined, true, mouseLast.screen);
                e.preventDefault();
            }
            // "-": zoom in
            else if (e.key === "-") {
                zoomChange(undefined, false, mouseLast.screen);
                e.preventDefault();
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
        }
        updateSet(new Date());
    }, []);
    const keyboardFunctionPropertiesEdgePick = useCallback((graph: Graph) => {
        if (!graph) return;

        // pick the first we find
        for (const fromId of graph.activeVertices) {
            for (const toId of graph.activeVertices) {
                if (fromId === toId) continue;

                const lineStyle = LineStyleClone(graph.edgeStyle.get(fromId)?.get(toId) ?? LineStyleDefault());
                propertiesSet(p => {
                    return {...p, vertexStyle: {...p.vertexStyle, lineStyle: lineStyle}};
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
            // no shift key: clear selection
            let activeVerticesStart = [...graph.activeVertices];

            if (!e.ctrlKey && !e.shiftKey) {
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
                    if (!boxSelect.ctrl || boxSelect.shift) {
                        if (!active.includes(vertex.id)) {
                            active.push(vertex.id);
                            continue;
                        }
                    }
                    // ctrl: remove from selection
                    if (boxSelect.ctrl) {
                        const index = active.indexOf(vertex.id);
                        if (index >= 0) active.splice(index, 1);
                    }
                }
            }

            if (!ArrayEquals(graph.activeVertices, active)) {
                graph.activeVertices = active;
                updateSet(new Date());
            }
            // boxSelectSet({...boxSelect, to: getMousePositionScreen(e)});
        }

        // move active vertex
        if (dragVertex) {
            const pos = getMousePositionWorld(e).plus(dragVertex.mouseStartOffset).grid(view.gridSize);

            const v = graph.vertexGet(dragVertex.vertex);
            if (v) {
                // move other selected vertices relative to v's current position
                if (!dragVertex.ctrlKey) {
                    for (const vId of graph.activeVertices) {
                        const vertex = graph.vertexGet(vId);
                        if (!vertex || vertex.id === v.id) continue;
                        vertex.position = new Vector2(pos.x + vertex.position.x - v.position.x, pos.y + vertex.position.y - v.position.y);
                    }
                }

                v.position = pos;
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

    const edgeClick = useCallback((e: React.MouseEvent, fromId: number, toid: number) => {
        if (e.button !== 0) return;
        /* graph.activeVertices = [fromId, toid];
        e.stopPropagation();*/
    }, []);

    const vertexClick = useCallback((e: React.MouseEvent, v: Vertex, active: boolean) => {
        if (e.button !== 0) return;

        if (e.shiftKey) {
            if (!active) graph.activeVertices.push(v.id);
            else {
                const copy = [...graph.activeVertices];
                const index = copy.indexOf(v.id);
                if (index >= 0) {
                    copy.splice(index, 1);
                }
                graph.activeVertices = copy;
            }
        } else {
            if (!active) graph.activeVertices = [v.id];

            const mousePos = getMousePositionWorld(e);
            dragVertexSet({vertex: v.id, mouseStartOffset: v.position.minus(mousePos), ctrlKey: e.ctrlKey});
        }

        e.stopPropagation();
        e.preventDefault();
        updateSet(new Date());
    }, [graph, getMousePositionWorld]);

    const renderOverlappingForbidden = useCallback((graph: Graph) => {
        if (!graph || !showOverlappingForbidden) return [];
        const activeVertices = graph.activeVertices;
        const activeVerticesElements = activeVertices.join(',');

        // update filtered graphs if selection changed
        if (!ArrayEquals(graph.activeVertices, overlappingForbidden.activeVertices)) {
            overlappingForbidden.activeVertices = [...graph.activeVertices];
            overlappingForbidden.forbidden = activeVertices.length > 0 ? graph.forbiddenInduced.filter(g => g.containsVertices(activeVertices)) : graph.forbiddenInduced;
        }

        return overlappingForbidden.forbidden.map((g: Graph, index: number) => {
            const ownVertices = g.vertices.values().map(v => v.id).toArray();
            return <button key={index} className="block border-b w-full cursor" onClick={() => {
                graph.activeVertices = ownVertices;
                updateSet(new Date());
            }}>
                <span className="font-bold mr-2">{activeVerticesElements}</span>
                <span>{ownVertices.filter(v => !activeVertices.includes(v)).join(',')}</span>
            </button>
        })
    }, [update, overlappingForbidden, showOverlappingForbidden])

    const propertiesEdit = useCallback((graph: Graph, properties: PropertyData) => {
        if(!graph || graph.activeVertices.length === 0) return;

        // update current selection to changed properties
        /*for(const vId of graph.activeVertices) {
            const vertex = graph.vertexGet(vId);
            if(!vertex) continue;

            vertex.style =
        }

        updateSet(new Date());*/
    }, []);

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
                            <div className="p-2 border-b">
                                <h2 className="font-bold">Forbidden Subgraphs</h2>
                                <ul>
                                    <li>The left (big) window is the main window containing the graph.</li>
                                    <li>The right (smaller) window contains the forbidden subgraphs - every component is
                                        one forbidden subgraph.
                                    </li>
                                    <li>Press <kbd>F</kbd> to find forbidden subgraphs in the selection.
                                    </li>
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
                    <PropertiesDisplay graph={graph} properties={properties} propertiesChanged={propertiesEdit} />
                </div>}
            </div>
            <div className="flex-1 relative">
                <svg
                    ref={svgRef}
                    className="h-full w-full bg-gray-50 relative"
                    onMouseDown={onMouseDownCanvas}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onWheel={onWheel}
                >
                    <g ref={worldRef} transform={`translate(${view.pan.x}, ${view.pan.y}) scale(${view.zoom})`}>
                        <GraphRender graph={graph}
                                     edgeClick={edgeClick}
                                     vertexClick={vertexClick}
                                     activeVertices={graph.activeVertices}

                                     update={update}
                        />
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
                            {overlappingForbidden.forbidden.length} forbidden in selection
                            <div className="overflow-y-auto border-y"
                                 style={{
                                     maxHeight: "160px"
                                 }}>
                                {renderOverlappingForbidden(graph)}
                            </div>
                        </div>
                    </div>}
            </div>
        </div>
    );
}

type PropertyDataColor = 'lineColor' | 'bgColor' | 'textColor';
const PropertiesDisplay = React.memo((props: {
    graph: Graph,
    properties: PropertyData,
    propertiesChanged: (g: Graph, p: PropertyData) => void,
}) => {
    const [_, updateSet] = useState<Date>(new Date());

    const propertiesChanged = useCallback(() => {
        props.propertiesChanged(props.graph, props.properties);
    }, [props.graph, props.properties, props.propertiesChanged]);

    const popover = useRef<HTMLDivElement | null>(null);
    const [colorOpen, colorOpenSet] = useState<PropertyDataColor>();

    const colorOpenSetWithWait = useCallback(async (c: PropertyDataColor) => {
        await PromiseWait(3)
        colorOpenSet(c);
    }, [colorOpenSet]);
    const doColorClose = useCallback(() => colorOpenSet(undefined), [colorOpenSet]);
    useClickOutside(popover, doColorClose);

    const titleGet = useCallback((c: PropertyDataColor|undefined) => {
        switch (c) {
            case 'lineColor':
                return <span>Line Color</span>
            case 'bgColor':
                return <span>Vertex Fill Color</span>
            case 'textColor':
                return <span>Text Color</span>
            case undefined:
                break;
            default:
                console.error("property data color unknown: ", c);
                break;
        }
        return <></>
    }, []);
    const colorGet = useCallback((p: PropertyData, c: PropertyDataColor|undefined) => {
        switch (c) {
            case 'lineColor':
                return p.vertexStyle.lineStyle.color;
            case 'bgColor':
                return p.vertexStyle.bgColor;
            case 'textColor':
                return p.vertexStyle.textColor;
            case undefined:
                break;
            default:
                console.error("property data color unknown: ", c);
                break;
        }
        return '#000000';
    }, []);
    const colorSet = useCallback((p: PropertyData, c: PropertyDataColor|undefined, v: string) => {
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
            case undefined:
                break;
            default:
                console.error("property data color unknown: ", c);
                break;
        }
        propertiesChanged();
    }, [propertiesChanged]);

    return <>
        <div className="relative">
            <button className="swatch text-outline font-bold mr-2"
                 style={{color: props.properties.vertexStyle.bgColor}}
                 onClick={() => colorOpenSetWithWait('bgColor')}
            >
                BG
            </button>
            <button className="swatch font-bold mr-2"
                 style={{color: props.properties.vertexStyle.lineStyle.color}}
                 onClick={() => colorOpenSetWithWait('lineColor')}
            >
                Li
            </button>
            <button className="swatch font-bold mr-2"
                 style={{color: props.properties.vertexStyle.textColor}}
                 onClick={() => colorOpenSetWithWait('textColor')}
            >
                T
            </button>

            {/* color picker */}
            <div ref={popover} className="popover bg-white" style={{display: colorOpen ? 'block' : 'none'}}>
                <h4 className="text-center p-1">
                    {titleGet(colorOpen)}
                </h4>
                {colorOpen && <>
                    <HexColorPicker color={colorGet(props.properties, colorOpen)} onChange={v => {
                        colorSet(props.properties, colorOpen, v);
                        updateSet(new Date());
                    }}/>
                    <div className="text-center">
                        <input className='my-2 text-center' type='text' value={colorGet(props.properties, colorOpen)} onChange={v => {
                            colorSet(props.properties, colorOpen, v.target.value);
                            updateSet(new Date());
                        }} />
                    </div>
                </>}
            </div>
        </div>
    </>;
})

const GraphRender = React.memo((props: {
    graph: Graph,
    activeEdge?: Vector2,
    activeVertices: number[],
    update?: Date,

    edgeClick: (e: React.MouseEvent, fromId: number, toId: number) => void,
    vertexClick: (e: React.MouseEvent, vertex: Vertex, active: boolean) => void,
}) => {
    // console.log('graph re-render')

    const renderEdges = useCallback((graph: Graph) => {
        if (!graph) return;
        const activeEdge = props.activeEdge;
        const activeVertices = props.activeVertices;

        const lines: JSX.Element[] = [];

        for (const v of graph.vertices.values()) {
            for (const nId of v.neighbors) {
                if (v.id >= nId) continue;
                const key = v.id + "-" + nId;

                const n = graph.vertexGet(nId);
                if (!n) continue;

                const active = activeEdge && (
                    (v.id === activeEdge.x && nId === activeEdge.y)
                    || (v.id === activeEdge.y && nId === activeEdge.x)
                );

                const fromActive = activeVertices.includes(v.id);
                const toActive = activeVertices.includes(nId);
                const endpointActive = fromActive || toActive;
                const endpointBothActive = fromActive && toActive;

                const lineStyle = graph.edgeStyle.get(v.id)?.get(nId) ?? LineStyleDefault();
                const forbidden = graph.edgesForbidden.get(v.id)?.has(nId);

                const color = forbidden ? '#ff0000' : lineStyle.color;
                lines.push(
                    <line
                        key={key + "-bg"}
                        data-ui="true"
                        x1={v.position.x} y1={v.position.y}
                        x2={n.position.x} y2={n.position.y}
                        stroke={active ? 'orange' : '#ffffff02'}
                        strokeWidth={(active ? 0 : 16) + weightToWidth(lineStyle.weight)}
                        strokeDasharray={lineStyle.type === "dashed" ? "6,4" : lineStyle.type === "dotted" ? "2,4" : undefined}
                        onClick={e => props.edgeClick(e, v.id, nId)}
                    />
                );
                lines.push(
                    <line
                        key={key}
                        data-edge-from={v.id} data-edge-to={n.id}
                        x1={v.position.x} y1={v.position.y}
                        x2={n.position.x} y2={n.position.y}
                        stroke={endpointActive ? ColorHexSetTransparency(color, endpointBothActive ? 'a0' : '80') : color + '40'}
                        strokeWidth={(endpointActive ? (endpointBothActive ? 2 : 1) : 0) + weightToWidth(lineStyle.weight)}
                        strokeDasharray={(endpointActive && !endpointBothActive) || lineStyle.type === "dashed" ? "6,8" : lineStyle.type === "dotted" ? "2,4" : undefined}
                        onClick={e => props.edgeClick(e, v.id, nId)}
                    />
                );
            }
        }
        return lines;
    }, [props.activeEdge, props.activeVertices]);

    const vertexLabel = useCallback((v: Vertex, style?: VertexStyle) => {
        switch (style?.show ?? 'id:label') {
            case 'id:label':
                break;
            case 'id':
                return v.id;
            case 'label':
                return v.label;
            case 'none':
                return '';
            default:
                console.error('drawing vertex: style.show unknown: ', style?.show);
                break;
        }
        if(v.label) return v.id + ':' + v.label;
        return v.id;
    }, []);

    const renderVertices = useCallback((graph: Graph) => {
        if (!graph) return;
        const activeVertices = props.activeVertices;

        const nodes: JSX.Element[] = [];
        for (const v of graph.vertices.values()) {
            const active = activeVertices.includes(v.id);
            const style = v.style ?? VertexStyleDefault();
            const label = vertexLabel(v, style);

            nodes.push(
                <g key={v.id}
                   data-vertex={v.id}
                   onMouseDown={e => props.vertexClick(e, v, active)}
                >
                    <circle
                        cx={v.position.x} cy={v.position.y}
                        r={style.radius}
                        fill={style.bgColor}
                        stroke={style.lineStyle.color}
                        strokeWidth={(active ? 1.5 : 0) + weightToWidth(style.lineStyle.weight)}
                        strokeDasharray={v.disabled || style.lineStyle.type === "dashed" ? "6,8" : style.lineStyle.type === "dotted" ? "2,4" : undefined}
                    />
                    {label && <text
                        className="select-none"
                        x={v.position.x} y={v.position.y}
                        fill={style.textColor}
                        fontSize={14}
                        textAnchor="middle"
                        dominantBaseline="middle"
                    >
                        {label}
                    </text>}
                </g>
            );
        }
        return nodes;
    }, [props.activeVertices]);

    return <>
        {renderEdges(props.graph)}
        {renderVertices(props.graph)}
    </>
})