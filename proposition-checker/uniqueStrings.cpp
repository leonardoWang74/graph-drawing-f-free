/*
Receives strings on std::cin and then prints the unique strings

Usage:
uniqueStrings [-s] [-q]

-s: use if the input is guaranteed to be only short strings - the strings will not be hashed which can be faster. Otherwise, the strings are hashed.
-q: print the outputs in quotes and a comma before the new line.
*/

#include <iostream>
#include <string>
#include <unordered_set>

int main(int argc, char* argv[]) {
    std::string line;

    // set of strings found
    std::unordered_set<std::string> foundStrings = std::unordered_set<std::string>(100);
    // set of hashes found
    std::unordered_set<size_t> foundHashes = std::unordered_set<size_t>(100);

    // hasher in case the input is long strings
    std::hash<std::string> hasher;

    // parse options
    bool printWithQuotes = false;
    bool shortStrings = false;
    for(int i=1; i<argc; ++i) {
        std::string option = argv[i];
        if(option == "-q") printWithQuotes = true;
        if(option == "-s") shortStrings = true;
    }

    // read inputs and print
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;

        // check if we already found this string
        if(shortStrings) {
            // check and save the string itself
            if(foundStrings.find(line) != foundStrings.end()) {
                continue;
            }
            foundStrings.insert(line);
        } else {
            // check a hash
            auto hash = hasher(line);
            if(foundHashes.find(hash) != foundHashes.end()) {
                continue;
            }
            foundHashes.insert(hash);
        }

        // print immediately
        if(printWithQuotes) {
            std::cout << "\"" << line << "\",\n";
        }
        else {
            std::cout << line << "\n";
        }
    }

    return 0;
}
