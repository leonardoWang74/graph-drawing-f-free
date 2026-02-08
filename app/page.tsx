'use client'

import React, {JSX, useCallback, useEffect, useRef, useState} from "react";
import Graph, {
    BoundingVertices,
    GraphData,
    LineStyle,
    LineStyleClone,
    LineStyleDefault,
    LineStyleEdgeRemoved,
    SubgraphWithHull,
    VertexStyleDefault
} from "@/app/data/Graph";
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
        /*indexedDB.
        ldb.setItem('save-data', JSON.stringify(saveData));*/
        // console.log(JSON.stringify(saveData));
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
        else return;

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
                    <GraphEditor windowType="main" height={100} graph={graph} saveData={saveData}
                                 saveDataSave={saveDataSave}
                                 update={update} updateSet={updateSet} setGraphActive={setGraphActive}/>}
                {forbidden && saveData &&
                    <GraphEditor windowType="forbidden" height={0} graph={forbidden} saveData={saveData}
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

export interface ViewData {
    zoom: number;
    pan: Vector2;
    gridSize: number;
}

interface VertexDragData {
    positionStart: Vector2;

    /** where the mouse position would place the vertex (if not for the align lines) */
    positionNow: Vector2;

    mouseStartOffset?: Vector2;
    vertex: number;
    /** pressed ctrl before dragging, only move this vertex instead of whole selection  */
    ctrlKeyInit: boolean;

    /** shift DURING dragging, align to angle lines */
    shiftKeyNow: boolean;
    /** ctrl DURING dragging, align to other visible vertices */
    ctrlKeyNow: boolean;
}

interface PropertyData {
    /** also includes a line style for edges */
    vertexStyle: VertexStyle;

    open: boolean;
}

const zoomThresholdVertices = 0.41;
const zoomThresholdNoEdges = 0.21;

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

    const [properties, propertiesSet] = useState<PropertyData>({vertexStyle: VertexStyleDefault(), open: false});

    const [view, viewSet] = useState<ViewData>(graph.viewData ?? {zoom: 1, pan: new Vector2(0, 0), gridSize: 1});
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
        cliques: SubgraphWithHull[],
        cliquesNot: SubgraphWithHull[],
        cliquesVersion: number,

        cliquesCritical: SubgraphWithHull[],
        cliquesCriticalNot: SubgraphWithHull[],
        cliquesCriticalVersion: number,
    }>({
        activeVertices: [],
        forbidden: [],
        forbiddenNot: [],
        forbiddenVersion: 0,

        cliques: [],
        cliquesNot: [],
        cliquesVersion: 0,

        cliquesCritical: [],
        cliquesCriticalNot: [],
        cliquesCriticalVersion: 0,
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
            graph.visibleUpdateGrid();
            graph.setVisible();
            graph.activeVertices = [];
            updateSet(new Date());
        }
    }, []);

    const exportVisible = useCallback(async (svg: SVGSVGElement, graph: Graph, selectedVertices: number[], asPng=true) => {
        if (!svg) return;
        let filename = graph.name;

        // clone SVG
        const clone = svg.cloneNode(true) as SVGSVGElement;

        // SVG namespace
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.removeAttribute("class");

        // get bounding box
        const box = graph.getBoundingVerticesSubgraph(selectedVertices);
        if(!box) return;
        let xMin = box.leftMost.position.x - (box.leftMost.style?.radius??0) - (box.leftMost.svg?.width ?? 0);
        let xMax = box.rightMost.position.x + (box.rightMost.style?.radius??0) + (box.rightMost.svg?.width ?? 0);

        let yMin = box.upperMost.position.y - (box.upperMost.style?.radius??0) - (box.upperMost.svg?.height ?? 0);
        let yMax = box.bottomMost.position.y + (box.bottomMost.style?.radius??0) + (box.bottomMost.svg?.height ?? 0);

        const bbox = {
            x: Math.round((xMin + xMax) / 2),
            y: Math.round((yMin + yMax) / 2),

            width: Math.round((xMax - xMin) * 1.1 + 5),
            height: Math.round((yMax - yMin) * 1.1 + 5),
        };

        // filter vertices and edges: only selected (active) vertices
        filename += '-subgraph-' + selectedVertices.length;

        // remove vertices not selected
        clone.querySelectorAll("[data-vertex]").forEach(el => {
            const id = Number(el.getAttribute("data-vertex"));
            if (!selectedVertices.includes(id)) {
                el.remove();
                return;
            }
            el.removeAttribute("data-vertex");
            el.removeAttribute("pointer-events");
        });

        // move other stuff
        clone.querySelectorAll(".select-none").forEach(el => {
            el.removeAttribute("class");
        });

        // remove edges not fully inside selection
        clone.querySelectorAll("[data-edge-from]").forEach(el => {
            const from = Number(el.getAttribute("data-edge-from"));
            const to = Number(el.getAttribute("data-edge-to"));

            if (!selectedVertices.includes(from) || !selectedVertices.includes(to)) {
                el.remove();
            }

            el.removeAttribute("data-edge-from");
            el.removeAttribute("data-edge-to");
            el.removeAttribute("pointer-events");
        });

        // remove UI
        clone.querySelectorAll("[data-ui]").forEach(el => el.remove());

        // set bounding box
        const world = clone.querySelector("#svgWorldRef") as SVGGElement;
        if (!world) return;
        world.removeAttribute("transform");
        const zoom = +(world.getAttribute("data-zoom") ?? 1);

        console.log(bbox);
        clone.setAttribute(
            "viewBox",
            `${bbox.x - bbox.width/2} ${bbox.y-bbox.height/2} ${bbox.width} ${bbox.height}`
        );
        clone.setAttribute("width", `${bbox.width}`);
        clone.setAttribute("height", `${bbox.height}`);
        /*world.setAttribute(
            "transform",
            `translate(${-bbox.x}, ${-bbox.y})`
        );*/

        // serialize SVG
        const serializer = new XMLSerializer();
        const source = serializer.serializeToString(clone);

        const blob = new Blob([source], {
            type: "image/svg+xml;charset=utf-8",
        });

        // trigger save dialog
        const url = URL.createObjectURL(blob);

        // export as SVG
        if(!asPng) {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        // export as PNG
        else {
            const scale = zoom * 2;

            // load SVG into Image
            const img = new Image();
            img.crossOrigin = "anonymous";

            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = reject;
                img.src = url;
            });

            // create canvas
            const canvas = document.createElement("canvas");
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext("2d")!;
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);

            URL.revokeObjectURL(url);

            // export PNG
            canvas.toBlob(blob => {
                if (!blob) return;
                const pngUrl = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = pngUrl;
                a.download = filename + ".png";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                URL.revokeObjectURL(pngUrl);
            }, "image/png");
        }
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

            const toDisable = [];
            const toEnable = [];
            for(const nid of vertex.neighbors) {
                if(vId >= nid) continue;
                if(!graph.activeVertices.includes(nid)) continue;
                toDisable.push(nid);
            }
            for(const nid of vertex.neighborsRemoved) {
                if(vId >= nid) continue;
                if(!graph.activeVertices.includes(nid)) continue;
                toEnable.push(nid);
            }

            for(const nid of toDisable) {
                const neighbor = graph.vertexGet(nid);
                if(!neighbor) continue;
                graph.edgeRemove(vertex, neighbor);
                vertex.neighborsRemoved.add(nid);
            }
            for(const nid of toEnable) {
                const neighbor = graph.vertexGet(nid);
                if(!neighbor) continue;
                graph.edgeAdd(vertex, neighbor);
                vertex.neighborsRemoved.delete(nid);
            }

            // vertex.disabled = !vertex.disabled;
            ++vertex.version;
        }
        updateSet(new Date());
    }, []);

    const keyboardToggleShowOverlappingForbidden = useCallback(() => {
        showOverlappingForbiddenSet(v => !v);
    }, []);

    const keyboardMaximalCliques = useCallback((graph: Graph) => {
        const now = new Date();
        graph.cliquesMaximal = [];
        const cliquesMaximal = graph.getSubgraphAlgorithm(graph.activeVertices).getMaximalCliques();
        ++graph.cliquesVersion;
        const duration = new Date() - now;

        // remove number of cliques in selection
        for(const vId of graph.activeVertices) {
            graph.cliqueVertexCounts.delete(vId);
        }

        // count number of cliques per vertex
        for(const subgraph of cliquesMaximal) {
            if(subgraph.size <= 1) continue;

            for(const vId of subgraph) {
                graph.cliqueVertexCounts.set(vId, (graph.cliqueVertexCounts.get(vId) ?? 0) + 1);
            }

            graph.cliquesMaximal.push({
                clique: subgraph,
                hull: []
            })
        }
        graph.setHulls(graph.cliquesMaximal);

        // update version: updated number of cliques
        graph.incrementVersion(graph.activeVertices);

        console.log('found maximal cliques: ', cliquesMaximal.length, ` in time ${duration} ms`)
        updateSet(new Date());
    }, []);

    const keyboardCriticalCliques = useCallback((graph: Graph) => {
        const now = new Date();
        graph.cliquesCritical = [];
        const cliquesCritical = graph.getSubgraphAlgorithm(graph.activeVertices).getCriticalCliques();
        ++graph.cliquesCriticalVersion;
        const duration = new Date() - now;

        // count number of cliques per vertex
        for(const subgraph of cliquesCritical) {
            graph.cliquesCritical.push({
                clique: subgraph,
                hull: []
            })
        }
        graph.setHulls(graph.cliquesCritical, 3);

        // update version: updated number of cliques
        graph.incrementVersion(graph.activeVertices);

        console.log('found critical cliques: ', cliquesCritical.length, ` in time ${duration} ms`)
        updateSet(new Date());
    }, []);

    // keyboard functions without any dependencies except graph
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!graph || !graph.active) return;
            // console.log(e.key, e.ctrlKey, e.altKey, e.shiftKey)

            // delete currently selected vertices / edges
            if (e.key === "Delete" || e.key === "x") {
                if(!EventKeyboardCanFire(e, true)) return;
                if(e.ctrlKey) return;
                keyboardDeleteSelection(graph);
                saveDataSave();
            }
            // export / save selection
            else if (e.key === "s" || e.key === "S") {
                if(!EventKeyboardCanFire(e, true)) return;

                // saved selection
                if (!e.ctrlKey && !e.shiftKey) {
                    graph.savedVerticesSet([...graph.activeVertices]);
                    updateSet(new Date());
                    e.preventDefault();
                }
                // prevent Ctrl+S save dialogue
                else if(e.ctrlKey && e.shiftKey) {
                    exportVisible(svgRef.current!, graph, graph.verticesVisible.map(v => v.id), e.altKey);
                    e.preventDefault();
                }
                // prevent Ctrl+S save dialogue
                else if(e.ctrlKey) {
                    saveDataSave();
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

                if(e.shiftKey) keyboardCriticalCliques(graph);
                else keyboardMaximalCliques(graph);

                e.preventDefault();
            }
            // "O": find maximal cliques
            else if (e.key === "o" || e.key === "O") {
                if(!EventKeyboardCanFire(e)) return;
                if(e.ctrlKey) return;

                const selectedGraph = graph.getSubgraphAlgorithm(graph.activeVertices);

                const boundingBox = selectedGraph.getBoundingVerticesSubgraph(graph.activeVertices)!;
                const center = new Vector2(
                    (boundingBox.leftMost.position.x + boundingBox.rightMost.position.x) / 2,
                    (boundingBox.upperMost.position.y + boundingBox.bottomMost.position.y) / 2
                );
                const width = boundingBox.rightMost.position.x - boundingBox.leftMost.position.x;

                const now = new Date();
                for(let k=0; k<50; ++k) {
                    const solutionList = e.shiftKey ? [...selectedGraph.overlappingSolutionsSEqualsTwoBranchAndBound(k)] : selectedGraph.overlappingClusterEditingEnumerate(2, k);
                    if(solutionList.length > 0) {
                        console.log('found overlapping cluster solution with k=',k, solutionList, ' in ',new Date()-now, 'ms');
                        let i = 0;
                        for(const solution of solutionList) {
                            solution.subgraphCopyInfo(graph);
                            solution.styleEdgesOnAddedAndRemoved();
                            graph.addSubgraph(solution, center, center.plus(new Vector2(width * (1.4 + i * 1.25), 0)))
                            ++i;
                        }
                        break;
                    }
                    console.log('no solution for k=',k);
                }

                saveDataSave();
                graph.visibleUpdateGrid();
                graph.setVisible();
                updateSet(new Date());
                e.preventDefault();
            }
            // "A": select all
            else if (e.key === "a" || e.key === "A") {
                if(!EventKeyboardCanFire(e, true)) return;
                if(e.ctrlKey) {
                    graph.activeVerticesSet(graph.vertices.values().toArray().map(v => v.id));
                    updateSet(new Date());

                }
                e.preventDefault();
            }
            // "L": align in line
            else if(e.key === 'l' || e.key === 'L') {
                if(!EventKeyboardCanFire(e, true)) return;
                if(graph.activeVertices.length < 2) return;
                const n = graph.activeVertices.length;
                let first = graph.vertexGet(graph.activeVertices[0]);
                let last = graph.vertexGet(graph.activeVertices[n-1]);
                if(!first || !last) return;
                const deltaX = (last.position.x - first.position.x) / (n - 1);
                const deltaY = (last.position.y - first.position.y) / (n - 1);
                for(let i=0; i<n; ++i) {
                    const v = graph.vertexGet(graph.activeVertices[i]);
                    if(!v) continue;
                    v.position = new Vector2(first.position.x + i * deltaX, first.position.y + i * deltaY);
                    ++v.version;
                }
            }
            // Arrowkeys: align / move current
            else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
                if(!EventKeyboardCanFire(e, true)) return;

                // align
                if(e.altKey) {
                    const bounds = graph.getBoundingVerticesSubgraph(graph.savedSelection);
                    if(!bounds) return;

                    // align to extreme value
                    let getterBoundFunction: (bounds: BoundingVertices) => Vertex|undefined;
                    let setterVectorFunction: (bound: Vector2, value: Vector2) => Vector2;
                    switch (e.key) {
                        case 'ArrowUp':
                            getterBoundFunction = (bounds) => bounds.upperMost;
                            setterVectorFunction = (bound, v) => new Vector2(v.x, bound.y);
                            break;
                        case 'ArrowDown':
                            getterBoundFunction = (bounds) => bounds.bottomMost;
                            setterVectorFunction = (bound, v) => new Vector2(v.x, bound.y);
                            break;
                        case 'ArrowLeft':
                            getterBoundFunction = (bounds) => bounds.leftMost;
                            setterVectorFunction = (bound, v) => new Vector2(bound.x, v.y);
                            break;
                        case 'ArrowRight':
                            getterBoundFunction = (bounds) => bounds.rightMost;
                            setterVectorFunction = (bound, v) => new Vector2(bound.x, v.y);
                            break;
                        default:
                            return;
                    }

                    // align components to extreme value
                    if(!e.shiftKey && !e.ctrlKey) {
                        const bound = getterBoundFunction(bounds);
                        if(!bound) return;

                        const componentsSelected = graph.getSubgraphAlgorithm(graph.activeVertices).getComponents();

                        // apply aggregate to components
                        for(const component of componentsSelected) {
                            // find most extreme vertex
                            const boundsComponent = graph.getBoundingVerticesSubgraph(component.getVertexIDs());
                            if(!boundsComponent) continue;
                            const boundComponent = getterBoundFunction(boundsComponent);
                            if(!boundComponent) continue;

                            // apply aggregate to most extreme vertex
                            const positionOld = boundComponent.position;
                            const positionNew = setterVectorFunction(bound.position, boundComponent.position);
                            const delta = positionNew.minus(positionOld);

                            // apply position delta to vertices in component
                            for(const vSub of component.vertices.values()) {
                                const v = graph.vertexGet(vSub.id);
                                if(!v) continue;
                                v.position = v.position.plus(delta);
                                ++v.version;
                            }
                        }
                    }
                    // align last selected component to center value
                    else if(e.shiftKey) {
                        let boundMinMax: {min: Vertex, max: Vertex}|undefined = undefined;
                        switch (e.key) {
                            case 'ArrowUp':
                            case 'ArrowDown':
                                boundMinMax = {min: bounds.bottomMost, max: bounds.upperMost};
                                break;
                            case 'ArrowLeft':
                            case 'ArrowRight':
                                boundMinMax = {min: bounds.leftMost, max: bounds.rightMost};
                                break;
                            default:
                                return;
                        }
                        const center = new Vector2(
                            (bounds.leftMost.position.x + bounds.rightMost.position.x) / 2,
                            (bounds.bottomMost.position.y + bounds.upperMost.position.y) / 2
                        );

                        // apply aggregate to selection
                        // find most extreme vertex
                        const boundsComponent = graph.getBoundingVerticesSubgraph(graph.activeVertices);
                        if(!boundsComponent) return;

                        // move center of component to center of aggregate
                        const positionOld = new Vector2(
                            (boundsComponent.leftMost.position.x + boundsComponent.rightMost.position.x) / 2,
                            (boundsComponent.bottomMost.position.y + boundsComponent.upperMost.position.y) / 2
                        );
                        const positionNew = setterVectorFunction(center, positionOld);
                        const delta = positionNew.minus(positionOld);

                        // apply position delta to vertices in component
                        for(const vId of graph.activeVertices) {
                            const v = graph.vertexGet(vId);
                            if(!v) continue;
                            v.position = v.position.plus(delta);
                            ++v.version;
                        }
                    }
                    // align every vertex to extreme value
                    /*else if(e.shiftKey) {
                        const bound = getterBoundFunction(bounds);
                        if(!bound) return;

                        // apply aggregate to vertices
                        for(const vId of graph.activeVertices) {
                            const v = graph.vertexGet(vId);
                            if(!v) continue;
                            v.position = setterVectorFunction(bound.position, v.position);
                            ++v.version;
                        }
                    }*/
                }
                // move current
                else {
                    let distance = 1;
                    if(e.ctrlKey) {
                        distance = 0.25;
                    }
                    else if(e.shiftKey) {
                        distance = 10;
                    }

                    let vector: Vector2;
                    switch (e.key) {
                        case 'ArrowUp':
                            vector = new Vector2(0, -distance);
                            break;
                        case 'ArrowDown':
                            vector = new Vector2(0, distance);
                            break;
                        case 'ArrowLeft':
                            vector = new Vector2(-distance, 0);
                            break;
                        case 'ArrowRight':
                            vector = new Vector2(distance, 0);
                            break;
                        default:
                            return;
                    }

                    for(const vId of graph.activeVertices) {
                        const v = graph.vertexGet(vId);
                        if(!v) continue;
                        v.position = v.position.plus(vector);
                        ++v.version;
                    }
                }

                graph.setHulls(graph.cliquesMaximal);
                saveDataSave();
                updateSet(new Date());
                e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [graph, saveDataSave,
        keyboardDeleteSelection, exportVisible, keyboardEdges, keyboardDisableSelection,
        keyboardToggleShowOverlappingForbidden, keyboardCriticalCliques, keyboardMaximalCliques
    ]);

    const keyboardAddVertex = useCallback((graph: Graph) => {
        const v = graph.vertexAdd(Vertex.Vertex(screenToWorld(mouseLast.screen)));
        graph.activeVertices.push(v.id);
        updateSet(new Date());
    }, [mouseLast, screenToWorld]);

    const updateVisible = useCallback((view: ViewData) => {
        const rect = svgRef.current!.getBoundingClientRect();
        graph.visibleUpdateGrid();
        graph.setVisible(
            screenToWorldCalculation(view.pan, view.zoom, new Vector2(0,0)),
            screenToWorldCalculation(view.pan, view.zoom, new Vector2(rect.width,rect.height))
        );
    }, [svgRef, screenToWorldCalculation, updateSet]);

    // initially update visible the first time after loading
    useEffect(() => {
        if(!graph) return;

        if(graph.viewData) {
            updateVisible(graph.viewData);
            viewSet(graph.viewData);
        }
        else {
            updateVisible(view);
        }

        updateSet(new Date());
    }, [graph, updateVisible, updateSet, viewSet]);

    const zoomChange = useCallback((e: React.MouseEvent | undefined, zoomIn: boolean, mouseScreenPosition?: Vector2) => {
        viewSet(view => {
            // different deltas depending on the current zoom
            let delta = 0.25;
            if (view.zoom <= 0.51 && !zoomIn) {
                delta = 0.05;
            } else if (view.zoom < 0.49) {
                delta = 0.05;
            }
            const zoomNew = Math.min(3, Math.max(0.05, view.zoom + delta * (zoomIn ? 1 : -1)));

            // change pan so that mouse / screen center stays at the same world position
            const rect = svgRef.current!.getBoundingClientRect();
            const screenX = e ? e.clientX - rect.left : (mouseScreenPosition?.x ?? rect.width / 2);
            const screenY = e ? e.clientY - rect.top : (mouseScreenPosition?.y ?? rect.height / 2);

            // screenToWorldCalculation(pan, zoom, x, y) = new Vector2((x - pan.x) / zoom, (y - pan.y) / zoom);
            const screenCenterNow = screenToWorldCalculation(view.pan, view.zoom, new Vector2(screenX, screenY));

            // update visible: if too zoomed out hide edges
            if(view.zoom > zoomThresholdNoEdges !== zoomNew <= zoomThresholdNoEdges) {
                graph.incrementVersion(graph.verticesVisible.map(v => v.id));
            }
            if(view.zoom > zoomThresholdVertices !== zoomNew <= zoomThresholdVertices) {
                graph.incrementVersion(graph.verticesVisible.map(v => v.id));
            }

            // screenCenterNew = screenToWorldCalculation(panNew, zoomNew, x,y) = new Vector2((x - panNew.x) / zoomNew, (y - panNew.y) / zoomNew);
            // solving for panNew.x: (x - panNew.x) / zoomNew = screenCenterNow.x
            // solving for panNew.x: panNew.x = x - screenCenterNow * zoomNew
            const viewNew: ViewData = {
                ...view,
                zoom: zoomNew,
                pan: new Vector2(screenX - screenCenterNow.x * zoomNew, screenY - screenCenterNow.y * zoomNew)
            };

            graph.viewData = viewNew;
            updateVisible(viewNew);
            return viewNew;
        });
        updateSet(new Date());
    }, [svgRef, screenToWorldCalculation, updateVisible]);

    // keyboard functions depending on mouse
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!graph || !graph.active) return;
            // console.log(e.key, e.ctrlKey, e.shiftKey)

            // copy
            if (e.key === "c") {
                if(!EventKeyboardCanFire(e, true)) return;
                if (e.ctrlKey) {
                    clipboardSet({
                        graph: graph.getSubgraph(graph.activeVertices),
                        mouseWorld: screenToWorld(mouseLast.screen),
                    });
                }
            }
            // "P": parse
            else if (e.key === "p" || e.key === "P") {
                if(!EventKeyboardCanFire(e)) return;

                const list = [
                    "EANw",
                    "EC^w",
                    "F@d~w",
                    "FCS~w",
                    "F_L~w",
                    "FAl~w",
                    "FEl~w",
                    "FAL~w",
                    "FQl~w",
                    "GCdj~{",
                    "GCdj~{",
                    "FQl~w",
                    "FAL~w",
                    "FEl~w",
                    "FAl~w",
                    "F_L~w",
                    "FCS~w",
                    "F@d~w",
                    "EC^w",
                    "EANw",
                ];

                let x = 0;
                for(const g6 of list) {
                    const graphAdd = Graph.parseGraph6(g6);
                    graphAdd.forceApply(0.01, 150, 2.5, 0.4);
                    graph.addSubgraph(graphAdd, new Vector2(0,0), screenToWorld(mouseLast.screen).plus(new Vector2(x, 0)));

                    const bounds = graphAdd.getBoundingVerticesSubgraph(graphAdd.getVertexIDs());
                    if(bounds) {
                        x += bounds.rightMost.position.x - bounds.leftMost.position.x + 30;
                    }
                }
            }
            // paste / add vertex
            else if (e.key === "v") {
                if(!EventKeyboardCanFire(e, true)) return;
                if (e.ctrlKey) {
                    if (clipboard) {
                        const addedVertices = graph.addSubgraph(clipboard.graph, clipboard.mouseWorld, screenToWorld(mouseLast.screen));
                        graph.activeVerticesSet(addedVertices);

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
        worldRef.current.setAttribute(
            "data-zoom",
            `${view.zoom}`
        );
    }, []);

    const onMouseDownCanvas = useCallback((e: React.MouseEvent) => {
        // left click on canvas = box select / deselect
        if (e.button === 0) {
            let activeVerticesStart = [...graph.activeVertices];

            // no shift / ctrl key: clear selection
            if (!e.ctrlKey && !e.shiftKey) {
                graph.activeVerticesSet([]);
                activeVerticesStart = [];
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
            graph.visibleUpdateGrid();
            panningSet({panStart: view.pan, mouseStart: new Vector2(e.clientX, e.clientY)});
        }
    }, [view, getMousePositionScreen, graph]);


    // keyboard functions depending on dragVertex
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!graph || !graph.active || !dragVertex) return;
            // console.log(e.key, e.ctrlKey, e.altKey, e.shiftKey)

            dragVertex.shiftKeyNow = e.shiftKey;
            dragVertex.ctrlKeyNow = e.ctrlKey;
            updateSet(new Date());
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("keyup", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("keyup", onKey);
        }
    }, [graph, dragVertex]);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!graph) return;

        // pan view
        if (panning) {
            view.pan = new Vector2(
                panning.panStart.x + e.clientX - panning.mouseStart.x,
                panning.panStart.y + e.clientY - panning.mouseStart.y
            );
            updateVisible(view);
            updateTransform(view);
            updateSet(new Date());
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
                graph.activeVerticesSet(active);
                updateSet(new Date());
            }
            // boxSelectSet({...boxSelect, to: getMousePositionScreen(e)});
        }

        // move active vertex
        if (dragVertex) {
            dragVertex.shiftKeyNow = e.shiftKey;
            dragVertex.ctrlKeyNow = e.ctrlKey;

            const v = graph.vertexGet(dragVertex.vertex);
            if (v) {
                const mouseWorld = getMousePositionWorld(e);
                if(!dragVertex.mouseStartOffset) {
                    dragVertex.mouseStartOffset = v.position.minus(mouseWorld);
                }

                const posOriginal = mouseWorld.plus(dragVertex.mouseStartOffset).grid(view.gridSize);
                dragVertex.positionNow = posOriginal.clone();

                let pos = posOriginal;
                let posShift = posOriginal;
                let posCtrl = posOriginal;

                // holding shift: align to directions
                if(e.shiftKey) {
                    let angleBest = 0;
                    let angleBestDistance = 9999999;

                    const angleCount = 8;
                    const delta = 2*Math.PI / angleCount; // 15 degree
                    let angle = 0;
                    for(let i=0; i<angleCount; ++i) {
                        let dist = Vector2.distancePointToLine(dragVertex.positionStart, pos, angle);
                        if(dist < angleBestDistance) {
                            angleBestDistance = dist;
                            angleBest = angle;
                        }

                        angle += delta;
                    }

                    // align to line
                    const distance = pos.minus(dragVertex.positionStart).length();

                    // plus / minus the angle could be correct - take nearest one
                    const plus = dragVertex.positionStart.plus(Vector2.fromAngleAndLength(angleBest, distance));
                    const minus  = dragVertex.positionStart.minus(Vector2.fromAngleAndLength(angleBest, distance));
                    posShift = plus.minus(pos).length() < minus.minus(pos).length() ? plus : minus;
                    pos = posShift;
                }

                // holding ctrl: align to other vertices
                if(e.ctrlKey) {
                    // for x, y separately - find closest to posOriginal.x / posOriginal.y
                    let closestDistanceXandY = new Vector2(15, 15);
                    let closestXandY = posOriginal;
                    let closestVertexX = undefined;
                    let closestVertexY = undefined;
                    for(const v of graph.verticesVisible) {
                        if(v.id === dragVertex.vertex) continue;
                        const delta = v.position.minus(posOriginal).abs();

                        if(delta.x < closestDistanceXandY.x) {
                            closestDistanceXandY.x = delta.x;
                            closestXandY.x = v.position.x;
                            closestVertexX = v;
                        }

                        if(delta.y < closestDistanceXandY.y) {
                            closestDistanceXandY.y = delta.y;
                            closestXandY.y = v.position.y;
                            closestVertexY = v;
                        }
                    }
                    posCtrl = closestXandY;
                    pos = posCtrl;
                }

                // move other selected vertices relative to v's current position
                if (!dragVertex.ctrlKeyInit) {
                    for (const vId of graph.activeVertices) {
                        const vertex = graph.vertexGet(vId);
                        if (!vertex || vertex.id === v.id) continue;
                        vertex.position = new Vector2(pos.x + vertex.position.x - v.position.x, pos.y + vertex.position.y - v.position.y);
                        ++vertex.version;
                    }
                }

                graph.setHulls(graph.cliquesMaximal);
                graph.setHulls(graph.cliquesCritical, 3);
                ++graph.cliquesVersion;
                ++graph.cliquesCriticalVersion;
                v.position = pos;
                ++v.version;
                updateSet(new Date());
            }
        }

        // mouseLast.screen = getMousePositionScreen(e);
        mouseLastSet({...mouseLast, screen: getMousePositionScreen(e)});
        setGraphActive(graph);
    }, [svgRef, panning, view, mouseLast, dragVertex, graph,
        getMousePositionScreen, getMousePositionWorld, boxSelect, updateVisible]);

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
                const viewNew = {...v, pan: new Vector2(v.pan.x - 0.5 * e.deltaY / Math.sqrt(v.zoom), v.pan.y)};
                updateVisible(viewNew);
                graph.viewData = viewNew;
                return viewNew;
            });
        }
        // pan up/down
        else {
            viewSet(v => {
                const viewNew = {...v, pan: new Vector2(v.pan.x, v.pan.y - 0.5 * e.deltaY / Math.sqrt(v.zoom))};
                updateVisible(viewNew);
                graph.viewData = viewNew;
                return viewNew;
            });
        }
    }, [zoomChange, view, updateVisible]);

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
                graph.activeVerticesSet([v.id]);
            }
            dragVertexSet({
                vertex: v.id,
                mouseStartOffset: undefined,
                ctrlKeyInit: e.ctrlKey,
                positionStart: v.position.clone(),
                positionNow: v.position.clone(),

                shiftKeyNow: e.shiftKey,
                ctrlKeyNow: e.ctrlKey,
            });
        }

        e.stopPropagation();
        e.preventDefault();
        updateSet(new Date());
    }, [graph]);

    const renderOverlappingForbiddenPressButton = useCallback((e: React.MouseEvent, graph: Graph, vertices: number[]) => {
        graph.activeVerticesSet([...vertices]);
        updateSet(new Date());
        e.stopPropagation();
    }, []);

    const renderOverlappingForbidden = useCallback((graph: Graph) => {
        if (!graph || !showOverlappingForbidden) return [];
        const activeVertices = graph.activeVertices;
        const activeVerticesString = activeVertices.join(',');

        // update filtered graphs if selection changed
        if (
            !ArrayEquals(graph.activeVertices, overlappingData.activeVertices)
            || overlappingData.forbiddenVersion !== graph.forbiddenVersion
            || overlappingData.cliquesVersion !== graph.cliquesVersion
            || overlappingData.cliquesCriticalVersion !== graph.cliquesCriticalVersion
        ) {
            overlappingData.activeVertices = [...graph.activeVertices];

            overlappingData.forbidden = [];
            overlappingData.forbiddenNot = [];

            overlappingData.cliques = [];
            overlappingData.cliquesNot = [];
            overlappingData.cliquesVersion = graph.cliquesVersion;

            overlappingData.cliquesCritical = [];
            overlappingData.cliquesCriticalNot = [];
            overlappingData.cliquesCriticalVersion = graph.cliquesCriticalVersion;

            if(activeVertices.length > 0) {
                for(const g of graph.forbiddenInduced) {
                    if(ArrayContainsAll(g, activeVertices)) {
                        overlappingData.forbidden.push(g);
                    } else {
                        overlappingData.forbiddenNot.push(g);
                    }
                }

                for(const g of graph.cliquesMaximal) {
                    if(ArrayContainsAll(Array.from(g.clique), activeVertices)) {
                        overlappingData.cliques.push(g);
                    } else {
                        overlappingData.cliquesNot.push(g);
                    }
                }

                for(const g of graph.cliquesCritical) {
                    if(ArrayContainsAll(Array.from(g.clique), activeVertices)) {
                        overlappingData.cliquesCritical.push(g);
                    } else {
                        overlappingData.cliquesCriticalNot.push(g);
                    }
                }
            }
            else {
                overlappingData.forbidden = graph.forbiddenInduced;
                overlappingData.cliques = graph.cliquesMaximal;
                overlappingData.cliquesCritical = graph.cliquesCritical;
            }
        }

        return {
            forbidden: overlappingData.forbidden.map((ownVertices: number[], index: number) => {
                return <button key={index} className="block border-b w-full cursor" onMouseDown={e => {
                    renderOverlappingForbiddenPressButton(e, graph, ownVertices);
                }}>
                    <span className="font-bold mr-2">{activeVerticesString}</span>
                    <span>{ownVertices.filter(v => !activeVertices.includes(v)).join(',')}</span>
                </button>
            }),
            forbiddenNot: overlappingData.forbiddenNot.map((ownVertices: number[], index: number) => {
                return <button key={index} className="block border-b w-full cursor" onMouseDown={e => {
                    renderOverlappingForbiddenPressButton(e, graph, ownVertices);
                }}>
                    <span>{ownVertices.join(',')}</span>
                </button>
            }),
            cliques: overlappingData.cliques.map((set, index: number) => {
                const ownVertices = Array.from(set.clique);
                return <button key={index} className="block border-b w-full cursor" onMouseDown={e => {
                    renderOverlappingForbiddenPressButton(e, graph, ownVertices);
                }}>
                    <span className="font-bold mr-2">{activeVerticesString}</span>
                    <span>{ownVertices.filter(v => !activeVertices.includes(v)).join(',')}</span>
                </button>
            }),
            cliquesNot: overlappingData.cliquesNot.map((set, index: number) => {
                const ownVertices = Array.from(set.clique);
                return <button key={index} className="block border-b w-full cursor" onMouseDown={e => {
                    renderOverlappingForbiddenPressButton(e, graph, ownVertices);
                }}>
                    <span>{ownVertices.join(',')}</span>
                </button>
            }),
            cliquesCritical: overlappingData.cliquesCritical.map((set, index: number) => {
                const ownVertices = Array.from(set.clique);
                return <button key={index} className="block border-b w-full cursor" onMouseDown={e => {
                    renderOverlappingForbiddenPressButton(e, graph, ownVertices);
                }}>
                    <span className="font-bold mr-2">{activeVerticesString}</span>
                    <span>{ownVertices.filter(v => !activeVertices.includes(v)).join(',')}</span>
                </button>
            }),
            cliquesCriticalNot: overlappingData.cliquesCriticalNot.map((set, index: number) => {
                const ownVertices = Array.from(set.clique);
                return <button key={index} className="block border-b w-full cursor" onMouseDown={e => {
                    renderOverlappingForbiddenPressButton(e, graph, ownVertices);
                }}>
                    <span>{ownVertices.join(',')}</span>
                </button>
            }),
        }
    }, [update, overlappingData, showOverlappingForbidden, renderOverlappingForbiddenPressButton]);

    const renderEdges = useCallback((graph: Graph) => {
        const lines: JSX.Element[] = [];
        if (!graph) return lines;

        if(graph.viewData?.zoom < zoomThresholdNoEdges) return lines;

        for (const v of graph.vertices.values()) {
            for (const nId of v.neighbors) {
                if (v.id >= nId) continue;
                const n = graph.vertexGet(nId);
                if (!n) continue;
                if(!v.visible && !n.visible) continue;

                lines.push(<EdgeRender key={v.id+"-"+n.id} graph={graph} from={v} to={n}
                                       versionFrom={v.version} versionTo={n.version} removed={false}
                />)
            }

            for (const nId of v.neighborsRemoved) {
                const n = graph.vertexGet(nId);
                if (!n) continue;
                if(!v.visible && !n.visible) continue;

                lines.push(<EdgeRender key={v.id+"-"+n.id} graph={graph} from={v} to={n}
                                       versionFrom={v.version} versionTo={n.version} removed={true}
                />)
            }
        }
        return lines;
    }, []);

    const renderDragVertex = useCallback((graph: Graph, dragVertex: VertexDragData) => {
        const elements = [];

        if(dragVertex.shiftKeyNow) {
            const n = 8;
            const delta = 2 * Math.PI / n;
            let angle = 0;
            for(let i=0; i<n; ++i) {
                const posTo = dragVertex.positionStart.plus(Vector2.fromAngleAndLength(angle, 9999));
                elements.push(<line
                    key={angle}
                    data-ui="true"
                    x1={dragVertex.positionStart.x} y1={dragVertex.positionStart.y}
                    x2={posTo.x} y2={posTo.y}
                    stroke={'orange'}
                    strokeWidth={1}
                    strokeDasharray={"6,4"}
                    pointerEvents="none"
                />)
                angle += delta;
            }
        }

        if(dragVertex.shiftKeyNow || dragVertex.ctrlKeyNow) {
            elements.push(<circle
                key="dragv"
                data-ui="true"
                cx={dragVertex.positionNow.x} cy={dragVertex.positionNow.y}
                r={8}
                stroke="orange"
                strokeWidth={1}
                fill="#ffffff00"
                pointerEvents="none"
            />)
            /*elements.push(<line
                key="dragv-line1"
                data-ui="true"
                x1={dragVertex.positionNow.x} y1={dragVertex.positionNow.y}
                x2={posTo.x} y2={posTo.y}
                stroke={'orange'}
                strokeWidth={1}
                strokeDasharray={"6,4"}
                pointerEvents="none"
            />)*/
        }

        return elements;
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
                                        Use <kbd>Enter</kbd> to set a vertex label. Enclose a vertex label with the latex math mode e.g. "$C_v"
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
                        onClick={() => {
                            const viewNew = {...view, zoom: 1};
                            viewSet(viewNew);
                            graph.viewData = viewNew;
                        }}>{Math.round(view.zoom * 100)}%
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

                    <button className="mr-1 tooltip">
                        <kbd>A</kbd>
                        <div className="tooltiptext p-3" style={{width: "400px"}}>
                            <kbd>Ctrl+A</kbd> Select all vertices.
                        </div>
                    </button>

                    <button className="mr-1 tooltip">
                        <kbd>S</kbd>
                        <div className="tooltiptext p-3" style={{width: "400px"}}>
                            <kbd>S</kbd> set this current selection as your <b>saved selection</b>. Other keyboard
                            shortcuts depend on the saved selection.
                            <br/><br/>
                            <kbd>Ctrl+S</kbd> save the current graph and viewport.
                            <br/><br/>
                            <kbd>Ctrl+Shift+S</kbd> export the currently visible graph as an SVG. Add <kbd>Alt</kbd> to
                            instead export to PNG.
                        </div>
                    </button>

                    <button className="mr-1 tooltip">
                        <kbd>Up</kbd>
                        <div className="tooltiptext p-3" style={{width: "400px"}}>
                            <kbd>Up</kbd>,<kbd>Down</kbd>,<kbd>Left</kbd>,<kbd>Right</kbd> to move selected vertices
                            up/down/left/right.
                            <br/><br/>
                            Use <kbd>Alt</kbd> to align all components in the selection in the direction the key
                            is pointing at. They will align to the most extreme point in the saved selection.

                            For instance, use <kbd>Alt+Right</kbd> to align the selection components to the right
                            (the coordinates the most far right vertex in the saved selection is).
                            Add <kbd>Shift</kbd> to instead align the center of the selection to the center
                            of the saved selection.
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
                    <g ref={worldRef} id="svgWorldRef" transform={`translate(${view.pan.x}, ${view.pan.y}) scale(${view.zoom})`}>
                        <CliquesRender graph={graph}
                                       cliques={overlappingData.cliques} cliquesNot={overlappingData.cliquesNot}
                                       cliquesCritical={overlappingData.cliquesCritical} cliquesCriticalNot={overlappingData.cliquesCriticalNot}
                                       updateSet={updateSet} />
                        {renderEdges(graph)}
                        {graph.verticesVisible.map(v =>
                            <VertexRender key={v.id} graph={graph} vertex={v} version={v.version} vertexClick={vertexClick}/>)}
                        {dragVertex && renderDragVertex(graph, dragVertex)}
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
            console.log(e.key, e.ctrlKey, e.shiftKey)

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
                if(!EventKeyboardCanFire(e)) return;
                numberOpenSet(undefined);
                colorOpenSet('textColor');
                keyboardFocusVertexLabel().then();
                e.preventDefault();
            }
            // clear selection + close vertex text box
            else if(e.key === 'Escape') {
                props.graph.activeVerticesSet([]);
                numberOpenSet(undefined);
                colorOpenSet(undefined);
                props.updateGraph();
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

const CliquesRender = React.memo((props: {
    graph: Graph,
    cliques: SubgraphWithHull[],
    cliquesNot: SubgraphWithHull[],
    cliquesCritical: SubgraphWithHull[],
    cliquesCriticalNot: SubgraphWithHull[],
    updateSet: (d: Date) => void,
}) => {
    const someSelected = props.cliquesNot.length > 0;

    const clickClique = useCallback((e: React.MouseEvent<SVGPathElement>, clique: SubgraphWithHull, i: number, list: SubgraphWithHull[]) => {
        if(e.shiftKey) return;
        // ignore middle / right click
        if(e.button !== 0) return;

        // move to the back in the list
        list.splice(i, 1);
        list.unshift(clique);

        props.graph.activeVerticesSet(Array.from(clique.clique));
        e.preventDefault();
        e.stopPropagation();
        props.updateSet(new Date());
    }, [props.graph]);

    return <>
        {props.cliques.map((clique, i, list) =>
            <path key={JSON.stringify(Array.from(clique.clique))}
                  d={"M " + clique.hull.map(p => `${p.x},${p.y}`).join(" L ") + " Z"}
                  fill={someSelected ? "#006bff30" : "#006bff10"}
                  stroke={someSelected ? "#006bfff0" : "#006bffa0"}
                  pointerEvents={props.cliques.length===1 ? 'none' : undefined}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="2,4"
                  onMouseDown={e => clickClique(e, clique, i, list)}
            />)}
        {props.cliquesNot.map((clique, i, list) =>
            <path key={JSON.stringify(Array.from(clique.clique))}
                  d={"M " + clique.hull.map(p => `${p.x},${p.y}`).join(" L ") + " Z"}
                  fill="#006bff05"
                  stroke="#006bff30"
                  pointerEvents={props.cliques.length>1 ? 'none' : undefined}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="2,4"
                  onMouseDown={e => clickClique(e, clique, i, list)}
            />)}

        {props.cliquesCritical.map((clique, i, list) =>
            <path key={JSON.stringify(Array.from(clique.clique))}
                  d={"M " + clique.hull.map(p => `${p.x},${p.y}`).join(" L ") + " Z"}
                  fill={someSelected ? "#5500FF30" : "#5500FF10"}
                  stroke={someSelected ? "#5500FFf0" : "#5500FFa0"}
                  pointerEvents={props.cliquesCritical.length===1 ? 'none' : undefined}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="4,4"
                  onMouseDown={e => clickClique(e, clique, i, list)}
            />)}
        {props.cliquesCriticalNot.map((clique, i, list) =>
            <path key={JSON.stringify(Array.from(clique.clique))}
                  d={"M " + clique.hull.map(p => `${p.x},${p.y}`).join(" L ") + " Z"}
                  fill="#5500FF05"
                  stroke="#5500FF30"
                  strokeWidth={1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="4,4"
                  onMouseDown={e => clickClique(e, clique, i, list)}
            />)}
    </>;
});

const EdgeRender = React.memo((props: {
    graph: Graph,
    from: Vertex,
    to: Vertex,
    versionFrom: number,
    versionTo: number,
    removed: boolean
}) => {
    // console.log('edge re-render', props.from.id, props.to.id, props.from.visible, props.to.visible);

    const graph = props.graph;
    const v = props.from;
    const n = props.to;

    const fromActive = graph.activeVertices.includes(v.id);
    const toActive = graph.activeVertices.includes(n.id);
    const endpointActive = fromActive || toActive;
    const endpointBothActive = fromActive && toActive;

    const lineStyle = props.removed ? LineStyleEdgeRemoved() : graph.edgeStyle.get(v.id)?.get(n.id) ?? LineStyleDefault();
    const forbidden = graph.edgesForbidden.get(v.id)?.has(n.id);

    const color = forbidden  ? '#ff0000' : lineStyle.color;

    const optimize = props.graph.viewData?.zoom < zoomThresholdVertices;
    if(optimize && Math.random() < Math.min(0.5, 0.025 * (v.degree() + n.degree()))) return <></>;
    
    /*
        <line
            data-ui="true"
            x1={v.position.x} y1={v.position.y}
            x2={n?.position.x} y2={n?.position.y}
            stroke={active ? 'orange' : '#ffffff02'}
            strokeWidth={(active ? 0 : 16) + (!isNaN(lineStyle.weight) ? lineStyle.weight : 1)}
            strokeDasharray={lineStyle.type === "dashed" ? "6,4" : lineStyle.type === "dotted" ? "2,4" : undefined}
            pointerEvents="none"
        />
    */
    return <>
        <line
            data-edge-from={v.id} data-edge-to={n.id}
            x1={v.position.x} y1={v.position.y}
            x2={n?.position.x} y2={n?.position.y}
            stroke={endpointActive ? ColorHexSetTransparency(color, endpointBothActive ? 'a0' : '80') : color + '40'}
            strokeWidth={(endpointActive ? (endpointBothActive ? 2 : 1) : 0) + lineStyle.weight}
            strokeDasharray={(endpointActive && !endpointBothActive) || lineStyle.type === "dashed" ? "6,8" : lineStyle.type === "dotted" ? "2,4" : undefined}
            pointerEvents="none"
        />
    </>;
});

const VertexRender = React.memo((props: {
    graph: Graph,
    vertex: Vertex,
    version: number,
    vertexClick: (e: React.MouseEvent, vertex: Vertex, active: boolean) => void,
}) => {
    // console.log('vertex re-render', props.vertex.id, props.vertex.visible);
    const [_, updateSet] = useState<Date>();

    const getSvg = useCallback(async () => {
        const v = props.vertex;
        if(!v) return;

        if(!v.label?.includes('$')) {
            v.svg = undefined;
            v.boundingBox = undefined;
            updateSet(new Date());
            return;
        }

        // create
        const textArray = [];
        const split = v.label.split('$');
        let mathMode = false;
        for(const s of split) {
            if(s.length > 0) {
                if(mathMode) {
                    textArray.push(s)
                }
                else {
                    textArray.push('\\text{'+s+'}')
                }
            }

            mathMode = !mathMode;
        }
        const text = textArray.join('');

        // const promise = v.label?.startsWith('$') ? LatexTypeset(v.label.substring(1)) : undefined;
        const promise = LatexTypeset(text);
        if(!promise) {
            v.svg = undefined;
            v.boundingBox = undefined;
            updateSet(new Date());
            return;
        }
        let svgRender = await promise;

        // find viewbox as string
        const viewBox = ViewBoxGet(svgRender);
        const element = <g dangerouslySetInnerHTML={{__html: svgRender}}></g>;

        v.boundingBox = new Vector2(viewBox.width, viewBox.height);

        v.svg = {
            label: v.label,
            width: viewBox.width*1.12,
            height: viewBox.height*1.12,
            element,
        };

        updateSet(new Date());
    }, [props.vertex]);

    useEffect(() => {
        const v = props.vertex;
        if(!v || !v.label || v.label === v.svg?.label) return;
        if(!v.visible) return;
        getSvg().then();
    }, [props.vertex, props.version]);

    const v = props.vertex;

    const active = props.graph.activeVertices.includes(v.id);
    const savedSelection = props.graph.savedSelection.includes(v.id);
    const style = v.style ?? VertexStyleDefault();
    const scale = style.textSize / 14;

    const cliqueAmount = props.graph.cliqueVertexCounts.get(v.id);
    const labelEmpty = v.label?.length>0 && v.label.trim().length === 0;

    // const optimize = props.graph.viewData?.zoom < zoomThresholdVertices;
    // if(optimize && !v.svg && Math.random() < 0.25) return <></>;

    return <>
        <g data-vertex={v.id}
           x={v.position.x} y={v.position.y}
           onMouseDown={e => props.vertexClick(e, v, active)}
        >
            {savedSelection ? <>
                <rect
                    x={v.position.x - (1 / 2 + style.radius)} y={v.position.y - (1 / 2 + style.radius)}
                    width={1 + 2 * style.radius}
                    height={1 + 2 * style.radius}
                    fill={style.bgColor}
                    stroke={style.lineStyle.color}
                    strokeWidth={(active ? 1.5 : 0) + (!isNaN(style.lineStyle.weight) ? style.lineStyle.weight : 1)}
                    strokeDasharray={v.disabled || style.lineStyle.type === "dashed" ? "6,8" : style.lineStyle.type === "dotted" ? "2,4" : undefined}
                />
            </> : <circle
                cx={v.position.x} cy={v.position.y}
                r={style.radius}
                fill={style.bgColor}
                stroke={style.lineStyle.color}
                strokeWidth={(active ? 1.5 : 0) + (!isNaN(style.lineStyle.weight) ? style.lineStyle.weight : 1)}
                strokeDasharray={v.disabled || style.lineStyle.type === "dashed" ? "6,8" : style.lineStyle.type === "dotted" ? "2,4" : undefined}
            />}
            {v.label?.includes('$') ?
                (v.svg ?
                    <g
                       transform={`translate(${v.position.x - scale * v.svg.width / 2}, ${v.position.y - scale * v.svg.height / 2}) scale(${scale})`}>
                        <rect
                            data-ui="true"
                            fill="#ffffff00"
                            stroke={active ? '#00000080' : undefined}
                            strokeDasharray={"2,6"}
                            width={v.svg.width}
                            height={v.svg.height}
                        />

                        {v.svg.element}
                    </g> : <></>) :
                <text className="select-none"
                      x={v.position.x} y={v.position.y}
                      fill={style.textColor}
                      fontSize={style.textSize}
                      fontWeight={active && style.radius < 3 ? 'bold' : undefined}
                      textAnchor="middle"
                      dominantBaseline="middle"
                >
                    {v.label ? v.label : v.id}
                </text>
            }
            {cliqueAmount && <>
                {!labelEmpty && <circle
                    cx={v.position.x} cy={v.position.y - style.radius - 1}
                    r={8}
                    fill={style.bgColor}
                />}
                <text
                    className="select-none"
                    x={v.position.x} y={v.position.y}
                        dy={labelEmpty ? 0.75 : -style.radius-1}
                        fill={style.textColor}
                        fontSize={style.textSize-3}
                        textAnchor="middle"
                        dominantBaseline="middle"
                    >
                        {cliqueAmount}
                </text>
            </>}
        </g>
    </>;
});
