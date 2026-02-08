/*
Receives strings on std::cin and then prints the unique strings

Usage:
uniqueStrings [-i] [-h] [-q]

-i: immediately print output if available. Otherwise collect and print only at the end. If also using -h then the number of elements is printed last.
-h: print a header with the number of elements
-q: print the outputs in quotes and a comma before the new line.
*/

#include <iostream>
#include <string>
#include <unordered_set>

int main(int argc, char* argv[]) {
    std::string line;
    std::unordered_set<std::string> foundStrings = std::unordered_set<std::string>(100);

    bool printImmediate = false;
    bool printHeader = false;
    bool printWithQuotes = false;
    for(int i=1; i<argc; ++i) {
        std::string option = argv[i];
        if(option == "-i") printImmediate = true;
        if(option == "-h") printHeader = true;
        if(option == "-q") printWithQuotes = true;
    }

    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;

        // already found this string
        if(foundStrings.find(line) != foundStrings.end()) {
            continue;
        }

        foundStrings.insert(line);

        // print immediately
        if(printImmediate) {
            if(printWithQuotes) {
                std::cout << "\"" << line << "\",\n";
            }
            else {
                std::cout << line << "\n";
            }
        }
    }
    
    // print header as number of strings filtered
    if(printHeader) std::cout << foundStrings.size() << "\n";

    // print filtered strings
    if(printWithQuotes) {
        for(auto s : foundStrings) {
            std::cout << "\"" << s << "\",\n";
        }
    }
    else {
        for(auto s : foundStrings) {
            std::cout << s << "\n";
        }
    }

    return 0;
}
