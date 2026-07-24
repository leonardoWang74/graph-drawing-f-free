/*
Test something on a nauty stream

Run using nauty geng
nauty-geng -c 14 | ./testWithNauty
*/
#include <unistd.h>
#include <sys/wait.h>

#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <algorithm>
#include <functional>
#include <cmath>
#include "Graph.h"

#define ANNOTATION_UNDEF 0
#define ANNOTATION_PERMANENT 1
#define ANNOTATION_FORBIDDEN 2

// optional flags
#define DEDUPLICATION_ON 1 // if defined, use deduplication (memoization of \pi -> B)

// global variables
bool debug = false;
double branchingNumberWorstCase = 0;
int s = 1;

// return `str * factor` = `factor` repetitions of `str`
std::string stringMultiply(std::string str, int factor){
    std::string ret = "";
    ret.reserve(str.size() * factor);
    for(int i=0; i<factor; ++i) ret.append(str);
    return ret;
}

// type of pi: store annotations of pairs of vertices + the number of edits required
struct piType {
    std::vector<std::vector<int>> annotations;
    // number of edits = cost of this annotation
    int number_edits = 0;
    // number of fixed pairs of vertices
    int number_fixed = 0;
    // TRUE <=> there is no induced forbidden subgraph
    bool no_forbidden = false;
    // TRUE <=> this branch is infeasible (an induced forbidden subgraph with only fixed pairs of vertices exists)
    bool infeasible = false;
};
bool piNumberEditsSort(piType& a, piType& b) {
    return a.number_edits < b.number_edits;
}
typedef std::vector<piType> RuleType;

#ifdef DEDUPLICATION_ON
unsigned long piHash(const piType& pi) {
    unsigned long hash = 0;
    for(unsigned int v=0; v<pi.annotations.size(); ++v) {
        auto& row = pi.annotations[v];
        for(unsigned int w=v+1; w<row.size(); ++w) {
            auto value = row[w];
            if(value == 0) continue;
            hash += value * w;
        }
        hash *= 1033;
    }
    return hash;
}
bool piEqualsAnnotations(const piType& a, const piType& b) {
    // if(a.no_forbidden != b.no_forbidden) return false;
    // if(a.number_edits != b.number_edits) return false;
    if(a.annotations.size() != b.annotations.size()) return false;

    for(unsigned int v=0; v<a.annotations.size(); ++v) {
        auto& rowA = a.annotations[v];
        auto& rowB = b.annotations[v];
        if(rowA.size() != rowB.size()) return false;

        for(unsigned int w=v+1; w<rowA.size(); ++w) {
            if(rowA[w] != rowB[w]) return false;
        }
    }

    return true;
}

// saves hash -> [list of pairs (pi, calculated rules B)]
auto deduplication_map = std::unordered_map<unsigned long, std::vector<
        std::pair<piType, std::vector<RuleType>>
    >>();
#endif

int forbiddenSubgraphSizeUpperBound() {
    if(s == 1) return 3;
    if(s == 2) return 5;
    // int k = s+1;

    // TODO: did not yet prove that k-clique-minimal graph with $k \leq 5$ has at most 2(k-1) vertices
    // only showed algorithms to find subgraphs of at most 2(k-1) vertices that have $k$ maximal cliques
    // linear 2*(k-1) = 2*s
    // + add 1 vertex adjacent to all vertices in the k-clique-minimal graph
    // if(k <= 5) return 1 + 2*s;

    // proven k^{3/2} bound: 2*(k-1) + 4*(k-1)^{3/2} = 2*s+4*s^{3/2}
    // + add 1 vertex adjacent to all vertices in the k-clique-minimal graph
    return std::min((int)std::floor(1 + 2*s + 4*std::pow(s, 1.5)), 1+s*(s+1));
}

// apply reduction rules
std::vector<std::pair<int,int>> br_reduce(Graph* G, MaximalCliquesInfo& cliqueInfo, piType& pi, std::vector<int> last_edit_vertices) {
    std::vector<std::pair<int,int>> edits_made = {};

    // check if there is a vertex in >s maximal cliques
    if(cliqueInfo.vertexInMoreThanSCliques == -1) {
        pi.no_forbidden = true;
        return edits_made;
    }

    ////////////////////////////////////////////////
    // check if there is a FIXED forbidden subgraph,
    // that is, a forbidden subgraph where all pairs of vertices are fixed (PERMANENT/FORBIDDEN)
    // then, the instance is infeasible
    if(!last_edit_vertices.empty()) {
        bool found = false;

        // lambda to receive the indices and call the solver function
        auto lambda = [G, &cliqueInfo, &found, &pi, &last_edit_vertices](size_t, std::vector<size_t> indices) {
            // check no vertex = last_edit_vertices
            for(auto v : indices) {
                for(auto w : last_edit_vertices) {
                    if(v == (size_t)w) return true;
                }
            }
            // add all last_edit_vertices to our chosen set
            for(auto w : last_edit_vertices) {
                indices.push_back(w);
            }

            // check all edits inside are fixed
            for(size_t i=0; i<indices.size(); ++i) {
                for(size_t j=i+1; j<indices.size(); ++j) {
                    int v,w;
                    if(indices[i] < indices[j]) {
                        v = indices[i];
                        w = indices[j];
                    }
                    else {
                        w = indices[i];
                        v = indices[j];
                    }

                    if(pi.annotations[v][w] == ANNOTATION_UNDEF) return true; // try a different subset
                }
            }

            // make list of the chosen vertices (faster in a new loop: most indices will contain an UNDEF annotation)
            std::vector<int> chosenVertices = {};
            chosenVertices.reserve(indices.size());
            for(auto v : indices) {
                chosenVertices.push_back((int)v);
            }

            // create subgraph
            Graph Gprime = G->getSubgraph(chosenVertices);

            // check subgraph contains a vertex
            auto cliqueInfoPrime = Gprime.getMaximalCliques(s, true);

            // subgraph contains a forbidden subgraph => infeasible
            if(cliqueInfoPrime.vertexInMoreThanSCliques >= 0) {
                found = true;
                return false; // stop looking for subsets
            }
            
            // try a different subset
            return true;
        };

        // size without last_edit_vertices: they are always added
        size_t sizeBound = std::min((size_t)forbiddenSubgraphSizeUpperBound() - last_edit_vertices.size(), (size_t)G->n());

        // check if it is possible (with pi.number_fixed) to have a fixed subgraph of this size
        // a graph of size n has $\binom{n}{2} = n(n-1)/2 = p$ pairs of vertices.
        // we have $p$ = pi.number_fixed pairs of fixed pairs of vertices.
        // Solving for $n$: $n^2-n-2p = 0$
        // $n = 1/2 +/- \sqrt{1/4 + 2p}$
        // $n \leq 1/2 + \sqrt{1/4 + 2p}$
        // subtract 2 since we fix two vertices of the enumeration
        double sizeLargestByEdits = 0.5 + std::sqrt(0.25 + 2 * pi.number_fixed) - 2;
        if(sizeBound > sizeLargestByEdits) {
            sizeBound = (size_t)( std::floor(sizeLargestByEdits) );
        }

        // look for fixed induced forbidden subgraphs
        for(size_t size=1; size <= sizeBound; ++size) {
            SubsetsOfSizeLoop(G->n(), size, lambda);

            if(found) {
                pi.infeasible = true;
                return edits_made;
            }
        }
    }

    return edits_made;
}

void br_subsumption_prune(std::vector<RuleType>& B) {
    // sort the branching vector ascending
    for(auto& A : B) {
        std::sort(A.begin(), A.end(), piNumberEditsSort);
    }

    bool restart = false;
    for(size_t i1=0; i1<B.size(); ++i1) {
        if(restart) {
            restart = false;
            i1 = 0;
        }

        auto& A1 = B[i1];
        if(A1.empty()) continue; // do not subsume empty rules

        for(size_t j2=i1+1; j2<B.size(); ++j2) {
            auto& A2 = B[j2];
            if(A2.empty()) continue; // do not subsume empty rules

            // test subsumption of A2
            if(A1.size() <= A2.size()) {
                bool subsumption = true;
                for(size_t i=0; i<A1.size(); ++i) {
                    if(A1[i].number_edits >= A2[i].number_edits) continue;
                    subsumption = false;
                    break;
                }
                if(subsumption) {
                    B.erase(B.begin()+j2);
                    --j2;
                    continue; // do not check for subsumption of A1
                }
            }

            // test subsumption of A1
            if(A1.size() >= A2.size()) {
                bool subsumption = true;
                for(size_t i=0; i<A2.size(); ++i) {
                    if(A2[i].number_edits >= A1[i].number_edits) continue;
                    subsumption = false;
                    break;
                }
                if(subsumption) {
                    B.erase(B.begin()+i1);
                    // re-do the loop with a new A1
                    if(i1>0) {
                        --i1;
                    }
                    else {
                        // start the whole loop anew
                        restart = true;
                    }
                    break; // break the j2 loop (A1 does not exist anymore)
                }
            }
        }
    }
}

// concatenate and prune branching rules (only by subsumption)
std::vector<RuleType> br_concatenate(std::vector<RuleType>& B1, std::vector<RuleType>& B2) {
    std::vector<RuleType> B = {};
    
    br_subsumption_prune(B1);
    br_subsumption_prune(B2);

    // create the cartesian product B1 \cross B2
    for(auto& A1 : B1) {
        for(auto& A2 : B2) {
            // A1 \cup A2
            RuleType A(A1);
            for(auto& pi : A2) A.push_back(pi);

            B.push_back(A);
        }
    }

    br_subsumption_prune(B);
    return B;
}

std::string ruleTypeToBranchingVector(RuleType& A) {
    std::string ret = "(";
    bool first = true;
    for (const auto& pi : A) {
        if(!first) ret += ",";
        else first = false;

        ret += std::to_string(pi.number_edits);
    }
    return ret + ")";
}

std::vector<int> branching_rule_to_vector(const RuleType& A) {
    std::vector<int> ret = {};
    ret.reserve(A.size());
    for(const auto& pi : A) {
        ret.push_back(pi.number_edits);
    }
    return ret;
}

double branching_rule_to_number(const RuleType& A){
    if (A.empty()) throw std::runtime_error("Empty branching rule A.");
    for (const auto& pi : A) {
        if(pi.number_edits <= 0) throw std::runtime_error("pi contains no edits.");
    }

    // binary search on the characteristic polynomial f(z) = \sum_i z^{-d_i} = 1
    double low = 1.0, high = static_cast<double>(A.size());
    for (int it = 0; it < 150; ++it) {
        const double mid = 0.5 * (low + high);

        // f(z) = \sum_i z^{-d_i}
        double f = 0;
        for (const auto& di : A) f += std::pow(mid, -di.number_edits);

        // target: f(z) = 1
        if(f > 1.0) {
            low = mid;
        }
        else {
            high = mid;
        }
    }

    // return found z value
    return 0.5 * (low + high);
}

RuleType& branching_rule_best(std::vector<RuleType>& B) {
    double br = 99999;
    if(B.empty()) {
        throw std::runtime_error("B is empty.");
    }

    size_t best = 0;
    for(size_t i=0; i<B.size(); ++i) {
        auto& A = B[i];
        auto brHere = branching_rule_to_number(A);
        if(debug) {
            std::cout << "\t" << __FILE__<<":"<<__LINE__
                <<" branching vector="<<Graph::vector_tostring(branching_rule_to_vector(A))
                <<" branching factor br="<<Graph::vector_tostring(brHere)
                <<"\n";
        }
        if(brHere >= br) continue;
        br = brHere;
        best = i;
    }
    if(debug) {
        std::cout << __FILE__<<":"<<__LINE__
            <<" best branching vector="<<Graph::vector_tostring(branching_rule_to_vector(B[best]))
            <<" branching factor br="<<Graph::vector_tostring(br)
            <<"\n";
    }
    return B[best];
}

// toggle a list of edits on the graph G
void G_edit_toggle(Graph* G, std::vector<std::pair<int,int>>& edits) {
    for(const auto& edit : edits) {
        auto v = edit.first;
        auto w = edit.second;

        if(G->edge_has(v,w)) {
            G->edge_remove(v,w);
        } else {
            G->edge_add(v,w);
        }
    }
}

// algorithm for finding a k-clique-minimal induced subgraph G[V_F]
// find V_F in the given startingCliques (=indices of cliques of cliqueInfo.cliqueSets)
std::vector<int> findForbiddenSubgraphkCliqueMinimal(Graph* G, MaximalCliquesInfo& cliqueInfo, int k, int vInAllCliques, std::vector<size_t> startingCliques) {
    /////////////////////////////////////////
    // trivial distinguisher set $S$, of the given startingCliques
    std::unordered_set<int> S(k*(k-1));

    size_t iterMax = std::min( (size_t)k, startingCliques.size()); // only need to distinguish $k$ cliques
    for(size_t i=0; i<iterMax; ++i) {
        for(size_t j=i+1; j<iterMax; ++j) {
            auto& cliqueA = cliqueInfo.cliqueSets[ startingCliques[i] ];
            auto& cliqueB = cliqueInfo.cliqueSets[ startingCliques[j] ];

            auto AwithoutB = Graph::set_difference(cliqueA, cliqueB);
            auto BwithoutA = Graph::set_difference(cliqueB, cliqueA);
            
            int a = *AwithoutB.begin();
            auto& neighbors = G->neighbors(a);
            auto potentialB = Graph::set_difference(cliqueB, std::unordered_set<int>(neighbors.begin(), neighbors.end()));
            int b = *potentialB.begin();

            S.insert(a);
            S.insert(b);
        }
    }

    // subgraph G' = G[S]
    Graph GprimeValue = G->getSubgraph(std::vector<int>(S.begin(), S.end()));
    Graph* Gprime = &GprimeValue;

    /////////////////////////////////////////
    // calculate maximal cliques in $S$
    auto cliqueInfoPrime = Gprime->getMaximalCliques(s, false);

    // create clique sets
    for(auto& clique : cliqueInfoPrime.cliqueList) {
        cliqueInfoPrime.cliqueSets.push_back(std::unordered_set<int>(clique.begin(), clique.end()));
    }

    /////////////////////////////////////////
    // reduce $G' = G[S]$ to a $k$-clique-minimal induced subgraph
    auto& C_F = cliqueInfoPrime.cliqueSets; // do not need to deepcopy cliqueInfoPrime.cliqueSets
    auto V_F = std::unordered_set<int>(S.size()); // unordered_set for O(1) removal
    for(int v=0; v<Gprime->n_signed(); ++v) V_F.insert(v); // IDs in the subgraph are 0 .. |V(G')|

    if((unsigned int)k > C_F.size()) throw std::runtime_error("Algorithm called findForbiddenSubgraphkCliqueMinimal with k > startingCliques "+G->to_graph6()+".");

    // remove loop
    while(true) {
        size_t cliqueCount = C_F.size();
        int dBound = 1 + (int)C_F.size() - k;

        // D(v) for every vertex. D[v][i] = v is single distinguisher for clique i.
        // vertexDpairs[v][cliqueA] = true means that v has already incremented D(v) because of cliqueA
        std::vector<std::vector<bool>> vertexDpairs(Gprime->n(), std::vector<bool>(cliqueCount, false));

        // |D(v)| for every vertex = count of cliques for which $v$ is the single distinguisher
        // = counting the entries of D(v) e.g. D(v) = {A,B,C} to |D(v)| = 3
        std::vector<int> vertexDcount(Gprime->n(), 0);

        // pairwise differences -> D(v)
        // note that the clique sets contain at most the vertices V_F
        for(size_t i=0; i<cliqueCount; ++i) {
            for(size_t j=i+1; j<cliqueCount; ++j) {
                auto& cliqueA = C_F[i];
                auto& cliqueB = C_F[j];

                auto AwithoutB = Graph::set_difference(cliqueA, cliqueB);
                auto BwithoutA = Graph::set_difference(cliqueB, cliqueA);
                
                // single distinguisher exists
                if(AwithoutB.size() == 1) {
                    int v = *AwithoutB.begin();

                    // increment D(v) if D(v) does not yet contain A (count every vertex+clique pair only once)
                    if(!vertexDpairs[v][i]){
                        vertexDpairs[v][i] = true;
                        ++vertexDcount[v];
                    }
                }

                // single distinguisher exists
                if(BwithoutA.size() == 1) {
                    int v = *BwithoutA.begin();

                    // increment D(v) if D(v) does not yet contain B (count every vertex+clique pair only once)
                    if(!vertexDpairs[v][j]){
                        vertexDpairs[v][j] = true;
                        ++vertexDcount[v];
                    }
                }
            }
        }

        // look for vertex v \in V_F with |D(v)| < 1+|C_F|-k
        int x = -1;
        for(auto w : V_F) {
            if(vertexDcount[w] >= dBound) continue;
            x = w;
            break;
        }

        // no vertex found: G[V_F] is k-clique-minimal
        if(x < 0) break;

        // remove x: update C_F and V_F
        V_F.erase(x);

        // reverse loop so removing entries preserves (lower) indices
        size_t i=cliqueCount;
        for(size_t j=0; j<cliqueCount; ++j) {
            --i; // size_t is unsigned so loop variable counts up

            // clique A_i \in D(x) => remove from C_F
            if(vertexDpairs[x][i]) {
                C_F.erase(C_F.begin() + i);
            }
            // clique A_i \not \in D(x) => keep and remove x from the clique
            else {
                C_F[i].erase(x);
            }
        }

        // we recalculate D(v) above
    }

    // after the loop: G[V_F] is k-clique-minimal.
    // return the original (mapped) vertices V_F \cup \{v\}
    std::vector<int> subgraph = {};
    subgraph.reserve(V_F.size()+1);
    subgraph.push_back(vInAllCliques);
    for(auto w : V_F) {
        subgraph.push_back(Gprime->id_get(w));
    }
    return subgraph;
}

std::vector<int> findForbiddenSubgraph(Graph* G, MaximalCliquesInfo& cliqueInfo) {
    // no vertex in s+1 maximal cliques
    if(cliqueInfo.vertexInMoreThanSCliques < 0) return {};

    int v = cliqueInfo.vertexInMoreThanSCliques;

    auto& vertexCliques = cliqueInfo.vertexCliques[v];
    
    // s=1: trivial distinguishers = P_3
    if(s == 1) {
        auto& cliqueA = cliqueInfo.cliqueSets[vertexCliques[0]];
        auto cliqueB = cliqueInfo.cliqueSets[vertexCliques[1]];

        auto AwithoutB = Graph::set_difference(cliqueA, cliqueB);
        auto BwithoutA = Graph::set_difference(cliqueB, cliqueA);
        
        auto a = *AwithoutB.begin();
        auto& neighbors = G->neighbors(a);
        auto potentialB = Graph::set_difference(cliqueB, std::unordered_set<int>(neighbors.begin(), neighbors.end()));
        int b = *potentialB.begin();

        return {v,a,b};
    }

    // otherwise, find a (s+1)-clique-minimal induced subgraph in the cliques of v
    return findForbiddenSubgraphkCliqueMinimal(G, cliqueInfo, s+1, v, vertexCliques);
}

// compute branching rules
// [Gramm et al 2004 - Automated generation of search tree algorithms for hard graph modiﬁcation problems]
std::vector<RuleType> br_compute(Graph* G, piType& piOriginal, bool useForbiddenSubgraphBrCompute, std::vector<int> last_edit_vertices={}) {
    std::vector<RuleType> B = {};

    // copy pi
    piType pi = piOriginal;

#ifdef DEDUPLICATION_ON
    // check deduplication
    auto hash = piHash(pi);
    auto hashIt = deduplication_map.find(hash);
    auto hashCollision = hashIt != deduplication_map.end();

    // hash collision: check if real collision or only hash collision
    if(hashCollision) {
        for(const auto& dedup_pair : hashIt->second) {
            // real collision: already had this branch
            if(piEqualsAnnotations(pi, dedup_pair.first)) {
                // return the already calculated rule set
                return dedup_pair.second;
            }
        }
    }
#endif

    std::vector<int> verticesToIteratePairsOn = {};
    std::vector<std::pair<int,int>> edge_edits;

    // new block to free cliqueInfo after
    {
        // get all cliques + create clique sets
        auto cliqueInfo = G->getMaximalCliques(s, false);
        for(auto& clique : cliqueInfo.cliqueList) {
            cliqueInfo.cliqueSets.push_back(std::unordered_set<int>(clique.begin(), clique.end()));
        }
        
        // apply reduction rules
        edge_edits = br_reduce(G, cliqueInfo, pi, last_edit_vertices);

        // infeasible: found forbidden subgraph where no edit is possible = all pairs of vertices are fixed => no children branch can fix this
        if(pi.infeasible) {
            #ifdef DEDUPLICATION_ON
            // update deduplication map with (pi,output)
            deduplication_map[hash].push_back({pi, {}});
            #endif

            if(debug) {
                std::cout << stringMultiply("    ", pi.number_fixed) << __FILE__<<":"<<__LINE__
                    <<" current graph="<<G->to_graph6()
                    <<" edits="<<Graph::vector_tostring(pi.number_edits)
                    <<" INFEASIBLE "
                    <<"\n";
            }

            // undo edits done in br_reduce
            G_edit_toggle(G, edge_edits);
            return {};
        }

        // find branching pairs
        if(!pi.no_forbidden) {
            // check all pairs
            if(!useForbiddenSubgraphBrCompute) {
                verticesToIteratePairsOn.reserve(G->n());
                for(int v=0; v<G->n_signed(); ++v) verticesToIteratePairsOn.push_back(v);
            }
            // check only pairs on a forbidden subgraph
            else {
                // find forbidden subgraph
                // verticesToIteratePairsOn = findForbiddenSubgraph(G, cliqueInfo);

                // find all forbidden subgraphs = all cliques of vertices in >s maximal cliques
                std::unordered_set<int> V_F(G->n());
                for(int v=0; v<G->n_signed(); ++v) {
                    auto& vertexCliques = cliqueInfo.vertexCliques[v];
                    V_F.insert(v);
                    for(size_t index=0; index<vertexCliques.size(); ++index) {
                        auto& clique = cliqueInfo.cliqueSets[ vertexCliques[index] ];
                        for(auto w : clique) V_F.insert(w);
                    }
                }
                verticesToIteratePairsOn = std::vector<int>(V_F.begin(), V_F.end());

                /*
                // repeatedly find a forbidden subgraph and remove it from the graph = find all pairs of forbidden subgraphs
                auto Gprime = G->getSubgraph(V_F);
                while(true) {
                    auto forbidden = findForbiddenSubgraph(Gprime, cliqueInfo);
                    if(forbidden.empty()) break;


                }*/


                // make deterministic by sorting
                std::sort(verticesToIteratePairsOn.begin(), verticesToIteratePairsOn.end());
            }
        }
        else if(debug) {
            std::cout << stringMultiply("    ", pi.number_fixed) << __FILE__<<":"<<__LINE__
                <<" current graph="<<G->to_graph6()
                <<" edits="<<Graph::vector_tostring(pi.number_edits)
                <<" SOLUTION"
                <<"\n";
        }
                    
    }

    /*if(debug && !last_edit_vertices.empty()) {
        std::cout << __FILE__<<":"<<__LINE__
            <<" last_edit_vertices="<<Graph::vector_tostring(last_edit_vertices)
            <<" piOriginal="<<Graph::vector_tostring(piOriginal.annotations)
            <<"\n\tno_forbidden="<<Graph::vector_tostring(pi.no_forbidden)
            <<" infeasible="<<Graph::vector_tostring(pi.infeasible)
            <<" verticesToIteratePairsOn="<<Graph::vector_tostring(verticesToIteratePairsOn)
            <<"\n";
    }*/

    // branch: find branching rules = try pairs of vertices to branch on
    if(!verticesToIteratePairsOn.empty()) {
        // set to true if there is a non-annotated pair
        bool branched = false;

        for(size_t i=0; i<verticesToIteratePairsOn.size(); ++i) {
            for(size_t j=i+1; j<verticesToIteratePairsOn.size(); ++j) {
                auto v = verticesToIteratePairsOn[i];
                auto w = verticesToIteratePairsOn[j];
                if(v > w) {
                    int swap = v;
                    v = w;
                    w = swap;
                }

                if(pi.annotations[v][w] != ANNOTATION_UNDEF) continue;
                branched = true;

                if(debug) {
                    std::cout << stringMultiply("    ", pi.number_fixed) << __FILE__<<":"<<__LINE__
                        <<" current graph="<<G->to_graph6()
                        <<" edits="<<Graph::vector_tostring(pi.number_edits)
                        <<" branching on v="<<Graph::vector_tostring(v)
                        <<" w="<<Graph::vector_tostring(w)
                        <<" verticesToIteratePairsOn="<<Graph::vector_tostring(verticesToIteratePairsOn)
                        <<"\n";
                }

                // permanent
                piType pi1 = pi; // copy
                pi1.annotations[v][w] = ANNOTATION_PERMANENT;
                ++pi1.number_fixed;

                // forbidden
                piType pi2 = pi; // copy
                pi2.annotations[v][w] = ANNOTATION_FORBIDDEN;
                ++pi2.number_fixed;

                std::vector<RuleType> B1 = {};
                std::vector<RuleType> B2 = {};
                if(G->edge_has(v,w)) {
                    // edit graph for pi2
                    ++pi2.number_edits;
                    G->edge_remove(v,w);
                    B2 = br_compute(G, pi2, useForbiddenSubgraphBrCompute, {v,w});
                    G->edge_add(v,w); // undo edit

                    // graph is unchanged for pi1
                    B1 = br_compute(G, pi1, useForbiddenSubgraphBrCompute, {v,w});
                }
                else {
                    // edit graph for pi1
                    ++pi1.number_edits;
                    G->edge_add(v,w);
                    B1 = br_compute(G, pi1, useForbiddenSubgraphBrCompute, {v,w});
                    G->edge_remove(v,w); // undo edit

                    // graph is unchanged for pi2
                    B2 = br_compute(G, pi2, useForbiddenSubgraphBrCompute, {v,w});
                }

                // both branches are infeasible => this branch is infeasible
                if(B1.empty() && B2.empty()) {
                    /*std::cout << "\t" <<__FILE__<<":"<<__LINE__
                        <<" v="<<v
                        <<" w="<<w
                        <<" both branches infeasible for "
                        <<"\n";*/

                    #ifdef DEDUPLICATION_ON
                    // update deduplication map with (pi,output)
                    deduplication_map[hash].push_back({pi, {}});
                    #endif

                    if(debug) {
                        std::cout << stringMultiply("    ", pi.number_fixed) << __FILE__<<":"<<__LINE__
                            <<" current graph="<<G->to_graph6()
                            <<" edits="<<Graph::vector_tostring(pi.number_edits)
                            <<" INFEASIBLE (both children infeasible) "
                            <<"\n";
                    }
                    
                    // undo edits done in br_reduce
                    G_edit_toggle(G, edge_edits);
                    return {}; 
                }
                // one branch is infeasible === "reduction rule" => we do not have to branch on the infeasible branch
                else if(B1.empty() || B2.empty()) {
                    auto& BnonEmpty = B1.empty() ? B2 : B1;
                    br_subsumption_prune(BnonEmpty);
                    for(auto& Bi : BnonEmpty) {
                        B.push_back(Bi);
                    }
                }
                // both branches feasible: concatenate (cross product)
                else {
                    auto Bconcat = br_concatenate(B1, B2);
                    for(auto& Bi : Bconcat) {
                        B.push_back(Bi);
                    }
                }

                // complete: in a forbidden subgraph: fix / edit an edge (lower branches will try other edges)
                // -> deduplication is not needed
                // if(useForbiddenSubgraphBrCompute) break;
            }
            // if(useForbiddenSubgraphBrCompute && branched) break;
        }

        // every pair of the forbidden subgraph was already fixed -> must have been infeasible
        if(!branched) {
            throw std::runtime_error("Fully-fixed forbidden subgraph on graph="+G->to_graph6()+" and vertices="+Graph::vector_tostring(verticesToIteratePairsOn)+" not detected by br_reduce");
        }
    }

    // reduced pi itself is a rule
    if(pi.number_edits > 0) {
        B.push_back({pi});
    }
    // nothing to do: emit an empty rule, so the cross product is the identity
    else if(pi.no_forbidden) {
        B.push_back({});
    }

    // undo edits done in br_reduce
    G_edit_toggle(G, edge_edits);

    // prune B
    br_subsumption_prune(B);

    #ifdef DEDUPLICATION_ON
    // update deduplication map with (pi,output)
    deduplication_map[hash].push_back({pi, B});
    #endif

    return B;
}

void branchingAutomated(int graphsCount, std::string line, bool useForbiddenSubgraphBrCompute) {
    Graph GraphValue = Graph::parse_graph6(line);
    Graph* G = &GraphValue;
    
    // pi: UNDEF for every pair of vertices
    auto pi = piType();
    pi.annotations = std::vector<std::vector<int>>(G->n());
    for(size_t i=0; i<G->n(); ++i) {
        pi.annotations[i] = std::vector<int>(G->n(), ANNOTATION_UNDEF);
    }

    #ifdef DEDUPLICATION_ON
    deduplication_map.clear();
    #endif

    auto B = br_compute(G, pi, useForbiddenSubgraphBrCompute);

    // infeasible: error
    if(B.empty()) {
        throw std::runtime_error("Algorithm returned infeasible for the graph "+line+" - but an infeasible instance does not exist.");
    }
    // trivial instance
    if(B.size()==1 && B[0].empty()) {
        std::cout << __FILE__<<":"<<__LINE__<<" graph "<<graphsCount<<": "<<line
            <<" trvial instance (no forbidden subgraph)"
            <<"\n";
        return;
    }

    auto& A_best = branching_rule_best(B);
    auto br = branching_rule_to_number(A_best);

    branchingNumberWorstCase = std::max(branchingNumberWorstCase, br);

    std::cout << __FILE__<<":"<<__LINE__<<" graph "<<graphsCount<<": "<<line
        <<" br="<<br
        <<" worstCase="<<branchingNumberWorstCase
        <<"\n";
}

int test_branching_rule_to_number() {
    int failures = 0;
    std::vector<std::vector<int>> tests = {
        {1,2},
        {1,3,3},
        {1,2,5},
        {2,2,2},
        {1,2,1,2,5},
    };
    std::vector<double> results = {
        1.618,
        1.696,
        1.71,
        1.732,
        2.75,
    };
    for(size_t t=0; t<tests.size(); ++t) {
        auto& branching_numbers = tests[t];
        auto result = results[t];

        RuleType A = {};

        for(size_t i = 0; i<branching_numbers.size(); ++i) {
            piType pi = piType();
            pi.number_edits = branching_numbers[i];
            A.push_back(pi);
        }
        
        auto br = branching_rule_to_number(A);
        if(std::abs(br-result) > 0.01) {
            ++failures;
            std::cout << "########## Test failed - branching_rule_to_number: "<<ruleTypeToBranchingVector(A)<<" branching number="<<br<<" != "<<result<<" ##########\n";
        } else {
            std::cout << "Test success - branching_rule_to_number: "<<ruleTypeToBranchingVector(A)<<" branching number="<<br<<" ~= "<<result<<"\n";
        }
    }
    return failures;
}

int test() {
    int failures = 0;
    failures += test_branching_rule_to_number();
    return failures;
}

int main(int argc, char* argv[]) {
    // std::ios::sync_with_stdio(false);
    // std::cin.tie(nullptr);
    std::cout << "\n\nbranchingAutomated starting\n";

    /*
    Number of non-isomorphic connected graphs (counted by nauty-geng):
    n=4:              4
    n=5:             21
    n=6:            112
    n=7:            853
    n=8:         11 117
    n=9:        261 080
    n=10:    11 716 571
     */

    int workers = 1;
    long skipUntilNumber = 0;
    bool useForbiddenSubgraphProposition = false;

    // parse options
    for(int i=1; i<argc; ++i) {
        std::string option = argv[i];

        // p: number of processes
        if(option == "-p" && i+1 < argc) {
            workers = std::stoi(argv[++i]);
        }
        // s: $s$-Overlapping Cluster Editing
        else if(option == "-s" && i+1 < argc) {
            s = std::stoi(argv[++i]);
        }
        // k: skip until this graph
        else if(option == "-k" && i+1 < argc) {
            skipUntilNumber = std::stol(argv[++i]);
        }
        // u: use proposition algorithm
        else if(option == "-u") {
            std::cout << "Using proposition algorithm.\n\n";
            useForbiddenSubgraphProposition = true;
        }
        // d: print debug information
        else if(option == "-d") {
            std::cout << "Printing debug information. Recommended to be used only with one single input graph, e.g., echo \"ECZ?\" | ./out/branchingAutomated -p 1 -s 1 -u \n\n";
            debug = true;
        }
        // t: run tests instead
        else if(option == "-t") {
            std::cout << "Starting tests:\n";
            auto failures = test();
            std::cout << "Finished tests with "<<failures<<" failures\n";
            return failures ? 1 : 0;
        }
    }
    if(workers < 1) workers = 1;

    // create pipes
    std::vector<int[2]> pipes(workers);
    for(int i=0;i<workers;i++) {
        if(pipe(pipes[i]) != 0) {
            std::cout << "Could not create pipe\n";
            exit(1);
        }
    }

    // fork workers
    for(int w=0; w<workers; ++w) {
        pid_t pid = fork();

        // child
        if(pid == 0) {
            // close unused pipes
            for(int j = 0; j < workers; ++j) {
                if(j == w) {
                    close(pipes[j][1]); // close write end of own pipe
                } else {
                    // close both ends of pipe not belonging to self
                    close(pipes[j][0]);
                    close(pipes[j][1]);
                }
            }

            FILE* stream = fdopen(pipes[w][0], "r");
            char buffer[4096];

            // run actual program
            while(fgets(buffer, sizeof(buffer), stream)) {
                std::string msg(buffer);
                if(msg.empty()) continue;

                // split at first space
                size_t pos = msg.find(' ');
                if(pos == std::string::npos) continue;

                int graphsCount = std::stoi(msg.substr(0, pos));
                std::string line = msg.substr(pos + 1);

                // remove trailing newline
                if(!line.empty() && line.back() == '\n')
                    line.pop_back();

                branchingAutomated(graphsCount, line, useForbiddenSubgraphProposition);
            }

            std::cout << "worker id="<<w<<" finished: branchingNumberWorstCase="<< branchingNumberWorstCase<<"\n";

            fclose(stream);
            exit(0);
        }

        close(pipes[w][0]); // parent closes read end
    }

    // parent distributes graphs
    std::string line;
    long graphsCount = 0;
    int currentWorker = 0;

    bool skipUntil = skipUntilNumber > 0;
    if(skipUntil) {
        std::cout << "SKIPPING GRAPHS UNTIL graphCount="<<skipUntilNumber<<"\n";
    }

    while (std::getline(std::cin, line)) {
        if(line.empty()) continue;

        ++graphsCount;
        if(skipUntil) {
            if(graphsCount >= skipUntilNumber) skipUntil = false;
            else continue;
        }

        std::string toSend = std::to_string(graphsCount) + " " + line + "\n";

        if( write(
            pipes[currentWorker][1],
            toSend.c_str(),
            toSend.size()
        ) < 0) {
            std::cout << "Failed to write to worker "<<currentWorker<<"\n";
        }

        currentWorker = (currentWorker + 1) % workers;
    }

    // close write pipes
    for(int i=0;i<workers;i++){
        close(pipes[i][1]);
    }

    // wait for workers
    for(int i=0;i<workers;i++){
        wait(nullptr);
    }

    // std::cout << "Intersections min="<<intersectionsFoundMin<<"\n";
    // std::cout << "numberOfCliquesWithCHalf="<<Graph::vector_tostring(numberOfCliquesWithCHalf)<<"\n";
    // std::cout << "numberOfCliquesToSeparatorSize="<<Graph::vector_tostring(numberOfCliquesToSeparatorSize)<<"\n";
    std::cout << "branchingAutomated finished\n";

    return 0;
}
