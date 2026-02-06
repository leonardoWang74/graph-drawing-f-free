#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <chrono>
#include <unordered_set>

#include "Graph.h"

#ifndef DEBUG
// use DEBUG if you want to debug
// #define DEBUG
#endif

#ifndef TIMED
// use TIMED if you want to track time
#define TIMED
#endif

#ifdef TIMED
// time tracking functions. Usage:
// auto start = TimeNow();
// timeSum += TimeDifference(start);
std::chrono::_V2::system_clock::time_point TimeNow() {
    return std::chrono::high_resolution_clock::now();
}

long TimeDifference(const std::chrono::_V2::system_clock::time_point& start) {
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::high_resolution_clock::now() - start);
    return std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::high_resolution_clock::now() - start).count();
}
#else
// dummy functions so the same usage still works
int TimeNow() {
    return 0;
}

long TimeDifference(const int& start) {
    return 0;
}
#endif

std::string OverlappingEditingOptionsToString(const OverlappingEditingOptions& options) {
    return "Options{noNeighborProposition=" + std::to_string(options.noNeighborProposition) + ", "

        + "forbiddenMatrix=" + std::to_string(options.forbiddenMatrix) + ", "
        + "forbiddenCopy=" + std::to_string(options.forbiddenCopy) + ", "

        + "forbiddenTakeFirst=" + std::to_string(options.forbiddenTakeFirst) + ", "

        + "\n\ttimeTotal=" + std::to_string(options.timeTotal) + "µs, "
        + "timeFindingCliques=" + std::to_string(options.timeFindingCliques) + "µs, "
        + "timeFindingForbidden=" + std::to_string(options.timeFindingForbidden) + "µs, "

        + "timeForbiddenCopy=" + std::to_string(options.timeForbiddenCopy) + "µs, "

        + "\n\tnoNeighborPropositionCount=" + std::to_string(options.noNeighborPropositionCount) + ", "
        + "criticalCliqueEdges=" + std::to_string(options.criticalCliqueEdges) + ", "
        + "cliqueEdges=" + std::to_string(options.cliqueEdges) + ", "
        + "timeNoNeighborMerges=" + std::to_string(options.timeNoNeighborMerges) + "µs, "
    +"}";
}

/** calculate a degeneracy + degeneracy ordering of the graph O(4 * n * \Delta). If s>0, then the bound is also returned
 * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Section 2.1 before Lemma 1]
 */
DegeneracyAndOrdering Graph::getDegeneracyOrdering(int s, int k) const {
    int n = this->n();

    // Track smallest degree
    int smallestDegree = n;

    // vertexId -> current degree O(n)
    std::vector<int> verticesMap = std::vector<int>(n);

    // degree -> list of vertex pointers O(n)
    std::vector<std::unordered_set<int>> degreesMap = std::vector<std::unordered_set<int>>(n, std::unordered_set<int>(n));

    // build initial maps in O(n)
    for(int vid=0; vid<n; ++vid) {
        int degree = this->degree(vid);
        verticesMap[vid] = degree;

        smallestDegree = std::min(smallestDegree, degree);

        degreesMap[degree].insert(vid);
    }

    std::vector<int> degeneracyOrdering;
    int degeneracy = 0;
    int editBound = 0;

    // do the ordering O(n * \Delta)
    for(int i=0; i<n; ++i) {
        auto& listSmallest = degreesMap[smallestDegree];

        // get a vertex with the smallest degree
        /*int vid = listSmallest.back();
        listSmallest.pop_back();*/
        int vid = *listSmallest.begin();
        listSmallest.erase(vid);

        // removed last entry in the list - find next smallestDegree
        if(listSmallest.empty() && i<n-1) {
            // find next smallest degree O(\Delta)
            bool found = false;
            for(int d=smallestDegree; d<n; ++d) {
                if(!degreesMap.at(d).empty()) {
                    smallestDegree = d;
                    found = true;
                    break;
                }
            }
            if(!found) {
                std::cout << __FILE__ <<":"<<__LINE__
                    <<" no other smallest degree found for i=" << i << ", smallestDegree= " << smallestDegree << "\n";
                break;
            }
        }

        // "remove" from the graph
        verticesMap.at(vid) = -1;

        // decrease degree of neighbors O(\Delta)
        int degreeHere = 0;
        for(int neighborId : this->neighbors(vid)) {
            int degreePrevious = verticesMap.at(neighborId);
            if(degreePrevious < 0) continue;

            int degreeNew = degreePrevious - 1;
            ++degreeHere;

            // update neighbor degree
            verticesMap.at(neighborId) = degreeNew;

            // remove from old degree list O(1)
            degreesMap.at(degreePrevious).erase(neighborId);

            // add to new degree list O(1)
            degreesMap.at(degreeNew).insert(neighborId);

            // update smallest degree
            if(degreeNew < smallestDegree) {
                smallestDegree = degreeNew;
            }
        }

        degeneracyOrdering.push_back(vid);
        degeneracy = std::max(degeneracy, degreeHere);

        // find a minimum number of edits using the conjecture that stars are bad for all s and that you need $|leaves| - s$ edits
        // in time O(degeneracy * min(k, n/3))
        if (s > 0) {
            const auto nHere = n - i;
            if(nHere < 6) continue;
            for(auto t = std::max(3, s+1); t <= degreeHere; ++t) { // O(degeneracy of G * min(k,n/3))
                int rBound = std::min(k+1+s, 2 + (n-2) / t); // 2 + (n-2)/t since that is 1 + (n-2)/t rounded up
                for(auto r = t+1; r<rBound; ++r) {
                    int l = 1 + (nHere - 1) / (t * (r-1) + 1);
                    std::cout << __FILE__<<":"<<__LINE__<<" Trying t="<<t<<", r="<<r<<", l="<<l<<" rBound="<<rBound<<" with r-s="<<(r-s)<<", l*(t-s)="<<(l*(t-s))<<"\n";
                    editBound = std::max(editBound, std::min(r-s, l * (t-s)));
                }
            }
        }
    }

    return {degeneracy: degeneracy, ordering: degeneracyOrdering, editBound: editBound};
}

/** Bron-Kerbosch with Pivot.
 * Returns -1 if there was no vertex found in more than `s` cliques, otherwise the vertex id (if s=0 then always returns -1).
 * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Figure 2: BronKerboschPivot]
 */
int BronKerboschPivot(Graph* G, MaximalCliquesInfo& result, size_t s
#ifndef GRAPH_H_MATRIX_AND_LIST
    , std::unordered_set<int>& P, std::unordered_set<int>& R, std::unordered_set<int>& X
#else
    , std::vector<int>& P, std::vector<int>& R, std::vector<int>& X
#endif
) {
    // if $P \cup X = \emptyset$
    if(P.empty() && X.empty()) {
        // report R as a maximal clique
#ifndef GRAPH_H_MATRIX_AND_LIST
        if(result.cliqueListEnabled) result.cliqueList.push_back(std::unordered_set<int>(R));
#else
        if(result.cliqueListEnabled) result.cliqueList.push_back(std::vector<int>(R));
#endif

        // count number of cliques per vertex, if >s then return that vertex id
        if(s > 0) {
            for(auto vid : R) {
                auto& list = result.vertexCliques.at(vid);
                list.push_back(result.cliqueList.size() - 1);
                if(list.size() > s) {
                    result.vertexInMoreThanSCliques = vid;
                    return vid;
                }
            }
        }
        return -1;
    }

    // choose a pivot $u \in P \cup X$. Tomita et al. 2006: choose $u$ to maximize $|P \cap N(u)|$ with $N(u)$ being the neighborhood of $u$
    // [Tomita et al. 2006 - The worst-case time complexity for generating all maximal cliques and computational experiments]
    // const auto pivotCandidates = Graph::set_union(P, X);
    int pivot = !P.empty() ? *P.begin() : *X.begin();
    size_t pivotValue = 0;
    for(int vid : P) {
        const auto neighbors = G->neighbors(vid);

        // intersection cannot be larger than |neighbors|
        if(neighbors.size() < pivotValue) continue;

#ifndef GRAPH_H_MATRIX_AND_LIST
        auto value = Graph::set_intersection(neighbors, P).size();
#else
        auto value = Graph::sorted_intersection_unique(neighbors, P).size();
#endif
        if(value > pivotValue) {
            pivot = vid;
            pivotValue = value;
        }
    }
    for(int vid : X) {
        const auto neighbors = G->neighbors(vid);

        // intersection cannot be larger than |neighbors|
        if(neighbors.size() < pivotValue) continue;

#ifndef GRAPH_H_MATRIX_AND_LIST
        auto value = Graph::set_intersection(neighbors, P).size();
#else
        auto value = Graph::sorted_intersection_unique(neighbors, P).size();
#endif
        if(value > pivotValue) {
            pivot = vid;
            pivotValue = value;
        }
    }
    if(pivot<0) {
        std::cout << __FILE__<<":"<<__LINE__<< " pivot empty\n";
        return -1;
    }

    // for each vertex $v \in P \setminus N(u)$ do
#ifndef GRAPH_H_MATRIX_AND_LIST
    const auto loopSet = Graph::set_difference(P, G->neighbors(pivot));
#else
    const auto loopSet = Graph::sorted_difference(P, G->neighbors(pivot));
#endif
    for(int vid : loopSet) {
        const auto neighbors = G->neighbors(vid);

#ifndef GRAPH_H_MATRIX_AND_LIST
        auto P_new = Graph::set_intersection(P, neighbors);
        auto X_new = Graph::set_intersection(X, neighbors);
        R.insert(vid);
#else
        auto P_new = Graph::sorted_intersection_unique(P, neighbors);
        auto X_new = Graph::sorted_intersection_unique(X, neighbors);
        R.push_back(vid);
#endif

        // BronKerboschPivot(P \cap N(v), R \cup \{v\}, X \cap N(v))
        const auto vertex = BronKerboschPivot(G, result, s,
            P_new, R, X_new
        );
        if(vertex >= 0) return vertex;

#ifndef GRAPH_H_MATRIX_AND_LIST
        // do not have to copy R
        R.erase(vid);

        // P \leftarrow P \setminus \{v\}
        P.erase(vid);
        
        // X \leftarrow X \cup \{v\}
        X.insert(vid);
#else
        // do not have to copy R
        R.pop_back();

        // P \leftarrow P \setminus \{v\}
        Graph::sorted_remove(P, vid);
        
        // X \leftarrow X \cup \{v\}
        Graph::sorted_insert(X, vid);
#endif
    }
    return -1;
}

/** get maximal cliques using Bron-Kerbosch based on degeneracy by Eppstein, Loeffler and Strash.
 * Returns -1 if there was no vertex found in more than `s` cliques, otherwise the vertex id (if s=0 then always returns -1).
 * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Figure 4: BronKerboschDegeneracy]
 */
int BronKerboschDegeneracyByEppsteinLoefflerStrash(Graph* G, MaximalCliquesInfo& result, size_t s) {
    auto degeneracyInfo = G->getDegeneracyOrdering();

    // for each vertex vi in a degeneracy ordering $v_0, v_1, v_2, \dots$ of $(V,E)$ do
    for(size_t i = 0; i < degeneracyInfo.ordering.size(); ++i) {
        const int vid = degeneracyInfo.ordering[i];
        const auto neighbors = G->neighbors(vid);
    
        auto next = Graph::vector_slice(degeneracyInfo.ordering, i+1, degeneracyInfo.ordering.size());
#ifndef GRAPH_H_MATRIX_AND_LIST
        auto nextSet = std::unordered_set<int>(next.begin(), next.end());

        // $ P \leftarrow N(v_i) \cap \{v_{i+1}, \dots, v_{n-1}\}$
        // P = Neighborhood intersected with neighbors later in the ordering
        auto P = Graph::set_intersection(neighbors, nextSet);

        // $ X \leftarrow N(v_i) \cap \{v_0, \dots, v_{i-1}\}$
        // X = Neighborhood intersected with neighbors earlier in the ordering

        // $P \cup X = N(v_i)$ holds therefore also $X = N(v_i) \setminus P$
        // so we don't need to calculate the slice of the previous vertices in the ordering
        auto X = Graph::set_difference(neighbors, P);

        // R = \{vid\}
        std::unordered_set<int> R = std::unordered_set<int>();
        R.insert(vid);
#else
        std::sort(next.begin(), next.end());

        // $ P \leftarrow N(v_i) \cap \{v_{i+1}, \dots, v_{n-1}\}$
        // P = Neighborhood intersected with neighbors later in the ordering
        auto P = Graph::sorted_intersection_unique(neighbors, next);

        // $ X \leftarrow N(v_i) \cap \{v_0, \dots, v_{i-1}\}$
        // X = Neighborhood intersected with neighbors earlier in the ordering

        // $P \cup X = N(v_i)$ holds therefore also $X = N(v_i) \setminus P$
        // so we don't need to calculate the slice of the previous vertices in the ordering
        auto X = Graph::sorted_difference(neighbors, P);

        // R = \{vid\}
        std::vector<int> R = std::vector<int>();
        R.push_back(vid);
#endif

        const auto vertex = BronKerboschPivot(G, result, s, P, R, X);
        if(vertex >= 0) return vertex;
    }
    return -1;
}

/** find maximal cliques using Bron-Kerbosch based on degeneracy by Eppstein, Loeffler and Strash.
 * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Figure 4: BronKerboschDegeneracy]
 */
MaximalCliquesInfo Graph::getMaximalCliques(size_t s) {
    MaximalCliquesInfo info = MaximalCliquesInfo();
#ifndef GRAPH_H_MATRIX_AND_LIST
    info.cliqueList = std::vector<std::unordered_set<int>>();
#else
    info.cliqueList = std::vector<std::vector<int>>();
#endif
    info.cliqueList.reserve(this->number_vertices / 3);
    info.vertexCliques = std::vector<std::vector<size_t>>(this->n(), std::vector<size_t>());
    info.vertexInMoreThanSCliques = -1;

    BronKerboschDegeneracyByEppsteinLoefflerStrash(this, info, s);
    return info;
}

/** returns one vertex id that is it more than s cliques (>s), otherwise return -1
 * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Figure 4: BronKerboschDegeneracy]
 */
int Graph::getVertexInMoreThanSCliques(int s) {
    MaximalCliquesInfo info = MaximalCliquesInfo();
    info.cliqueListEnabled = false;
#ifndef GRAPH_H_MATRIX_AND_LIST
    info.cliqueList = std::vector<std::unordered_set<int>>();
#else
    info.cliqueList = std::vector<std::vector<int>>();
#endif
    info.vertexCliques = std::vector<std::vector<size_t>>(this->n(), std::vector<size_t>());
    info.vertexInMoreThanSCliques = -1;
    BronKerboschDegeneracyByEppsteinLoefflerStrash(this, info, s);
    // std::cout << "\t\t" << __FILE__<<":"<<__LINE__<<" s="<<s<<" cliques="<<Graph::vector_tostring(info.cliqueList)<<"\n";
    return info.vertexInMoreThanSCliques;
}

// get all connected components of the graph
std::vector<Graph> Graph::getComponents() const {
    // result components
    std::vector<Graph> components = std::vector<Graph>();

    // vector of vertex_id -> boolean: TRUE if we already found this vertex
    std::vector<bool> found = std::vector<bool>(this->number_vertices);
    
    for(unsigned int i=0; i<this->number_vertices; ++i) {
        if(found[i]) continue;

        // the subgraph vertex ids
        std::vector<int> vertex_ids = std::vector<int>();
        // the queued vertex ids where we still have to add the neighbors
        std::vector<int> notYetAdded = std::vector<int>();

        // add one vertex and its neighborhood
        found.push_back(i);
        notYetAdded.push_back(i);

        // add neighborhoods until nothing was added
        while(!notYetAdded.empty()) {
            const int v = notYetAdded.front();
            notYetAdded.erase(notYetAdded.begin());

            vertex_ids.push_back(v);

            // add neighbors to queue
            for(auto w : this->neighbors(v)) {
                if(found[w]) continue;
                found[w] = true;
                notYetAdded.push_back(w);
            }
        }

        components.push_back(this->getSubgraph(vertex_ids));
    }

    return components;
}

std::vector<std::vector<int>> copyVectorVectorInt(std::vector<std::vector<int>> forbidden) {
    const auto n = forbidden.size();

    std::vector<std::vector<int>> copy = std::vector<std::vector<int>>(n);

    for(size_t i=0; i<n; ++i) {
        copy[i] = std::vector<int>(forbidden[i]);
    }

    return copy;
}

std::vector<EdgeEdit> overlappingSolutionsFilterForbiddenEdits(Graph* G, OverlappingEditingOptions& options, std::vector<std::vector<int>>& forbidden, std::vector<EdgeEdit>& edits) {
    std::vector<EdgeEdit> filtered = std::vector<EdgeEdit>();

    const auto count = edits.size();
    filtered.reserve(count);

    for(size_t i=0; i<count; ++i) {
        auto edit = edits[i];

        // swap so from always has a smaller id
        if(edit.from > edit.to) {
            auto swap = edit.from;
            edit.from = edit.to;
            edit.to = swap;
        }

        // if edit was done already OR edit would contradict forbidden, we don't branch on it anymore
        if(options.forbiddenMatrix) {
            if(forbidden.at(edit.from).at(edit.to) == 1) continue;
        }
        else {
            if(Graph::sorted_contains(forbidden[edit.from], edit.to)) continue;
        }

        // std::cout << __FILE__<<":"<<__LINE__<<" filtering edit from="<<edit.from<<" to="<<edit.to<<"\n";
        filtered.push_back(edit);
    }

    return filtered;
}

void overlappingSolutionsPropositionEdgeAdds(
    Graph *G, std::vector<EdgeEdit>& editsUnfiltered, OverlappingEditingOptions& options,
    int vVertex, int wVertex, int xVertex
) {
    // branch on adding edges between leaves only if they have common neighbors (except u)
    if(options.noNeighborProposition) {
        auto start = TimeNow();

        auto& vNeighbors = G->neighbors(vVertex);
        auto& wNeighbors = G->neighbors(wVertex);
        auto& xNeighbors = G->neighbors(xVertex);
#ifndef GRAPH_H_MATRIX_AND_LIST
        if(Graph::set_intersection(vNeighbors, wNeighbors).size() > 1) {
            editsUnfiltered.push_back({from: vVertex, to: wVertex, add: true});
        }
        else ++options.noNeighborPropositionCount;
        if(Graph::set_intersection(vNeighbors, xNeighbors).size() > 1) {
            editsUnfiltered.push_back({from: vVertex, to: xVertex, add: true});
        }
        else ++options.noNeighborPropositionCount;
        if(Graph::set_intersection(wNeighbors, xNeighbors).size() > 1) {
            editsUnfiltered.push_back({from: wVertex, to: xVertex, add: true});
        }
        else ++options.noNeighborPropositionCount;
#else
        if(Graph::sorted_intersection_unique(vNeighbors, wNeighbors).size() > 1) {
            editsUnfiltered.push_back({from: vVertex, to: wVertex, add: true});
        }
        else ++options.noNeighborPropositionCount;
        if(Graph::sorted_intersection_unique(vNeighbors, xNeighbors).size() > 1) {
            editsUnfiltered.push_back({from: vVertex, to: xVertex, add: true});
        }
        else ++options.noNeighborPropositionCount;
        if(Graph::sorted_intersection_unique(wNeighbors, xNeighbors).size() > 1) {
            editsUnfiltered.push_back({from: wVertex, to: xVertex, add: true});
        }
        else ++options.noNeighborPropositionCount;
#endif

        options.timeNoNeighborMerges += TimeDifference(start);
    }
    // if not testing the proposition just add the 3 edits
    else {
        editsUnfiltered.push_back({from: vVertex, to: wVertex, add: true});
        editsUnfiltered.push_back({from: vVertex, to: xVertex, add: true});
        editsUnfiltered.push_back({from: wVertex, to: xVertex, add: true});
    }
}

void overlappingClusterEditingSolutionsBranchAndBoundRecursion(
    Graph* G, std::vector<Graph>& result, size_t s, int k, OverlappingEditingOptions& options, unsigned int maxSolutions, 
    std::vector<std::vector<int>>& forbidden,
    std::vector<std::vector<int>>& edgesAdded, std::vector<std::vector<int>>& edgesRemoved
) {
    // budget empty
    if(k < 0) return;

    const auto n = G->n();

    int uVertex = -1;
    bool branchingEditsFoundSubgraph = false;
    bool branchingEditsFound = false;
    std::vector<EdgeEdit> branchingEdits;
#ifdef DEBUG
    std::string branchingForbiddenName = "";
#endif

    // TODO: don't re-calculate cliques every branch? (e.g. only change cliques that overlapped the edit)
    // looking for cliques is a significant part of the time needed
    // timeTotal=5693µs, timeFindingCliques=4415µs, timeFindingForbidden=427µs, timeForbiddenCopy=0µs,

    if(options.useFellowsForbidden || s!=2) {
        auto start = TimeNow();
        const auto cliqueInfo = G->getMaximalCliques(s);
        options.timeFindingCliques += TimeDifference(start);

        uVertex = cliqueInfo.vertexInMoreThanSCliques;

        // no vertex in more than s cliques: no edits needed
        if(cliqueInfo.vertexInMoreThanSCliques < 0) {
    #ifdef DEBUG
            std::cout << "\t\t" << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" found solution\n";
    #endif
            Graph solution(G);
            
            solution.edgesAdded = copyVectorVectorInt(edgesAdded);
            solution.edgesRemoved = copyVectorVectorInt(edgesRemoved);
            
            result.push_back(solution);
            return;
        }

        auto startLooking = TimeNow();
        int forbiddenSizeMax = (s+1)*s+1;

        // the found forbidden subgraph
        std::vector<int> forbiddenVertices = std::vector<int>();
        forbiddenVertices.reserve(forbiddenSizeMax);
        forbiddenVertices.push_back(uVertex);

        std::unordered_set<int> forbiddenVerticesSet = std::unordered_set<int>(forbiddenSizeMax);
        forbiddenVerticesSet.insert(uVertex);

        // the clique indices overlapping the vertex
        const auto cliquesIndicesOverlappingU = cliqueInfo.vertexCliques[uVertex];
        // if there are more than s+1 cliques, we only care about at most s+1
        const auto cliqueCount = std::min(cliquesIndicesOverlappingU.size(), s+1);

        // for every pair of cliques, find one separating pair
        for(size_t i=0; i<cliqueCount; ++i) { // O(s * s * (|cliqueA| + |cliqueB| + |cliqueA|)) = O(s * s * n)) = O(s^2 * n)
            const auto cliqueA = cliqueInfo.cliqueList.at(cliquesIndicesOverlappingU[i]);

            // find separating vertices: O(s * 3n)
            for(size_t j=i+1; j<cliqueCount; ++j) {
                const auto cliqueB = cliqueInfo.cliqueList.at(cliquesIndicesOverlappingU[j]);

                // vertices in cliqueA but not in cliqueB. Copy in O(|cliqueA|) = O(n)
                std::unordered_set<int> verticesCliquesInA = 
#ifndef GRAPH_H_MATRIX_AND_LIST
                    std::unordered_set<int>(cliqueA);
#else
                    std::unordered_set<int>(cliqueA.begin(), cliqueA.end());
#endif

                // vertex in $cliqueB \setminus cliqueA$
                int separatorB = -1;
                // FALSE if separatorB is a new vertex added to the forbidden subgraph, otherwise TRUE
                bool separatorBalreadyContains = false;

                // increment overlapping vertices in O(|cliqueB|) = O(n)
                for(const auto v : cliqueB) {
                    // TRUE if v is in cliqueA
                    const auto inA = verticesCliquesInA.erase(v) > 0;

                    // does not overlap clique A
                    if(!inA) {
                        // take if no separator found yet OR found separator doesn't exist in the found subgraph already and this one does
                        // (minimize the size of the forbidden subgraph by choosing the same vertex multiple times if possible)
                        auto alreadyContains = forbiddenVerticesSet.find(v) != forbiddenVerticesSet.end();
                        if(separatorB < 0 || (!separatorBalreadyContains && alreadyContains)) {
                            separatorB = v;
                            separatorBalreadyContains = alreadyContains;
                        }
                    }
                }

                // vertex in $cliqueA \setminus cliqueB$
                int separatorA = -1;
                // FALSE if separatorA is a new vertex added to the forbidden subgraph, otherwise TRUE
                bool separatorAalreadyContains = false;

                // find separatorA: vertex where verticesCliquesCount[v]=true in O(|cliqueA|) = O(n)
                for(const auto v : verticesCliquesInA) {
                    // take if no separator found yet OR found separator doesn't exist in the found subgraph already and this one does
                    // (minimize the size of the forbidden subgraph by choosing the same vertex multiple times if possible)
                    auto alreadyContains = forbiddenVerticesSet.find(v) != forbiddenVerticesSet.end();
                    if(separatorA < 0 || alreadyContains) {
                        separatorA = v;
                        separatorAalreadyContains = alreadyContains;
                        if(alreadyContains) break;
                    }
                }

                // did not find separator vertices - should never happen
                if(separatorA<0 || separatorB<0) {
                    std::cout << "\t" << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" DID NOT FIND ANY SEPARATOR for u="<<uVertex
                        <<" cliqueA="<<Graph::vector_tostring(cliqueA)
                        <<" cliqueB="<<Graph::vector_tostring(cliqueB)
#ifndef GRAPH_H_MATRIX_AND_LIST
                        <<"\n\tgraph edges="<<Graph::vector_tostring(G->edges_list)
#else
                        <<"\n\tgraph edges="<<Graph::vector_tostring(G->edges)
#endif
                        <<"\n\tcliques="<<Graph::vector_tostring(cliqueInfo.cliqueList)
                        <<"\n";
                    exit(1);

                    // original
                    // [[9,7,6,5],[9,7,6],[8,7],[8,7],[9],[9,8,0],[9,8,1,0],[3,2,1,0],[6,5,3,2],[6,5,4,1,0]]

                    // changed
                    // [[7,9,6,5],[7,9,6],[5,8],[8,7,6],[9],[2,8,9,0],[8,3,9,1,0],[1,0,3],[3,5,6,2],[6,5,4,1,0]]
                }

                // save separator vertices
                if(!separatorAalreadyContains) forbiddenVertices.push_back(separatorA);
                forbiddenVerticesSet.insert(separatorA);
                if(!separatorBalreadyContains) forbiddenVertices.push_back(separatorB);
                forbiddenVerticesSet.insert(separatorB);

                /*std::cout << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" u="<<uVertex
                    <<" separatorA="<<separatorA
                    <<" separatorB="<<separatorB
                    <<" cliqueA index="<<i
                    <<" cliqueB index="<<j
                    <<" cliqueA real index="<<cliquesIndicesOverlappingU[i]
                    <<" cliqueB real index="<<cliquesIndicesOverlappingU[j]
                    <<"\n\tcliqueA="<<Graph::vector_tostring(cliqueA)
                    <<" cliqueB="<<Graph::vector_tostring(cliqueB)
                    <<"\n";*/
            }
        }
        
        // edits are pairs of all vertices
        std::vector<EdgeEdit> editsUnfiltered = {};
        const auto forbiddenCount = forbiddenVertices.size();
        for(size_t i=0; i<forbiddenCount; ++i) {
            const auto v = forbiddenVertices.at(i);
            for(size_t j=i+1; j<forbiddenCount; ++j) {
                const auto w = forbiddenVertices.at(j);
                editsUnfiltered.push_back({from: v, to: w, add: !G->edge_has(v,w)});
            }
        }
        /*std::cout << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" u="<<uVertex<<" forbidden vertices="<<Graph::vector_tostring(forbiddenVertices)
            <<" edgesAdded="<<Graph::vector_tostring(edgesAdded)<<" edgesRemoved="<<Graph::vector_tostring(edgesRemoved)
            <<"\n";*/
        // overlappingSolutionsPropositionEdgeAdds(G, editsUnfiltered, options, vVertex, wVertex, xVertex);

        auto edits = overlappingSolutionsFilterForbiddenEdits(G, options, forbidden, editsUnfiltered);
        branchingEditsFoundSubgraph = true;
        // std::cout << __FILE__<<":"<<__LINE__<<" edits filtered to: edits="<<Graph::vector_tostring(edits)<<"\n";
        if(edits.size() > 0) {
            branchingEdits = edits;
            branchingEditsFound = true;
#ifdef DEBUG
            // branchingForbiddenName = "F1 (Claw) in " + Graph::vector_tostring_value({uVertex, vVertex, wVertex, xVertex});
#endif
        }

        options.timeFindingForbidden += TimeDifference(startLooking);
    }
    else {
        auto startCliques = TimeNow();
        int vertexCandidate = G->getVertexInMoreThanSCliques(s);
        options.timeFindingCliques += TimeDifference(startCliques);

        // no vertex in more than s cliques: no edits needed
        if(vertexCandidate < 0) {
    #ifdef DEBUG
            std::cout << "\t\t" << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" found solution\n";
    #endif
            Graph solution(G);
            
            solution.edgesAdded = copyVectorVectorInt(edgesAdded);
            solution.edgesRemoved = copyVectorVectorInt(edgesRemoved);
            
            result.push_back(solution);
            return;
        }

    #ifdef DEBUG
        if(false) {
            std::cout << "\t" << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" edits right now for u="<<vertexCandidate
                <<" edgesAdded="<<Graph::vector_tostring(edgesAdded)<<" edgesRemoved="<<Graph::vector_tostring(edgesRemoved)
                <<"\n";
        }
    #endif

        // cannot find a solution since we have no budget left
        if(k <= 0) return;

        if(vertexCandidate < 0) return;
        uVertex = vertexCandidate;

        // try to find a forbidden subgraph in $u$ (preferred claw, since there are fewer branches)
        auto startLooking = TimeNow();
        const auto neighborSet = G->neighbors(vertexCandidate);
        const auto neighborList = std::vector<int>(neighborSet.begin(), neighborSet.end());
        const auto degree = neighborList.size();
        for(size_t vIndex=0; vIndex<degree; ++vIndex) {
            const auto vVertex = neighborList[vIndex];
            const auto vNeighbors = G->neighbors(vVertex);

            for(size_t wIndex=vIndex+1; wIndex<degree; ++wIndex) {
                const auto wVertex = neighborList[wIndex];

                const bool edgeVW = G->edge_has(vVertex, wVertex);

                for(size_t xIndex=wIndex+1; xIndex<degree; ++xIndex) {
                    const auto xVertex = neighborList[xIndex];

                    const bool edgeVX =  G->edge_has(vVertex, xVertex);
                    const bool edgeWX =  G->edge_has(wVertex, xVertex);

                    // found a claw
                    if(!edgeVW && !edgeVX && !edgeWX) {
                        std::vector<EdgeEdit> editsUnfiltered = {
                            // remove edges from u
                            {from: uVertex, to: vVertex, add: false},
                            {from: uVertex, to: wVertex, add: false},
                            {from: uVertex, to: xVertex, add: false},

                            // add edges
                            /*{from: vVertex, to: wVertex, add: true},
                            {from: vVertex, to: xVertex, add: true},
                            {from: wVertex, to: xVertex, add: true},*/
                        };
                        overlappingSolutionsPropositionEdgeAdds(G, editsUnfiltered, options, vVertex, wVertex, xVertex);

                        auto edits = overlappingSolutionsFilterForbiddenEdits(G, options, forbidden, editsUnfiltered);
                        branchingEditsFoundSubgraph = true;
                        // std::cout << __FILE__<<":"<<__LINE__<<" edits filtered to: size="<<edits.size()<<"\n";
                        if(edits.size() > 0 && (!branchingEditsFound || edits.size() < branchingEdits.size())) {
                            branchingEdits = edits;
                            branchingEditsFound = true;
    #ifdef DEBUG
                            branchingForbiddenName = "F1 (Claw) in " + Graph::vector_tostring_value({uVertex, vVertex, wVertex, xVertex});
    #endif
                            if(options.forbiddenTakeFirst || (edgesAdded.size() == 0 && edgesRemoved.size() == 0)) {
                                vIndex = degree;
                                wIndex = degree;
                                break;
                            }
                        }

                        // cannot find F2 or F3 when there is a claw
                        // continue; // but could find another F1
                    }
                    
                    // F1,F2,F3 don't have a triangle
                    if(edgeVW && edgeWX && edgeVX) continue;

                    for(size_t yIndex=xIndex+1; yIndex<degree; ++yIndex) {
                        const auto yVertex = neighborList[yIndex];

                        const std::vector<int> subgraphVertices = {vVertex, wVertex, xVertex, yVertex};
                        const auto subgraph = G->getSubgraph(subgraphVertices);

                        // too few/many edges
                        if(subgraph.m() < 3 || subgraph.m() > 4) continue;

                        const auto vDegree = subgraph.degree(0);
                        const auto wDegree = subgraph.degree(1);
                        const auto xDegree = subgraph.degree(2);
                        const auto yDegree = subgraph.degree(3);

                        // no edges = no F1, F2, F3
                        if(vDegree==0 || wDegree==0 || xDegree==0 || yDegree==0) continue;

                        std::vector<EdgeEdit> editsUnfiltered;
    #ifdef DEBUG
                        std::string branchingForbiddenNameMaybe = "";
    #endif

                        // F1: found a claw in the 4 vertices if edgeCount = 3
                        if(vDegree==3) {
                            if(subgraph.m() > 3) continue;
                            editsUnfiltered = {
                                // remove edges from claw center
                                {from: vVertex, to: wVertex, add: false},
                                {from: vVertex, to: xVertex, add: false},
                                {from: vVertex, to: yVertex, add: false},

                                // add edges between claw leaves
                                /*{from: wVertex, to: xVertex, add: true},
                                {from: wVertex, to: yVertex, add: true},
                                {from: xVertex, to: yVertex, add: true},*/
                            };
                            overlappingSolutionsPropositionEdgeAdds(G, editsUnfiltered, options, wVertex, xVertex, yVertex);
    #ifdef DEBUG
                            branchingForbiddenNameMaybe = "F1 (Claw) in 4 vertices in " + Graph::vector_tostring_value({vVertex, wVertex, xVertex, yVertex});
    #endif
                        }
                        else if(wDegree==3) {
                            if(subgraph.m() > 3) continue;
                            editsUnfiltered = {
                                // remove edges from claw center
                                {from: wVertex, to: vVertex, add: false},
                                {from: wVertex, to: xVertex, add: false},
                                {from: wVertex, to: yVertex, add: false},

                                // add edges between claw leaves
                                /*{from: vVertex, to: xVertex, add: true},
                                {from: vVertex, to: yVertex, add: true},
                                {from: xVertex, to: yVertex, add: true},*/
                            };
                            overlappingSolutionsPropositionEdgeAdds(G, editsUnfiltered, options, vVertex, xVertex, yVertex);
    #ifdef DEBUG
                            branchingForbiddenNameMaybe = "F1 (Claw) in 4 vertices in " + Graph::vector_tostring_value({wVertex, vVertex, xVertex, yVertex});
    #endif
                        }
                        else if(xDegree==3) {
                            if(subgraph.m() > 3) continue;
                            editsUnfiltered = {
                                // remove edges from claw center
                                {from: xVertex, to: vVertex, add: false},
                                {from: xVertex, to: wVertex, add: false},
                                {from: xVertex, to: yVertex, add: false},

                                // add edges between claw leaves
                                /*{from: vVertex, to: wVertex, add: true},
                                {from: vVertex, to: yVertex, add: true},
                                {from: wVertex, to: yVertex, add: true},*/
                            };
                            overlappingSolutionsPropositionEdgeAdds(G, editsUnfiltered, options, vVertex, wVertex, yVertex);
    #ifdef DEBUG
                            branchingForbiddenNameMaybe = "F1 (Claw) in 4 vertices in " + Graph::vector_tostring_value({xVertex, vVertex, wVertex, yVertex});
    #endif
                        }
                        else if(yDegree==3) {
                            if(subgraph.m() > 3) continue;
                            editsUnfiltered = {
                                // remove edges from claw center
                                {from: yVertex, to: vVertex, add: false},
                                {from: yVertex, to: wVertex, add: false},
                                {from: yVertex, to: xVertex, add: false},

                                // add edges between claw leaves
                                /*{from: vVertex, to: wVertex, add: true},
                                {from: vVertex, to: xVertex, add: true},
                                {from: wVertex, to: xVertex, add: true},*/
                            };
                            overlappingSolutionsPropositionEdgeAdds(G, editsUnfiltered, options, vVertex, wVertex, xVertex);
    #ifdef DEBUG
                            branchingForbiddenNameMaybe = "F1 (Claw) in 4 vertices in " + Graph::vector_tostring_value({yVertex, vVertex, wVertex, xVertex});
    #endif
                        }

                        // F2: 3 edges, no vertices with degree = 0 or degree = 3
                        else if (subgraph.m() == 3) {
                            // get the P_4 path: have to start at a vertex with degree = 1
                            std::vector<int> walk;
                            if(vDegree==1) {
                                walk = subgraph.getAnyWalk(0, 4);
                            }
                            else if(wDegree==1) {
                                walk = subgraph.getAnyWalk(1, 4);
                            }
                            else if(xDegree==1) {
                                walk = subgraph.getAnyWalk(2, 4);
                            }
                            else {
                                walk = subgraph.getAnyWalk(3, 4);
                            }

                            editsUnfiltered = {
                                // remove edges from u
                                {from: uVertex, to: vVertex, add: false},
                                {from: uVertex, to: wVertex, add: false},
                                {from: uVertex, to: xVertex, add: false},
                                {from: uVertex, to: yVertex, add: false},

                                // remove center bottom edge
                                {from: subgraph.id_get(walk[1]), to: subgraph.id_get(walk[2]), add: false},

                                // add edges between P4
                                {from: subgraph.id_get(walk[0]), to: subgraph.id_get(walk[2]), add: true},
                                {from: subgraph.id_get(walk[1]), to: subgraph.id_get(walk[3]), add: true},

                                // do not branch on v,y - spare this edge
                                // {from: subgraph.id_get(walk[0]), to: subgraph.id_get(walk[3]), add: true},

                                // remove other bottom edges (lead to F1 but we can only spare one edit, which is the v,y added edge)
                                // do these edits only at the end
                                {from: subgraph.id_get(walk[0]), to: subgraph.id_get(walk[1]), add: false},
                                {from: subgraph.id_get(walk[2]), to: subgraph.id_get(walk[3]), add: false},
                            };
    #ifdef DEBUG
                            /*if(k==1 && uVertex==0) std::cout << "\t"<< __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" finding F2 with u="<<uVertex<<" ids="<<Graph::vector_tostring(subgraph.ids)
                                <<" walk="<<Graph::vector_tostring(walk)
                                <<" edgesAdded="<<Graph::vector_tostring(edgesAdded)<<" edgesRemoved="<<Graph::vector_tostring(edgesRemoved)
                                <<" forbidden="<<Graph::vector_tostring(forbidden)
                                <<" subgraph edges: "<<Graph::vector_tostring(subgraph.edges)<<"\n";*/
                            branchingForbiddenNameMaybe = "F2 in " + Graph::vector_tostring_value({uVertex, subgraph.id_get(walk[0]), subgraph.id_get(walk[1]), subgraph.id_get(walk[2]), subgraph.id_get(walk[3])});
    #endif
                        }

                        // F3: all degrees are exactly 2
                        else {
                            const auto walk = subgraph.getAnyWalk(0, 4);

                            /// std::cout << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" walk="<< Graph::vector_tostring(walk)<<" v="<<vVertex<<" w="<<wVertex<<" x="<<xVertex<<" y="<<yVertex<<" id of walk0="<<subgraph.id_get(walk[0])<<"\n";
                            editsUnfiltered = {
                                // remove edges from u
                                {from: uVertex, to: vVertex, add: false},
                                {from: uVertex, to: wVertex, add: false},
                                {from: uVertex, to: xVertex, add: false},
                                {from: uVertex, to: yVertex, add: false},

                                // add edges between C4
                                {from: subgraph.id_get(walk[0]), to: subgraph.id_get(walk[2]), add: true},
                                {from: subgraph.id_get(walk[1]), to: subgraph.id_get(walk[3]), add: true},

                                // remove bottom edges (lead to F2 but we can only spare one edit, which is the walk[0]->walk[3] removed edge)
                                // do these edits only at the end
                                {from: subgraph.id_get(walk[0]), to: subgraph.id_get(walk[1]), add: false},
                                {from: subgraph.id_get(walk[1]), to: subgraph.id_get(walk[2]), add: false},
                                {from: subgraph.id_get(walk[2]), to: subgraph.id_get(walk[3]), add: false},
                                // {from: subgraph.id_get(walk[0]), to: subgraph.id_get(walk[3]), add: false},
                            };
    #ifdef DEBUG
                            branchingForbiddenNameMaybe = "F3 in " + Graph::vector_tostring_value({uVertex, subgraph.id_get(walk[0]), subgraph.id_get(walk[1]), subgraph.id_get(walk[2]), subgraph.id_get(walk[3])});
    #endif
                        }

                        // filter edits, fix order from < to
                        auto edits = overlappingSolutionsFilterForbiddenEdits(G, options, forbidden, editsUnfiltered);

    #ifdef DEBUG
                        /*if(k==1 && uVertex==0) std::cout << "\t"<< __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" finding F2 with edit size "<<edits.size()
                                <<" edgesAdded="<<Graph::vector_tostring(edgesAdded)<<" edgesRemoved="<<Graph::vector_tostring(edgesRemoved)
                                <<" subgraph edges: "<<Graph::vector_tostring(subgraph.edges)<<"\n";*/
    #endif
                        branchingEditsFoundSubgraph = true;
                        if(edits.size() > 0 && (!branchingEditsFound || edits.size() < branchingEdits.size())) {
                            branchingEdits = edits;
                            branchingEditsFound = true;
    #ifdef DEBUG
                            branchingForbiddenName = branchingForbiddenNameMaybe;
    #endif

                            if(options.forbiddenTakeFirst || (edgesAdded.size() == 0 && edgesRemoved.size() == 0)) {
                                vIndex = degree;
                                wIndex = degree;
                                xIndex = degree;
                                break;
                            }
                        }
                    }
                }
            }
        }
        options.timeFindingForbidden += TimeDifference(startLooking);
    }

    // did not find a forbidden subgraph in $u$ with non-forbidden edits = cannot solve
    if(!branchingEditsFound) {
        if(!branchingEditsFoundSubgraph) {
            std::cout << "\t" << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" DID NOT FIND ANY EDITS for u="<<uVertex
            <<" edgesAdded="<<Graph::vector_tostring(edgesAdded)<<" edgesRemoved="<<Graph::vector_tostring(edgesRemoved)
            <<"\n";
            exit(1);
        }
        return;
    }

    // branch on all possible edits
#ifdef DEBUG
    // // added [6,7], remove [4,7], add [1,3], remove [5,8], remove [0,6]
    std::vector<std::vector<int>> looking = {
        {2,3,4},{0,1,3},{1,5,2},{5,6,1}
    };
    bool found = false;
    /*for(const auto& look : looking) {
        for(const auto& vec : edgesAdded) {
            if(vec[0] == look[0] && vec[1]==look[1]) {
                found = true;
                break;
            }
        }
        for(const auto& vec : edgesRemoved) {
            if(vec[0] == look[0] && vec[1]==look[1]) {
                found = true;
                break;
            }
        }
        for(const auto& vec : branchingEdits) {
            if(vec.from == look[0] && vec.to==look[1]) {
                found = true;
                break;
            }
        }
    }*/
    if(false || found) {
        std::cout << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" edits="<<(edgesAdded.size() + edgesRemoved.size())<<" starting "<<branchingEdits.size()
        <<" edgesAdded="<<Graph::vector_tostring(edgesAdded)<<" edgesRemoved="<<Graph::vector_tostring(edgesRemoved)
        << " subgraph="<<branchingForbiddenName
        << " to-edit="<<Graph::vector_tostring(branchingEdits)
        <<" \n";
    }
    /*if(edgesAdded.size()>=1 && edgesAdded[0][0]==6 && edgesAdded[0][1]==7) std::cout << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" starting "<<branchingEdits.size()
        <<" edgesAdded="<<Graph::vector_tostring(edgesAdded)<<" edgesRemoved="<<Graph::vector_tostring(edgesRemoved)
        << " subgraph="<<branchingForbiddenName
        <<" \n";*/
#endif

    // change forbidden: forbid ALL the edits for all siblings
    if(options.forbiddenMatrix) {
        for(auto edit : branchingEdits) {
            forbidden.at(edit.from).at(edit.to) = 0;
        }
    }
    else {
        for(auto edit : branchingEdits) {
            Graph::sorted_insert(forbidden.at(edit.from), edit.to);
        }
    }
    
    // do the edits
    for(auto edit : branchingEdits) {
        // change forbidden - change forbidden before copying since in sibling braches this edit is also forbidden
        /*if(options.forbiddenMatrix) {
            forbidden.at(edit.from).at(edit.to) = 1;
        }
        else {
            Graph::sorted_insert(forbidden.at(edit.from), edit.to);
        }*/

        // do the edit
        if(edit.add) {
            G->edge_add(edit.from, edit.to);
            edgesAdded.push_back({edit.from, edit.to, k});
        } else {
            G->edge_remove(edit.from, edit.to);
            edgesRemoved.push_back({edit.from, edit.to, k});
        }

#ifdef DEBUG
        if(0) std::cout << "\t" << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" doing edit from="<< edit.from<<" to="<<edit.to
            <<" edgesAdded="<<Graph::vector_tostring(edgesAdded)<<" edgesRemoved="<<Graph::vector_tostring(edgesRemoved)<<"\n";
#endif

        // branch
        if(options.forbiddenCopy) {
            auto start = TimeNow();
            auto forbiddenCopy = copyVectorVectorInt(forbidden);
            options.timeForbiddenCopy += TimeDifference(start);

            overlappingClusterEditingSolutionsBranchAndBoundRecursion(G, result, s, k-1, options, maxSolutions, forbiddenCopy, 
                edgesAdded, edgesRemoved);
        } else {
            overlappingClusterEditingSolutionsBranchAndBoundRecursion(G, result, s, k-1, options, maxSolutions, forbidden, 
                edgesAdded, edgesRemoved);
        }
        
        // undo the edit
        if(edit.add) {
            G->edge_remove(edit.from, edit.to);
            edgesAdded.pop_back();
        } else {
            G->edge_add(edit.from, edit.to);
            edgesRemoved.pop_back();
        }

        if(maxSolutions > 0 && result.size() >= maxSolutions) return;

        // forbid the opposite for other branches (= do nothing)
    }
    
    // if we don't copy forbidden to children, we have to remove these forbidden edits again
    if(!options.forbiddenCopy) {
        auto start = TimeNow();
        if(options.forbiddenMatrix) {
            for(auto edit : branchingEdits) {
                forbidden.at(edit.from).at(edit.to) = 0;
            }
        }
        else {
            for(auto edit : branchingEdits) {
                Graph::sorted_remove(forbidden.at(edit.from), edit.to);
            }
        }
        options.timeForbiddenCopy += TimeDifference(start);
    }
}

// returns a guaranteed lower bound of needed edits for $s$-Overlapping Cluster Editing for this graph
int Graph::overlappingClusterEditingLowerBound(unsigned int s, int k, OverlappingEditingOptions& options) const {
    // int bound = 0;
    // int n = this->n();

    if(s != 2) {
        std::cout << __FILE__<<":"<<__LINE__<<" currently only supporting s=2";
        return 0;
    }

    if(k < 0) k = this->n() * this->n();

    // map of already included vertices. act like the vertex was deleted from the graph
    // otherwise need 2*n^2 time to copy adjacency list+matrix,
    // n^2 time to change adjancency matrix (shifting elements),
    // and n * (log(\Delta) + \Delta) time to change adjacency lists for every deletion
    // whereas checking in this map is O(1)
    // std::vector<bool> verticesRemoved = std::vector<bool>(n, false);

    // look for stars
    auto degeneracyInfo = this->getDegeneracyOrdering(s, k);

    return degeneracyInfo.editBound;
}

// find solutions for the $s$-Overlapping Cluster Editing problem with given $k$. Currently only supports s=2.
// runtime is O(9^k * poly(n))
std::vector<Graph> Graph::overlappingClusterEditingSolutionsBranchAndBound(size_t s, int k, OverlappingEditingOptions& options, unsigned int maxSolutions=0) const {
    options.noNeighborPropositionCount = 0;
    options.criticalCliqueEdges = 0;

    options.timeFindingCliques = 0;
    options.timeFindingForbidden = 0;

    options.timeForbiddenCopy = 0;

    options.timeNoNeighborMerges = 0;

    auto start = TimeNow();

    std::vector<Graph> result = std::vector<Graph>();

    if(s != 2) {
        std::cout << __FILE__<<":"<<__LINE__<<" currently only supporting s=2";
        return result;
    }

    std::vector<std::vector<int>> forbidden = options.forbiddenMatrix ? 
        std::vector<std::vector<int>>(this->n(), std::vector<int>(this->n()))
        : std::vector<std::vector<int>>(this->n(), std::vector<int>());
    
    std::vector<std::vector<int>> edgesAdded = std::vector<std::vector<int>>();
    std::vector<std::vector<int>> edgesRemoved = std::vector<std::vector<int>>();

    Graph Copy(this);

    // forbid edits inside cliques with size > 2
    if (options.forbidCliques) {
        const auto cliqueInfo = Copy.getMaximalCliques(s);
        for(auto clique : cliqueInfo.cliqueList) {
            if(clique.size() < 3) continue;

            // forbid edges
            for(auto v : clique) {
                for (auto w : clique) {
                    if(v >= w) continue;

                    if(options.forbiddenMatrix) {
                        forbidden.at(v).at(w) = 1;
                    } else {
                        Graph::sorted_insert(forbidden.at(v), w);
                    }
                    ++options.cliqueEdges;
                }
            }
        }
    }
    // forbid edits inside critical cliques
    else if (options.forbidCriticalCliques) {
        std::unordered_map<std::string, std::unordered_set<int>> criticalCliques = {};

        for (int vid = 0; vid < this->n(); ++vid) {
            // get closed neighborhood, sort
            auto& neighborSet = this->neighbors(vid);
            std::vector<int> closedNeighborhood = std::vector<int>(neighborSet.begin(), neighborSet.end());
            closedNeighborhood.push_back(vid);
            std::sort(closedNeighborhood.begin(), closedNeighborhood.end());
            auto cliqueString = Graph::vector_tostring(closedNeighborhood);

            // put into critical cliques
            if(criticalCliques.find(cliqueString) == criticalCliques.end()) criticalCliques.insert({cliqueString, std::unordered_set<int>()});

            criticalCliques.find(cliqueString)->second.insert(vid);
        }

        // set edges inside critical cliques as forbidden
        for(auto kv : criticalCliques) {
            for(auto v : kv.second) {
                for (auto w : kv.second) {
                    if(v >= w) continue;

                    // forbid edges
                    if(options.forbiddenMatrix) {
                        forbidden.at(v).at(w) = 1;
                    } else {
                        Graph::sorted_insert(forbidden.at(v), w);
                    }
                    ++options.criticalCliqueEdges;
                }
            }
        }
    }

    overlappingClusterEditingSolutionsBranchAndBoundRecursion(&Copy, result, s, k, options, maxSolutions, forbidden, edgesAdded, edgesRemoved);

    options.timeTotal = TimeDifference(start);

    return result;
}

// get any walk with at most `path_size_max` vertices, starting in `vertex_start`.
// Prevents v,w,v from happening but v,w,x,v could happen. O(path_size_max)
std::vector<int> Graph::getAnyWalk(int vertex_start, unsigned int path_size_max) const {
    std::vector<int> path = std::vector<int>();
    path.reserve(path_size_max);

    path.push_back(vertex_start);
    int previous = vertex_start;
    int current = vertex_start;
    for(unsigned int i=1; i<path_size_max; ++i) {
        const auto neighbors = this->neighbors(current);

        auto it = neighbors.begin();

        // do not directly go back: if vid = first neighbor then we want the second neighbor
        const unsigned int firstNeighborEqual = *it == previous; // ? 1 : 0;
        if(neighbors.size() <= firstNeighborEqual) break;

        // std::cout << __FILE__<<":"<<__LINE__<<" vid="<<current<<" neighbors[0]="<<neighbors[0]<<" neighbors[1]="<<neighbors[1]<<" firstNeighborEqual="<<firstNeighborEqual<<"\n";

        previous = current;

        if(firstNeighborEqual) {
            ++it;
        }

        current = *it;
        // current = neighbors[firstNeighborEqual];
        path.push_back(current);
    }
    return path;
}

// get a subgraph of the given vertex IDs
Graph Graph::getSubgraph(const std::vector<int>& vertex_ids) const {
    Graph graph(vertex_ids.size());
    
    graph.ids.assign(graph.number_vertices, 0);
    graph.ids_initialized = true;

    // set the IDs map
    for(unsigned int i=0; i<graph.number_vertices; ++i) {
        graph.ids[i] = vertex_ids.at(i);
    }

    // copy edges
    for(unsigned int i=0; i<graph.number_vertices; ++i) {
        for(unsigned int j=i+1; j<graph.number_vertices; ++j) {
            const int v = vertex_ids.at(i);
            const int w = vertex_ids.at(j);

            if(!this->edge_has(v, w)) continue;
            graph.edge_add(i, j);
        }
    }

    return graph;
}

// checks whether the graph has an edge: O(1)
bool Graph::edge_has(int v, int w) const {
#ifndef GRAPH_H_MATRIX_AND_LIST
    const auto& list = this->edges_list.at(v);
    return list.find(w) != list.end();
#else
    return this->edges_matrix.at(v).at(w);
#endif
}

// insert an edge into the graph: O(1)
void Graph::edge_add(int v, int w) {
#ifndef GRAPH_H_MATRIX_AND_LIST
    edges_list.at(v).insert(w);
    edges_list.at(w).insert(v);
#else
    Graph::sorted_insert(edges.at(v), w);
    Graph::sorted_insert(edges.at(w), v);
    this->edges_matrix.at(v).at(w) = 1;
    this->edges_matrix.at(w).at(v) = 1;
#endif
    ++this->number_edges;
}

// remove an edge from the graph: O(1)
void Graph::edge_remove(int v, int w) {
#ifndef GRAPH_H_MATRIX_AND_LIST
    edges_list.at(v).erase(w);
    edges_list.at(w).erase(v);
#else
    Graph::sorted_remove(edges.at(v), w);
    Graph::sorted_remove(edges.at(w), v);
    this->edges_matrix.at(v).at(w) = 0;
    this->edges_matrix.at(w).at(v) = 0;
#endif
    --this->number_edges;
}

// returns the degree of a vertex
int Graph::degree(int v) const {
#ifndef GRAPH_H_MATRIX_AND_LIST
    return this->edges_list.at(v).size();
#else
    return this->edges.at(v).size();
#endif
}

#ifndef GRAPH_H_MATRIX_AND_LIST
const std::unordered_set<int>& Graph::neighbors(int v) const {
    return edges_list.at(v);
}
#else
const std::vector<int>& Graph::neighbors(int v) const {
    return edges.at(v);
}
#endif

// returns the mapped ID of the given vertex_id
int Graph::id_get(const int v) const {
    if(!this->ids_initialized) return -1;
    return this->ids.at(v);
}

// returns whether there is a map of this vertices to other vertex IDs
bool Graph::id_has() const {
    return this->ids_initialized;
}

// returns the number of vertices in this graph
unsigned int Graph::n() const {
    return this->number_vertices;
}

// returns the number of edges in this graph
unsigned int Graph::m() const {
    return this->number_edges;
}

// parse a graph from a graph6 string
Graph Graph::parse_graph6(const std::string& g6) {
    size_t idx = 0;

    // number of vertices = first character
    int n = g6[idx++] - 63;

    Graph G(n);

    // adjacency bits = other characters
    int bit_buffer = 0;
    int bit_count = 0;
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < i; ++j) {
            if (bit_count == 0) {
                bit_buffer = g6[idx++] - 63;
                bit_count = 6;
            }
            bit_count--;
            int bit = (bit_buffer >> bit_count) & 1;

            if(bit==1) {
                G.edge_add(i, j);
            }
        }
    }

    return G;
}

// constructor initializing adjacency lists
Graph::Graph(int n) {
    this->number_vertices = n;
    this->number_edges = 0;
    this->ids_initialized = false;

    // create empty adjacency lists
#ifndef GRAPH_H_MATRIX_AND_LIST
    this->edges_list.assign(n, std::unordered_set<int>(n));
#else
    this->edges.assign(n, std::vector<int>());
    this->edges_matrix.assign(n, std::vector<bool>(n, false));
#endif
}

// copy constructor
Graph::Graph(const Graph* G) {
    this->number_vertices = G->number_vertices;
    this->number_edges = G->number_edges;

    this->ids_initialized = G->ids_initialized;
    if(G->ids_initialized) {
        this->ids = std::vector<int>(G->ids);
    }

    // copy adjacency lists and matrix
#ifndef GRAPH_H_MATRIX_AND_LIST
    this->edges_list = std::vector<std::unordered_set<int>>(this->number_vertices);
    for(size_t i=0; i<this->number_vertices; ++i) {
        this->edges_list[i] = std::unordered_set<int>(G->edges_list[i]);
    }
#else
    this->edges = std::vector<std::vector<int>>(this->number_vertices);
    this->edges_matrix = std::vector<std::vector<bool>>(this->number_vertices);
    for(size_t i=0; i<this->number_vertices; ++i) {
        this->edges[i] = std::vector<int>(G->edges[i]);
        this->edges_matrix[i] = std::vector<bool>(G->edges_matrix[i]);
    }
#endif
}

std::string Graph::tostring(const EdgeEdit& vec) {
    return "[" + std::to_string(vec.from) + (vec.add ? "+" : "-") + std::to_string(vec.to) + "]";
}

std::string Graph::vector_tostring(const std::vector<EdgeEdit>& vec) {
    std::string s = "[";
    const auto n = vec.size();
    if(n == 0) return s + "]";
    s += Graph::tostring(vec[0]);
    for(size_t i=1; i<n; ++i) {
        s += "," + Graph::tostring(vec[i]);
    }
    return s + "]";
}

std::string Graph::vector_tostring_value(const std::vector<int> vec) {
    std::string s = "[";
    const auto n = vec.size();
    if(n == 0) return s + "]";
    s += std::to_string(vec[0]);
    for(size_t i=1; i<n; ++i) {
        s += "," + std::to_string(vec[i]);
    }
    return s + "]";
}

std::vector<int> Graph::vector_slice(const std::vector<int>& vec, size_t from, size_t to) {
    const size_t n = to - from;
    std::vector<int> result = std::vector<int>(n);
    for(size_t i=0; i<n; ++i) {
        result[i] = vec[from + i];
    }
    return result;
}

bool Graph::sorted_contains(const std::vector<int>& vec, int x) {
    return std::binary_search(vec.begin(), vec.end(), x);
}

// insert an element into a vector at the correctly sorted position
void Graph::sorted_insert(std::vector<int>& vec, int x) {
    auto it = std::lower_bound(vec.begin(), vec.end(), x);
    if (it == vec.end() || *it != x) {
        vec.insert(it, x);
    }
}

// remove an element from a sorted vector
void Graph::sorted_remove(std::vector<int>& vec, int x) {
    auto it = std::lower_bound(vec.begin(), vec.end(), x);
    if (it != vec.end() && *it == x) {
        vec.erase(it);
    }
}

// return a new set as the set union: elements in either `a` or `b` in time O(|a| + |b|)
std::unordered_set<int> Graph::set_union(const std::unordered_set<int>& a, const std::unordered_set<int>& b) {
    std::unordered_set<int> set = std::unordered_set<int>(a.size() + b.size());

    for(auto el : a) set.insert(el);
    for(auto el : b) set.insert(el);

    return set;
}
// return a new set as the set intersection: elements in both `a` and `b` in time O(min(|a|, |b|))
std::unordered_set<int> Graph::set_intersection(const std::unordered_set<int>& a, const std::unordered_set<int>& b) {
    const auto& smaller = a.size() > b.size() ? a : b;
    const auto& larger = a.size() > b.size() ? b : a;
    
    std::unordered_set<int> set = std::unordered_set<int>(smaller.size());
    for(auto el : smaller) {
        // other does not contain element - skip
        if(larger.find(el) == larger.end()) continue;
        set.insert(el);
    }

    return set;
}
// return a new set as the set difference: all the elements in `a` that are not in `b` in time O(|a|)
std::unordered_set<int> Graph::set_difference(const std::unordered_set<int>& a, const std::unordered_set<int>& b) {
    std::unordered_set<int> set = std::unordered_set<int>(a.size());
    for(auto el : a) {
        // other contains element - skip
        if(b.find(el) != b.end()) continue;
        set.insert(el);
    }
    return set;
}

// merges two sorted vectors: elements in either `a` and `b`
std::vector<int> Graph::sorted_union_unique(const std::vector<int>& a, const std::vector<int>& b) {
    return Graph::sorted_union_unique_slice(a, 0, a.size(), b, 0, b.size());
}
// intersect two sorted vectors: elements in both `a` and `b`. Assumes unique elements.
std::vector<int> Graph::sorted_intersection_unique(const std::vector<int>& a, const std::vector<int>& b) {
    return Graph::sorted_intersection_unique_slice(a, 0, a.size(), b, 0, b.size());
}
// returns a sorted vector with all the elements in `a` that are not in `b`
std::vector<int> Graph::sorted_difference(const std::vector<int>& a, const std::vector<int>& b) {
    return Graph::sorted_difference_slice(a, 0, a.size(), b, 0, b.size());
}

// merges two sorted vectors: elements in either `a` and `b`. Using the index slices [aFrom,aTo) and [bFrom,bTo).
std::vector<int> Graph::sorted_union_unique_slice(const std::vector<int>& a, size_t aFrom, size_t aTo, const std::vector<int>& b, size_t bFrom, size_t bTo) {
    std::vector<int> list = std::vector<int>();

    size_t i=aFrom;
    size_t j=bFrom;

    int elementA = i < aTo ? a[i] : INT32_MAX;
    int elementB = j < bTo ? b[j] : INT32_MAX;

    while(i < aTo || j < bTo) {
        if(elementA == elementB) {
            list.push_back(elementA);
            ++i;
            ++j;
            if(i < aTo) elementA = a[i];
            else elementA = INT32_MAX;

            if(j < bTo) elementB = b[j];
            else elementB = INT32_MAX;
        }
        else if(elementA < elementB) {
            list.push_back(elementA);
            ++i;
            if(i < aTo) elementA = a[i];
            else elementA = INT32_MAX;
        }
        // elementA > elementB
        else {
            list.push_back(elementB);
            ++j;
            if(j < bTo) elementB = b[j];
            else elementB = INT32_MAX;
        }
    }

    return list;
}

// intersect two sorted vectors: elements in both `a` and `b`. Assumes unique elements. Using the index slices [aFrom,aTo) and [bFrom,bTo).
std::vector<int> Graph::sorted_intersection_unique_slice(const std::vector<int>& a, size_t aFrom, size_t aTo, const std::vector<int>& b, size_t bFrom, size_t bTo) {
    std::vector<int> list = std::vector<int>();

    size_t i=aFrom;
    size_t j=bFrom;

    int elementA = i < aTo ? a[i] : INT32_MAX;
    int elementB = j < bTo ? b[j] : INT32_MAX;

    // && here since can only intersect as long as we have elements from both
    while(i < aTo && j < bTo) {
        if(elementA == elementB) {
            list.push_back(elementA);
            ++i;
            ++j;
            if(i < aTo) elementA = a[i];
            else elementA = INT32_MAX;

            if(j < bTo) elementB = b[j];
            else elementB = INT32_MAX;
        }
        else if(elementA < elementB) {
            ++i;
            if(i < aTo) elementA = a[i];
            else elementA = INT32_MAX;
        }
        // elementA > elementB
        else {
            ++j;
            if(j < bTo) elementB = b[j];
            else elementB = INT32_MAX;
        }
    }

    return list;
}

// returns a sorted vector with all the elements in `a` that are not in `b`. Using the index slices [aFrom,aTo) and [bFrom,bTo).
std::vector<int> Graph::sorted_difference_slice(const std::vector<int>& a, size_t aFrom, size_t aTo, const std::vector<int>& b, size_t bFrom, size_t bTo) {
    std::vector<int> list = std::vector<int>();

    size_t i=aFrom;
    size_t j=bFrom;

    int elementA = i < aTo ? a[i] : INT32_MAX;
    int elementB = j < bTo ? b[j] : INT32_MAX;

    while(i < aTo) {
        if(elementA == elementB) {
            ++i;
            ++j;
            if(i < aTo) elementA = a[i];
            else elementA = INT32_MAX;

            if(j < bTo) elementB = b[j];
            else elementB = INT32_MAX;
        }
        else if(elementA < elementB) {
            list.push_back(elementA);
            ++i;
            if(i < aTo) elementA = a[i];
            else elementA = INT32_MAX;
        }
        // elementA > elementB
        else {
            while(elementA > elementB){
                ++j;
                if(j < bTo) elementB = b[j];
                else {
                    elementB = INT32_MAX;
                    break;
                }
            }
        }
    }

    return list;
}
