# 11.2.
1. prio = proposal
2. lower bound star nochmal anschauen und schicken -> anschauen
3. lower bounds + upper bounds machen - wäre dann schon ein Package (praxis dinge + theorie dinge), dann eine Basis da für eine Arbeit

- Algorithmus Optionen: werden zuviele kombinationen - also eher begründen warum man einen Ansatz macht

idee: gibts eine above-guarantee parameterisierung (knoten disjunktes packing von verbotenen Teilgraphen mit anzahl $\ell$ - ist $k - \ell$ noch $FPT(k - \ell)$ (z.B. für s=2)?) wahrscheinlich nicht praxis relevant

# 20.2.

## Proposal:
- DONE Anfang: "so the goal is" -> "so the natural way to make a cluster is to make as few edits as possible.."
- DONE Cluster Editing das erste mal: Referenz wo das das erste mal aufgekommen ist - vielleicht correlation clustering paper (nachschauen in Gramm)
    - Dann einfach entscheidungsproblem mit $k$, dann muss man gar nicht über parametreisierte probleme reden
    - da NP schwer muss exp zeit, aber es geht in der zeit, also exponential nur in $k$ - das heißt dann FPT
    - um das zu lösen, verallgemeinerte notion von tractability
- Struktur: Cluster editing NP-schwer, dann versucht parameter zu finden der in der praxis klein ist = anzahl der edits = parameterized problem
- FPT(s,k) nicht gut - besser "is FPT parameterized by the number of edits $k$"

Comma Setzung: The chicago manual of Style

- Referenzen: einheitlich "book title", Journal namen consistent ganz ausschreiben

# 27.2.
Referenzen: Zuthero, DBLP API - lookups

Praxis machen falls ich beim forbidden subgraph size bound stecke - auf eine minimal Variante hinarbeiten:
- upper bound: label propagation
- lower bound: greedy subgraph packing (s=2)
- branching: verbotenen teilgraphen finden mit am wenigsten branches (meiste verbotene)

# 6.3.

Lower bounds zeigen? Strong exponential time hypothesis benutzen? Techniken um das zu benutzen (nicht gerade verfolgen)

- Critical clique lemma machen - vielleicht hilft für kernels?

Richtungen:
- poly kernels? Für 2-overlap? Natürlicher Ansatz: Packing von knotendisjunkten/modifikationsdisjunkten (=jede Knoten drinnen hat degree zu außen Komponenten max 2, andere Seite aber: jeder Knoten außen könnte 3 Kanten nach innen haben weil ja modifikationen drinnen möglich wären = modifikationen überlappen) Teilgraphen $\leq k$. Außerhalb sind s-overlap teil lösungen außerhalb (also jeder Knoten in s cliquen) - insbesondere sehr große Cliquen, Kanten zu den verbotenen. Aufteilen in critical cliques (oder eine Variante - critical bzgl der verbotenen teilgraphen)?
- Große Critical cliques reduzieren?
- vielleicht kein poly kernel? "Cross-composition"

- s^2 verbessern? Lower bound finden wenn $2^{o(k)} \Rightarrow 2^{o(n)}$ basierend auf ETH. Wahrscheinlich reduktion von $SAT \rightarrow CE$ sodass $k = O(n)$ mit $n$ = anzahl variablen. Wahrscheinlich bekannt für Cluster Editing (CE). Paper Komusiewicz, Uhlmann 2013 - wie verallgemeinert zu s-overlap? Oder andere Conjecture benutzen - Set Cover Conjecture?
- Branching Zahl: $s=2$ oder anderes. Lower bound vom exponenten kann Perspektive geben was man bekommen kann.

- nauty: lower bound testen für verbotene Teilgraphen

Parameterized Algorithms book bzgl. ETH, SETH, Cross-composition.

# 13.3.
Besprechen:
- Clique Kernel - kann man cliquen schneller finden?
- Separatoren iteriert für n=6: Für 4 cliquen ist wohl 6 das minimum - Beispiel gefunden EElw (gibt mehrere)

Verbotene Teilgraphen
- Beispiel anschauen: wenn Knoten in fast der Hälfte aller cliquen ist - wenn das ein verbotener Teilgraph ist (konstruiertes Beispiel) dann wäre das eine Untere Schranke

TODO Könnte schon untere Schranke anschauen (Komusiewicz, Uhlmann 2013) - könnte relativ wenig aufwand sein (kurz reinschauen)

TODO Kernel überlegen (Bild vom 6.3.)

Critical cliques:
- Zuerst nur anschauen es gibt nur die 2 cliquen
- dann mit anderen

Original
- $K_2 = K \cap C_2$

Beweis feedback:
- Anderes wort für separator? Weil established name
- Implizit dahinter eine Induktion, aber vielleicht explizit machen
- Prelims: Clique = always induced, and clique is set of vertices
- Lemma umformulieren in mehrere Sätze "Formally, ... holds"
- size vs. order: 
- Section X großgeschrieben
- $Y_i$ implizit defniiert- vieleicht set von $\mathcal Y$ wo $Y$ drin ist
- Laufzeit hängt von repräsentation ab - in prelims definieren adjazenz listen
- $N(x)$ - Laufzeit hängt von Kanten anzahl ab? Sonst $C_{max}$ ??
- any two separating vertices "for every pair"
- prelims von Summen - dazwischen
- braucht nicht alle Equations


- Grammar old version: gibt gratis online

# 20.3.
Besprechen
- Konstruiertes Beispiel wo jeder Knoten in $c/2$ Cliquen ist scheint nicht quadratisch zu skalieren
- Kernel: braucht aber bound für Größe wo $s$-overlap property ok ist oder?
- "clique separator" / distinctors / distinguishers / (splitter / divider) / classificator / witness / (segregators) / discerners
- **"witness pair"**

TODO:
- zuerst Kommentare einbauen


Forbidden subgraphs:
- idee: für forbidden subgraph size: Fälle die in meinem Proof schlecht sind anschauen auf echten Beispielen
- property von minimal forbidden subgraphs: jeder Knoten $v$ ist entweder nur in einer clique und die clique hat nur den einen Knoten, oder der Knoten hat einen nicht-nachbarn $w$, der zu allen anderen Knoten benachbart ist in der Clique von $v$ (alle cliquen wo $v$ drinnen ist)
- Intersection class haben größe maximal 1 (siehe Bild)
- worst case konstruktion machen
- SAT Formulierung: kann man vielleicht größere Graphen lösen - also die Lösung ist ein minimaler verbotener Teilgraph. Formel für Größe, cliquen
    - Knoten variablen, welcher Knoten ist in welcher Clique, Kanten, Graph minimal - für jeden Knoten einzelne Clique oder es gibt eine Clique wo der drin ist dass wenn ich ihn rausnehme dass die Clique nicht maximal ist (enthalten in einer anderen maximalen clique)
- oder ILP?
- wenige clique, viele Knoten, trotzdem minimal

- Sei $G$ ein Graph mit $s+1$ maximalen cliquen mit der $s$-overlap property (jeder Knoten ist in nur $s$ Cliquen und nicht mehr), und $G$ ist minimal bzgl. dieser Eigenschaft. Was ist die kleinste obere Schranke für die Anzahl der Knoten von $G$.

Kernel:
- Erstmal cliquen ohne overlap draußen: dann size mit beobachtungen bounden

Critical Clique:
- Am Besten Tabelle für die unterschiedlichen Edit kosten (siehe Bild)
- Systematisch machen würde helfen, weil das immer relativ unübersichtlich ist - Tabelle?

# 27.3.
Besprechen:
- einfache "minimale separator property" reicht nicht (see example)
- clique separators do not preserve cliques (see example)
- wollte die "minimale separator property" auf graphen testen (gibt keinen minimalen mit separator property der 7 Knoten hat) - aber reicht es da nicht eigentlich auch mein brute force separator ding zu machen (=test ob minimal)? Weil dann würde es ja bei 4 cliquen reichen mit 7 Knoten statt mit 12. Und mit 5 cliquen mit 9 Knoten (was beides ja sehr schnell geht). Also wenn das gehen würde (habe schon laufen lassen) dann: "clique:separator bound" wäre {2:2, 3:4, 4:6, 5:8} und "s:forbidden subgraph bound" wäre {1:3, 2:5, 3:7, 4:9}
- Komusiewicz paper https://www.sciencedirect.com/science/article/pii/S0166218X12002259 ?

Besprechen Proof:
- immer "i.e.," => "that is," ?
- "only if $c \geq 3$ denke ich muss nicht sein - denke reicht schon $c\geq 2$
- "witness" ist komisch weil "we need at most X clique witnesses" statt "we need at most X vertices to separate the cliques".
  - gehts da darum wenn man nach dem paper sucht? Oder wenn man es ohne Kontext liest?
  - Kann man da sich einfach ein neues Wort überlegen? "ceparator" / "c-separator" / "clique-separator" / "cleparator"
- **distinguisher**

- Induktion: Behauptung als Summe hinschreiben geht auch - dann leichter zu verstehen
- Argument "alle Vorraussetzungen gelten noch" - bisl schwamming "wir machen das für die letzte Clique und dann funkt es für die kleineren"


Ideen:
- Zuerst verbotene Teilgraphen, nicht verbotene induzierte - dann "weiß man von allen Cliquen" und das sollte leichter sein
- Beispiel mit "Cliquen bleiben nicht erhalten" - da werden die Cliquen nicht mehr maximal durch Kanten die von anderen (nicht betrachteten) Cliquen kommen - da vielleicht was weiter überlegen?
- "subgraph order" = partielle Ordnung - Graph ist kleiner wenn subgraph
- "cliquen separator <-> add Knoten in allen cliquen = verbotener Teilgraph" habe ich implizit angenommen - müsste man zeigen noch
- Monotonizität bräuchte man - entweder Obere Schranke, oder zeigen dass wenn es einen großen verbotenen Teilgraphen gibt
  - **Obere Schranke habe ich schon gezeigt mit den 4 cliquen dass die max 8 Knoten brauchen** - weil angenommen es gäbe einen Graphen mit 100 Knoten der 8 Knoten braucht. Der 8 Knoten Graph hat 4 cliquen - also kann
  - vielleicht Induktiven beweis für die Lineare Größe
- Sichtweise Separatoren:
  - 4 cliquen: gibt 6 paare - könnte trotzdem quadratisch sein. Aber man braucht trivialerweise 2 Knoten pro Paar
  - 5 cliquen: gibt 10 Paare - 8 Knoten scheint interessanter?
  - Eine Cliquen: für jede Clique $C_i$, für jede andere Clique $C_j$ brauche ich einen Knoten in meiner Clique, der witness ist dass $C_i$ nicht in der anderen enthalten ist
  - 


