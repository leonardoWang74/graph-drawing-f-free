.PHONY: test, checker

CXX = g++
CXXFLAGS = -O3 -std=c++17 -Wall -Wextra

all: checker

out-directory:
	-mkdir out

Graph.o: Graph.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c Graph.cpp

# checker script
checker.o: checker.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c checker.cpp

checker-compile: checker.o Graph.o out-directory
	$(CXX) $(CXXFLAGS) checker.o Graph.o -o out/checker

# ran with 8: no graph where proposition algorithm finds a worse solution
# ran with 9: no graph where proposition algorithm finds a worse solution (checked 261080 connected graphs)
# ran with 10: ? / 11 716 571
# ran with 11: 
# ran with 12: 1500

checker: checker-compile
	nauty-geng -c 10 | ./out/checker


# test script
test.o: test.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c test.cpp

test-compile: test.o Graph.o out-directory
	$(CXX) $(CXXFLAGS) test.o Graph.o -o out/test

test: test-compile
	./out/test



clean:
	rm -rf out
	rm -f *.o
