#ifndef GRAPH_H
#define GRAPH_H

// if defined, then instead of std::vector<std::unordered_set<int>> use
// 1. a matrix std::vector<std::vector<bool>> and
// 2. a std::vector<std::vector<int>> as sorted adjacency list
#define GRAPH_H_MATRIX_AND_LIST

#include <vector>
#include <string>
#include <optional>
#include <unordered_set>

struct MaximalCliquesInfo {
    // if FALSE do not push to cliques
    bool cliqueListEnabled = true;

    // list of cliques
#ifndef GRAPH_H_MATRIX_AND_LIST
    std::vector<std::unordered_set<int>>
#else
    std::vector<std::vector<int>> 
#endif
    cliqueList;

    // map of vertex -> overlapping cliques
    std::vector<std::vector<size_t>> vertexCliques;
    // vertex in at least s+1 cliques. If no such vertex exists, set to -1
    int vertexInMoreThanSCliques = -1;
};

struct OverlappingEditingOptions {
    // if TRUE: find forbidden subgraphs like described in Fellows et al. 2011
    // if FALSE: find forbidden subgraphs by going through neighbors
    bool useFellowsForbidden = true;

    // if TRUE: at the start of the algorithm forbid all edges inside critical cliques
    // if FALSE: do not do that
    bool forbidCriticalCliques = false;
    // count of forbidden critical clique edges
    int criticalCliqueEdges = 0;

    // if TRUE: at the start of the algorithm forbid all edges inside cliques > 2
    // if FALSE: do not do that
    bool forbidCliques = false;
    // count of forbidden clique edges
    int cliqueEdges = 0;

    // if TRUE: when finding a claw, don't branch on adding an edge 
    // if the leaves don't have a shared neighbor other than the
    // claw center.
    // if FALSE: always branch on all claw possibilities
    bool noNeighborProposition = false;
    // number of times the proposition was used
    int noNeighborPropositionCount = 0;

    // if TRUE: forbidden edits are stored in a nxn matrix.
    // if FALSE: forbidden edits are stored in adjacency lists
    bool forbiddenMatrix = true;
    // if TRUE: forbidden is copied for children branches
    // (since edits in children are not forbidden in sibling children
    // branches)
    // if FALSE: forbidden is NOT copied for children branches.
    // Instead, the changes to forbidden are un-done after all branches
    // have finished
    bool forbiddenCopy = false;

    // if TRUE: take the first forbidden subgraph found in $u$
    // if FALSE: loop through all forbidden subgraphs found in $u$
    // and choose the one with the least edits (filtered by forbidden)
    bool forbiddenTakeFirst = false;

    // total running time
    long timeTotal = 0;

    // time spent looking for a vertex $u$ in more than s cliques
    long timeFindingCliques = 0;
    // time spent looking for a forbidden subgraph
    long timeFindingForbidden = 0;

    // if forbiddenCopy=TRUE: time for copying forbidden.
    // else forbiddenCopy=FALSE: time for undoing forbidden changes.
    long timeForbiddenCopy = 0;

    long timeNoNeighborMerges = 0;
};
std::string OverlappingEditingOptionsToString(const OverlappingEditingOptions& options);

struct DegeneracyAndOrdering {
    // the degeneracy of the graph
    int degeneracy;
    // the degeneracy ordering of the graph
    std::vector<int> ordering;

    // the minimum number of edits needed to solve this instance of $s$-Overlapping Cluster Editing
    int editBound;
};

struct EdgeEdit {
    int from;
    int to;
    bool add;
};

class Graph {
  public:
    std::vector<std::vector<int>> edgesAdded;
    std::vector<std::vector<int>> edgesRemoved;

    int overlappingClusterEditingLowerBound(unsigned int s, int k, OverlappingEditingOptions& options) const;
    std::vector<Graph> overlappingClusterEditingSolutionsBranchAndBound(size_t s, int k, OverlappingEditingOptions& options, unsigned int maxSolutions) const;

    int getVertexInMoreThanSCliques(int s);
    MaximalCliquesInfo getMaximalCliques(size_t s=0);
    DegeneracyAndOrdering getDegeneracyOrdering(int s=0, int k=0) const;

    std::vector<int> getAnyWalk(int vertex_start, unsigned int path_size_max) const;
    std::vector<Graph> getComponents() const;
    Graph getSubgraph(const std::vector<int>& vertex_ids) const;

    bool edge_has(int v, int w) const;
    void edge_add(int v, int w);
    void edge_remove(int v, int w);

    int degree(int v) const;

    int id_get(const int v) const;
    bool id_has() const;

    unsigned int n() const;
    unsigned int m() const;

    static Graph parse_graph6(const std::string& g6);

    explicit Graph(int n);
    explicit Graph(const Graph* G);

    using iterator = std::vector<int>::iterator;
    using const_iterator = std::vector<int>::const_iterator;
    
    static std::string vector_tostring_value(const std::vector<int> vec);

    static std::string tostring(const EdgeEdit& vec);
    static std::string vector_tostring(const std::vector<EdgeEdit>& vec);

    template <typename T> static std::string vector_tostring(const T vec);
    template <typename T> static std::string vector_tostring(const std::unordered_set<T>& vec);
    template <typename T> static std::string vector_tostring(const std::vector<T>& vec);
    // template <typename T> static std::string vector_tostring(const std::vector<std::vector<T>>& vec);

    static std::vector<int> vector_slice(const std::vector<int>& vec, size_t from, size_t to);

    static bool sorted_contains(const std::vector<int>& vec, int x);
    static void sorted_insert(std::vector<int>& vec, int x);
    static void sorted_remove(std::vector<int>& vec, int x);

    static std::unordered_set<int> set_union(const std::unordered_set<int>& a, const std::unordered_set<int>& b);
    static std::unordered_set<int> set_intersection(const std::unordered_set<int>& a, const std::unordered_set<int>& b);
    static std::unordered_set<int> set_difference(const std::unordered_set<int>& a, const std::unordered_set<int>& b);

    static std::vector<int> sorted_union_unique(const std::vector<int>& a, const std::vector<int>& b);
    static std::vector<int> sorted_intersection_unique(const std::vector<int>& a, const std::vector<int>& b);
    static std::vector<int> sorted_difference(const std::vector<int>& a, const std::vector<int>& b);

    static std::vector<int> sorted_union_unique_slice(const std::vector<int>& a, size_t aFrom, size_t aTo, const std::vector<int>& b, size_t bFrom, size_t bTo);
    static std::vector<int> sorted_intersection_unique_slice(const std::vector<int>& a, size_t aFrom, size_t aTo, const std::vector<int>& b, size_t bFrom, size_t bTo);
    static std::vector<int> sorted_difference_slice(const std::vector<int>& a, size_t aFrom, size_t aTo, const std::vector<int>& b, size_t bFrom, size_t bTo);

#ifndef GRAPH_H_MATRIX_AND_LIST
    // edges of vertices as adjacency lists: O(deg(v)) enumeration of neighbors.
    // O(1) for checking if an edge exists.
    // O(1) for inserting/removing an edge
    // edges[vertex_id] is the set of adjacent vertices of the vertex. vertex_id \in [0, n)
    std::vector<std::unordered_set<int>> edges_list;
    const std::unordered_set<int>& neighbors(int v) const;
#else
    const std::vector<int>& neighbors(int v) const;

    // edges of vertices as adjacency lists: O(deg(v)) enumeration of neighbors.
    // O(log(deg(v))) for checking if an edge exists.
    // O(deg(v)) for inserting/removing an edge (shifting elements)
    // edges[vertex_id] is the set of adjacent vertices of the vertex. vertex_id \in [0, n)
    std::vector<std::vector<int>> edges;

    // edges of vertices as matrix: O(1) checking if an edge exists.
    // O(1) for inserting/removing an edge. O(n) for enumerating neighbors.
    // edges[vertex_id][vertex_id2] is TRUE if the edge exists, otherwise FALSE
    std::vector<std::vector<bool>> edges_matrix;
#endif

    // a map of vertex_id -> mapped vertex_id
    std::vector<int> ids;
  private:
    unsigned int number_vertices;
    unsigned int number_edges;

    // TRUE if ids has been initialized
    bool ids_initialized;
};

template <typename T> std::string Graph::vector_tostring(const T value) {
    return std::to_string(value);
}

template <typename T> std::string Graph::vector_tostring(const std::unordered_set<T>& vec) {
    const auto n = vec.size();
    if(n == 0) return "[]";
    auto it = vec.begin();
    std::string s = "[" + Graph::vector_tostring(*it);
    for(size_t i=1; i<n; ++i) {
        ++it;
        s += "," + Graph::vector_tostring(*it);
    }
    return s + "]";
}

template <typename T> std::string Graph::vector_tostring(const std::vector<T>& vec) {
    const auto n = vec.size();
    if(n == 0) return "[]";
    auto it = vec.begin();
    std::string s = "[" + Graph::vector_tostring(*it);
    for(size_t i=1; i<n; ++i) {
        ++it;
        s += "," + Graph::vector_tostring(*it);
    }
    return s + "]";
}

/*template <typename T> std::string Graph::vector_tostring(const std::vector<std::vector<T>>& vec) {
    const auto n = vec.size();
    if(n == 0) return "[]";
    auto it = vec.begin();
    std::string s = "[" + std::to_string(*it);
    s += Graph::vector_tostring(*it);
    for(size_t i=1; i<n; ++i) {
        ++it;
        s += "," + Graph::vector_tostring(*it);
    }
    return s + "]";
}*/

#endif
